import pytest
from app.models import Order

def test_create_return_forfeits_credits(client, db_session):
    # 1. Create an order first
    order_res = client.post("/orders/", json={
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
    return_res = client.post("/returns/", json={
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
