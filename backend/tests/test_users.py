import os

os.environ.setdefault("SECRET_KEY", "test-secret")

import pytest
from httpx import AsyncClient, ASGITransport

from backend.database import SessionLocal
from backend.models.orm import User
from backend.services.auth_service import hash_password


@pytest.fixture
def admin_user():
    db = SessionLocal()
    user = User(
        username="admin",
        display_name="Administrator",
        password_hash=hash_password("admin123"),
        role="admin",
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


@pytest.fixture
def regular_user():
    db = SessionLocal()
    user = User(
        username="regular",
        display_name="Regular User",
        password_hash=hash_password("regular123"),
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


async def _login(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_create_user_as_admin(admin_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "admin", "admin123")
        response = await client.post(
            "/api/users",
            json={
                "username": "newuser",
                "display_name": "New User",
                "password": "newpass123",
                "role": "user",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["display_name"] == "New User"
        assert data["role"] == "user"
        assert "id" in data

        # Cleanup
        db = SessionLocal()
        db.query(User).filter(User.username == "newuser").delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_list_users_as_admin(admin_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "admin", "admin123")
        response = await client.get(
            "/api/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any(u["username"] == "admin" for u in data)


@pytest.mark.asyncio
async def test_delete_user_as_admin(admin_user):
    from backend.main import app

    db = SessionLocal()
    target = User(
        username="todelete",
        display_name="To Delete",
        password_hash=hash_password("delete123"),
        role="user",
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    target_id = target.id
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "admin", "admin123")
        response = await client.delete(
            f"/api/users/{target_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 204

        db = SessionLocal()
        deleted = db.query(User).filter(User.id == target_id).first()
        db.close()
        assert deleted is None


@pytest.mark.asyncio
async def test_non_admin_cannot_access(admin_user, regular_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "regular", "regular123")

        list_resp = await client.get(
            "/api/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert list_resp.status_code == 403

        create_resp = await client.post(
            "/api/users",
            json={
                "username": "hacker",
                "display_name": "Hacker",
                "password": "hack123",
                "role": "admin",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert create_resp.status_code == 403

        delete_resp = await client.delete(
            f"/api/users/{admin_user.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert delete_resp.status_code == 403
