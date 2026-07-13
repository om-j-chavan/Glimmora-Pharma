# app/routers/ai_router.py
# ─────────────────────────────────────────────────────────────
# Updated for Step 7 — protected with JWT + customer_id filtering
# ─────────────────────────────────────────────────────────────

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.database.db import get_db
from app.ai_service import chat, detect_intent
from app.routers.auth_router import get_current_customer_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


# ── Schemas ───────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role:    str
    content: str

class ChatRequest(BaseModel):
    message:      str
    chat_history: Optional[List[ChatMessage]] = []

class ChatResponse(BaseModel):
    reply:       str
    intent:      Optional[str] = None
    customer_id: Optional[str] = None    # ✅ returned so frontend knows who asked


# ── POST /api/ai/chat ─────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
def ai_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    customer_id: str = Depends(get_current_customer_id),  # ✅ JWT required
):
    """
    Protected AI chat endpoint.
    Requires JWT token in 'auth' header.
    All DB queries are filtered by customer_id from the token.

    Wraps the LLM/DB call in a try/except so unexpected failures come back
    as HTTPException 500 with a JSON body. Returning a raw 500 from an
    uncaught exception bypasses FastAPI's CORS middleware, which makes the
    browser report it as a CORS error instead of an HTTP error.
    """
    try:
        history = [{"role": m.role, "content": m.content} for m in req.chat_history]
        intent  = detect_intent(req.message)

        reply = chat(
            user_message=req.message,
            db=db,
            chat_history=history,
            customer_id=customer_id,        # ✅ pass customer_id to filter DB
        )

        return ChatResponse(reply=reply, intent=intent, customer_id=customer_id)
    except HTTPException:
        # Already a FastAPI exception; let it propagate so the framework
        # serialises it correctly.
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "ai_chat handler failed for customer_id=%s message=%r\n%s",
            customer_id,
            req.message,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=500,
            detail=f"AI chat failed: {type(exc).__name__}: {exc}",
        )


# ── GET /api/ai/health ────────────────────────────────────────
@router.get("/health")
def ai_health():
    return {"status": "AI assistant is running ✅"}