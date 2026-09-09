"""Fixture `db` phải cô lập được cả khi code gọi rollback, không chỉ commit."""
import pytest
from sqlalchemy import text

from app.core.db import engine

BANG = "_thu_co_lap"


@pytest.fixture(scope="module", autouse=True)
def _bang_thu():
    # tạo NGOÀI transaction của fixture db, nếu không rollback sẽ xoá luôn bảng
    with engine.begin() as c:
        c.execute(text(f"DROP TABLE IF EXISTS {BANG}"))
        c.execute(text(f"CREATE TABLE {BANG} (id int)"))
    yield
    with engine.begin() as c:
        c.execute(text(f"DROP TABLE {BANG}"))


def test_rollback_giua_test_khong_lam_ro_du_lieu(db):
    db.execute(text(f"INSERT INTO {BANG} VALUES (1)"))
    db.rollback()                       # đúng như nhánh except của handler
    db.execute(text(f"INSERT INTO {BANG} VALUES (2)"))
    db.commit()
    assert db.execute(text(f"SELECT count(*) FROM {BANG}")).scalar() == 1


def test_khong_con_dong_nao_sot_lai(db):
    assert db.execute(text(f"SELECT count(*) FROM {BANG}")).scalar() == 0
