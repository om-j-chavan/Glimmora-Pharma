"""
Database Configuration
-----------------------
SQLite for development.
For production replace DATABASE_URL with PostgreSQL:
  postgresql://user:password@localhost:5432/glimmora_db
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./glimmora.db")

is_sqlite = "sqlite" in DATABASE_URL

# SQLite needs check_same_thread=False; Postgres (Neon) needs pool_pre_ping
# to catch idle-killed connections before SQLAlchemy hands them out.
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine_kwargs = {"connect_args": connect_args}
if not is_sqlite:
    # Neon's serverless tier drops idle connections — pre-ping each checkout
    # so stale ones are quietly replaced instead of failing the next query.
    engine_kwargs["pool_pre_ping"] = True
    # Recycle connections every 5 min to stay well under Neon's idle timeout.
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """
    Dependency injection for FastAPI routes.
    Use with: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()