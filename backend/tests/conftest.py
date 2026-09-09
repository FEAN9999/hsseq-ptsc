import os

os.environ.setdefault("JWT_SECRET", "test-secret-chi-dung-trong-pytest-0123456789")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://hseq:hseq@localhost:55432/hseq_test",
    ),
)

import pytest
from fastapi.testclient import TestClient

from app.core.db import SessionLocal, engine
from app.main import app


@pytest.fixture()
def db():
    """Mỗi test một transaction, rollback ở cuối — không dọn tay."""
    conn = engine.connect()
    trans = conn.begin()
    session = SessionLocal(bind=conn)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture()
def client(db):
    from app.core.db import get_db

    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
