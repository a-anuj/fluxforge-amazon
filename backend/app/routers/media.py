"""
Media upload validation endpoints.

Provides guardrail checks for images/videos before sending to AI models.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services.media_validator import (
    validate_image,
    validate_video,
    get_upload_guidelines,
    MAX_IMAGE_FILE_SIZE,
    MAX_VIDEO_FILE_SIZE,
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
)

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/guidelines")
def upload_guidelines():
    """Return upload guidelines for images and videos."""
    return get_upload_guidelines()


@router.post("/validate/image")
async def validate_image_upload(file: UploadFile = File(...)):
    """
    Validate an uploaded image for quality before AI analysis.

    Returns pass/fail status with specific issues and suggestions.
    If validation passes, the image is ready for Bedrock analysis.
    """
    # Quick content-type check
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not an image. Please upload a JPEG, PNG, or WebP image.",
        )

    # Read file bytes
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > MAX_IMAGE_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_IMAGE_FILE_SIZE // (1024*1024)} MB.",
        )

    # Run validation
    result = validate_image(file_bytes, filename=file.filename or "image.jpg")

    return result.to_dict()


@router.post("/validate/video")
async def validate_video_upload(file: UploadFile = File(...)):
    """
    Validate an uploaded video for quality before AI analysis.

    Returns pass/fail status with specific issues and suggestions.
    If validation passes, the video is ready for Bedrock frame extraction + analysis.
    """
    # Quick content-type check
    if file.content_type and not file.content_type.startswith("video/"):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a video. Please upload an MP4, MOV, or WebM video.",
        )

    # Read file bytes
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > MAX_VIDEO_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_VIDEO_FILE_SIZE // (1024*1024)} MB.",
        )

    # Run validation
    result = validate_video(file_bytes, filename=file.filename or "video.mp4")

    return result.to_dict()


@router.post("/validate/batch")
async def validate_batch_upload(files: list[UploadFile] = File(...)):
    """
    Validate multiple uploaded files (images and/or videos).

    Returns validation results for each file.
    All files must pass for the batch to be considered valid.
    """
    if len(files) > 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum 5 files per upload. Please reduce the number of files.",
        )

    results = []
    all_passed = True

    for file in files:
        file_bytes = await file.read()
        filename = file.filename or "unknown"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if f".{ext}" in ALLOWED_IMAGE_EXTENSIONS or (
            file.content_type and file.content_type.startswith("image/")
        ):
            result = validate_image(file_bytes, filename=filename)
        elif f".{ext}" in ALLOWED_VIDEO_EXTENSIONS or (
            file.content_type and file.content_type.startswith("video/")
        ):
            result = validate_video(file_bytes, filename=filename)
        else:
            from app.services.media_validator import ValidationResult, ValidationStatus, ValidationIssue
            result = ValidationResult(
                status=ValidationStatus.FAILED,
                issues=[ValidationIssue(
                    code="unsupported_format",
                    message=f"Unsupported file type: {filename}",
                    suggestion="Upload JPEG, PNG, WebP images or MP4, MOV, WebM videos.",
                )],
            )

        if not result.passed:
            all_passed = False

        results.append({
            "filename": filename,
            **result.to_dict(),
        })

    return {
        "all_passed": all_passed,
        "total_files": len(files),
        "results": results,
    }
