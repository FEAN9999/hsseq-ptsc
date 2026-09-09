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


def _qua_thap_phan(v: Decimal, decimals: int) -> bool:
    return -v.as_tuple().exponent > decimals


def validate_values(
    catalog: list[IndicatorSpec], values: dict[str, CellValues]
) -> list[FieldError]:
    theo_ma = {i.code: i for i in catalog}
    loi: list[FieldError] = []
    co_chi_tieu_ngoai_mau = False

    for ma, o in values.items():
        spec = theo_ma.get(ma)
        if spec is None:
            loi.append(FieldError(ma, "Chỉ tiêu không có trong mẫu báo cáo"))
            co_chi_tieu_ngoai_mau = True
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
            if _qua_thap_phan(v, spec.decimals):
                loi.append(FieldError(
                    ma, f"Chỉ nhận tối đa {spec.decimals} chữ số thập phân"))
                break

    if not co_chi_tieu_ngoai_mau:
        for spec in catalog:
            cot = required_for(spec.agg_type)
            if not spec.required or cot is None:
                continue
            o = values.get(spec.code)
            if o is None or getattr(o, cot) is None:
                loi.append(FieldError(spec.code, "Ô bắt buộc, chưa có giá trị"))
    return loi


def evaluate_computed(formula: str, by_code: dict[str, Decimal | None]) -> Decimal:
    """MVP chỉ hỗ trợ phép cộng; thành phần trống coi là 0."""
    tong = Decimal("0")
    for ma in (m.strip() for m in formula.split(",") if m.strip()):
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
