from fastapi import APIRouter, Response
from sqlalchemy import text

from app.core.db import engine

router = APIRouter()


def ping_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


@router.get("/health")
def health(response: Response):
    try:
        ping_db()
    except Exception:
        response.status_code = 503
        return {"status": "down"}
    return {"status": "ok"}
