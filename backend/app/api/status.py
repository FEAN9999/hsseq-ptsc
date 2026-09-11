# backend/app/api/status.py
"""`GET /status` — ma trận trạng thái 22 đơn vị × N kỳ (Task 13). Màn hình mở
đầu buổi demo.

`template`/`from`/`to` là tham số THƯỜNG bắt buộc (không giá trị mặc định) —
phần kiểm quyền (`_pham_vi`) PHẢI chạy như một dependency riêng, không gọi
trong thân hàm route: FastAPI chỉ validate tham số thường SAU KHI đã chạy
xong vòng dependency (`solve_dependencies`), y hệt bẫy 422-thắng-403 Task 10
vấp phải ở `GET /reports` (xem `_pham_vi` trong app/api/reports.py) — kiểm
quyền trong thân hàm sẽ để `from`/`to` thiếu thắng trước, tài khoản không có
`status.view` nhận 422 (thiếu tham số) thay vì 403 đúng nghĩa
(test_reporter_khong_xem_duoc_status gọi không kèm `from`/`to` để lộ đúng
bẫy này).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, join, outerjoin, true
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, pham_vi_bao_cao, require_permission
from app.core.db import get_db
from app.core.errors import NotFoundError
from app.models import OrgUnit, Report, ReportingPeriod, ReportTemplate, WorkflowState
from app.schemas.base import ApiModel

router = APIRouter(prefix="/status")


def _pham_vi(u: CurrentUser = Depends(require_permission("status.view"))) -> set[int] | None:
    """Dependency bọc `pham_vi_bao_cao` — PHẢI chạy như dependency (xem docstring
    module). `require_permission("status.view")` chặn reporter (không có quyền
    này — chỉ admin_atcl/viewer có) TRƯỚC khi FastAPI kịp đòi `from`/`to`.

    `pham_vi_bao_cao` lọc dữ liệu theo ĐÚNG phạm vi vai trò
    (`report.view_all`/`report.view_own_unit`), không phải theo `status.view`
    — hai quyền độc lập, xem docstring `CurrentUser`/`pham_vi_bao_cao` ở
    app/api/deps.py. Trong dữ liệu seed hiện có, mọi vai có `status.view`
    (admin_atcl, viewer) đều có `report.view_all` phạm vi rộng (None); nhánh
    phạm vi hẹp chỉ lộ ra khi một vai trò tương lai kết hợp `status.view` với
    `report.view_own_unit` — test_status_loc_theo_pham_vi_hep dựng đúng ca đó
    bằng cách gán tạm `status.view` cho vai `reporter` trong transaction test.
    """
    return pham_vi_bao_cao(u)


class StatusCellOut(ApiModel):
    period_key: str
    state: str | None
    source: str | None
    is_late: bool | None


class StatusUnitOut(ApiModel):
    code: str
    name: str
    cells: list[StatusCellOut]


class StatusOut(ApiModel):
    periods: list[str]
    units: list[StatusUnitOut]


@router.get("", response_model=StatusOut)
def ma_tran_trang_thai(
    template: str,
    tu_ky: str = Query(alias="from"),
    den_ky: str = Query(alias="to"),
    pham_vi: set[int] | None = Depends(_pham_vi),
    db: Session = Depends(get_db),
):
    tpl = db.query(ReportTemplate).filter_by(code=template).one_or_none()
    if tpl is None:
        raise NotFoundError("Không tìm thấy mẫu báo cáo")

    # `period_key` dạng "YYYY-MM" nên so chuỗi (>=, <=) cho đúng thứ tự thời
    # gian như so ngày — không cần parse ngày riêng.
    periods = [
        pk for (pk,) in (
            db.query(ReportingPeriod.period_key)
            .filter(ReportingPeriod.template_id == tpl.id,
                    ReportingPeriod.period_key >= tu_ky,
                    ReportingPeriod.period_key <= den_ky)
            .order_by(ReportingPeriod.start_date)
            .all()
        )
    ]

    # Tích Đề-các ReportingPeriod × OrgUnit (mỗi đơn vị trong phạm vi ghép mỗi
    # kỳ trong khoảng from..to) rồi LEFT JOIN Report — cùng kỹ thuật với nhánh
    # có phạm vi của liet_ke_bao_cao (app/services/reports.py) — để ô (đơn vị,
    # kỳ) chưa có báo cáo vẫn ra một dòng (state=None) thay vì biến mất khỏi
    # lưới, đúng hợp đồng "ô trống của kỳ chưa có báo cáo".
    tu_ke = join(ReportingPeriod, OrgUnit, true())
    tu_ke = outerjoin(tu_ke, Report, and_(
        Report.template_id == tpl.id,
        Report.period_id == ReportingPeriod.id,
        Report.org_unit_id == OrgUnit.id,
    ))
    tu_ke = outerjoin(tu_ke, WorkflowState, WorkflowState.id == Report.state_id)

    q = (
        db.query(OrgUnit.code, OrgUnit.name, ReportingPeriod.period_key,
                 WorkflowState.code, Report.source, Report.is_late)
        .select_from(tu_ke)
        .filter(ReportingPeriod.template_id == tpl.id,
                ReportingPeriod.period_key >= tu_ky, ReportingPeriod.period_key <= den_ky,
                OrgUnit.is_reporting.is_(True))
    )
    if pham_vi is not None:
        q = q.filter(OrgUnit.id.in_(pham_vi))
    # Thứ tự dòng của lưới là LỰA CHỌN CÓ Ý THỨC: theo MÃ đơn vị, nên 5 ban dự
    # án P01–P05 nằm TRƯỚC 17 đơn vị thành viên U01–U17. Cùng quy ước với
    # GET /reports (app/services/reports.py) và GET /dashboard/units; khác
    # /org-units (sắp theo id = thứ tự seed). Đổi sang id thì lệch /reports —
    # giữ một quy ước duy nhất cho mọi danh sách CÓ MÃ, và khoá bằng test so
    # danh sách theo thứ tự (test_status_thu_tu_don_vi_theo_ma).
    q = q.order_by(OrgUnit.code, ReportingPeriod.start_date)

    thu_tu_don_vi: list[str] = []
    ten_theo_ma: dict[str, str] = {}
    o_theo_don_vi_ky: dict[tuple[str, str], StatusCellOut] = {}
    for code, name, period_key, state, source, is_late in q.all():
        if code not in ten_theo_ma:
            ten_theo_ma[code] = name
            thu_tu_don_vi.append(code)
        o_theo_don_vi_ky[(code, period_key)] = StatusCellOut(
            period_key=period_key, state=state, source=source, is_late=is_late)

    units = [
        StatusUnitOut(
            code=code, name=ten_theo_ma[code],
            cells=[o_theo_don_vi_ky[(code, pk)] for pk in periods],
        )
        for code in thu_tu_don_vi
    ]
    return StatusOut(periods=periods, units=units)
