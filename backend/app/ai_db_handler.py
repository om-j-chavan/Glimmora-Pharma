# app/ai_db_handler.py
# ─────────────────────────────────────────────────────────────
# Updated for Step 7 — ALL queries filtered by customer_id
# ─────────────────────────────────────────────────────────────

from sqlalchemy.orm import Session
from app.models.capa_model import (
    CAPA,
    RCA,
    ActionPlan,
    ImplementationMonitoring,
    EffectivenessCheck,
    CAPAClosure,
)


# ── Main router ───────────────────────────────────────────────
def handle_db_query(user_message: str, db: Session, customer_id: str = None) -> str:
    msg = user_message.lower()

    if "closure" in msg or "close" in msg or "closed" in msg:
        return query_closure(msg, db, customer_id)
    elif "effectiveness" in msg or "effective" in msg:
        return query_effectiveness(msg, db, customer_id)
    elif "monitor" in msg:
        return query_monitoring(msg, db, customer_id)
    elif "action plan" in msg or "action" in msg:
        return query_action_plan(msg, db, customer_id)
    elif "rca" in msg or "root cause" in msg:
        return query_rca(msg, db, customer_id)
    elif "capa" in msg:
        return query_capa(msg, db, customer_id)
    else:
        return (
            "I could not identify which module to query. "
            "Please mention CAPA, RCA, Action Plan, Monitoring, Effectiveness, or Closure."
        )


# ── Helper: base query filtered by customer_id ────────────────
def base(db, Model, customer_id):
    """Returns a query filtered by customer_id if provided."""
    q = db.query(Model)
    if customer_id:
        q = q.filter(Model.customer_id == customer_id)
    return q


# ── CAPA ──────────────────────────────────────────────────────
def query_capa(msg: str, db: Session, customer_id: str) -> str:
    total = base(db, CAPA, customer_id).count()

    if "open" in msg:
        count = base(db, CAPA, customer_id).filter(CAPA.status == "Open").count()
        return f"Open CAPA records: {count} out of {total} total."

    elif "closed" in msg or "close" in msg:
        count = base(db, CAPA, customer_id).filter(CAPA.status == "Closed").count()
        return f"Closed CAPA records: {count} out of {total} total."

    elif "recurring" in msg or "recur" in msg:
        count = base(db, CAPA, customer_id).filter(CAPA.is_recurring == True).count()
        return f"Recurring CAPA records: {count} out of {total} total."

    elif "high risk" in msg or "risk" in msg:
        count = base(db, CAPA, customer_id).filter(CAPA.risk_score >= 7.0).count()
        return f"High risk CAPAs (score ≥ 7): {count} out of {total} total."

    elif "source" in msg:
        from sqlalchemy import func
        rows = (
            base(db, CAPA, customer_id)
            .with_entities(CAPA.source, func.count(CAPA.capa_id))
            .group_by(CAPA.source)
            .all()
        )
        lines = [f"  {source}: {count}" for source, count in rows]
        return "CAPA count by source:\n" + "\n".join(lines)

    elif "area" in msg:
        from sqlalchemy import func
        rows = (
            base(db, CAPA, customer_id)
            .with_entities(CAPA.area_affected, func.count(CAPA.capa_id))
            .group_by(CAPA.area_affected)
            .all()
        )
        lines = [f"  {area}: {count}" for area, count in rows]
        return "CAPA count by area:\n" + "\n".join(lines)

    elif "severity" in msg:
        from sqlalchemy import func
        rows = (
            base(db, CAPA, customer_id)
            .with_entities(CAPA.initial_severity, func.count(CAPA.capa_id))
            .group_by(CAPA.initial_severity)
            .all()
        )
        lines = [f"  {sev}: {count}" for sev, count in rows]
        return "CAPA count by severity:\n" + "\n".join(lines)

    elif "list" in msg or "show" in msg or "all" in msg:
        records = (
            base(db, CAPA, customer_id)
            .order_by(CAPA.created_at.desc())
            .limit(10)
            .all()
        )
        if not records:
            return "No CAPA records found."
        lines = [
            f"  - {r.capa_id} | {r.source} | {r.area_affected} | Severity: {r.initial_severity} | Status: {r.status}"
            for r in records
        ]
        return "Latest 10 CAPA records:\n" + "\n".join(lines)

    else:
        open_count   = base(db, CAPA, customer_id).filter(CAPA.status == "Open").count()
        closed_count = base(db, CAPA, customer_id).filter(CAPA.status == "Closed").count()
        recurring    = base(db, CAPA, customer_id).filter(CAPA.is_recurring == True).count()
        return (
            f"CAPA Summary — Total: {total} | Open: {open_count} | "
            f"Closed: {closed_count} | Recurring: {recurring}."
        )


# ── RCA ───────────────────────────────────────────────────────
def query_rca(msg: str, db: Session, customer_id: str) -> str:
    total = base(db, RCA, customer_id).count()

    if "quality" in msg or "score" in msg:
        from sqlalchemy import func
        avg = base(db, RCA, customer_id).with_entities(func.avg(RCA.rca_quality_score)).scalar() or 0
        return f"Average RCA quality score: {avg:.2f} out of {total} total RCAs."

    elif "risk" in msg or "recurrence" in msg:
        count = base(db, RCA, customer_id).filter(RCA.recurrence_risk == "High").count()
        return f"RCAs with High recurrence risk: {count} out of {total} total."

    elif "method" in msg:
        from sqlalchemy import func
        rows = (
            base(db, RCA, customer_id)
            .with_entities(RCA.rca_method, func.count(RCA.rca_id))
            .group_by(RCA.rca_method)
            .all()
        )
        lines = [f"  {method}: {count}" for method, count in rows]
        return "RCA count by method:\n" + "\n".join(lines)

    elif "list" in msg or "show" in msg or "all" in msg:
        records = base(db, RCA, customer_id).order_by(RCA.created_at.desc()).limit(10).all()
        if not records:
            return "No RCA records found."
        lines = [
            f"  - {r.rca_id} | Method: {r.rca_method} | Rating: {r.quality_rating} | Risk: {r.recurrence_risk}"
            for r in records
        ]
        return "Latest 10 RCA records:\n" + "\n".join(lines)

    else:
        from sqlalchemy import func
        avg      = base(db, RCA, customer_id).with_entities(func.avg(RCA.rca_quality_score)).scalar() or 0
        high_risk = base(db, RCA, customer_id).filter(RCA.recurrence_risk == "High").count()
        return f"RCA Summary — Total: {total} | Avg Score: {avg:.2f} | High Risk: {high_risk}."


# ── ACTION PLAN ───────────────────────────────────────────────
def query_action_plan(msg: str, db: Session, customer_id: str) -> str:
    total = base(db, ActionPlan, customer_id).count()

    if "cosmetic" in msg:
        count = base(db, ActionPlan, customer_id).filter(ActionPlan.is_cosmetic_capa == True).count()
        return f"Cosmetic CAPA action plans: {count} out of {total} total."

    elif "rating" in msg:
        from sqlalchemy import func
        rows = (
            base(db, ActionPlan, customer_id)
            .with_entities(ActionPlan.overall_plan_rating, func.count(ActionPlan.action_plan_id))
            .group_by(ActionPlan.overall_plan_rating)
            .all()
        )
        lines = [f"  {rating}: {count}" for rating, count in rows]
        return "Action Plans by rating:\n" + "\n".join(lines)

    elif "list" in msg or "show" in msg or "all" in msg:
        records = base(db, ActionPlan, customer_id).order_by(ActionPlan.created_at.desc()).limit(10).all()
        if not records:
            return "No Action Plan records found."
        lines = [
            f"  - {r.action_plan_id} | CAPA: {r.capa_id} | Rating: {r.overall_plan_rating}"
            for r in records
        ]
        return "Latest 10 Action Plans:\n" + "\n".join(lines)

    else:
        cosmetic = base(db, ActionPlan, customer_id).filter(ActionPlan.is_cosmetic_capa == True).count()
        return f"Action Plan Summary — Total: {total} | Cosmetic CAPAs: {cosmetic}."


# ── MONITORING ────────────────────────────────────────────────
def query_monitoring(msg: str, db: Session, customer_id: str) -> str:
    total = base(db, ImplementationMonitoring, customer_id).count()

    if "overdue" in msg:
        from sqlalchemy import func
        val = base(db, ImplementationMonitoring, customer_id).with_entities(
            func.sum(ImplementationMonitoring.overdue_count)
        ).scalar() or 0
        return f"Total overdue actions: {val}."

    elif "completed" in msg or "done" in msg:
        from sqlalchemy import func
        val = base(db, ImplementationMonitoring, customer_id).with_entities(
            func.sum(ImplementationMonitoring.completed_count)
        ).scalar() or 0
        return f"Total completed actions: {val}."

    elif "on track" in msg:
        from sqlalchemy import func
        val = base(db, ImplementationMonitoring, customer_id).with_entities(
            func.sum(ImplementationMonitoring.on_track_count)
        ).scalar() or 0
        return f"Total on-track actions: {val}."

    elif "list" in msg or "show" in msg or "all" in msg:
        records = base(db, ImplementationMonitoring, customer_id).order_by(
            ImplementationMonitoring.created_at.desc()
        ).limit(10).all()
        if not records:
            return "No monitoring records found."
        lines = [
            f"  - {r.monitoring_id} | CAPA: {r.capa_id} | "
            f"Overdue: {r.overdue_count} | Completed: {r.completed_count} | Status: {r.overall_capa_status}"
            for r in records
        ]
        return "Latest 10 Monitoring records:\n" + "\n".join(lines)

    else:
        from sqlalchemy import func
        overdue   = base(db, ImplementationMonitoring, customer_id).with_entities(func.sum(ImplementationMonitoring.overdue_count)).scalar() or 0
        completed = base(db, ImplementationMonitoring, customer_id).with_entities(func.sum(ImplementationMonitoring.completed_count)).scalar() or 0
        on_track  = base(db, ImplementationMonitoring, customer_id).with_entities(func.sum(ImplementationMonitoring.on_track_count)).scalar() or 0
        return (
            f"Monitoring Summary — Total: {total} | "
            f"Overdue: {overdue} | On-track: {on_track} | Completed: {completed}."
        )


# ── EFFECTIVENESS ─────────────────────────────────────────────
def query_effectiveness(msg: str, db: Session, customer_id: str) -> str:
    total = base(db, EffectivenessCheck, customer_id).count()

    if "can be closed" in msg or "ready" in msg:
        count = base(db, EffectivenessCheck, customer_id).filter(EffectivenessCheck.capa_can_be_closed == True).count()
        return f"CAPAs ready to be closed: {count} out of {total}."

    elif "new issue" in msg or "recurrence" in msg:
        count = base(db, EffectivenessCheck, customer_id).filter(EffectivenessCheck.new_issues_reported == True).count()
        return f"Effectiveness checks with new issues: {count} out of {total}."

    elif "score" in msg or "average" in msg:
        from sqlalchemy import func
        avg = base(db, EffectivenessCheck, customer_id).with_entities(func.avg(EffectivenessCheck.effectiveness_score)).scalar() or 0
        return f"Average effectiveness score: {avg:.2f} across {total} checks."

    elif "rating" in msg:
        from sqlalchemy import func
        rows = (
            base(db, EffectivenessCheck, customer_id)
            .with_entities(EffectivenessCheck.effectiveness_rating, func.count(EffectivenessCheck.effectiveness_id))
            .group_by(EffectivenessCheck.effectiveness_rating)
            .all()
        )
        lines = [f"  {rating}: {count}" for rating, count in rows]
        return "Effectiveness by rating:\n" + "\n".join(lines)

    else:
        from sqlalchemy import func
        avg        = base(db, EffectivenessCheck, customer_id).with_entities(func.avg(EffectivenessCheck.effectiveness_score)).scalar() or 0
        can_close  = base(db, EffectivenessCheck, customer_id).filter(EffectivenessCheck.capa_can_be_closed == True).count()
        new_issues = base(db, EffectivenessCheck, customer_id).filter(EffectivenessCheck.new_issues_reported == True).count()
        return (
            f"Effectiveness Summary — Total: {total} | Avg Score: {avg:.2f} | "
            f"Ready to Close: {can_close} | New Issues: {new_issues}."
        )


# ── CLOSURE ───────────────────────────────────────────────────
def query_closure(msg: str, db: Session, customer_id: str) -> str:
    total = base(db, CAPAClosure, customer_id).count()

    if "ai approved" in msg or "ai_closure" in msg:
        count = base(db, CAPAClosure, customer_id).filter(CAPAClosure.ai_closure_approved == True).count()
        return f"AI-approved closures: {count} out of {total}."

    elif "training" in msg:
        count = base(db, CAPAClosure, customer_id).filter(CAPAClosure.training_records_verified == True).count()
        return f"Closures with training verified: {count} out of {total}."

    elif "document" in msg:
        count = base(db, CAPAClosure, customer_id).filter(CAPAClosure.document_changes_approved == True).count()
        return f"Closures with documents approved: {count} out of {total}."

    elif "status" in msg or "final" in msg:
        from sqlalchemy import func
        rows = (
            base(db, CAPAClosure, customer_id)
            .with_entities(CAPAClosure.capa_final_status, func.count(CAPAClosure.closure_id))
            .group_by(CAPAClosure.capa_final_status)
            .all()
        )
        lines = [f"  {status}: {count}" for status, count in rows]
        return "Closures by final status:\n" + "\n".join(lines)

    elif "list" in msg or "show" in msg or "all" in msg:
        records = base(db, CAPAClosure, customer_id).order_by(CAPAClosure.created_at.desc()).limit(10).all()
        if not records:
            return "No closure records found."
        lines = [
            f"  - {r.closure_id} | CAPA: {r.capa_id} | Status: {r.capa_final_status} | AI Approved: {r.ai_closure_approved}"
            for r in records
        ]
        return "Latest 10 Closure records:\n" + "\n".join(lines)

    else:
        ai_approved = base(db, CAPAClosure, customer_id).filter(CAPAClosure.ai_closure_approved == True).count()
        training_ok = base(db, CAPAClosure, customer_id).filter(CAPAClosure.training_records_verified == True).count()
        docs_ok     = base(db, CAPAClosure, customer_id).filter(CAPAClosure.document_changes_approved == True).count()
        return (
            f"Closure Summary — Total: {total} | AI Approved: {ai_approved} | "
            f"Training Verified: {training_ok} | Docs Approved: {docs_ok}."
        )