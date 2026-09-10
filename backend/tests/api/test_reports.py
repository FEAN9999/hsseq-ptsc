# backend/tests/api/test_reports.py
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap
from tests.conftest_query import dem_query


def test_reporter_chi_thay_don_vi_cua_minh(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01", headers=h).json()
    assert ds and {r["org_unit"]["code"] for r in ds} == {"U01"}


def test_post_reports_trung_tra_409_kem_existing_id(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    a = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert a.status_code == 201
    b = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert b.status_code == 409
    assert b.json()["existing_id"] == a.json()["id"]


def test_post_reports_ky_dong_tra_409(client, db):
    seed_all(db)
    from app.models import ReportingPeriod
    db.query(ReportingPeriod).filter_by(period_key="2026-09").update({"is_open": False})
    db.flush()
    h = dang_nhap(client, "u01@ptsc.local")
    r = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert r.status_code == 409


def test_get_report_tra_version_va_luy_ke_tinh(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    bc = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()[0]
    r = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    assert r["version"] >= 1
    o = next(v for v in r["values"] if v["indicator_code"] == "B-1.1")
    assert isinstance(o["acc_total_computed"], float)
    assert "missing_periods" in r


def test_get_report_toi_da_2_query(client, db):
    from app.core.db import engine
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    bc = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()[0]
    with dem_query(engine) as d:
        client.get(f"/api/v1/reports/{bc['id']}", headers=h)
    assert d["n"] <= 2, f"form dùng {d['n']} query, ngân sách là 2"


def test_get_report_khong_ton_tai_tra_404(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    assert client.get("/api/v1/reports/999999", headers=h).status_code == 404


# --- Bổ sung ngoài brief: khẳng định GIÁ TRỊ thật (nguyên tắc 1 CONTEXT.md),
# nhắm vào các nhánh brief không có test literal sẵn (sum+diff, counter_check,
# computed, admin xem toàn đơn vị, và hai bẫy phạm vi/is_reporting của
# POST /reports). Số liệu đối chiếu trực tiếp
# tests/fixtures/full_synthetic.csv (U01, kỳ 2026-08): B-1.1=5.00/7.00/12.00,
# B-1.2=1.00/9.00/10.00, B-1.3=2.00/6.00/8.00, B-1.5=3.00/-/6.00 (kỳ 07 total
# 3.00), B-1.7=5.00/-/12.00 (kỳ 07 total 7.00).

def test_get_report_sum_va_diff_dung_so_fixture(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    bc = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()[0]
    r = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    o = next(v for v in r["values"] if v["indicator_code"] == "B-1.1")
    assert o["this_period"] == 5.0
    assert o["acc_prev_computed"] == 7.0
    assert o["acc_total_computed"] == 12.0
    # fixture ghi acc_total_entered = acc_total_computed nên diff = 0
    assert o["diff"] == 0.0
    assert o["counter_check"] is None
    assert r["missing_periods"] == []


def test_get_report_counter_check_ok_va_computed_cong_dung_cong_thuc(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    bc = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()[0]
    r = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    theo_ma = {v["indicator_code"]: v for v in r["values"]}

    b15 = theo_ma["B-1.5"]  # counter, kỳ trước (07) acc_total_entered = 3.00
    assert b15["this_period"] == 3.0
    assert b15["acc_prev_entered"] == 3.0
    assert b15["acc_total_entered"] == 6.0
    assert b15["counter_check"] == {"status": "ok", "expected": 6.0, "message": ""}

    b14 = theo_ma["B-1.4"]  # computed = B-1.1 + B-1.2 + B-1.3
    assert b14["this_period"] == 8.0
    assert b14["acc_prev_computed"] == 22.0
    assert b14["acc_total_computed"] == 30.0
    assert b14["counter_check"] is None


def test_admin_xem_bao_cao_toan_bo_don_vi(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()
    assert len(ds) == 22
    trang_thai = {r["org_unit"]["code"]: r["state"] for r in ds}
    # P05 là đơn vị thứ 22 (is_reporting) — seed lật báo cáo kỳ 08 của riêng
    # nó về draft/live để làm đường demo phân đoạn 2 (app/seed/__init__.py::_nhap_don_vi_22).
    assert trang_thai["P05"] == "draft"
    assert trang_thai["U01"] == "approved"
    assert trang_thai["U02"] == "approved"


def test_post_reports_dung_pham_vi_tu_vai_khong_dung_org_unit_id_tai_khoan(client, db):
    """Bẫy 1 CONTEXT.md: 'đơn vị của mình' ở POST /reports phải là phạm vi từ
    vai (UserRole.scope_org_unit_id), không phải app_user.org_unit_id — cố
    tình cho hai cột LỆCH NHAU để phân biệt được nếu code đọc nhầm cột."""
    seed_all(db)
    from app.models import AppUser, OrgUnit, Report, Role, UserRole
    u01 = db.query(AppUser).filter_by(email="u01@ptsc.local").one()
    u02_org = db.query(OrgUnit).filter_by(code="U02").one()
    assert u01.org_unit_id != u02_org.id
    reporter = db.query(Role).filter_by(code="reporter").one()
    db.query(UserRole).filter_by(user_id=u01.id, role_id=reporter.id).update(
        {"scope_org_unit_id": u02_org.id})
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    r = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert r.status_code == 201, r.text
    bc = db.query(Report).filter_by(id=r.json()["id"]).one()
    assert bc.org_unit_id == u02_org.id


def test_post_reports_don_vi_khong_is_reporting_tra_400(client, db):
    seed_all(db)
    from app.models import AppUser, OrgUnit, Role, UserRole
    u01 = db.query(AppUser).filter_by(email="u01@ptsc.local").one()
    ban01 = db.query(OrgUnit).filter_by(code="BAN01").one()
    assert not ban01.is_reporting
    reporter = db.query(Role).filter_by(code="reporter").one()
    db.query(UserRole).filter_by(user_id=u01.id, role_id=reporter.id).update(
        {"scope_org_unit_id": ban01.id})
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    r = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert r.status_code == 400
