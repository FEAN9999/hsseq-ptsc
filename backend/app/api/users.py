# backend/app/api/users.py
"""Danh sách tài khoản — chỉ đọc, cho màn "Người dùng" (Lát 8).

Đòi `user.manage`, KHÔNG phải `yeu_cau_xem_bao_cao` như `/templates` hay
`/org-units`: danh mục thì ai nộp báo cáo cũng cần đọc để dựng form, còn danh
sách này gồm email, chức danh và VAI của 24 người — nó trả lời "ai được duyệt
báo cáo của đơn vị nào", tức là chính bản đồ phân quyền. Không có lý do nào để
một người nhập đọc được nó.

Không có `POST`/`PATCH` ở đây: mời tài khoản, gán vai, khoá tài khoản đều là
thao tác giai đoạn 2 (và mỗi thứ kéo theo một đường đi riêng — đặt mật khẩu,
gửi thư). Màn quản trị chỉ ĐỌC, và nói thẳng điều đó thay vì dựng nút chết.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.api.deps import CurrentUser, require_permission
from app.core.db import get_db
from app.models import AppUser, OrgUnit, Permission, Role, RolePermission, UserRole

router = APIRouter(prefix="/users")


@router.get("")
def ds_nguoi_dung(u: CurrentUser = Depends(require_permission("user.manage")),
                  db: Session = Depends(get_db)):
    """24 tài khoản kèm đơn vị, vai (và phạm vi của từng vai), số quyền.

    BA lượt query thay vì một: một người giữ N vai và M quyền, nên gộp tất cả
    vào một JOIN sẽ nhân chéo N×M dòng rồi phải tự gỡ lại trong Python — đúng
    chỗ một `len()` đặt nhầm biến con số quyền thành con số vô nghĩa. Với 24
    tài khoản, ba lượt query rẻ hơn nhiều so với một lượt phải gỡ đúng.
    """
    DV = aliased(OrgUnit)  # đơn vị GHI TRÊN TÀI KHOẢN (app_user.org_unit_id)

    tai_khoan = (
        db.query(AppUser, DV)
        .outerjoin(DV, DV.id == AppUser.org_unit_id)
        .order_by(AppUser.email)
        .all()
    )

    # Phạm vi của vai (`user_role.scope_org_unit_id`) là đơn vị KHÁC với đơn vị
    # trên tài khoản, và hai cột CÓ THỂ LỆCH NHAU — xem docstring `CurrentUser`
    # (app/api/deps.py). Màn quản trị hiện phạm vi của VAI, vì đó mới là thứ
    # quyết định người này đụng được báo cáo của ai.
    PV = aliased(OrgUnit)
    vai_theo_nguoi: dict[int, list[dict]] = {}
    hang_vai = (
        db.query(UserRole.user_id, Role.code, Role.name, PV.code, PV.name)
        .join(Role, Role.id == UserRole.role_id)
        .outerjoin(PV, PV.id == UserRole.scope_org_unit_id)
        .order_by(UserRole.user_id, Role.code)
        .all()
    )
    for user_id, ma_vai, ten_vai, ma_pv, ten_pv in hang_vai:
        vai_theo_nguoi.setdefault(user_id, []).append({
            "code": ma_vai, "name": ten_vai,
            # `None` = không giới hạn phạm vi (toàn Tổng công ty), KHÔNG phải
            # "chưa gán" — với vai reporter thì chính `None` là cấu hình SAI mà
            # `pham_vi_bao_cao` từ chối bằng 403. FE phân biệt hai nghĩa đó
            # theo mã vai, nên ở đây cứ trả nguyên `null`.
            "scope": None if ma_pv is None else {"code": ma_pv, "name": ten_pv},
        })

    # Số quyền HIỆU DỤNG: đếm mã quyền KHÁC NHAU gộp qua mọi vai người đó giữ —
    # `count(distinct)`, không phải `count(*)`. Hai vai chồng nhau (admin_atcl
    # và viewer cùng cấp `dashboard.view`) sẽ đếm thành 2 nếu không distinct,
    # và con số trên màn sẽ vượt cả tổng số quyền có thật.
    so_quyen = dict(
        db.query(UserRole.user_id, func.count(func.distinct(Permission.id)))
        .join(RolePermission, RolePermission.role_id == UserRole.role_id)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .group_by(UserRole.user_id)
        .all()
    )

    return [
        {
            "id": nguoi.id, "email": nguoi.email, "full_name": nguoi.full_name,
            "position": nguoi.position, "active": nguoi.active,
            "org_unit": None if dv is None else {"code": dv.code, "name": dv.name},
            "roles": vai_theo_nguoi.get(nguoi.id, []),
            "permission_count": so_quyen.get(nguoi.id, 0),
        }
        for nguoi, dv in tai_khoan
    ]
