from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.orm import MemoryRule, User
from backend.routers.auth import get_current_user, require_role

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/api/memory-rules")
def list_memory_rules(
    scope: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(MemoryRule)

    if user.role in ("admin", "committer"):
        if scope:
            query = query.filter(MemoryRule.scope == scope)
    else:
        query = query.filter(
            (MemoryRule.scope == "global") | (MemoryRule.owner_id == user.id)
        )
        if scope:
            query = query.filter(MemoryRule.scope == scope)

    return query.order_by(MemoryRule.created_at.desc()).all()


@router.post("/api/memory-rules", status_code=status.HTTP_201_CREATED)
def create_memory_rule(
    rule_type: str,
    scope: str,
    title: str,
    file_pattern: Optional[str] = None,
    code_pattern: Optional[str] = None,
    vuln_type_filter: Optional[str] = None,
    description: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if scope not in ("personal", "global"):
        raise HTTPException(status_code=400, detail="scope must be 'personal' or 'global'")

    if rule_type not in ("positive", "negative"):
        raise HTTPException(status_code=400, detail="rule_type must be 'positive' or 'negative'")

    if scope == "personal":
        owner_id = user.id
        is_active = True
    else:
        owner_id = None
        is_active = False

    rule = MemoryRule(
        rule_type=rule_type,
        scope=scope,
        owner_id=owner_id,
        file_pattern=file_pattern,
        code_pattern=code_pattern,
        vuln_type_filter=vuln_type_filter,
        title=title,
        description=description,
        is_active=is_active,
        created_by=user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.post("/api/memory-rules/{rule_id}/approve")
def approve_memory_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "committer")),
):
    rule = db.query(MemoryRule).filter(MemoryRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Memory rule not found")

    rule.is_active = True
    rule.approved_at = datetime.now(timezone.utc)
    rule.approved_by = user.id
    db.commit()
    db.refresh(rule)
    return rule


@router.post("/api/memory-rules/{rule_id}/submit-global")
def submit_memory_rule_global(
    rule_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit a personal memory rule for global approval."""
    rule = db.query(MemoryRule).filter(MemoryRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Memory rule not found")

    if rule.scope != "personal" or rule.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Can only submit your own personal rules")

    # Check if already submitted
    existing = db.query(MemoryRule).filter(
        MemoryRule.scope == "global",
        MemoryRule.title == rule.title,
        MemoryRule.created_by == user.id,
    ).first()
    if existing:
        return {"ok": True, "message": "Already submitted", "global_rule": existing}

    global_rule = MemoryRule(
        rule_type=rule.rule_type,
        scope="global",
        owner_id=None,
        file_pattern=rule.file_pattern,
        code_pattern=rule.code_pattern,
        vuln_type_filter=rule.vuln_type_filter,
        title=rule.title,
        description=rule.description,
        is_active=False,
        created_by=user.id,
    )
    db.add(global_rule)
    db.commit()
    db.refresh(global_rule)
    return {"ok": True, "global_rule": global_rule}


@router.delete("/api/memory-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rule = db.query(MemoryRule).filter(MemoryRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Memory rule not found")

    if user.role == "admin":
        can_delete = True
    else:
        can_delete = rule.scope == "personal" and rule.owner_id == user.id

    if not can_delete:
        raise HTTPException(status_code=403, detail="Not authorized to delete this rule")

    db.delete(rule)
    db.commit()
    return None
