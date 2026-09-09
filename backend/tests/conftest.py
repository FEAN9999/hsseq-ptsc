import os
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "test-secret-chi-dung-trong-pytest-0123456789")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://hseq:hseq@localhost:55432/hseq_test",
    ),
)
# seed_all() gọi load_fixture() ngầm — trỏ CHẮC CHẮN sang bộ số tổng hợp giả
# (tests/fixtures/full_synthetic.csv, sinh bởi gen_fixture.py), không phải
# setdefault: nếu để lọt biến FIXTURE_CSV thật từ môi trường ngoài, test sẽ
# nạp nhầm file thật (hoặc rỗng) và đỏ khó hiểu.
os.environ["FIXTURE_CSV"] = str(Path(__file__).parent / "fixtures" / "full_synthetic.csv")

import pytest
from fastapi.testclient import TestClient

from app.core.db import SessionLocal, engine
from app.main import app


@pytest.fixture()
def db():
    """Mỗi test một transaction, rollback ở cuối — không dọn tay.

    `join_transaction_mode="create_savepoint"` là bắt buộc, không phải trang trí.
    Mặc định của SQLAlchemy 2.0 là `conditional_savepoint`, và với `conn.begin()`
    thường nó rơi về `rollback_only`: `db.commit()` không chạm DB (chỗ này an
    toàn), NHƯNG `db.rollback()` huỷ luôn transaction ngoài của fixture. Mọi thứ
    ghi sau lần rollback đó nằm ngoài tầm `trans.rollback()` và rò thẳng vào
    `hseq_test`. Code thật có gọi rollback (nhánh `except` của handler, audit lỗi
    trong `apply_transition`), nên đây là đường rò có thật, đo được: 1 dòng rò ở
    chế độ mặc định, 0 dòng với `create_savepoint`.
    """
    conn = engine.connect()
    trans = conn.begin()
    session = SessionLocal(bind=conn, join_transaction_mode="create_savepoint")
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
