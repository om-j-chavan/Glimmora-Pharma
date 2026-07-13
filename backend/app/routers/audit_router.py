import os
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, JSON, DateTime
from sqlalchemy.sql import func
from app.database.db import Base, get_db
from app.routers.auth_router import verify_token

# ── Audit Model ───────────────────────────────────────────────
class AIAuditTrail(Base):
    __tablename__ = "ai_audit_trail"

    audit_id      = Column(String, primary_key=True)
    action_type   = Column(String)   # create_capa, submit_rca, etc.
    feature_id    = Column(String)   # AI-100, AI-101, etc.
    record_id     = Column(String)   # CAPA ID, RCA ID etc.
    username      = Column(String)   # who did it
    input_data    = Column(JSON)     # what was sent
    output_data   = Column(JSON)     # what AI returned
    status        = Column(String)   # success / failed
    timestamp     = Column(DateTime, default=func.now())
    ip_address    = Column(String, nullable=True)

router = APIRouter(prefix="/api/v1/audit", tags=["Audit Trail"])

# ── Helper function — call this from every router ─────────────
def create_audit_log(
    db:          Session,
    action_type: str,
    feature_id:  str,
    record_id:   str,
    username:    str,
    input_data:  dict,
    output_data: dict,
    status:      str = "success"
):
    from datetime import datetime
    import uuid
    audit = AIAuditTrail(
        audit_id    = f"AUDIT-{datetime.now().strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:8]}",
        action_type = action_type,
        feature_id  = feature_id,
        record_id   = record_id,
        username    = username,
        input_data  = input_data,
        output_data = output_data,
        status      = status,
        timestamp   = datetime.now()
    )
    db.add(audit)
    db.commit()
    return audit.audit_id

# ── GET /api/v1/audit/all ─────────────────────────────────────
@router.get("/all", summary="Get all AI Audit Logs")
def get_all_audit_logs(
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    rows = db.query(AIAuditTrail).order_by(
        AIAuditTrail.timestamp.desc()
    ).all()
    return {
        "total": len(rows),
        "audit_logs": [
            {
                "audit_id":    r.audit_id,
                "action_type": r.action_type,
                "feature_id":  r.feature_id,
                "record_id":   r.record_id,
                "username":    r.username,
                "status":      r.status,
                "timestamp":   r.timestamp,
            }
            for r in rows
        ]
    }

# ── GET /api/v1/audit/record/{record_id} ─────────────────────
@router.get("/record/{record_id}", summary="Get Audit Logs by Record ID")
def get_audit_by_record(
    record_id: str,
    db:        Session = Depends(get_db),
    username:  str     = Depends(verify_token)
):
    rows = db.query(AIAuditTrail).filter(
        AIAuditTrail.record_id == record_id
    ).order_by(AIAuditTrail.timestamp.desc()).all()
    return {
        "record_id": record_id,
        "total":     len(rows),
        "audit_logs": [
            {
                "audit_id":    r.audit_id,
                "action_type": r.action_type,
                "feature_id":  r.feature_id,
                "username":    r.username,
                "input_data":  r.input_data,
                "output_data": r.output_data,
                "status":      r.status,
                "timestamp":   r.timestamp,
            }
            for r in rows
        ]
    }