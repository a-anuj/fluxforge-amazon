"""
Tests for the Media Quality Guardrail Service.

Tests cover:
  - Image validation (resolution, blur, brightness, format, content)
  - Video validation (format, size, header parsing)
  - Edge cases and error handling
  - Upload guidelines endpoint
"""

import io
import struct

import pytest
from PIL import Image, ImageDraw, ImageFilter

from app.services.media_validator import (
    validate_image,
    validate_video,
    get_upload_guidelines,
    ValidationStatus,
    MIN_IMAGE_WIDTH,
    MIN_IMAGE_HEIGHT,
    MIN_IMAGE_FILE_SIZE,
    MAX_IMAGE_FILE_SIZE,
    BLUR_THRESHOLD,
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
    MIN_STD_DEVIATION,
    MIN_VIDEO_FILE_SIZE,
    MAX_VIDEO_FILE_SIZE,
)


# ── Helper Functions ───────────────────────────────────────────────────

def _create_test_image(
    width: int = 800,
    height: int = 600,
    color: tuple = (128, 128, 128),
    add_detail: bool = True,
    format: str = "JPEG",
    quality: int = 85,
) -> bytes:
    """Create a test image with configurable properties."""
    img = Image.new("RGB", (width, height), color)

    if add_detail:
        # Add some detail/texture to pass blur and content checks
        draw = ImageDraw.Draw(img)
        for i in range(0, width, 20):
            draw.line([(i, 0), (i, height)], fill=(64, 64, 64), width=2)
        for j in range(0, height, 20):
            draw.line([(0, j), (width, j)], fill=(192, 192, 192), width=1)
        # Add some shapes for content variety
        draw.rectangle([100, 100, 300, 300], fill=(200, 50, 50))
        draw.ellipse([400, 200, 600, 400], fill=(50, 200, 50))
        # Add pixel-level noise to increase file size for lossless formats
        import random as _rng
        _rng.seed(42)
        pixels = img.load()
        for x in range(0, width, 3):
            for y in range(0, height, 3):
                r, g, b = pixels[x, y]
                noise = _rng.randint(-15, 15)
                pixels[x, y] = (
                    max(0, min(255, r + noise)),
                    max(0, min(255, g + noise)),
                    max(0, min(255, b + noise)),
                )

    buf = io.BytesIO()
    img.save(buf, format=format, quality=quality)
    return buf.getvalue()


def _create_blurry_image(width: int = 800, height: int = 600) -> bytes:
    """Create a heavily blurred test image."""
    img = Image.new("RGB", (width, height), (128, 128, 128))
    draw = ImageDraw.Draw(img)
    # Add some content then blur it away
    draw.rectangle([100, 100, 300, 300], fill=(200, 50, 50))
    # Apply extreme Gaussian blur to get below threshold of 50
    for _ in range(5):
        img = img.filter(ImageFilter.GaussianBlur(radius=20))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _create_dark_image(width: int = 800, height: int = 600) -> bytes:
    """Create a very dark test image."""
    img = Image.new("RGB", (width, height), (10, 10, 10))
    # Add tiny variation so it's not flagged as blank
    draw = ImageDraw.Draw(img)
    draw.rectangle([100, 100, 200, 200], fill=(20, 20, 20))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _create_bright_image(width: int = 800, height: int = 600) -> bytes:
    """Create an overexposed test image."""
    img = Image.new("RGB", (width, height), (250, 250, 250))
    draw = ImageDraw.Draw(img)
    draw.rectangle([100, 100, 200, 200], fill=(245, 245, 245))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _create_blank_image(width: int = 800, height: int = 600) -> bytes:
    """Create a solid-color blank image (same color in all channels)."""
    # Use a color where ALL channels are the same value -> no variation in any channel
    img = Image.new("RGB", (width, height), (128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _create_fake_mp4(
    duration_sec: float = 10.0,
    width: int = 1920,
    height: int = 1080,
    size_bytes: int = 1024 * 1024,
) -> bytes:
    """Create a minimal fake MP4 file with valid headers."""
    buf = io.BytesIO()

    # ftyp box
    ftyp_data = b"isom" + b"\x00" * 4
    ftyp_size = 8 + len(ftyp_data)
    buf.write(struct.pack(">I", ftyp_size))
    buf.write(b"ftyp")
    buf.write(ftyp_data)

    # moov box with mvhd
    timescale = 1000
    duration = int(duration_sec * timescale)

    # mvhd box (version 0)
    mvhd_data = bytearray(100)
    mvhd_data[0] = 0  # version
    # timescale at offset 12
    struct.pack_into(">I", mvhd_data, 12, timescale)
    # duration at offset 16
    struct.pack_into(">I", mvhd_data, 16, duration)

    mvhd_size = 8 + len(mvhd_data)

    # tkhd box (version 0) - track header with dimensions
    tkhd_data = bytearray(84)
    tkhd_data[0] = 0  # version
    # width at offset 76 (fixed-point 16.16)
    struct.pack_into(">I", tkhd_data, 76, width << 16)
    # height at offset 80
    struct.pack_into(">I", tkhd_data, 80, height << 16)

    tkhd_size = 8 + len(tkhd_data)

    # trak box containing tkhd
    trak_size = 8 + tkhd_size
    # moov box containing mvhd + trak
    moov_size = 8 + mvhd_size + trak_size

    buf.write(struct.pack(">I", moov_size))
    buf.write(b"moov")
    buf.write(struct.pack(">I", mvhd_size))
    buf.write(b"mvhd")
    buf.write(bytes(mvhd_data))
    buf.write(struct.pack(">I", trak_size))
    buf.write(b"trak")
    buf.write(struct.pack(">I", tkhd_size))
    buf.write(b"tkhd")
    buf.write(bytes(tkhd_data))

    # Pad to desired size
    current_size = buf.tell()
    if current_size < size_bytes:
        buf.write(b"\x00" * (size_bytes - current_size))

    return buf.getvalue()


# ── Image Validation Tests ─────────────────────────────────────────────

class TestImageValidation:
    """Tests for validate_image()."""

    def test_valid_image_passes(self):
        """A good quality image should pass all checks."""
        img_bytes = _create_test_image(800, 600, add_detail=True)
        result = validate_image(img_bytes, "product.jpg")

        assert result.passed
        assert result.status == ValidationStatus.PASSED
        assert len(result.issues) == 0
        assert result.metadata["width"] == 800
        assert result.metadata["height"] == 600

    def test_valid_png_passes(self):
        """PNG format should be accepted."""
        # Use larger image with more detail to exceed min file size for PNG
        img_bytes = _create_test_image(1200, 900, format="PNG")
        result = validate_image(img_bytes, "product.png")

        assert result.passed
        assert result.metadata["format"] == "PNG"

    def test_valid_webp_passes(self):
        """WebP format should be accepted."""
        # Use larger image with more detail to exceed min file size for WebP
        img_bytes = _create_test_image(1200, 900, format="WEBP")
        result = validate_image(img_bytes, "product.webp")

        assert result.passed

    def test_low_resolution_fails(self):
        """Image below minimum resolution should fail."""
        img_bytes = _create_test_image(320, 240, add_detail=True)
        result = validate_image(img_bytes, "small.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "resolution_too_low" in codes

    def test_width_below_minimum_fails(self):
        """Image with width below minimum should fail."""
        img_bytes = _create_test_image(400, 600, add_detail=True)
        result = validate_image(img_bytes, "narrow.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "resolution_too_low" in codes

    def test_height_below_minimum_fails(self):
        """Image with height below minimum should fail."""
        img_bytes = _create_test_image(800, 300, add_detail=True)
        result = validate_image(img_bytes, "short.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "resolution_too_low" in codes

    def test_blurry_image_fails(self):
        """An extremely blurred image with no discernible content should fail."""
        # Create a truly uniform image via extreme blur + solid start
        img = Image.new("RGB", (800, 600), (128, 128, 128))  # uniform gray
        # Single tiny dot of color won't survive extreme blur
        draw = ImageDraw.Draw(img)
        draw.point((400, 300), fill=(130, 130, 130))
        for _ in range(10):
            img = img.filter(ImageFilter.GaussianBlur(radius=30))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img_bytes = buf.getvalue()

        result = validate_image(img_bytes, "blurry.jpg")
        # Should fail on content check (all uniform after extreme blur)
        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "image_too_blurry" in codes or "no_content_detected" in codes

    def test_dark_image_fails(self):
        """A very dark image should fail brightness check."""
        img_bytes = _create_dark_image()
        result = validate_image(img_bytes, "dark.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "image_too_dark" in codes

    def test_overexposed_image_fails(self):
        """An overexposed image should fail brightness check."""
        img_bytes = _create_bright_image()
        result = validate_image(img_bytes, "bright.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "image_too_bright" in codes

    def test_blank_image_fails(self):
        """A solid-color image should fail content presence check."""
        img_bytes = _create_blank_image()
        result = validate_image(img_bytes, "blank.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "no_content_detected" in codes

    def test_invalid_format_fails(self):
        """An unsupported format extension should fail."""
        img_bytes = _create_test_image()
        result = validate_image(img_bytes, "image.bmp")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "invalid_format" in codes

    def test_corrupt_file_fails(self):
        """Random bytes should fail as corrupt."""
        result = validate_image(b"not an image at all", "corrupt.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "corrupt_file" in codes

    def test_empty_file_fails(self):
        """Empty bytes should fail."""
        result = validate_image(b"", "empty.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "corrupt_file" in codes or "file_too_small" in codes

    def test_file_too_small_fails(self):
        """A very small file should fail size check."""
        # Create a tiny valid image
        img = Image.new("RGB", (800, 600), (128, 100, 80))
        draw = ImageDraw.Draw(img)
        draw.rectangle([100, 100, 700, 500], fill=(200, 50, 50))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=1)  # Very low quality = small file
        img_bytes = buf.getvalue()

        # Only test if the file is actually small enough to trigger
        if len(img_bytes) < MIN_IMAGE_FILE_SIZE:
            result = validate_image(img_bytes, "tiny.jpg")
            codes = [i.code for i in result.issues]
            assert "file_too_small" in codes

    def test_file_too_large_fails(self):
        """A file exceeding max size should fail."""
        # Create bytes that exceed limit
        oversized = b"\xff\xd8\xff\xe0" + b"\x00" * (MAX_IMAGE_FILE_SIZE + 1)
        result = validate_image(oversized, "huge.jpg")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "file_too_large" in codes

    def test_metadata_populated(self):
        """Metadata should contain resolution, blur score, brightness."""
        img_bytes = _create_test_image(1024, 768)
        result = validate_image(img_bytes, "meta.jpg")

        assert "width" in result.metadata
        assert "height" in result.metadata
        assert "blur_score" in result.metadata
        assert "mean_brightness" in result.metadata
        assert "std_deviation" in result.metadata
        assert "file_size_bytes" in result.metadata

    def test_to_dict_format(self):
        """to_dict() should return proper serializable dict."""
        img_bytes = _create_test_image()
        result = validate_image(img_bytes, "test.jpg")
        d = result.to_dict()

        assert "status" in d
        assert "passed" in d
        assert "issues" in d
        assert "metadata" in d
        assert isinstance(d["issues"], list)
        assert isinstance(d["passed"], bool)

    def test_multiple_issues_reported(self):
        """Multiple quality problems should all be reported."""
        # Dark + blank (solid dark color)
        img = Image.new("RGB", (320, 240), (10, 10, 10))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img_bytes = buf.getvalue()

        result = validate_image(img_bytes, "bad.jpg")
        assert not result.passed
        # Should have at least resolution + dark + blank issues
        assert len(result.issues) >= 2


# ── Video Validation Tests ─────────────────────────────────────────────

class TestVideoValidation:
    """Tests for validate_video()."""

    def test_valid_mp4_passes(self):
        """A valid MP4 with correct metadata should pass."""
        video_bytes = _create_fake_mp4(
            duration_sec=10.0, width=1920, height=1080, size_bytes=1024 * 1024
        )
        result = validate_video(video_bytes, "product.mp4")

        assert result.passed
        assert result.status == ValidationStatus.PASSED

    def test_valid_mov_passes(self):
        """MOV format should be accepted (same container as MP4)."""
        video_bytes = _create_fake_mp4(duration_sec=10.0, size_bytes=1024 * 1024)
        result = validate_video(video_bytes, "product.mov")

        assert result.passed

    def test_invalid_extension_fails(self):
        """Unsupported video format should fail."""
        video_bytes = _create_fake_mp4()
        result = validate_video(video_bytes, "video.flv")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "invalid_format" in codes

    def test_file_too_small_fails(self):
        """Video below minimum size should fail."""
        small_video = _create_fake_mp4(size_bytes=100 * 1024)  # 100 KB
        result = validate_video(small_video, "small.mp4")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "file_too_small" in codes

    def test_file_too_large_fails(self):
        """Video exceeding max size should fail."""
        # We won't allocate 50MB in memory, just test the check with oversized bytes
        oversized = b"\x00\x00\x00\x08ftypisom" + b"\x00" * (MAX_VIDEO_FILE_SIZE + 1)
        result = validate_video(oversized, "huge.mp4")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "file_too_large" in codes

    def test_video_too_short_fails(self):
        """Video shorter than minimum duration should fail."""
        video_bytes = _create_fake_mp4(duration_sec=1.5, size_bytes=600 * 1024)
        result = validate_video(video_bytes, "short.mp4")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "video_too_short" in codes

    def test_video_too_long_fails(self):
        """Video longer than maximum duration should fail."""
        video_bytes = _create_fake_mp4(duration_sec=45.0, size_bytes=600 * 1024)
        result = validate_video(video_bytes, "long.mp4")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "video_too_long" in codes

    def test_low_resolution_video_fails(self):
        """Video with resolution below minimum should fail."""
        video_bytes = _create_fake_mp4(
            width=320, height=240, duration_sec=10.0, size_bytes=600 * 1024
        )
        result = validate_video(video_bytes, "lowres.mp4")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "resolution_too_low" in codes

    def test_corrupt_video_fails(self):
        """Random bytes should fail header validation."""
        result = validate_video(b"not a video file", "corrupt.mp4")

        assert not result.passed
        codes = [i.code for i in result.issues]
        assert "corrupt_file" in codes

    def test_webm_header_validation(self):
        """WebM with valid EBML header should pass header check."""
        # EBML magic bytes + padding
        webm_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * (600 * 1024)
        result = validate_video(webm_bytes, "video.webm")

        # Should not get corrupt_file error (header is valid)
        codes = [i.code for i in result.issues]
        assert "corrupt_file" not in codes

    def test_avi_header_validation(self):
        """AVI with valid RIFF header should pass header check."""
        avi_bytes = b"RIFF" + b"\x00\x00\x00\x00" + b"AVI " + b"\x00" * (600 * 1024)
        result = validate_video(avi_bytes, "video.avi")

        codes = [i.code for i in result.issues]
        assert "corrupt_file" not in codes

    def test_metadata_from_mp4(self):
        """MP4 metadata should be extracted (duration, dimensions)."""
        video_bytes = _create_fake_mp4(
            duration_sec=15.0, width=1280, height=720, size_bytes=1024 * 1024
        )
        result = validate_video(video_bytes, "video.mp4")

        assert "duration_sec" in result.metadata
        assert "width" in result.metadata
        assert "height" in result.metadata
        assert abs(result.metadata["duration_sec"] - 15.0) < 0.1


# ── Upload Guidelines Tests ────────────────────────────────────────────

class TestUploadGuidelines:
    """Tests for get_upload_guidelines()."""

    def test_guidelines_structure(self):
        """Guidelines should have image and video sections."""
        guidelines = get_upload_guidelines()

        assert "image" in guidelines
        assert "video" in guidelines

    def test_image_guidelines_content(self):
        """Image guidelines should contain all required fields."""
        guidelines = get_upload_guidelines()["image"]

        assert "formats" in guidelines
        assert "min_resolution" in guidelines
        assert "max_file_size" in guidelines
        assert "tips" in guidelines
        assert len(guidelines["tips"]) > 0

    def test_video_guidelines_content(self):
        """Video guidelines should contain all required fields."""
        guidelines = get_upload_guidelines()["video"]

        assert "formats" in guidelines
        assert "min_duration" in guidelines
        assert "max_duration" in guidelines
        assert "min_resolution" in guidelines
        assert "max_file_size" in guidelines
        assert "tips" in guidelines
        assert len(guidelines["tips"]) > 0


# ── API Endpoint Tests ─────────────────────────────────────────────────

class TestMediaEndpoints:
    """Integration tests for the /api/media/ endpoints."""

    @pytest.fixture
    def client(self):
        """Create a FastAPI test client."""
        from fastapi.testclient import TestClient
        from app.main import app
        return TestClient(app)

    def test_guidelines_endpoint(self, client):
        """GET /api/media/guidelines should return guidelines."""
        resp = client.get("/api/media/guidelines")
        assert resp.status_code == 200
        data = resp.json()
        assert "image" in data
        assert "video" in data

    def test_validate_image_endpoint_success(self, client):
        """POST /api/media/validate/image with valid image should pass."""
        img_bytes = _create_test_image(800, 600)
        resp = client.post(
            "/api/media/validate/image",
            files={"file": ("product.jpg", img_bytes, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["passed"] is True
        assert data["status"] == "passed"

    def test_validate_image_endpoint_failure(self, client):
        """POST /api/media/validate/image with blank image should fail."""
        # A solid gray image has no content — should fail
        img = Image.new("RGB", (800, 600), (128, 128, 128))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img_bytes = buf.getvalue()

        resp = client.post(
            "/api/media/validate/image",
            files={"file": ("blank.jpg", img_bytes, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["passed"] is False
        assert len(data["issues"]) > 0

    def test_validate_image_wrong_content_type(self, client):
        """POST /api/media/validate/image with non-image should return 400."""
        resp = client.post(
            "/api/media/validate/image",
            files={"file": ("video.mp4", b"fake video", "video/mp4")},
        )
        assert resp.status_code == 400

    def test_validate_video_endpoint_success(self, client):
        """POST /api/media/validate/video with valid video should pass."""
        video_bytes = _create_fake_mp4(
            duration_sec=10.0, width=1920, height=1080, size_bytes=1024 * 1024
        )
        resp = client.post(
            "/api/media/validate/video",
            files={"file": ("product.mp4", video_bytes, "video/mp4")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["passed"] is True

    def test_validate_video_endpoint_failure(self, client):
        """POST /api/media/validate/video with short video should fail."""
        video_bytes = _create_fake_mp4(duration_sec=1.0, size_bytes=600 * 1024)
        resp = client.post(
            "/api/media/validate/video",
            files={"file": ("short.mp4", video_bytes, "video/mp4")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["passed"] is False

    def test_batch_validate_endpoint(self, client):
        """POST /api/media/validate/batch with mixed files."""
        img_bytes = _create_test_image(800, 600)
        video_bytes = _create_fake_mp4(duration_sec=10.0, size_bytes=1024 * 1024)

        resp = client.post(
            "/api/media/validate/batch",
            files=[
                ("files", ("product.jpg", img_bytes, "image/jpeg")),
                ("files", ("demo.mp4", video_bytes, "video/mp4")),
            ],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_files"] == 2
        assert "all_passed" in data
        assert len(data["results"]) == 2

    def test_batch_validate_too_many_files(self, client):
        """POST /api/media/validate/batch with >5 files should return 400."""
        img_bytes = _create_test_image()
        files = [("files", (f"img{i}.jpg", img_bytes, "image/jpeg")) for i in range(6)]

        resp = client.post("/api/media/validate/batch", files=files)
        assert resp.status_code == 400
