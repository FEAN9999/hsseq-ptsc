# backend/tests/conftest_query.py
import contextlib

from sqlalchemy import event


@contextlib.contextmanager
def dem_query(engine):
    """Đếm SELECT thật sự gửi xuống Postgres — ngân sách form và dashboard là 2.

    Đếm cả câu mở đầu bằng `WITH` (CTE): `WITH x AS (...) SELECT ...` là một
    round-trip y hệt một SELECT thường. Chỉ bắt tiền tố "SELECT" thì Task 13
    (`GET /dashboard/*`, cũng ràng buộc ≤ 2 query, và dashboard là chỗ hay
    viết CTE nhất) sẽ được cho qua trong im lặng.
    """
    dem = {"n": 0}

    def _before(conn, cursor, statement, *a):
        if statement.lstrip().upper().startswith(("SELECT", "WITH")):
            dem["n"] += 1

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield dem
    finally:
        event.remove(engine, "before_cursor_execute", _before)
