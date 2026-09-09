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
    """Người dùng đã xác thực trong request hiện tại — kết quả của `current_user()`.

    `org_unit_id` LẤY TỪ `app_user.org_unit_id`. Đây KHÔNG PHẢI nguồn phân
    quyền — chỉ để hiển thị (ví dụ tên đơn vị trên sidebar). Muốn biết
    "đơn vị của mình" khi tạo báo cáo (`POST /reports`) hay bất kỳ quyết
    định xem/sửa nào khác, PHẢI dùng `pham_vi_bao_cao(u)`, không được đọc
    cột này — phạm vi thật nằm ở vai trò (`user_role.scope_org_unit_id`) và
    hai cột CÓ THỂ LỆCH NHAU (một người có thể được cấp vai ở đơn vị khác
    đơn vị ghi trên tài khoản của mình).

    `scope[ma_quyen]` — mỗi mã quyền có mặt trong `permissions` có đúng một
    mục ở đây, gộp (union) từ MỌI vai trò người dùng đang giữ:
      - `None`               → quyền không giới hạn phạm vi (một trong các
        vai cấp quyền này có `scope_org_unit_id IS NULL`; `None` LUÔN
        thắng khi gộp nhiều vai, dù vai khác cấp cùng quyền với phạm vi
        hẹp hơn — không bao giờ bị ghi đè ngược lại).
      - `set[int]` khác rỗng → quyền chỉ áp dụng cho đúng các `org_unit_id`
        trong tập đó (hợp từ mọi vai đang giữ quyền này với phạm vi cụ thể).
    KHÔNG BAO GIỜ tự suy luận trạng thái bằng cách kiểm tra khoá có nằm
    trong `scope` hay không — luôn kiểm `code in permissions` TRƯỚC. Mã
    quyền không có trong `permissions` thì cũng không có trong `scope`, và
    không liên quan gì tới phạm vi (đơn giản là không có quyền đó). Cách
    đọc đúng cho gần như mọi trường hợp là gọi `pham_vi_bao_cao(u)`, không
    tự tay đọc `u.scope[...]` ở nơi khác.
    """
    id: int
    org_unit_id: int | None
    permissions: set[str]
    scope: dict[str, set[int] | None]


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
    if not user.active:
        # Tài khoản bị vô hiệu hoá (thao tác thật: UPDATE app_user SET
        # active=false, vd người phụ trách chuyển công tác) — token đã cấp
        # trước đó phải mất hiệu lực ngay, không chờ hết hạn 12 giờ. Dùng
        # chung câu 401 với "chưa đăng nhập" — không lộ lý do tài khoản bị khoá.
        raise UnauthorizedError("Chưa đăng nhập hoặc phiên đã hết hạn")

    # Gộp (union) scope theo mã quyền qua mọi vai trò, KHÔNG để vai xuất
    # hiện sau trong kết quả LEFT JOIN ghi đè vai trước (dict comprehension
    # cũ làm vậy). None (không giới hạn phạm vi) luôn thắng khi gộp: nếu
    # một vai đã cấp quyền này không giới hạn thì người dùng coi như không
    # giới hạn với quyền đó, bất kể vai khác cấp phạm vi hẹp hơn thế nào.
    permissions: set[str] = set()
    scope: dict[str, set[int] | None] = {}
    for _, ma, pham_vi in hang:
        if ma is None:
            continue
        permissions.add(ma)
        if ma not in scope:
            scope[ma] = None if pham_vi is None else {pham_vi}
        elif scope[ma] is not None:
            if pham_vi is None:
                scope[ma] = None
            else:
                scope[ma].add(pham_vi)

    return CurrentUser(
        id=user.id, org_unit_id=user.org_unit_id,
        permissions=permissions, scope=scope,
    )


def require_permission(code: str):
    """Factory dependency FastAPI: 403 nếu người dùng thiếu quyền `code`.

    CHỈ kiểm có/không có quyền — KHÔNG kiểm phạm vi đơn vị. Mọi endpoint
    đụng tới `report` phải gọi THÊM `pham_vi_bao_cao(u)` và lọc kết quả
    theo đó; dùng một mình `require_permission` là chưa đủ. Quên bước này
    ở một endpoint là rò dữ liệu toàn bộ 22 đơn vị cho đúng endpoint đó —
    mà code đọc qua vẫn trông như đã được bảo vệ, vì vẫn có
    `Depends(require_permission(...))` ngay trên chữ ký hàm.
    """
    def _kiem(u: CurrentUser = Depends(current_user)) -> CurrentUser:
        if code not in u.permissions:
            raise ForbiddenError("Bạn không có quyền thực hiện thao tác này")
        return u
    return _kiem


def pham_vi_bao_cao(u: CurrentUser) -> set[int] | None:
    """Những đơn vị mà người dùng này được đụng tới báo cáo.

    ĐÂY LÀ CÁCH DUY NHẤT để biết người dùng được đụng những đơn vị nào —
    mọi endpoint liên quan tới `report` (Task 10-13) phải gọi hàm này rồi
    lọc kết quả theo đó, không tự suy luận phạm vi bằng cách khác (không
    đọc thẳng `u.org_unit_id` — xem docstring `CurrentUser` — và không tự
    viết lại logic này ở nơi khác).

    `None` = toàn Tổng công ty. Tập rỗng không bao giờ được trả về — thiếu
    phạm vi là 403, không phải "không thấy gì".

    Thứ tự xét: quyền rộng (`report.view_all`) trước, quyền hẹp
    (`report.view_own_unit`) sau; scope non-NULL LUÔN thu hẹp, không bao
    giờ bị bỏ qua chỉ vì người dùng cũng có quyền rộng hơn.

    Raises:
        ForbiddenError: 403 — thiếu cả `report.view_all` lẫn
            `report.view_own_unit`, hoặc có `report.view_own_unit` nhưng
            tài khoản chưa được gán đơn vị (`scope_org_unit_id IS NULL`
            trên chính vai trò cấp quyền đó).
    """
    if "report.view_all" in u.permissions:
        return u.scope["report.view_all"]
    if "report.view_own_unit" in u.permissions:
        dv = u.scope["report.view_own_unit"]
        if dv is None:
            raise ForbiddenError(
                "Tài khoản chưa được gán đơn vị. Liên hệ Ban ATCL để cấp lại quyền.")
        return dv
    raise ForbiddenError("Bạn không có quyền xem báo cáo")
