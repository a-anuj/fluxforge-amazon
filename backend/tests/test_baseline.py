"""
Tests for the Packaging Baseline Scan router.

Covers:
  - AI product identity verification gate (match / mismatch / low-confidence / unavailable)
  - Role enforcement (employee/admin only)
  - File type validation
  - Duplicate-scan prevention
  - Order status transitions
"""

import io
from unittest.mock import patch

import pytest
from PIL import Image

from app.models import Order, User


# ── Helpers ────────────────────────────────────────────────────────────

def _png() -> bytes:
    """Tiny but valid PNG for snapshot uploads."""
    img = Image.new("RGB", (4, 4), (128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _fake_video() -> bytes:
    """Minimal bytes that pass the content-type check."""
    return b"\x00\x00\x00\x08ftypisom" + b"\x00" * 512


def _seed_employee(db_session) -> User:
    emp = User(
        id=50, name="Warehouse Op", role="employee",
        green_credits=0, lifetime_credits=0, level="Starter",
    )
    db_session.add(emp)
    db_session.commit()
    return emp


def _create_order(client) -> int:
    res = client.post("/api/orders/", json={
        "user_id": 1, "product_id": 1,
        "price": 100.0, "delivery_type": "standard",
    })
    assert res.status_code == 201
    return res.json()["id"]


def _scan(client, order_id, employee_id, verifier_return):
    """POST /api/baseline/{order_id}/scan with mocked verifier."""
    with patch("app.routers.baseline.verify_product_identity", return_value=verifier_return):
        return client.post(
            f"/api/baseline/{order_id}/scan",
            data={"employee_id": employee_id},
            files={
                "video":    ("scan.webm", _fake_video(), "video/webm"),
                "snapshot": ("frame.png", _png(), "image/png"),
            },
        )


# ── Fixtures ───────────────────────────────────────────────────────────

MATCH_HIGH = {
    "verified": True, "detected_product": "Test Product",
    "confidence": "high", "reason": "Item matches the order.",
}
MISMATCH_HIGH = {
    "verified": False, "detected_product": "Mobile Phone",
    "confidence": "high", "reason": "A phone was scanned instead of the expected product.",
}
MISMATCH_MEDIUM = {
    "verified": False, "detected_product": "Laptop",
    "confidence": "medium", "reason": "Appears to be a laptop.",
}
MISMATCH_LOW = {
    "verified": False, "detected_product": "Unknown",
    "confidence": "low", "reason": "Image is unclear.",
}
AI_DOWN = {
    "verified": True, "detected_product": "Verification service unavailable",
    "confidence": "low", "reason": "Bedrock unreachable.",
    "ai_unavailable": True,
}


# ── Tests ──────────────────────────────────────────────────────────────

class TestBaselineScanProductVerification:

    def test_correct_product_returns_success(self, client, db_session):
        """Scan succeeds and order becomes 'delivered' when product matches."""
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        resp = _scan(client, order_id, emp.id, MATCH_HIGH)

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["product_verified"] is True
        assert data["verification_confidence"] == "high"

        order = db_session.query(Order).filter(Order.id == order_id).first()
        db_session.refresh(order)
        assert order.status == "delivered"

    def test_wrong_product_high_confidence_returns_422(self, client, db_session):
        """422 is raised when AI is confident the wrong product is scanned."""
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        resp = _scan(client, order_id, emp.id, MISMATCH_HIGH)

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["type"] == "product_mismatch"
        assert "Mobile Phone" in detail["detected_product"]
        assert detail["confidence"] == "high"

        # Order must NOT be advanced to delivered
        order = db_session.query(Order).filter(Order.id == order_id).first()
        db_session.refresh(order)
        assert order.status == "placed"

    def test_wrong_product_medium_confidence_returns_422(self, client, db_session):
        """Medium-confidence mismatches are also blocked."""
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        resp = _scan(client, order_id, emp.id, MISMATCH_MEDIUM)

        assert resp.status_code == 422
        assert resp.json()["detail"]["confidence"] == "medium"

    def test_low_confidence_mismatch_is_allowed(self, client, db_session):
        """Low-confidence mismatches pass (AI not sure enough to block)."""
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        resp = _scan(client, order_id, emp.id, MISMATCH_LOW)

        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_ai_unavailable_is_fail_open(self, client, db_session):
        """If Bedrock is down, the scan is allowed with an ai_warning field."""
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        resp = _scan(client, order_id, emp.id, AI_DOWN)

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "ai_warning" in data


class TestBaselineScanAccessControl:

    def test_non_employee_user_is_rejected(self, client, db_session):
        """Regular customers cannot submit baseline scans (403)."""
        order_id = _create_order(client)  # user_id=1 is a customer in conftest

        resp = _scan(client, order_id, 1, MATCH_HIGH)

        assert resp.status_code == 403

    def test_missing_order_returns_404(self, client, db_session):
        emp = _seed_employee(db_session)
        resp = _scan(client, 999999, emp.id, MATCH_HIGH)
        assert resp.status_code == 404

    def test_duplicate_scan_returns_409(self, client, db_session):
        """Submitting a second scan for the same order is rejected."""
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        _scan(client, order_id, emp.id, MATCH_HIGH)           # first scan
        resp = _scan(client, order_id, emp.id, MATCH_HIGH)    # second scan

        assert resp.status_code == 409


class TestBaselineScanFileValidation:

    def test_non_video_upload_for_video_field_returns_400(self, client, db_session):
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        with patch("app.routers.baseline.verify_product_identity", return_value=MATCH_HIGH):
            resp = client.post(
                f"/api/baseline/{order_id}/scan",
                data={"employee_id": emp.id},
                files={
                    "video":    ("not_a_video.txt", b"hello", "text/plain"),
                    "snapshot": ("frame.png", _png(), "image/png"),
                },
            )
        assert resp.status_code == 400

    def test_non_image_upload_for_snapshot_field_returns_400(self, client, db_session):
        emp = _seed_employee(db_session)
        order_id = _create_order(client)

        with patch("app.routers.baseline.verify_product_identity", return_value=MATCH_HIGH):
            resp = client.post(
                f"/api/baseline/{order_id}/scan",
                data={"employee_id": emp.id},
                files={
                    "video":    ("scan.webm", _fake_video(), "video/webm"),
                    "snapshot": ("data.pdf", b"%PDF", "application/pdf"),
                },
            )
        assert resp.status_code == 400
