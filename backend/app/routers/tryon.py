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

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
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


# ── Local Storage setup ───────────────────────────────────────────────────
# We use the data/tryon folder inside the backend directory.
BASE_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "tryon")
PHOTOS_DIR = os.path.join(BASE_DATA_DIR, "photos")
OUTPUTS_DIR = os.path.join(BASE_DATA_DIR, "outputs")

os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)

def _save_local_file(directory: str, data: bytes, ext: str = "jpg") -> str:
    """Save raw bytes to a local file, return the filename."""
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(data)
    return filename

def _get_local_url(directory_name: str, filename: str) -> str:
    """Return the URL to access the local file via our API."""
    # directory_name should be "photos" or "outputs"
    return f"/api/tryon/media/{directory_name}/{filename}"


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
    filename = _save_local_file(PHOTOS_DIR, raw, ext)
    url = _get_local_url("photos", filename)

    # First photo → default
    existing_count = db.query(UserBodyPhoto).filter(UserBodyPhoto.user_id == user_id).count()
    is_default = existing_count == 0

    photo = UserBodyPhoto(
        user_id=user_id,
        image_key=filename,
        is_default=is_default,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return {
        "id": photo.id,
        "image_key": filename,
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
        out.image_url = _get_local_url("photos", p.image_key)
        result.append(out)
    return result


@router.post("/generate")
def generate_tryon(payload: TryOnGenerateRequest, db: Session = Depends(get_db)):
    """
    Generate a virtual try-on image.

    1. Looks up the user's body photo and the product garment image.
    2. Checks the cache — returns instantly on a hit.
    3. On cache miss, calls the Hugging Face IDM-VTON Space via Gradio,
       uploads the result to S3, and caches it.
    """
    # ── Validate inputs ──
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    body_photo = db.query(UserBodyPhoto).filter(UserBodyPhoto.id == payload.body_photo_id).first()
    if not body_photo or body_photo.user_id != payload.user_id:
        raise HTTPException(status_code=404, detail="Body photo not found")

    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.image_url:
        raise HTTPException(status_code=400, detail="Product has no image to try on")

    # ── Check cache ──
    cached = (
        db.query(TryOnCache)
        .filter(
            TryOnCache.user_id == payload.user_id,
            TryOnCache.product_id == payload.product_id,
            TryOnCache.body_photo_key == body_photo.image_key,
        )
        .first()
    )
    if cached:
        return {
            "tryon_url": _get_local_url("outputs", cached.tryon_result_key),
            "cached": True,
            "product_name": product.name,
        }

    # ── Call Hugging Face Space ──
    body_local_path = os.path.join(PHOTOS_DIR, body_photo.image_key)
    garment_url = product.image_url

    try:
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

    except Exception as e:
        logger.error(f"VTON generation failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Virtual try-on generation failed. The Hugging Face Space may be busy or sleeping. Please try again in a moment. Error: {str(e)[:200]}",
        )

    # ── Upload result locally and cache ──
    result_filename = _save_local_file(OUTPUTS_DIR, output_bytes, "png")
    result_url = _get_local_url("outputs", result_filename)

    cache_entry = TryOnCache(
        user_id=payload.user_id,
        product_id=payload.product_id,
        body_photo_key=body_photo.image_key, # we now store local filename
        tryon_result_key=result_filename,
    )
    db.add(cache_entry)
    db.commit()

    return {
        "tryon_url": result_url,
        "cached": False,
        "product_name": product.name,
    }


from fastapi.responses import FileResponse

@router.get("/media/{directory}/{filename}")
def get_tryon_media(directory: str, filename: str):
    """Serve locally saved body photos and try-on results."""
    if directory not in ["photos", "outputs"]:
        raise HTTPException(status_code=400, detail="Invalid directory")
    
    target_dir = PHOTOS_DIR if directory == "photos" else OUTPUTS_DIR
    filepath = os.path.join(target_dir, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(filepath)
