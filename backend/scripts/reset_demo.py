# backend/scripts/reset_demo.py
"""Đưa DB về đúng trạng thái demo. Cầu chì fail-closed: chỉ chạy khi APP_ENV nằm trong tập môi trường an toàn biết trước."""
import os
import sys

from sqlalchemy import text

from app.core.db import SessionLocal
from app.seed import seed_all

BANG_XOA = ["audit_log", "report_text", "report_value", "report", "opening_balance"]

# Tập môi trường được PHÉP chạy lệnh huỷ dữ liệu này — liệt kê rõ, không suy
# diễn. Mọi giá trị khác (kể cả "production") và cả trường hợp thiếu hẳn biến
# đều bị từ chối ở main() — mặc định là TỪ CHỐI, không phải cho phép.
MOI_TRUONG_AN_TOAN = {"local", "test", "staging"}


def reset(db) -> None:
    for bang in BANG_XOA:
        db.execute(text(f"DELETE FROM {bang}"))
    db.flush()
    seed_all(db)


def main(argv: list[str]) -> None:
    if "--yes" not in argv:
        print("Cần --yes. Lệnh này xoá toàn bộ báo cáo và nạp lại từ fixture.")
        raise SystemExit(1)

    # Đọc thẳng os.environ, KHÔNG qua app.core.config.settings (settings có
    # default APP_ENV="local") — nếu dùng settings, ca thiếu hẳn biến trên
    # server sẽ bị hiểu nhầm thành "local" và lọt qua cầu chì.
    app_env = os.environ.get("APP_ENV")
    if app_env not in MOI_TRUONG_AN_TOAN:
        hien_tai = "chưa được đặt" if app_env is None else repr(app_env)
        print(
            f"APP_ENV đang là {hien_tai}, không thuộc tập môi trường an toàn "
            f"{sorted(MOI_TRUONG_AN_TOAN)}. Từ chối chạy để tránh xoá nhầm dữ liệu thật."
        )
        raise SystemExit(1)

    with SessionLocal() as db:
        reset(db)
        db.commit()
    print("reset_demo xong")


if __name__ == "__main__":
    main(sys.argv[1:])
