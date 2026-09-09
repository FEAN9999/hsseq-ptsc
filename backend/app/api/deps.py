# backend/app/api/deps.py
from dataclasses import dataclass

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import doc_token
from app.models import AppUser, Permission, RolePermission, UserRole


@dataclass
class CurrentUser:
    id: int
    org_unit_id: int | None
    permissions: set[str]
    # permission code → org_unit_id được phép; None = toàn TCT
    scope: dict[str, int | None]


def current_user(authorization: str = Header(default=""),
                 db: Session = Depends(get_db)) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Chưa đăng nhập hoặc phiên đã hết hạn")
    uid = doc_token(authorization[7:])
    if uid is None:
        raise UnauthorizedError("Chưa đăng nhập hoặc phiên đã hết hạn")

    # Một query join: AppUser LEFT JOIN UserRole LEFT JOIN RolePermission LEFT
    # JOIN Permission. Cố ý LEFT (không INNER): user chưa được gán quyền nào
    # vẫn phải xác thực được (permissions rỗng) — INNER sẽ biến "có token hợp
    # lệ nhưng chưa có quyền" thành "không tìm thấy user" (401 sai chỗ, đáng lẽ
    # phải đi tiếp tới require_permission() để trả 403 đúng nghĩa).
    hang = (
        db.query(AppUser, Permission.code, UserRole.scope_org_unit_id)
        .outerjoin(UserRole, UserRole.user_id == AppUser.id)
        .outerjoin(RolePermission, RolePermission.role_id == UserRole.role_id)
        .outerjoin(Permission, Permission.id == RolePermission.permission_id)
        .filter(AppUser.id == uid)
        .all()
    )
    if not hang:
        raise UnauthorizedError("Chưa đăng nhập hoặc phiên đã hết hạn")

    user = hang[0][0]
    permissions = {ma for _, ma, _ in hang if ma is not None}
    scope = {ma: pham_vi for _, ma, pham_vi in hang if ma is not None}

    return CurrentUser(
        id=user.id, org_unit_id=user.org_unit_id,
        permissions=permissions, scope=scope,
    )


def require_permission(code: str):
    def _kiem(u: CurrentUser = Depends(current_user)) -> CurrentUser:
        if code not in u.permissions:
            raise ForbiddenError("Bạn không có quyền thực hiện thao tác này")
        return u
    return _kiem


def scope_org_unit_ids(u: CurrentUser, code: str) -> set[int] | None:
    """None = toàn TCT. Với quyền phạm vi đơn vị mà scope NULL → 403, KHÔNG mở toàn bộ."""
    if code == "report.view_all" and code in u.permissions:
        return None
    if "report.view_own_unit" in u.permissions:
        dv = u.scope.get("report.view_own_unit")
        if dv is None:
            raise ForbiddenError(
                "Tài khoản chưa được gán đơn vị. Liên hệ Ban ATCL để cấp lại quyền.")
        return {dv}
    raise ForbiddenError("Bạn không có quyền xem báo cáo")
