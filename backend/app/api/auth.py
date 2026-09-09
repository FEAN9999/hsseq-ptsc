# backend/app/api/auth.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, current_user
from app.core.db import get_db
from app.core.errors import UnauthorizedError
from app.core.security import kiem_mat_khau, tao_token
from app.models import AppUser, OrgUnit, Role, UserRole

router = APIRouter(prefix="/auth")

SAI_DANG_NHAP = "Sai email hoặc mật khẩu"


class DangNhapRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(payload: DangNhapRequest, db: Session = Depends(get_db)):
    # sai email HOẶC sai mật khẩu HOẶC tài khoản bị vô hiệu hoá đều trả cùng
    # một câu — không lộ tài khoản có tồn tại hay đã bị khoá
    user = db.query(AppUser).filter_by(email=payload.email).one_or_none()
    if (user is None or not kiem_mat_khau(payload.password, user.password_hash)
            or not user.active):
        raise UnauthorizedError(SAI_DANG_NHAP)
    return {"access_token": tao_token(user.id), "token_type": "bearer"}


@router.get("/me")
def me(u: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    user = db.query(AppUser).filter_by(id=u.id).one()
    org_unit = db.query(OrgUnit).filter_by(id=u.org_unit_id).one()
    ma_vai_tro = (
        db.query(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == u.id)
        .all()
    )
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "position": user.position,
        },
        "roles": sorted({ma for (ma,) in ma_vai_tro}),
        "permissions": sorted(u.permissions),
        "org_unit": {"id": org_unit.id, "code": org_unit.code, "name": org_unit.name},
    }
