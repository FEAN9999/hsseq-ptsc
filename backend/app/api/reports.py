# backend/app/api/reports.py
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, current_user, pham_vi_bao_cao, require_permission
from app.core.db import get_db
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models import (
    AuditLog,
    OrgUnit,
    Permission,
    Report,
    ReportingPeriod,
    ReportTemplate,
    WorkflowState,
    WorkflowTransition,
)
from app.schemas.report import (
    CreateReportIn,
    CreateReportOut,
    PutValuesIn,
    PutValuesOut,
    ReportDetailOut,
    ReportListItem,
)
from app.services.reports import ghi_gia_tri, lay_chi_tiet_bao_cao, liet_ke_bao_cao
from app.services.workflow import apply_transition

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
    version, values = ghi_gia_tri(db, r.id, payload.version, payload.values, actor=u,
                                  texts=payload.texts)
    return PutValuesOut(version=version, values=values)


class TransitionIn(BaseModel):
    action: str
    expected_state: str
    version: int
    note: str | None = None


class TransitionOut(BaseModel):
    state: str
    version: int


def _kiem_quyen_chuyen_trang_thai(
    report_id: int,
    u: CurrentUser = Depends(current_user),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """Dependency kiểm quyền THÔ + phạm vi cho `POST /{report_id}/transition` — PHẢI
    chạy như dependency, không gọi trong thân hàm route: route này nhận body bắt
    buộc (`TransitionIn`), và FastAPI chỉ validate body SAU KHI đã chạy xong vòng
    dependency (`solve_dependencies`) — bẫy 422-thắng-403 y hệt `_pham_vi`/
    `_kiem_quyen_ghi` ở trên.

    Khác `_kiem_quyen_ghi` (một quyền cố định `report.edit`): quyền cần cho
    transition phụ thuộc `action` — mà `action` nằm TRONG thân request, chưa đọc
    được ở tầng dependency. Nên ở đây chỉ kiểm quyền THÔ ("có ít nhất một quyền
    chuyển-trạng-thái nào đó của MẪU này không" — lấy từ chính
    `workflow_transition`, không hardcode "report.submit/return/approve" cho một
    mẫu cụ thể) + phạm vi đơn vị; quyền CHÍNH XÁC cho đúng `action` do
    `apply_transition` (app/services/workflow.py) tự kiểm lại bằng
    `kiem_quyen_trong_pham_vi`, sau khi đã có thân request."""
    r = db.query(Report).filter_by(id=report_id).one_or_none()
    if r is None:
        raise NotFoundError("Không tìm thấy báo cáo")
    quyen_lien_quan = {
        ma for (ma,) in (
            db.query(Permission.code)
            .join(WorkflowTransition, WorkflowTransition.required_permission_id == Permission.id)
            .filter(WorkflowTransition.template_id == r.template_id)
            .distinct()
        )
    }
    if u.permissions.isdisjoint(quyen_lien_quan):
        raise ForbiddenError("Bạn không có quyền chuyển trạng thái báo cáo này")
    pham_vi = pham_vi_bao_cao(u)
    if pham_vi is not None and r.org_unit_id not in pham_vi:
        raise ForbiddenError("Bạn không có quyền chuyển trạng thái báo cáo của đơn vị này")
    return u


@router.post("/{report_id}/transition", response_model=TransitionOut)
def chuyen_trang_thai_bao_cao(
    report_id: int,
    payload: TransitionIn,
    u: CurrentUser = Depends(_kiem_quyen_chuyen_trang_thai),
    db: Session = Depends(get_db),
):
    r = apply_transition(db, report_id, payload.action, payload.note,
                         payload.expected_state, payload.version, actor=u)
    ma_trang_thai = db.query(WorkflowState.code).filter_by(id=r.state_id).scalar()
    return TransitionOut(state=ma_trang_thai, version=r.version)


class HistoryItemOut(BaseModel):
    """Một dòng của `GET /reports/{id}/history`.

    HAI HÌNH DẠNG DÒNG, có chủ ý, và đây là chỗ ghi hợp đồng đó:

      - dòng chuyển trạng thái (`submit`/`return`/`approve`/`reopen`) do
        `apply_transition` ghi: `before` và `after` đều là ảnh chụp các cột
        workflow (`_snapshot`, app/services/workflow.py) — `state`, `version`,
        `source`, `submitted_at`, `first_submitted_at`, `decided_at`,
        `decided_by`, `decision_note`, `is_late`;
      - dòng `seed_import` do loader fixture ghi (`app/seed/fixture.py`):
        **`before` là `null`**, `after` chỉ có `{"note": "nạp từ file ..."}`.

    Nên `before`/`after` khai `dict | None`, và FE KHÔNG được đọc thẳng
    `before.state`: dòng `seed_import` là dòng ĐẦU TIÊN của mọi báo cáo nạp
    từ fixture (21/22 đơn vị × 3 kỳ), nên đọc thẳng là nổ ngay ở dòng đầu.
    Không chuẩn hoá bằng cách bịa `before` cho dòng seed — audit phải kể đúng
    thứ đã ghi, không phải thứ tiện cho FE.
    """
    id: int
    action: str
    actor_id: int | None
    before: dict | None
    after: dict | None
    created_at: datetime


@router.get("/{report_id}/history", response_model=list[HistoryItemOut])
def lich_su_bao_cao(
    report_id: int,
    u: CurrentUser = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Lịch sử chuyển trạng thái — cùng hợp đồng phạm vi với `GET /{report_id}`
    (đơn vị của mình cho reporter, toàn bộ cho viewer/admin): người nhập phải tự
    xem lại lịch sử báo cáo của chính mình, không chỉ Ban ATCL, nên KHÔNG đòi
    `audit.view` (chỉ admin_atcl có quyền đó) — dùng `pham_vi_bao_cao` như trang
    xem báo cáo."""
    pham_vi = pham_vi_bao_cao(u)
    r = db.query(Report).filter_by(id=report_id).one_or_none()
    if r is None:
        raise NotFoundError("Không tìm thấy báo cáo")
    if pham_vi is not None and r.org_unit_id not in pham_vi:
        raise ForbiddenError("Bạn không có quyền xem báo cáo của đơn vị này")

    ds = (
        db.query(AuditLog)
        .filter_by(entity="report", entity_id=report_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .all()
    )
    return [
        {"id": a.id, "action": a.action, "actor_id": a.actor_id,
         "before": a.before_json, "after": a.after_json, "created_at": a.created_at}
        for a in ds
    ]
