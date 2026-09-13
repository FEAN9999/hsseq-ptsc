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

from app.domain.report_rules import CellValues
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


class ValueIn(ApiModel):
    """Một ô trong payload `PUT /reports/{id}/values` — payload MỘT PHẦN:
    chỉ mã chỉ tiêu CÓ MẶT trong danh sách `values` của request bị đụng tới,
    ô nào không gửi giữ nguyên nội dung đang lưu (xem docstring
    `validate_values` ở app/domain/report_rules.py). Không có trường
    `acc_prev_entered` — không agg_type nào cho nhập cột đó (luôn tự điền).

    "Một phần" dừng ở cấp MÃ CHỈ TIÊU. Ở cấp TRƯỜNG thì KHÔNG: gửi
    `{"indicator_code": "B-2.1", "this_period": null}` là XOÁ TRẮNG ô Tháng
    này, còn "giữ nguyên" nghĩa là payload KHÔNG có khoá `this_period`.
    `ghi_gia_tri` phân biệt hai chuyện đó bằng `model_fields_set`, nên mặc
    định `None` dưới đây chỉ để đọc `v.this_period` cho gọn — TUYỆT ĐỐI không
    dùng chính nó để suy ra người dùng có gửi trường đó hay không."""
    indicator_code: str
    this_period: JsonNumber = None
    acc_total_entered: JsonNumber = None
    note: str | None = None

    def as_cells(self) -> CellValues:
        return CellValues(this_period=self.this_period, acc_total_entered=self.acc_total_entered)


class PutValuesIn(ApiModel):
    version: int
    values: list[ValueIn]
    # Cùng hình dạng với `ReportDetailOut.texts` để FE không phải đổi kiểu
    # giữa đọc và ghi. VẮNG MẶT (None) = lượt ghi này không đụng `report_text`;
    # có mặt thì chỉ mã nằm trong dict bị ghi, và `null` là XOÁ TRẮNG ô chữ.
    texts: dict[str, str | None] | None = None


class PutValuesOut(ApiModel):
    version: int
    values: list[ReportValueOut]
