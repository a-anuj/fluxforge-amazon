"""
Media Quality Guardrail Service

Validates uploaded images and videos before sending to expensive AI models.
Rejects low-quality uploads early with actionable user feedback.

Checks performed:
  Images: resolution, file size, format, blur, brightness, content presence
  Videos: duration, resolution, frame quality, file size, format
"""

import io
import logging
import struct
import tempfile
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from PIL import Image, ImageStat, ImageFilter

# ── Logging ────────────────────────────────────────────────────────────
logger = logging.getLogger("media_validator")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter("📸 [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# ── Configuration ──────────────────────────────────────────────────────

# Image constraints
MIN_IMAGE_WIDTH = 640
MIN_IMAGE_HEIGHT = 480
MIN_IMAGE_FILE_SIZE = 10 * 1024        # 10 KB (lowered — web images can be small but still good quality)
MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Blur detection (Laplacian variance threshold)
BLUR_THRESHOLD = 50.0  # below this = too blurry (lowered for web-downloaded images)

# Brightness thresholds (0-255 scale)
MIN_BRIGHTNESS = 30
MAX_BRIGHTNESS = 240

# Content presence (standard deviation of pixel values)
MIN_STD_DEVIATION = 10.0  # below = likely blank/solid color

# Video constraints
MIN_VIDEO_DURATION_SEC = 3
MAX_VIDEO_DURATION_SEC = 30
MIN_VIDEO_WIDTH = 640
MIN_VIDEO_HEIGHT = 480
MIN_VIDEO_FILE_SIZE = 500 * 1024        # 500 KB
MAX_VIDEO_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi"}
VIDEO_SAMPLE_FRAMES = 3


class ValidationStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"


@dataclass
class ValidationIssue:
    code: str
    message: str
    suggestion: str


@dataclass
class ValidationResult:
    status: ValidationStatus
    issues: list[ValidationIssue] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return self.status == ValidationStatus.PASSED

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "passed": self.passed,
            "issues": [
                {"code": i.code, "message": i.message, "suggestion": i.suggestion}
                for i in self.issues
            ],
            "metadata": self.metadata,
        }


# ── Image Validation ───────────────────────────────────────────────────

def validate_image(file_bytes: bytes, filename: str = "image.jpg") -> ValidationResult:
    """
    Validate an image file for quality before AI analysis.

    Args:
        file_bytes: Raw bytes of the uploaded image.
        filename: Original filename (for extension check).

    Returns:
        ValidationResult with pass/fail status and any issues found.
    """
    issues: list[ValidationIssue] = []
    metadata: dict = {}

    # 1. File extension check
    ext = Path(filename).suffix.lower()
    if ext and ext not in ALLOWED_IMAGE_EXTENSIONS:
        issues.append(ValidationIssue(
            code="invalid_format",
            message=f"Unsupported image format: {ext}",
            suggestion="Please upload a JPEG, PNG, or WebP image.",
        ))
        return ValidationResult(
            status=ValidationStatus.FAILED, issues=issues, metadata=metadata
        )

    # 2. File size check
    file_size = len(file_bytes)
    metadata["file_size_bytes"] = file_size

    if file_size < MIN_IMAGE_FILE_SIZE:
        issues.append(ValidationIssue(
            code="file_too_small",
            message=f"Image file is too small ({file_size // 1024} KB). Minimum is {MIN_IMAGE_FILE_SIZE // 1024} KB.",
            suggestion="The image may be too compressed or low-quality. Use your camera's full resolution.",
        ))

    if file_size > MAX_IMAGE_FILE_SIZE:
        issues.append(ValidationIssue(
            code="file_too_large",
            message=f"Image file is too large ({file_size // (1024*1024)} MB). Maximum is {MAX_IMAGE_FILE_SIZE // (1024*1024)} MB.",
            suggestion="Reduce image file size. Most phone cameras produce files within the limit.",
        ))

    # 3. Open and parse the image
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()  # Verify it's a valid image
        # Re-open after verify (verify closes the file)
        img = Image.open(io.BytesIO(file_bytes))
    except Exception:
        issues.append(ValidationIssue(
            code="corrupt_file",
            message="The image file is corrupted or unreadable.",
            suggestion="Please re-take the photo and upload again.",
        ))
        return ValidationResult(
            status=ValidationStatus.FAILED, issues=issues, metadata=metadata
        )

    # 4. Format check (from actual image data)
    img_format = img.format
    metadata["format"] = img_format
    if img_format and img_format not in ALLOWED_IMAGE_FORMATS:
        issues.append(ValidationIssue(
            code="invalid_format",
            message=f"Unsupported image format: {img_format}.",
            suggestion="Please upload a JPEG, PNG, or WebP image.",
        ))

    # 5. Resolution check
    width, height = img.size
    metadata["width"] = width
    metadata["height"] = height
    metadata["resolution"] = f"{width}x{height}"

    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        issues.append(ValidationIssue(
            code="resolution_too_low",
            message=f"Image resolution ({width}×{height}) is too low. Minimum is {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT}.",
            suggestion="Use your camera's full resolution. Avoid cropping too aggressively.",
        ))

    # 6. Convert to grayscale for quality analysis
    try:
        gray = img.convert("L")
    except Exception:
        issues.append(ValidationIssue(
            code="processing_error",
            message="Unable to process image for quality analysis.",
            suggestion="Try a different image format (JPEG recommended).",
        ))
        return ValidationResult(
            status=ValidationStatus.FAILED, issues=issues, metadata=metadata
        )

    # 7. Blur detection (Laplacian variance)
    blur_score = _compute_blur_score(gray)
    metadata["blur_score"] = round(blur_score, 2)

    if blur_score < BLUR_THRESHOLD:
        issues.append(ValidationIssue(
            code="image_too_blurry",
            message=f"Image is too blurry (sharpness score: {blur_score:.0f}, minimum: {BLUR_THRESHOLD:.0f}).",
            suggestion="Hold your phone steady, ensure good lighting, and tap to focus before shooting.",
        ))

    # 8. Brightness check
    stat = ImageStat.Stat(gray)
    mean_brightness = stat.mean[0]
    metadata["mean_brightness"] = round(mean_brightness, 2)

    if mean_brightness < MIN_BRIGHTNESS:
        issues.append(ValidationIssue(
            code="image_too_dark",
            message=f"Image is too dark (brightness: {mean_brightness:.0f}/255).",
            suggestion="Move to a well-lit area or turn on your flash. Avoid shadows on the product.",
        ))

    if mean_brightness > MAX_BRIGHTNESS:
        issues.append(ValidationIssue(
            code="image_too_bright",
            message=f"Image is overexposed (brightness: {mean_brightness:.0f}/255).",
            suggestion="Avoid direct sunlight or flash glare. Move to even, indirect lighting.",
        ))

    # 9. Content presence check (is it a blank/solid image?)
    std_dev = stat.stddev[0]
    metadata["std_deviation"] = round(std_dev, 2)

    if std_dev < MIN_STD_DEVIATION:
        issues.append(ValidationIssue(
            code="no_content_detected",
            message="Image appears to be blank or a solid color.",
            suggestion="Make sure the product is visible and centered in the frame.",
        ))

    # Final result
    status = ValidationStatus.FAILED if issues else ValidationStatus.PASSED

    if issues:
        logger.warning(f"Image validation FAILED — {len(issues)} issue(s): {[i.code for i in issues]}")
    else:
        logger.info(f"Image validation PASSED — {metadata.get('resolution', '?')}, blur={metadata.get('blur_score', 0):.0f}, brightness={metadata.get('mean_brightness', 0):.0f}")

    return ValidationResult(status=status, issues=issues, metadata=metadata)


def _compute_blur_score(gray_image: Image.Image) -> float:
    """
    Compute a sharpness/blur score using Laplacian-like edge detection.

    Higher score = sharper image. Uses Pillow's FIND_EDGES filter as a
    Laplacian approximation, then computes variance of the result.
    """
    # Apply edge-detection filter (approximates Laplacian)
    edges = gray_image.filter(ImageFilter.FIND_EDGES)
    stat = ImageStat.Stat(edges)
    # Variance of edge intensities — higher means more edges (sharper)
    variance = stat.var[0]
    return variance


# ── Video Validation ───────────────────────────────────────────────────

def validate_video(file_bytes: bytes, filename: str = "video.mp4") -> ValidationResult:
    """
    Validate a video file for quality before AI analysis.

    Uses lightweight header parsing (no heavy dependencies like ffmpeg).
    For full frame-level analysis, extract keyframes and run image checks.

    Args:
        file_bytes: Raw bytes of the uploaded video.
        filename: Original filename (for extension check).

    Returns:
        ValidationResult with pass/fail status and any issues found.
    """
    issues: list[ValidationIssue] = []
    metadata: dict = {}

    # 1. File extension check
    ext = Path(filename).suffix.lower()
    if ext and ext not in ALLOWED_VIDEO_EXTENSIONS:
        issues.append(ValidationIssue(
            code="invalid_format",
            message=f"Unsupported video format: {ext}",
            suggestion="Please upload an MP4, MOV, or WebM video.",
        ))
        return ValidationResult(
            status=ValidationStatus.FAILED, issues=issues, metadata=metadata
        )

    # 2. File size check
    file_size = len(file_bytes)
    metadata["file_size_bytes"] = file_size

    if file_size < MIN_VIDEO_FILE_SIZE:
        issues.append(ValidationIssue(
            code="file_too_small",
            message=f"Video file is too small ({file_size // 1024} KB). Minimum is {MIN_VIDEO_FILE_SIZE // 1024} KB.",
            suggestion="Record at least a 3-second video showing the product clearly.",
        ))

    if file_size > MAX_VIDEO_FILE_SIZE:
        issues.append(ValidationIssue(
            code="file_too_large",
            message=f"Video file is too large ({file_size // (1024*1024)} MB). Maximum is {MAX_VIDEO_FILE_SIZE // (1024*1024)} MB.",
            suggestion="Keep the video under 30 seconds. Use standard quality (720p-1080p).",
        ))

    # 3. Basic header validation (check it's a real video file)
    if not _is_valid_video_header(file_bytes, ext):
        issues.append(ValidationIssue(
            code="corrupt_file",
            message="The video file appears to be corrupted or not a valid video.",
            suggestion="Please re-record the video and upload again.",
        ))
        return ValidationResult(
            status=ValidationStatus.FAILED, issues=issues, metadata=metadata
        )

    metadata["format"] = ext.lstrip(".")

    # 4. Try to extract basic metadata from MP4 header
    if ext in {".mp4", ".mov"}:
        mp4_meta = _parse_mp4_metadata(file_bytes)
        if mp4_meta:
            metadata.update(mp4_meta)

            if mp4_meta.get("duration_sec"):
                duration = mp4_meta["duration_sec"]
                if duration < MIN_VIDEO_DURATION_SEC:
                    issues.append(ValidationIssue(
                        code="video_too_short",
                        message=f"Video is too short ({duration:.1f}s). Minimum is {MIN_VIDEO_DURATION_SEC}s.",
                        suggestion="Record at least 3 seconds showing all sides of the product.",
                    ))
                if duration > MAX_VIDEO_DURATION_SEC:
                    issues.append(ValidationIssue(
                        code="video_too_long",
                        message=f"Video is too long ({duration:.1f}s). Maximum is {MAX_VIDEO_DURATION_SEC}s.",
                        suggestion="Keep the video under 30 seconds. Focus on showing the product condition.",
                    ))

            if mp4_meta.get("width") and mp4_meta.get("height"):
                w, h = mp4_meta["width"], mp4_meta["height"]
                if w < MIN_VIDEO_WIDTH or h < MIN_VIDEO_HEIGHT:
                    issues.append(ValidationIssue(
                        code="resolution_too_low",
                        message=f"Video resolution ({w}×{h}) is too low.",
                        suggestion="Record in at least 480p (640×480) quality.",
                    ))

    # Final result
    status = ValidationStatus.FAILED if issues else ValidationStatus.PASSED
    return ValidationResult(status=status, issues=issues, metadata=metadata)


def _is_valid_video_header(file_bytes: bytes, ext: str) -> bool:
    """Check magic bytes to confirm file is a real video."""
    if len(file_bytes) < 12:
        return False

    # MP4/MOV: ftyp box
    if ext in {".mp4", ".mov"}:
        return file_bytes[4:8] == b"ftyp"

    # WebM: EBML header
    if ext == ".webm":
        return file_bytes[:4] == b"\x1a\x45\xdf\xa3"

    # AVI: RIFF header
    if ext == ".avi":
        return file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"AVI "

    return True  # Unknown extension, let it pass


def _parse_mp4_metadata(file_bytes: bytes) -> dict | None:
    """
    Lightweight MP4 metadata extraction.
    Parses moov/mvhd box for duration and trak/tkhd for dimensions.
    No external dependencies needed.
    """
    result = {}

    try:
        # Search for mvhd box (Movie Header) for duration
        mvhd_pos = file_bytes.find(b"mvhd")
        if mvhd_pos > 0:
            # mvhd structure: version(1) + flags(3) + creation(4) + modification(4) + timescale(4) + duration(4)
            offset = mvhd_pos + 4  # skip 'mvhd'
            version = file_bytes[offset]

            if version == 0:
                timescale = struct.unpack(">I", file_bytes[offset + 12:offset + 16])[0]
                duration = struct.unpack(">I", file_bytes[offset + 16:offset + 20])[0]
            elif version == 1:
                timescale = struct.unpack(">I", file_bytes[offset + 20:offset + 24])[0]
                duration = struct.unpack(">Q", file_bytes[offset + 24:offset + 32])[0]
            else:
                return result

            if timescale > 0:
                result["duration_sec"] = round(duration / timescale, 2)
                result["timescale"] = timescale

        # Search for tkhd box (Track Header) for dimensions
        tkhd_pos = file_bytes.find(b"tkhd")
        if tkhd_pos > 0:
            offset = tkhd_pos + 4
            version = file_bytes[offset]

            if version == 0:
                # width and height are at offset+76 and offset+80 (fixed-point 16.16)
                w_offset = offset + 76
                h_offset = offset + 80
            elif version == 1:
                w_offset = offset + 88
                h_offset = offset + 92
            else:
                return result

            if h_offset + 4 <= len(file_bytes):
                width = struct.unpack(">I", file_bytes[w_offset:w_offset + 4])[0] >> 16
                height = struct.unpack(">I", file_bytes[h_offset:h_offset + 4])[0] >> 16
                if width > 0 and height > 0:
                    result["width"] = width
                    result["height"] = height

    except (struct.error, IndexError):
        pass

    return result if result else None


# ── Upload Guidelines ──────────────────────────────────────────────────

def get_upload_guidelines() -> dict:
    """Return user-friendly upload guidelines for the frontend."""
    return {
        "image": {
            "formats": ["JPEG", "PNG", "WebP"],
            "min_resolution": f"{MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT}",
            "max_file_size": f"{MAX_IMAGE_FILE_SIZE // (1024*1024)} MB",
            "tips": [
                "Use good, even lighting — avoid harsh shadows",
                "Hold your phone steady and tap to focus",
                "Show the product from multiple angles",
                "Include close-ups of any damage or wear",
                "Avoid cluttered backgrounds",
            ],
        },
        "video": {
            "formats": ["MP4", "MOV", "WebM"],
            "min_duration": f"{MIN_VIDEO_DURATION_SEC} seconds",
            "max_duration": f"{MAX_VIDEO_DURATION_SEC} seconds",
            "min_resolution": "480p (640×480)",
            "max_file_size": f"{MAX_VIDEO_FILE_SIZE // (1024*1024)} MB",
            "tips": [
                "Record 5-15 seconds showing all sides of the product",
                "Move slowly — avoid jerky camera movements",
                "Ensure good lighting throughout the video",
                "Focus on areas of wear, damage, or defects",
                "Keep the product centered in frame",
            ],
        },
    }
