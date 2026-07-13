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
from app.models.capa_model import (
    CAPAClosure, CAPA, RCA, ActionPlan,
    EffectivenessCheck, ImplementationMonitoring
)
from app.schemas.capa_schema import ClosureRequest, ClosureResponse
from app.routers.auth_router import verify_token

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/v1/closure", tags=["CAPA Closure"])


# ── Closure ID generator ──────────────────────────────────────
def _next_closure_id(db: Session) -> str:
    last = db.query(CAPAClosure).order_by(
        CAPAClosure.closure_id.desc()
    ).first()
    if last:
        try:
            last_num = int(last.closure_id.split("-")[-1])
        except (ValueError, IndexError, AttributeError):
            last_num = 600
    else:
        last_num = 600
    return f"CLO-{datetime.now().year}-{last_num + 1:03d}"


# ── AI Pre-Closure Checklist ──────────────────────────────────
def _ai_pre_closure_check(
    capa_id:              str,
    problem:              str,
    root_cause:           str,
    effectiveness_score:  float,
    effectiveness_rating: str,
    recurrence_result:    str,
    actions_completed:    bool,
    evidence_verified:    bool,
    days_since_capa:      int,
    related_capas:        List[str],
    closure_rationale:    str
) -> dict:

    prompt = f"""
You are a pharmaceutical QA AI expert performing CAPA Pre-Closure Check.

CAPA ID: {capa_id}
PROBLEM: {problem}
ROOT CAUSE: {root_cause}

CHECKLIST STATUS:
- All actions completed: {actions_completed}
- Effectiveness score: {effectiveness_score}/100
- Effectiveness rating: {effectiveness_rating}
- Recurrence check: {recurrence_result}
- Evidence verified: {evidence_verified}
- Days since CAPA: {days_since_capa}
- Related open CAPAs: {related_capas}

HUMAN CLOSURE RATIONALE:
{closure_rationale}

Perform pre-closure check and return ONLY this exact JSON. No extra text. No markdown:
{{
  "actions_completed_check":        true or false,
  "effectiveness_check_done":       true or false,
  "no_recurrence_detected":         true or false,
  "training_records_verified":      true or false,
  "document_changes_approved":      true or false,
  "ai_pre_closure_summary":         "2-3 sentence summary of closure readiness",
  "ai_recommendation":              "Closure may proceed" or "Review required before closure" or "Closure not recommended",
  "ai_closure_approved":            true or false,
  "related_capas_concern":          "concern about related CAPAs or null",
  "closure_risk":                   "LOW" or "MEDIUM" or "HIGH"
}}

Rules:
- ai_closure_approved = true ONLY if:
  * effectiveness_score >= 80
  * recurrence_result = PASS
  * evidence_verified = true
  * actions_completed = true
- ai_closure_approved = false if any above condition fails
- If related open CAPAs exist → add concern
- closure_risk HIGH if effectiveness_score < 70
- closure_risk MEDIUM if effectiveness_score 70-80
- closure_risk LOW if effectiveness_score > 80
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = re.sub(r"```json|```", "", response.choices[0].message.content).strip()
    return json.loads(text)


# ── POST /api/v1/closure/initiate ────────────────────────────
@router.post("/initiate", response_model=ClosureResponse)
def initiate_closure(
    request:  ClosureRequest,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    """
    Stage 6 — CAPA Closure with Human Approval (HITL Gate).

    Steps:
    1. AI Pre-Closure Checklist
    2. Validate all stages completed
    3. Human approval with electronic signature
    4. Close CAPA
    """

    # ✅ Check API key
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set.")

    # Step 1 — Validate CAPA
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

    # Step 2 — Validate Effectiveness Check exists
    eff = db.query(EffectivenessCheck).filter(
        EffectivenessCheck.effectiveness_id == request.effectiveness_id
    ).first()
    if not eff:
        raise HTTPException(
            status_code=404,
            detail=f"Effectiveness Check '{request.effectiveness_id}' not found. Complete Stage 5 first."
        )

    # Step 3 — Validate Action Plan exists
    ap = db.query(ActionPlan).filter(
        ActionPlan.capa_id == request.capa_id
    ).first()
    if not ap:
        raise HTTPException(
            status_code=404,
            detail="Action Plan not found. Complete Stage 3 first."
        )

    # Step 4 — Validate Monitoring exists
    mon = db.query(ImplementationMonitoring).filter(
        ImplementationMonitoring.capa_id == request.capa_id
    ).order_by(ImplementationMonitoring.created_at.desc()).first()
    if not mon:
        raise HTTPException(
            status_code=404,
            detail="Monitoring not found. Complete Stage 4 first."
        )

    # Step 5 — Get RCA root cause
    rca = db.query(RCA).filter(RCA.capa_id == request.capa_id).first()
    root_cause = rca.root_cause if rca else "Not found"

    # Step 6 — Check related open CAPAs
    related_capas = db.query(CAPA).filter(
        CAPA.customer_id == request.customer_id,
        CAPA.status != "Closed",
        CAPA.capa_id != request.capa_id
    ).all()
    related_capa_ids = [c.capa_id for c in related_capas]

    # Step 7 — Generate Closure ID
    closure_id = _next_closure_id(db)

    # Step 8 — AI Pre-Closure Check
    try:
        ai = _ai_pre_closure_check(
            capa_id              = request.capa_id,
            problem              = capa.problem_statement,
            root_cause           = root_cause,
            effectiveness_score  = eff.effectiveness_score,
            effectiveness_rating = eff.effectiveness_rating,
            recurrence_result    = eff.ai_result.get("recurrence_check_result", "FAIL"),
            actions_completed    = mon.completed_count == len(mon.action_updates or []),
            evidence_verified    = eff.ai_result.get("evidence_verified", False),
            days_since_capa      = eff.days_since_capa,
            related_capas        = related_capa_ids,
            closure_rationale    = request.closure_rationale,
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid response.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")

    # Step 9 — Determine final status
    ai_approved   = ai.get("ai_closure_approved", False)
    closed_at     = datetime.now()

    # HITL Gate — a human e-signature is required to close, even when the AI
    # pre-check approves (21 CFR Part 11). The signature must be a real,
    # non-blank value: a whitespace-only string is truthy in Python but is NOT
    # a valid signature, so we test the stripped value. Without this, " " (or
    # any non-empty string) silently auto-closed the CAPA and the "Pending
    # Human Approval" branch was unreachable.
    has_signature = bool((request.electronic_signature or "").strip())
    if ai_approved and has_signature:
        final_status = "Closed"
    elif not ai_approved:
        final_status = "Closure Rejected — AI Pre-Check Failed"
    else:
        final_status = "Pending Human Approval"

    # Step 10 — Save to DB
    db_closure = CAPAClosure(
        closure_id                = closure_id,
        capa_id                   = request.capa_id,
        customer_id               = request.customer_id,
        effectiveness_id          = request.effectiveness_id,
        actions_completed         = ai.get("actions_completed_check", False),
        effectiveness_check_done  = ai.get("effectiveness_check_done", False),
        no_recurrence_detected    = ai.get("no_recurrence_detected", False),
        training_records_verified = ai.get("training_records_verified", False),
        document_changes_approved = request.document_changes_approved,
        related_capas_open        = related_capa_ids,
        ai_closure_approved       = ai_approved,
        approved_by               = request.approved_by,
        designation               = request.designation,
        electronic_signature      = request.electronic_signature,
        closure_rationale         = request.closure_rationale,
        capa_final_status         = final_status,
        closed_at                 = closed_at,
        ai_result                 = ai,
    )
    db.add(db_closure)

    # Update CAPA status
    capa.status = final_status
    db.commit()
    db.refresh(db_closure)

    # Step 11 — Build message
    if final_status == "Closed":
        message = f"✅ CAPA CLOSED — {closure_id}. Approved by {request.approved_by}. Signature: {request.electronic_signature}"
    elif "Rejected" in final_status:
        message = f"❌ CLOSURE REJECTED — {closure_id}. AI Pre-Check failed. Review required."
    else:
        message = f"⏳ PENDING — {closure_id}. Human approval required."

    return ClosureResponse(
        closure_id                = closure_id,
        capa_id                   = request.capa_id,
        customer_id               = request.customer_id,
        effectiveness_id          = request.effectiveness_id,
        actions_completed         = ai.get("actions_completed_check", False),
        effectiveness_check_done  = ai.get("effectiveness_check_done", False),
        no_recurrence_detected    = ai.get("no_recurrence_detected", False),
        training_records_verified = ai.get("training_records_verified", False),
        document_changes_approved = request.document_changes_approved,
        related_capas_open        = related_capa_ids,
        ai_pre_closure_summary    = ai.get("ai_pre_closure_summary", ""),
        ai_recommendation         = ai.get("ai_recommendation", ""),
        ai_closure_approved       = ai_approved,
        approved_by               = request.approved_by,
        designation               = request.designation,
        electronic_signature      = request.electronic_signature,
        closure_rationale         = request.closure_rationale,
        capa_final_status         = final_status,
        closed_at                 = closed_at,
        message                   = message,
        created_at                = db_closure.created_at,
    )


# ── GET /api/v1/closure/status/{closure_id} ──────────────────
@router.get("/status/{closure_id}", summary="Get Stage 6 Closure Status")
def get_closure_status(
    closure_id: str,
    db:         Session = Depends(get_db),
    username:   str     = Depends(verify_token)
):
    clo = db.query(CAPAClosure).filter(
        CAPAClosure.closure_id == closure_id
    ).first()
    if not clo:
        raise HTTPException(
            status_code=404,
            detail=f"Closure '{closure_id}' not found."
        )
    return {
        "closure_id":               clo.closure_id,
        "capa_id":                  clo.capa_id,
        "customer_id":              clo.customer_id,
        "effectiveness_id":         clo.effectiveness_id,
        "actions_completed":        clo.actions_completed,
        "effectiveness_check_done": clo.effectiveness_check_done,
        "no_recurrence_detected":   clo.no_recurrence_detected,
        "training_records_verified": clo.training_records_verified,
        "document_changes_approved": clo.document_changes_approved,
        "related_capas_open":       clo.related_capas_open,
        "ai_closure_approved":      clo.ai_closure_approved,
        "approved_by":              clo.approved_by,
        "designation":              clo.designation,
        "electronic_signature":     clo.electronic_signature,
        "capa_final_status":        clo.capa_final_status,
        "closed_at":                clo.closed_at,
        "created_at":               clo.created_at,
        "stage":                    "Stage 6 — CAPA Closure",
        "message":                  f"✅ Closure {closure_id} retrieved successfully."
    }


# ── GET /api/v1/closure/capa/{capa_id} ───────────────────────
@router.get("/capa/{capa_id}", summary="Get Closure by CAPA ID")
def get_closure_by_capa(
    capa_id:  str,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    rows = db.query(CAPAClosure).filter(
        CAPAClosure.capa_id == capa_id
    ).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No closure found for CAPA '{capa_id}'"
        )
    return {
        "capa_id": capa_id,
        "total":   len(rows),
        "closures": [
            {
                "closure_id":          r.closure_id,
                "capa_final_status":   r.capa_final_status,
                "ai_closure_approved": r.ai_closure_approved,
                "approved_by":         r.approved_by,
                "electronic_signature": r.electronic_signature,
                "closed_at":           r.closed_at,
                "created_at":          r.created_at,
            }
            for r in rows
        ]
    }