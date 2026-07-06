"""
Virtual Try-On router — async job pattern.

Flow:
  1. POST /tryon/generate  → starts background job, returns job_id immediately (fast)
  2. GET  /tryon/job/{id}  → frontend polls this; returns status + result URL when done

This avoids Cloudflare's 30-second proxy timeout because the initial POST returns
instantly and the long-running HF inference happens in a background thread.
"""

import os
import uuid
import logging
import tempfile
import urllib.request
import threading
from typing import Optional
from enum import Enum

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv()

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserBodyPhoto, TryOnCache, Product, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tryon", tags=["virtual-try-on"])

# ── In-memory job store ─────────────────────────────────────────────────
# { job_id: { "status": "pending"|"done"|"error", "result": ..., "error": ... } }
_jobs: dict = {}
_jobs_lock = threading.Lock()

class JobStatus(str, Enum):
    PENDING = "pending"
    DONE    = "done"
    ERROR   = "error"

def _set_job(job_id: str, status: JobStatus, result: dict = None, error: str = None):
    with _jobs_lock:
        _jobs[job_id] = {"status": status, "result": result, "error": error}

def _get_job(job_id: str):
    with _jobs_lock:
        return _jobs.get(job_id)


# ── Configurable HF Space ───────────────────────────────────────────────
HF_SPACE_ID = os.getenv("VTON_HF_SPACE", "yisol/IDM-VTON")
_gradio_client = None

def _get_gradio_client():
    global _gradio_client
    if _gradio_client is None:
        from gradio_client import Client
        _gradio_client = Client(HF_SPACE_ID)
    return _gradio_client


# ── S3 helpers ─────────────────────────────────────────────────────────
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


# ── Garment category detection ──────────────────────────────────────────
_LOWER_BODY_KEYWORDS = {
    "pant", "pants", "trouser", "trousers", "jeans", "denim",
    "shorts", "leggings", "skirt", "chinos", "jogger", "joggers",
    "cargo", "capri", "palazzos", "palazzo", "culottes", "sweatpants",
    "track pants", "trackpants", "bottoms", "lower",
}
_FULL_BODY_KEYWORDS = {
    "dress", "jumpsuit", "romper", "dungaree", "dungarees",
    "overalls", "gown", "saree", "kurta", "kurti",
}

def _build_garment_desc(product_name: str, product_category: str, base_desc: str) -> str:
    """
    Prepend the correct IDM-VTON placement hint so the model knows
    WHERE on the body to place the garment (upper / lower / full).
    """
    combined = f"{product_name} {product_category} {base_desc}".lower()

    if any(kw in combined for kw in _FULL_BODY_KEYWORDS):
        placement = "a full body garment, dress or jumpsuit worn from shoulders to feet"
    elif any(kw in combined for kw in _LOWER_BODY_KEYWORDS):
        placement = "a lower body garment, pants or trousers worn on the legs and waist"
    else:
        # Default: upper body
        placement = "an upper body garment, shirt or top worn on the torso"

    # Build the final description that IDM-VTON will use for guidance
    return f"{placement}. {base_desc or product_name}"


# ── Pydantic schemas ────────────────────────────────────────────────────
class BodyPhotoOut(BaseModel):
    id: int
    user_id: int
    image_key: str
    image_url: str = ""
    is_default: bool = False
    model_config = {"from_attributes": True}


# ── Background worker ───────────────────────────────────────────────────
def _run_vton_job(
    job_id: str,
    body_bytes: bytes,
    body_ext: str,
    garment_url: str,
    garment_desc: str,
    is_temporary: bool,
    cache_key: Optional[str],
    user_id: int,
    product_id: int,
    product_name: str,
    # Pass db values needed for caching (not the session itself — sessions aren't thread-safe)
    db_url: str,
):
    temp_path = None
    try:
        # Write body photo to a temp file
        import tempfile, os
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{body_ext}") as tf:
            tf.write(body_bytes)
            temp_path = tf.name

        gradio = _get_gradio_client()
        from gradio_client import handle_file

        result = gradio.predict(
            dict={"background": handle_file(temp_path), "layers": [], "composite": None},
            garm_img=handle_file(garment_url),
            garment_des=garment_desc,
            is_checked=True,
            is_checked_crop=False,
            denoise_steps=30,
            seed=42,
            api_name="/tryon",
        )
        logger.info(f"[Job {job_id}] Gradio raw result: {result}")

        # Extract output path
        if isinstance(result, (list, tuple)) and len(result) > 0:
            output_path = result[0]
        else:
            output_path = result
        if isinstance(output_path, dict):
            output_path = output_path.get("value", output_path.get("url", ""))

        # Read generated image
        if output_path and os.path.exists(str(output_path)):
            with open(output_path, "rb") as f:
                output_bytes = f.read()
        elif output_path and str(output_path).startswith("http"):
            req = urllib.request.Request(str(output_path))
            with urllib.request.urlopen(req) as resp:
                output_bytes = resp.read()
        else:
            raise ValueError(f"Unexpected VTON output: {output_path}")

        # Resize to original body photo dimensions
        from PIL import Image
        import io
        with Image.open(temp_path) as orig:
            orig_size = orig.size
        with Image.open(io.BytesIO(output_bytes)) as gen:
            resized = gen.resize(orig_size, Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            resized.save(buf, format="PNG")
            output_bytes = buf.getvalue()

        if is_temporary:
            import base64
            b64 = base64.b64encode(output_bytes).decode("utf-8")
            _set_job(job_id, JobStatus.DONE, result={
                "tryon_url": f"data:image/png;base64,{b64}",
                "cached": False,
                "product_name": product_name,
            })
            return

        # Upload result to S3
        result_key = f"tryon/outputs/{uuid.uuid4()}.png"
        _upload_to_s3(output_bytes, result_key, "image/png")
        result_url = _get_s3_presigned_url(result_key)

        # Cache in DB using a fresh session
        if cache_key:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker
            _engine = create_engine(db_url)
            _Session = sessionmaker(bind=_engine)
            _db = _Session()
            try:
                from app.models import TryOnCache
                cache_entry = TryOnCache(
                    user_id=user_id,
                    product_id=product_id,
                    body_photo_key=cache_key,
                    tryon_result_key=result_key,
                )
                _db.add(cache_entry)
                _db.commit()
            except Exception as cache_err:
                logger.warning(f"[Job {job_id}] Cache write failed (non-fatal): {cache_err}")
            finally:
                _db.close()
            _engine.dispose()

        _set_job(job_id, JobStatus.DONE, result={
            "tryon_url": result_url,
            "cached": False,
            "product_name": product_name,
        })

    except Exception as e:
        logger.error(f"[Job {job_id}] VTON failed: {e}")
        _set_job(job_id, JobStatus.ERROR, error=str(e)[:300])
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


# ── Endpoints ───────────────────────────────────────────────────────────

@router.post("/upload-photo")
async def upload_body_photo(
    user_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a body/selfie photo for virtual try-on."""
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
        raise HTTPException(status_code=500, detail=f"Failed to upload to S3: {str(e)}")

    url = _get_s3_presigned_url(key)

    existing_count = db.query(UserBodyPhoto).filter(UserBodyPhoto.user_id == user_id).count()
    photo = UserBodyPhoto(user_id=user_id, image_key=key, is_default=(existing_count == 0))
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return {"id": photo.id, "image_key": key, "image_url": url, "is_default": photo.is_default}


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
    db: Session = Depends(get_db),
):
    """
    Start a virtual try-on job.
    Returns a job_id immediately — poll GET /tryon/job/{job_id} for the result.
    This avoids Cloudflare's 30s proxy timeout.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.image_url:
        raise HTTPException(status_code=400, detail="Product has no image")

    if not body_photo_id and not file:
        raise HTTPException(status_code=400, detail="Must provide body_photo_id or file")

    is_temporary = False
    cache_key = None
    body_bytes = b""
    body_ext = "jpg"

    if body_photo_id:
        body_photo = db.query(UserBodyPhoto).filter(UserBodyPhoto.id == body_photo_id).first()
        if not body_photo or body_photo.user_id != user_id:
            raise HTTPException(status_code=404, detail="Body photo not found")
        cache_key = body_photo.image_key

        # Check cache — return instantly if hit
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
            job_id = str(uuid.uuid4())
            _set_job(job_id, JobStatus.DONE, result={
                "tryon_url": _get_s3_presigned_url(cached.tryon_result_key),
                "cached": True,
                "product_name": product.name,
            })
            return {"job_id": job_id, "status": "done"}

        # Download body photo from S3 into memory
        s3 = _get_s3_client()
        bucket = os.getenv("AWS_S3_BUCKET_NAME")
        import io as _io
        buf = _io.BytesIO()
        s3.download_fileobj(bucket, cache_key, buf)
        body_bytes = buf.getvalue()
        body_ext = cache_key.rsplit(".", 1)[-1] if "." in cache_key else "jpg"
    else:
        is_temporary = True
        body_bytes = await file.read()
        body_ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"

    # Get DB URL for the background thread's own session
    from app.database import engine as _engine
    db_url = str(_engine.url)

    job_id = str(uuid.uuid4())
    _set_job(job_id, JobStatus.PENDING)

    garment_desc = _build_garment_desc(
        product.name,
        product.category or "",
        product.description or "",
    )
    logger.info(f"[Job {job_id}] Garment desc: {garment_desc[:120]}")

    # Fire and forget in background thread
    t = threading.Thread(
        target=_run_vton_job,
        args=(
            job_id, body_bytes, body_ext,
            product.image_url,
            garment_desc,
            is_temporary, cache_key,
            user_id, product_id, product.name,
            db_url,
        ),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id, "status": "pending"}


@router.get("/job/{job_id}")
def get_job_status(job_id: str):
    """
    Poll for the status of a virtual try-on job.
    Returns: { status: 'pending'|'done'|'error', result: {...} | null, error: str | null }
    """
    job = _get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
