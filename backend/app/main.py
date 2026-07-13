import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.db import engine, Base
from app.routers import (
    user_router, capa_router, rca_router, action_plan_router,
    monitoring_router, auth_router, effectiveness_router,
    closure_router, ai_router, audit_router, voice_router,
)
import app.models.capa_model  # ensures tables are registered

app = FastAPI(title="Glimmora Pharma AI API")

# CORS — read allowed origins from env so prod/dev differ without a code change.
# Format: comma-separated list, e.g. "http://localhost:3000,https://myapp.com"
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(auth_router.router)
app.include_router(audit_router.router)
app.include_router(user_router.router)
app.include_router(capa_router.router)
app.include_router(rca_router.router)
app.include_router(action_plan_router.router)
app.include_router(monitoring_router.router)
app.include_router(effectiveness_router.router)
app.include_router(closure_router.router)
app.include_router(ai_router.router)
app.include_router(voice_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def home():
    return {"message": "Glimmora Pharma AI backend is running"}
