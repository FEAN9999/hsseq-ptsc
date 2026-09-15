# backend/tests/api/test_fixture_loader.py
"""Test `load_fixture`.

Lệch so với brief gốc (task-7-brief.md Step 2), CÓ CHỦ ĐÍCH: brief viết các
test này bằng `seed_all(db)` để dựng khung (org/catalog/workflow/kỳ) rồi tự
nạp một CSV nhỏ riêng. Từ Task 7, `seed_all()` TỰ nạp `FIXTURE_CSV` (trong
test là `tests/fixtures/full_synthetic.csv`, xem conftest.py) — gọi
`seed_all(db)` rồi nạp thêm `mini_*.csv` đè lên CÙNG bộ đơn vị/kỳ sẽ đụng
UNIQUE(template_id, org_unit_id, period_id) của `report`, và sha256 đã ghi
nhận từ lần nạp full_synthetic sẽ làm mọi lần nạp `mini_*.csv` sau đó bị coi
là "fixture đã đổi" (cảnh báo, không nạp) — hỏng đúng cái các test này định
kiểm.

`_seed_khung(db)` dựng lại CHÍNH XÁC phần khung mà `seed_all` dựng, KHÔNG gọi
`load_fixture` — giữ các test loader độc lập với full_synthetic.csv, đúng ý
gốc của brief. Việc `seed_all()` tự nạp full_synthetic.csv (và các giá trị cụ
thể sinh ra) được kiểm ở nhóm test riêng cuối file.
"""
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.seed import seed_all
from app.seed.fixture import FixtureError, load_fixture
from tests.conftest import _seed_khung

MINI = "tests/fixtures/mini_ok.csv"
VN = ZoneInfo("Asia/Ho_Chi_Minh")


def _tpl(db):
    from app.models import ReportTemplate
    return db.query(ReportTemplate).filter_by(code="FM01").one()


# ---------------------------------------------------------------------------
# 6 test theo brief Step 2 — giá trị CSV/thông điệp lỗi giữ nguyên văn,
# chỉ đổi `seed_all(db)` → `_seed_khung(db)` (lý do: xem docstring module).
# ---------------------------------------------------------------------------

def test_nap_tao_bao_cao_approved_source_seed(db):
    from app.models import Report
    _seed_khung(db)
    load_fixture(db, _tpl(db), MINI)
    r = db.query(Report).filter_by(source="seed").first()
    assert r is not None and r.decided_at is not None and r.is_late is False


def test_ma_la_thi_khong_nap_nua_chung(db):
    from app.models import Report
    _seed_khung(db)
    truoc = db.query(Report).count()
    with pytest.raises(FixtureError) as e:
        load_fixture(db, _tpl(db), "tests/fixtures/mini_ma_la.csv")
    assert "KHONG-TON-TAI" in str(e.value)
    assert db.query(Report).count() == truoc, "đã nạp nửa chừng"


def test_assert_luy_ke_bat_duoc_lech(db):
    _seed_khung(db)
    with pytest.raises(FixtureError) as e:
        load_fixture(db, _tpl(db), "tests/fixtures/mini_lech_luy_ke.csv")
    assert "B-1.1" in str(e.value) and "2026-07" in str(e.value)


def test_thieu_han_mot_dong_bat_buoc_thi_tu_choi_ca_file(db):
    """Lưới THƯA: file có B-1.2 ở kỳ 06 và 07 của U01 nhưng KHÔNG có ở kỳ 08.

    Đây là hình dạng thật của file dán từ sheet — người nhập bỏ trống hẳn dòng
    cho chỉ tiêu tháng đó không có sự kiện. Trước khi có
    `_assert_du_chi_tieu_bat_buoc`, file này nạp SẠCH (chỉ ô rỗng mới báo lỗi,
    dòng vắng mặt thì không), dashboard hiện đúng, và lỗi chỉ nổ ra khi ai đó
    bấm "Nộp" — 400 kèm danh sách chỉ tiêu, đúng nút, đúng phút của phân đoạn
    demo, vì cổng `_thieu_o_bat_buoc` (Task 12) đòi đủ ô bắt buộc mới cho nộp.

    Khẳng định NGUYÊN danh sách lỗi, không chỉ "có raise": thông điệp phải nói
    đủ đơn vị nào, kỳ nào, thiếu mã nào — thiếu một trong ba thì người nạp
    không biết sửa dòng nào của file 3432 dòng. So bằng `==` cũng khoá luôn
    việc không có lỗi NÀO KHÁC nổ kèm (lũy kế, số dư đầu kỳ) cho đúng file này.
    """
    from app.models import Report
    _seed_khung(db)
    truoc = db.query(Report).count()
    with pytest.raises(FixtureError) as e:
        load_fixture(db, _tpl(db), "tests/fixtures/mini_thieu_dong.csv")
    assert e.value.loi == [
        "U01,2026-08: thiếu 1 chỉ tiêu bắt buộc (file có ở (đơn vị, kỳ) khác): B-1.2"
    ]
    assert db.query(Report).count() == truoc, "đã nạp nửa chừng"


def test_so_du_dau_ky_chi_o_ky_dau_cua_fixture(db):
    from app.models import OpeningBalance
    _seed_khung(db)
    load_fixture(db, _tpl(db), MINI)
    ob = db.query(OpeningBalance).all()
    assert len({o.period_id for o in ob}) == 1, "số dư phải nằm đúng một kỳ (kỳ đầu)"


def test_nap_hai_lan_khong_dung_bao_cao_da_co(db):
    from app.models import ReportValue
    _seed_khung(db)
    load_fixture(db, _tpl(db), MINI)
    truoc = {(v.report_id, v.indicator_id): v.this_period
             for v in db.query(ReportValue).all()}
    load_fixture(db, _tpl(db), MINI)
    sau = {(v.report_id, v.indicator_id): v.this_period
           for v in db.query(ReportValue).all()}
    assert truoc == sau


def test_csv_doi_thi_canh_bao_khong_tu_nap_lai(db, caplog):
    """T16: sha256 khác lần trước → log cảnh báo to, dữ liệu giữ nguyên."""
    from app.models import ReportValue
    _seed_khung(db)
    load_fixture(db, _tpl(db), MINI)
    truoc = db.query(ReportValue).count()
    kq = load_fixture(db, _tpl(db), "tests/fixtures/mini_lech_luy_ke_da_sua.csv")
    assert any("fixture đã đổi" in w for w in kq.warnings)
    assert db.query(ReportValue).count() == truoc


# ---------------------------------------------------------------------------
# Giá trị cụ thể + metadata báo cáo nạp từ MINI (không chỉ tồn tại/đếm số lượng)
# ---------------------------------------------------------------------------

def test_nap_dung_gia_tri_va_metadata_ca_3_ky(db):
    from app.models import AppUser, Indicator, OrgUnit, Report, ReportingPeriod, ReportValue
    _seed_khung(db)
    tpl = _tpl(db)
    load_fixture(db, tpl, MINI)

    u01 = db.query(OrgUnit).filter_by(code="U01").one()
    ind = db.query(Indicator).filter_by(template_id=tpl.id, code="B-1.1").one()
    mong_doi = {  # period_key: (this_period, acc_prev, acc_total)
        "2026-06": (Decimal("100.00"), Decimal("0.00"), Decimal("100.00")),
        "2026-07": (Decimal("50.00"), Decimal("100.00"), Decimal("150.00")),
        "2026-08": (Decimal("25.00"), Decimal("150.00"), Decimal("175.00")),
    }
    for period_key, (this_period, acc_prev, acc_total) in mong_doi.items():
        ky = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key=period_key).one()
        bc = db.query(Report).filter_by(template_id=tpl.id, org_unit_id=u01.id, period_id=ky.id).one()
        v = db.query(ReportValue).filter_by(report_id=bc.id, indicator_id=ind.id).one()
        assert (v.this_period, v.acc_prev_entered, v.acc_total_entered) == (this_period, acc_prev, acc_total), \
            f"kỳ {period_key}: giá trị sai"

    ky06 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-06").one()
    bc06 = db.query(Report).filter_by(template_id=tpl.id, org_unit_id=u01.id, period_id=ky06.id).one()
    nguoi_nhap = db.query(AppUser).filter_by(email="u01@ptsc.local").one()
    admin = db.query(AppUser).filter_by(email="admin@ptsc.local").one()
    assert bc06.created_by == nguoi_nhap.id, "created_by phải là người nhập của U01"
    assert bc06.decided_by == admin.id, "decided_by phải là admin"
    moc = datetime(2026, 7, 5, 17, 0, 0, tzinfo=VN)  # 17:00 ngày 05/07 — tháng SAU kỳ 06
    assert bc06.first_submitted_at == moc
    assert bc06.submitted_at == moc
    assert bc06.decided_at == moc


def test_so_du_dau_ky_gia_tri_dung(db):
    from app.models import Indicator, OpeningBalance, OrgUnit, ReportingPeriod
    _seed_khung(db)
    tpl = _tpl(db)
    load_fixture(db, tpl, MINI)

    u01 = db.query(OrgUnit).filter_by(code="U01").one()
    ind = db.query(Indicator).filter_by(template_id=tpl.id, code="B-1.1").one()
    ky06 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-06").one()
    ob = db.query(OpeningBalance).filter_by(org_unit_id=u01.id, indicator_id=ind.id).one()
    assert ob.period_id == ky06.id
    assert ob.value == Decimal("0.00")
    assert ob.source == "seed"


# ---------------------------------------------------------------------------
# _assert_luy_ke: `counter` được miễn công thức `sum`, nhưng vẫn phải liên tục
# (acc_prev kỳ sau khớp acc_total kỳ trước) — FM01 có 4 chỉ tiêu counter reset
# theo LTI/năm/dự án (B-1.5, B-1.6, B-1.7, B-1.8).
# ---------------------------------------------------------------------------

def test_counter_duoc_phep_reset_khong_ap_cong_thuc_sum(db):
    """4 chỉ tiêu counter của FM01 reset theo LTI / theo năm / theo dự án.

    Reset nghĩa là acc_total TỤT XUỐNG, không bằng acc_prev + this_period.
    Áp công thức của `sum` cho `counter` sẽ từ chối nhầm dữ liệu đúng.
    """
    from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportValue
    _seed_khung(db)
    tpl = _tpl(db)
    kq = load_fixture(db, tpl, "tests/fixtures/mini_counter_reset.csv")
    assert kq.created_reports == 3, "3 kỳ x 1 đơn vị = 3 báo cáo"

    u01 = db.query(OrgUnit).filter_by(code="U01").one()
    ind = db.query(Indicator).filter_by(template_id=tpl.id, code="B-1.5").one()
    assert ind.agg_type == "counter"
    mong_doi = {  # period_key: (this_period, acc_prev, acc_total)
        "2026-06": (Decimal("1000.00"), Decimal("0.00"), Decimal("1000.00")),
        "2026-07": (Decimal("500.00"), Decimal("1000.00"), Decimal("500.00")),  # reset
        "2026-08": (Decimal("300.00"), Decimal("500.00"), Decimal("800.00")),
    }
    for period_key, (this_period, acc_prev, acc_total) in mong_doi.items():
        ky = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key=period_key).one()
        bc = db.query(Report).filter_by(template_id=tpl.id, org_unit_id=u01.id, period_id=ky.id).one()
        v = db.query(ReportValue).filter_by(report_id=bc.id, indicator_id=ind.id).one()
        assert (v.this_period, v.acc_prev_entered, v.acc_total_entered) == (this_period, acc_prev, acc_total), \
            f"kỳ {period_key}: giá trị sai"


def test_counter_dut_mach_luy_ke_van_bi_tu_choi(db):
    """Miễn công thức cộng không có nghĩa là miễn mọi kiểm tra: acc_prev kỳ sau
    vẫn phải khớp acc_total kỳ trước, kể cả với counter."""
    _seed_khung(db)
    tpl = _tpl(db)
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, "tests/fixtures/mini_counter_dut_mach.csv")
    thong_diep = str(e.value)
    assert "B-1.5" in thong_diep and "2026-07" in thong_diep
    assert "999.00" in thong_diep and "1000.00" in thong_diep, "phải nêu đúng giá trị lệch"


# ---------------------------------------------------------------------------
# Các nhánh lỗi/bỏ qua khác — CSV dựng tại chỗ bằng tmp_path (không thêm file
# fixture mới ngoài danh sách brief đã liệt kê)
# ---------------------------------------------------------------------------

def test_dong_trung_khoa_bi_tu_choi_khong_nap_nua_chung(db, tmp_path):
    from app.models import Report
    _seed_khung(db)
    tpl = _tpl(db)
    truoc = db.query(Report).count()
    csv_path = tmp_path / "trung.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-1.1,100.00,0.00,100.00,\n"
        "U01,2026-06,B-1.1,50.00,0.00,50.00,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    assert "trùng" in str(e.value)
    assert db.query(Report).count() == truoc


def test_dong_computed_duoc_bo_qua_khong_phai_loi(db, tmp_path):
    from app.models import Indicator, ReportValue
    _seed_khung(db)
    tpl = _tpl(db)
    ind_computed = db.query(Indicator).filter_by(template_id=tpl.id, code="B-1.4").one()
    assert ind_computed.agg_type == "computed"

    csv_path = tmp_path / "co_computed.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-1.1,100.00,0.00,100.00,\n"
        "U01,2026-06,B-1.4,999.00,0.00,999.00,\n",
        encoding="utf-8",
    )
    kq = load_fixture(db, tpl, str(csv_path))
    assert kq.created_reports == 1
    assert kq.skipped == 1
    assert db.query(ReportValue).filter_by(indicator_id=ind_computed.id).count() == 0, \
        "dòng computed không được lưu report_value"


def test_so_sai_dinh_dang_bi_bat(db, tmp_path):
    _seed_khung(db)
    tpl = _tpl(db)
    csv_path = tmp_path / "sai_so.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-1.1,khong-phai-so,0.00,100.00,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    assert "số sai định dạng" in str(e.value)


def test_so_am_bi_tu_choi_khong_nap_nua_chung(db, tmp_path):
    """Dữ liệu dán tay từ Excel dễ gõ nhầm dấu trừ — số âm không được nạp trót
    lọt vào report_value, kể cả khi tự thoả công thức lũy kế (-5 + -3 = -8)."""
    from app.models import Report
    _seed_khung(db)
    tpl = _tpl(db)
    truoc = db.query(Report).count()
    csv_path = tmp_path / "so_am.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-2.2,-3,-5,-8,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    thong_diep = str(e.value)
    assert "dòng 2" in thong_diep and "B-2.2" in thong_diep
    assert "-3" in thong_diep and "-5" in thong_diep and "-8" in thong_diep, \
        "phải nêu đúng giá trị âm của cả 3 cột"
    assert "âm" in thong_diep
    assert db.query(Report).count() == truoc, "đã nạp nửa chừng"


def test_qua_thap_phan_bi_tu_choi_khong_nap_nua_chung(db, tmp_path):
    """B-2.1 khai decimals=0 — 1.50 là thập phân dư từ công thức Excel, không
    phải số nguyên vụ việc thật."""
    from app.models import Report
    _seed_khung(db)
    tpl = _tpl(db)
    truoc = db.query(Report).count()
    csv_path = tmp_path / "qua_thap_phan.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-2.1,1.50,0,1.50,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    thong_diep = str(e.value)
    assert "dòng 2" in thong_diep and "B-2.1" in thong_diep
    assert "1.50" in thong_diep and "thập phân" in thong_diep
    assert db.query(Report).count() == truoc, "đã nạp nửa chừng"


def test_quantize_ve_dung_decimals_cua_chi_tieu():
    """Đơn vị cho `_quantize()` — hàm loader gọi ngay trước khi tạo
    ReportValue/OpeningBalance (Thay đổi 3). Kiểm ở tầng hàm thuần, KHÔNG qua
    report_value: cột đó khai `Numeric(18, 2)` — Postgres luôn trả về đúng 2
    chữ số thập phân bất kể lưu Decimal("3") hay Decimal("3.00") (đã tự kiểm
    chứng bằng SQL thô, xem báo cáo), nên exponent không thể quan sát được
    qua report_value; phải kiểm trực tiếp trên hàm."""
    from app.seed.fixture import _quantize
    assert _quantize(Decimal("3.00"), 0) == Decimal("3")
    assert _quantize(Decimal("3.00"), 0).as_tuple().exponent == 0
    assert _quantize(Decimal("0.00"), 0).as_tuple().exponent == 0
    assert _quantize(Decimal("12.3"), 2) == Decimal("12.30")
    assert _quantize(Decimal("12.3"), 2).as_tuple().exponent == -2


def test_ghi_thuc_su_goi_quantize_truoc_khi_flush_reportvalue(db, tmp_path):
    """_quantize() đúng (test trên) không tự chứng minh `_ghi()` THỰC SỰ gọi
    nó — xoá lời gọi quantize trong `_ghi()` (giữ nguyên hàm `_quantize`) vẫn
    lọt qua mọi test đọc report_value bằng SELECT tươi, vì cột Numeric(18,2)
    tự làm tròn về 2 chữ số thập phân bất kể Python gửi lên "3" hay "3.00"
    (mutation M-H). Bắt đúng lúc bằng sự kiện before_flush của SQLAlchemy —
    object ReportValue lúc đó vẫn còn nguyên trong bộ nhớ, CHƯA qua DB."""
    from sqlalchemy import event

    from app.models import ReportValue

    _seed_khung(db)
    tpl = _tpl(db)
    csv_path = tmp_path / "kieu_excel_quantize.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-2.1,3.00,0.00,3.00,\n",
        encoding="utf-8",
    )

    bat_duoc: list[Decimal] = []

    def _bat(session, flush_context, instances):
        for obj in session.new:
            if isinstance(obj, ReportValue):
                bat_duoc.append(obj.this_period)

    event.listen(db, "before_flush", _bat)
    try:
        load_fixture(db, tpl, str(csv_path))
    finally:
        event.remove(db, "before_flush", _bat)

    assert bat_duoc, "phải bắt được ReportValue trước lúc flush"
    assert bat_duoc[0] == Decimal("3")
    assert bat_duoc[0].as_tuple().exponent == 0, \
        "this_period phải được quantize về 0 chữ số thập phân TRƯỚC khi flush, không giữ 3.00"


def test_nap_file_kieu_excel_moi_o_2_chu_so_thap_phan(db, tmp_path):
    """File thật Ban ATCL dán vào tuần 2 sẽ đúng hình dạng này: Excel xuất
    MỌI ô 2 chữ số thập phân, kể cả B-2.1 (decimals=0). File phải nạp được,
    và giá trị lưu vào report_value phải ĐÚNG bằng số đã nhập (3, không phải
    1.50 hay bị từ chối) — hành vi quantize tự nó được kiểm riêng ở
    test_quantize_ve_dung_decimals_cua_chi_tieu vì report_value.this_period
    khai Numeric(18, 2) cố định, không thể phân biệt "3" với "3.00" qua giá
    trị đọc lại."""
    from app.models import Indicator, ReportValue
    _seed_khung(db)
    tpl = _tpl(db)
    csv_path = tmp_path / "kieu_excel.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-2.1,3.00,0.00,3.00,\n",
        encoding="utf-8",
    )
    kq = load_fixture(db, tpl, str(csv_path))
    assert kq.created_reports == 1, "file kiểu Excel phải nạp được, không bị từ chối"

    ind = db.query(Indicator).filter_by(template_id=tpl.id, code="B-2.1").one()
    assert ind.decimals == 0
    v = db.query(ReportValue).filter_by(indicator_id=ind.id).one()
    assert (v.this_period, v.acc_prev_entered, v.acc_total_entered) == \
        (Decimal("3"), Decimal("0"), Decimal("3"))


def test_nap_file_kieu_excel_gia_tri_le_that_van_bi_tu_choi(db, tmp_path):
    """Cùng hình dạng Excel (2 chữ số thập phân ở mọi ô), nhưng 1.50 là thập
    phân lẻ THẬT của B-2.1 (decimals=0) — khác với 3.00 chỉ là cách Excel
    viết tròn số — nên vẫn phải bị từ chối."""
    from app.models import Report
    _seed_khung(db)
    tpl = _tpl(db)
    truoc = db.query(Report).count()
    csv_path = tmp_path / "kieu_excel_le.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-2.1,1.50,0.00,1.50,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    thong_diep = str(e.value)
    assert "1.50" in thong_diep and "thập phân" in thong_diep
    assert db.query(Report).count() == truoc, "đã nạp nửa chừng"


def test_chi_tieu_la_bi_bat(db, tmp_path):
    _seed_khung(db)
    tpl = _tpl(db)
    csv_path = tmp_path / "chi_tieu_la.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,Z-9.9,100.00,0.00,100.00,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    assert "Z-9.9" in str(e.value)


def test_ky_la_bi_bat(db, tmp_path):
    _seed_khung(db)
    tpl = _tpl(db)
    csv_path = tmp_path / "ky_la.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2099-01,B-1.1,100.00,0.00,100.00,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    assert "2099-01" in str(e.value)


def test_so_du_khong_o_ky_dau_fixture_bi_bat(db, tmp_path):
    """U02 chỉ xuất hiện từ kỳ 07 — kỳ đầu CỦA CẢ FIXTURE là 06 (do U01) nên
    acc_prev khởi đầu của U02 không có chỗ lưu hợp lệ (opening_balance chỉ
    sinh ở kỳ đầu fixture)."""
    _seed_khung(db)
    tpl = _tpl(db)
    csv_path = tmp_path / "lech_ky_dau.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n"
        "U01,2026-06,B-1.1,100.00,0.00,100.00,\n"
        "U02,2026-07,B-1.1,50.00,30.00,80.00,\n",
        encoding="utf-8",
    )
    with pytest.raises(FixtureError) as e:
        load_fixture(db, tpl, str(csv_path))
    thong_diep = str(e.value)
    assert "U02" in thong_diep and "không phải kỳ đầu" in thong_diep


def test_file_khong_ton_tai_tra_ve_canh_bao_khong_nem_loi(db, tmp_path):
    _seed_khung(db)
    tpl = _tpl(db)
    kq = load_fixture(db, tpl, str(tmp_path / "khong_ton_tai.csv"))
    assert kq.created_reports == 0
    assert any("không có file fixture" in w for w in kq.warnings)


def test_file_khong_ton_tai_co_log_warning_nhu_nhanh_sha_doi(db, tmp_path, caplog):
    """(final-fix-du2.md §3) Nhánh CÂM NHẤT mà lại dễ gặp nhất: gõ nhầm tên file
    / `FIXTURE_CSV` trỏ chỗ khác. Trước đây nó `return` lặng lẽ, không một dòng
    log — nhánh sha đổi ngay dưới thì log to có khung `===`. Khoá nguyên MỆNH ĐỀ
    (đường dẫn thật + chỗ cần kiểm), không dò mẩu: một `log.warning("bỏ qua")`
    trống rỗng vẫn phải ĐỎ."""
    import logging

    _seed_khung(db)
    thieu = tmp_path / "khong_ton_tai.csv"
    caplog.set_level(logging.WARNING, logger="app.seed.fixture")
    load_fixture(db, _tpl(db), str(thieu))

    dong_warning = [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING]
    assert dong_warning, "nhánh file không tồn tại vẫn CÂM: không log gì cả"
    gop = "\n".join(dong_warning)
    assert f"không có file fixture {thieu}" in gop, gop
    assert "FIXTURE_CSV" in gop, gop


def test_fixture_chi_co_header_khong_im_lang(db, tmp_path, caplog):
    """(final-fix-du2.md) File đọc được, cấu trúc đúng, nhưng 0 dòng dữ liệu —
    hôm nay file thật `fm01_2026-06_2026-08.csv` đúng là như vậy. `load_fixture`
    trả `created_reports == 0` và KHÔNG một cảnh báo nào: người gõ lệnh không có
    cách nào biết. Phải có cảnh báo nêu đúng nguyên nhân."""
    import logging

    _seed_khung(db)
    csv_path = tmp_path / "chi_header.csv"
    csv_path.write_text(
        "org_code,period,indicator_code,this_period,acc_prev,acc_total,note\n",
        encoding="utf-8",
    )
    caplog.set_level(logging.WARNING, logger="app.seed.fixture")
    kq = load_fixture(db, _tpl(db), str(csv_path))

    assert kq.created_reports == 0
    assert kq.skipped == 0
    gop_canh_bao = "\n".join(kq.warnings)
    assert f"file fixture {csv_path} không có dòng dữ liệu nào nạp được" in gop_canh_bao, \
        gop_canh_bao
    gop_log = "\n".join(r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING)
    assert str(csv_path) in gop_log, gop_log


# ---------------------------------------------------------------------------
# seed_all() tự nạp FIXTURE_CSV (full_synthetic.csv trong test, xem conftest)
# ---------------------------------------------------------------------------

def test_seed_all_tra_ve_ket_qua_cua_load_fixture(db):
    """(final-fix-du2.md §1) `seed_all` từng gọi `load_fixture` rồi vứt thẳng giá
    trị trả về — kênh báo cáo nối vào hư không. Khoá bằng CON SỐ thật của
    full_synthetic.csv (66 báo cáo, xem test ngay dưới), không phải `is not
    None`: trả về một `LoadResult()` rỗng cho có cũng phải ĐỎ."""
    kq = seed_all(db)
    assert kq.created_reports == 66
    assert kq.warnings == []


def test_seed_all_nap_du_66_bao_cao_21_duyet_1_nhap_o_ky_08(db):
    from app.models import Report, ReportingPeriod, ReportTemplate, WorkflowState
    seed_all(db)
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    assert db.query(Report).filter_by(template_id=tpl.id).count() == 66  # 22 đơn vị x 3 kỳ

    ky08 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-08").one()
    approved = db.query(WorkflowState).filter_by(template_id=tpl.id, code="approved").one()
    draft = db.query(WorkflowState).filter_by(template_id=tpl.id, code="draft").one()
    assert db.query(Report).filter_by(template_id=tpl.id, period_id=ky08.id, state_id=approved.id).count() == 21
    assert db.query(Report).filter_by(template_id=tpl.id, period_id=ky08.id, state_id=draft.id).count() == 1


def test_seed_all_gia_tri_cu_the_u01_ky08_b11(db):
    """Đối chiếu công thức tất định trong gen_fixture.py: org_idx=1 (U01),
    ind_idx=1 (B-1.1), ky_idx=2 (2026-08) → delta=1+(1+1+2)%5=5, acc_prev=7."""
    from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportTemplate, ReportValue
    seed_all(db)
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    u01 = db.query(OrgUnit).filter_by(code="U01").one()
    ky08 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-08").one()
    ind = db.query(Indicator).filter_by(template_id=tpl.id, code="B-1.1").one()
    bc = db.query(Report).filter_by(template_id=tpl.id, org_unit_id=u01.id, period_id=ky08.id).one()
    v = db.query(ReportValue).filter_by(report_id=bc.id, indicator_id=ind.id).one()
    assert (v.this_period, v.acc_prev_entered, v.acc_total_entered) == \
        (Decimal("5.00"), Decimal("7.00"), Decimal("12.00"))


def test_seed_all_don_vi_thu_22_la_p05_nhap_song_giu_du_gia_tri(db):
    from app.models import (
        Indicator, OrgUnit, Report, ReportingPeriod, ReportTemplate, ReportValue, WorkflowState,
    )
    seed_all(db)
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()

    don_vi_22 = (
        db.query(OrgUnit).filter_by(is_reporting=True).order_by(OrgUnit.id).all()
    )[21]
    assert don_vi_22.code == "P05", "đơn vị thứ 22 theo thứ tự seed phải là P05"

    ky08 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-08").one()
    bc = db.query(Report).filter_by(template_id=tpl.id, org_unit_id=don_vi_22.id, period_id=ky08.id).one()
    draft = db.query(WorkflowState).filter_by(template_id=tpl.id, code="draft").one()
    assert bc.state_id == draft.id
    assert bc.source == "live"
    assert bc.decided_at is None and bc.decided_by is None
    assert bc.submitted_at is None and bc.first_submitted_at is None
    assert bc.is_late is False
    assert db.query(ReportValue).filter_by(report_id=bc.id).count() == 52, "phải giữ đủ giá trị đã nạp"

    ind = db.query(Indicator).filter_by(template_id=tpl.id, code="B-1.1").one()
    v = db.query(ReportValue).filter_by(report_id=bc.id, indicator_id=ind.id).one()
    assert (v.this_period, v.acc_prev_entered, v.acc_total_entered) == \
        (Decimal("1.00"), Decimal("9.00"), Decimal("10.00"))


def test_seed_all_goi_lai_khong_ghi_de_don_vi_22_da_nhap_song(db):
    """Nếu người demo đã nộp (submitted) báo cáo nháp của đơn vị 22, seed_all
    gọi lại KHÔNG được kéo nó về draft — source đã là "live" thì bỏ qua."""
    from app.models import (
        OrgUnit, Report, ReportingPeriod, ReportTemplate, WorkflowState,
    )
    seed_all(db)
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    don_vi_22 = (
        db.query(OrgUnit).filter_by(is_reporting=True).order_by(OrgUnit.id).all()
    )[21]
    ky08 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-08").one()
    bc = db.query(Report).filter_by(template_id=tpl.id, org_unit_id=don_vi_22.id, period_id=ky08.id).one()

    submitted = db.query(WorkflowState).filter_by(template_id=tpl.id, code="submitted").one()
    bc.state_id = submitted.id
    db.flush()

    seed_all(db)
    db.refresh(bc)
    assert bc.state_id == submitted.id, "seed_all lần 2 đã ghi đè tiến độ demo thật"
    assert bc.source == "live"


def test_seed_all_hai_lan_khong_tao_them_bao_cao(db):
    from app.models import Report, ReportTemplate
    seed_all(db)
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    truoc = db.query(Report).filter_by(template_id=tpl.id).count()
    seed_all(db)
    assert db.query(Report).filter_by(template_id=tpl.id).count() == truoc == 66


def test_seed_all_ghi_dung_mot_dong_audit_sha(db):
    import hashlib
    import os

    from app.models import AuditLog, ReportTemplate
    seed_all(db)
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    dong = db.query(AuditLog).filter_by(
        entity="report_template", entity_id=tpl.id, action="fixture_sha"
    ).all()
    assert len(dong) == 1
    sha_that = hashlib.sha256(open(os.environ["FIXTURE_CSV"], "rb").read()).hexdigest()
    assert dong[0].after_json["sha256"] == sha_that


# ---------------------------------------------------------------------------
# gen_fixture.py: tất định
# ---------------------------------------------------------------------------

def test_gen_fixture_tat_dinh_va_du_kich_thuoc():
    import sys
    from pathlib import Path
    duong_dan = str(Path(__file__).resolve().parents[1] / "fixtures")
    if duong_dan not in sys.path:
        sys.path.insert(0, duong_dan)
    import gen_fixture

    lan1 = gen_fixture.generate_rows()
    lan2 = gen_fixture.generate_rows()
    assert lan1 == lan2, "gen_fixture phải tất định — chạy hai lần phải ra y hệt"
    assert len(lan1) - 1 == 22 * 52 * 3  # trừ 1 dòng header
