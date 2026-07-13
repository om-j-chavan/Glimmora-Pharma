# app/routers/auth_router.py
# ─────────────────────────────────────────────────────────────
# JWT auth — DB-backed users with bcrypt password hashing
#   POST /api/v1/auth/signup → create user, return JWT
#   POST /api/v1/auth/login  → verify creds, return JWT
# ─────────────────────────────────────────────────────────────

import os
import bcrypt
import jwt
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database.db import get_db
from app.models.capa_model import User

load_dotenv()

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

import logging

logger = logging.getLogger("uvicorn.error")

# SECRET_KEY signs every JWT. A source-visible hardcoded fallback lets anyone
# forge tokens for any user/tenant, so we never ship one to production: require
# the env var when running in a production environment, and otherwise fall back
# to a clearly-insecure dev default with a loud warning.
def _load_secret_key() -> str:
    key = os.getenv("SECRET_KEY")
    if key:
        return key
    is_production = (
        os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).lower() == "production"
        or os.getenv("RENDER") is not None
    )
    if is_production:
        raise RuntimeError(
            "SECRET_KEY environment variable must be set in production "
            "(no hardcoded fallback is permitted)."
        )
    logger.warning(
        "SECRET_KEY is not set — using an INSECURE development default. "
        "Set SECRET_KEY before deploying to any shared/production environment."
    )
    return "dev-insecure-secret-do-not-use-in-production"


SECRET_KEY = _load_secret_key()
ALGORITHM  = "HS256"


# ── Schemas ──────────────────────────────────────────────────
class SignupRequest(BaseModel):
    user_id:     str = Field(min_length=1, max_length=64)
    username:    str = Field(min_length=1, max_length=50)
    email:       str = Field(min_length=5, max_length=120)
    password:    str = Field(min_length=1, max_length=72)   # bcrypt 72-byte limit; min relaxed to allow short passwords from the frontend
    customer_id: str = Field(min_length=1, max_length=64)
    role:        str = Field(default="user", max_length=32)

    model_config = {
        "json_schema_extra": {
            "example": {
                "user_id":     "USER-001",
                "username":    "ramu",
                "email":       "ramu@example.com",
                "password":    "secret123",
                "customer_id": "CUST_001",
                "role":        "qa_manager",
            }
        }
    }

class LoginRequest(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type:   str
    username:     str
    customer_id:  str
    role:         str
    message:      str


# ── Password helpers ─────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# ── Token helpers ────────────────────────────────────────────
def create_token(username: str, customer_id: str) -> str:
    payload = {
        "sub":         username,
        "customer_id": customer_id,
        "exp":         datetime.utcnow() + timedelta(hours=24),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── Auth dependencies ────────────────────────────────────────
# A protected endpoint requires a valid, unexpired JWT. A missing, malformed,
# or expired token must NEVER silently degrade to a shared "anonymous" identity
# in production — that disables both authentication and tenant isolation across
# the whole API.
#
# Enforcement is environment-gated:
#   • Production (auto-detected on Render, or ENV/ENVIRONMENT=production, or an
#     explicit AI_AUTH_STRICT=1) → a bad/missing token is a hard 401.
#   • Local development → the legacy "anonymous" fallback is preserved so the
#     app runs without a fully-provisioned AI-backend user, but every fallback
#     is logged so it can't pass unnoticed.
ANON_USERNAME    = "anonymous"
ANON_CUSTOMER_ID = "anonymous"


def _auth_strict() -> bool:
    if os.getenv("AI_AUTH_STRICT", "").lower() in ("1", "true", "yes"):
        return True
    if os.getenv("RENDER") is not None:
        return True
    return os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).lower() == "production"


def _normalize(auth: str | None) -> str | None:
    if not auth:
        return None
    # Accept either a bare token or an "Authorization: Bearer <token>" form.
    return auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else auth.strip()


def _decode_token(auth: str | None) -> dict:
    """Decode and validate a JWT. Raises HTTP 401 on any failure."""
    token = _normalize(auth)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        # PyJWT verifies the signature AND the `exp` claim by default, so an
        # expired token raises ExpiredSignatureError here.
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please sign in again.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")


def _decode_safe(auth: str | None) -> dict | None:
    """Best-effort decode for the dev-only anonymous fallback — never raises."""
    token = _normalize(auth)
    if not token:
        return None
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None


def _payload(auth: str | None) -> dict:
    """Resolve the request identity. Enforces 401 in strict environments;
    otherwise returns the anonymous sentinel payload (and logs why)."""
    if _auth_strict():
        payload = _decode_token(auth)
        if not payload.get("sub") or not payload.get("customer_id"):
            raise HTTPException(status_code=401, detail="Invalid authentication token.")
        return payload
    payload = _decode_safe(auth)
    if payload and payload.get("sub") and payload.get("customer_id"):
        return payload
    logger.warning(
        "AI request accepted as anonymous — no valid token (dev fallback). "
        "This path is rejected with 401 in production (AI_AUTH_STRICT / RENDER / ENV=production)."
    )
    return {"sub": ANON_USERNAME, "customer_id": ANON_CUSTOMER_ID}


def verify_token(auth: str | None = Header(default=None)) -> str:
    return _payload(auth)["sub"]


def get_current_customer_id(auth: str | None = Header(default=None)) -> str:
    return _payload(auth)["customer_id"]


class CurrentUser(BaseModel):
    username:    str
    customer_id: str

def get_current_user(auth: str | None = Header(default=None)) -> CurrentUser:
    payload = _payload(auth)
    return CurrentUser(username=payload["sub"], customer_id=payload["customer_id"])


# ── POST /api/v1/auth/signup ─────────────────────────────────
@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.user_id == req.user_id).first():
        raise HTTPException(status_code=409, detail="user_id already exists.")
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=409, detail="Username already taken.")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")

    user = User(
        user_id         = req.user_id,
        username        = req.username,
        email           = req.email,
        hashed_password = hash_password(req.password),
        customer_id     = req.customer_id,
        role            = req.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.username, user.customer_id)
    return AuthResponse(
        access_token = token,
        token_type   = "Bearer",
        username     = user.username,
        customer_id  = user.customer_id,
        role         = user.role,
        message      = f"✅ Account created for {user.username}.",
    )


# ── POST /api/v1/auth/login ──────────────────────────────────
@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_token(user.username, user.customer_id)
    return AuthResponse(
        access_token = token,
        token_type   = "Bearer",
        username     = user.username,
        customer_id  = user.customer_id,
        role         = user.role,
        message      = f"✅ Login successful. Welcome {user.username}!",
    )
