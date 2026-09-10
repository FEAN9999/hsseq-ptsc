# backend/tests/test_get_db_commit.py
"""`get_db()` phải commit khi request xong và rollback khi request lỗi.

KHÔNG dùng fixture `db` và KHÔNG dùng `client` ở đây, có chủ ý. Fixture `db`
của conftest bọc mỗi test trong một transaction ngoài rồi rollback, còn
fixture `client` ghi đè hẳn `get_db` bằng session đó — cả hai làm mọi lần đọc
lại nằm trong CÙNG transaction với lần ghi, nên chúng xanh y hệt nhau dù
`get_db()` có commit hay không. Chính chúng đã che bug "app không bao giờ ghi
xuống đĩa" suốt từ Task 3 qua Task 8/9/10/11.

Cách duy nhất khẳng định được: gọi thẳng `get_db()`, đóng generator (chạy
phần sau `yield`), rồi đọc lại bằng một KẾT NỐI MỚI. Dữ liệu test tự dọn.
"""
import pytest
from sqlalchemy import text

from app.core.db import engine, get_db
from app.core.errors import ConflictError
from app.models import OrgUnit

# `is_reporting=False` là bắt buộc, không phải mặc định cho tiện:
# tests/api/test_seed.py khẳng định đúng 22 đơn vị `is_reporting=True`.
MA = "ZZ-GET-DB-COMMIT"
TEN = "Đơn vị thử commit"


def _doc_bang_ket_noi_moi(ma: str) -> list[tuple]:
    """Kết nối MỚI, ngoài mọi transaction của test — chỉ thấy dữ liệu ĐÃ commit."""
    with engine.connect() as c:
        return c.execute(
            text("SELECT code, name FROM org_unit WHERE code = :ma"), {"ma": ma}
        ).all()


def _don(ma: str) -> None:
    with engine.begin() as c:
        c.execute(text("DELETE FROM org_unit WHERE code = :ma"), {"ma": ma})


def test_get_db_commit_that_su_ghi_xuong_dia():
    _don(MA)
    gen = get_db()
    try:
        db = next(gen)
        db.add(OrgUnit(code=MA, name=TEN, type="member_unit", is_reporting=False))
        db.flush()
        assert _doc_bang_ket_noi_moi(MA) == [], \
            "tiền đề: trước khi đóng generator, kết nối khác chưa được thấy gì"

        with pytest.raises(StopIteration):
            next(gen)               # chạy phần sau `yield`: commit rồi close

        assert _doc_bang_ket_noi_moi(MA) == [(MA, TEN)], \
            "get_db() không commit — mọi thao tác ghi của app là no-op trên thật"
    finally:
        gen.close()
        _don(MA)


def test_get_db_rollback_khi_request_ket_thuc_bang_AppError():
    """409 (và mọi AppError 400/403/404) không được để lại ghi nửa vời.

    `ghi_gia_tri` ném `ConflictError` SAU khi có thể đã ghi — nếu commit đặt
    ở `finally` thay vì ngay sau `yield` thì request lỗi vẫn ghi xuống đĩa.
    """
    _don(MA)
    gen = get_db()
    try:
        db = next(gen)
        db.add(OrgUnit(code=MA, name=TEN, type="member_unit", is_reporting=False))
        db.flush()

        with pytest.raises(ConflictError):
            gen.throw(ConflictError("Người khác vừa sửa báo cáo này"))

        assert _doc_bang_ket_noi_moi(MA) == [], \
            "request lỗi vẫn commit — 409 để lại ghi nửa vời"
    finally:
        gen.close()
        _don(MA)
