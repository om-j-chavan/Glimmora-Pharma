from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class CAPASource(str, Enum):
    DEVIATION = "Deviation"
    AUDIT     = "Audit"
    COMPLAINT = "Complaint"
    OOS       = "OOS"


class CAPASeverity(str, Enum):
    CRITICAL = "Critical"
    MAJOR    = "Major"
    MINOR    = "Minor"


# ── What user sends ───────────────────────────────────────────
class CAPACreateRequest(BaseModel):
    problem_statement: str = Field(
        ..., min_length=10,
        example="Tablet coating uniformity failure on Coater #3"
    )
    source:            CAPASource  = Field(..., example="Deviation")
    area_affected:     str         = Field(..., example="Manufacturing - Coating Suite")
    equipment_product: str         = Field(..., example="Coater #3")
    initial_severity:  CAPASeverity = Field(..., example="Major")


# ── Sub-model inside response ─────────────────────────────────
class SimilarCAPA(BaseModel):
    capa_id:          str
    similarity_score: float
    description:      str
    was_effective:    bool


# ── What API returns ──────────────────────────────────────────
class CAPACreateResponse(BaseModel):
    capa_id:           str
    customer_id:       str
    status:            str
    created_at:        datetime
    is_recurring:      bool
    similar_capas:     List[SimilarCAPA]
    recurrence_alert:  Optional[str]
    pattern_detected:  Optional[str]
    ai_recommendation: str
    risk_score:        float
    message:           str


# ── Stage 2 RCA ───────────────────────────────────────────────
# Frontend sends only capa_id — AI auto generates 5 Whys
class RCACreateRequest(BaseModel):
    capa_id:     str   = Field(..., example="CAPA-2026-301")
    customer_id: str   = Field(..., example="CUST001")
    rca_method:  str   = Field(..., example="5-Why")
    evidence:    Optional[str] = Field(None, example="Batch record showing wrong temp setting")


class RCACreateResponse(BaseModel):
    rca_id:            str
    capa_id:           str
    customer_id:       str
    rca_method:        str
    root_cause:        str
    advisory_notice:   str
    rca_quality_score: float        # 0 to 100
    quality_rating:    str          # WEAK / MODERATE / STRONG
    depth_check:       str          # AI comment on depth
    evidence_check:    str          # AI comment on evidence
    completeness_check: str         # AI comment on completeness
    systemic_check:    str          # AI comment on systemic thinking
    pattern_detected:  Optional[str]
    recurrence_risk:   str          # LOW / MEDIUM / HIGH
    ai_suggestions:    List[str]    # List of AI improvement suggestions
    message:           str
    created_at:        datetime


# ── Stage 3 Action Plan ───────────────────────────────────────
class ActionItem(BaseModel):
    action_description: str = Field(..., example="Retrain all operators on correct parameters")
    responsible_person: str = Field(..., example="QA Manager")
    due_date:           str = Field(..., example="2026-05-01")


class ActionPlanCreateRequest(BaseModel):
    capa_id:     str            = Field(..., example="CAPA-2026-301")
    customer_id: str            = Field(..., example="CUST001")
    rca_id:      str            = Field(..., example="RCA-2026-101")
    actions:     List[ActionItem]


class ActionPlanCreateResponse(BaseModel):
    action_plan_id:                   str
    capa_id:                          str
    customer_id:                      str
    rca_id:                           str
    total_actions:                    int
    is_cosmetic_capa:                 bool
    cosmetic_alert:                   Optional[str]
    action_to_cause_alignment:        str
    completeness_check:               str
    mismatch_detected:                Optional[str]
    suggested_additional_actions:     List[str]
    effectiveness_prediction_current: str
    effectiveness_prediction_improved: str
    overall_plan_rating:              str        # WEAK / MODERATE / STRONG
    ai_recommendations:               List[str]
    message:                          str
    created_at:                       datetime


# ── Stage 4 Implementation Monitoring ────────────────────────

class ActionStatus(str, Enum):
    ON_TRACK    = "On Track"
    IN_PROGRESS = "In Progress"
    OVERDUE     = "Overdue"
    COMPLETED   = "Completed"

class ActionProgressUpdate(BaseModel):
    action_description: str   = Field(..., example="Retrain all operators")
    responsible_person: str   = Field(..., example="QA Manager")
    due_date:           str   = Field(..., example="2026-05-01")
    status:             ActionStatus = Field(..., example="On Track")
    progress_note:      Optional[str] = Field(None, example="Training scheduled for next week")

class MonitoringRequest(BaseModel):
    capa_id:         str  = Field(..., example="CAPA-2026-301")
    customer_id:     str  = Field(..., example="CUST001")
    action_plan_id:  str  = Field(..., example="AP-2026-201")
    action_updates:  List[ActionProgressUpdate]

class ActionMonitoringResult(BaseModel):
    action_description: str
    responsible_person: str
    due_date:           str
    status:             str
    days_remaining:     int
    is_overdue:         bool
    escalation_level:   Optional[str]

class MonitoringResponse(BaseModel):
    monitoring_id:          str
    capa_id:                str
    customer_id:            str
    action_plan_id:         str
    total_actions:          int
    on_track_count:         int
    overdue_count:          int
    completed_count:        int
    action_results:         List[ActionMonitoringResult]
    owner_accountability:   List[str]
    escalation_alerts:      List[str]
    overall_capa_status:    str
    ai_monitoring_summary:  str
    ai_recommendations:     List[str]
    message:                str
    created_at:             datetime
    
    
# ── Stage 5 Effectiveness Check ───────────────────────────────

class EvidenceItem(BaseModel):
    action_description: str   = Field(..., example="Retrain all operators")
    completed:          bool  = Field(..., example=True)
    evidence_attached:  bool  = Field(..., example=True)
    evidence_note:      Optional[str] = Field(None, example="Training records attached")

class TrendData(BaseModel):
    metric_name:    str   = Field(..., example="Coating defects")
    before_capa:    float = Field(..., example=4.2)
    after_capa:     float = Field(..., example=0.8)
    unit:           str   = Field(..., example="per month")

class EffectivenessRequest(BaseModel):
    capa_id:             str  = Field(..., example="CAPA-2026-301")
    customer_id:         str  = Field(..., example="CUST001")
    action_plan_id:      str  = Field(..., example="AP-2026-201")
    days_since_capa:     int  = Field(..., example=90)
    evidence_items:      List[EvidenceItem]
    trend_data:          List[TrendData]
    new_issues_reported: bool = Field(..., example=False)
    new_issue_details:   Optional[str] = Field(None, example=None)

class EffectivenessResponse(BaseModel):
    effectiveness_id:           str
    capa_id:                    str
    customer_id:                str
    action_plan_id:             str
    # Recurrence Check
    recurrence_check_result:    str
    recurrence_check_details:   str
    # Evidence Verification
    evidence_verified:          bool
    evidence_details:           List[str]
    evidence_gaps:              List[str]
    # Trend Analysis
    trend_improvement:          Optional[float]
    trend_analysis_summary:     str
    # Overall
    effectiveness_score:        float       # 0 to 100
    effectiveness_rating:       str         # EFFECTIVE / PARTIALLY EFFECTIVE / INEFFECTIVE
    capa_can_be_closed:         bool
    closure_recommendation:     str
    ai_summary:                 str
    ai_recommendations:         List[str]
    message:                    str
    created_at:                 datetime
    
# ── Stage 6 CAPA Closure ──────────────────────────────────────

class ClosureRequest(BaseModel):
    capa_id:              str  = Field(..., example="CAPA-2026-301")
    customer_id:          str  = Field(..., example="CUST001")
    effectiveness_id:     str  = Field(..., example="EFF-2026-501")
    # Human Approval (HITL Gate)
    approved_by:          str  = Field(..., example="QA Manager - John Smith")
    designation:          str  = Field(..., example="QA Head")
    electronic_signature: str  = Field(..., example="JS-2026-QA")
    closure_rationale:    str  = Field(..., example="All actions completed with evidence. No recurrence in 90 days.")
    related_capas_reviewed: bool = Field(..., example=True)
    document_changes_approved: bool = Field(..., example=True)

class ClosureResponse(BaseModel):
    closure_id:                  str
    capa_id:                     str
    customer_id:                 str
    effectiveness_id:            str
    # Pre-closure checklist
    actions_completed:           bool
    effectiveness_check_done:    bool
    no_recurrence_detected:      bool
    training_records_verified:   bool
    document_changes_approved:   bool
    related_capas_open:          List[str]
    # AI recommendation
    ai_pre_closure_summary:      str
    ai_recommendation:           str
    ai_closure_approved:         bool
    # Human approval
    approved_by:                 str
    designation:                 str
    electronic_signature:        str
    closure_rationale:           str
    # Final status
    capa_final_status:           str
    closed_at:                   datetime
    message:                     str
    created_at:                  datetime    