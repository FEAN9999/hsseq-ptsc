# backend/tests/sql/test_view_accumulation.py
from datetime import date, datetime, timezone
from decimal import Decimal

from tests.sql.helpers import (
    dem_dong_view, doc_view, dung_bo_khung, them_bao_cao, them_chi_tieu,
    them_don_vi, them_gia_tri,
)


def test_1_khong_co_so_du_dau_ky_thi_acc_prev_bang_0(db):
    bk = dung_bo_khung(db)
    r6 = them_bao_cao(db, bk, "2026-06", 100)
    row = doc_view(db, r6.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("0")
    assert row.acc_total_computed == Decimal("100")
    assert row.missing_periods == []


def test_2_so_du_giua_chung_thi_cong_tu_do_tro_di(db):
    from app.models import OpeningBalance

    bk = dung_bo_khung(db)
    them_bao_cao(db, bk, "2026-06", 100)
    db.add(OpeningBalance(org_unit_id=bk["org"].id, indicator_id=bk["ind"].id,
                          period_id=bk["ky"]["2026-07"].id, value=Decimal("500"),
                          source="fixture"))
    db.flush()
    r7 = them_bao_cao(db, bk, "2026-07", 30)
    row = doc_view(db, r7.id, bk["ind"].id)
    # số dư ở kỳ 07 nên 100 của kỳ 06 KHÔNG được cộng vào
    assert row.acc_prev_computed == Decimal("500")
    assert row.acc_total_computed == Decimal("530")
    assert row.missing_periods == []


def test_3_ky_o_giua_khong_co_bao_cao_duyet_thi_bo_qua_va_liet_ke(db):
    bk = dung_bo_khung(db)
    them_bao_cao(db, bk, "2026-06", 100)
    # không có báo cáo 07
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    row = doc_view(db, r8.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("100")
    assert row.missing_periods == ["2026-07"]


def test_4_chi_cong_trang_thai_counts_in_totals(db):
    bk = dung_bo_khung(db)
    them_bao_cao(db, bk, "2026-06", 100)
    them_bao_cao(db, bk, "2026-07", 999, state="draft")  # mở lại / chưa duyệt
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    row = doc_view(db, r8.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("100")   # 999 không vào tổng
    assert row.missing_periods == ["2026-07"]


def test_5_thu_tu_theo_start_date_khong_theo_id(db):
    """Thêm kỳ 05 SAU cùng: id lớn nhất nhưng start_date sớm nhất.

    Nếu view sắp xếp / so sánh theo id thay vì start_date thì kỳ 05 bị coi là
    nằm sau kỳ 08 và rơi khỏi tổng. Báo cáo cũng nạp lệch thứ tự (08 trước 07)
    để id của report cũng không trùng thứ tự thời gian.
    """
    from app.models import ReportingPeriod

    bk = dung_bo_khung(db)
    p5 = ReportingPeriod(template_id=bk["tpl"].id, period_key="2026-05",
                         start_date=date(2026, 5, 1), end_date=date(2026, 5, 28),
                         # NOT NULL ở DB — xem ghi chú trong helpers.dung_bo_khung
                         due_at=datetime(2026, 5, 28, 23, 59, 59, tzinfo=timezone.utc),
                         is_open=True)
    db.add(p5); db.flush()
    bk["ky"]["2026-05"] = p5

    them_bao_cao(db, bk, "2026-05", 100)
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    them_bao_cao(db, bk, "2026-07", 50)
    row = doc_view(db, r8.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("150")   # 100 (kỳ 05) + 50 (kỳ 07)
    assert row.missing_periods == ["2026-06"]


def test_6_hai_don_vi_khong_ro_so_sang_nhau(db):
    """Đơn vị 2 có số to và nộp đủ kỳ; đơn vị 1 không được ăn ké số lẫn cảnh báo."""
    bk = dung_bo_khung(db)
    dv2 = them_don_vi(db, "U02")
    them_bao_cao(db, bk, "2026-06", 100)
    them_bao_cao(db, bk, "2026-06", 700, org=dv2)
    them_bao_cao(db, bk, "2026-07", 900, org=dv2)
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    row = doc_view(db, r8.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("100")
    assert row.acc_total_computed == Decimal("120")
    # đơn vị 2 nộp kỳ 07 không che được cho đơn vị 1
    assert row.missing_periods == ["2026-07"]


def test_7_hai_chi_tieu_khong_ro_so_sang_nhau(db):
    bk = dung_bo_khung(db)
    ind2 = them_chi_tieu(db, bk, "B-1.2")
    r6 = them_bao_cao(db, bk, "2026-06", 100)
    them_gia_tri(db, r6, ind2, 700)
    r7 = them_bao_cao(db, bk, "2026-07", 5)
    them_gia_tri(db, r7, ind2, 900)
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    row = doc_view(db, r8.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("105")
    assert row.missing_periods == []


def test_8_chi_tieu_khong_phai_sum_khong_co_trong_view(db):
    bk = dung_bo_khung(db)
    r6 = them_bao_cao(db, bk, "2026-06", 100)
    for ma, loai in [("B-2.1", "counter"), ("B-2.2", "snapshot"), ("B-2.3", "computed")]:
        ind = them_chi_tieu(db, bk, ma, agg_type=loai)
        them_gia_tri(db, r6, ind, 50)
        assert dem_dong_view(db, r6.id, ind.id) == 0, f"{loai} không được có trong view"
    assert dem_dong_view(db, r6.id, bk["ind"].id) == 1


def test_9_chon_so_du_theo_start_date_khong_theo_id(db):
    """Chèn dòng số dư kỳ 08 TRƯỚC dòng kỳ 06 để id ngược thứ tự thời gian."""
    from app.models import OpeningBalance

    bk = dung_bo_khung(db)
    db.add(OpeningBalance(org_unit_id=bk["org"].id, indicator_id=bk["ind"].id,
                          period_id=bk["ky"]["2026-08"].id, value=Decimal("1000"),
                          source="fixture"))
    db.flush()
    db.add(OpeningBalance(org_unit_id=bk["org"].id, indicator_id=bk["ind"].id,
                          period_id=bk["ky"]["2026-06"].id, value=Decimal("500"),
                          source="fixture"))
    db.flush()
    them_bao_cao(db, bk, "2026-06", 100)
    them_bao_cao(db, bk, "2026-07", 50)
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    row = doc_view(db, r8.id, bk["ind"].id)
    # mốc là kỳ 08 vì start_date muộn nhất, dù dòng đó có id nhỏ hơn
    assert row.acc_prev_computed == Decimal("1000")
    assert row.acc_total_computed == Decimal("1020")
    assert row.missing_periods == []


def test_10_bao_cao_ky_tuong_lai_khong_vao_luy_ke(db):
    bk = dung_bo_khung(db)
    them_bao_cao(db, bk, "2026-06", 100)
    r7 = them_bao_cao(db, bk, "2026-07", 50)
    them_bao_cao(db, bk, "2026-08", 20)
    them_bao_cao(db, bk, "2026-09", 999)
    row = doc_view(db, r7.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("100")
    assert row.acc_total_computed == Decimal("150")
    assert row.missing_periods == []


def test_11_ky_da_duyet_nhung_bo_trong_o_thi_khong_bao_thieu(db):
    """Spec: missing_periods là kỳ không có BÁO CÁO ĐƯỢC DUYỆT, không phải kỳ thiếu ô.

    Với 55 chỉ tiêu, ô trống là chuyện thường; báo thiếu ở đây là cảnh báo giả.
    """
    from app.models import Report

    bk = dung_bo_khung(db)
    them_bao_cao(db, bk, "2026-06", 100)
    r7 = Report(template_id=bk["tpl"].id, org_unit_id=bk["org"].id,
                period_id=bk["ky"]["2026-07"].id, state_id=bk["approved"].id,
                version=1, source="seed")
    db.add(r7); db.flush()
    r8 = them_bao_cao(db, bk, "2026-08", 20)
    row = doc_view(db, r8.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("100")
    assert row.missing_periods == []


def test_12_bao_cao_moi_chua_co_o_nao_van_lay_dung_so_du_dau_ky(db):
    """Nhánh MỚI của migration 0003 (`rv` trở thành nullable trong CTE `ctx`).

    Dòng số dư đầu kỳ phải khớp `o2.indicator_id = i.id`, KHÔNG phải
    `= rv.indicator_id`: với báo cáo chưa có ô nào thì `rv.indicator_id` là
    NULL, LATERAL không khớp dòng số dư nào, `ob_start` rơi về NULL và
    `acc_prev` cộng lại toàn bộ lịch sử từ '-infinity'.

    Fixture không lộ ra: cả 1144 dòng `opening_balance` đều ở kỳ đầu (2026-06)
    với `value = 0.00`, nên bỏ số dư đi cũng ra cùng con số. Phải có số dư
    GIỮA năm khác 0 thì hai đường mới tách ra:
      đúng = 1000 (số dư kỳ 08) + 5 (kỳ 08 đã duyệt)        = 1005
      sai  = 3 (kỳ 06) + 4 (kỳ 07) + 5 (kỳ 08), bỏ số dư    = 12
    Người dùng thấy: bấm "Tạo báo cáo" kỳ mới, cột "Lũy kế tháng trước" hiện
    12 thay vì 1005 ngay lần vẽ đầu tiên — đúng con số mà C1 sinh ra để sửa.
    """
    from app.models import OpeningBalance, Report

    bk = dung_bo_khung(db)
    them_bao_cao(db, bk, "2026-06", 3)
    them_bao_cao(db, bk, "2026-07", 4)
    them_bao_cao(db, bk, "2026-08", 5)
    db.add(OpeningBalance(org_unit_id=bk["org"].id, indicator_id=bk["ind"].id,
                          period_id=bk["ky"]["2026-08"].id, value=Decimal("1000"),
                          source="fixture"))
    db.flush()

    r9 = Report(template_id=bk["tpl"].id, org_unit_id=bk["org"].id,
                period_id=bk["ky"]["2026-09"].id, state_id=bk["draft"].id,
                version=1, source="live")
    db.add(r9); db.flush()

    assert dem_dong_view(db, r9.id, bk["ind"].id) == 1, \
        "báo cáo 0 dòng report_value vẫn phải có dòng trong view (chính là C1)"
    row = doc_view(db, r9.id, bk["ind"].id)
    assert row.acc_prev_computed == Decimal("1005")
    assert row.acc_total_computed == Decimal("1005")
    assert row.missing_periods == []
