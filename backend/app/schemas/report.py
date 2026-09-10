# backend/app/schemas/report.py
"""Schema phản hồi cho GET/POST /reports, GET /reports/{id}.

Mọi field số bắt nguồn từ `report_value` (Numeric(18,2)) hoặc phép tính trên
nó dùng `JsonNumber` (Task 9) — KHÔNG bao giờ khai `Decimal` trần: đã đo
bằng TestClient thật, `Decimal` trần trên `BaseModel` ra JSON thành chuỗi
("3.00") dù có hay không `response_model`, kể cả field không liên quan tới
report_value. Field số nguyên thuần (`id`, `version`, `sort_order`) giữ
`int` thường — không có rủi ro Decimal-thành-chuỗi nên không cần JsonNumber,
và ép qua JsonNumber sẽ biến `id=5` thành `5.0`, sai ý nghĩa của một khoá.
"""
from datetime import date, datetime

from app.schemas.base import ApiModel, JsonNumber


class OrgUnitBrief(ApiModel):
    code: str
    name: str


class ReportListItem(ApiModel):
    """Một dòng của GET /reports. `id`/`state`/`source`/`is_late`/`updated_at`/
    `decision_note` là None khi đây là kỳ đang mở nhưng đơn vị (reporter)
    chưa tạo báo cáo — xem services.reports.liet_ke_bao_cao."""
    id: int | None
    period_key: str
    org_unit: OrgUnitBrief
    state: str | None
    source: str | None
    is_late: bool | None
    due_at: datetime
    updated_at: datetime | None
    decision_note: str | None


class CreateReportIn(ApiModel):
    template: str
    period_key: str


class CreateReportOut(ApiModel):
    id: int


class CounterCheckOut(ApiModel):
    status: str
    expected: JsonNumber
    message: str


class ReportValueOut(ApiModel):
    indicator_code: str
    this_period: JsonNumber
    acc_prev_entered: JsonNumber
    acc_total_entered: JsonNumber
    acc_prev_computed: JsonNumber
    acc_total_computed: JsonNumber
    diff: JsonNumber
    counter_check: CounterCheckOut | None
    note: str | None


class ReportHeaderOut(ApiModel):
    org_unit: OrgUnitBrief
    template_code: str
    period_key: str
    due_at: datetime
    report_no: str | None
    location: str | None
    report_date: date | None
    reporter_name: str | None
    reporter_position: str | None
    submitted_at: datetime | None
    decided_at: datetime | None
    decision_note: str | None


class ReportDetailOut(ApiModel):
    id: int
    version: int
    state: str
    source: str
    is_late: bool
    header: ReportHeaderOut
    missing_periods: list[str]
    values: list[ReportValueOut]
    texts: dict[str, str | None]
