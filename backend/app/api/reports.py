# backend/app/api/reports.py
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, current_user, pham_vi_bao_cao, require_permission
from app.core.db import get_db
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models import OrgUnit, Report, ReportingPeriod, ReportTemplate, WorkflowState
from app.schemas.report import (
    CreateReportIn,
    CreateReportOut,
    PutValuesIn,
    PutValuesOut,
    ReportDetailOut,
    ReportListItem,
)
from app.services.reports import ghi_gia_tri, lay_chi_tiet_bao_cao, liet_ke_bao_cao

router = APIRouter(prefix="/reports")


def _pham_vi(u: CurrentUser = Depends(current_user)) -> set[int] | None:
    """Dependency bọc `pham_vi_bao_cao` — PHẢI chạy như một dependency, không
    gọi trong thân hàm route: FastAPI chỉ kiểm query param thường (`template`)
    SAU KHI đã chạy xong vòng dependency (`solve_dependencies`), nên gọi
    `pham_vi_bao_cao` trong thân hàm để `template` thiếu thắng trước — tài
    khoản scope NULL nhận 422 (thiếu `template`) thay vì 403 đúng nghĩa
    (test_reporter_scope_NULL_bi_tu_choi_chu_khong_thanh_toan_quyen gọi
    `/reports` không kèm query nào để lộ đúng lỗi này)."""
    return pham_vi_bao_cao(u)


@router.get("", response_model=list[ReportListItem])
def ds_bao_cao(
    template: str,
    period: str | None = None,
    org_unit: str | None = None,
    state: str | None = None,
    pham_vi: set[int] | None = Depends(_pham_vi),
    db: Session = Depends(get_db),
):
    return liet_ke_bao_cao(db, pham_vi, template, period, org_unit, state)


@router.post("", status_code=201, response_model=CreateReportOut)
def tao_bao_cao(
    payload: CreateReportIn,
    u: CurrentUser = Depends(require_permission("report.create")),
    db: Session = Depends(get_db),
):
    # "Đơn vị của mình" là phạm vi từ vai (pham_vi_bao_cao), KHÔNG phải
    # u.org_unit_id — hai cột có thể lệch nhau (xem docstring CurrentUser).
    pham_vi = pham_vi_bao_cao(u)
    if pham_vi is None or len(pham_vi) != 1:
        raise ForbiddenError(
            "Không xác định được đúng một đơn vị để tạo báo cáo cho tài khoản này")
    org_unit_id = next(iter(pham_vi))

    tpl = db.query(ReportTemplate).filter_by(code=payload.template).one_or_none()
    if tpl is None:
        raise NotFoundError("Không tìm thấy mẫu báo cáo")

    org_unit = db.query(OrgUnit).filter_by(id=org_unit_id).one()
    if not org_unit.is_reporting:
        raise ValidationError("Đơn vị này không thuộc diện phải nộp báo cáo")

    period = (
        db.query(ReportingPeriod)
        .filter_by(template_id=tpl.id, period_key=payload.period_key)
        .one_or_none()
    )
    if period is None:
        raise NotFoundError("Không tìm thấy kỳ báo cáo")
    if not period.is_open:
        raise ConflictError("Kỳ báo cáo đã đóng, không thể tạo báo cáo mới")

    existing = db.query(Report).filter_by(
        template_id=tpl.id, org_unit_id=org_unit_id, period_id=period.id).one_or_none()
    if existing is not None:
        raise ConflictError("Báo cáo đã tồn tại cho đơn vị và kỳ này", existing_id=existing.id)

    trang_thai_dau = db.query(WorkflowState).filter_by(template_id=tpl.id, is_initial=True).one()
    bc = Report(
        template_id=tpl.id, org_unit_id=org_unit_id, period_id=period.id,
        state_id=trang_thai_dau.id, version=1, source="live", created_by=u.id,
    )
    db.add(bc)
    db.flush()
    return CreateReportOut(id=bc.id)


@router.get("/{report_id}", response_model=ReportDetailOut)
def xem_bao_cao(
    report_id: int,
    u: CurrentUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    pham_vi = pham_vi_bao_cao(u)
    ket_qua = lay_chi_tiet_bao_cao(db, report_id)
    if ket_qua is None:
        raise NotFoundError("Không tìm thấy báo cáo")
    org_unit_id, chi_tiet = ket_qua
    if pham_vi is not None and org_unit_id not in pham_vi:
        raise ForbiddenError("Bạn không có quyền xem báo cáo của đơn vị này")
    return chi_tiet


def _kiem_quyen_ghi(
    report_id: int,
    u: CurrentUser = Depends(require_permission("report.edit")),
    db: Session = Depends(get_db),
) -> Report:
    """Dependency kiểm quyền + phạm vi cho `PUT /{report_id}/values` — PHẢI
    chạy như dependency, không gọi trong thân hàm route: route này nhận body
    bắt buộc (`PutValuesIn`), và FastAPI chỉ validate body SAU KHI đã chạy
    xong vòng dependency (`solve_dependencies`) — giống hệt bẫy `_pham_vi` ở
    trên (`GET /reports`), chỉ khác ở đây là body bắt buộc thay vì query
    param bắt buộc. Kiểm trong thân hàm sẽ để lộ 422 (thân rỗng/thiếu field)
    thay vì 403 đúng nghĩa cho tài khoản ngoài phạm vi
    (test_reporter_khong_ghi_duoc_bao_cao_don_vi_khac gọi với `values: []`
    hợp lệ nên không lộ bẫy này, nhưng bẫy vẫn có thật với body sai/thiếu)."""
    r = db.query(Report).filter_by(id=report_id).one_or_none()
    if r is None:
        raise NotFoundError("Không tìm thấy báo cáo")
    pham_vi = pham_vi_bao_cao(u)
    if pham_vi is not None and r.org_unit_id not in pham_vi:
        raise ForbiddenError("Bạn không có quyền sửa báo cáo của đơn vị này")
    return r


@router.put("/{report_id}/values", response_model=PutValuesOut)
def ghi_gia_tri_bao_cao(
    payload: PutValuesIn,
    r: Report = Depends(_kiem_quyen_ghi),
    u: CurrentUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    version, values = ghi_gia_tri(db, r.id, payload.version, payload.values, actor=u)
    return PutValuesOut(version=version, values=values)
