import pytest

def test_get_user(client):
    response = client.get("/api/users/1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "Test User"
    assert data["green_credits"] == 100
    assert data["level"] == "Eco Starter"

def test_get_user_not_found(client):
    response = client.get("/api/users/999")
    assert response.status_code == 404
