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


def _seed_khung(db):
    """Dựng org + catalog + workflow + kỳ — không nạp fixture.

    Hàm dùng chung, KHÔNG PHẢI fixture pytest (gọi trực tiếp `_seed_khung(db)`,
    không khai báo trong chữ ký test). Dùng cho test chỉ cần khung dữ liệu
    (org/RBAC/catalog/workflow/kỳ) mà không đọc report/report_value — rẻ hơn
    `seed_all(db)` vì bỏ qua `load_fixture()` (nạp CSV) và `_nhap_don_vi_22`.

    test_fixture_loader.py còn dùng hàm này để giữ các test loader độc lập
    với full_synthetic.csv mà `seed_all()` tự nạp — gọi `seed_all(db)` rồi nạp
    thêm CSV nhỏ riêng sẽ đụng UNIQUE(template_id, org_unit_id, period_id) và
    bị sha256 coi là "fixture đã đổi" (xem docstring test_fixture_loader.py).
    """
    from app.seed import (
        _seed_org, _seed_periods, _seed_rbac, _seed_template, _seed_users, _seed_workflow,
    )
    _seed_org(db)
    _seed_rbac(db)
    _seed_users(db)
    tpl = _seed_template(db)
    _seed_workflow(db, tpl)
    _seed_periods(db, tpl)
    db.flush()
    return tpl
