# backend/tests/api/test_seed.py
def test_seed_hai_lan_khong_nhan_doi(db):
    from app.models import AppUser, Indicator, OrgUnit
    from app.seed import seed_all

    seed_all(db)
    dem = (db.query(OrgUnit).count(), db.query(Indicator).count(), db.query(AppUser).count())
    seed_all(db)
    assert dem == (db.query(OrgUnit).count(), db.query(Indicator).count(),
                   db.query(AppUser).count())


def test_seed_dung_22_dau_moi_bao_cao(db):
    from app.models import OrgUnit
    from app.seed import seed_all

    seed_all(db)
    assert db.query(OrgUnit).filter_by(is_reporting=True).count() == 22


def test_seed_du_chi_tieu_va_3_o_van_ban(db):
    from app.models import Indicator, ReportTemplate, TemplateTextField
    from app.seed import seed_all

    seed_all(db)
    fm01 = db.query(ReportTemplate).filter_by(code="FM01").one()
    # 53 = số dòng chỉ tiêu đếm được trong FM01.xlsx. Spec ghi 55; con số của
    # spec là ghi nhớ từ office-hours, FILE mới là nguồn. Nếu bước trích ra
    # con số khác thì SỬA HẰNG SỐ NÀY cho khớp file và báo cáo rõ — tuyệt đối
    # không thêm/bớt dòng danh mục để khớp test.
    assert db.query(Indicator).filter_by(template_id=fm01.id, active=True).count() == 53
    assert db.query(TemplateTextField).filter_by(template_id=fm01.id).count() == 3


def test_moi_formula_computed_tro_toi_ma_co_that(db):
    """Chốt chặn: gõ sai một mã trong formula làm dòng tổng sai vĩnh viễn mà
    không ai biết, vì evaluate_computed coi mã lạ là 0 (Task 5)."""
    from app.models import Indicator, ReportTemplate
    from app.seed import seed_all

    seed_all(db)
    fm01 = db.query(ReportTemplate).filter_by(code="FM01").one()
    ds = db.query(Indicator).filter_by(template_id=fm01.id).all()
    co_that = {i.code for i in ds}
    for i in ds:
        if i.agg_type != "computed":
            continue
        thanh_phan = {m.strip() for m in (i.formula or "").split(",") if m.strip()}
        assert thanh_phan, f"{i.code}: dòng computed mà formula rỗng"
        thieu = thanh_phan - co_that
        assert not thieu, f"{i.code}: formula tham chiếu mã không có thật {thieu}"


def test_moi_reporter_co_scope_dung_don_vi(db):
    from app.models import Role, UserRole
    from app.seed import seed_all

    seed_all(db)
    reporter = db.query(Role).filter_by(code="reporter").one()
    gan = db.query(UserRole).filter_by(role_id=reporter.id).all()
    assert len(gan) == 22
    assert all(g.scope_org_unit_id is not None for g in gan), "reporter scope NULL là lỗi seed"


def test_seed_4_ky_va_workflow_4_trang_thai_4_chuyen(db):
    from app.models import ReportingPeriod, WorkflowState, WorkflowTransition
    from app.seed import seed_all

    seed_all(db)
    assert {p.period_key for p in db.query(ReportingPeriod).all()} == {
        "2026-06", "2026-07", "2026-08", "2026-09"}
    assert {s.code for s in db.query(WorkflowState).all()} == {
        "draft", "submitted", "returned", "approved"}
    assert {t.action_code for t in db.query(WorkflowTransition).all()} == {
        "submit", "return", "approve", "reopen"}


def test_mau_gia_FM99_tao_duoc_khong_can_migration(db):
    """Sẵn sàng giai đoạn 2: mẫu mới chỉ là dòng dữ liệu."""
    from app.models import Indicator, ReportTemplate, TemplateSection, WorkflowState

    tpl = ReportTemplate(code="FM99", name_vi="Mẫu thử", period_type="month",
                         version=1, active=True)
    db.add(tpl); db.flush()
    sec = TemplateSection(template_id=tpl.id, code="X", name_vi="X", sort_order=1)
    db.add(sec); db.flush()
    for i in range(3):
        db.add(Indicator(template_id=tpl.id, section_id=sec.id, code=f"X-{i}",
                         name_vi=f"Chỉ tiêu {i}", agg_type="sum", decimals=0,
                         required=False, sort_order=i))
    for code, initial, editable, counts in [("draft", True, True, False),
                                            ("approved", False, False, True)]:
        db.add(WorkflowState(template_id=tpl.id, code=code, name_vi=code,
                             is_initial=initial, is_terminal=False,
                             is_editable=editable, counts_in_totals=counts,
                             sort_order=1))
    db.flush()
    assert db.query(Indicator).filter_by(template_id=tpl.id).count() == 3


def test_export_json_giu_dung_bo_cuc_excel(db, tmp_path):
    """fm01-catalog.json là hợp đồng BE↔FE; FE dựng form bằng cách lặp mảng này.

    Mỗi nhóm phải là MỘT khối liền nhau, và các khối theo đúng thứ tự file Excel.
    """
    import json
    from itertools import groupby

    from app.seed import export_catalog_json, seed_all

    seed_all(db)
    p = tmp_path / "catalog.json"
    export_catalog_json(db, str(p))
    d = json.loads(p.read_text(encoding="utf-8"))

    ma_nhom = [i["section_code"] for i in d["indicators"]]
    khoi = [s for k, s in enumerate(ma_nhom) if k == 0 or ma_nhom[k - 1] != s]
    assert khoi == ["B-1", "B-2", "B-3", "B-4", "B-5", "B-6", "B-7", "B-8", "B-9"], \
        f"nhóm bị trộn: {khoi}"

    for ma, nhom in groupby(d["indicators"], key=lambda i: i["section_code"]):
        thu_tu = [i["sort_order"] for i in nhom]
        assert thu_tu == sorted(thu_tu), f"{ma}: sort_order không tăng dần"

    assert [s["sort_order"] for s in d["sections"]] == \
        sorted(s["sort_order"] for s in d["sections"]), "sections không sắp theo sort_order"
    assert [t["sort_order"] for t in d["text_fields"]] == [1, 2, 3]


def test_file_catalog_json_trong_repo_dung_thu_tu(db, tmp_path):
    """Bản đã commit phải khớp bản xuất lại — không để file cũ sai nằm lại trong repo."""
    import json
    from pathlib import Path

    from app.seed import export_catalog_json, seed_all

    seed_all(db)
    p = tmp_path / "catalog.json"
    export_catalog_json(db, str(p))
    moi = json.loads(p.read_text(encoding="utf-8"))
    # Dựng từ __file__, không phải đường dẫn tương đối theo CWD: test này phải
    # đúng bất kể pytest được gọi từ đâu, không chỉ khi CWD là backend/.
    goc_repo = Path(__file__).resolve().parents[3]
    trong_repo = json.loads(
        (goc_repo / "frontend/src/test/fixtures/fm01-catalog.json")
        .read_text(encoding="utf-8"))
    assert [i["code"] for i in trong_repo["indicators"]] == \
        [i["code"] for i in moi["indicators"]], "file trong repo lệch thứ tự, xuất lại đi"


def test_seed_lai_khong_ghi_de_du_lieu_da_co(db):
    """insert-if-absent: chạy lại KHÔNG được cập nhật dòng đã tồn tại.

    Đây là hợp đồng thật — sau khi Chồng yêu thay tên tạm bằng tên đơn vị thật,
    một lần chạy lại seed không được xoá công đó.
    """
    from app.models import OrgUnit
    from app.seed import seed_all

    seed_all(db)
    dv = db.query(OrgUnit).filter_by(code="U01").one()
    dv.name = "Tên thật do người dùng sửa"
    db.flush()
    seed_all(db)
    db.refresh(dv)
    assert dv.name == "Tên thật do người dùng sửa", "seed lại đã ghi đè dữ liệu đang có"


def test_moi_reporter_gan_dung_don_vi_theo_ma(db):
    """u01→U01 … u17→U17, u18→P01 … u22→P05. Sai ánh xạ = báo cáo nhầm đơn vị."""
    from app.models import AppUser, OrgUnit, Role, UserRole
    from app.seed import seed_all

    seed_all(db)
    reporter = db.query(Role).filter_by(code="reporter").one()
    mong_doi = {f"u{i:02d}@ptsc.local": f"U{i:02d}" for i in range(1, 18)}
    mong_doi.update({f"u{17 + i:02d}@ptsc.local": f"P{i:02d}" for i in range(1, 6)})

    for email, ma_dv in sorted(mong_doi.items()):
        u = db.query(AppUser).filter_by(email=email).one()
        dv = db.query(OrgUnit).filter_by(code=ma_dv).one()
        assert u.org_unit_id == dv.id, f"{email} thuộc nhầm đơn vị"
        ur = db.query(UserRole).filter_by(user_id=u.id, role_id=reporter.id).one()
        assert ur.scope_org_unit_id == dv.id, f"{email} có scope nhầm đơn vị"


def test_tung_trang_thai_dung_ba_co(db):
    from app.models import ReportTemplate, WorkflowState
    from app.seed import seed_all

    seed_all(db)
    fm01 = db.query(ReportTemplate).filter_by(code="FM01").one()
    mong_doi = {  # code: (is_initial, is_editable, counts_in_totals)
        "draft":     (True,  True,  False),
        "submitted": (False, False, False),
        "returned":  (False, True,  False),
        "approved":  (False, False, True),
    }
    ds = db.query(WorkflowState).filter_by(template_id=fm01.id).all()
    assert {s.code for s in ds} == set(mong_doi)
    for s in ds:
        assert (s.is_initial, s.is_editable, s.counts_in_totals) == mong_doi[s.code], \
            f"{s.code}: cờ sai"


def test_du_5_dong_chuyen_trang_thai_dung_tung_dong(db):
    """So từng DÒNG, không so tập hợp action_code — hai dòng cùng mang action
    'submit' nên xoá một dòng không làm tập hợp đổi."""
    from app.models import (Permission, ReportTemplate, WorkflowState,
                            WorkflowTransition)
    from app.seed import seed_all

    seed_all(db)
    fm01 = db.query(ReportTemplate).filter_by(code="FM01").one()
    ten_tt = {s.id: s.code for s in
              db.query(WorkflowState).filter_by(template_id=fm01.id).all()}
    ten_q = {p.id: p.code for p in db.query(Permission).all()}

    thuc_te = {
        (t.action_code, ten_tt[t.from_state_id], ten_tt[t.to_state_id],
         ten_q[t.required_permission_id], t.requires_note)
        for t in db.query(WorkflowTransition).filter_by(template_id=fm01.id).all()
    }
    mong_doi = {
        ("submit",  "draft",     "submitted", "report.submit",  False),
        ("submit",  "returned",  "submitted", "report.submit",  False),
        ("return",  "submitted", "returned",  "report.return",  True),
        ("approve", "submitted", "approved",  "report.approve", False),
        ("reopen",  "approved",  "returned",  "report.return",  True),
    }
    assert thuc_te == mong_doi, f"thiếu: {mong_doi - thuc_te} | thừa: {thuc_te - mong_doi}"


def test_tung_vai_co_dung_tap_quyen(db):
    from app.models import Permission, Role, RolePermission
    from app.seed import seed_all

    seed_all(db)
    tat_ca = {p.code for p in db.query(Permission).all()}
    mong_doi = {
        "admin_atcl": tat_ca,
        "reporter": {"report.create", "report.edit", "report.submit",
                     "report.view_own_unit"},
        "viewer": {"report.view_all", "dashboard.view", "status.view"},
    }
    ten_q = {p.id: p.code for p in db.query(Permission).all()}
    for ma_vai, quyen in mong_doi.items():
        vai = db.query(Role).filter_by(code=ma_vai).one()
        co = {ten_q[rp.permission_id] for rp in
              db.query(RolePermission).filter_by(role_id=vai.id).all()}
        assert co == quyen, f"{ma_vai}: thiếu {quyen - co} | thừa {co - quyen}"


def test_due_at_dung_gio_viet_nam(db):
    """Hạn nộp là 23:59:59 ngày 5 tháng sau theo Asia/Ho_Chi_Minh.

    Kỳ 08/2026 đặt hạn 05/10/2026 để lượt nộp sống trong demo không bị gắn muộn.
    """
    from zoneinfo import ZoneInfo

    from app.models import ReportingPeriod
    from app.seed import seed_all

    seed_all(db)
    VN = ZoneInfo("Asia/Ho_Chi_Minh")
    ngay_han = {"2026-06": (2026, 7, 5), "2026-07": (2026, 8, 5),
                "2026-08": (2026, 10, 5), "2026-09": (2026, 10, 5)}
    ds = db.query(ReportingPeriod).all()
    assert {p.period_key for p in ds} == set(ngay_han)
    for p in ds:
        vn = p.due_at.astimezone(VN)
        assert (vn.hour, vn.minute, vn.second) == (23, 59, 59), f"{p.period_key}: {vn}"
        assert (vn.year, vn.month, vn.day) == ngay_han[p.period_key], f"{p.period_key}: {vn}"
