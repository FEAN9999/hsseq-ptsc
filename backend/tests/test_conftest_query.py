# backend/tests/test_conftest_query.py
"""task-11-carry.md C2. `dem_query` (tests/conftest_query.py) đếm cả câu bắt
đầu bằng `WITH` (CTE) từ Task 11 trở đi — không có test nào khoá riêng việc
đó, controller đã đo: hoàn tác dòng `WITH` trong `_before()` thì cả suite
vẫn xanh. Test thẳng bộ đếm, không qua HTTP/seed."""
from sqlalchemy import text

from app.core.db import engine
from tests.conftest_query import dem_query


def test_dem_query_dem_ca_cau_bat_dau_bang_with():
    with dem_query(engine) as d:
        with engine.connect() as conn:
            conn.execute(text("WITH x AS (SELECT 1) SELECT * FROM x"))
    assert d["n"] == 1
