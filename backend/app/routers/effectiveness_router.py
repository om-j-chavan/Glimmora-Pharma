import os
import json
import re
from datetime import datetime
from typing import List, Optional

from openai import OpenAI
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database.db import get_db
from app.models.capa_model import EffectivenessCheck, CAPA, ActionPlan
from app.schemas.capa_schema import (
    EffectivenessRequest, EffectivenessResponse
)
from app.routers.auth_router import verify_token

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/v1/effectiveness", tags=["Effectiveness Check"])


# ── Effectiveness ID generator ────────────────────────────────
def _next_effectiveness_id(db: Session) -> str:
    last = db.query(EffectivenessCheck).order_by(
        EffectivenessCheck.effectiveness_id.desc()
    ).first()
    if last:
        try:
            last_num = int(last.effectiveness_id.split("-")[-1])
        except (ValueError, IndexError, AttributeError):
            last_num = 500
    else:
        last_num = 500
    return f"EFF-{datetime.now().year}-{last_num + 1:03d}"


# ── Calculate trend improvement ───────────────────────────────
def _calculate_trend_improvement(trend_data: list) -> Optional[float]:
    if not trend_data:
        return None
    improvements = []
    for t in trend_data:
        before = t.before_capa
        after  = t.after_capa
        if before > 0:
            improvement = ((before - after) / before) * 100
            improvements.append(improvement)
    if improvements:
        return round(sum(improvements) / len(improvements), 1)
    return None


# ── AI Effectiveness Analysis ─────────────────────────────────
def _ai_effectiveness_analysis(
    request: EffectivenessRequest,
    root_cause: str,
    trend_improvement: Optional[float]
) -> dict:

    # Build evidence summary
    evidence_summary = "\n".join([
        f"- {e.action_description}: "
        f"Completed={e.completed}, "
        f"Evidence={e.evidence_attached}, "
        f"Note={e.evidence_note or 'None'}"
        for e in request.evidence_items
    ])

    # Build trend summary
    trend_summary = "\n".join([
        f"- {t.metric_name}: "
        f"Before={t.before_capa}{t.unit}, "
        f"After={t.after_capa}{t.unit}"
        for t in request.trend_data
    ])

    prompt = f"""
You are a pharmaceutical QA AI expert performing CAPA Effectiveness Check.

CAPA ID: {request.capa_id}
ROOT CAUSE: {root_cause}
DAYS SINCE CAPA IMPLEMENTED: {request.days_since_capa}
NEW ISSUES REPORTED: {request.new_issues_reported}
NEW ISSUE DETAILS: {request.new_issue_details or 'None'}

EVIDENCE VERIFICATION:
{evidence_summary}

TREND DATA:
{trend_summary}
OVERALL TREND IMPROVEMENT: {trend_improvement}%

Perform effectiveness check and return ONLY this exact JSON. No extra text. No markdown:
{{
  "recurrence_check_result": "PASS" or "FAIL",
  "recurrence_check_details": "one sentence about recurrence status",
  "evidence_verified": true or false,
  "evidence_details": [
    "Training records attached - VERIFIED",
    "SOP revision approved - VERIFIED",
    "System change validated - PENDING"
  ],
  "evidence_gaps": [
    "gap 1 if any",
    "gap 2 if any"
  ],
  "trend_analysis_summary": "one sentence about trend improvement",
  "effectiveness_score": 0 to 100,
  "effectiveness_rating": "EFFECTIVE" or "PARTIALLY EFFECTIVE" or "INEFFECTIVE",
  "capa_can_be_closed": true or false,
  "closure_recommendation": "one sentence recommendation",
  "ai_summary": "2-3 sentence overall effectiveness summary",
  "ai_recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ]
}}

Scoring Rules:
- 80-100 = EFFECTIVE → CAPA can be closed
- 50-79  = PARTIALLY EFFECTIVE → needs more monitoring
- 0-49   = INEFFECTIVE → CAPA must be reopened
- capa_can_be_closed = true only if score >= 80
  AND recurrence_check_result = PASS
  AND evidence_verified = true
- If new issues reported → recurrence_check_result = FAIL
- If trend improvement > 70% → add to effectiveness score
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = re.sub(r"```json|```", "", response.choices[0].message.content).strip()
    return json.loads(text)


# ── POST /api/v1/effectiveness/check ─────────────────────────
@router.post("/check", response_model=EffectivenessResponse)
def check_effectiveness(
    request:  EffectivenessRequest,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    """
    Stage 5 — Effectiveness Check with AI Analysis.

    AI checks 3 things:
    1. Recurrence Check  — Has same issue happened again?
    2. Evidence Verification — Were actions completed with proof?
    3. Trend Analysis — Is the overall trend improving?
    """

    # ✅ Check API key
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set.")

    # Step 1 — Validate CAPA exists
    capa = db.query(CAPA).filter(CAPA.capa_id == request.capa_id).first()
    if not capa:
        raise HTTPException(
            status_code=404,
            detail=f"CAPA '{request.capa_id}' not found."
        )

    # Validate customer
    if capa.customer_id != request.customer_id:
        raise HTTPException(
            status_code=400,
            detail="Customer ID does not match CAPA."
        )

    # Validate Action Plan exists
    ap = db.query(ActionPlan).filter(
        ActionPlan.action_plan_id == request.action_plan_id
    ).first()
    if not ap:
        raise HTTPException(
            status_code=404,
            detail=f"Action Plan '{request.action_plan_id}' not found."
        )

    # Check minimum days
    if request.days_since_capa < 30:
        raise HTTPException(
            status_code=400,
            detail="Effectiveness check requires minimum 30 days after CAPA implementation."
        )

    # Step 2 — Generate ID
    effectiveness_id = _next_effectiveness_id(db)

    # Step 3 — Calculate trend improvement
    trend_improvement = _calculate_trend_improvement(request.trend_data)

    # Step 4 — Get root cause from RCA
    from app.models.capa_model import RCA
    rca = db.query(RCA).filter(RCA.capa_id == request.capa_id).first()
    root_cause = rca.root_cause if rca else "Root cause not found"

    # Step 5 — AI Analysis
    try:
        ai = _ai_effectiveness_analysis(
            request            = request,
            root_cause         = root_cause,
            trend_improvement  = trend_improvement,
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid response.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")

    # Step 6 — Save to DB
    db_eff = EffectivenessCheck(
        effectiveness_id     = effectiveness_id,
        capa_id              = request.capa_id,
        customer_id          = request.customer_id,
        action_plan_id       = request.action_plan_id,
        days_since_capa      = request.days_since_capa,
        evidence_items       = [e.model_dump() for e in request.evidence_items],
        trend_data           = [t.model_dump() for t in request.trend_data],
        new_issues_reported  = request.new_issues_reported,
        effectiveness_score  = ai.get("effectiveness_score", 0.0),
        effectiveness_rating = ai.get("effectiveness_rating", "INEFFECTIVE"),
        capa_can_be_closed   = ai.get("capa_can_be_closed", False),
        ai_result            = ai,
    )
    db.add(db_eff)

    # Update CAPA status
    if ai.get("capa_can_be_closed"):
        capa.status = "Closed"
    else:
        capa.status = "Effectiveness Check — Needs Monitoring"

    db.commit()
    db.refresh(db_eff)

    # Step 7 — Build message
    rating = ai.get("effectiveness_rating", "INEFFECTIVE")
    can_close = ai.get("capa_can_be_closed", False)

    if rating == "EFFECTIVE" and can_close:
        message = f"✅ EFFECTIVE — {effectiveness_id}. Score: {ai.get('effectiveness_score')}/100. CAPA can be CLOSED!"
    elif rating == "PARTIALLY EFFECTIVE":
        message = f"⚠️ PARTIALLY EFFECTIVE — {effectiveness_id}. Score: {ai.get('effectiveness_score')}/100. Continue monitoring."
    else:
        message = f"❌ INEFFECTIVE — {effectiveness_id}. Score: {ai.get('effectiveness_score')}/100. CAPA must be REOPENED!"

    return EffectivenessResponse(
        effectiveness_id         = effectiveness_id,
        capa_id                  = request.capa_id,
        customer_id              = request.customer_id,
        action_plan_id           = request.action_plan_id,
        recurrence_check_result  = ai.get("recurrence_check_result", "FAIL"),
        recurrence_check_details = ai.get("recurrence_check_details", ""),
        evidence_verified        = ai.get("evidence_verified", False),
        evidence_details         = ai.get("evidence_details", []),
        evidence_gaps            = ai.get("evidence_gaps", []),
        trend_improvement        = trend_improvement,
        trend_analysis_summary   = ai.get("trend_analysis_summary", ""),
        effectiveness_score      = ai.get("effectiveness_score", 0.0),
        effectiveness_rating     = ai.get("effectiveness_rating", "INEFFECTIVE"),
        capa_can_be_closed       = ai.get("capa_can_be_closed", False),
        closure_recommendation   = ai.get("closure_recommendation", ""),
        ai_summary               = ai.get("ai_summary", ""),
        ai_recommendations       = ai.get("ai_recommendations", []),
        message                  = message,
        created_at               = db_eff.created_at,
    )


# ── GET /api/v1/effectiveness/status/{effectiveness_id} ──────
@router.get("/status/{effectiveness_id}", summary="Get Stage 5 Effectiveness Status")
def get_effectiveness_status(
    effectiveness_id: str,
    db:               Session = Depends(get_db),
    username:         str     = Depends(verify_token)
):
    eff = db.query(EffectivenessCheck).filter(
        EffectivenessCheck.effectiveness_id == effectiveness_id
    ).first()
    if not eff:
        raise HTTPException(
            status_code=404,
            detail=f"Effectiveness Check '{effectiveness_id}' not found."
        )
    return {
        "effectiveness_id":   eff.effectiveness_id,
        "capa_id":            eff.capa_id,
        "customer_id":        eff.customer_id,
        "action_plan_id":     eff.action_plan_id,
        "days_since_capa":    eff.days_since_capa,
        "effectiveness_score": eff.effectiveness_score,
        "effectiveness_rating": eff.effectiveness_rating,
        "capa_can_be_closed": eff.capa_can_be_closed,
        "new_issues_reported": eff.new_issues_reported,
        "created_at":         eff.created_at,
        "stage":              "Stage 5 — Effectiveness Check",
        "message":            f"✅ Effectiveness {effectiveness_id} retrieved successfully."
    }


# ── GET /api/v1/effectiveness/capa/{capa_id} ─────────────────
@router.get("/capa/{capa_id}", summary="Get Effectiveness by CAPA ID")
def get_effectiveness_by_capa(
    capa_id:  str,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    rows = db.query(EffectivenessCheck).filter(
        EffectivenessCheck.capa_id == capa_id
    ).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No effectiveness checks found for CAPA '{capa_id}'"
        )
    return {
        "capa_id": capa_id,
        "total":   len(rows),
        "effectiveness_checks": [
            {
                "effectiveness_id":   r.effectiveness_id,
                "effectiveness_score": r.effectiveness_score,
                "effectiveness_rating": r.effectiveness_rating,
                "capa_can_be_closed": r.capa_can_be_closed,
                "days_since_capa":    r.days_since_capa,
                "created_at":         r.created_at,
            }
            for r in rows
        ]
    }