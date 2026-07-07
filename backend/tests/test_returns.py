import pytest
from app.models import Order


def test_create_return_forfeits_credits(client, db_session):
    # 1. Create an order first
    order_res = client.post("/api/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "price": 100.0,
        "delivery_option": "Standard"
    })
    order_id = order_res.json()["id"]

    # Verify it has pending credits and starts as "placed"
    order = db_session.query(Order).filter(Order.id == order_id).first()
    assert order.no_return_credits_status == "pending"
    assert order.status == "placed"

    # 2. Create a return directly — no baseline/return video scan required anymore
    return_res = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": ["http://example.com/img1.jpg"],
        "condition_score": 85.0,
        "defects": "None",
        "remaining_life_pct": 90,
        "recommended_action": "resell"
    })

    assert return_res.status_code == 201
    return_data = return_res.json()
    assert return_data["order_id"] == order_id
    assert return_data["recommended_action"] == "resell"
    assert return_data["green_credits_earned"] > 0  # Should earn credits for resell action

    # 3. The order is marked returned immediately and loyalty credits are forfeited
    db_session.refresh(order)
    assert order.status == "returned"
    assert order.no_return_credits_status == "forfeited"


def test_create_return_not_found(client):
    response = client.post("/api/returns/", json={
        "order_id": 99999,
        "image_urls": ["http://example.com/img1.jpg"],
        "recommended_action": "resell"
    })
    assert response.status_code == 404
    assert response.json()["detail"] == "Order not found"


def test_create_return_allowed_without_scan(client, db_session):
    """A freshly placed order is returnable directly — the delivery baseline
    scan gate has been removed (feature to be rebuilt from scratch)."""
    order_res = client.post("/api/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "delivery_type": "standard",
    })
    order_id = order_res.json()["id"]

    response = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": [],
        "recommended_action": "resell",
    })
    assert response.status_code == 201

    order = db_session.query(Order).filter(Order.id == order_id).first()
    assert order.status == "returned"


def test_create_return_already_returned(client, db_session):
    """A second return on an already-returned order is rejected."""
    order_res = client.post("/api/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "delivery_type": "standard",
    })
    order_id = order_res.json()["id"]

    first = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": [],
        "recommended_action": "resell",
    })
    assert first.status_code == 201

    second = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": [],
        "recommended_action": "resell",
    })
    assert second.status_code == 409


def test_create_return_recycle(client, db_session):
    order_res = client.post("/api/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "price": 100.0,
        "delivery_type": "standard"
    })
    order_id = order_res.json()["id"]

    return_res = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": [],
        "recommended_action": "recycle"
    })

    assert return_res.status_code == 201
    return_data = return_res.json()
    assert return_data["recommended_action"] == "recycle"
    assert return_data["green_credits_earned"] > 0
    # The basic return flow does not auto-create a resale listing
    assert return_data.get("listing_id") is None


def test_create_return_with_ai_assessment(client, db_session):
    # 1. Create an order
    order_res = client.post("/api/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "price": 100.0,
        "delivery_type": "standard"
    })
    order_id = order_res.json()["id"]

    # 2. Create a return WITHOUT providing recommended_action to trigger the AI assessment fallback
    return_res = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": ["http://example.com/returned_item1.jpg", "http://example.com/returned_item2.jpg"]
    })

    assert return_res.status_code == 201
    return_data = return_res.json()

    # 3. Verify assessment fields were populated
    assert return_data["condition_score"] is not None
    assert 0 <= return_data["condition_score"] <= 100
    assert return_data["defects"] is not None
    assert return_data["remaining_life_pct"] is not None
    assert return_data["recommended_action"] in ["resell", "refurbish", "exchange", "donate", "recycle"]

    # 4. Verify green credits were awarded based on the decision
    assert return_data["green_credits_earned"] >= 0
