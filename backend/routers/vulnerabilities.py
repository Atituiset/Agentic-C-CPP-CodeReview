from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.orm import Vulnerability, MemoryRule, User
from backend.models.schemas import VulnerabilityResponse
from backend.routers.auth import get_current_user, require_role

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/api/vulnerabilities", response_model=List[VulnerabilityResponse])
def list_vulnerabilities(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Vulnerability)

    if user.role not in ("admin", "committer"):
        query = query.filter(Vulnerability.assigned_to == user.id)

    if status:
        query = query.filter(Vulnerability.status == status)
    if severity:
        query = query.filter(Vulnerability.severity == severity)

    return query.order_by(Vulnerability.generated_at.desc()).all()


@router.get("/api/vulnerabilities/{vuln_id}", response_model=VulnerabilityResponse)
def get_vulnerability(
    vuln_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    vuln = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    if user.role not in ("admin", "committer") and vuln.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this vulnerability")

    return vuln


@router.post("/api/vulnerabilities/{vuln_id}/accept", response_model=VulnerabilityResponse)
def accept_vulnerability(
    vuln_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "committer")),
):
    vuln = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    vuln.status = "accepted"
    vuln.accepted_at = datetime.now(timezone.utc)
    vuln.accepted_by = user.id

    rule = MemoryRule(
        source_vuln_id=vuln.id,
        rule_type="positive",
        scope="global",
        file_pattern=vuln.file_path,
        vuln_type_filter=vuln.vuln_type,
        title=f"Positive rule from {vuln.vuln_id}",
        description=vuln.description,
        is_active=False,
        created_by=user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(vuln)
    return vuln


@router.post("/api/vulnerabilities/{vuln_id}/reject", response_model=VulnerabilityResponse)
def reject_vulnerability(
    vuln_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "committer")),
):
    vuln = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    vuln.status = "rejected"
    vuln.rejected_at = datetime.now(timezone.utc)
    vuln.rejected_by = user.id

    rule = MemoryRule(
        source_vuln_id=vuln.id,
        rule_type="negative",
        scope="global",
        file_pattern=vuln.file_path,
        vuln_type_filter=vuln.vuln_type,
        title=f"Negative rule from {vuln.vuln_id}",
        description=vuln.description,
        is_active=False,
        created_by=user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(vuln)
    return vuln


@router.post("/api/vulnerabilities/{vuln_id}/assign", response_model=VulnerabilityResponse)
def assign_vulnerability(
    vuln_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "committer")),
):
    vuln = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    vuln.assigned_to = user_id
    db.commit()
    db.refresh(vuln)
    return vuln
