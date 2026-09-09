# backend/app/models/report.py
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Report(Base):
    __tablename__ = "report"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    org_unit_id: Mapped[int] = mapped_column(ForeignKey("org_unit.id"))
    period_id: Mapped[int] = mapped_column(ForeignKey("reporting_period.id"))
    state_id: Mapped[int] = mapped_column(ForeignKey("workflow_state.id"))
    # tăng 1 ở mỗi PUT values / transition thành công (eng review D6)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # seed | live — đổi sang live ở lượt ghi sống đầu tiên (D21)
    source: Mapped[str] = mapped_column(String(8), default="live", nullable=False)
    report_no: Mapped[str | None] = mapped_column(String(64))
    location: Mapped[str | None] = mapped_column(String(255))
    report_date: Mapped[date | None] = mapped_column(Date)
    reporter_name: Mapped[str | None] = mapped_column(String(255))
    reporter_position: Mapped[str | None] = mapped_column(String(255))
    first_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    decision_note: Mapped[str | None] = mapped_column(Text)
    is_late: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("template_id", "org_unit_id", "period_id"),
        Index("ix_report_org_period", "org_unit_id", "period_id"),
    )


class ReportValue(Base):
    __tablename__ = "report_value"
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("report.id", ondelete="CASCADE"))
    indicator_id: Mapped[int] = mapped_column(ForeignKey("indicator.id"))
    this_period: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    # chỉ có giá trị với dữ liệu fixture; nhập sống dòng sum thì NULL
    acc_prev_entered: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    acc_total_entered: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    note: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("report_id", "indicator_id"),
        Index("ix_report_value_indicator_report", "indicator_id", "report_id"),
    )


class ReportText(Base):
    __tablename__ = "report_text"
    report_id: Mapped[int] = mapped_column(
        ForeignKey("report.id", ondelete="CASCADE"), primary_key=True
    )
    # C1 | C2 | C3
    field_code: Mapped[str] = mapped_column(String(8), primary_key=True)
    content: Mapped[str | None] = mapped_column(Text)


class OpeningBalance(Base):
    __tablename__ = "opening_balance"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_unit_id: Mapped[int] = mapped_column(ForeignKey("org_unit.id"))
    indicator_id: Mapped[int] = mapped_column(ForeignKey("indicator.id"))
    period_id: Mapped[int] = mapped_column(ForeignKey("reporting_period.id"))
    value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    # seed | live, cùng quy ước với report.source
    source: Mapped[str] = mapped_column(String(8), nullable=False)

    __table_args__ = (UniqueConstraint("org_unit_id", "indicator_id", "period_id"),)
