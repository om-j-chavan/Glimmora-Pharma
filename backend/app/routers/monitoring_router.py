from app.routers.auth_router import verify_token
import os
import json
import re
from datetime import datetime, date
from typing import List, Optional

from openai import OpenAI
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database.db import get_db
from app.models.capa_model import ImplementationMonitoring, CAPA, ActionPlan
from app.schemas.capa_schema import (
    MonitoringRequest, MonitoringResponse, ActionMonitoringResult
)

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/v1/monitoring", tags=["Implementation Monitoring"])


# ── Monitoring ID generator ───────────────────────────────────
def _next_monitoring_id(db: Session) -> str:
    last = db.query(ImplementationMonitoring).order_by(
        ImplementationMonitoring.monitoring_id.desc()
    ).first()
    if last:
        try:
            last_num = int(last.monitoring_id.split("-")[-1])
        except (ValueError, IndexError, AttributeError):
            last_num = 400
    else:
        last_num = 400
    return f"MON-{datetime.now().year}-{last_num + 1:03d}"


# ── Calculate days remaining ──────────────────────────────────
def _days_remaining(due_date_str: str) -> int:
    try:
        due = datetime.strptime(due_date_str, "%Y-%m-%d").date()
        today = date.today()
        return (due - today).days
    except (ValueError, TypeError):
        return 0


# ── Escalation logic ──────────────────────────────────────────
def _get_escalation_level(
    days_remaining: int,
    status: str,
    severity: str
) -> Optional[str]:
    if status == "Completed":
        return None
    if days_remaining < -7:
        return "🔴 Escalate to Site Head"
    elif days_remaining < -3 and severity == "Critical":
        return "🔴 Escalate to Site Head"
    elif days_remaining < -3:
        return "🟠 Escalate to QA Head"
    elif days_remaining < 0:
        return "🟡 Escalate to QA Manager"
    elif days_remaining <= 2 and status == "In Progress":
        return "🟡 Warning — Due Soon"
    return None


# ── AI Monitoring Analysis ────────────────────────────────────
def _ai_monitoring_analysis(
    capa_id: str,
    problem: str,
    actions_summary: str,
    overdue_count: int,
    on_track_count: int,
    completed_count: int,
    escalation_alerts: List[str]
) -> dict:

    prompt = f"""
You are a pharmaceutical QA AI monitoring CAPA implementation progress.

CAPA ID: {capa_id}
Problem: {problem}

ACTIONS PROGRESS SUMMARY:
{actions_summary}

COUNTS:
- Total Overdue: {overdue_count}
- On Track: {on_track_count}
- Completed: {completed_count}

ESCALATION ALERTS:
{json.dumps(escalation_alerts)}

Analyze the implementation progress and return ONLY this exact JSON. No extra text. No markdown:
{{
  "overall_capa_status": "On Track" or "At Risk" or "Critical" or "Completed",
  "owner_accountability": [
    "Person A: X overdue actions",
    "Person B: Y actions due this week"
  ],
  "ai_monitoring_summary": "2-3 sentence summary of overall implementation health",
  "ai_recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ]
}}

Rules:
- overall_capa_status = Completed if all actions completed
- overall_capa_status = Critical if any action overdue > 7 days
- overall_capa_status = At Risk if any action overdue
- overall_capa_status = On Track if all actions on schedule
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = re.sub(r"```json|```", "", response.choices[0].message.content).strip()
    return json.loads(text)


# ── POST /api/v1/monitoring/check ─────────────────────────────
@router.post("/check", response_model=MonitoringResponse)
def check_monitoring(request: MonitoringRequest, db: Session = Depends(get_db),username: str     = Depends(verify_token)):
    """
    Stage 4 — Implementation Monitoring with AI Daily Check.

    AI Monitors:
    1. Due Date Tracking — On track / Overdue / Alert
    2. Owner Accountability — Who has overdue actions
    3. Escalation Triggers — Auto escalate based on overdue days
    """

    # ✅ Check API key
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set.")

    # Step 1 — Validate CAPA exists
    capa = db.query(CAPA).filter(CAPA.capa_id == request.capa_id).first()
    if not capa:
        raise HTTPException(
            status_code=404,
            detail=f"CAPA ID '{request.capa_id}' not found."
        )

    # Validate customer matches
    if capa.customer_id != request.customer_id:
        raise HTTPException(
            status_code=400,
            detail=f"Customer ID does not match CAPA."
        )

    # Validate Action Plan exists
    action_plan = db.query(ActionPlan).filter(
        ActionPlan.action_plan_id == request.action_plan_id
    ).first()
    if not action_plan:
        raise HTTPException(
            status_code=404,
            detail=f"Action Plan '{request.action_plan_id}' not found."
        )

    # Step 2 — Generate Monitoring ID
    monitoring_id = _next_monitoring_id(db)

    # Step 3 — Process each action
    action_results      = []
    escalation_alerts   = []
    overdue_count       = 0
    on_track_count      = 0
    completed_count     = 0
    actions_summary     = ""

    for action in request.action_updates:
        days = _days_remaining(action.due_date)
        is_overdue = days < 0 and action.status != "Completed"

        # Count statuses
        if action.status == "Completed":
            completed_count += 1
        elif is_overdue:
            overdue_count += 1
        else:
            on_track_count += 1

        # Get escalation level
        escalation = _get_escalation_level(
            days_remaining = days,
            status         = action.status,
            severity       = capa.initial_severity
        )

        if escalation:
            alert = f"{escalation} — '{action.action_description}' by {action.responsible_person}"
            escalation_alerts.append(alert)

        # Build action result
        action_results.append(ActionMonitoringResult(
            action_description = action.action_description,
            responsible_person = action.responsible_person,
            due_date           = action.due_date,
            status             = action.status,
            days_remaining     = days,
            is_overdue         = is_overdue,
            escalation_level   = escalation,
        ))

        # Build summary for AI
        actions_summary += (
            f"- {action.action_description} | "
            f"Owner: {action.responsible_person} | "
            f"Due: {action.due_date} | "
            f"Status: {action.status} | "
            f"Days remaining: {days} | "
            f"Note: {action.progress_note or 'None'}\n"
        )

    # Step 4 — AI Analysis
    try:
        ai = _ai_monitoring_analysis(
            capa_id            = request.capa_id,
            problem            = capa.problem_statement,
            actions_summary    = actions_summary,
            overdue_count      = overdue_count,
            on_track_count     = on_track_count,
            completed_count    = completed_count,
            escalation_alerts  = escalation_alerts,
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid response.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")

    overall_status = ai.get("overall_capa_status", "At Risk")

    # Step 5 — Save to DB
    db_mon = ImplementationMonitoring(
        monitoring_id       = monitoring_id,
        capa_id             = request.capa_id,
        customer_id         = request.customer_id,
        action_plan_id      = request.action_plan_id,
        action_updates      = [a.model_dump() for a in request.action_updates],
        overdue_count       = overdue_count,
        on_track_count      = on_track_count,
        completed_count     = completed_count,
        escalation_alerts   = escalation_alerts,
        overall_capa_status = overall_status,
        ai_result           = ai,
    )
    db.add(db_mon)

    # Update CAPA status
    capa.status = overall_status
    db.commit()
    db.refresh(db_mon)

    # Step 6 — Build message
    if overall_status == "Completed":
        message = f"✅ ALL ACTIONS COMPLETE — {monitoring_id}. CAPA ready for effectiveness check!"
    elif overall_status == "Critical":
        message = f"🔴 CRITICAL — {monitoring_id}. Actions severely overdue. Immediate escalation!"
    elif overall_status == "At Risk":
        message = f"🟠 AT RISK — {monitoring_id}. {overdue_count} action(s) overdue. Escalation triggered!"
    else:
        message = f"🟢 ON TRACK — {monitoring_id}. All actions progressing on schedule."

    return MonitoringResponse(
        monitoring_id         = monitoring_id,
        capa_id               = request.capa_id,
        customer_id           = request.customer_id,
        action_plan_id        = request.action_plan_id,
        total_actions         = len(request.action_updates),
        on_track_count        = on_track_count,
        overdue_count         = overdue_count,
        completed_count       = completed_count,
        action_results        = action_results,
        owner_accountability  = ai.get("owner_accountability", []),
        escalation_alerts     = escalation_alerts,
        overall_capa_status   = overall_status,
        ai_monitoring_summary = ai.get("ai_monitoring_summary", ""),
        ai_recommendations    = ai.get("ai_recommendations", []),
        message               = message,
        created_at            = db_mon.created_at,
    )


# ── GET /api/v1/monitoring/capa/{capa_id} ────────────────────
@router.get("/capa/{capa_id}", summary="Get Monitoring history by CAPA ID")
def get_monitoring_by_capa(capa_id: str, db: Session = Depends(get_db),username: str     = Depends(verify_token)):
    rows = db.query(ImplementationMonitoring).filter(
        ImplementationMonitoring.capa_id == capa_id
    ).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No monitoring records found for CAPA '{capa_id}'"
        )
    return {
        "capa_id": capa_id,
        "total":   len(rows),
        "monitoring_history": [
            {
                "monitoring_id":      r.monitoring_id,
                "overall_status":     r.overall_capa_status,
                "overdue_count":      r.overdue_count,
                "on_track_count":     r.on_track_count,
                "completed_count":    r.completed_count,
                "escalation_alerts":  r.escalation_alerts,
                "created_at":         r.created_at,
            }
            for r in rows
        ]
    }

# ── GET /api/v1/monitoring/status/{monitoring_id} ────────────
@router.get("/status/{monitoring_id}", summary="Get Stage 4 Monitoring Status")
def get_monitoring_status(
    monitoring_id: str,
    db:            Session = Depends(get_db),
    username:      str     = Depends(verify_token)
):
    mon = db.query(ImplementationMonitoring).filter(
        ImplementationMonitoring.monitoring_id == monitoring_id
    ).first()
    if not mon:
        raise HTTPException(
            status_code=404,
            detail=f"Monitoring '{monitoring_id}' not found."
        )

    return {
        "monitoring_id":       mon.monitoring_id,
        "capa_id":             mon.capa_id,
        "customer_id":         mon.customer_id,
        "action_plan_id":      mon.action_plan_id,
        "action_updates":      mon.action_updates,
        "total_actions":       len(mon.action_updates) if mon.action_updates else 0,
        "on_track_count":      mon.on_track_count,
        "overdue_count":       mon.overdue_count,
        "completed_count":     mon.completed_count,
        "escalation_alerts":   mon.escalation_alerts,
        "overall_capa_status": mon.overall_capa_status,
        "created_at":          mon.created_at,
        "stage":               "Stage 4 — Implementation Monitoring",
        "message":             f"✅ Monitoring {monitoring_id} status retrieved successfully."
    }