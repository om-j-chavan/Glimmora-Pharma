from app.routers.auth_router import verify_token
import os
import io
import json
import re
from datetime import datetime, timedelta
from typing import List, Optional

from openai import OpenAI
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database.db import get_db
from app.models.capa_model import CAPA
from app.schemas.capa_schema import (
    CAPACreateRequest, CAPACreateResponse, SimilarCAPA
)

load_dotenv()

# ── OpenAI setup ──────────────────────────────────────────────
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/v1/capa", tags=["CAPA"])

# ── Historical CAPAs ──────────────────────────────────────────
HISTORICAL_CAPAS = [
    {
        "capa_id": "CAPA-2023-089",
        "problem_statement": "Coating defects on Coater #3 - uneven film coating on tablets",
        "area_affected": "Manufacturing - Coating Suite",
        "equipment_product": "Coater #3",
        "status": "Closed",
        "was_effective": False,
        "created_date": "2023-03-15",
    },
    {
        "capa_id": "CAPA-2022-156",
        "problem_statement": "Film coating issues on Line 2 - appearance non-conformance",
        "area_affected": "Manufacturing - Line 2",
        "equipment_product": "Coater Line 2",
        "status": "Closed",
        "was_effective": True,
        "created_date": "2022-08-20",
    },
    {
        "capa_id": "CAPA-2023-201",
        "problem_statement": "Tablet appearance defect - mottling observed post coating",
        "area_affected": "QC / Manufacturing",
        "equipment_product": "Tablet Batch TBX-4421",
        "status": "Closed",
        "was_effective": True,
        "created_date": "2023-07-01",
    },
    {
        "capa_id": "CAPA-2024-012",
        "problem_statement": "OOS result for dissolution test on product batch",
        "area_affected": "QC Laboratory",
        "equipment_product": "Dissolution Apparatus #2",
        "status": "Closed",
        "was_effective": True,
        "created_date": "2024-01-10",
    },
    {
        "capa_id": "CAPA-2024-045",
        "problem_statement": "HVAC failure causing temperature excursion in storage",
        "area_affected": "Warehouse",
        "equipment_product": "HVAC Unit W-3",
        "status": "In Progress",
        "was_effective": None,
        "created_date": "2024-03-05",
    },
]


# ── ID generator ──────────────────────────────────────────────
def _next_id(db: Session) -> str:
    """Generate ID based on last ID in DB — never duplicates"""
    last = db.query(CAPA).order_by(CAPA.capa_id.desc()).first()
    if last:
        try:
            last_num = int(last.capa_id.split("-")[-1])
        except (ValueError, IndexError, AttributeError):
            last_num = 300
    else:
        last_num = 300
    return f"CAPA-{datetime.now().year}-{last_num + 1:03d}"


# ── Field Validator — Gap AI-100 ──────────────────────────────
def _validate_capa_fields(
    problem_statement: str,
    source:            str,
    area_affected:     str,
    equipment_product: str,
    initial_severity:  str
) -> list:
    """Validate all CAPA fields and return list of incomplete fields"""
    incomplete = []
    if not problem_statement or len(problem_statement.strip()) < 10:
        incomplete.append("problem_statement: minimum 10 characters required")
    if not source or source.strip() == "":
        incomplete.append("source: cannot be empty")
    if not area_affected or area_affected.strip() == "":
        incomplete.append("area_affected: cannot be empty")
    if not equipment_product or equipment_product.strip() == "":
        incomplete.append("equipment_product: cannot be empty")
    if not initial_severity or initial_severity.strip() == "":
        incomplete.append("initial_severity: cannot be empty")
    return incomplete


# ── Document text extractor ───────────────────────────────────
async def _extract_document_text(file: UploadFile) -> str:
    """Extract text from uploaded document (PDF, TXT, DOCX)"""
    content = await file.read()
    filename = file.filename.lower()
    try:
        if filename.endswith(".txt"):
            return content.decode("utf-8", errors="ignore")[:3000]
        elif filename.endswith(".pdf"):
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content))
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                return text[:3000]
            except ImportError:
                return "PDF uploaded but pypdf not installed."
        elif filename.endswith(".docx"):
            try:
                import docx
                doc = docx.Document(io.BytesIO(content))
                text = "\n".join([para.text for para in doc.paragraphs])
                return text[:3000]
            except ImportError:
                return "DOCX uploaded but python-docx not installed."
        else:
            return f"Unsupported file type: {file.filename}. Supported: PDF, TXT, DOCX"
    except Exception as e:
        return f"Could not read document: {str(e)}"


# ── AI Recurrence Check ───────────────────────────────────────
def _ai_recurrence_check(
    problem:       str,
    area:          str,
    equipment:     str,
    document_text: Optional[str] = None
) -> dict:
    history = json.dumps(HISTORICAL_CAPAS, indent=2)

    doc_section = ""
    if document_text:
        doc_section = f"""
ATTACHED DOCUMENT CONTENT:
{document_text}

Use the document content as additional context to better understand the problem.
"""

    prompt = f"""
You are a pharmaceutical QA AI for CAPA recurrence detection.

NEW CAPA:
- Problem: "{problem}"
- Area: "{area}"
- Equipment: "{equipment}"
{doc_section}
HISTORICAL CAPAs:
{history}

Compare the new CAPA against each historical CAPA semantically.

Return ONLY this exact JSON. No extra text. No markdown:
{{
  "is_recurring": true or false,
  "similar_capas": [
    {{
      "capa_id": "string",
      "similarity_score": 0.0 to 1.0,
      "description": "one sentence why they are similar",
      "was_effective": true or false
    }}
  ],
  "recurrence_alert": "alert message or null",
  "pattern_detected": "pattern description or null",
  "ai_recommendation": "what QA team should do next",
  "risk_score": 0.0 to 1.0
}}

Rules:
- Only include similar_capas with similarity_score >= 0.70
- is_recurring = true if 2+ similar CAPAs OR any prior CAPA was ineffective
- risk_score higher when prior CAPAs were ineffective or same equipment involved
"""
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    text = re.sub(r"```json|```", "", response.choices[0].message.content).strip()
    return json.loads(text)


# ── 12 Month Recurrence Check — Gap AI-101 ───────────────────
def _check_12_month_recurrence(db: Session, similar_capas: list):
    """
    If new CAPA recurs within 12 months of a closed CAPA,
    flag original effectiveness check as failed and route for review.
    """
    from app.models.capa_model import EffectivenessCheck

    flagged = []
    cutoff_date = datetime.now() - timedelta(days=365)

    for sc in similar_capas:
        if sc.get("similarity_score", 0) >= 0.75:
            old_capa = db.query(CAPA).filter(
                CAPA.capa_id == sc.get("capa_id")
            ).first()

            if old_capa and old_capa.status == "Closed":
                if old_capa.created_at and old_capa.created_at >= cutoff_date:
                    eff = db.query(EffectivenessCheck).filter(
                        EffectivenessCheck.capa_id == sc.get("capa_id")
                    ).first()

                    if eff:
                        eff.effectiveness_rating = "FAILED - Recurrence Detected"
                        eff.capa_can_be_closed   = False
                        db.commit()

                        flagged.append({
                            "original_capa_id":       sc.get("capa_id"),
                            "effectiveness_id":       eff.effectiveness_id,
                            "flagged_reason":         "Recurrence within 12 months",
                            "requires_review":        True,
                            "original_effectiveness": "FAILED - Recurrence Detected"
                        })
    return flagged


# ── Alert Dismissal Schema — Gap AI-101 ──────────────────────
class AlertDismissalRequest(BaseModel):
    capa_id:              str = Field(..., example="CAPA-2026-301")
    alert_type:           str = Field(..., example="recurrence_alert")
    dismissal_reason:     str = Field(..., example="Investigated and confirmed different root cause")
    electronic_signature: str = Field(..., example="QM-2026-001")
    dismissed_by:         str = Field(..., example="QA Manager")


# ── POST /api/v1/capa/create ──────────────────────────────────
@router.post("/create", response_model=CAPACreateResponse)
async def create_capa(
    customer_id:       str = Form(...),
    problem_statement: str = Form(...),
    source:            str = Form(...),
    area_affected:     str = Form(...),
    equipment_product: str = Form(...),
    initial_severity:  str = Form(...),
    document: Optional[UploadFile] = File(None),
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token),
):
    """
    Stage 1 — Create CAPA with AI Recurrence Check.

    Steps:
    1. Validate fields (Gap AI-100)
    2. Generate CAPA ID
    3. Extract document text (if uploaded)
    4. Send to OpenAI GPT-4o → detect recurrence + find similar past CAPAs
    5. Check 12-month recurrence (Gap AI-101)
    6. Save to database
    7. Create audit trail (Gap AI-100)
    8. Return full AI analysis
    """

    # ✅ Check API KEY
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY not set. Add it to your .env file."
        )

    # ✅ Step 1 — Field Validation (Gap AI-100)
    incomplete_fields = _validate_capa_fields(
        problem_statement, source,
        area_affected, equipment_product, initial_severity
    )
    if incomplete_fields:
        raise HTTPException(
            status_code=422,
            detail={
                "error":             "Incomplete fields detected",
                "incomplete_fields": incomplete_fields,
                "message":           "Please complete all required fields before submitting"
            }
        )

    # Step 2 — Generate ID
    capa_id = _next_id(db)

    # Step 3 — Extract document text if uploaded
    document_text    = None
    document_filename = None

    if document and document.filename:
        allowed = [".pdf", ".txt", ".docx"]
        ext = os.path.splitext(document.filename)[1].lower()
        if ext not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type '{ext}'. Allowed: PDF, TXT, DOCX"
            )
        document_text     = await _extract_document_text(document)
        document_filename = document.filename

    # Step 4 — Call OpenAI AI
    try:
        ai = _ai_recurrence_check(
            problem       = problem_statement,
            area          = area_affected,
            equipment     = equipment_product,
            document_text = document_text,
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid response. Try again.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)}")

    # Step 5 — Check 12-month recurrence (Gap AI-101)
    flagged_effectiveness = _check_12_month_recurrence(
        db            = db,
        similar_capas = ai.get("similar_capas", [])
    )

    # Step 6 — Save to DB
    db_capa = CAPA(
        capa_id           = capa_id,
        customer_id       = customer_id,
        problem_statement = problem_statement,
        source            = source,
        area_affected     = area_affected,
        equipment_product = equipment_product,
        initial_severity  = initial_severity,
        status            = "Open",
        is_recurring      = ai.get("is_recurring", False),
        risk_score        = ai.get("risk_score", 0.0),
        ai_result         = ai,
    )
    db.add(db_capa)
    db.commit()
    db.refresh(db_capa)

    # Step 7 — Audit Trail (Gap AI-100)
    from app.routers.audit_router import create_audit_log
    create_audit_log(
        db          = db,
        action_type = "create_capa",
        feature_id  = "AI-100",
        record_id   = capa_id,
        username    = username,
        input_data  = {
            "customer_id":       customer_id,
            "problem_statement": problem_statement,
            "source":            source,
            "area_affected":     area_affected,
            "equipment_product": equipment_product,
            "initial_severity":  initial_severity,
        },
        output_data = {
            "capa_id":                  capa_id,
            "is_recurring":             ai.get("is_recurring"),
            "risk_score":               ai.get("risk_score"),
            "flagged_effectiveness":    flagged_effectiveness,
        },
        status = "success"
    )

    # Step 8 — Build message
    is_recurring = ai.get("is_recurring", False)
    message = (
        f"⚠️ RECURRING ISSUE — {capa_id} created. Escalation recommended."
        if is_recurring else
        f"✅ No recurrence detected — {capa_id} created successfully."
    )
    if document_filename:
        message += f" 📄 Document '{document_filename}' processed."
    if flagged_effectiveness:
        message += f" 🚨 {len(flagged_effectiveness)} previous effectiveness check(s) flagged as FAILED."

    return CAPACreateResponse(
        capa_id           = capa_id,
        customer_id       = customer_id,
        status            = "Open",
        created_at        = db_capa.created_at,
        is_recurring      = is_recurring,
        similar_capas     = [SimilarCAPA(**sc) for sc in ai.get("similar_capas", [])],
        recurrence_alert  = ai.get("recurrence_alert"),
        pattern_detected  = ai.get("pattern_detected"),
        ai_recommendation = ai.get("ai_recommendation", ""),
        risk_score        = ai.get("risk_score", 0.0),
        message           = message,
    )


# ── GET /api/v1/capa/all ──────────────────────────────────────
@router.get("/all", summary="Get all CAPAs from DB")
def get_all(
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    rows = db.query(CAPA).all()
    return {
        "total": len(rows),
        "capas": [
            {
                "capa_id":           r.capa_id,
                "problem_statement": r.problem_statement,
                "source":            r.source,
                "severity":          r.initial_severity,
                "status":            r.status,
                "is_recurring":      r.is_recurring,
                "risk_score":        r.risk_score,
                "created_at":        r.created_at,
            }
            for r in rows
        ]
    }


# ── GET /api/v1/capa/customer/{customer_id} ───────────────────
@router.get("/customer/{customer_id}", summary="Get all CAPAs by Customer ID")
def get_by_customer(
    customer_id: str,
    db:          Session = Depends(get_db),
    username:    str     = Depends(verify_token)
):
    rows = db.query(CAPA).filter(CAPA.customer_id == customer_id).all()
    return {
        "customer_id": customer_id,
        "total":       len(rows),
        "capas": [
            {
                "capa_id":           r.capa_id,
                "problem_statement": r.problem_statement,
                "source":            r.source,
                "severity":          r.initial_severity,
                "status":            r.status,
                "is_recurring":      r.is_recurring,
                "risk_score":        r.risk_score,
                "created_at":        r.created_at,
            }
            for r in rows
        ]
    }


# ── GET /api/v1/capa/status/{capa_id} ────────────────────────
@router.get("/status/{capa_id}", summary="Get Stage 1 CAPA Status")
def get_capa_status(
    capa_id:  str,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    capa = db.query(CAPA).filter(CAPA.capa_id == capa_id).first()
    if not capa:
        raise HTTPException(status_code=404, detail=f"CAPA '{capa_id}' not found.")

    return {
        "capa_id":           capa.capa_id,
        "customer_id":       capa.customer_id,
        "problem_statement": capa.problem_statement,
        "source":            capa.source,
        "area_affected":     capa.area_affected,
        "equipment_product": capa.equipment_product,
        "severity":          capa.initial_severity,
        "status":            capa.status,
        "is_recurring":      capa.is_recurring,
        "risk_score":        capa.risk_score,
        "created_at":        capa.created_at,
        "stage":             "Stage 1 — CAPA Creation",
        "message":           f"✅ CAPA {capa_id} status retrieved successfully."
    }


# ── POST /api/v1/capa/dismiss-alert — Gap AI-101 ─────────────
@router.post("/dismiss-alert", summary="Dismiss Alert with Audit Trail and E-Signature")
def dismiss_alert(
    request:  AlertDismissalRequest,
    db:       Session = Depends(get_db),
    username: str     = Depends(verify_token)
):
    """
    Dismiss a recurrence or risk alert.
    Requires:
    - Reason code (minimum 10 characters)
    - Electronic signature
    - Creates full audit trail (Gap AI-101)
    """

    # Validate CAPA exists
    capa = db.query(CAPA).filter(CAPA.capa_id == request.capa_id).first()
    if not capa:
        raise HTTPException(
            status_code=404,
            detail=f"CAPA '{request.capa_id}' not found."
        )

    # Validate electronic signature
    if not request.electronic_signature or request.electronic_signature.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="Electronic signature is required to dismiss an alert."
        )

    # Validate dismissal reason
    if not request.dismissal_reason or len(request.dismissal_reason.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Dismissal reason must be at least 10 characters."
        )

    # Create audit trail for dismissal (Gap AI-101)
    from app.routers.audit_router import create_audit_log
    audit_id = create_audit_log(
        db          = db,
        action_type = "dismiss_alert",
        feature_id  = "AI-101",
        record_id   = request.capa_id,
        username    = username,
        input_data  = {
            "alert_type":         request.alert_type,
            "dismissed_by":       request.dismissed_by,
            "dismissal_reason":   request.dismissal_reason,
        },
        output_data = {
            "electronic_signature": request.electronic_signature,
            "dismissed_at":         str(datetime.now()),
        },
        status = "dismissed"
    )

    return {
        "status":               "Alert dismissed successfully",
        "capa_id":              request.capa_id,
        "alert_type":           request.alert_type,
        "dismissed_by":         request.dismissed_by,
        "dismissal_reason":     request.dismissal_reason,
        "electronic_signature": request.electronic_signature,
        "audit_id":             audit_id,
        "dismissed_at":         datetime.now(),
        "message":              f"✅ Alert dismissed with full audit trail. Audit ID: {audit_id}"
    }