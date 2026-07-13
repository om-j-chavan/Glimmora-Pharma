# app/routers/voice_router.py
# ─────────────────────────────────────────────────────────────
# Voice endpoints (OpenAI Whisper STT + TTS)
# POST /api/ai/voice/transcribe  → audio → text   (Whisper)
# POST /api/ai/voice/speak       → text  → audio  (TTS)
# POST /api/ai/voice/chat        → audio → text → AI reply → audio
# ─────────────────────────────────────────────────────────────

import os
import io
from openai import OpenAI
from dotenv import load_dotenv
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.routers.auth_router import get_current_customer_id

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(prefix="/api/ai/voice", tags=["AI Voice"])

EXTENSION_MAP = {
    "audio/webm": "webm",
    "audio/mp4":  "mp4",
    "audio/mpeg": "mp3",
    "audio/wav":  "wav",
    "audio/ogg":  "ogg",
    "audio/flac": "flac",
}
VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]

# Domain vocabulary — biases Whisper toward Glimmora/QMS terms
# so it stops mishearing "CAPAs" as "couples", "RCA" as "are see a", etc.
GLIMMORA_VOCAB = (
    "Glimmora, CAPA, CAPAs, RCA, RCAs, action plan, action plans, "
    "effectiveness check, closure, monitoring, implementation monitoring, "
    "quality management, deviation, severity, root cause, "
    "corrective action, preventive action, audit trail, customer ID"
)


class SpeakRequest(BaseModel):
    text:  str
    voice: str = "nova"


# ─────────────────────────────────────────────────────────────
# 1. POST /api/ai/voice/transcribe   audio → text
# ─────────────────────────────────────────────────────────────
@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    customer_id: str  = Depends(get_current_customer_id),
):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    content_type = audio.content_type or "audio/webm"
    ext          = EXTENSION_MAP.get(content_type, "webm")
    filename     = f"audio.{ext}"

    print(f"[Voice] Transcribe | {len(audio_bytes)} bytes | {content_type}")

    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_bytes, content_type),
            language="en",
            prompt=GLIMMORA_VOCAB,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    text = transcript.text.strip()
    print(f"[Voice] Transcribed: '{text}'")

    return {"text": text, "customer_id": customer_id}


# ─────────────────────────────────────────────────────────────
# 2. POST /api/ai/voice/speak        text → audio
# ─────────────────────────────────────────────────────────────
@router.post("/speak")
async def speak(
    req: SpeakRequest,
    customer_id: str = Depends(get_current_customer_id),
):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    voice = req.voice if req.voice in VALID_VOICES else "nova"
    print(f"[Voice] Speak | voice={voice} | {len(req.text)} chars")

    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=req.text,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")

    return StreamingResponse(
        io.BytesIO(response.content),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=reply.mp3"},
    )


# ─────────────────────────────────────────────────────────────
# 3. POST /api/ai/voice/chat         audio → AI reply audio
# ─────────────────────────────────────────────────────────────
@router.post("/chat")
async def voice_chat(
    audio:        UploadFile = File(...),
    chat_history: str | None = Form(default=None),
    customer_id:  str        = Depends(get_current_customer_id),
):
    """
    chat_history is an optional JSON-encoded list of {role, content}
    objects (multipart/form-data field). Sending it lets a voice turn
    share context with prior text turns in the same conversation, so
    short / vague utterances get answered in context instead of falling
    back to the generic 'I'm here for CAPA queries' intro.
    """
    from app.database.db import SessionLocal
    from app.ai_service import chat, detect_intent

    audio_bytes  = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    content_type = audio.content_type or "audio/webm"
    ext          = EXTENSION_MAP.get(content_type, "webm")
    filename     = f"audio.{ext}"

    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_bytes, content_type),
            language="en",
            prompt=GLIMMORA_VOCAB,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    user_text = transcript.text.strip()
    print(f"[Voice Chat] User: '{user_text}'")

    # Parse chat_history if provided. Tolerate malformed input — we'd
    # rather drop the history than 500 the request.
    history_list = []
    if chat_history:
        try:
            import json
            parsed = json.loads(chat_history)
            if isinstance(parsed, list):
                history_list = [
                    {"role": str(m.get("role", "user")), "content": str(m.get("content", ""))}
                    for m in parsed
                    if isinstance(m, dict)
                ]
        except Exception as e:
            print(f"[Voice Chat] chat_history parse failed: {e}")

    db = SessionLocal()
    try:
        try:
            ai_reply = chat(
                user_message=user_text,
                db=db,
                chat_history=history_list,
                customer_id=customer_id,
            )
        except Exception as e:
            # Don't let chat() bubble a raw 500 — FastAPI's default 500
            # bypasses CORSMiddleware and the browser reports it as a
            # CORS / 'Failed to fetch' error.
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Chat failed: {type(e).__name__}: {e}")
    finally:
        db.close()

    print(f"[Voice Chat] AI:   '{ai_reply}'")

    try:
        tts_response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=ai_reply,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")

    # HTTP headers must be ASCII (latin-1) compatible. Replies may contain
    # emojis or non-ASCII chars which crash the response with
    # UnicodeEncodeError — also a silent-500 source. URL-encode them and
    # the frontend decodes via decodeURIComponent.
    from urllib.parse import quote
    return StreamingResponse(
        io.BytesIO(tts_response.content),
        media_type="audio/mpeg",
        headers={
            "X-User-Text": quote(user_text, safe=""),
            "X-AI-Reply":  quote(ai_reply,  safe=""),
            "X-Intent":    quote(detect_intent(user_text), safe=""),
            "Access-Control-Expose-Headers": "X-User-Text, X-AI-Reply, X-Intent",
        },
    )


@router.get("/health")
def voice_health():
    return {
        "status": "Voice endpoints running ✅",
        "endpoints": {
            "transcribe": "POST /api/ai/voice/transcribe",
            "speak":      "POST /api/ai/voice/speak",
            "voice_chat": "POST /api/ai/voice/chat",
        },
        "voices": VALID_VOICES,
    }
