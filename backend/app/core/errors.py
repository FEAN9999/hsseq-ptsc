# backend/app/core/errors.py
#
# Bảng mã lỗi thống nhất (task-9-brief.md, spec D10). Task 8 từng để tạm
# bản tối thiểu (UnauthorizedError/ForbiddenError subclass thẳng
# fastapi.HTTPException, chỉ đủ cho api/deps.py chạy) — Task 9 mở rộng
# thành AppError + 5 lớp con dưới đây và đăng ký dang_ky_handler() ở
# app/main.py. Mọi endpoint từ Task 10 trở đi ném lỗi qua đây.
#
# UnauthorizedError/ForbiddenError giờ subclass AppError (không còn là
# HTTPException) nên không còn được FastAPI tự xử lý — bắt buộc phải có
# dang_ky_handler(app) đăng ký ở main.py, nếu không request nào raise các
# lớp này sẽ rơi thành 500.
#
# `status_code` là alias tương thích ngược của `status`: tests/api/test_auth.py
# (Task 8) gọi thẳng require_permission()/pham_vi_bao_cao() rồi bắt
# ForbiddenError bằng pytest.raises và đọc `loi.value.status_code` ngay trên
# đối tượng lỗi (không qua HTTP) — hành vi thừa hưởng từ hồi ForbiddenError
# còn là HTTPException (vốn có `.status_code`). Bỏ alias này sẽ làm 3 test
# đó đỏ dù logic phân quyền không đổi gì.
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


class AppError(Exception):
    status = 400

    def __init__(self, detail: str, **extra):
        self.detail = detail
        self.extra = extra
        super().__init__(detail)

    @property
    def status_code(self) -> int:
        return self.status

    def body(self) -> dict:
        return {"detail": self.detail, **self.extra}


class ValidationError(AppError):   status = 400
class UnauthorizedError(AppError): status = 401
class ForbiddenError(AppError):    status = 403
class NotFoundError(AppError):     status = 404
class ConflictError(AppError):     status = 409


def dang_ky_handler(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handler(_: Request, e: AppError):
        return JSONResponse(status_code=e.status, content=jsonable_encoder(e.body()))
