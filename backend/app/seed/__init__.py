# backend/app/seed/__init__.py
"""seed_all(): insert-if-absent. Chạy lại KHÔNG bao giờ cập nhật dòng đã có.

Mật khẩu demo chung cho mọi tài khoản seed đọc từ env `SEED_PASSWORD`, mặc
định `Demo@2026`; băm bằng bcrypt qua `pwdlib` (đã có sẵn trong dependency
`pwdlib[bcrypt]`, xem pyproject.toml — chỉ hasher bcrypt được cài, không có
argon2, nên phải dựng `PasswordHash` tường minh thay vì `.recommended()`).
"""
import json
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from app.models import (
    AppUser,
    Indicator,
    OrgUnit,
    Permission,
    Report,
    ReportingPeriod,
    ReportTemplate,
    Role,
    RolePermission,
    TemplateSection,
    TemplateTextField,
    UserRole,
    WorkflowState,
    WorkflowTransition,
)
from app.seed.catalog_fm01 import INDICATORS, SECTIONS, TEXT_FIELDS
from app.seed.fixture import LoadResult, load_fixture

VN = ZoneInfo("Asia/Ho_Chi_Minh")

_PASSWORD_HASH = PasswordHash((BcryptHasher(),))

PERMISSIONS = [
    "report.create", "report.edit", "report.submit", "report.return", "report.approve",
    "report.view_own_unit", "report.view_all", "dashboard.view", "status.view",
    "template.manage", "workflow.manage", "org.manage", "user.manage", "audit.view",
]
# 1 TCT + 12 Ban + 17 Đơn vị thành viên + 5 Ban dự án (spec:132); is_reporting
# cho đúng 22 đầu mối = 17 đơn vị + 5 ban dự án.
#
# TÊN TẠM. Tên thật của 17 đơn vị thành viên, 5 ban dự án và 12 ban TCT là
# kiến thức nội bộ, không có trong spec/plan/file Excel. Thay tên = sửa đúng
# danh sách này, không đụng dòng code nào. Phải thay TRƯỚC buổi demo.
ORG_UNITS = [  # code, name, type, is_reporting
    ("PTSC", "Tổng công ty CP Dịch vụ Kỹ thuật Dầu khí", "corp", False),
] + [
    (f"BAN{i:02d}", f"Ban {i:02d} (tên tạm)", "dept", False) for i in range(1, 13)
] + [
    (f"U{i:02d}", f"Đơn vị thành viên {i:02d} (tên tạm)", "member_unit", True)
    for i in range(1, 18)
] + [
    (f"P{i:02d}", f"Ban dự án {i:02d} (tên tạm)", "project_board", True)
    for i in range(1, 6)
]

ROLE_NAMES = {
    "admin_atcl": "Admin Ban ATCL",
    "reporter": "Người nhập",
    "viewer": "Người xem",
}
ROLE_PERMS = {
    "admin_atcl": PERMISSIONS,
    "reporter": ["report.create", "report.edit", "report.submit", "report.view_own_unit"],
    "viewer": ["report.view_all", "dashboard.view", "status.view"],
}
STATES = [  # code, name_vi, is_initial, is_editable, counts_in_totals, sort
    ("draft",     "Nháp",     True,  True,  False, 1),
    ("submitted", "Đã nộp",   False, False, False, 2),
    ("returned",  "Trả lại",  False, True,  False, 3),
    ("approved",  "Đã duyệt", False, False, True,  4),
]
TRANSITIONS = [  # action, from, to, permission, requires_note, name_vi
    ("submit",  "draft",     "submitted", "report.submit",  False, "Nộp báo cáo"),
    ("submit",  "returned",  "submitted", "report.submit",  False, "Nộp lại"),
    ("return",  "submitted", "returned",  "report.return",  True,  "Trả lại"),
    ("approve", "submitted", "approved",  "report.approve", False, "Duyệt"),
    ("reopen",  "approved",  "returned",  "report.return",  True,  "Mở lại"),
]


def _lay_hoac_tao(db, model, khoa: dict, **gia_tri):
    """insert-if-absent: có rồi thì trả về nguyên trạng, KHÔNG cập nhật."""
    obj = db.query(model).filter_by(**khoa).one_or_none()
    if obj is None:
        obj = model(**khoa, **gia_tri)
        db.add(obj)
        db.flush()
    return obj


def _seed_org(db) -> None:
    for code, name, loai, is_reporting in ORG_UNITS:
        _lay_hoac_tao(db, OrgUnit, {"code": code},
                      name=name, type=loai, is_reporting=is_reporting)


def _seed_rbac(db) -> None:
    quyen_theo_ma = {ma: _lay_hoac_tao(db, Permission, {"code": ma}) for ma in PERMISSIONS}
    for role_code, ma_quyen_list in ROLE_PERMS.items():
        role = _lay_hoac_tao(db, Role, {"code": role_code}, name=ROLE_NAMES[role_code])
        for ma in ma_quyen_list:
            _lay_hoac_tao(db, RolePermission,
                          {"role_id": role.id, "permission_id": quyen_theo_ma[ma].id})


def _seed_users(db) -> None:
    """admin@ptsc.local (admin_atcl) + u01..u22@ptsc.local (reporter, scope đúng
    đơn vị, theo thứ tự 22 đầu mối is_reporting) + viewer@ptsc.local (viewer)."""
    mat_khau = os.environ.get("SEED_PASSWORD", "Demo@2026")
    bam = _PASSWORD_HASH.hash(mat_khau)

    admin_role = db.query(Role).filter_by(code="admin_atcl").one()
    reporter_role = db.query(Role).filter_by(code="reporter").one()
    viewer_role = db.query(Role).filter_by(code="viewer").one()
    tct = db.query(OrgUnit).filter_by(code="PTSC").one()

    admin = _lay_hoac_tao(
        db, AppUser, {"email": "admin@ptsc.local"},
        full_name="Admin Ban ATCL", position="Chuyên viên tổng hợp Ban ATCL",
        password_hash=bam, org_unit_id=tct.id,
    )
    _lay_hoac_tao(db, UserRole, {"user_id": admin.id, "role_id": admin_role.id},
                  scope_org_unit_id=None)

    don_vi_bao_cao = (
        db.query(OrgUnit).filter_by(is_reporting=True).order_by(OrgUnit.id).all()
    )
    for stt, don_vi in enumerate(don_vi_bao_cao, start=1):
        nguoi_nhap = _lay_hoac_tao(
            db, AppUser, {"email": f"u{stt:02d}@ptsc.local"},
            full_name=f"Người nhập {don_vi.code}", position="Đại diện SKATMT",
            password_hash=bam, org_unit_id=don_vi.id,
        )
        _lay_hoac_tao(db, UserRole, {"user_id": nguoi_nhap.id, "role_id": reporter_role.id},
                      scope_org_unit_id=don_vi.id)

    nguoi_xem = _lay_hoac_tao(
        db, AppUser, {"email": "viewer@ptsc.local"},
        full_name="Người xem", position="Trưởng / Phó Ban ATCL",
        password_hash=bam, org_unit_id=tct.id,
    )
    _lay_hoac_tao(db, UserRole, {"user_id": nguoi_xem.id, "role_id": viewer_role.id},
                  scope_org_unit_id=None)


def _seed_template(db) -> ReportTemplate:
    tpl = _lay_hoac_tao(
        db, ReportTemplate, {"code": "FM01"},
        name_vi="BÁO CÁO THÁNG CÔNG TÁC SKATMT DỰ ÁN",
        name_en="MONTHLY PROJECT HSE REPORT",
        period_type="month", version=1, active=True,
    )

    section_id_theo_ma = {}
    for code, name_vi, name_en, sort_order in SECTIONS:
        sec = _lay_hoac_tao(
            db, TemplateSection, {"template_id": tpl.id, "code": code},
            name_vi=name_vi, name_en=name_en, sort_order=sort_order,
        )
        section_id_theo_ma[code] = sec.id

    # sort_order đánh lại từ 1 trong từng section, khớp số thứ tự trong `code`
    # (vd "B-2.7" là chỉ tiêu thứ 7 của section B-2).
    stt_theo_section: dict[str, int] = {}
    for (section_code, code, name_vi, name_en, unit, agg_type, formula, reset_rule,
         decimals, required) in INDICATORS:
        stt_theo_section[section_code] = stt_theo_section.get(section_code, 0) + 1
        _lay_hoac_tao(
            db, Indicator, {"template_id": tpl.id, "code": code},
            section_id=section_id_theo_ma[section_code], name_vi=name_vi, name_en=name_en,
            unit=unit, agg_type=agg_type, formula=formula, reset_rule=reset_rule,
            decimals=decimals, required=required,
            sort_order=stt_theo_section[section_code], active=True,
        )

    for code, label_vi, sort_order in TEXT_FIELDS:
        _lay_hoac_tao(
            db, TemplateTextField, {"template_id": tpl.id, "code": code},
            label_vi=label_vi, sort_order=sort_order,
        )
    return tpl


def _seed_workflow(db, tpl: ReportTemplate) -> None:
    state_id_theo_ma = {}
    for code, name_vi, is_initial, is_editable, counts_in_totals, sort_order in STATES:
        st = _lay_hoac_tao(
            db, WorkflowState, {"template_id": tpl.id, "code": code},
            name_vi=name_vi, is_initial=is_initial, is_terminal=False,
            is_editable=is_editable, counts_in_totals=counts_in_totals,
            sort_order=sort_order,
        )
        state_id_theo_ma[code] = st.id

    for action_code, tu, den, quyen_code, requires_note, name_vi in TRANSITIONS:
        quyen = db.query(Permission).filter_by(code=quyen_code).one()
        _lay_hoac_tao(
            db, WorkflowTransition,
            {"template_id": tpl.id, "from_state_id": state_id_theo_ma[tu],
             "to_state_id": state_id_theo_ma[den], "action_code": action_code},
            name_vi=name_vi, required_permission_id=quyen.id, requires_note=requires_note,
        )


def _seed_periods(db, tpl: ReportTemplate) -> None:
    def han_nop(nam: int, thang: int) -> datetime:
        return datetime(nam, thang, 5, 23, 59, 59, tzinfo=VN)

    ky_list = [  # period_key, start_date, end_date, due_at, is_open
        ("2026-06", date(2026, 6, 1), date(2026, 6, 30), han_nop(2026, 7), False),
        ("2026-07", date(2026, 7, 1), date(2026, 7, 31), han_nop(2026, 8), False),
        # 08/2026 là kỳ demo: due_at đẩy sau ngày demo giả định (05/10/2026) để
        # lượt nộp sống trong buổi demo không bị gắn nhãn "nộp muộn" (spec:144).
        ("2026-08", date(2026, 8, 1), date(2026, 8, 31), han_nop(2026, 10), True),
        ("2026-09", date(2026, 9, 1), date(2026, 9, 30), han_nop(2026, 10), True),
    ]
    for period_key, start_date, end_date, due_at, is_open in ky_list:
        _lay_hoac_tao(
            db, ReportingPeriod, {"template_id": tpl.id, "period_key": period_key},
            start_date=start_date, end_date=end_date, due_at=due_at, is_open=is_open,
        )


def _nhap_don_vi_22(db, tpl) -> None:
    """Đơn vị thứ 22 ở kỳ 08/2026 là nháp, có đủ số thật của chính nó.

    Đường demo phân đoạn 2: người demo chỉ sửa vài ô rồi nộp, không vướng ô
    bắt buộc — vì thế KHÔNG xoá report_value, chỉ đổi trạng thái + nguồn của
    chính báo cáo đó. Chỉ đổi khi report.source vẫn còn "seed" (insert-if-
    absent tinh thần chung của seed_all): nếu đã là "live" — do chính hàm
    này chạy lần trước, hoặc do người dùng thật đã thao tác — thì bỏ qua,
    không ghi đè tiến độ demo/live đang có.
    """
    donvi_22 = (
        db.query(OrgUnit).filter_by(is_reporting=True).order_by(OrgUnit.id).all()
    )[21]  # thứ 22, 0-based index 21
    ky_08 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-08").one()
    bc = db.query(Report).filter_by(
        template_id=tpl.id, org_unit_id=donvi_22.id, period_id=ky_08.id
    ).one_or_none()
    if bc is None or bc.source != "seed":
        return
    draft = db.query(WorkflowState).filter_by(template_id=tpl.id, code="draft").one()
    bc.state_id = draft.id
    bc.source = "live"
    bc.decided_at = None
    bc.decided_by = None
    bc.submitted_at = None
    bc.first_submitted_at = None
    bc.is_late = False
    db.flush()


def seed_all(db) -> LoadResult:
    """Trả NGUYÊN kết quả của `load_fixture` lên cho người gọi.

    Trước đây hàm này vứt thẳng giá trị trả về: `LoadResult` mang đủ
    `created_reports`, `skipped`, `warnings` mà không ai nhận, nên
    `scripts/reset_demo.py` chỉ nói được "xong" — không nói được đã nạp gì.
    """
    _seed_org(db)
    _seed_rbac(db)
    _seed_users(db)
    tpl = _seed_template(db)
    _seed_workflow(db, tpl)
    _seed_periods(db, tpl)
    kq = load_fixture(db, tpl)
    _nhap_don_vi_22(db, tpl)
    db.commit()
    return kq


def export_catalog_json(db, path: str) -> None:
    """Xuất fm01-catalog.json — hợp đồng chung BE ↔ FE (Task 16 đọc chính nó)."""
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    sections = (
        db.query(TemplateSection).filter_by(template_id=tpl.id)
        .order_by(TemplateSection.sort_order).all()
    )
    ma_section_theo_id = {s.id: s.code for s in sections}
    # Indicator.sort_order chỉ duy nhất TRONG TỪNG section (reset về 1 ở mỗi
    # nhóm) — sắp toàn cục theo mỗi mình nó làm các nhóm trộn vào nhau. Phải
    # sắp theo section trước (TemplateSection.sort_order), rồi mới tới
    # Indicator.sort_order.
    section_sort_theo_id = {s.id: s.sort_order for s in sections}
    indicators = sorted(
        db.query(Indicator).filter_by(template_id=tpl.id, active=True).all(),
        key=lambda i: (section_sort_theo_id[i.section_id], i.sort_order),
    )
    text_fields = (
        db.query(TemplateTextField).filter_by(template_id=tpl.id)
        .order_by(TemplateTextField.sort_order).all()
    )

    du_lieu = {
        "template": tpl.code,
        "sections": [
            {"code": s.code, "name_vi": s.name_vi, "name_en": s.name_en,
             "sort_order": s.sort_order}
            for s in sections
        ],
        "indicators": [
            {
                "code": i.code,
                "section_code": ma_section_theo_id[i.section_id],
                "name_vi": i.name_vi,
                "name_en": i.name_en,
                "unit": i.unit,
                "agg_type": i.agg_type,
                "formula": i.formula,
                "decimals": i.decimals,
                "required": i.required,
                "sort_order": i.sort_order,
            }
            for i in indicators
        ],
        "text_fields": [
            {"code": t.code, "label_vi": t.label_vi, "sort_order": t.sort_order}
            for t in text_fields
        ],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(du_lieu, f, ensure_ascii=False, indent=2)
