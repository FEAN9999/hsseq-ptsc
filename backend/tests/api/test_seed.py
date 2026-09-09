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
