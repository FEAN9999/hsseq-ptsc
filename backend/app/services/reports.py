# backend/app/services/reports.py
"""Đọc dữ liệu report cho API.

`lay_chi_tiet_bao_cao` là hàm ngân sách 2 query cho `GET /reports/{id}`
(xem test_get_report_toi_da_2_query — đếm SELECT thật gửi xuống Postgres,
tính TRÊN TOÀN REQUEST): budget 2 đó tính luôn câu SELECT xác thực của
`current_user()` (Task 8) — không có cách nào bỏ qua nó vì mọi request đều
phải xác thực. Vậy phần đọc dữ liệu của module này chỉ còn ngân sách ĐÚNG 1
query, không phải 2 như cách chia "Query 1 / Query 2" trong brief gốc (đo
thật: brief chia 2 câu cho riêng phần dữ liệu ra 1 (auth) + 2 (dữ liệu) = 3,
vượt ngân sách — xem task-10-report.md mục "khác brief" để biết số đo).

  Query 1 (DUY NHẤT): report + org_unit + reporting_period + report_template +
    workflow_state + indicator + template_section, LEFT JOIN report_value
    (đúng report_id này), LEFT JOIN `v_report_value_computed` (gộp thẳng
    "Query 2" cũ của brief vào làm một JOIN thay vì một round-trip riêng —
    view là một quan hệ SQL bình thường, JOIN được như bảng). Kèm hai cột
    tính bằng subquery tương quan (chạy trong CÙNG một câu SELECT):
      - `prev_total_counter`: acc_total_entered của kỳ TRƯỚC gần nhất có
        counts_in_totals, cùng (org_unit, indicator) — dùng cho counter.
      - `texts_json`: json_object_agg(field_code, content) từ report_text.
    (Brief gợi ý LEFT JOIN LATERAL cho prev_total_counter; subquery tương
    quan có LIMIT 1 tương đương — Postgres tính theo từng dòng ngoài giống
    hệt LATERAL, vẫn một câu SELECT, không vòng lặp Python. Chọn cách này vì
    gọn hơn trong SQLAlchemy Core khi chỉ cần đúng một cột.)

`evaluate_computed`/`counter_check` (report_rules, Task 5) chạy trong Python
trên kết quả query trên — không thêm query nào.
"""
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import ARRAY, Column, Integer, MetaData, Numeric, String, Table
from sqlalchemy import and_, func, join, or_, outerjoin, select, true
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session, aliased

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.domain.report_rules import CellValues, IndicatorSpec, qua_lon, validate_values
from app.domain.report_rules import counter_check as tinh_counter_check
from app.domain.report_rules import evaluate_computed
from app.models import (
    Indicator,
    OrgUnit,
    Report,
    ReportingPeriod,
    ReportTemplate,
    ReportText,
    ReportValue,
    TemplateSection,
    TemplateTextField,
    WorkflowState,
)
from app.schemas.report import (
    CounterCheckOut,
    OrgUnitBrief,
    ReportDetailOut,
    ReportHeaderOut,
    ReportListItem,
    ReportValueOut,
    ValueIn,
)

# `v_report_value_computed` (migration 0002) là view SQL thuần, không có ORM
# model — khai Core Table nhẹ (không autoload, không đụng DB) chỉ để JOIN
# được thẳng vào Query 1 ở dưới, thay vì phải SELECT riêng nó ra một query
# thứ hai.
_META_VIEW = MetaData()
V_REPORT_VALUE_COMPUTED = Table(
    "v_report_value_computed", _META_VIEW,
    Column("report_id", Integer),
    Column("indicator_id", Integer),
    Column("acc_prev_computed", Numeric(18, 2)),
    Column("acc_total_computed", Numeric(18, 2)),
    Column("missing_periods", ARRAY(String)),
)


def _prev_counter_subquery(R, P, WS, RV, Report_, Indicator_, ReportingPeriod_):
    """`acc_total_entered` của kỳ TRƯỚC gần nhất có `counts_in_totals`, cùng
    (org_unit, indicator) — tương quan theo dòng ngoài (Report_/Indicator_/
    ReportingPeriod_ là các bảng của Query 1, KHÔNG alias)."""
    return (
        select(RV.acc_total_entered)
        .select_from(RV)
        .join(R, R.id == RV.report_id)
        .join(P, P.id == R.period_id)
        .join(WS, WS.id == R.state_id)
        .where(
            R.org_unit_id == Report_.org_unit_id,
            RV.indicator_id == Indicator_.id,
            WS.counts_in_totals.is_(True),
            P.start_date < ReportingPeriod_.start_date,
        )
        .order_by(P.start_date.desc())
        .limit(1)
        .scalar_subquery()
    )


def lay_chi_tiet_bao_cao(db: Session, report_id: int) -> tuple[int, ReportDetailOut] | None:
    """Trả `(org_unit_id, ReportDetailOut)` hoặc `None` nếu không có báo cáo
    này. Trả `org_unit_id` riêng để tầng API kiểm phạm vi TRƯỚC khi coi
    response là hợp lệ — không tự lọc theo phạm vi trong WHERE ở đây, vì
    vậy mới phân biệt được 404 (không tồn tại) với 403 (tồn tại nhưng
    ngoài phạm vi)."""
    R2 = aliased(Report)
    P2 = aliased(ReportingPeriod)
    WS2 = aliased(WorkflowState)
    RV2 = aliased(ReportValue)
    prev_counter = _prev_counter_subquery(R2, P2, WS2, RV2, Report, Indicator, ReportingPeriod)

    texts_json = (
        select(func.json_object_agg(ReportText.field_code, ReportText.content))
        .where(ReportText.report_id == Report.id)
        .scalar_subquery()
    )
    # Hợp đồng với FE là `texts: {C1, C2, C3}` — ĐỦ CẢ BA khoá, kể cả trường
    # chưa ai gõ. `json_object_agg` chỉ sinh khoá của trường ĐÃ có dòng trong
    # report_text, nên báo cáo mới gõ C1 trả về `{"C1": ...}` thiếu hẳn C2/C3:
    # textarea của FE chuyển từ controlled sang uncontrolled và mất nội dung
    # đang gõ. Lấy danh sách mã trường chữ của chính mẫu này bằng một subquery
    # tương quan nữa — vẫn nằm trong CÙNG câu SELECT, không tốn round-trip
    # (ngân sách 2 query ở docstring module) — rồi điền None cho trường chưa ghi.
    ma_truong_chu = (
        select(func.array_agg(
            aggregate_order_by(TemplateTextField.code, TemplateTextField.sort_order)))
        .where(TemplateTextField.template_id == Report.template_id)
        .scalar_subquery()
    )

    stmt = (
        select(
            Report.id, Report.version, Report.source, Report.is_late,
            Report.report_no, Report.location, Report.report_date,
            Report.reporter_name, Report.reporter_position,
            Report.submitted_at, Report.decided_at, Report.decision_note,
            WorkflowState.code.label("state_code"),
            OrgUnit.id.label("org_unit_id"), OrgUnit.code.label("org_unit_code"),
            OrgUnit.name.label("org_unit_name"),
            ReportTemplate.code.label("template_code"),
            ReportingPeriod.period_key, ReportingPeriod.due_at,
            Indicator.id.label("indicator_id"), Indicator.code.label("indicator_code"),
            Indicator.agg_type, Indicator.formula,
            ReportValue.this_period, ReportValue.acc_prev_entered,
            ReportValue.acc_total_entered, ReportValue.note,
            prev_counter.label("prev_total_counter"),
            texts_json.label("texts_json"),
            ma_truong_chu.label("ma_truong_chu"),
            V_REPORT_VALUE_COMPUTED.c.acc_prev_computed,
            V_REPORT_VALUE_COMPUTED.c.acc_total_computed,
            V_REPORT_VALUE_COMPUTED.c.missing_periods,
        )
        .select_from(Report)
        .join(OrgUnit, OrgUnit.id == Report.org_unit_id)
        .join(ReportingPeriod, ReportingPeriod.id == Report.period_id)
        .join(ReportTemplate, ReportTemplate.id == Report.template_id)
        .join(WorkflowState, WorkflowState.id == Report.state_id)
        .join(Indicator, and_(Indicator.template_id == Report.template_id,
                              Indicator.active.is_(True)))
        .join(TemplateSection, TemplateSection.id == Indicator.section_id)
        .outerjoin(ReportValue, and_(ReportValue.indicator_id == Indicator.id,
                                     ReportValue.report_id == Report.id))
        .outerjoin(V_REPORT_VALUE_COMPUTED, and_(
            V_REPORT_VALUE_COMPUTED.c.report_id == Report.id,
            V_REPORT_VALUE_COMPUTED.c.indicator_id == Indicator.id,
        ))
        .where(Report.id == report_id)
        .order_by(TemplateSection.sort_order, Indicator.sort_order)
    )
    hang = db.execute(stmt).all()
    if not hang:
        return None

    dau = hang[0]

    this_period_theo_ma = {h.indicator_code: h.this_period for h in hang}
    acc_prev_computed_theo_ma = {
        h.indicator_code: h.acc_prev_computed for h in hang if h.acc_prev_computed is not None
    }
    acc_total_computed_theo_ma = {
        h.indicator_code: h.acc_total_computed for h in hang if h.acc_total_computed is not None
    }

    missing: set[str] = set()
    for h in hang:
        if h.missing_periods:
            missing.update(h.missing_periods)

    values: list[ReportValueOut] = []
    for h in hang:
        this_period = h.this_period
        acc_prev_entered = h.acc_prev_entered
        acc_total_entered = h.acc_total_entered
        acc_prev_computed = h.acc_prev_computed
        acc_total_computed = h.acc_total_computed
        diff = None
        counter_check_out = None

        if h.agg_type == "sum":
            if acc_total_entered is not None and acc_total_computed is not None:
                diff = acc_total_entered - acc_total_computed
        elif h.agg_type == "counter":
            # acc_prev_entered của counter KHÔNG đọc từ report_value (report_rules:
            # cột đó không "nhập được" với counter) — luôn lấy từ kỳ trước qua
            # subquery tương quan, kể cả report seed có ghi sẵn giá trị ở đó.
            acc_prev_entered = h.prev_total_counter
            cc = tinh_counter_check(h.prev_total_counter, this_period, acc_total_entered)
            counter_check_out = CounterCheckOut(
                status=cc.status, expected=cc.expected, message=cc.message)
        elif h.agg_type == "snapshot":
            this_period = None
            acc_prev_entered = None
        elif h.agg_type == "computed":
            this_period = evaluate_computed(h.formula, this_period_theo_ma)
            acc_prev_computed = evaluate_computed(h.formula, acc_prev_computed_theo_ma)
            acc_total_computed = evaluate_computed(h.formula, acc_total_computed_theo_ma)
            acc_prev_entered = None
            acc_total_entered = None

        values.append(ReportValueOut(
            indicator_code=h.indicator_code, this_period=this_period,
            acc_prev_entered=acc_prev_entered, acc_total_entered=acc_total_entered,
            acc_prev_computed=acc_prev_computed, acc_total_computed=acc_total_computed,
            diff=diff, counter_check=counter_check_out, note=h.note,
        ))

    header = ReportHeaderOut(
        org_unit=OrgUnitBrief(code=dau.org_unit_code, name=dau.org_unit_name),
        template_code=dau.template_code, period_key=dau.period_key, due_at=dau.due_at,
        report_no=dau.report_no, location=dau.location, report_date=dau.report_date,
        reporter_name=dau.reporter_name, reporter_position=dau.reporter_position,
        submitted_at=dau.submitted_at, decided_at=dau.decided_at,
        decision_note=dau.decision_note,
    )
    texts: dict[str, str | None] = {ma: None for ma in (dau.ma_truong_chu or [])}
    texts.update(dau.texts_json or {})

    chi_tiet = ReportDetailOut(
        id=dau.id, version=dau.version, state=dau.state_code, source=dau.source,
        is_late=dau.is_late, header=header, missing_periods=sorted(missing),
        values=values, texts=texts,
    )
    return dau.org_unit_id, chi_tiet


def liet_ke_bao_cao(
    db: Session, pham_vi: set[int] | None, template_code: str,
    period_key: str | None, org_unit_code: str | None, state_code: str | None,
) -> list[ReportListItem]:
    """`GET /reports`. `pham_vi` PHẢI là kết quả `pham_vi_bao_cao(u)` — hàm
    này chỉ lọc theo tập id truyền vào, không tự đọc quyền.

    `pham_vi is None` (report.view_all, vd admin/viewer): liệt kê đúng các
    báo cáo đã tồn tại, lọc theo query param.

    `pham_vi` là tập cụ thể (report.view_own_unit, vd reporter): với MỖI
    đơn vị trong tập, mỗi KỲ ĐANG MỞ luôn có một dòng — kể cả chưa có báo
    cáo (state=None, FE hiện hành động "Tạo báo cáo"); kỳ đã đóng chỉ hiện
    nếu đã có báo cáo. Không tự tạo bản ghi nháp nào ở đây, chỉ dựng dòng
    hiển thị.
    """
    tpl = db.query(ReportTemplate).filter_by(code=template_code).one_or_none()
    if tpl is None:
        return []

    if pham_vi is None:
        q = (
            db.query(Report, OrgUnit, WorkflowState, ReportingPeriod)
            .join(OrgUnit, OrgUnit.id == Report.org_unit_id)
            .join(WorkflowState, WorkflowState.id == Report.state_id)
            .join(ReportingPeriod, ReportingPeriod.id == Report.period_id)
            .filter(Report.template_id == tpl.id)
        )
        if org_unit_code:
            q = q.filter(OrgUnit.code == org_unit_code)
        if period_key:
            q = q.filter(ReportingPeriod.period_key == period_key)
        if state_code:
            q = q.filter(WorkflowState.code == state_code)
        q = q.order_by(OrgUnit.code, ReportingPeriod.start_date)
        return [
            ReportListItem(
                id=r.id, period_key=p.period_key,
                org_unit=OrgUnitBrief(code=o.code, name=o.name),
                state=ws.code, source=r.source, is_late=r.is_late,
                due_at=p.due_at, updated_at=r.updated_at, decision_note=r.decision_note,
            )
            for r, o, ws, p in q.all()
        ]

    donvi = pham_vi
    if org_unit_code:
        khop = db.query(OrgUnit.id).filter_by(code=org_unit_code).scalar()
        donvi = donvi & {khop} if khop is not None else set()
    if not donvi:
        return []

    # ReportingPeriod × OrgUnit là tích Đề-các cố ý (mỗi đơn vị trong phạm vi
    # ghép với mỗi kỳ của mẫu) — ON clause của outerjoin Report nhắc tới CẢ
    # HAI bảng đó nên ORM Query không tự suy được "bên trái" nếu chỉ
    # .select_from(A, B) rồi .outerjoin(); dựng FROM tường minh bằng
    # join()/outerjoin() ở mức Core để hết mơ hồ.
    tu_ke = join(ReportingPeriod, OrgUnit, true())
    tu_ke = outerjoin(tu_ke, Report, and_(
        Report.template_id == tpl.id,
        Report.period_id == ReportingPeriod.id,
        Report.org_unit_id == OrgUnit.id,
    ))
    tu_ke = outerjoin(tu_ke, WorkflowState, WorkflowState.id == Report.state_id)

    q = (
        db.query(ReportingPeriod, OrgUnit, Report, WorkflowState)
        .select_from(tu_ke)
        .filter(ReportingPeriod.template_id == tpl.id, OrgUnit.id.in_(donvi))
    )
    if period_key:
        q = q.filter(ReportingPeriod.period_key == period_key)
    q = q.filter(or_(ReportingPeriod.is_open.is_(True), Report.id.isnot(None)))
    q = q.order_by(OrgUnit.code, ReportingPeriod.start_date)

    ket_qua = []
    for p, o, r, ws in q.all():
        if r is None:
            row = ReportListItem(
                id=None, period_key=p.period_key,
                org_unit=OrgUnitBrief(code=o.code, name=o.name),
                state=None, source=None, is_late=None,
                due_at=p.due_at, updated_at=None, decision_note=None,
            )
        else:
            row = ReportListItem(
                id=r.id, period_key=p.period_key,
                org_unit=OrgUnitBrief(code=o.code, name=o.name),
                state=ws.code, source=r.source, is_late=r.is_late,
                due_at=p.due_at, updated_at=r.updated_at, decision_note=r.decision_note,
            )
        if state_code and row.state != state_code:
            continue
        ket_qua.append(row)
    return ket_qua


def _lam_tron(v: Decimal, q: Decimal) -> Decimal:
    """`v.quantize(q, ROUND_HALF_UP)` — KHÔNG dùng `round()` của Python
    (banker's rounding: 12.345 → 12.34, sai với kỳ vọng người nhập số)."""
    return v.quantize(q, rounding=ROUND_HALF_UP)


def _lam_tron_an_toan(v: Decimal | None, q: Decimal) -> Decimal | None:
    """Làm tròn, TRỪ giá trị mà `validate_values` sắp từ chối vì dấu hoặc độ lớn.

    Quantize chạy TRƯỚC validate (xem `ghi_gia_tri`) nên nó không được làm sai
    lệch hai phép kiểm đó:
      - `Decimal("-0.4").quantize(Decimal("1"))` ra `Decimal("-0")`, mà
        `Decimal("-0") < 0` là False → số âm lọt qua kiểm, lưu thành 0 trong
        im lặng; người nhập không nhận lỗi nào và ô cũng không sáng đỏ.
      - `Decimal("1e30").quantize(Decimal("1"))` ném `InvalidOperation` (vượt
        precision 28 của context decimal) → 500 trần thay vì 400 tiếng Việt.
    Trả nguyên giá trị GỐC cho hai ca đó để `validate_values` thấy đúng thứ nó
    cần thấy. Luật thập phân giữ nguyên chủ ý cũ (quantize trước, spec dòng 231
    bắt server làm tròn): 12.345 với decimals=0 vẫn lưu thành 12, không bị 400.
    """
    if v is None or v < 0 or qua_lon(v):
        return v
    return _lam_tron(v, q)


def doc_gia_tri(db: Session, report_id: int) -> list[ReportValueOut]:
    """`values` hiện tại của báo cáo, dùng lại nguyên `lay_chi_tiet_bao_cao`
    (Task 10) — 200 và 409 của PUT /values nhờ vậy trả đúng cùng hình dạng,
    cùng cách tính computed/counter_check/diff với GET /reports/{id}."""
    _, chi_tiet = lay_chi_tiet_bao_cao(db, report_id)
    return chi_tiet.values


def ghi_gia_tri(
    db: Session, report_id: int, version: int, values: list[ValueIn], actor,
) -> tuple[int, list[ReportValueOut]]:
    """`PUT /reports/{id}/values` — payload MỘT PHẦN: chỉ mã chỉ tiêu có mặt
    trong `values` bị đụng tới, mã vắng mặt giữ nguyên nội dung đang lưu
    (spec D23; xem docstring `validate_values`).

    Khoá lạc quan cùng kiểu Task 12 dự định dùng cho `apply_transition`:
    `FOR UPDATE` rồi mới so `version`, tránh mất-cập-nhật khi hai request ghi
    cùng lúc. Thứ tự kiểm: không tồn tại (404) → trạng thái không cho sửa
    (403) → version lệch (409, kèm version + values HIỆN TẠI để FE vá lại
    form) → mã chỉ tiêu lặp trong payload (400) → dữ liệu không hợp lệ theo
    report_rules (400) → ghi.

    `report.state` không có quan hệ ORM (chỉ có `state_id`) nên đọc
    `WorkflowState` bằng một query riêng, không khoá FOR UPDATE — đó là bảng
    danh mục dùng chung, khoá nó sẽ tự serialize hoá mọi request ghi đang ở
    CÙNG trạng thái (vd mọi báo cáo "draft"), một lỗi tương tranh thật chứ
    không phải giả định.
    """
    # `.populate_existing()`: cùng lỗi, cùng bản vá với `apply_transition`
    # (app/services/workflow.py, xem comment dài ở đó). Dependency `_kiem_quyen_ghi`
    # (app/api/reports.py) đã nạp `Report` này vào identity map của CHÍNH session
    # này trước khi route chạy, nên thiếu cờ đó thì `FOR UPDATE` trả lại đối tượng
    # CŨ và phép so `version` dưới đây so với bản đọc TRƯỚC khi khoá: hai `PUT`
    # chồng thời gian (chính sách "lưu khi rời ô", D23) cùng nhận 200 và cái sau
    # ghi đè số của cái trước, không ai nhận 409.
    r = (db.query(Report).filter_by(id=report_id)
         .populate_existing().with_for_update().one_or_none())
    if r is None:
        raise NotFoundError("Không tìm thấy báo cáo")

    trang_thai = db.query(WorkflowState).filter_by(id=r.state_id).one()
    if not trang_thai.is_editable:
        raise ForbiddenError("Báo cáo ở trạng thái không cho sửa")

    if r.version != version:
        raise ConflictError(
            "Người khác vừa sửa báo cáo này",
            state=trang_thai.code, version=r.version, values=doc_gia_tri(db, r.id),
        )

    # Một mã hai lần trong CÙNG payload: session để `autoflush=False` nên lượt
    # get-or-create thứ hai không thấy dòng đang pending → thêm dòng thứ hai →
    # UNIQUE(report_id, indicator_id) nổ thành 500 lúc flush (chỉ với báo cáo
    # mới tạo, tức đúng đường demo). Trả 400 tiếng Việt kèm `errors` để FE tô
    # đúng ô, thay vì tự gộp hai mục — "gộp" là ngữ nghĩa mới cho hợp đồng
    # D23 ("payload là ô đã đổi"), không phải chuyện sửa lỗi ở vòng này.
    lap = [ma for ma, n in Counter(v.indicator_code for v in values).items() if n > 1]
    if lap:
        raise ValidationError(
            "Dữ liệu không hợp lệ",
            errors=[{"indicator_code": ma,
                     "message": "Mã chỉ tiêu bị lặp trong cùng một payload"} for ma in lap],
        )

    chi_tieu = db.query(Indicator).filter_by(template_id=r.template_id, active=True).all()
    theo_ma = {i.code: i for i in chi_tieu}
    catalog = [
        IndicatorSpec(code=i.code, agg_type=i.agg_type, decimals=i.decimals,
                      required=i.required, formula=i.formula)
        for i in chi_tieu
    ]

    # Quantize TRƯỚC khi validate, không phải sau: người nhập gõ "12.345" cho
    # chỉ tiêu decimals=2 phải được server làm tròn thành 12.35 rồi lưu (FE
    # hiện đúng số đã lưu) — validate_values.qua_thap_phan() từ chối thẳng
    # giá trị còn nguyên 3 chữ số thập phân (đúng cho đường CSV fixture, nơi
    # dữ liệu quá thập phân là lỗi nạp thật, xem app/seed/fixture.py), nên
    # validate ở đây phải chạy trên giá trị ĐàQUANTIZE, không phải giá trị
    # người dùng gõ nguyên văn — khác thứ tự so với brief gốc (validate rồi
    # mới quantize), xem "quyết định riêng" trong task-11-report.md.
    da_lam_tron: dict[str, CellValues] = {}
    for v in values:
        ind = theo_ma.get(v.indicator_code)
        if ind is None:
            da_lam_tron[v.indicator_code] = v.as_cells()   # mã lạ: để validate_values tự báo lỗi
            continue
        q = Decimal(10) ** -ind.decimals
        da_lam_tron[v.indicator_code] = CellValues(
            this_period=_lam_tron_an_toan(v.this_period, q),
            acc_total_entered=_lam_tron_an_toan(v.acc_total_entered, q),
        )

    # `kiem_bat_buoc=False`: granularity của D23 là Ô, không phải DÒNG — xem
    # docstring `validate_values`. Kiểm ô bắt buộc là việc của lúc NỘP.
    loi = validate_values(catalog, da_lam_tron, kiem_bat_buoc=False)
    if loi:
        raise ValidationError(
            "Dữ liệu không hợp lệ",
            errors=[{"indicator_code": e.indicator_code, "message": e.message} for e in loi],
        )

    # Nạp trước các dòng đang có bằng MỘT query thay vì một query mỗi ô (Ctrl+S
    # sau khi điền cả form ~53 ô là 59 round-trip với bản cũ; đích chạy là
    # Render free + pooler Supabase).
    id_chi_tieu = [theo_ma[v.indicator_code].id for v in values]
    dong_theo_chi_tieu = {
        row.indicator_id: row
        for row in db.query(ReportValue).filter(
            ReportValue.report_id == r.id, ReportValue.indicator_id.in_(id_chi_tieu)
        ).all()
    } if id_chi_tieu else {}

    for v in values:                       # CHỈ ô được gửi — payload một phần
        ind = theo_ma[v.indicator_code]
        gia_tri = da_lam_tron[v.indicator_code]
        row = dong_theo_chi_tieu.get(ind.id)
        if row is None:
            row = ReportValue(report_id=r.id, indicator_id=ind.id)
            db.add(row)
            dong_theo_chi_tieu[ind.id] = row
        if ind.agg_type == "sum":
            if gia_tri.this_period is not None:
                row.this_period = gia_tri.this_period
            row.acc_prev_entered = None    # nhập sống: hai cột acc luôn NULL cho dòng sum
            row.acc_total_entered = None
        elif ind.agg_type == "counter":
            if gia_tri.this_period is not None:
                row.this_period = gia_tri.this_period
            if gia_tri.acc_total_entered is not None:
                row.acc_total_entered = gia_tri.acc_total_entered
        elif ind.agg_type == "snapshot":
            if gia_tri.acc_total_entered is not None:
                row.acc_total_entered = gia_tri.acc_total_entered
        # "computed": validate_values ở trên đã chặn (COT_NHAP_DUOC rỗng), không tới đây
        if v.note is not None:
            row.note = v.note

    r.version += 1
    r.source = "live"
    db.flush()
    return r.version, doc_gia_tri(db, r.id)
