from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

# Supavisor session mode qua IPv4; pool nhỏ vì Render free chỉ 1 worker
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """Một session cho mỗi request: COMMIT khi request xong, ROLLBACK khi lỗi.

    `Session.close()` một mình không ghi gì xuống đĩa — nó rollback transaction
    đang mở. Bản cũ chỉ có `try/finally: db.close()` nên mọi thao tác ghi của
    app là no-op trên môi trường thật: `PUT /values` trả 200 kèm version mới,
    `POST /reports` trả 201 kèm id, mà database không có dòng nào. Test không
    thấy vì `tests/conftest.py` ghi đè hẳn dependency này bằng một session sống
    suốt test.

    FastAPI ném ngược exception của route vào generator này, nên `except` bắt
    được cả `AppError` (400/403/404/409): một request 409 không được để lại
    ghi nửa vời. Không nuốt lỗi — `raise` lại để handler ở app/core/errors.py
    còn dựng được thân lỗi.

    Nhánh commit/rollback này KHÔNG chạy trong test dùng fixture `client`.
    Test giữ nó là `tests/test_get_db_commit.py`, gọi thẳng `get_db()` rồi đọc
    lại bằng kết nối MỚI — đừng thay bằng test qua TestClient, nó sẽ xanh cả
    khi commit bị bỏ đi.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
