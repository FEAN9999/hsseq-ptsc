# backend/app/api/dashboard.py
"""`GET /dashboard/summary`, `GET /dashboard/units` — 6 ô KPI + bảng 22 đơn vị
(Task 13).

Không nhận query `template`: dashboard luôn đọc MẪU ĐANG HOẠT ĐỘNG DUY NHẤT
(`report_template.active = true`) — không hardcode mã "FM01" (CONTEXT.md cấm
hardcode mã mẫu; MVP chỉ có một mẫu hoạt động tại một thời điểm).

Ngân sách `GET /dashboard/summary` là 2 query TÍNH CẢ query xác thực của
`current_user()` (task-13-carry.md E2) — nghĩa là còn ĐÚNG 1 query dữ liệu
cho cả 6 KPI, đếm trạng thái, lẫn danh sách đơn vị chưa nộp. Vì vậy kỳ báo
cáo KHÔNG được tra bằng một query Python riêng trước (`db.query(...).one()`
sẽ tốn thêm round-trip, đẩy tổng lên 3) — `period_key` được giải ngay TRONG
câu SELECT chính bằng scalar subquery không tương quan (`_ky_dang_hoat_dong`,
Postgres chỉ tính một lần cho cả câu, không tính lại theo từng dòng), cùng kỹ
thuật gộp nhiều nguồn vào một câu mà Task 10 dùng cho `GET /reports/{id}`
(xem app/services/reports.py). Hệ quả CÓ CHỦ Ý của cách này: `period` không
khớp kỳ nào, hoặc chưa có mẫu nào `active` → mọi số về 0 / mảng rỗng, KHÔNG
404 như các endpoint khác của dự án — đánh đổi để giữ đúng ngân sách 2 query
cứng, nói rõ trong task-13-report.md mục "khác brief".

Ba nhóm trạng thái của MỌI đơn vị trong phạm vi, đọc từ CHÍNH cột
`workflow_state.is_editable`/`counts_in_totals` — không hardcode chuỗi
"approved"/"submitted"/"draft"/"returned" (task-13-carry.md E4): "đã duyệt"
= `counts_in_totals`; "chờ duyệt" = còn báo cáo, không `counts_in_totals`,
không `is_editable` (đã nộp, chưa duyệt); "chưa nộp" (`missing_units`) = không
có báo cáo HOẶC báo cáo đang `is_editable` (nháp/trả lại, còn phải nộp/nộp
lại). Ba nhóm loại trừ lẫn nhau và phủ hết mọi đơn vị trong phạm vi.
"""
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, pham_vi_bao_cao, require_permission
from app.core.db import get_db
from app.domain.report_rules import COT_BAT_BUOC
from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportTemplate, ReportValue, WorkflowState
from app.schemas.base import ApiModel, JsonNumber
from app.schemas.report import OrgUnitBrief

router = APIRouter(prefix="/dashboard")

# (mã hiển thị, nhãn đúng chữ mockup, khoá cột kết quả SQL, đơn vị đo).
# "DON_VI_CO_LTI" không phải mã chỉ tiêu thật trong danh mục (không có dòng
# nào như vậy) — đây là SỐ ĐƠN VỊ có LTI > 0, không phải tổng một cột, đặt mã
# tượng trưng để phân biệt với "B-2.2" (LTI trong kỳ — tổng SỐ VỤ).
_KPI = [
    ("B-2.2",         "LTI trong kỳ",  "lti",           "Số vụ"),
    ("B-2.1",         "FAT trong kỳ",  "fat",           "Số vụ"),
    ("DON_VI_CO_LTI", "Đơn vị có LTI", "don_vi_co_lti", "Đơn vị"),
    ("B-1.4",         "Tổng giờ công", "gio_cong",      "Giờ"),
    ("B-2.10",        "Near miss",     "near_miss",     "Số vụ"),
    ("B-2.11",        "HAZOB card",    "hazob",         "Cái"),
]
_MA_CHI_TIEU_GIO_CONG = ("B-1.1", "B-1.2", "B-1.3")
_MA_CHI_TIEU_KPI = {"B-2.1", "B-2.2", "B-2.10", "B-2.11", *_MA_CHI_TIEU_GIO_CONG}


def _pham_vi(u: CurrentUser = Depends(require_permission("dashboard.view"))) -> set[int] | None:
    """Dependency bọc `pham_vi_bao_cao` cho cả hai route `/dashboard/*` — PHẢI
    chạy như dependency, không gọi trong thân hàm route: cùng khuôn với
    `_pham_vi` của app/api/reports.py và app/api/status.py, giữ để không rò
    nếu sau này route thêm tham số bắt buộc (bẫy 422-thắng-403)."""
    return pham_vi_bao_cao(u)


def _ky_dang_hoat_dong(period_key: str):
    """Scalar subquery KHÔNG tương quan: id kỳ báo cáo khớp `period_key` của
    mẫu đang `active` — xem lý do không tách thành query Python riêng ở
    docstring module. Không khớp kỳ nào (hoặc chưa có mẫu active) → NULL, mọi
    so sánh `Report.period_id == NULL` ở nơi gọi tự nhiên không khớp dòng
    nào — không raise, không 500.

    `.limit(1)` KHÔNG phải phòng xa: không ràng buộc DB nào cấm hai mẫu cùng
    `active` (`report_template.active` mặc định True, alembic 0001 không tạo
    unique lẫn index bán phần), mà mọi mẫu tháng đều sinh khoá kỳ dạng
    "YYYY-MM" nên hai mẫu active là hai dòng TRÙNG khoá kỳ; scalar subquery
    trả >1 dòng thì Postgres ném CardinalityViolation → 500 (thân lỗi tiếng
    Anh) ngay màn hình mở đầu. `order_by(ReportingPeriod.id)` để ca đó vẫn
    TẤT ĐỊNH — kỳ dựng trước thắng — thay vì tuỳ kế hoạch truy vấn."""
    return (
        select(ReportingPeriod.id)
        .join(ReportTemplate, ReportTemplate.id == ReportingPeriod.template_id)
        .where(ReportingPeriod.period_key == period_key, ReportTemplate.active.is_(True))
        .order_by(ReportingPeriod.id)
        .limit(1)
        .scalar_subquery()
    )


def _hoac(gia_tri, mac_dinh):
    """`gia_tri if gia_tri is not None else mac_dinh` — KHÔNG dùng `gia_tri or
    mac_dinh`: `Decimal("0")` giả (falsy) trong Python nên `or` sẽ biến một
    số 0 THẬT SỰ đã nhập thành `mac_dinh`, lẫn với ô chưa nhập."""
    return gia_tri if gia_tri is not None else mac_dinh


class KpiOut(ApiModel):
    code: str
    label: str
    value: JsonNumber
    unit: str


class DashboardSummaryOut(ApiModel):
    period_key: str
    reporting_units: int
    approved_count: int
    submitted_count: int
    missing_units: list[OrgUnitBrief]
    kpis: list[KpiOut]


@router.get("/summary", response_model=DashboardSummaryOut)
def tong_quan(
    period: str,
    pham_vi: set[int] | None = Depends(_pham_vi),
    db: Session = Depends(get_db),
):
    ky_id = _ky_dang_hoat_dong(period)

    # Một dòng MỖI đơn vị trong phạm vi (LEFT JOIN report/workflow_state
    # không fan-out vì UniqueConstraint(template_id, org_unit_id, period_id):
    # tối đa một báo cáo/đơn vị/kỳ) — nguồn cho reporting_units, approved_count,
    # submitted_count, missing_units.
    theo_don_vi = (
        select(
            OrgUnit.code.label("org_code"), OrgUnit.name.label("org_name"),
            Report.id.label("report_id"),
            WorkflowState.is_editable.label("is_editable"),
            WorkflowState.counts_in_totals.label("counts_in_totals"),
        )
        .select_from(OrgUnit)
        .outerjoin(Report, and_(Report.org_unit_id == OrgUnit.id, Report.period_id == ky_id))
        .outerjoin(WorkflowState, WorkflowState.id == Report.state_id)
        .where(OrgUnit.is_reporting.is_(True))
    )
    if pham_vi is not None:
        theo_don_vi = theo_don_vi.where(OrgUnit.id.in_(pham_vi))
    theo_don_vi = theo_don_vi.cte("theo_don_vi")

    chua_nop = or_(theo_don_vi.c.is_editable.is_(True), theo_don_vi.c.report_id.is_(None))

    # Tổng 6 KPI: CHỈ báo cáo counts_in_totals mới được cộng (task-13-carry.md
    # E4 — không hardcode "approved", đọc thẳng cột). JOIN thẳng report_value/
    # indicator (không qua theo_don_vi) nên không cần lo fan-out ở CTE trên.
    tong_kpi = (
        select(
            func.coalesce(func.sum(ReportValue.this_period)
                          .filter(Indicator.code == "B-2.2"), 0).label("lti"),
            func.coalesce(func.sum(ReportValue.this_period)
                          .filter(Indicator.code == "B-2.1"), 0).label("fat"),
            func.coalesce(func.sum(ReportValue.this_period)
                          .filter(Indicator.code == "B-2.10"), 0).label("near_miss"),
            func.coalesce(func.sum(ReportValue.this_period)
                          .filter(Indicator.code == "B-2.11"), 0).label("hazob"),
            func.coalesce(func.sum(ReportValue.this_period)
                          .filter(Indicator.code.in_(_MA_CHI_TIEU_GIO_CONG)), 0)
                .label("gio_cong"),
            func.count(func.distinct(Report.org_unit_id))
                .filter(and_(Indicator.code == "B-2.2", ReportValue.this_period > 0))
                .label("don_vi_co_lti"),
        )
        .select_from(Report)
        .join(WorkflowState, and_(WorkflowState.id == Report.state_id,
                                  WorkflowState.counts_in_totals.is_(True)))
        .join(ReportValue, ReportValue.report_id == Report.id)
        .join(Indicator, and_(Indicator.id == ReportValue.indicator_id,
                              Indicator.template_id == Report.template_id,
                              Indicator.code.in_(_MA_CHI_TIEU_KPI)))
        .where(Report.period_id == ky_id)
    )
    if pham_vi is not None:
        tong_kpi = tong_kpi.where(Report.org_unit_id.in_(pham_vi))
    tong_kpi = tong_kpi.cte("tong_kpi")

    stmt = select(
        select(func.count()).select_from(theo_don_vi)
            .scalar_subquery().label("reporting_units"),
        select(func.count()).select_from(theo_don_vi)
            .where(theo_don_vi.c.counts_in_totals.is_(True))
            .scalar_subquery().label("approved_count"),
        select(func.count()).select_from(theo_don_vi)
            .where(theo_don_vi.c.counts_in_totals.is_(False), theo_don_vi.c.is_editable.is_(False))
            .scalar_subquery().label("submitted_count"),
        # MỘT json_agg gom cả cặp (mã, tên) thành một đối tượng, KHÔNG hai
        # array_agg song song rồi zip() theo vị trí: ghép theo vị trí là hợp
        # đồng ngầm giữa hai phép gom độc lập — chỉ cần một ORDER BY lệch là
        # tên đơn vị gắn nhầm mã, mà bảng "đơn vị chưa nộp" khi đó chỉ SAI TÊN
        # chứ không sai số nên không ai phát hiện. Ghép trong chính dòng SQL
        # thì không lệch được. Vẫn một câu SELECT duy nhất (ngân sách 2 query
        # tính cả xác thực, xem docstring module).
        select(func.json_agg(aggregate_order_by(
            func.json_build_object("code", theo_don_vi.c.org_code,
                                   "name", theo_don_vi.c.org_name),
            theo_don_vi.c.org_code)))
            .select_from(theo_don_vi).where(chua_nop)
            .scalar_subquery().label("missing_units"),
        tong_kpi.c.lti, tong_kpi.c.fat, tong_kpi.c.near_miss, tong_kpi.c.hazob,
        tong_kpi.c.gio_cong, tong_kpi.c.don_vi_co_lti,
    ).select_from(tong_kpi)

    row = db.execute(stmt).one()

    gia_tri_theo_ma = {
        "lti": row.lti, "fat": row.fat, "near_miss": row.near_miss, "hazob": row.hazob,
        "gio_cong": row.gio_cong, "don_vi_co_lti": row.don_vi_co_lti,
    }
    # json_agg trả NULL (không phải mảng rỗng) khi không có dòng nào chưa nộp.
    missing_units = row.missing_units or []

    return DashboardSummaryOut(
        period_key=period,
        reporting_units=row.reporting_units,
        approved_count=row.approved_count,
        submitted_count=row.submitted_count,
        missing_units=[OrgUnitBrief(code=u["code"], name=u["name"]) for u in missing_units],
        kpis=[KpiOut(code=code, label=label, value=gia_tri_theo_ma[key], unit=unit)
              for code, label, key, unit in _KPI],
    )


class DashboardUnitOut(ApiModel):
    org_unit: OrgUnitBrief
    gio_cong: JsonNumber
    lti: JsonNumber
    fat: JsonNumber
    near_miss: JsonNumber
    hazob: JsonNumber
    gio_an_toan_tu_lti_cuoi: JsonNumber
    state: str | None
    # Task 25 carry C1: FE cần id để dựng '/reports/{id}' khi bấm số LTI của một
    # đơn vị — KHÔNG suy từ `state` (state != None và report_id != None trùng
    # nhau ở dữ liệu hiện có, nhưng report_id mới là thứ link thật sự cần).
    report_id: int | None


def _gia_tri_chi_tieu(ma: str):
    """Scalar subquery TƯƠNG QUAN theo `Report.id` của dòng ngoài: con số có
    nghĩa của chỉ tiêu `ma` cho đúng báo cáo đang xét. Không cần SUM — mỗi đơn
    vị tối đa một báo cáo/kỳ (UniqueConstraint(template_id, org_unit_id,
    period_id)) và mỗi báo cáo tối đa một dòng report_value/chỉ tiêu
    (UniqueConstraint(report_id, indicator_id)).

    CỘT nào mang con số đó tuỳ `indicator.agg_type`, chọn bằng CASE ngay trong
    SQL (không thêm round-trip, không khoá cứng mã chỉ tiêu) theo đúng ma trận
    `COT_BAT_BUOC` của app/domain/report_rules.py — nguồn chân lý duy nhất, để
    không chép lại quy tắc ở đây: `sum` → "Tháng này" (`this_period`);
    `counter`/`snapshot` → "Cộng dồn" (`acc_total_entered`); `computed` không
    lưu cột nào nên không WHEN nào khớp → NULL.

    Với `counter` (B-1.5 "Tổng giờ công an toàn không xảy ra LTI", hiện trên
    dashboard là cột "Giờ AT KỂ TỪ LTI cuối") `this_period` chỉ là phần TĂNG
    THÊM của tháng: đọc nó thì dashboard và form báo cáo nói hai con số khác
    nhau cho cùng một ô, và đơn vị chỉ điền đúng cột bắt buộc "Cộng dồn" (hợp
    lệ với counter) sẽ hiện "—" như thể chưa nhập gì."""
    return (
        select(case(*[(Indicator.agg_type == agg, getattr(ReportValue, cot))
                      for agg, cot in COT_BAT_BUOC.items() if cot is not None]))
        .select_from(ReportValue)
        .join(Indicator, Indicator.id == ReportValue.indicator_id)
        .where(ReportValue.report_id == Report.id, Indicator.code == ma)
        .scalar_subquery()
    )


@router.get("/units", response_model=list[DashboardUnitOut])
def bang_don_vi(
    period: str,
    pham_vi: set[int] | None = Depends(_pham_vi),
    db: Session = Depends(get_db),
):
    ky_id = _ky_dang_hoat_dong(period)

    stmt = (
        select(
            OrgUnit.code, OrgUnit.name, WorkflowState.code.label("state"),
            _gia_tri_chi_tieu("B-2.2").label("lti"),
            _gia_tri_chi_tieu("B-2.1").label("fat"),
            _gia_tri_chi_tieu("B-2.10").label("near_miss"),
            _gia_tri_chi_tieu("B-2.11").label("hazob"),
            _gia_tri_chi_tieu("B-1.1").label("gc1"),
            _gia_tri_chi_tieu("B-1.2").label("gc2"),
            _gia_tri_chi_tieu("B-1.3").label("gc3"),
            _gia_tri_chi_tieu("B-1.5").label("gio_an_toan_tu_lti_cuoi"),
            # C1 — một cột THÊM vào câu đang chạy (Report đã outerjoin sẵn ngay dưới),
            # không phải một query mới: test_units_khong_N_cong_1 vẫn canh đúng ngân sách.
            Report.id.label("report_id"),
        )
        .select_from(OrgUnit)
        .outerjoin(Report, and_(Report.org_unit_id == OrgUnit.id, Report.period_id == ky_id))
        .outerjoin(WorkflowState, WorkflowState.id == Report.state_id)
        .where(OrgUnit.is_reporting.is_(True))
        # Khoá sắp CUỐI CÙNG của bảng: `dong.sort` bên dưới là sort ỔN ĐỊNH
        # (Python), nên mọi dòng hoà cả ba khoá giá trị giữ nguyên thứ tự này
        # thay vì thứ tự Postgres tình cờ trả về. Không có nó thì kỳ chưa có
        # báo cáo nào (2026-09 — kỳ người demo bấm sang) hoà toàn bộ 22 dòng
        # và thứ tự đổi giữa các lần tải trang. Theo MÃ đơn vị, cùng quy ước
        # với GET /reports và GET /status.
        .order_by(OrgUnit.code)
    )
    if pham_vi is not None:
        stmt = stmt.where(OrgUnit.id.in_(pham_vi))

    hang = db.execute(stmt).all()

    dong: list[tuple] = []
    for h in hang:
        # "Tổng giờ công" là chỉ tiêu computed (B-1.4, không lưu — xem
        # app/domain/report_rules.py): tính lại bằng đúng công thức
        # evaluate_computed (thành phần trống coi là 0), CHỈ khi đơn vị đã có
        # báo cáo — chưa nộp thì để None nguyên dòng ("—", không click).
        gio_cong = None if h.state is None else _hoac(h.gc1, 0) + _hoac(h.gc2, 0) + _hoac(h.gc3, 0)
        # report_id THÊM VÀO CUỐI tuple (không chen giữa) để không phải sửa lại
        # các chỉ số t[3]/t[4]/t[8] mà khoá sắp xếp ngay dưới đang dùng.
        dong.append((h.code, h.name, h.state, h.lti, h.fat, h.near_miss, h.hazob,
                     h.gio_an_toan_tu_lti_cuoi, gio_cong, h.report_id))

    # Sắp LTI giảm dần, hoà thì FAT giảm dần, hoà tiếp thì giờ công giảm dần
    # (task-13-brief.md Step 3) — đơn vị chưa nộp (không giá trị) luôn xếp
    # cuối, không lẫn vào giữa các đơn vị có số thật.
    dong.sort(key=lambda t: (_hoac(t[3], -1), _hoac(t[4], -1), _hoac(t[8], -1)), reverse=True)

    return [
        DashboardUnitOut(
            org_unit=OrgUnitBrief(code=code, name=name), state=state,
            lti=lti, fat=fat, near_miss=near_miss, hazob=hazob,
            gio_an_toan_tu_lti_cuoi=gio_lti, gio_cong=gio_cong, report_id=report_id,
        )
        for code, name, state, lti, fat, near_miss, hazob, gio_lti, gio_cong, report_id in dong
    ]
