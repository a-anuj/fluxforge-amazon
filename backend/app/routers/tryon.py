"""
Virtual Try-On router.

Uses a free Hugging Face Space (IDM-VTON) via the Gradio client to generate
try-on images.  Body photos are persisted to S3 and results are cached so
repeat requests are instant.
"""

import os
import uuid
import logging
import tempfile
import urllib.request
from typing import Optional

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv() # Fallback to cwd


import boto3
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserBodyPhoto, TryOnCache, Product, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tryon", tags=["virtual-try-on"])

# ── Configurable HF Space ───────────────────────────────────────────────
HF_SPACE_ID = os.getenv("VTON_HF_SPACE", "yisol/IDM-VTON")

# Lazy-initialised Gradio client (created on first generate call)
_gradio_client = None


def _get_gradio_client():
    global _gradio_client
    if _gradio_client is None:
        from gradio_client import Client
        _gradio_client = Client(HF_SPACE_ID)
    return _gradio_client


# ── S3 Storage setup ───────────────────────────────────────────────────
def _get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )

def _upload_to_s3(data: bytes, key: str, content_type: str = "image/jpeg") -> str:
    bucket = os.getenv("AWS_S3_BUCKET_NAME")
    if not bucket:
        raise ValueError("AWS_S3_BUCKET_NAME not set")
    s3 = _get_s3_client()
    s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    return key

def _get_s3_presigned_url(key: str, expires_in: int = 3600) -> str:
    bucket = os.getenv("AWS_S3_BUCKET_NAME")
    if not bucket:
        return ""
    s3 = _get_s3_client()
    try:
        return s3.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_in
        )
    except Exception as e:
        logger.error(f"Failed to generate presigned URL: {e}")
        return ""

# ── Pydantic request/response schemas ───────────────────────────────────
class TryOnGenerateRequest(BaseModel):
    user_id: int
    product_id: int
    body_photo_id: int


class BodyPhotoOut(BaseModel):
    id: int
    user_id: int
    image_key: str
    image_url: str = ""      # presigned URL, filled at runtime
    is_default: bool = False

    model_config = {"from_attributes": True}


# ── Endpoints ───────────────────────────────────────────────────────────

@router.post("/upload-photo")
async def upload_body_photo(
    user_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a body / selfie photo for virtual try-on."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    content_type = file.content_type or "image/jpeg"
    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    key = f"users/{user_id}/body-photos/{uuid.uuid4()}.{ext}"
    try:
        _upload_to_s3(raw, key, content_type)
    except Exception as e:
        logger.error(f"S3 Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload to S3. Check AWS permissions. Error: {str(e)}")
        
    url = _get_s3_presigned_url(key)

    # First photo → default
    existing_count = db.query(UserBodyPhoto).filter(UserBodyPhoto.user_id == user_id).count()
    is_default = existing_count == 0

    photo = UserBodyPhoto(
        user_id=user_id,
        image_key=key,
        is_default=is_default,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return {
        "id": photo.id,
        "image_key": key,
        "image_url": url,
        "is_default": photo.is_default,
    }


@router.get("/photos", response_model=list[BodyPhotoOut])
def list_body_photos(user_id: int = Query(...), db: Session = Depends(get_db)):
    """List all body photos for a user."""
    photos = (
        db.query(UserBodyPhoto)
        .filter(UserBodyPhoto.user_id == user_id)
        .order_by(UserBodyPhoto.created_at.desc())
        .all()
    )
    result = []
    for p in photos:
        out = BodyPhotoOut.model_validate(p)
        out.image_url = _get_s3_presigned_url(p.image_key)
        result.append(out)
    return result


@router.post("/generate")
async def generate_tryon(
    user_id: int = Form(...),
    product_id: int = Form(...),
    body_photo_id: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Generate a virtual try-on image.
    """
    # ── Validate inputs ──
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.image_url:
        raise HTTPException(status_code=400, detail="Product has no image to try on")

    if not body_photo_id and not file:
        raise HTTPException(status_code=400, detail="Must provide either body_photo_id or a file")

    temp_file = None
    body_local_path = ""
    is_temporary = False
    cache_key = None
    
    try:
        if body_photo_id:
            body_photo = db.query(UserBodyPhoto).filter(UserBodyPhoto.id == body_photo_id).first()
            if not body_photo or body_photo.user_id != user_id:
                raise HTTPException(status_code=404, detail="Body photo not found")
            cache_key = body_photo.image_key
            
            # ── Check cache ──
            cached = (
                db.query(TryOnCache)
                .filter(
                    TryOnCache.user_id == user_id,
                    TryOnCache.product_id == product_id,
                    TryOnCache.body_photo_key == cache_key,
                )
                .first()
            )
            if cached:
                return {
                    "tryon_url": _get_s3_presigned_url(cached.tryon_result_key),
                    "cached": True,
                    "product_name": product.name,
                }

            # Download from S3 to temp file for Gradio
            s3 = _get_s3_client()
            bucket = os.getenv("AWS_S3_BUCKET_NAME")
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
            body_local_path = temp_file.name
            temp_file.close()
            s3.download_file(bucket, cache_key, body_local_path)
            
        else:
            is_temporary = True
            raw = await file.read()
            ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
            body_local_path = temp_file.name
            with open(body_local_path, "wb") as f:
                f.write(raw)
            temp_file.close()

        # ── Call Hugging Face Space ──
        garment_url = product.image_url

        gradio = _get_gradio_client()
        from gradio_client import handle_file

        # Pass local file path to handle_file; gradio_client automatically uploads it
        result = gradio.predict(
            dict={"background": handle_file(body_local_path), "layers": [], "composite": None},
            garm_img=handle_file(garment_url),
            garment_des=product.description or product.name,
            is_checked=True,
            is_checked_crop=False,
            denoise_steps=30,
            seed=42,
            api_name="/tryon",
        )

        # Log raw result for debugging
        logger.info(f"Gradio raw result: {result}")
        
        # Safely extract output path
        if isinstance(result, (list, tuple)):
            if len(result) > 0:
                output_path = result[0]
            else:
                raise ValueError(f"Hugging Face API returned an empty result: {result}")
        else:
            output_path = result
            
        if isinstance(output_path, dict):
            output_path = output_path.get("value", output_path.get("url", ""))

        # Read the generated image
        if output_path and os.path.exists(str(output_path)):
            with open(output_path, "rb") as f:
                output_bytes = f.read()
        elif output_path and str(output_path).startswith("http"):
            # Download from URL
            req = urllib.request.Request(str(output_path))
            with urllib.request.urlopen(req) as resp:
                output_bytes = resp.read()
        else:
            raise ValueError(f"Unexpected VTON output format: {output_path}")

        # Resize output image to match original body photo
        from PIL import Image
        import io
        
        with Image.open(body_local_path) as orig_img:
            orig_size = orig_img.size
            
        with Image.open(io.BytesIO(output_bytes)) as gen_img:
            resized_img = gen_img.resize(orig_size, Image.Resampling.LANCZOS)
            out_buffer = io.BytesIO()
            resized_img.save(out_buffer, format="PNG")
            output_bytes = out_buffer.getvalue()

        if is_temporary:
            import base64
            b64 = base64.b64encode(output_bytes).decode("utf-8")
            result_url = f"data:image/png;base64,{b64}"
            return {
                "tryon_url": result_url,
                "cached": False,
                "product_name": product.name,
            }

        # ── Upload result to S3 and cache ──
        result_key = f"tryon/outputs/{uuid.uuid4()}.png"
        _upload_to_s3(output_bytes, result_key, "image/png")

        cache_entry = TryOnCache(
            user_id=user_id,
            product_id=product_id,
            body_photo_key=cache_key,
            tryon_result_key=result_key,
        )
        db.add(cache_entry)
        db.commit()

        return {
            "tryon_url": _get_s3_presigned_url(result_key),
            "cached": False,
            "product_name": product.name,
        }

    except Exception as e:
        logger.error(f"VTON generation failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Virtual try-on generation failed. The Hugging Face Space may be busy or sleeping. Please try again in a moment. Error: {str(e)[:200]}",
        )
        
    finally:
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.remove(temp_file.name)
            except:
                pass
