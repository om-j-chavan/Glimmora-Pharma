from sqlalchemy import Column, String, Boolean, Float, JSON, DateTime, Integer
from datetime import datetime
from app.database.db import Base
from sqlalchemy.sql import func


class User(Base):
    __tablename__ = "users"

    user_id         = Column(String, primary_key=True, index=True)
    username        = Column(String, unique=True, nullable=False, index=True)
    email           = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    customer_id     = Column(String, nullable=False, index=True)
    role            = Column(String, default="user")
    created_at      = Column(DateTime, default=func.now())


class CAPA(Base):
    __tablename__ = "capas"

    capa_id           = Column(String,  primary_key=True, index=True)
    customer_id       = Column(String, nullable=False)
    problem_statement = Column(String, nullable=False)
    source            = Column(String,  nullable=False)
    area_affected     = Column(String,  nullable=False)
    equipment_product = Column(String,  nullable=False)
    initial_severity  = Column(String,  nullable=False)
    status            = Column(String,  default="Open")
    is_recurring      = Column(Boolean, default=False)
    risk_score        = Column(Float,   default=0.0)
    ai_result         = Column(JSON,    nullable=True)
    created_at        = Column(DateTime, default=datetime.now)
    
class RCA(Base):                          # ← NEW TABLE
    __tablename__ = "rcas"

    rca_id               = Column(String, primary_key=True)
    capa_id              = Column(String, nullable=False)
    customer_id          = Column(String, nullable=False)
    rca_method           = Column(String)
    root_cause           = Column(String)
    contributing_factors = Column(String)
    why_1                = Column(String)
    why_2                = Column(String)
    why_3                = Column(String, nullable=True)
    why_4                = Column(String, nullable=True)
    why_5                = Column(String, nullable=True)
    evidence             = Column(String, nullable=True)
    rca_quality_score    = Column(Float, default=0.0)
    quality_rating       = Column(String)
    recurrence_risk      = Column(String)
    ai_result            = Column(JSON)
    created_at           = Column(DateTime, default=func.now())

class ActionPlan(Base):
    __tablename__ = "action_plans"

    action_plan_id                    = Column(String, primary_key=True)
    capa_id                           = Column(String, nullable=False)
    customer_id                       = Column(String, nullable=False)
    rca_id                            = Column(String, nullable=False)
    actions                           = Column(JSON)
    is_cosmetic_capa                  = Column(Boolean, default=False)
    overall_plan_rating               = Column(String)
    effectiveness_prediction_current  = Column(String)
    effectiveness_prediction_improved = Column(String)
    ai_result                         = Column(JSON)
    created_at                        = Column(DateTime, default=func.now())

class ImplementationMonitoring(Base):
    __tablename__ = "monitoring"

    monitoring_id        = Column(String, primary_key=True)
    capa_id              = Column(String, nullable=False)
    customer_id          = Column(String, nullable=False)
    action_plan_id       = Column(String, nullable=False)
    action_updates       = Column(JSON)
    overdue_count        = Column(Integer, default=0)
    on_track_count       = Column(Integer, default=0)
    completed_count      = Column(Integer, default=0)
    escalation_alerts    = Column(JSON)
    overall_capa_status  = Column(String)
    ai_result            = Column(JSON)
    created_at           = Column(DateTime, default=func.now())
    
    
class EffectivenessCheck(Base):
    __tablename__ = "effectiveness_checks"

    effectiveness_id        = Column(String, primary_key=True)
    capa_id                 = Column(String, nullable=False)
    customer_id             = Column(String, nullable=False)
    action_plan_id          = Column(String, nullable=False)
    days_since_capa         = Column(Integer, default=0)
    evidence_items          = Column(JSON)
    trend_data              = Column(JSON)
    new_issues_reported     = Column(Boolean, default=False)
    effectiveness_score     = Column(Float, default=0.0)
    effectiveness_rating    = Column(String)
    capa_can_be_closed      = Column(Boolean, default=False)
    ai_result               = Column(JSON)
    created_at              = Column(DateTime, default=func.now())

class CAPAClosure(Base):
    __tablename__ = "capa_closures"

    closure_id                 = Column(String, primary_key=True)
    capa_id                    = Column(String, nullable=False)
    customer_id                = Column(String, nullable=False)
    effectiveness_id           = Column(String, nullable=False)
    actions_completed          = Column(Boolean, default=False)
    effectiveness_check_done   = Column(Boolean, default=False)
    no_recurrence_detected     = Column(Boolean, default=False)
    training_records_verified  = Column(Boolean, default=False)
    document_changes_approved  = Column(Boolean, default=False)
    related_capas_open         = Column(JSON)
    ai_closure_approved        = Column(Boolean, default=False)
    approved_by                = Column(String)
    designation                = Column(String)
    electronic_signature       = Column(String)
    closure_rationale          = Column(String)
    capa_final_status          = Column(String)
    closed_at                  = Column(DateTime)
    ai_result                  = Column(JSON)
    created_at                 = Column(DateTime, default=func.now())

    