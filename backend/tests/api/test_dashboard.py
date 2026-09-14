# backend/tests/api/test_dashboard.py
from decimal import Decimal

from app.core.db import engine
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap
from tests.conftest_query import dem_query


def _cap_them_quyen(db, role_code: str, permission_code: str) -> None:
    """Gán tạm thêm MỘT quyền cho một vai trò SẴN CÓ, chỉ trong transaction của
    test hiện tại (rollback cuối test — xem tests/conftest.py `db`). Dùng để
    dựng ca "có status.view/dashboard.view NHƯNG phạm vi hẹp
    (report.view_own_unit)" — tổ hợp không có sẵn trong seed (admin_atcl có cả
    report.view_all lấn át, viewer không có report.view_own_unit) nên phải
    dựng thủ công mới lộ được nhánh `pham_vi` là tập cụ thể của Task 13."""
    from app.models import Permission, Role, RolePermission
    role = db.query(Role).filter_by(code=role_code).one()
    quyen = db.query(Permission).filter_by(code=permission_code).one()
    db.add(RolePermission(role_id=role.id, permission_id=quyen.id))
    db.flush()


# ---------------------------------------------------------------------------
# Step 1 của task-13-brief.md — gõ đúng như brief, với MỘT sửa bắt buộc:
# "U22" -> "P05". Seed không có mã đơn vị "U22" (22 đầu mối là U01..U17 rồi
# P01..P05 — xem app/seed/__init__.py ORG_UNITS và CONTEXT.md dòng 60);
# "đơn vị 22" trong bình luận của brief là ĐẾM THỨ TỰ (đơn vị is_reporting thứ
# 22, tài khoản u22@ptsc.local), không phải mã thật. Xác minh bằng script độc
# lập (dán nguyên văn output trong task-13-report.md): đơn vị 22 = "P05", và
# đó chính là đơn vị bị _nhap_don_vi_22 chuyển sang draft ở kỳ 2026-08.
# ---------------------------------------------------------------------------


def test_summary_chi_cong_trang_thai_vao_tong(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).json()
    assert s["reporting_units"] == 22
    assert s["approved_count"] == 21          # 21 duyệt + 1 nháp (đơn vị 22 = P05)
    assert [u["code"] for u in s["missing_units"]] == ["P05"]


def test_summary_ky_trong_tra_0_khong_phai_NaN(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-09", headers=h).json()
    assert s["approved_count"] == 0
    assert all(k["value"] == 0 for k in s["kpis"]), "API luôn trả 0; FE mới hiện '—'"


def test_summary_toi_da_2_query(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    with dem_query(engine) as d:
        client.get("/api/v1/dashboard/summary?period=2026-08", headers=h)
    assert d["n"] <= 2, f"dashboard dùng {d['n']} query, ngân sách là 2"


def test_units_sap_xep_LTI_giam_dan(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    assert len(ds) == 22
    lti = [u["lti"] for u in ds if u["state"] is not None]
    assert lti == sorted(lti, reverse=True)


def test_status_phan_biet_seed_va_live(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    st = client.get("/api/v1/status?template=FM01&from=2026-06&to=2026-09",
                    headers=h).json()
    assert st["periods"] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    o = [c for u in st["units"] for c in u["cells"] if c["state"] == "approved"]
    assert all(c["source"] in ("seed", "live") for c in o)


def test_reporter_khong_xem_duoc_status(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    assert client.get("/api/v1/status?template=FM01", headers=h).status_code == 403


# ---------------------------------------------------------------------------
# Bổ sung ngoài Step 1 — khẳng định GIÁ TRỊ cụ thể cho từng KPI/ô/cột (nguyên
# tắc bắt buộc #1 của CONTEXT.md), test riêng nhánh phạm vi hẹp (rủi ro #1 của
# controller — Task 10 từng lọt vì chỉ một nhánh được test), và các mục tiêu
# mutation controller nêu tên: từng KPI, counts_in_totals, source, ô trống kỳ
# chưa có báo cáo, ngân sách query.
# ---------------------------------------------------------------------------


def test_summary_6_kpi_gia_tri_dung(client, db):
    """Số THẬT tính từ tests/fixtures/full_synthetic.csv cho 21 đơn vị approved
    kỳ 2026-08 (loại P05 đang draft) — xác minh độc lập bằng truy vấn ORM
    riêng ngoài API, dán nguyên văn trong task-13-report.md. Đổi MỘT con số ở
    bất kỳ ô nào trong 6 ô phải làm đúng một assert dưới đây đỏ."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).json()
    kpi = {k["code"]: k for k in s["kpis"]}
    assert kpi["B-2.2"] == {"code": "B-2.2", "label": "LTI trong kỳ",
                             "value": 63.0, "unit": "Số vụ"}
    assert kpi["B-2.1"] == {"code": "B-2.1", "label": "FAT trong kỳ",
                             "value": 62.0, "unit": "Số vụ"}
    assert kpi["B-2.10"] == {"code": "B-2.10", "label": "Near miss",
                              "value": 61.0, "unit": "Số vụ"}
    assert kpi["B-2.11"] == {"code": "B-2.11", "label": "HAZOB card",
                              "value": 62.0, "unit": "Cái"}
    assert kpi["B-1.4"] == {"code": "B-1.4", "label": "Tổng giờ công",
                             "value": 188.0, "unit": "Giờ"}
    assert kpi["DON_VI_CO_LTI"] == {"code": "DON_VI_CO_LTI", "label": "Đơn vị có LTI",
                                     "value": 21.0, "unit": "Đơn vị"}
    assert len(s["kpis"]) == 6
    # JsonNumber thật: httpx/TestClient chỉ ra `float` nếu JSON là number,
    # ra `str` nếu Decimal lọt trần thành chuỗi ("63.00") — bắt đúng rủi ro
    # controller nêu tên ("Dashboard toàn số nên đây là chỗ dễ lọt nhất").
    assert all(isinstance(k["value"], float) for k in s["kpis"])


def test_summary_khong_missing_khi_tron_ven(client, db):
    """Kỳ 2026-06: cả 22 đơn vị đều approved (khác 2026-08 có 1 đơn vị nháp) —
    missing_units phải RỖNG, không phải thiếu-kiểm-tra."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-06", headers=h).json()
    # K6 — `period_key` trong thân trả về phải là CHÍNH kỳ được hỏi (thanh
    # coverage của FE ghi "Kỳ …" từ đây); kỳ 2026-06 khác kỳ mặc định của mọi
    # test còn lại nên một hằng số lọt vào chỗ đó sẽ lộ ngay.
    assert s["period_key"] == "2026-06"
    assert s["reporting_units"] == 22
    assert s["approved_count"] == 22
    assert s["missing_units"] == []
    kpi = {k["code"]: k["value"] for k in s["kpis"]}
    assert kpi["B-2.2"] == 63.0 and kpi["DON_VI_CO_LTI"] == 22.0


def test_summary_submitted_count_dem_dung_va_khong_con_thieu(client, db):
    """P05 (đơn vị 22, nháp kỳ 2026-08) tự nộp báo cáo của mình — chuyển từ
    "chưa nộp" sang "chờ duyệt": submitted_count phải tăng đúng bằng số báo
    cáo vừa nộp, approved_count KHÔNG đổi, và đơn vị đó KHÔNG còn nằm trong
    missing_units (task-13-carry.md E4 áp dụng chung cho cả 3 nhóm, không chỉ
    approved_count)."""
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")   # u22 -> P05
    ha = dang_nhap(client, "admin@ptsc.local")

    truoc = client.get("/api/v1/dashboard/summary?period=2026-08", headers=ha).json()
    assert truoc["submitted_count"] == 0
    assert truoc["missing_units"] == [{"code": "P05", "name": "Ban dự án 05 (tên tạm)"}]

    ds = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=hu).json()
    bc = next(r for r in ds if r["state"] == "draft")
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    r = client.post(f"/api/v1/reports/{bc['id']}/transition",
                    json={"action": "submit", "expected_state": "draft", "version": v},
                    headers=hu)
    assert r.status_code == 200 and r.json()["state"] == "submitted"

    sau = client.get("/api/v1/dashboard/summary?period=2026-08", headers=ha).json()
    assert sau["approved_count"] == 21
    assert sau["submitted_count"] == 1
    assert sau["missing_units"] == []


def test_summary_don_vi_co_lti_loai_dung_gia_tri_0(client, db):
    """"Đơn vị có LTI" đếm > 0, không phải "có dòng report_value" — dữ liệu
    sinh tất định (gen_fixture.py) không bao giờ ra đúng 0 (delta luôn 1..5)
    nên riêng test_summary_6_kpi_gia_tri_dung không bắt được nếu ai đó đổi
    `> 0` thành `>= 0`/bỏ điều kiện: ép LTI của U01 về đúng 0 để lộ ranh giới
    đó, đồng thời xác nhận tổng LTI (SUM) vẫn cộng đúng số 0 đó vào (không
    lẫn với "không có báo cáo")."""
    seed_all(db)
    from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportValue
    lti_id = db.query(Indicator).filter_by(code="B-2.2").one().id
    u01_id = db.query(OrgUnit).filter_by(code="U01").one().id
    ky = db.query(ReportingPeriod).filter_by(period_key="2026-08").one()
    r01 = db.query(Report).filter_by(org_unit_id=u01_id, period_id=ky.id).one()
    db.query(ReportValue).filter_by(report_id=r01.id, indicator_id=lti_id) \
        .update({"this_period": Decimal("0.00")})
    db.flush()

    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).json()
    kpi = {k["code"]: k["value"] for k in s["kpis"]}
    assert kpi["DON_VI_CO_LTI"] == 20.0     # 21 - U01 (LTI vừa về 0)
    assert kpi["B-2.2"] == 60.0             # 63 - 3 (LTI cũ của U01)


def test_summary_missing_units_day_du_khi_chua_co_bao_cao_nao(client, db):
    """Nhánh "chưa nộp" phải bắt CẢ HAI trường hợp: có báo cáo nhưng đang
    is_editable (đã kiểm ở test_summary_chi_cong_trang_thai_vao_tong với P05,
    kỳ 2026-08) VÀ hoàn toàn chưa có báo cáo nào (report_id NULL — kỳ
    2026-09). Bỏ vế "chưa có báo cáo" mà chỉ giữ vế is_editable sẽ lọt qua ca
    2026-08 (P05 vẫn is_editable=True) nhưng lộ ngay ở đây."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-09", headers=h).json()
    assert s["reporting_units"] == 22
    assert len(s["missing_units"]) == 22
    assert {u["code"] for u in s["missing_units"]} == {
        f"U{i:02d}" for i in range(1, 18)
    } | {f"P{i:02d}" for i in range(1, 6)}


def test_summary_loc_theo_pham_vi_hep(client, db):
    """Nhánh `pham_vi` là tập cụ thể (report.view_own_unit) cho /dashboard/summary
    — không có sẵn trong seed (viewer/admin_atcl đều report.view_all, scope
    None) nên dựng thủ công (_cap_them_quyen). Không test riêng ca này thì một
    lỗ bỏ lọc phạm vi ở nhánh hẹp có thể lọt y hệt Task 10 (review Task 10)."""
    seed_all(db)
    _cap_them_quyen(db, "reporter", "dashboard.view")
    h = dang_nhap(client, "u01@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).json()
    assert s["reporting_units"] == 1
    assert s["approved_count"] == 1
    assert s["missing_units"] == []
    kpi = {k["code"]: k["value"] for k in s["kpis"]}
    # Đúng số RIÊNG của U01 kỳ 2026-08 (không phải tổng 21 đơn vị).
    assert kpi["B-2.2"] == 3.0 and kpi["B-2.1"] == 2.0 and kpi["DON_VI_CO_LTI"] == 1.0


def test_units_loc_theo_pham_vi_hep(client, db):
    seed_all(db)
    _cap_them_quyen(db, "reporter", "dashboard.view")
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    assert [u["org_unit"]["code"] for u in ds] == ["U01"]


def test_reporter_khong_xem_duoc_dashboard(client, db):
    """Đối xứng với test_reporter_khong_xem_duoc_status: reporter không có
    `dashboard.view` (ROLE_PERMS["reporter"], app/seed/__init__.py) phải bị
    chặn ở CẢ HAI route /dashboard/*, không chỉ /status."""
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    assert client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).status_code == 403
    assert client.get("/api/v1/dashboard/units?period=2026-08", headers=h).status_code == 403


def test_units_gia_tri_dung_cho_don_vi_duyet_va_don_vi_nhap(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    theo_ma = {u["org_unit"]["code"]: u for u in ds}

    u01 = theo_ma["U01"]
    # gio_an_toan_tu_lti_cuoi = 6.0 chứ KHÔNG phải 3.0: B-1.5 là chỉ tiêu
    # `counter`, con số của nó nằm ở cột "Cộng dồn" (acc_total_entered = 6.00
    # cho U01 kỳ 2026-08), còn this_period = 3.00 chỉ là phần tăng thêm trong
    # tháng. Kỳ vọng 3.0 cũ khoá đúng con số mà dashboard hiện khác hẳn form
    # báo cáo của chính đơn vị đó.
    assert (u01["state"], u01["lti"], u01["fat"], u01["near_miss"], u01["hazob"],
            u01["gio_cong"], u01["gio_an_toan_tu_lti_cuoi"]) == \
           ("approved", 3.0, 2.0, 1.0, 2.0, 8.0, 6.0)

    # P05 đang draft nhưng report_value vẫn còn nguyên số fixture gốc
    # (_nhap_don_vi_22 không xoá report_value) — /dashboard/units hiển thị số
    # THẬT bất kể trạng thái (khác /dashboard/summary, chỉ cộng báo cáo đã
    # duyệt — counts_in_totals).
    p05 = theo_ma["P05"]
    assert (p05["state"], p05["lti"], p05["gio_cong"]) == ("draft", 4.0, 6.0)


def test_units_ky_trong_moi_don_vi_deu_o_trong(client, db):
    """Kỳ 2026-09: đang mở nhưng chưa có báo cáo nào — mọi trong 22 dòng phải
    None hết (state lẫn mọi cột số), không phải 0 giả."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-09", headers=h).json()
    assert len(ds) == 22
    assert all(u["state"] is None for u in ds)
    assert all(
        u["lti"] is None and u["fat"] is None and u["near_miss"] is None
        and u["hazob"] is None and u["gio_cong"] is None
        and u["gio_an_toan_tu_lti_cuoi"] is None
        for u in ds
    )


def test_units_hoa_LTI_thi_uu_tien_FAT_cao_hon(client, db):
    """U01 và U06 hoà sẵn (lti=3, fat=2, gio_cong=8 — cùng nhóm org_idx mod 5
    của bộ sinh tất định, xem tests/fixtures/gen_fixture.py) ở kỳ 2026-08.
    Nâng FAT của U06 để tách bạch: nếu bộ sắp xếp bỏ khoá phụ FAT (chỉ sắp
    theo LTI) thì thứ tự U01/U06 không xác định — test này khoá đúng ưu tiên
    FAT khi LTI hoà."""
    seed_all(db)
    from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportValue
    fat_id = db.query(Indicator).filter_by(code="B-2.1").one().id
    u06_id = db.query(OrgUnit).filter_by(code="U06").one().id
    ky = db.query(ReportingPeriod).filter_by(period_key="2026-08").one()
    r06 = db.query(Report).filter_by(org_unit_id=u06_id, period_id=ky.id).one()
    db.query(ReportValue).filter_by(report_id=r06.id, indicator_id=fat_id) \
        .update({"this_period": Decimal("99.00")})
    db.flush()

    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    thu_tu = [u["org_unit"]["code"] for u in ds]
    u01 = next(u for u in ds if u["org_unit"]["code"] == "U01")
    u06 = next(u for u in ds if u["org_unit"]["code"] == "U06")
    assert u01["lti"] == u06["lti"] == 3.0
    assert u06["fat"] == 99.0
    assert thu_tu.index("U06") < thu_tu.index("U01")


def test_units_hoa_LTI_va_FAT_thi_uu_tien_gio_cong_cao_hon(client, db):
    """U01 và U11 hoà sẵn (lti=3, fat=2, gio_cong=8 — cùng nhóm mod 5). Nâng
    RIÊNG giờ công của U11 (B-1.1, không đụng B-2.1/B-2.2) để tách bạch khoá
    phụ thứ hai: LTI và FAT vẫn hoà, chỉ gio_cong khác."""
    seed_all(db)
    from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportValue
    gc1_id = db.query(Indicator).filter_by(code="B-1.1").one().id
    u11_id = db.query(OrgUnit).filter_by(code="U11").one().id
    ky = db.query(ReportingPeriod).filter_by(period_key="2026-08").one()
    r11 = db.query(Report).filter_by(org_unit_id=u11_id, period_id=ky.id).one()
    db.query(ReportValue).filter_by(report_id=r11.id, indicator_id=gc1_id) \
        .update({"this_period": Decimal("500.00")})
    db.flush()

    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    thu_tu = [u["org_unit"]["code"] for u in ds]
    u01 = next(u for u in ds if u["org_unit"]["code"] == "U01")
    u11 = next(u for u in ds if u["org_unit"]["code"] == "U11")
    assert u01["lti"] == u11["lti"] == 3.0
    assert u01["fat"] == u11["fat"] == 2.0
    assert u11["gio_cong"] > u01["gio_cong"] == 8.0
    assert thu_tu.index("U11") < thu_tu.index("U01")


def test_status_o_trong_khi_chua_co_bao_cao(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    st = client.get("/api/v1/status?template=FM01&from=2026-09&to=2026-09", headers=h).json()
    assert st["periods"] == ["2026-09"]
    assert len(st["units"]) == 22
    o = {u["code"]: u["cells"][0] for u in st["units"]}
    # report_id (task-26-carry.md C8, cùng lý do Task 25 carry C1/Ruling 304):
    # chưa có báo cáo thì report_id cũng phải None, không riêng state.
    assert o["U01"] == {
        "period_key": "2026-09", "state": None, "source": None, "is_late": None,
        "report_id": None}


def test_status_source_seed_cho_fixture_live_cho_bao_cao_moi(client, db):
    """counts_in_totals/E4 nói về TỔNG, nhưng "source" cũng là mục tiêu mutation
    controller nêu tên riêng: seed (fixture nạp sẵn) phải phân biệt được với
    live (ghi qua API), từng Ô một, không chỉ "nằm trong tập {seed, live}"
    (test gốc Step 1 chỉ kiểm lỏng như vậy)."""
    seed_all(db)
    hu = dang_nhap(client, "u01@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")

    r = client.post("/api/v1/reports", json={"template": "FM01", "period_key": "2026-09"},
                    headers=hu)
    assert r.status_code == 201    # report.source = "live" ngay lúc tạo (D21)
    rid = r.json()["id"]

    st = client.get("/api/v1/status?template=FM01&from=2026-08&to=2026-09",
                    headers=ha).json()
    theo_ky = {u["code"]: {c["period_key"]: c for c in u["cells"]} for u in st["units"]}

    # report_id (carry C8, Ruling 304): khẳng định CẢ HAI chiều bằng ID THẬT
    # (không chỉ "khác None") — seed tra lại DB, live dùng id vừa POST trả về.
    from app.models import OrgUnit, Report, ReportingPeriod
    u01_id = db.query(OrgUnit).filter_by(code="U01").one().id
    ky08 = db.query(ReportingPeriod).filter_by(period_key="2026-08").one()
    r08 = db.query(Report).filter_by(org_unit_id=u01_id, period_id=ky08.id).one()

    assert theo_ky["U01"]["2026-08"] == {
        "period_key": "2026-08", "state": "approved", "source": "seed", "is_late": False,
        "report_id": r08.id}
    assert theo_ky["U01"]["2026-09"] == {
        "period_key": "2026-09", "state": "draft", "source": "live", "is_late": False,
        "report_id": rid}


def test_status_loc_theo_pham_vi_hep(client, db):
    """Nhánh `pham_vi` là tập cụ thể cho /status — cùng lý do với
    test_summary_loc_theo_pham_vi_hep ở trên, áp dụng cho route còn lại."""
    seed_all(db)
    _cap_them_quyen(db, "reporter", "status.view")
    h = dang_nhap(client, "u01@ptsc.local")
    st = client.get("/api/v1/status?template=FM01&from=2026-06&to=2026-09", headers=h).json()
    assert [u["code"] for u in st["units"]] == ["U01"]
    assert st["periods"] == ["2026-06", "2026-07", "2026-08", "2026-09"]


def test_units_khong_N_cong_1(client, db):
    """Không có số ngân sách cứng cho /dashboard/units trong brief (chỉ
    /dashboard/summary có), nhưng CONTEXT.md cấm N+1 toàn dự án — cận trên 2
    (1 xác thực + 1 dữ liệu, đo thật ở task-13-report.md) đủ chặt để bắt một
    N+1 thật (sẽ tỉ lệ với 22 đơn vị, vượt xa cận này ngay)."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    with dem_query(engine) as d:
        client.get("/api/v1/dashboard/units?period=2026-08", headers=h)
    assert d["n"] <= 2, f"units dùng {d['n']} query — nghi N+1"


def test_status_khong_N_cong_1(client, db):
    """/status không có số ngân sách cứng trong brief — cận trên đo thật là 4
    (1 xác thực + 1 tra mẫu + 1 danh sách kỳ + 1 ma trận đơn vị×kỳ), không phụ
    thuộc số đơn vị/kỳ nên KHÔNG tăng nếu seed có thêm đơn vị — cận 6 đủ chặt
    để bắt N+1 thật (sẽ tỉ lệ với 22 đơn vị × 4 kỳ)."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    with dem_query(engine) as d:
        client.get("/api/v1/status?template=FM01&from=2026-06&to=2026-09", headers=h)
    assert d["n"] <= 6, f"status dùng {d['n']} query — nghi N+1"


def test_status_from_to_sai_dinh_dang_tra_422(client, db):
    """task-26-fix-6.md W1b. `from`/`to` được so sánh bằng CHUỖI, nên trước vòng
    này một chuỗi rác không bị từ chối mà lọt vào phép so và THÀNH CÔNG ÂM THẦM:
    `'2026-09' >= 'undefined'` là FALSE ⇒ `from=undefined` trả **200 với thân
    rỗng**, tức máy chủ trả lời "không có gì" bằng một mã thành công. Phía gọi
    không có cách nào phân biệt nó với một câu trả lời thật — đó là cái biến một
    request rác thành mất dữ liệu trên màn hình (xem W1). Hợp đồng: sai định
    dạng kỳ ⇒ 422, không phải 200 rỗng."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    assert client.get("/api/v1/status?template=FM01&from=undefined&to=undefined",
                      headers=h).status_code == 422
    assert client.get("/api/v1/status?template=FM01&from=2026-06&to=undefined",
                      headers=h).status_code == 422
    assert client.get("/api/v1/status?template=FM01&from=2026-13&to=2026-06",
                      headers=h).status_code == 422
    # Đối chứng: định dạng ĐÚNG vẫn đi qua bình thường (không siết quá tay).
    assert client.get("/api/v1/status?template=FM01&from=2026-06&to=2026-09",
                      headers=h).status_code == 200


def test_status_template_khong_ton_tai_tra_404(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    r = client.get("/api/v1/status?template=KHONG-TON-TAI&from=2026-06&to=2026-09", headers=h)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Vòng sửa 1 (task-13-fix-brief.md K1-K6).
# ---------------------------------------------------------------------------


def _mau_phu(db, code: str, period_key: str, active: bool):
    """Dựng thêm MỘT mẫu báo cáo nữa (không phải FM01) cùng một kỳ khoá
    `period_key` — đúng đường đi giai đoạn 2 mà repo đã có test
    (test_mau_gia_FM99_tao_duoc_khong_can_migration): mẫu mới chỉ là dòng dữ
    liệu, không migration. Mọi mẫu tháng đều sinh khoá kỳ dạng "YYYY-MM" nên
    kỳ của hai mẫu TRÙNG khoá là chắc chắn, không phải giả định."""
    from datetime import date, datetime
    from zoneinfo import ZoneInfo
    from app.models import ReportingPeriod, ReportTemplate
    tpl = ReportTemplate(code=code, name_vi=f"Mẫu {code}", period_type="month",
                         version=1, active=active)
    db.add(tpl)
    db.flush()
    db.add(ReportingPeriod(
        template_id=tpl.id, period_key=period_key,
        start_date=date(2026, 8, 1), end_date=date(2026, 8, 31),
        due_at=datetime(2026, 10, 5, 23, 59, 59, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")),
        is_open=True))
    db.flush()
    return tpl


def test_units_counter_lay_cot_cong_don_dung_bang_so_tren_form(client, db):
    """K1 — B-1.5 là chỉ tiêu `counter`: cột bắt buộc của nó là "Cộng dồn"
    (acc_total_entered), "Tháng này" chỉ là phần tăng thêm (ma trận
    app/domain/report_rules.py). Đơn vị nhập ĐÚNG cột bắt buộc rồi bỏ trống
    "Tháng này" là hợp lệ — và là ca thường gặp với số thật. Dashboard phải
    hiện đúng con số form báo cáo đang hiện, không phải "—".

    Cùng lượt ghi có một chỉ tiêu `sum` (B-2.2, cột bắt buộc là "Tháng này",
    hai cột acc bị ghi NULL — xem test_dong_sum_ghi_NULL_vao_hai_cot_acc) để
    khoá luôn chiều ngược lại: đọc "Cộng dồn" cho MỌI chỉ tiêu cũng sai."""
    seed_all(db)
    hu = dang_nhap(client, "u01@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")

    rid = client.post("/api/v1/reports", json={"template": "FM01", "period_key": "2026-09"},
                      headers=hu).json()["id"]
    v0 = client.get(f"/api/v1/reports/{rid}", headers=hu).json()["version"]
    r = client.put(f"/api/v1/reports/{rid}/values", headers=hu,
                   json={"version": v0, "values": [
                       {"indicator_code": "B-1.5", "acc_total_entered": 1200},
                       {"indicator_code": "B-2.2", "this_period": 7}]})
    assert r.status_code == 200

    o = {v["indicator_code"]: v for v in
         client.get(f"/api/v1/reports/{rid}", headers=hu).json()["values"]}
    assert o["B-1.5"]["acc_total_entered"] == 1200.0
    assert o["B-1.5"]["this_period"] is None

    ds = client.get("/api/v1/dashboard/units?period=2026-09", headers=ha).json()
    u01 = next(u for u in ds if u["org_unit"]["code"] == "U01")
    # Cùng một ô, hai màn hình, MỘT con số.
    assert u01["gio_an_toan_tu_lti_cuoi"] == o["B-1.5"]["acc_total_entered"] == 1200.0
    assert u01["lti"] == o["B-2.2"]["this_period"] == 7.0
    assert o["B-2.2"]["acc_total_entered"] is None


def test_summary_khong_500_khi_co_mau_active_thu_hai_trung_khoa_ky(client, db):
    """K2 — không ràng buộc DB nào cấm hai mẫu cùng `active` (alembic 0001
    không có unique lẫn index bán phần trên report_template.active). Hai mẫu
    active có kỳ trùng khoá làm scalar subquery giải kỳ trả 2 dòng →
    CardinalityViolation → 500 tiếng Anh ngay màn hình mở đầu buổi demo.

    Khẳng định cả HAI vế: không 500, VÀ số liệu vẫn là số của mẫu đang dùng
    (kỳ dựng trước thắng, `order_by(ReportingPeriod.id).limit(1)`) chứ không
    rơi về mẫu rỗng vừa thêm."""
    seed_all(db)
    _mau_phu(db, "FM99", "2026-08", active=True)
    h = dang_nhap(client, "admin@ptsc.local")

    r = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h)
    assert r.status_code == 200
    s = r.json()
    assert s["reporting_units"] == 22
    assert s["approved_count"] == 21
    assert [u["code"] for u in s["missing_units"]] == ["P05"]
    assert {k["code"]: k["value"] for k in s["kpis"]}["B-2.2"] == 63.0

    ru = client.get("/api/v1/dashboard/units?period=2026-08", headers=h)
    assert ru.status_code == 200
    assert next(u for u in ru.json() if u["org_unit"]["code"] == "U01")["lti"] == 3.0


def test_summary_bo_qua_mau_da_ngung_dung_du_ky_cua_no_dung_truoc(client, db):
    """K2 — vế còn lại của cùng một câu truy vấn: lọc `active` phải THẬT SỰ
    lọc. Mẫu FM98 dựng TRƯỚC seed_all nên kỳ "2026-08" của nó có id NHỎ HƠN kỳ
    của FM01 — bỏ điều kiện `active` là dashboard rơi ngay về mẫu đã ngừng
    dùng (rỗng, không báo cáo nào) và toàn bộ số về 0."""
    _mau_phu(db, "FM98", "2026-08", active=False)
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")

    s = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).json()
    assert s["approved_count"] == 21
    assert [u["code"] for u in s["missing_units"]] == ["P05"]
    assert {k["code"]: k["value"] for k in s["kpis"]}["B-2.2"] == 63.0


def test_summary_missing_units_ghep_dung_ten_voi_ma(client, db):
    """K3 — `missing_units` phải ghép TÊN với ĐÚNG MÃ của nó, theo đúng thứ tự
    mã. Kỳ 2026-09 chưa có báo cáo nào nên cả 22 đầu mối đều chưa nộp: đủ dài
    để một hoán vị (hai phép gom song song lệch thứ tự) lộ ra — khác
    test_summary_submitted_count_dem_dung_va_khong_con_thieu, ở đó danh sách
    chỉ có một phần tử nên mọi hoán vị đều là chính nó.

    So với TÊN THẬT trong DB chứ không gõ lại chuỗi: tên 17 đơn vị + 5 ban dự
    án hiện là tên tạm, Chồng yêu sẽ thay trước demo (CONTEXT.md)."""
    seed_all(db)
    from app.models import OrgUnit
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-09", headers=h).json()

    ky_vong = [{"code": o.code, "name": o.name} for o in
               db.query(OrgUnit).filter_by(is_reporting=True).order_by(OrgUnit.code).all()]
    assert len(ky_vong) == 22
    assert s["missing_units"] == ky_vong


def test_units_gia_tri_0_that_hien_0_va_khong_lan_voi_o_chua_nhap(client, db):
    """K4 — bẫy `Decimal("0")` falsy. Dữ liệu PTSC thật hầu hết có LTI = 0, mà
    bộ sinh fixture không bao giờ ra 0 (delta luôn 1..5) nên cả suite chưa
    từng đi qua ca này.

    U05 nhập số 0 THẬT cho LTI/FAT/giờ công; U02 chưa nhập ô nào (không có
    dòng report_value → NULL). Hai điều phải đúng: (1) U05 hiện 0 chứ không
    phải null/"—"; (2) U05 xếp TRÊN U02 — dùng `or` thay cho `_hoac` trong
    khoá sắp xếp biến số 0 thật thành mặc định -1, U05 tụt xuống hoà với đơn
    vị chưa nhập và rơi về thứ tự mã (U02 trước U05)."""
    seed_all(db)
    from app.models import Indicator, OrgUnit, Report, ReportingPeriod, ReportValue
    ky = db.query(ReportingPeriod).filter_by(period_key="2026-08").one()
    ma = ["B-2.2", "B-2.1", "B-1.1", "B-1.2", "B-1.3"]
    ind_ids = [i.id for i in db.query(Indicator).filter(Indicator.code.in_(ma)).all()]

    def bao_cao(code):
        oid = db.query(OrgUnit).filter_by(code=code).one().id
        return db.query(Report).filter_by(org_unit_id=oid, period_id=ky.id).one()

    db.query(ReportValue).filter(ReportValue.report_id == bao_cao("U05").id,
                                 ReportValue.indicator_id.in_(ind_ids)) \
        .update({"this_period": Decimal("0.00")}, synchronize_session=False)
    db.query(ReportValue).filter(ReportValue.report_id == bao_cao("U02").id,
                                 ReportValue.indicator_id.in_(ind_ids)) \
        .delete(synchronize_session=False)
    db.flush()

    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    thu_tu = [u["org_unit"]["code"] for u in ds]
    u05 = next(u for u in ds if u["org_unit"]["code"] == "U05")
    u02 = next(u for u in ds if u["org_unit"]["code"] == "U02")

    assert (u05["lti"], u05["fat"], u05["gio_cong"]) == (0.0, 0.0, 0.0)
    assert (u02["lti"], u02["fat"]) == (None, None)
    assert thu_tu.index("U05") < thu_tu.index("U02")


def test_units_thu_tu_theo_ma_don_vi_khi_hoa_het(client, db):
    """K5 — kỳ 2026-09 chưa có báo cáo nào nên cả 22 dòng hoà cả ba khoá giá
    trị; không khoá sắp cuối cùng thì thứ tự bảng chính của buổi demo đổi giữa
    các lần tải trang. So DANH SÁCH THEO THỨ TỰ, không so tập hợp (Task 6 từng
    ship một lần lỗi thứ tự vì test so tập hợp)."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/dashboard/units?period=2026-09", headers=h).json()
    assert [u["org_unit"]["code"] for u in ds] == \
        [f"P{i:02d}" for i in range(1, 6)] + [f"U{i:02d}" for i in range(1, 18)]


def test_status_thu_tu_don_vi_theo_ma(client, db):
    """K5 — thứ tự dòng của lưới "Tình trạng nộp" là lựa chọn có ý thức: theo
    MÃ đơn vị (P01-P05 trước U01-U17), cùng quy ước với GET /reports và
    /dashboard/units. Khoá lại để lần sửa sau phải là lần sửa CỐ Ý."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    st = client.get("/api/v1/status?template=FM01&from=2026-08&to=2026-08", headers=h).json()
    assert [u["code"] for u in st["units"]] == \
        [f"P{i:02d}" for i in range(1, 6)] + [f"U{i:02d}" for i in range(1, 18)]


def test_summary_thu_tu_6_o_kpi_dung_luoi_thiet_ke(client, db):
    """K5 — FE render mảng `kpis` theo thứ tự, thiết kế chốt lưới 3x2
    "LTI · FAT · Đơn vị có LTI | Tổng giờ công · Near miss · HAZOB"
    (docs/designs/hseq-platform-mvp-fm01.md). test_summary_6_kpi_gia_tri_dung
    đánh chỉ mục theo mã nên đảo hai ô vẫn xanh ở đó."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    s = client.get("/api/v1/dashboard/summary?period=2026-08", headers=h).json()
    assert [(k["code"], k["label"]) for k in s["kpis"]] == [
        ("B-2.2", "LTI trong kỳ"), ("B-2.1", "FAT trong kỳ"),
        ("DON_VI_CO_LTI", "Đơn vị có LTI"), ("B-1.4", "Tổng giờ công"),
        ("B-2.10", "Near miss"), ("B-2.11", "HAZOB card"),
    ]


# ---------------------------------------------------------------------------
# Task 25 carry C1 — lỗ hợp đồng: DashboardUnitOut thiếu report_id nên FE
# không dựng được đường dẫn '/reports/{id}' khi bấm số LTI của một đơn vị.
# ---------------------------------------------------------------------------


def test_units_report_id_null_khi_chua_nop_dung_id_khi_da_nop(client, db):
    """C1 (task-25-carry.md) — khẳng định CẢ HAI chiều: đơn vị chưa có báo cáo
    (kỳ 2026-09, mọi đơn vị) trả report_id None; đơn vị đã có báo cáo (U01, kỳ
    2026-08, approved) trả ĐÚNG id thật trong DB, không chỉ "khác None" (một
    id ngẫu nhiên/hằng số vẫn qua được nếu chỉ kiểm "not None")."""
    seed_all(db)
    from app.models import OrgUnit, Report, ReportingPeriod
    h = dang_nhap(client, "admin@ptsc.local")

    rong = client.get("/api/v1/dashboard/units?period=2026-09", headers=h).json()
    assert len(rong) == 22
    assert all(u["report_id"] is None for u in rong)

    ky = db.query(ReportingPeriod).filter_by(period_key="2026-08").one()
    u01_id = db.query(OrgUnit).filter_by(code="U01").one().id
    r01 = db.query(Report).filter_by(org_unit_id=u01_id, period_id=ky.id).one()

    ds = client.get("/api/v1/dashboard/units?period=2026-08", headers=h).json()
    u01 = next(u for u in ds if u["org_unit"]["code"] == "U01")
    assert u01["report_id"] == r01.id
