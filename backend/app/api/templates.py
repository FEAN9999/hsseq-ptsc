# backend/app/api/templates.py
"""Danh mục mẫu báo cáo — chỉ đọc (MVP). `PUT`/`POST` cho `template.manage`
là giai đoạn 2. Mọi vai (reporter, viewer, admin) đều cần đọc danh mục để
dựng form/bộ lọc, nhưng vẫn phải còn quyền xem báo cáo — xem
`deps.yeu_cau_xem_bao_cao`.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, aliased

from app.api.deps import CurrentUser, yeu_cau_xem_bao_cao
from app.core.db import get_db
from app.core.errors import NotFoundError
from app.models import (
    Indicator,
    Permission,
    ReportingPeriod,
    ReportTemplate,
    TemplateSection,
    TemplateTextField,
    WorkflowState,
    WorkflowTransition,
)

router = APIRouter(prefix="/templates")


@router.get("")
def ds_mau(u: CurrentUser = Depends(yeu_cau_xem_bao_cao), db: Session = Depends(get_db)):
    ds = db.query(ReportTemplate).order_by(ReportTemplate.code).all()
    return [
        {"code": t.code, "name_vi": t.name_vi, "name_en": t.name_en,
         "period_type": t.period_type, "active": t.active}
        for t in ds
    ]


@router.get("/{code}")
def chi_tiet_mau(code: str, u: CurrentUser = Depends(yeu_cau_xem_bao_cao),
                 db: Session = Depends(get_db)):
    tpl = db.query(ReportTemplate).filter_by(code=code).one_or_none()
    if tpl is None:
        raise NotFoundError("Không tìm thấy mẫu báo cáo")

    sections = (
        db.query(TemplateSection).filter_by(template_id=tpl.id)
        .order_by(TemplateSection.sort_order).all()
    )
    ma_section_theo_id = {s.id: s.code for s in sections}

    indicators = (
        db.query(Indicator)
        .join(TemplateSection, TemplateSection.id == Indicator.section_id)
        .filter(Indicator.template_id == tpl.id, Indicator.active.is_(True))
        .order_by(TemplateSection.sort_order, Indicator.sort_order)
        .all()
    )
    text_fields = (
        db.query(TemplateTextField).filter_by(template_id=tpl.id)
        .order_by(TemplateTextField.sort_order).all()
    )
    states = (
        db.query(WorkflowState).filter_by(template_id=tpl.id)
        .order_by(WorkflowState.sort_order).all()
    )
    TU = aliased(WorkflowState)
    DEN = aliased(WorkflowState)
    # order_by ổn định (task-12-carry.md D2): thiếu nó Postgres trả thứ tự tuỳ ý,
    # mà FE vẽ nút "Nộp / Trả lại / Duyệt" thẳng theo danh sách này nên thứ tự nút
    # có thể xáo giữa các lần tải trang.
    transitions = (
        db.query(WorkflowTransition, TU, DEN, Permission)
        .join(TU, TU.id == WorkflowTransition.from_state_id)
        .join(DEN, DEN.id == WorkflowTransition.to_state_id)
        .join(Permission, Permission.id == WorkflowTransition.required_permission_id)
        .filter(WorkflowTransition.template_id == tpl.id)
        .order_by(WorkflowTransition.id)
        .all()
    )

    return {
        "code": tpl.code, "name_vi": tpl.name_vi, "name_en": tpl.name_en,
        "sections": [
            {"code": s.code, "name_vi": s.name_vi, "name_en": s.name_en,
             "sort_order": s.sort_order}
            for s in sections
        ],
        "indicators": [
            {"code": i.code, "section_code": ma_section_theo_id[i.section_id],
             "name_vi": i.name_vi, "name_en": i.name_en, "unit": i.unit,
             "agg_type": i.agg_type, "formula": i.formula, "decimals": i.decimals,
             "required": i.required, "sort_order": i.sort_order}
            for i in indicators
        ],
        "text_fields": [
            {"code": t.code, "label_vi": t.label_vi, "sort_order": t.sort_order}
            for t in text_fields
        ],
        "states": [
            {"code": s.code, "name_vi": s.name_vi, "is_initial": s.is_initial,
             "is_editable": s.is_editable, "counts_in_totals": s.counts_in_totals,
             "sort_order": s.sort_order}
            for s in states
        ],
        "transitions": [
            {"action_code": wt.action_code, "from_state": tu.code, "to_state": den.code,
             "name_vi": wt.name_vi, "required_permission": p.code,
             "requires_note": wt.requires_note}
            for wt, tu, den, p in transitions
        ],
    }


@router.get("/{code}/periods")
def ds_ky(code: str, u: CurrentUser = Depends(yeu_cau_xem_bao_cao),
          db: Session = Depends(get_db)):
    tpl = db.query(ReportTemplate).filter_by(code=code).one_or_none()
    if tpl is None:
        raise NotFoundError("Không tìm thấy mẫu báo cáo")
    ky = (
        db.query(ReportingPeriod).filter_by(template_id=tpl.id)
        .order_by(ReportingPeriod.start_date).all()
    )
    return [
        {"period_key": k.period_key, "start_date": k.start_date, "end_date": k.end_date,
         "due_at": k.due_at, "is_open": k.is_open}
        for k in ky
    ]
