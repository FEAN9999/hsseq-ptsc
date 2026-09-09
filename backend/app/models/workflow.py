# backend/app/models/workflow.py
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class WorkflowState(Base):
    __tablename__ = "workflow_state"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    code: Mapped[str] = mapped_column(String(32))
    name_vi: Mapped[str] = mapped_column(String(255))
    is_initial: Mapped[bool] = mapped_column(Boolean, default=False)
    is_terminal: Mapped[bool] = mapped_column(Boolean, default=False)
    # chỉ trạng thái is_editable mới cho sửa report_value
    is_editable: Mapped[bool] = mapped_column(Boolean, default=False)
    # true = cộng vào tổng dashboard / lũy kế (approved = true, reopen loại khỏi tổng)
    counts_in_totals: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class WorkflowTransition(Base):
    __tablename__ = "workflow_transition"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    from_state_id: Mapped[int] = mapped_column(ForeignKey("workflow_state.id"))
    to_state_id: Mapped[int] = mapped_column(ForeignKey("workflow_state.id"))
    # submit | return | approve | reopen
    action_code: Mapped[str] = mapped_column(String(32))
    name_vi: Mapped[str] = mapped_column(String(255))
    required_permission_id: Mapped[int] = mapped_column(ForeignKey("permission.id"))
    requires_note: Mapped[bool] = mapped_column(Boolean, default=False)


class ReportingPeriod(Base):
    __tablename__ = "reporting_period"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_template.id"))
    # ví dụ "2026-08"
    period_key: Mapped[str] = mapped_column(String(16))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
