# backend/app/core/errors.py
#
# KHÔNG có trong danh sách "Create" của task-8-brief.md — file này chính thức
# thuộc Task 9 ("Bảng mã lỗi", tạo AppError + 5 lớp con, dang_ky_handler()).
# Nhưng api/deps.py (Task 8, Step 4, code cho sẵn trong brief) import thẳng
# `ForbiddenError`/`UnauthorizedError` từ đây — thiếu file này app không chạy
# được. Tạo bản tối thiểu, chỉ 2 lớp Task 8 cần, subclass thẳng
# fastapi.HTTPException (không tự bịa AppError base — đó là việc của Task 9).
# Tên lớp, đối số `detail: str` dương, thuộc tính `.detail` khớp đúng test
# `test_moi_cau_loi_deu_tieng_viet` đã đọc trước trong
# docs/superpowers/plans/2026-09-09-hseq-mvp-fm01.md (Task 9 Step 1) — Task 9
# mở rộng file này (thêm AppError, ValidationError, NotFoundError,
# ConflictError, dang_ky_handler), không cần viết lại 2 lớp dưới đây.
from fastapi import HTTPException


class UnauthorizedError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=401, detail=detail)


class ForbiddenError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=403, detail=detail)
