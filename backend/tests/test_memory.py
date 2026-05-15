import os

os.environ.setdefault("SECRET_KEY", "test-secret")

import pytest
from httpx import AsyncClient, ASGITransport

from backend.database import SessionLocal
from backend.models.orm import User, MemoryRule
from backend.services.auth_service import hash_password


@pytest.fixture
def admin_user():
    db = SessionLocal()
    user = User(
        username="memadmin",
        display_name="Memory Admin",
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
def committer_user():
    db = SessionLocal()
    user = User(
        username="memcommitter",
        display_name="Memory Committer",
        password_hash=hash_password("committer123"),
        role="committer",
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
        username="memuser",
        display_name="Memory User",
        password_hash=hash_password("user123"),
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


def _cleanup_memory_rules():
    db = SessionLocal()
    db.query(MemoryRule).delete()
    db.commit()
    db.close()


@pytest.mark.asyncio
async def test_list_memory_rules_user_sees_global_and_own(admin_user, regular_user):
    from backend.main import app

    db = SessionLocal()
    global_rule = MemoryRule(
        rule_type="positive",
        scope="global",
        title="Global Rule",
        is_active=True,
        created_by=admin_user.id,
    )
    personal_rule = MemoryRule(
        rule_type="negative",
        scope="personal",
        owner_id=regular_user.id,
        title="Personal Rule",
        is_active=True,
        created_by=regular_user.id,
    )
    other_personal = MemoryRule(
        rule_type="positive",
        scope="personal",
        owner_id=admin_user.id,
        title="Admin Personal",
        is_active=True,
        created_by=admin_user.id,
    )
    db.add_all([global_rule, personal_rule, other_personal])
    db.commit()
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memuser", "user123")
        response = await client.get(
            "/api/memory-rules",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        titles = {r["title"] for r in data}
        assert "Global Rule" in titles
        assert "Personal Rule" in titles
        assert "Admin Personal" not in titles

    _cleanup_memory_rules()


@pytest.mark.asyncio
async def test_list_memory_rules_admin_sees_all(admin_user, regular_user):
    from backend.main import app

    db = SessionLocal()
    global_rule = MemoryRule(
        rule_type="positive",
        scope="global",
        title="Global Rule",
        is_active=True,
        created_by=admin_user.id,
    )
    personal_rule = MemoryRule(
        rule_type="negative",
        scope="personal",
        owner_id=regular_user.id,
        title="Personal Rule",
        is_active=True,
        created_by=regular_user.id,
    )
    db.add_all([global_rule, personal_rule])
    db.commit()
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memadmin", "admin123")
        response = await client.get(
            "/api/memory-rules",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        titles = {r["title"] for r in data}
        assert "Global Rule" in titles
        assert "Personal Rule" in titles

    _cleanup_memory_rules()


@pytest.mark.asyncio
async def test_list_memory_rules_filter_by_scope(admin_user, regular_user):
    from backend.main import app

    db = SessionLocal()
    global_rule = MemoryRule(
        rule_type="positive",
        scope="global",
        title="Global Rule",
        is_active=True,
        created_by=admin_user.id,
    )
    personal_rule = MemoryRule(
        rule_type="negative",
        scope="personal",
        owner_id=regular_user.id,
        title="Personal Rule",
        is_active=True,
        created_by=regular_user.id,
    )
    db.add_all([global_rule, personal_rule])
    db.commit()
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memadmin", "admin123")
        response = await client.get(
            "/api/memory-rules?scope=global",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert all(r["scope"] == "global" for r in data)

    _cleanup_memory_rules()


@pytest.mark.asyncio
async def test_create_personal_rule(regular_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memuser", "user123")
        response = await client.post(
            "/api/memory-rules",
            params={
                "rule_type": "positive",
                "scope": "personal",
                "title": "My Personal Rule",
                "file_pattern": "*.py",
                "code_pattern": "eval(",
                "vuln_type_filter": "code_injection",
                "description": "Detect eval usage",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["rule_type"] == "positive"
        assert data["scope"] == "personal"
        assert data["owner_id"] == regular_user.id
        assert data["is_active"] is True
        assert data["title"] == "My Personal Rule"

        rule_id = data["id"]
        db = SessionLocal()
        db.query(MemoryRule).filter(MemoryRule.id == rule_id).delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_create_global_rule_pending(regular_user):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memuser", "user123")
        response = await client.post(
            "/api/memory-rules",
            params={
                "rule_type": "negative",
                "scope": "global",
                "title": "Global Pending Rule",
                "file_pattern": "*.js",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["scope"] == "global"
        assert data["owner_id"] is None
        assert data["is_active"] is False

        rule_id = data["id"]
        db = SessionLocal()
        db.query(MemoryRule).filter(MemoryRule.id == rule_id).delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_approve_memory_rule_as_committer(committer_user):
    from backend.main import app

    db = SessionLocal()
    rule = MemoryRule(
        rule_type="positive",
        scope="global",
        title="Pending Rule",
        is_active=False,
        created_by=committer_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule_id = rule.id
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memcommitter", "committer123")
        response = await client.post(
            f"/api/memory-rules/{rule_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] is True
        assert data["approved_by"] == committer_user.id
        assert data["approved_at"] is not None

    db = SessionLocal()
    db.query(MemoryRule).filter(MemoryRule.id == rule_id).delete()
    db.commit()
    db.close()


@pytest.mark.asyncio
async def test_user_cannot_approve_rule(regular_user):
    from backend.main import app

    db = SessionLocal()
    rule = MemoryRule(
        rule_type="positive",
        scope="global",
        title="Pending Rule",
        is_active=False,
        created_by=regular_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule_id = rule.id
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memuser", "user123")
        response = await client.post(
            f"/api/memory-rules/{rule_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    db = SessionLocal()
    db.query(MemoryRule).filter(MemoryRule.id == rule_id).delete()
    db.commit()
    db.close()


@pytest.mark.asyncio
async def test_delete_own_personal_rule(regular_user):
    from backend.main import app

    db = SessionLocal()
    rule = MemoryRule(
        rule_type="positive",
        scope="personal",
        owner_id=regular_user.id,
        title="My Rule",
        is_active=True,
        created_by=regular_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule_id = rule.id
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memuser", "user123")
        response = await client.delete(
            f"/api/memory-rules/{rule_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 204

    db = SessionLocal()
    deleted = db.query(MemoryRule).filter(MemoryRule.id == rule_id).first()
    db.close()
    assert deleted is None


@pytest.mark.asyncio
async def test_user_cannot_delete_others_personal_rule(admin_user, regular_user):
    from backend.main import app

    db = SessionLocal()
    rule = MemoryRule(
        rule_type="positive",
        scope="personal",
        owner_id=admin_user.id,
        title="Admin Personal Rule",
        is_active=True,
        created_by=admin_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule_id = rule.id
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memuser", "user123")
        response = await client.delete(
            f"/api/memory-rules/{rule_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    db = SessionLocal()
    db.query(MemoryRule).filter(MemoryRule.id == rule_id).delete()
    db.commit()
    db.close()


@pytest.mark.asyncio
async def test_admin_can_delete_any_rule(admin_user, regular_user):
    from backend.main import app

    db = SessionLocal()
    rule = MemoryRule(
        rule_type="positive",
        scope="personal",
        owner_id=regular_user.id,
        title="User Rule",
        is_active=True,
        created_by=regular_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule_id = rule.id
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "memadmin", "admin123")
        response = await client.delete(
            f"/api/memory-rules/{rule_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 204

    db = SessionLocal()
    deleted = db.query(MemoryRule).filter(MemoryRule.id == rule_id).first()
    db.close()
    assert deleted is None
