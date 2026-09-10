"""Quy tắc FM01, thuần — không DB, không HTTP.

MA TRẬN agg_type × 3 CỘT (bản sao duy nhất còn lại ở frontend/src/features/report/cellPolicy.ts;
sửa một bên phải sửa bên kia)

  agg_type   | Lũy kế tháng trước | Tháng này        | Cộng dồn        | lưu vào
  -----------+--------------------+------------------+-----------------+---------------------
  sum        | tự điền, chỉ đọc   | NHẬP (bắt buộc)  | client cộng, ro | this_period
  counter    | tự điền, chỉ đọc   | nhập (tuỳ chọn)  | NHẬP (bắt buộc) | this_period + acc_total_entered
  snapshot   | trống              | trống            | NHẬP (bắt buộc) | acc_total_entered
  computed   | tự điền, chỉ đọc   | tự điền, chỉ đọc | tự điền, chỉ đọc| không lưu
"""
from dataclasses import dataclass
from decimal import Decimal

COT_BAT_BUOC = {
    "sum": "this_period",
    "counter": "acc_total_entered",
    "snapshot": "acc_total_entered",
    "computed": None,
}
COT_NHAP_DUOC = {
    "sum": {"this_period"},
    "counter": {"this_period", "acc_total_entered"},
    "snapshot": {"acc_total_entered"},
    "computed": set(),
}


@dataclass(frozen=True)
class IndicatorSpec:
    code: str
    agg_type: str
    decimals: int
    required: bool
    formula: str | None = None


@dataclass(frozen=True)
class CellValues:
    this_period: Decimal | None = None
    acc_prev_entered: Decimal | None = None
    acc_total_entered: Decimal | None = None


@dataclass(frozen=True)
class FieldError:
    indicator_code: str
    message: str


@dataclass(frozen=True)
class CounterCheck:
    status: str            # ok | lech | bo_qua
    expected: Decimal | None
    message: str


def required_for(agg_type: str) -> str | None:
    return COT_BAT_BUOC.get(agg_type)


def editable_columns(agg_type: str) -> set[str]:
    return COT_NHAP_DUOC.get(agg_type, set())


# `report_value` khai `Numeric(18,2)`: Postgres từ chối |giá trị| >= 10^16 bằng
# NumericValueOutOfRange, một exception không ai bắt → 500 trần, vi phạm ràng
# buộc "mọi câu lỗi là tiếng Việt". Chặn ở tầng quy tắc để người nhập dán nhầm
# một ô Excel dạng mũ nhận 400 có câu chỉ dẫn, không phải màn hình trắng.
GIOI_HAN_DO_LON = Decimal(10) ** 16


def qua_lon(v: Decimal) -> bool:
    return abs(v) >= GIOI_HAN_DO_LON


def qua_thap_phan(v: Decimal, decimals: int) -> bool:
    """Số chữ số thập phân THỰC SỰ của `v` (sau khi bỏ số 0 thừa ở cuối) có
    vượt `decimals` khai báo của chỉ tiêu hay không.

    Chuẩn hoá bằng `.normalize()` trước khi đếm — KHÔNG đếm trực tiếp trên
    `.as_tuple().exponent` của giá trị gốc, vì exponent đó phản ánh ĐỊNH DẠNG
    chuỗi Excel xuất ra (Excel luôn xuất 2 chữ số thập phân, kể cả "0.00",
    "3.00"), không phải số chữ số thập phân CÓ NGHĨA của giá trị. "3.00" là
    số 3, hợp lệ với decimals=0; "1.50" mới thực sự có 2 chữ số thập phân,
    vượt decimals=0.

    Bẫy của `Decimal.normalize()`: với số nguyên lớn nó trả dạng mũ
    (`Decimal("100").normalize()` → `Decimal("1E+2")`, exponent +2). Khi đó
    `-exponent` âm, luôn nhỏ hơn mọi `decimals >= 0` nên vẫn ra `False` đúng
    — nhưng test_so_khong_va_so_tron_viet_kieu_excel_van_hop_le khẳng định
    bằng giá trị cụ thể ("100.00" → hợp lệ), không chỉ tin vào suy luận này.
    """
    return -v.normalize().as_tuple().exponent > decimals


def validate_values(
    catalog: list[IndicatorSpec],
    values: dict[str, CellValues],
    *,
    kiem_bat_buoc: bool = True,
) -> list[FieldError]:
    """Kiểm payload MỘT PHẦN của PUT /reports/{id}/values (spec D23).

    Chỉ kiểm những mã CÓ trong `values`. Mã không gửi lên nghĩa là ô không đổi,
    không phải ô thiếu — nên không bao giờ sinh lỗi "bắt buộc" cho mã vắng mặt.

    `kiem_bat_buoc=False` bỏ luôn vòng "ô bắt buộc" cho những mã CÓ trong
    payload — đường ghi (`ghi_gia_tri`) phải truyền False. Lý do: granularity
    của D23 là Ô, không phải DÒNG. Sửa mỗi Ghi chú của một dòng `sum` đã có số,
    hay mỗi cột "Tháng này" của một dòng `counter`, là payload hợp lệ và là
    thao tác thường nhất trên form; kiểm "bắt buộc" ở đó bắt lỗi ô mà người
    dùng KHÔNG gửi và cũng không hề xoá, nên luôn sai. Phép kiểm thiếu ô bắt
    buộc thuộc về lúc NỘP, trên toàn bộ ô đang lưu.

    KHÔNG dùng hàm này cho phép kiểm "thiếu ô bắt buộc lúc nộp" (spec dòng 257):
    lúc nộp phải kiểm TOÀN BỘ ô đang lưu của báo cáo, mà hàm này không nhìn thấy
    chúng — gọi nhầm ở đó sẽ luôn trả rỗng và báo cáo thiếu dữ liệu lọt qua.
    """
    theo_ma = {i.code: i for i in catalog}
    loi: list[FieldError] = []

    for ma, o in values.items():
        spec = theo_ma.get(ma)
        if spec is None:
            loi.append(FieldError(ma, "Chỉ tiêu không có trong mẫu báo cáo"))
            continue
        nhap_duoc = editable_columns(spec.agg_type)
        for cot in ("this_period", "acc_prev_entered", "acc_total_entered"):
            v = getattr(o, cot)
            if v is None:
                continue
            if cot not in nhap_duoc:
                loi.append(FieldError(ma, "Dòng tự tính, không nhận giá trị gửi lên"))
                break
            if v < 0:
                loi.append(FieldError(ma, "Số không được âm"))
                break
            # Trước qua_thap_phan, không phải sau: `Decimal("1e30").normalize()`
            # ra dạng mũ và exponent của Infinity là chữ "F" — đếm thập phân
            # trên số quá lớn không có nghĩa, còn ca Infinity thì nổ TypeError.
            if qua_lon(v):
                loi.append(FieldError(ma, "Số quá lớn, tối đa 16 chữ số phần nguyên"))
                break
            if qua_thap_phan(v, spec.decimals):
                loi.append(FieldError(
                    ma, f"Chỉ nhận tối đa {spec.decimals} chữ số thập phân"))
                break

    if not kiem_bat_buoc:
        return loi

    # Mã đã bị báo lỗi ở vòng trên (sai cột / âm / quá lớn / quá thập phân) thì
    # bỏ qua ở vòng bắt buộc dưới đây — một ô chỉ báo lỗi cụ thể nhất, không
    # chồng thêm lỗi "bắt buộc" lên trên lỗi đã có cho cùng một mã.
    ma_da_loi = {e.indicator_code for e in loi}
    for ma, o in values.items():
        if ma in ma_da_loi:
            continue
        spec = theo_ma.get(ma)
        if spec is None or not spec.required:
            continue
        cot = required_for(spec.agg_type)
        if cot is None:
            continue
        if getattr(o, cot) is None:
            loi.append(FieldError(ma, "Ô bắt buộc, chưa có giá trị"))
    return loi


def evaluate_computed(formula: str | None, by_code: dict[str, Decimal | None]) -> Decimal:
    """MVP chỉ hỗ trợ phép cộng; thành phần trống coi là 0; công thức rỗng trả 0."""
    tong = Decimal("0")
    for ma in (m.strip() for m in (formula or "").split(",") if m.strip()):
        tong += by_code.get(ma) or Decimal("0")
    return tong


def counter_check(
    prev_total: Decimal | None,
    this_period: Decimal | None,
    entered_total: Decimal | None,
) -> CounterCheck:
    if prev_total is None:
        return CounterCheck("bo_qua", None, "Kỳ trước chưa duyệt, không kiểm tra liên tục")
    if this_period is None or entered_total is None:
        return CounterCheck("bo_qua", None, "Chưa đủ số để kiểm tra liên tục")
    mong_doi = prev_total + this_period
    if mong_doi == entered_total:
        return CounterCheck("ok", mong_doi, "")
    return CounterCheck(
        "lech",
        mong_doi,
        f"Lệch công thức (kỳ trước {prev_total} + tháng này {this_period} = {mong_doi}). "
        f"Có reset (LTI / đầu năm)? Nên ghi lý do vào Ghi chú",
    )
