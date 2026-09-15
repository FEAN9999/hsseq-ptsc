# backend/tests/api/test_reports.py
from app.seed import seed_all
from tests.api.test_catalog import MA_CHI_TIEU_THEO_THU_TU
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


# ---------------------------------------------------------------------------
# Vòng sửa 1 (task-10-fix-brief.md). Review chạy 43 mutation trên file thật,
# 29 cái SỐNG: code ra số đúng nhưng test không giữ được gì. Nhóm dưới khoá
# theo GIÁ TRỊ những nhánh đang trần: thứ tự 53 dòng form, bộ lọc `active`,
# lũy kế counter (cùng đơn vị + chỉ kỳ đã duyệt), `missing_periods`, dấu cột
# Lệch, cả 4 tham số lọc ở CẢ HAI nhánh của `GET /reports`, ba nhánh của
# `POST /reports`, và hợp đồng `texts: {C1,C2,C3}`.

def _bao_cao_cua(db, ma_don_vi: str, period_key: str):
    """Bản ghi `Report` của (đơn vị, kỳ) trong dữ liệu seed."""
    from app.models import OrgUnit, Report, ReportingPeriod, ReportTemplate
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    o = db.query(OrgUnit).filter_by(code=ma_don_vi).one()
    p = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key=period_key).one()
    return db.query(Report).filter_by(
        template_id=tpl.id, org_unit_id=o.id, period_id=p.id).one()


def _cho_kiem_nhiem_them_don_vi(db, email: str, ma_don_vi: str):
    """Cấp thêm cho `email` quyền xem báo cáo của `ma_don_vi` — người nhập kiêm
    nhiệm hai đơn vị. Phải qua một VAI MỚI: PK của `user_role` là
    (user_id, role_id) nên không thể gán vai `reporter` hai lần cho cùng một
    người với hai phạm vi khác nhau. `current_user()` gộp (union) scope theo
    mã quyền qua mọi vai, nên kết quả là phạm vi {đơn vị cũ, đơn vị mới}."""
    from app.models import AppUser, OrgUnit, Permission, Role, RolePermission, UserRole
    u = db.query(AppUser).filter_by(email=email).one()
    dv = db.query(OrgUnit).filter_by(code=ma_don_vi).one()
    vai = Role(code="reporter_kiem_nhiem", name="Người nhập kiêm nhiệm")
    db.add(vai)
    db.flush()
    quyen = db.query(Permission).filter_by(code="report.view_own_unit").one()
    db.add(RolePermission(role_id=vai.id, permission_id=quyen.id))
    db.add(UserRole(user_id=u.id, role_id=vai.id, scope_org_unit_id=dv.id))
    db.flush()


# --- F2 + F3: thứ tự và số dòng của form -----------------------------------

def test_get_report_tra_dung_53_dong_dung_thu_tu_bo_cuc(client, db):
    """C-1. Form 53 dòng phải xếp theo bố cục biểu mẫu (9 nhóm liền khối), KHÔNG
    theo thứ tự bảng chữ cái của mã: `.order_by(TemplateSection.sort_order,
    Indicator.sort_order)` mất hoặc đảo chiều thì "B-2.1 Chết người" rơi vào
    giữa nhóm B-1 và người nhập điền nhầm ô. Task 6 đã ship đúng lỗi này một
    lần. So DANH SÁCH THEO THỨ TỰ với hằng số viết thẳng ở test_catalog.py —
    không so tập hợp, không chỉ kiểm phần tử đầu/cuối."""
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    bc = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()[0]
    r = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    assert [v["indicator_code"] for v in r["values"]] == MA_CHI_TIEU_THEO_THU_TU
    assert len(r["values"]) == 53
    # form và danh mục phải cùng một thứ tự — FE dựng bảng theo danh mục rồi
    # ghép giá trị theo chỉ số dòng
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert [i["code"] for i in t["indicators"]] == [v["indicator_code"] for v in r["values"]]


def test_get_report_bo_chi_tieu_active_false_con_52_dong(client, db):
    """MA-6. Ban ATCL cho một chỉ tiêu nghỉ (`active = false`): form phải còn
    52 dòng và thiếu ĐÚNG mã đó. Mất bộ lọc `Indicator.active` thì chỉ tiêu đã
    bỏ vẫn hiện, `required` của nó chặn nộp, người nhập không có cách nào điền
    cho hợp lệ."""
    seed_all(db)
    from app.models import Indicator
    db.query(Indicator).filter_by(code="B-1.2").update({"active": False})
    db.flush()
    h = dang_nhap(client, "u01@ptsc.local")
    bc = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()[0]
    r = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    assert [v["indicator_code"] for v in r["values"]] == [
        ma for ma in MA_CHI_TIEU_THEO_THU_TU if ma != "B-1.2"]
    assert len(r["values"]) == 52


# --- F4: lũy kế counter ----------------------------------------------------

def test_counter_luy_ke_lay_dung_don_vi_minh_va_bo_qua_ban_nhap(client, db):
    """C-2 — rò dữ liệu chéo đơn vị qua đường TÍNH TOÁN.

    Thế thật trong seed, chỉ tiêu B-1.5 (counter, "Tổng giờ công an toàn không
    xảy ra LTI"):
        U01 2026-07 approved counts=True  acc_total = 3.00
        U01 2026-08 approved counts=True  acc_total = 6.00
        P05 2026-07 approved counts=True  acc_total = 5.00
        P05 2026-08 draft    counts=False acc_total = 9.00
    P05 tạo báo cáo 2026-09 và mở form: "Lũy kế tháng trước" phải là 5.0 —
    số của CHÍNH P05, ở kỳ ĐÃ DUYỆT gần nhất.
      - bỏ điều kiện `R.org_unit_id == Report_.org_unit_id` → 6.0 (số của U01)
      - bỏ điều kiện `WS.counts_in_totals.is_(True)`        → 9.0 (bản nháp P05)
    Cả hai số sai đều đi thẳng vào `counter_check` rồi vào báo cáo được duyệt.
    """
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")  # u22 → P05, đơn vị thứ 22
    tao = client.post("/api/v1/reports",
                      json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert tao.status_code == 201, tao.text
    r = client.get(f"/api/v1/reports/{tao.json()['id']}", headers=h).json()
    assert r["header"]["org_unit"]["code"] == "P05"
    assert r["header"]["period_key"] == "2026-09"
    b15 = next(v for v in r["values"] if v["indicator_code"] == "B-1.5")
    assert b15["acc_prev_entered"] == 5.0, "phải là số của P05 kỳ 07, không phải 6.0 (U01) hay 9.0 (nháp)"
    assert b15["counter_check"] == {
        "status": "bo_qua", "expected": None, "message": "Chưa đủ số để kiểm tra liên tục"}


# --- task-11-carry.md C1: view v_report_value_computed tính đúng cho báo cáo
# MỚI (0 dòng report_value) --------------------------------------------------

def test_bao_cao_moi_0_report_value_van_tinh_dung_luy_ke_sum(client, db):
    """`v_report_value_computed` (migration 0002) bắt đầu CTE `ctx` từ
    `report_value`, nên báo cáo vừa tạo (0 dòng report_value) không sinh dòng
    nào cho 48 chỉ tiêu `sum` — GET /reports/{id} trả `acc_prev_computed =
    None` dù kỳ trước đã duyệt có số thật (probe controller: P05 kỳ 2026-09).
    Migration 0003 sửa `ctx` bắt đầu từ report × indicator rồi LEFT JOIN
    report_value.

    Số liệu B-1.1 (sum) của P05 theo full_synthetic.csv (org_idx=22, ind_idx=1,
    xem tests/fixtures/gen_fixture.py::_delta): kỳ 06 duyệt this=4.00, kỳ 07
    duyệt this=5.00, kỳ 08 NHÁP (seed/__init__.py::_nhap_don_vi_22, không cộng
    vào tổng) this=1.00 → acc_prev của báo cáo MỚI kỳ 09 phải là 9.00 (4+5),
    không phải None; kỳ 08 rơi vào missing_periods vì không có báo cáo ĐƯỢC
    DUYỆT cho kỳ đó."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")  # u22 → P05, đơn vị thứ 22
    tao = client.post("/api/v1/reports",
                      json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert tao.status_code == 201, tao.text
    r = client.get(f"/api/v1/reports/{tao.json()['id']}", headers=h).json()
    assert r["header"]["org_unit"]["code"] == "P05"
    o = next(v for v in r["values"] if v["indicator_code"] == "B-1.1")
    assert o["acc_prev_computed"] == 9.0
    assert o["acc_total_computed"] == 9.0
    assert o["this_period"] is None
    assert r["missing_periods"] == ["2026-08"]


def test_counter_bo_qua_ky_chua_duyet_va_bao_lech_kem_huong_dan(client, db):
    """C-2 (nhánh còn lại) + MI-3. U01 kỳ 2026-07 bị trả về nháp: lũy kế của
    B-1.5 ở kỳ 08 phải lùi về kỳ 06 (1.00), không lấy 3.00 của kỳ 07 chưa
    duyệt. Số vào không khớp `acc_total_entered = 6.00` nên `counter_check`
    chuyển sang `lech` — câu thông điệp là hướng dẫn DUY NHẤT người nhập có,
    khoá nguyên văn (M18 biến nó thành chuỗi rỗng mà suite vẫn xanh)."""
    seed_all(db)
    from app.models import ReportTemplate, WorkflowState
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    draft = db.query(WorkflowState).filter_by(template_id=tpl.id, code="draft").one()
    _bao_cao_cua(db, "U01", "2026-07").state_id = draft.id
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    bc08 = _bao_cao_cua(db, "U01", "2026-08")
    r = client.get(f"/api/v1/reports/{bc08.id}", headers=h).json()
    b15 = next(v for v in r["values"] if v["indicator_code"] == "B-1.5")
    assert b15["this_period"] == 3.0
    assert b15["acc_prev_entered"] == 1.0  # kỳ 06, KHÔNG phải 3.0 của kỳ 07 chưa duyệt
    assert b15["acc_total_entered"] == 6.0
    assert b15["counter_check"] == {
        "status": "lech", "expected": 4.0,
        "message": "Lệch công thức (kỳ trước 1.00 + tháng này 3.00 = 4.00). "
                   "Có reset (LTI / đầu năm)? Nên ghi lý do vào Ghi chú",
    }


# --- F7: missing_periods và dấu cột Lệch -----------------------------------

def test_missing_periods_bao_dung_ky_chua_duyet_va_diff_dung_dau(client, db):
    """MA-1 + MA-3. `missing_periods` rỗng trong 100% dữ liệu seed nên vòng
    union ở services/reports.py chưa từng chạy với input khác rỗng; `diff` luôn
    bằng 0 vì fixture đặt `acc_total_entered == acc_total_computed` nên đảo dấu
    cũng không thấy.

    U01 kỳ 2026-07 về nháp (không `counts_in_totals`): form kỳ 08 phải cảnh báo
    thiếu kỳ 2026-07, và lũy kế tính được tụt từ 7.00 xuống 3.00 trong khi đơn
    vị vẫn khai 12.00 → Lệch = +4.0 (khai THỪA). Đảo dấu ra −4.0, admin đọc
    thành "đơn vị khai THIẾU" và trả lại báo cáo kèm nhận xét ngược."""
    seed_all(db)
    from app.models import ReportTemplate, WorkflowState
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    draft = db.query(WorkflowState).filter_by(template_id=tpl.id, code="draft").one()
    _bao_cao_cua(db, "U01", "2026-07").state_id = draft.id
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    bc08 = _bao_cao_cua(db, "U01", "2026-08")
    r = client.get(f"/api/v1/reports/{bc08.id}", headers=h).json()
    assert r["missing_periods"] == ["2026-07"]
    o = next(v for v in r["values"] if v["indicator_code"] == "B-1.1")
    assert o["this_period"] == 5.0
    assert o["acc_prev_computed"] == 3.0     # chỉ còn kỳ 06
    assert o["acc_total_computed"] == 8.0
    assert o["acc_total_entered"] == 12.0
    assert o["diff"] == 4.0                  # entered − computed, KHÔNG phải −4.0
    assert o["diff"] > 0


# --- F10: hợp đồng texts: {C1, C2, C3} -------------------------------------

def test_get_report_texts_du_ba_khoa_ke_ca_truong_chua_go(client, db):
    """MA-2. Không chỗ nào trong repo ghi `report_text` nên tuyến này chưa từng
    được kiểm. Người nhập gõ C1 rồi lưu: phản hồi phải có ĐỦ C1/C2/C3 (C2, C3 =
    None), nếu thiếu khoá thì textarea của FE chuyển controlled → uncontrolled
    và mất nội dung đang gõ. Đồng thời khoá tương quan `report_id`: text của
    U02 không được rò sang phản hồi của U01."""
    seed_all(db)
    from app.models import ReportText
    bc_u01 = _bao_cao_cua(db, "U01", "2026-08")
    bc_u02 = _bao_cao_cua(db, "U02", "2026-08")
    db.add(ReportText(report_id=bc_u01.id, field_code="C1",
                      content="Diễn tập PCCC ngày 12/08"))
    db.add(ReportText(report_id=bc_u02.id, field_code="C2",
                      content="Kế hoạch huấn luyện tháng 9"))
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    r = client.get(f"/api/v1/reports/{bc_u01.id}", headers=h).json()
    assert r["texts"] == {"C1": "Diễn tập PCCC ngày 12/08", "C2": None, "C3": None}

    ha = dang_nhap(client, "admin@ptsc.local")
    r2 = client.get(f"/api/v1/reports/{bc_u02.id}", headers=ha).json()
    assert r2["texts"] == {"C1": None, "C2": "Kế hoạch huấn luyện tháng 9", "C3": None}


def test_get_report_bao_cao_chua_go_chu_nao_van_du_ba_khoa(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    bc = _bao_cao_cua(db, "U01", "2026-08")
    r = client.get(f"/api/v1/reports/{bc.id}", headers=h).json()
    assert r["texts"] == {"C1": None, "C2": None, "C3": None}


# --- F5: bộ lọc GET /reports ở CẢ HAI nhánh --------------------------------
# Nhánh `pham_vi is None` (admin) và nhánh có phạm vi (reporter) là hai đoạn
# code hoàn toàn khác nhau — bỏ lọc `org_unit` ở nhánh admin vẫn `144 passed`
# trước vòng sửa này. Mỗi tham số một test cho MỖI nhánh.

def test_admin_loc_theo_org_unit(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&org_unit=U01", headers=h).json()
    assert [(r["org_unit"]["code"], r["period_key"]) for r in ds] == [
        ("U01", "2026-06"), ("U01", "2026-07"), ("U01", "2026-08")]


def test_admin_loc_theo_period(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=h).json()
    assert len(ds) == 22
    assert {r["period_key"] for r in ds} == {"2026-07"}


def test_admin_loc_theo_state(client, db):
    """Admin mở màn danh sách, chọn "Trạng thái: Nháp" trong buổi chốt số cuối
    tháng. Bộ lọc bị bỏ qua thì bảng hiện cả 22 đơn vị lẫn lộn nháp/đã duyệt và
    admin duyệt nhầm một báo cáo còn nháp."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&state=draft", headers=h).json()
    assert [(r["org_unit"]["code"], r["period_key"], r["state"]) for r in ds] == [
        ("P05", "2026-08", "draft")]
    ds = client.get("/api/v1/reports?template=FM01&period=2026-08&state=approved",
                    headers=h).json()
    assert len(ds) == 21
    assert {r["state"] for r in ds} == {"approved"}
    assert "P05" not in {r["org_unit"]["code"] for r in ds}


def test_reporter_loc_theo_org_unit_va_khong_ro_don_vi_ngoai_pham_vi(client, db):
    seed_all(db)
    _cho_kiem_nhiem_them_don_vi(db, "u01@ptsc.local", "U02")
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01", headers=h).json()
    assert sorted({r["org_unit"]["code"] for r in ds}) == ["U01", "U02"]

    ds = client.get("/api/v1/reports?template=FM01&org_unit=U01", headers=h).json()
    assert [(r["org_unit"]["code"], r["period_key"]) for r in ds] == [
        ("U01", "2026-06"), ("U01", "2026-07"), ("U01", "2026-08"), ("U01", "2026-09")]

    # đơn vị ngoài phạm vi: rỗng, KHÔNG rơi về "bỏ qua bộ lọc" rồi trả U01/U02
    assert client.get("/api/v1/reports?template=FM01&org_unit=U03", headers=h).json() == []


def test_reporter_loc_theo_period(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=h).json()
    assert [(r["org_unit"]["code"], r["period_key"], r["state"]) for r in ds] == [
        ("U01", "2026-07", "approved")]


def test_reporter_loc_theo_state(client, db):
    """Nhánh reporter lọc `state` trong Python (sau khi dựng dòng), không phải
    trong SQL — dòng "kỳ mở chưa có báo cáo" có `state = None` phải bị loại."""
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&state=approved", headers=h).json()
    assert [(r["period_key"], r["state"]) for r in ds] == [
        ("2026-06", "approved"), ("2026-07", "approved"), ("2026-08", "approved")]
    assert client.get("/api/v1/reports?template=FM01&state=draft", headers=h).json() == []


def test_reporter_ky_dong_chua_co_bao_cao_thi_khong_hien(client, db):
    """MA-10. Kỳ đã đóng chỉ được hiện nếu đơn vị ĐÃ có báo cáo. Mất điều kiện
    này thì danh sách mọc thêm dòng ma "chưa tạo · [Tạo báo cáo]" cho một kỳ đã
    đóng — bấm vào chỉ nhận 409 "Kỳ báo cáo đã đóng"."""
    seed_all(db)
    from app.models import ReportingPeriod
    db.query(ReportingPeriod).filter_by(period_key="2026-09").update({"is_open": False})
    db.flush()
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01", headers=h).json()
    # 2026-09: đã đóng và U01 chưa có báo cáo → biến mất.
    # 2026-06/07: cũng đã đóng nhưng ĐÃ có báo cáo → vẫn phải hiện.
    assert [(r["period_key"], r["state"]) for r in ds] == [
        ("2026-06", "approved"), ("2026-07", "approved"), ("2026-08", "approved")]


def test_reporter_ky_dang_mo_chua_co_bao_cao_van_hien_mot_dong_rong(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-09", headers=h).json()
    assert len(ds) == 1
    dong = ds[0]
    assert dong["period_key"] == "2026-09"
    assert dong["org_unit"]["code"] == "U01"
    assert dong["id"] is None and dong["state"] is None and dong["source"] is None
    assert dong["is_late"] is None and dong["updated_at"] is None


# --- F8: ba nhánh của POST /reports ----------------------------------------

def test_post_reports_tao_o_trang_thai_dau_va_nguon_live(client, db):
    """MA-9 (M24, M25). Báo cáo mới phải sinh ra ở trạng thái `is_initial`
    (draft) và `source = "live"`. Sinh ra ở `approved` là vào thẳng lũy kế và
    dashboard khi chưa ai nhập số nào; đánh dấu `seed` là số thật bị `GET
    /status` (spec:231) hiển thị như số mồi."""
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    tao = client.post("/api/v1/reports",
                      json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert tao.status_code == 201, tao.text
    r = client.get(f"/api/v1/reports/{tao.json()['id']}", headers=h).json()
    assert r["state"] == "draft"
    assert r["source"] == "live"
    assert r["version"] == 1
    assert r["is_late"] is False
    assert r["header"]["org_unit"]["code"] == "U01"


def test_post_reports_admin_khong_xac_dinh_duoc_don_vi_tra_403(client, db):
    """MA-9 (M23). `admin@ptsc.local` có `report.create` nhưng phạm vi là toàn
    TCT (`None`) — không suy ra được "đơn vị của mình". Guard này mất thì
    `next(iter(None))` ném TypeError → 500 trắng màn hình ngay trước mặt Ban
    ATCL, thay vì 403 kèm câu tiếng Việt."""
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    r = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == (
        "Không xác định được đúng một đơn vị để tạo báo cáo cho tài khoản này")


def test_post_reports_kiem_nhiem_nhieu_don_vi_tra_403(client, db):
    """MA-9 (M23), nhánh `len(pham_vi) != 1`: người kiêm nhiệm hai đơn vị thì
    hệ thống không được tự chọn hộ một trong hai."""
    seed_all(db)
    _cho_kiem_nhiem_them_don_vi(db, "u01@ptsc.local", "U02")
    h = dang_nhap(client, "u01@ptsc.local")
    r = client.post("/api/v1/reports",
                    json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == (
        "Không xác định được đúng một đơn vị để tạo báo cáo cho tài khoản này")


def _nut_than_view(nut: dict) -> dict | None:
    """Nút THÂN của CTE bọc `v_report_value_computed` trong cây `EXPLAIN`.

    Postgres đặt `Subplan Name` của một CTE tên `computed` là `"CTE computed"`.
    Trả `None` nếu câu SQL không bọc view sau hàng rào nào.
    """
    if nut.get("Subplan Name") == "CTE computed":
        return nut
    for con in nut.get("Plans", []):
        tim = _nut_than_view(con)
        if tim is not None:
            return tim
    return None


def test_get_report_chay_view_dung_mot_lan_cho_ca_bao_cao(client, db):
    """`v_report_value_computed` phải chạy ĐÚNG MỘT lần cho cả báo cáo.

    Đo trên CSDL demo `hseq` (final-review-R2-report.md §(A1)): bản cũ
    `LEFT JOIN v_report_value_computed ON v.report_id = report.id AND
    v.indicator_id = indicator.id` làm Postgres đặt view vào nhánh TRONG của
    một Nested Loop và chạy lại **toàn bộ thân view 53 lần — một lần cho MỖI
    dòng chỉ tiêu** (9,38 ms × 53 ≈ 490 ms, gấp ~100× mọi endpoint khác). Bộ
    lọc `report_id` không đẩy được vào trong view nên CTE `counted` của view
    quét lại toàn bộ `report_value` mỗi vòng. Chi phí là O(số chỉ tiêu × TOÀN
    BỘ `report_value`) nên nó lớn dần: một năm vận hành thật ⇒ ~2 giây mỗi lần
    mở form, trên uvicorn ĐƠN TIẾN TRÌNH — trong quãng đó không request nào
    khác được phục vụ, kể cả `/dashboard/summary` trên máy chiếu bên cạnh.

    **Vì sao ca này đo HÀNG RÀO chứ không đo số vòng lặp trần.** Đúng cùng một
    bộ dữ liệu (66 báo cáo · 3432 `report_value` · 1144 `opening_balance`),
    câu SQL CŨ chạy view **53 lần trên `hseq`** nhưng **1 lần trên
    `hseq_test`** — khác nhau chỉ vì thống kê bảng. Tức là bản cũ không sai
    "một cách đo được ở mọi nơi": nó giao SỐ LẦN CHẠY cho bộ tối ưu quyết
    định, và trên CSDL thật bộ tối ưu quyết định sai. `WITH ... AS
    MATERIALIZED` là thứ DUY NHẤT biến "một lần" thành bảo đảm của Postgres
    chứ không phải may rủi theo thống kê — nên ca này khẳng định đúng cái bảo
    đảm đó, và `Actual Loops` của nút thân view chính là SỐ LẦN view chạy.

    Không đo thời gian tường: Ruling 408 vừa dạy rằng đồng hồ ở độ phân giải
    giây là thứ không đáng tin, và một ca đo mili-giây sẽ chớp tắt theo máy.
    """
    import json

    from sqlalchemy import event

    from app.core.db import engine
    from app.models import Report, ReportTemplate
    from app.services.reports import lay_chi_tiet_bao_cao

    seed_all(db)
    bc = (db.query(Report).join(ReportTemplate, ReportTemplate.id == Report.template_id)
          .filter(ReportTemplate.code == "FM01").first())

    bat: list[tuple[str, object]] = []

    def _ghi(conn, cursor, statement, parameters, context, many):
        bat.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", _ghi)
    try:
        ket = lay_chi_tiet_bao_cao(db, bc.id)
    finally:
        event.remove(engine, "before_cursor_execute", _ghi)
    assert ket is not None
    assert len(bat) == 1, \
        f"phần đọc dữ liệu phải là ĐÚNG một câu SQL (ngân sách 2 query), đang là {len(bat)}"

    # `exec_driver_sql` chứ không phải `text()`: câu SQL còn nguyên tham số kiểu
    # pyformat (`%(id_1)s`) mà `text()` sẽ hiểu nhầm là ký tự escape.
    stmt, params = bat[0]
    plan = db.connection().exec_driver_sql(
        "EXPLAIN (ANALYZE, FORMAT JSON) " + stmt, params).scalar()
    if isinstance(plan, str):
        plan = json.loads(plan)

    than = _nut_than_view(plan[0]["Plan"])
    assert than is not None, (
        "Kế hoạch không có nút thân view nào nằm sau hàng rào CTE: câu SQL đang JOIN "
        "thẳng `v_report_value_computed`, nên SỐ LẦN view chạy do bộ tối ưu quyết định "
        "theo thống kê bảng — trên `hseq` nó chạy 53 lần (490 ms), trên `hseq_test` "
        "cùng dữ liệu lại chạy 1 lần. Xem R2 §(A1).")
    assert than["Actual Loops"] == 1, (
        f"thân view chạy {than['Actual Loops']} lần cho MỘT báo cáo "
        f"({len(ket[1].values)} dòng chỉ tiêu) — phải đúng 1")
