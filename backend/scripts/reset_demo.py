# backend/scripts/reset_demo.py
"""Đưa DB về đúng trạng thái demo. Cầu chì fail-closed: chỉ chạy khi APP_ENV nằm trong tập môi trường an toàn biết trước.

Chạy từ terminal, ngoài docker compose: `.env` không tự export ra biến môi
trường của tiến trình (pydantic-settings chỉ đọc `.env` vào `settings`), nên
phải đặt APP_ENV ngay trên dòng lệnh:

    APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes
"""
import os
import sys

from sqlalchemy import text

from app.core.db import SessionLocal
from app.seed import seed_all

# report_value/report_text có FK ondelete=CASCADE tới report.id (alembic 0001)
# nên xoá report cũng tự dọn chúng — có mặt ở đây là để tường minh, không phải
# lưới an toàn duy nhất. opening_balance và audit_log KHÔNG có FK nào trỏ tới
# report: cascade KHÔNG với tới hai bảng này, bỏ chúng khỏi danh sách là để
# lại dữ liệu cũ thật, không phải lỗi lý thuyết.
BANG_XOA = ["audit_log", "report_text", "report_value", "report", "opening_balance"]

# Tập môi trường được PHÉP chạy lệnh huỷ dữ liệu này — liệt kê rõ, không suy
# diễn. Mọi giá trị khác (kể cả "production") và cả trường hợp thiếu hẳn biến
# đều bị từ chối ở main() — mặc định là TỪ CHỐI, không phải cho phép.
# Nguồn của từng giá trị (tra được, không đoán):
#   local ← infra/docker-compose.yml (dev)
#   test  ← tests/conftest.py (suite pytest)
#   demo  ← Render, nhánh "demo" (Task 28) — nơi script này thật sự chạy trước demo
MOI_TRUONG_AN_TOAN = {"local", "test", "demo"}


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
        hien_tai = "chưa được đặt" if app_env is None else f'"{app_env}"'
        ds_an_toan = ", ".join(sorted(MOI_TRUONG_AN_TOAN))
        print(
            f"APP_ENV đang là {hien_tai}, không thuộc các môi trường an toàn: "
            f"{ds_an_toan}. Từ chối chạy để tránh xoá nhầm dữ liệu thật. Nếu "
            f"đang chạy từ terminal, đặt biến ngay trên dòng lệnh: "
            f"APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes"
        )
        raise SystemExit(1)

    with SessionLocal() as db:
        reset(db)
        db.commit()
    print("reset_demo xong")


if __name__ == "__main__":
    main(sys.argv[1:])
