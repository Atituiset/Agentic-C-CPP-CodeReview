import os

os.environ.setdefault("SECRET_KEY", "test-secret")

import pytest
from httpx import AsyncClient, ASGITransport

from backend.database import SessionLocal
from backend.models.orm import User, Vulnerability, MemoryRule
from backend.services.auth_service import hash_password


@pytest.fixture
def admin_user():
    db = SessionLocal()
    user = User(
        username="vulnadmin",
        display_name="Vuln Admin",
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
        username="committer",
        display_name="Committer",
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
        username="vulnuser",
        display_name="Vuln User",
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


@pytest.fixture
def sample_vulnerability(admin_user):
    db = SessionLocal()
    vuln = Vulnerability(
        job_id="job-123",
        vuln_id="VULN-001",
        file_path="src/main.c",
        severity="High",
        vuln_type="buffer_overflow",
        title="Buffer overflow in main.c",
        description="Potential buffer overflow",
        status="open",
    )
    db.add(vuln)
    db.commit()
    vuln_id = vuln.id
    db.close()
    yield vuln
    db = SessionLocal()
    db.query(Vulnerability).filter(Vulnerability.id == vuln_id).delete()
    db.commit()
    db.close()


async def _login(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_list_vulnerabilities_as_admin(admin_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnadmin", "admin123")
        response = await client.get(
            "/api/vulnerabilities",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any(v["vuln_id"] == "VULN-001" for v in data)


@pytest.mark.asyncio
async def test_list_vulnerabilities_filter_by_status(admin_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnadmin", "admin123")
        response = await client.get(
            "/api/vulnerabilities?status=open",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert all(v["status"] == "open" for v in data)


@pytest.mark.asyncio
async def test_list_vulnerabilities_filter_by_severity(admin_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnadmin", "admin123")
        response = await client.get(
            "/api/vulnerabilities?severity=High",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert all(v["severity"] == "High" for v in data)


@pytest.mark.asyncio
async def test_user_sees_only_assigned_vulnerabilities(admin_user, regular_user, sample_vulnerability):
    from backend.main import app

    db = SessionLocal()
    sample_vulnerability.assigned_to = regular_user.id
    db.add(sample_vulnerability)
    db.commit()
    db.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnuser", "user123")
        response = await client.get(
            "/api/vulnerabilities",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert all(v["assigned_to"] == regular_user.id for v in data)


@pytest.mark.asyncio
async def test_get_vulnerability_detail(admin_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnadmin", "admin123")
        response = await client.get(
            f"/api/vulnerabilities/{sample_vulnerability.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["vuln_id"] == "VULN-001"
        assert data["severity"] == "High"


@pytest.mark.asyncio
async def test_accept_vulnerability_as_committer(committer_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "committer", "committer123")
        response = await client.post(
            f"/api/vulnerabilities/{sample_vulnerability.id}/accept",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "accepted"
        assert data["accepted_by"] == committer_user.id
        assert data["accepted_at"] is not None

        db = SessionLocal()
        rule = db.query(MemoryRule).filter(MemoryRule.source_vuln_id == sample_vulnerability.id).first()
        db.close()
        assert rule is not None
        assert rule.rule_type == "positive"
        assert rule.scope == "global"
        assert rule.is_active is False

        # Cleanup rule
        db = SessionLocal()
        db.query(MemoryRule).filter(MemoryRule.source_vuln_id == sample_vulnerability.id).delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_reject_vulnerability_as_admin(admin_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnadmin", "admin123")
        response = await client.post(
            f"/api/vulnerabilities/{sample_vulnerability.id}/reject",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "rejected"
        assert data["rejected_by"] == admin_user.id
        assert data["rejected_at"] is not None

        db = SessionLocal()
        rule = db.query(MemoryRule).filter(MemoryRule.source_vuln_id == sample_vulnerability.id).first()
        db.close()
        assert rule is not None
        assert rule.rule_type == "negative"
        assert rule.scope == "global"
        assert rule.is_active is False

        # Cleanup rule
        db = SessionLocal()
        db.query(MemoryRule).filter(MemoryRule.source_vuln_id == sample_vulnerability.id).delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_user_cannot_accept_vulnerability(regular_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnuser", "user123")
        response = await client.post(
            f"/api/vulnerabilities/{sample_vulnerability.id}/accept",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_assign_vulnerability(admin_user, regular_user, sample_vulnerability):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _login(client, "vulnadmin", "admin123")
        response = await client.post(
            f"/api/vulnerabilities/{sample_vulnerability.id}/assign?user_id={regular_user.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["assigned_to"] == regular_user.id
