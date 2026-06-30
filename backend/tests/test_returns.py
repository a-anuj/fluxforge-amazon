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
    
    # Verify it has pending credits
    order = db_session.query(Order).filter(Order.id == order_id).first()
    assert order.no_return_credits_status == "pending"
    assert order.status == "placed"

    # 2. Create a return for this order (bypassing AI by providing recommended_action)
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
    assert return_data["green_credits_earned"] > 0 # Should earn credits for resell action

    # 3. Verify the order's status and loyalty credits are forfeited
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
    # No listing should be created
    assert return_data.get("listing_id") is None

def test_create_return_resell_creates_listing(client, db_session):
    from app.models import Listing
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
        "recommended_action": "resell" 
    })
    
    assert return_res.status_code == 201
    return_data = return_res.json()
    assert return_data["recommended_action"] == "resell"
    assert return_data.get("listing_id") is not None
    
    listing_id = return_data["listing_id"]
    listing = db_session.query(Listing).filter(Listing.id == listing_id).first()
    assert listing is not None
    assert listing.return_id == return_data["id"]
    assert listing.product_id == 1
    assert listing.status in ["available", "matched"]

def test_create_return_with_ai_assessment(client, db_session):
    # 1. Create an order
    order_res = client.post("/api/orders/", json={
        "user_id": 1, 
        "product_id": 1, 
        "price": 100.0, 
        "delivery_type": "standard"
    })
    order_id = order_res.json()["id"]

    # 2. Create a return WITHOUT providing recommended_action to trigger the AI assessment pipeline
    return_res = client.post("/api/returns/", json={
        "order_id": order_id,
        "image_urls": ["http://example.com/returned_item1.jpg", "http://example.com/returned_item2.jpg"]
    })
    
    assert return_res.status_code == 201
    return_data = return_res.json()
    
    # 3. Verify AI assessment fields were populated
    assert return_data["condition_score"] is not None
    assert 0 <= return_data["condition_score"] <= 100
    assert return_data["defects"] is not None
    assert return_data["remaining_life_pct"] is not None
    assert return_data["recommended_action"] in ["resell", "refurbish", "exchange", "donate", "recycle"]
    
    # 4. Verify green credits were awarded based on the AI's decision
    assert return_data["green_credits_earned"] >= 0
