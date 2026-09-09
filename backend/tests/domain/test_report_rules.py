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


def _spec_khac(**kw):
    """Chỉ tiêu bắt buộc thứ hai, dùng để kiểm ca vắng mặt trong payload."""
    return IndicatorSpec(code="B-2.2", agg_type=kw.get("agg_type", "sum"),
                         decimals=kw.get("decimals", 0),
                         required=kw.get("required", True),
                         formula=kw.get("formula"))


def test_dung_bien_decimals_thi_hop_le():
    """decimals=2 phải nhận đúng 2 chữ số thập phân, chỉ chặn từ chữ số thứ 3."""
    loi = validate_values([_spec(decimals=2)],
                          {"B-2.1": CellValues(Decimal("12.34"), None, None)})
    assert loi == []
    loi = validate_values([_spec(decimals=2)],
                          {"B-2.1": CellValues(Decimal("12.345"), None, None)})
    assert [e.indicator_code for e in loi] == ["B-2.1"]


def test_so_khong_la_gia_tri_hop_le():
    """0 vụ tai nạn là số liệu có nghĩa, không phải số âm."""
    loi = validate_values([_spec()], {"B-2.1": CellValues(Decimal("0"), None, None)})
    assert loi == []


def test_snapshot_chi_nhan_cot_cong_don():
    loi = validate_values([_spec(agg_type="snapshot")],
                          {"B-2.1": CellValues(None, None, Decimal("7"))})
    assert loi == []
    loi = validate_values([_spec(agg_type="snapshot")],
                          {"B-2.1": CellValues(Decimal("7"), None, None)})
    assert [e.message for e in loi] == ["Dòng tự tính, không nhận giá trị gửi lên"]


def test_counter_nhan_ca_hai_cot_nhung_chi_bat_buoc_cong_don():
    loi = validate_values([_spec(agg_type="counter")],
                          {"B-2.1": CellValues(Decimal("3"), None, Decimal("10"))})
    assert loi == []
    # thiếu cột cộng dồn thì báo bắt buộc, dù đã nhập tháng này
    loi = validate_values([_spec(agg_type="counter")],
                          {"B-2.1": CellValues(Decimal("3"), None, None)})
    assert [e.message for e in loi] == ["Ô bắt buộc, chưa có giá trị"]
    # cột lũy kế tháng trước do hệ thống tự điền, không nhận từ người dùng
    loi = validate_values([_spec(agg_type="counter")],
                          {"B-2.1": CellValues(None, Decimal("5"), Decimal("10"))})
    assert [e.message for e in loi] == ["Dòng tự tính, không nhận giá trị gửi lên"]


def test_khong_bat_buoc_thi_de_trong_van_hop_le():
    for loai in ("sum", "counter", "snapshot"):
        loi = validate_values([_spec(agg_type=loai, required=False)],
                              {"B-2.1": CellValues(None, None, None)})
        assert loi == [], f"{loai}: required=False mà vẫn đòi nhập"


def test_counter_check_chua_nhap_cong_don_thi_bo_qua():
    """Đang gõ dở: đã nhập Tháng này nhưng chưa nhập Cộng dồn thì chưa có gì để so."""
    kq = counter_check(Decimal("10"), Decimal("3"), None)
    assert kq.status == "bo_qua"


def test_xoa_trang_o_bat_buoc_van_bao_loi_du_payload_lan_ma_la():
    """Mã lạ trong payload không được nuốt lỗi của chỉ tiêu khác."""
    loi = validate_values(
        [_spec()],
        {"B-2.1": CellValues(None, None, None),
         "KHONG-CO": CellValues(Decimal("1"), None, None)},
    )
    assert sorted(e.indicator_code for e in loi) == ["B-2.1", "KHONG-CO"]


def test_ma_vang_mat_trong_payload_khong_bi_bao_thieu():
    """Payload một phần (D23): ô không gửi là ô không đổi, không phải ô thiếu."""
    loi = validate_values([_spec(), _spec_khac()],
                          {"B-2.1": CellValues(Decimal("5"), None, None)})
    assert loi == []


def test_evaluate_computed_formula_rong_va_none():
    assert evaluate_computed("", {"B-1.1": Decimal("9")}) == Decimal("0")
    assert evaluate_computed(None, {"B-1.1": Decimal("9")}) == Decimal("0")
