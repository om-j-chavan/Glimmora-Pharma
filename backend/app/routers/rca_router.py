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
from app.models.capa_model import RCA, CAPA
from app.schemas.capa_schema import RCACreateRequest, RCACreateResponse

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/v1/rca", tags=["RCA"])


# ── RCA ID generator ──────────────────────────────────────────
def _next_rca_id(db: Session) -> str:
    last = db.query(RCA).order_by(RCA.rca_id.desc()).first()
    if last:
        try:
            last_num = int(last.rca_id.split("-")[-1])
        except (ValueError, IndexError, AttributeError):
            last_num = 100
    else:
        last_num = 100
    return f"RCA-{datetime.now().year}-{last_num + 1:03d}"


# ── AI Auto Generate 5-Whys + Quality Check ──────────────────
def _ai_auto_rca(
    problem_statement: str,
    area_affected:     str,
    equipment_product: str,
    rca_method:        str,
    evidence:          Optional[str]
) -> dict:

    prompt = f"""
You are a pharmaceutical QA AI expert.

You are given a problem from a CAPA record.
Your job is to:
1. Automatically generate a complete {rca_method} Root Cause Analysis
2. Score the quality of your own analysis

CAPA DETAILS:
- Problem: "{problem_statement}"
- Area: "{area_affected}"
- Equipment: "{equipment_product}"
- Evidence provided: "{evidence or 'None'}"

Return ONLY this exact JSON. No extra text. No markdown:
{{
  "root_cause": "the real root cause you identified",
  "contributing_factors": "list of contributing factors",
  "why_1": "first why answer",
  "why_2": "second why answer",
  "why_3": "third why answer",
  "why_4": "fourth why answer",
  "why_5": "fifth why answer - deepest systemic cause",
  "rca_quality_score": 0 to 100,
  "quality_rating": "WEAK" or "MODERATE" or "STRONG",
  "depth_check": "one sentence about depth of analysis",
  "evidence_check": "one sentence about evidence support",
  "completeness_check": "one sentence about completeness",
  "systemic_check": "one sentence about systemic thinking",
  "pattern_detected": "pattern description or null",
  "recurrence_risk": "LOW" or "MEDIUM" or "HIGH",
  "ai_suggestions": [
    "suggestion 1",
    "suggestion 2",
    "suggestion 3"
  ]
}}

Rules:
- Generate all 5 Whys going from surface cause to deep systemic cause
- Score your own analysis honestly
- 71-100 = STRONG (systemic root cause found)
- 41-70 = MODERATE (partial systemic view)
- 0-40 = WEAK (only surface cause found)
- recurrence_risk HIGH if quality_rating is WEAK
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = re.sub(r"```json|```", "", response.choices[0].message.content).strip()
    return json.loads(text)


# ── POST /api/v1/rca/submit ───────────────────────────────────
@router.post("/submit", response_model=RCACreateResponse)
def submit_rca(
    request:  RCACreateRequest,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    """
    Stage 2 — Auto RCA with AI Quality Check.

    Frontend sends only:
    - capa_id
    - customer_id
    - rca_method
    - evidence (optional)

    AI automatically:
    - Reads problem from CAPA in DB
    - Generates complete 5-Why analysis
    - Scores the analysis quality
    - Creates audit trail (Gap AI-101)
    """

    # ✅ Check API key
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY not set."
        )

    # Step 1 — Validate CAPA exists
    capa = db.query(CAPA).filter(CAPA.capa_id == request.capa_id).first()
    if not capa:
        raise HTTPException(
            status_code=404,
            detail=f"CAPA ID '{request.capa_id}' not found. Create CAPA first."
        )

    # Validate customer matches
    if capa.customer_id != request.customer_id:
        raise HTTPException(
            status_code=400,
            detail=f"Customer ID does not match CAPA '{request.capa_id}'."
        )

    # Step 2 — Generate RCA ID
    rca_id = _next_rca_id(db)

    # Step 3 — AI Auto generates 5-Whys from CAPA problem
    try:
        ai = _ai_auto_rca(
            problem_statement = capa.problem_statement,
            area_affected     = capa.area_affected,
            equipment_product = capa.equipment_product,
            rca_method        = request.rca_method,
            evidence          = request.evidence,
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid response.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")

    # Step 4 — Save to DB
    db_rca = RCA(
        rca_id               = rca_id,
        capa_id              = request.capa_id,
        customer_id          = request.customer_id,
        rca_method           = request.rca_method,
        root_cause           = ai.get("root_cause", ""),
        contributing_factors = ai.get("contributing_factors", ""),
        why_1                = ai.get("why_1", ""),
        why_2                = ai.get("why_2", ""),
        why_3                = ai.get("why_3", ""),
        why_4                = ai.get("why_4", ""),
        why_5                = ai.get("why_5", ""),
        evidence             = request.evidence,
        rca_quality_score    = ai.get("rca_quality_score", 0.0),
        quality_rating       = ai.get("quality_rating", "WEAK"),
        recurrence_risk      = ai.get("recurrence_risk", "HIGH"),
        ai_result            = ai,
    )
    db.add(db_rca)

    # Update CAPA status
    capa.status = "RCA Submitted"
    db.commit()
    db.refresh(db_rca)

    # Step 5 — Audit Trail (Gap AI-101)
    from app.routers.audit_router import create_audit_log
    create_audit_log(
        db          = db,
        action_type = "submit_rca",
        feature_id  = "AI-101",
        record_id   = rca_id,
        username    = username,
        input_data  = {
            "capa_id":    request.capa_id,
            "rca_method": request.rca_method,
            "evidence":   request.evidence,
        },
        output_data = {
            "rca_id":          rca_id,
            "quality_score":   ai.get("rca_quality_score"),
            "quality_rating":  ai.get("quality_rating"),
            "recurrence_risk": ai.get("recurrence_risk"),
        },
        status = "success"
    )

    # Step 6 — Build message
    score  = ai.get("rca_quality_score", 0)
    rating = ai.get("quality_rating", "WEAK")

    if rating == "STRONG":
        message = f"✅ STRONG RCA — {rca_id} generated. Score: {score}/100. Proceed to Action Plan."
    elif rating == "MODERATE":
        message = f"⚠️ MODERATE RCA — {rca_id} generated. Score: {score}/100. Review before proceeding."
    else:
        message = f"❌ WEAK RCA — {rca_id} generated. Score: {score}/100. RCA needs improvement!"

    return RCACreateResponse(
        rca_id             = rca_id,
        capa_id            = request.capa_id,
        customer_id        = request.customer_id,
        rca_method         = request.rca_method,
        root_cause         = ai.get("root_cause", ""),
        # ✅ Gap AI-102 — Advisory Only Label
        advisory_notice    = "⚠️ ADVISORY ONLY — AI score is for guidance purposes. Final RCA quality determination requires QA review and approval.",
        rca_quality_score  = ai.get("rca_quality_score", 0.0),
        quality_rating     = ai.get("quality_rating", "WEAK"),
        depth_check        = ai.get("depth_check", ""),
        evidence_check     = ai.get("evidence_check", ""),
        completeness_check = ai.get("completeness_check", ""),
        systemic_check     = ai.get("systemic_check", ""),
        pattern_detected   = ai.get("pattern_detected"),
        recurrence_risk    = ai.get("recurrence_risk", "HIGH"),
        ai_suggestions     = ai.get("ai_suggestions", []),
        message            = message,
        created_at         = db_rca.created_at,
    )


# ── GET /api/v1/rca/capa/{capa_id} ───────────────────────────
@router.get("/capa/{capa_id}", summary="Get RCA by CAPA ID")
def get_rca_by_capa(
    capa_id:  str,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    rows = db.query(RCA).filter(RCA.capa_id == capa_id).all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No RCA found for CAPA '{capa_id}'"
        )
    return {
        "capa_id": capa_id,
        "total":   len(rows),
        "rcas": [
            {
                "rca_id":            r.rca_id,
                "rca_method":        r.rca_method,
                "root_cause":        r.root_cause,
                "why_1":             r.why_1,
                "why_2":             r.why_2,
                "why_3":             r.why_3,
                "why_4":             r.why_4,
                "why_5":             r.why_5,
                "rca_quality_score": r.rca_quality_score,
                "quality_rating":    r.quality_rating,
                "recurrence_risk":   r.recurrence_risk,
                "created_at":        r.created_at,
            }
            for r in rows
        ]
    }


# ── GET /api/v1/rca/status/{rca_id} ──────────────────────────
@router.get("/status/{rca_id}", summary="Get Stage 2 RCA Status")
def get_rca_status(
    rca_id:   str,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    rca = db.query(RCA).filter(RCA.rca_id == rca_id).first()
    if not rca:
        raise HTTPException(status_code=404, detail=f"RCA '{rca_id}' not found.")

    return {
        "rca_id":               rca.rca_id,
        "capa_id":              rca.capa_id,
        "customer_id":          rca.customer_id,
        "rca_method":           rca.rca_method,
        "root_cause":           rca.root_cause,
        "contributing_factors": rca.contributing_factors,
        "why_1":                rca.why_1,
        "why_2":                rca.why_2,
        "why_3":                rca.why_3,
        "why_4":                rca.why_4,
        "why_5":                rca.why_5,
        "evidence":             rca.evidence,
        "rca_quality_score":    rca.rca_quality_score,
        "quality_rating":       rca.quality_rating,
        "recurrence_risk":      rca.recurrence_risk,
        "advisory_notice":      "⚠️ ADVISORY ONLY — AI score is for guidance purposes. Final RCA quality determination requires QA review and approval.",
        "created_at":           rca.created_at,
        "stage":                "Stage 2 — RCA Submission",
        "message":              f"✅ RCA {rca_id} status retrieved successfully."
    }