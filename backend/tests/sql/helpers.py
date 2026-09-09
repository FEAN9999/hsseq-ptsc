# backend/tests/sql/helpers.py
from datetime import date, datetime, timezone
from decimal import Decimal


def dung_bo_khung(db):
    """Tạo mẫu FM01 rút gọn: 1 đơn vị, 1 chỉ tiêu sum, 4 kỳ, 2 trạng thái."""
    from app.models import (
        Indicator, OrgUnit, ReportingPeriod, ReportTemplate,
        TemplateSection, WorkflowState,
    )

    org = OrgUnit(code="U1", name="Đơn vị 1", type="member_unit", is_reporting=True)
    tpl = ReportTemplate(code="FM01", name_vi="FM01", period_type="month", version=1, active=True)
    db.add_all([org, tpl]); db.flush()
    sec = TemplateSection(template_id=tpl.id, code="B-1", name_vi="Giờ làm việc", sort_order=1)
    db.add(sec); db.flush()
    ind = Indicator(template_id=tpl.id, section_id=sec.id, code="B-1.1",
                    name_vi="Giờ TCT", unit="giờ", agg_type="sum", decimals=2,
                    required=True, sort_order=1)
    duyet = WorkflowState(template_id=tpl.id, code="approved", name_vi="Đã duyệt",
                          is_initial=False, is_terminal=False, is_editable=False,
                          counts_in_totals=True, sort_order=4)
    nhap = WorkflowState(template_id=tpl.id, code="draft", name_vi="Nháp",
                         is_initial=True, is_terminal=False, is_editable=True,
                         counts_in_totals=False, sort_order=1)
    db.add_all([ind, duyet, nhap]); db.flush()
    ky = {}
    for i, thang in enumerate(["2026-06", "2026-07", "2026-08", "2026-09"], start=6):
        p = ReportingPeriod(template_id=tpl.id, period_key=thang,
                            start_date=date(2026, i, 1), end_date=date(2026, i, 28),
                            # NOT NULL ở DB (migration 0001); brief gốc ghi due_at=None
                            # (bug kế thừa từ plan) — gán giờ cuối kỳ, không được assert.
                            due_at=datetime(2026, i, 28, 23, 59, 59, tzinfo=timezone.utc),
                            is_open=True)
        db.add(p); db.flush()
        ky[thang] = p
    return {"org": org, "tpl": tpl, "ind": ind, "approved": duyet, "draft": nhap, "ky": ky}


def them_bao_cao(db, bk, period_key, this_period, state="approved"):
    from app.models import Report, ReportValue

    r = Report(template_id=bk["tpl"].id, org_unit_id=bk["org"].id,
               period_id=bk["ky"][period_key].id, state_id=bk[state].id,
               version=1, source="seed")
    db.add(r); db.flush()
    db.add(ReportValue(report_id=r.id, indicator_id=bk["ind"].id,
                       this_period=Decimal(this_period)))
    db.flush()
    return r


def doc_view(db, report_id, indicator_id):
    from sqlalchemy import text

    return db.execute(
        text("""SELECT acc_prev_computed, acc_total_computed, missing_periods
                  FROM v_report_value_computed
                 WHERE report_id = :r AND indicator_id = :i"""),
        {"r": report_id, "i": indicator_id},
    ).one()
