# backend/app/services/workflow.py
"""Máy trạng thái FM01 nạp từ DB (workflow_state + workflow_transition).

     submit (report.submit)          approve (report.approve)
  draft ────────────────▶ submitted ────────────────────────▶ approved
  editable                read-only                            counts_in_totals
                            │   ▲                                   │
      return (report.return,│   │ submit                            │ reopen (report.return,
      requires_note)        ▼   │                                   │ requires_note)
                          returned ◀───────────────────────────────┘
                          editable; ghi chú admin hiện đầu form

Không dùng thư viện state machine: trạng thái là dữ liệu, thêm FM02 không sửa code.

`apply_transition` là hàm TỰ CHỦ về phân quyền (nhận `actor: CurrentUser`, tự gọi
`kiem_quyen_trong_pham_vi` bên trong) — khác `ghi_gia_tri` (Task 11), nơi phạm vi chỉ
được kiểm ở tầng route. Lý do: brief giao chữ ký `apply_transition(..., actor)` và
`kiem_quyen_trong_pham_vi` như một bước NỘI BỘ của hàm (không phải của route), để hàm
này tự đủ cho một lời gọi trực tiếp (script quản trị, ví dụ) mà không cần đi qua
FastAPI dependency nào.

`Report` không có `relationship()` sang `WorkflowState`/`ReportingPeriod` (chỉ có
`state_id`/`period_id`) — pseudocode brief viết `r.state.code`, `r.period.due_at`
là lược giản; ở đây đọc bằng query riêng, đúng pattern `ghi_gia_tri` (Task 11) đã
dùng cho `WorkflowState`.

`action == "submit"` còn kiểm THIẾU Ô BẮT BUỘC trên TOÀN BỘ báo cáo — không có
trong code mẫu của task-12-brief.md, nhưng là spec thật (docs/designs/hseq-platform-
mvp-fm01.md dòng 257, bảng mã lỗi D10: "400 ... thiếu ô bắt buộc lúc nộp") và chính
docstring `validate_values` (app/domain/report_rules.py) chỉ thẳng việc này về đây:
"KHÔNG dùng nó cho phép kiểm 'thiếu ô bắt buộc lúc nộp' ... lúc nộp phải kiểm TOÀN
BỘ ô đang lưu" — PUT /values (Task 11) chỉ kiểm payload MỘT PHẦN nên không thể là
nơi làm việc này. Xem "Quyết định riêng" trong task-12-report.md.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from app.api.deps import pham_vi_bao_cao
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.domain.report_rules import (
    CellValues,
    IndicatorSpec,
    editable_columns,
    validate_values,
)
from app.models import (
    AuditLog,
    Indicator,
    Permission,
    Report,
    ReportingPeriod,
    ReportValue,
    WorkflowState,
    WorkflowTransition,
)

VN = ZoneInfo("Asia/Ho_Chi_Minh")

# action ghi lại quyết định (decided_at/decided_by/decision_note) — "submit" thì
# không, vì đó không phải một quyết định của Ban ATCL mà là hành động của người nhập.
CAC_ACTION_QUYET_DINH = ("approve", "return", "reopen")


def tim_transition(db, template_id: int, from_state_id: int, action_code: str):
    """`WorkflowTransition` khớp (template_id, from_state_id, action_code), kèm mã
    quyền cần thiết (`required_permission_code`, gắn tạm lên đối tượng trả về — không
    map DB) — `WorkflowTransition` không có `relationship()` sang `Permission`."""
    hang = (
        db.query(WorkflowTransition, Permission.code)
        .join(Permission, Permission.id == WorkflowTransition.required_permission_id)
        .filter(
            WorkflowTransition.template_id == template_id,
            WorkflowTransition.from_state_id == from_state_id,
            WorkflowTransition.action_code == action_code,
        )
        .one_or_none()
    )
    if hang is None:
        return None
    tr, ma_quyen = hang
    tr.required_permission_code = ma_quyen
    return tr


def kiem_quyen_trong_pham_vi(actor, required_permission_code: str, org_unit_id: int) -> None:
    """403 nếu thiếu quyền `required_permission_code`, hoặc có quyền nhưng
    `org_unit_id` ngoài phạm vi báo cáo của `actor` (`pham_vi_bao_cao` — nguồn phạm vi
    DUY NHẤT, xem docstring `app/api/deps.py`)."""
    if required_permission_code not in actor.permissions:
        raise ForbiddenError("Bạn không có quyền thực hiện thao tác này")
    pham_vi = pham_vi_bao_cao(actor)
    if pham_vi is not None and org_unit_id not in pham_vi:
        raise ForbiddenError("Bạn không có quyền thực hiện thao tác này trên đơn vị này")


def _thieu_o_bat_buoc(db, r: Report) -> list:
    """Kiểm TOÀN BỘ `report_value` đang lưu của báo cáo `r` theo đúng quy tắc
    `report_rules.validate_values` (nguồn chân lý duy nhất — không viết lại), khác
    `ghi_gia_tri` (chỉ kiểm payload một phần). Mã chưa từng ghi dòng nào cũng phải có
    mặt (giá trị rỗng `CellValues()`) để `kiem_bat_buoc=True` bắt được đúng ca "chưa
    nhập gì" — không chỉ mã đã có dòng `report_value`.

    CHỈ nạp những cột NHẬP ĐƯỢC của từng `agg_type` (`editable_columns`, cũng của
    report_rules). Đây là chỗ khác nhau then chốt giữa "ô người dùng điền" và "cột
    đang có gì trong DB": loader fixture (`app/seed/fixture.py::_ghi`) ghi CẢ BA cột
    cho MỌI dòng, kể cả `acc_prev_entered`/`acc_total_entered` của dòng `sum` (nơi
    hai cột đó là số lũy kế Excel, không phải ô ai nhập). Nạp thẳng cả ba cột vào
    `validate_values` làm mọi dòng `sum` có số fixture bị báo "Dòng tự tính, không
    nhận giá trị gửi lên" → báo cáo demo (đơn vị 22, kỳ 08, `_nhap_don_vi_22`) không
    bao giờ nộp được, 400 ở đúng phân đoạn demo. Lọc theo `editable_columns` giữ
    phép kiểm đúng phạm vi của nó: THIẾU ô bắt buộc, không phải "DB đang có gì"."""
    chi_tieu = db.query(Indicator).filter_by(template_id=r.template_id, active=True).all()
    catalog = [
        IndicatorSpec(code=i.code, agg_type=i.agg_type, decimals=i.decimals,
                      required=i.required, formula=i.formula)
        for i in chi_tieu
    ]
    dong_theo_chi_tieu = {
        rv.indicator_id: rv
        for rv in db.query(ReportValue).filter(
            ReportValue.report_id == r.id,
            ReportValue.indicator_id.in_([i.id for i in chi_tieu]),
        ).all()
    }
    values: dict[str, CellValues] = {}
    for i in chi_tieu:
        rv = dong_theo_chi_tieu.get(i.id)
        nhap_duoc = editable_columns(i.agg_type)
        values[i.code] = CellValues(
            this_period=rv.this_period if rv and "this_period" in nhap_duoc else None,
            acc_total_entered=(
                rv.acc_total_entered if rv and "acc_total_entered" in nhap_duoc else None),
        )
    return validate_values(catalog, values, kiem_bat_buoc=True)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _snapshot(r: Report, ma_trang_thai: str) -> dict:
    """Ảnh chụp các cột workflow của `r` (KHÔNG gồm `report_value` — audit này là
    lịch sử CHUYỂN TRẠNG THÁI, không phải lịch sử số liệu). Toàn bộ giá trị là
    str/int/bool/None — an toàn cho `json.dumps` mặc định của cột JSON (không có bộ
    serialize Decimal/datetime riêng, xem `app/core/db.py`); datetime phải tự
    `.isoformat()` ở đây, không truyền thẳng đối tượng `datetime`."""
    return {
        "state": ma_trang_thai,
        "version": r.version,
        "source": r.source,
        "submitted_at": _iso(r.submitted_at),
        "first_submitted_at": _iso(r.first_submitted_at),
        "decided_at": _iso(r.decided_at),
        "decided_by": r.decided_by,
        "decision_note": r.decision_note,
        "is_late": r.is_late,
    }


def apply_transition(db, report_id: int, action: str, note: str | None,
                     expected_state: str, version: int, actor) -> Report:
    r = (db.query(Report).filter_by(id=report_id)
           .with_for_update().one_or_none())                       # (1) khoá dòng
    if r is None:
        raise NotFoundError("Không tìm thấy báo cáo")

    trang_thai_hien_tai = db.query(WorkflowState).filter_by(id=r.state_id).one()
    if trang_thai_hien_tai.code != expected_state or r.version != version:  # (2) so
        raise ConflictError("Người khác vừa sửa báo cáo này",
                            state=trang_thai_hien_tai.code, version=r.version)

    tr = tim_transition(db, r.template_id, r.state_id, action)     # (3)
    if tr is None:
        raise ConflictError(f"Không thể {action} từ trạng thái hiện tại",
                            state=trang_thai_hien_tai.code, version=r.version)

    kiem_quyen_trong_pham_vi(actor, tr.required_permission_code, r.org_unit_id)  # (4) 403
    if tr.requires_note and not (note or "").strip():
        raise ValidationError("Thao tác này bắt buộc có ghi chú")
    if action == "submit":
        loi = _thieu_o_bat_buoc(db, r)
        if loi:
            raise ValidationError(
                "Dữ liệu không hợp lệ",
                errors=[{"indicator_code": e.indicator_code, "message": e.message} for e in loi])

    truoc = _snapshot(r, trang_thai_hien_tai.code)
    trang_thai_moi = db.query(WorkflowState).filter_by(id=tr.to_state_id).one()

    r.state_id = tr.to_state_id                                    # (5)
    r.version += 1
    r.source = "live"
    now = datetime.now(VN)
    if action == "submit":
        r.submitted_at = now
        if r.first_submitted_at is None:
            r.first_submitted_at = now
            ky = db.query(ReportingPeriod).filter_by(id=r.period_id).one()
            r.is_late = bool(ky.due_at and now > ky.due_at)
    elif action in CAC_ACTION_QUYET_DINH:
        r.decided_at, r.decided_by, r.decision_note = now, actor.id, note

    db.add(AuditLog(entity="report", entity_id=r.id, action=action,   # (6) cùng transaction
                    actor_id=actor.id, before_json=truoc,
                    after_json=_snapshot(r, trang_thai_moi.code)))
    db.flush()
    return r
