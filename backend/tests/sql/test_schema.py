from sqlalchemy import inspect

BANG_MONG_DOI = {
    "org_unit", "app_user", "role", "permission", "role_permission", "user_role",
    "report_template", "template_section", "indicator", "template_text_field",
    "workflow_state", "workflow_transition", "reporting_period",
    "report", "report_value", "report_text", "opening_balance", "audit_log",
}


def test_du_18_bang(db):
    co = set(inspect(db.bind).get_table_names()) - {"alembic_version"}
    assert BANG_MONG_DOI <= co, f"thiếu: {BANG_MONG_DOI - co}"


def test_report_co_version_va_source(db):
    cot = {c["name"] for c in inspect(db.bind).get_columns("report")}
    assert {"version", "source"} <= cot


def test_hai_index_hieu_nang(db):
    insp = inspect(db.bind)
    rv = {i["name"] for i in insp.get_indexes("report_value")}
    rp = {i["name"] for i in insp.get_indexes("report")}
    assert any("indicator" in n for n in rv), "thiếu index report_value(indicator_id, report_id)"
    assert any("org_unit" in n for n in rp), "thiếu index report(org_unit_id, period_id)"


def test_unique_bao_cao_theo_mau_don_vi_ky(db):
    uc = inspect(db.bind).get_unique_constraints("report")
    assert any(
        set(c["column_names"]) == {"template_id", "org_unit_id", "period_id"} for c in uc
    )
