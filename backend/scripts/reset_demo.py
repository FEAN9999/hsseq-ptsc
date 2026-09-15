# backend/scripts/reset_demo.py
"""Đưa DB về đúng trạng thái demo. Cầu chì fail-closed: chỉ chạy khi APP_ENV nằm trong tập môi trường an toàn biết trước.

Chạy từ terminal, ngoài docker compose: `.env` không tự export ra biến môi
trường của tiến trình (pydantic-settings chỉ đọc `.env` vào `settings`), nên
phải đặt APP_ENV ngay trên dòng lệnh:

    APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes

Mã thoát: 0 khi nạp được ít nhất một báo cáo; 1 khi bị cầu chì chặn, HOẶC khi
chạy trót lọt mà nạp được 0 báo cáo (file fixture không có / sha đổi / fixture
rỗng) — lệnh này chỉ có một mục đích là nạp dữ liệu demo, nạp 0 luôn là hỏng.
"""
import os
import sys

from sqlalchemy import text

from app.core.db import SessionLocal
from app.seed import seed_all
from app.seed.fixture import LoadResult

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


def reset(db) -> LoadResult:
    for bang in BANG_XOA:
        db.execute(text(f"DELETE FROM {bang}"))
    db.flush()
    return seed_all(db)


def main(argv: list[str]) -> None:
    if "--yes" not in argv:
        print("Cần --yes. Lệnh này xoá toàn bộ báo cáo và nạp lại từ fixture.")
        raise SystemExit(1)

    # Đọc thẳng os.environ, KHÔNG qua app.core.config.settings (settings có
    # default APP_ENV="local") — nếu dùng settings, ca thiếu hẳn biến trên
    # server sẽ bị hiểu nhầm thành "local" và lọt qua cầu chì.
    app_env = os.environ.get("APP_ENV")
    if app_env not in MOI_TRUONG_AN_TOAN:
        # Dựng nguyên MỆNH ĐỀ đầu, KHÔNG nhét một cụm vào giữa khung cố định
        # "APP_ENV đang là {…}": nhét cụm thì ca thiếu biến in ra "APP_ENV đang
        # là chưa được đặt, …" — sai ngữ pháp, và người đọc câu này đang cứu hộ
        # giữa buổi demo. Ca canh: tests/api/test_reset_demo.py::
        # test_thong_bao_tu_choi_neu_ro_gia_tri_APP_ENV_hien_tai (khoá nguyên
        # mệnh đề bằng startswith, không phải dò mẩu chuỗi).
        ve_dau = ("APP_ENV chưa được đặt" if app_env is None
                  else f'APP_ENV đang là "{app_env}"')
        ds_an_toan = ", ".join(sorted(MOI_TRUONG_AN_TOAN))
        print(
            f"{ve_dau}, không thuộc các môi trường an toàn: "
            f"{ds_an_toan}. Từ chối chạy để tránh xoá nhầm dữ liệu thật. Nếu "
            f"đang chạy từ terminal, đặt biến ngay trên dòng lệnh: "
            f"APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes"
        )
        raise SystemExit(1)

    with SessionLocal() as db:
        kq = reset(db)
        db.commit()

    # Câu hỏi DUY NHẤT người gõ lệnh đang hỏi là "đã nạp được gì", không phải
    # "đã chạy xong chưa". Bản cũ in đúng một dòng "reset_demo xong" kể cả khi
    # nạp 0 báo cáo — dashboard trống, và người đi tìm lỗi ở Render/Supabase/CORS.
    print(f"Đã nạp {kq.created_reports} báo cáo.")
    if kq.skipped:
        print(f"Bỏ qua {kq.skipped} dòng chỉ tiêu tự tính (computed) — đúng thiết kế, không lưu.")
    for canh_bao in kq.warnings:
        print(f"CẢNH BÁO: {canh_bao}")

    if kq.created_reports == 0:
        # Lệnh này chỉ có một mục đích: nạp dữ liệu demo. Nạp được 0 báo cáo
        # luôn là chuyện bất thường ⇒ mã thoát ≠ 0, để cả người lẫn script
        # deploy đều thấy. Nêu LẠI nguyên nhân ngay trong câu cuối: người đang
        # cứu hộ giữa buổi demo đọc dòng cuối trước khi đọc các dòng trên.
        ly_do = "; ".join(kq.warnings) or "fixture không có dòng dữ liệu nào"
        print(
            f"KHÔNG nạp được báo cáo nào ({ly_do}) — dashboard sẽ TRỐNG. "
            f"Sửa file fixture, hoặc trỏ biến FIXTURE_CSV sang đúng file, "
            f"rồi chạy lại lệnh này."
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
