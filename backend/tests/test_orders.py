import pytest
from datetime import datetime, timedelta
from app.models import Order, User

def test_create_order(client, db_session):
    # Test creating a basic order
    response = client.post("/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "price": 100.0,
        "delivery_option": "Standard",
        "is_community": False
    })
    assert response.status_code == 201
    data = response.json()
    assert data["user_id"] == 1
    assert data["product_id"] == 1
    assert data["status"] == "placed"
    assert data["green_credits_earned"] == 0 # Standard delivery
    assert data["no_return_credits_status"] == "pending"
    assert data["no_return_credits"] > 0 # Should have calculated pending credits

def test_create_order_eco_delivery(client, db_session):
    # Test creating an order with eco delivery (earns immediate credits)
    response = client.post("/orders/", json={
        "user_id": 1,
        "product_id": 1,
        "price": 100.0,
        "delivery_option": "Amazon Day Delivery", # This should trigger eco bonus
        "is_community": False
    })
    assert response.status_code == 201
    data = response.json()
    assert data["green_credits_earned"] > 0 # Eco delivery bonus

def test_vest_credits_too_early(client, db_session):
    # Create an order
    order_res = client.post("/orders/", json={"user_id": 1, "product_id": 1, "price": 100.0, "delivery_option": "Standard"})
    order_id = order_res.json()["id"]

    # Try to vest immediately (window should still be open)
    response = client.post(f"/orders/{order_id}/vest-credits")
    assert response.status_code == 400
    assert "Return window has not expired yet" in response.json()["detail"]

def test_vest_credits_success(client, db_session):
    # Create an order
    order_res = client.post("/orders/", json={"user_id": 1, "product_id": 1, "price": 100.0, "delivery_option": "Standard"})
    order_id = order_res.json()["id"]
    pending_credits = order_res.json()["no_return_credits"]

    # Artificially age the order by backdating placed_at to 8 days ago
    order = db_session.query(Order).filter(Order.id == order_id).first()
    order.placed_at = datetime.utcnow() - timedelta(days=8)
    db_session.commit()

    # Initial user credits
    user_before = db_session.query(User).filter(User.id == 1).first()
    initial_credits = user_before.green_credits

    # Try to vest
    response = client.post(f"/orders/{order_id}/vest-credits")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "vested"
    assert data["credits_vested"] == pending_credits

    # Verify user credits updated
    db_session.refresh(user_before)
    assert user_before.green_credits == initial_credits + pending_credits

def test_vest_already_forfeited(client, db_session):
    # Create an order
    order_res = client.post("/orders/", json={"user_id": 1, "product_id": 1, "price": 100.0, "delivery_option": "Standard"})
    order_id = order_res.json()["id"]

    # Forfeit it
    order = db_session.query(Order).filter(Order.id == order_id).first()
    order.no_return_credits_status = "forfeited"
    db_session.commit()

    # Try to vest
    response = client.post(f"/orders/{order_id}/vest-credits")
    assert response.status_code == 400
    assert "Credits not available or already processed" in response.json()["detail"]
