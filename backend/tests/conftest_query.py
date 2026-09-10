# backend/tests/conftest_query.py
import contextlib

from sqlalchemy import event


@contextlib.contextmanager
def dem_query(engine):
    """Đếm SELECT thật sự gửi xuống Postgres — ngân sách form và dashboard là 2."""
    dem = {"n": 0}

    def _before(conn, cursor, statement, *a):
        if statement.lstrip().upper().startswith("SELECT"):
            dem["n"] += 1

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield dem
    finally:
        event.remove(engine, "before_cursor_execute", _before)
