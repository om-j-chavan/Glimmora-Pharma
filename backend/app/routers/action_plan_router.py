from app.routers.auth_router import verify_token
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
from app.models.capa_model import ActionPlan, CAPA, RCA
from app.schemas.capa_schema import (
    ActionPlanCreateRequest, ActionPlanCreateResponse
)

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/v1/action-plan", tags=["Action Plan"])


# ── Action Plan ID generator ──────────────────────────────────
def _next_action_plan_id(db: Session) -> str:
    last = db.query(ActionPlan).order_by(ActionPlan.action_plan_id.desc()).first()
    if last:
        try:
            last_num = int(last.action_plan_id.split("-")[-1])
        except (ValueError, IndexError, AttributeError):
            last_num = 200
    else:
        last_num = 200
    return f"AP-{datetime.now().year}-{last_num + 1:03d}"


# ── AI Action Plan Review ─────────────────────────────────────
def _ai_action_plan_review(request: ActionPlanCreateRequest, root_cause: str) -> dict:

    actions_text = "\n".join([
        f"{i+1}. Action: {a.action_description} | Responsible: {a.responsible_person} | Due: {a.due_date}"
        for i, a in enumerate(request.actions)
    ])

    prompt = f"""
You are a pharmaceutical QA AI expert reviewing a CAPA Action Plan.

CAPA ID: {request.capa_id}
ROOT CAUSE FROM RCA: {root_cause}

ACTIONS SUBMITTED:
{actions_text}

Review these actions and return ONLY this exact JSON. No extra text. No markdown:
{{
  "is_cosmetic_capa": true or false,
  "cosmetic_alert": "alert message if cosmetic or null",
  "action_to_cause_alignment": "one sentence - do actions address the root cause?",
  "completeness_check": "one sentence - is prevention addressed?",
  "mismatch_detected": "describe mismatch between root cause and actions or null",
  "suggested_additional_actions": [
    "additional action 1",
    "additional action 2",
    "additional action 3"
  ],
  "effectiveness_prediction_current": "X% likely to prevent recurrence with current actions",
  "effectiveness_prediction_improved": "X% likely to prevent recurrence with suggested actions",
  "overall_plan_rating": "WEAK" or "MODERATE" or "STRONG",
  "ai_recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ]
}}

Rules:
- is_cosmetic_capa = true if actions are just training/reminders but root cause is systemic
- WEAK = actions don't address root cause at all
- MODERATE = actions partially address root cause
- STRONG = actions fully address root cause with prevention measures
- effectiveness_prediction should be realistic percentage
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = re.sub(r"```json|```", "", response.choices[0].message.content).strip()
    return json.loads(text)


# ── POST /api/v1/action-plan/submit ──────────────────────────
@router.post("/submit", response_model=ActionPlanCreateResponse)
def submit_action_plan(request: ActionPlanCreateRequest, db: Session = Depends(get_db),username: str     = Depends(verify_token)):
    """
    Stage 3 — Submit Action Plan with AI Review.

    Steps:
    1. Validate CAPA and RCA exist
    2. Send actions to AI for review
    3. AI checks: Alignment, Cosmetic CAPA, Completeness
    4. Save Action Plan to database
    5. Return AI review report
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
            detail=f"Customer ID does not match CAPA '{request.capa_id}'."
        )

    # Validate RCA exists
    rca = db.query(RCA).filter(RCA.rca_id == request.rca_id).first()
    if not rca:
        raise HTTPException(
            status_code=404,
            detail=f"RCA ID '{request.rca_id}' not found. Submit RCA first."
        )

    # Step 2 — Generate Action Plan ID
    action_plan_id = _next_action_plan_id(db)

    # Step 3 — AI Review
    try:
        ai = _ai_action_plan_review(request, rca.root_cause)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid response.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")

    # Step 4 — Save to DB
    db_ap = ActionPlan(
        action_plan_id                    = action_plan_id,
        capa_id                           = request.capa_id,
        customer_id                       = request.customer_id,
        rca_id                            = request.rca_id,
        actions                           = [a.model_dump() for a in request.actions],
        is_cosmetic_capa                  = ai.get("is_cosmetic_capa", False),
        overall_plan_rating               = ai.get("overall_plan_rating", "WEAK"),
        effectiveness_prediction_current  = ai.get("effectiveness_prediction_current", ""),
        effectiveness_prediction_improved = ai.get("effectiveness_prediction_improved", ""),
        ai_result                         = ai,
    )
    db.add(db_ap)

    # Update CAPA status
    capa.status = "Action Plan Submitted"
    db.commit()
    db.refresh(db_ap)

    # Step 5 — Build message
    rating = ai.get("overall_plan_rating", "WEAK")
    is_cosmetic = ai.get("is_cosmetic_capa", False)

    if is_cosmetic:
        message = f"🚨 COSMETIC CAPA ALERT — {action_plan_id}. Actions don't address root cause!"
    elif rating == "STRONG":
        message = f"✅ STRONG Action Plan — {action_plan_id}. Actions fully address root cause."
    elif rating == "MODERATE":
        message = f"⚠️ MODERATE Action Plan — {action_plan_id}. Consider adding suggested actions."
    else:
        message = f"❌ WEAK Action Plan — {action_plan_id}. Actions need major improvement!"

    return ActionPlanCreateResponse(
        action_plan_id                    = action_plan_id,
        capa_id                           = request.capa_id,
        customer_id                       = request.customer_id,
        rca_id                            = request.rca_id,
        total_actions                     = len(request.actions),
        is_cosmetic_capa                  = ai.get("is_cosmetic_capa", False),
        cosmetic_alert                    = ai.get("cosmetic_alert"),
        action_to_cause_alignment         = ai.get("action_to_cause_alignment", ""),
        completeness_check                = ai.get("completeness_check", ""),
        mismatch_detected                 = ai.get("mismatch_detected"),
        suggested_additional_actions      = ai.get("suggested_additional_actions", []),
        effectiveness_prediction_current  = ai.get("effectiveness_prediction_current", ""),
        effectiveness_prediction_improved = ai.get("effectiveness_prediction_improved", ""),
        overall_plan_rating               = ai.get("overall_plan_rating", "WEAK"),
        ai_recommendations                = ai.get("ai_recommendations", []),
        message                           = message,
        created_at                        = db_ap.created_at,
    )


# ── GET /api/v1/action-plan/capa/{capa_id} ───────────────────
@router.get("/capa/{capa_id}", summary="Get Action Plan by CAPA ID")
def get_action_plan_by_capa(capa_id: str, db: Session = Depends(get_db),username: str     = Depends(verify_token)):
    rows = db.query(ActionPlan).filter(ActionPlan.capa_id == capa_id).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No Action Plan found for CAPA '{capa_id}'"
        )
    return {
        "capa_id": capa_id,
        "total":   len(rows),
        "action_plans": [
            {
                "action_plan_id":    r.action_plan_id,
                "total_actions":     len(r.actions) if r.actions else 0,
                "is_cosmetic_capa":  r.is_cosmetic_capa,
                "overall_rating":    r.overall_plan_rating,
                "effectiveness_current":  r.effectiveness_prediction_current,
                "effectiveness_improved": r.effectiveness_prediction_improved,
                "created_at":        r.created_at,
            }
            for r in rows
        ]
    }

# ── GET /api/v1/action-plan/status/{action_plan_id} ──────────
@router.get("/status/{action_plan_id}", summary="Get Stage 3 Action Plan Status")
def get_action_plan_status(
    action_plan_id: str,
    db:             Session = Depends(get_db),
    username:       str     = Depends(verify_token)
):
    ap = db.query(ActionPlan).filter(
        ActionPlan.action_plan_id == action_plan_id
    ).first()
    if not ap:
        raise HTTPException(
            status_code=404,
            detail=f"Action Plan '{action_plan_id}' not found."
        )

    return {
        "action_plan_id":                  ap.action_plan_id,
        "capa_id":                         ap.capa_id,
        "customer_id":                     ap.customer_id,
        "rca_id":                          ap.rca_id,
        "actions":                         ap.actions,
        "total_actions":                   len(ap.actions) if ap.actions else 0,
        "is_cosmetic_capa":                ap.is_cosmetic_capa,
        "overall_plan_rating":             ap.overall_plan_rating,
        "effectiveness_prediction_current": ap.effectiveness_prediction_current,
        "effectiveness_prediction_improved": ap.effectiveness_prediction_improved,
        "created_at":                      ap.created_at,
        "stage":                           "Stage 3 — Action Plan Review",
        "message":                         f"✅ Action Plan {action_plan_id} status retrieved successfully."
    }