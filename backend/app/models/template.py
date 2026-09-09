# backend/app/models/template.py
from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ReportTemplate(Base):
    __tablename__ = "report_template"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16))
    name_vi: Mapped[str] = mapped_column(String(255))
    name_en: Mapped[str | None] = mapped_column(String(255))
    # month | week | quarter
    period_type: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class TemplateSection(Base):
    __tablename__ = "template_section"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    # A | B-1 ... B-9 | C
    code: Mapped[str] = mapped_column(String(8))
    name_vi: Mapped[str] = mapped_column(String(255))
    name_en: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Indicator(Base):
    __tablename__ = "indicator"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    section_id: Mapped[int] = mapped_column(ForeignKey("template_section.id"))
    code: Mapped[str] = mapped_column(String(32))
    name_vi: Mapped[str] = mapped_column(String(500))
    name_en: Mapped[str | None] = mapped_column(String(500))
    unit: Mapped[str | None] = mapped_column(String(32))
    # sum | counter | snapshot | computed
    agg_type: Mapped[str] = mapped_column(String(16))
    # với computed: danh sách mã chỉ tiêu cần cộng, ngăn bằng dấu phẩy
    formula: Mapped[str | None] = mapped_column(String(500))
    # none | on_event:LTI | yearly | project_start — MVP chỉ để hiện chữ cảnh báo
    reset_rule: Mapped[str] = mapped_column(String(32), default="none")
    # nguồn duy nhất cho validation cả Zod lẫn server
    decimals: Mapped[int] = mapped_column(Integer, default=0)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("template_id", "code"),)


class TemplateTextField(Base):
    __tablename__ = "template_text_field"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    # C1 | C2 | C3
    code: Mapped[str] = mapped_column(String(8))
    label_vi: Mapped[str] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
