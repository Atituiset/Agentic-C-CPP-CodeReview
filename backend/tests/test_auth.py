import os

os.environ.setdefault("SECRET_KEY", "test-secret")

import pytest
from httpx import AsyncClient, ASGITransport

from backend.database import SessionLocal
from backend.models.orm import User
from backend.services.auth_service import hash_password


@pytest.fixture
def test_user():
    db = SessionLocal()
    user = User(
        username="testuser",
        display_name="Test User",
        password_hash=hash_password("testpass"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    yield user
    db = SessionLocal()
    db.query(User).filter(User.id == user.id).delete()
    db.commit()
    db.close()


@pytest.mark.asyncio
async def test_login_valid_credentials(test_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert isinstance(data["access_token"], str)
        assert len(data["access_token"]) > 0


@pytest.mark.asyncio
async def test_login_invalid_credentials(test_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "wrongpass"},
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data


@pytest.mark.asyncio
async def test_me_with_valid_token(test_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "testpass"},
        )
        token = login_resp.json()["access_token"]

        me_resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_resp.status_code == 200
        data = me_resp.json()
        assert data["id"] == test_user.id
        assert data["username"] == "testuser"
        assert data["display_name"] == "Test User"
        assert data["role"] == "user"
