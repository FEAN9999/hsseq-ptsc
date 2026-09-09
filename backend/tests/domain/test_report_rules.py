from decimal import Decimal

import pytest

from app.domain.report_rules import (
    CellValues, IndicatorSpec, counter_check, evaluate_computed,
    required_for, validate_values,
)


@pytest.mark.parametrize("agg,cot", [
    ("sum", "this_period"),
    ("counter", "acc_total_entered"),
    ("snapshot", "acc_total_entered"),
    ("computed", None),
])
def test_required_for_du_4_loai(agg, cot):
    assert required_for(agg) == cot


def _spec(**kw):
    base = dict(code="B-2.1", agg_type="sum", decimals=0, required=True, formula=None)
    return IndicatorSpec(**{**base, **kw})


def test_validate_thieu_o_bat_buoc():
    loi = validate_values([_spec()], {"B-2.1": CellValues(None, None, None)})
    assert [e.indicator_code for e in loi] == ["B-2.1"]
    assert "bắt buộc" in loi[0].message.lower()


def test_validate_so_am_bi_tu_choi():
    loi = validate_values([_spec()], {"B-2.1": CellValues(Decimal("-1"), None, None)})
    assert loi and "âm" in loi[0].message.lower()


def test_validate_qua_so_chu_so_thap_phan():
    loi = validate_values([_spec(decimals=0)],
                          {"B-2.1": CellValues(Decimal("1.5"), None, None)})
    assert loi and "thập phân" in loi[0].message.lower()


def test_validate_gui_gia_tri_cho_dong_computed():
    loi = validate_values([_spec(agg_type="computed", required=False, formula="B-1.1")],
                          {"B-2.1": CellValues(Decimal("5"), None, None)})
    assert loi and "tự tính" in loi[0].message.lower()


def test_validate_chi_tieu_ngoai_mau():
    loi = validate_values([_spec()], {"KHONG-CO": CellValues(Decimal("1"), None, None)})
    assert [e.indicator_code for e in loi] == ["KHONG-CO"]


def test_evaluate_computed_du_thanh_phan():
    got = evaluate_computed("B-1.1,B-1.2,B-1.3",
                            {"B-1.1": Decimal("10"), "B-1.2": Decimal("20"),
                             "B-1.3": Decimal("5")})
    assert got == Decimal("35")


def test_evaluate_computed_thieu_thanh_phan_coi_la_0():
    got = evaluate_computed("B-1.1,B-1.2,B-1.3",
                            {"B-1.1": Decimal("10"), "B-1.2": None})
    assert got == Decimal("10")


def test_counter_check_khop():
    kq = counter_check(Decimal("1240"), Decimal("180"), Decimal("1420"))
    assert kq.status == "ok"


def test_counter_check_lech_nhung_khong_chan():
    kq = counter_check(Decimal("1240"), Decimal("180"), Decimal("1000"))
    assert kq.status == "lech"
    assert kq.expected == Decimal("1420")
    assert "reset" in kq.message.lower()


def test_counter_check_bo_qua_khi_thieu_this_period():
    assert counter_check(Decimal("1240"), None, Decimal("1420")).status == "bo_qua"


def test_counter_check_bo_qua_khi_ky_truoc_chua_duyet():
    kq = counter_check(None, Decimal("180"), Decimal("1420"))
    assert kq.status == "bo_qua"
    assert "chưa duyệt" in kq.message.lower()
