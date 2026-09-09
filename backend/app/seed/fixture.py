# backend/app/seed/fixture.py
"""Loader CSV số thật. Một transaction: sai một dòng thì không nạp dòng nào.

gstack-shortcut(dec-8896ec11): fixture 3 tháng chép tay thay cho import;
upgrade when cần > 3 tháng lịch sử hoặc bỏ sheet → import lite (TODOS.md)

Quyết định riêng của module này (không có trong brief gốc, xem task-7-report.md
mục "quyết định" để biết lý do đầy đủ):

- Đường dẫn file: ưu tiên tham số `path`, sau đó biến môi trường `FIXTURE_CSV`
  (test trỏ sang `tests/fixtures/full_synthetic.csv`), mặc định `MAC_DINH`
  (file thật, dán số tuần 2).
- sha256 theo dõi RIÊNG cho từng `report_template` (không theo path) — một
  mẫu chỉ có một "phiên bản fixture đang nạp" tại một thời điểm.
- Dòng chỉ tiêu `computed` (VD "Tổng giờ công") xuất hiện trong CSV thì BỎ
  QUA (đếm vào `LoadResult.skipped`), không phải lỗi: matrix agg_type quy
  định "computed không lưu", và biết đâu file Ban ATCL export nguyên cột đó
  từ Excel — bắt lỗi cả file vì một cột dư là quá khắt khe.
- Dòng CSV trùng khoá (org_code, period, indicator_code) VẪN là lỗi cứng —
  khác với dòng computed, một ô số trùng mà im lặng chọn đại một giá trị là
  rủi ro dữ liệu thật, không phải chuyện vô hại.
"""
import csv
import hashlib
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

from app.domain.report_rules import qua_thap_phan

log = logging.getLogger(__name__)
VN = ZoneInfo("Asia/Ho_Chi_Minh")
MAC_DINH = Path(__file__).parent / "fixtures" / "fm01_2026-06_2026-08.csv"

_COT_BAT_BUOC = {"org_code", "period", "indicator_code", "this_period", "acc_prev", "acc_total"}


class FixtureError(Exception):
    def __init__(self, loi: list[str]):
        self.loi = loi
        super().__init__("Fixture không hợp lệ:\n" + "\n".join(f"  - {l}" for l in loi))


@dataclass
class LoadResult:
    created_reports: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)


@dataclass
class _Dong:
    """Một dòng CSV đã đỗ kiểm tra cấu trúc (org/kỳ/chỉ tiêu/số đều hợp lệ)."""
    so_dong: int
    org_code: str
    org_id: int
    period_key: str
    period_id: int
    period_start: date
    indicator_code: str
    indicator_id: int
    agg_type: str
    decimals: int
    this_period: Decimal
    acc_prev: Decimal
    acc_total: Decimal
    note: str | None


def load_fixture(db, tpl, path: str | None = None) -> LoadResult:
    p = Path(path) if path else Path(os.environ.get("FIXTURE_CSV", MAC_DINH))
    if not p.exists():
        return LoadResult(warnings=[f"không có file fixture {p}, bỏ qua"])

    raw = p.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    kq = LoadResult()

    sha_cu = _sha_da_nap(db, tpl)
    if sha_cu and sha_cu != sha:
        canh_bao = (f"fixture đã đổi (sha256 {sha_cu[:8]} → {sha[:8]}); "
                    f"chạy scripts/reset_demo.py --yes để nạp lại")
        log.warning("=" * 70 + "\n" + canh_bao + "\n" + "=" * 70)
        kq.warnings.append(canh_bao)
        return kq
    if sha_cu == sha:
        kq.warnings.append("fixture không đổi, bỏ qua")
        return kq

    rows, loi, so_bo_qua = _doc_va_kiem(db, tpl, p)
    loi += _assert_luy_ke(rows)
    if loi:
        raise FixtureError(loi)          # chưa ghi gì → không nạp nửa chừng

    kq.created_reports = _ghi(db, tpl, rows)
    kq.skipped = so_bo_qua
    _ghi_audit_sha(db, tpl, sha)
    return kq


def _doc_va_kiem(db, tpl, p: Path) -> tuple[list[_Dong], list[str], int]:
    """Đọc CSV, gom TOÀN BỘ lỗi cấu trúc (không dừng ở lỗi đầu tiên).

    Bắt: org_code lạ, indicator_code lạ, period lạ, số sai định dạng, số âm,
    số quá thập phân khai báo của chỉ tiêu, dòng trùng khoá (org,period,
    indicator), và số dư (acc_prev khởi đầu của một cặp org+chỉ tiêu) rơi vào
    kỳ không phải kỳ đầu của fixture — trường hợp đó không có chỗ lưu hợp lệ
    vì opening_balance chỉ sinh ở kỳ đầu.
    """
    from app.models import Indicator, OrgUnit, ReportingPeriod

    orgs = {o.code: o for o in db.query(OrgUnit).filter_by(is_reporting=True).all()}
    inds = {i.code: i for i in db.query(Indicator).filter_by(template_id=tpl.id, active=True).all()}
    periods = {pr.period_key: pr for pr in db.query(ReportingPeriod).filter_by(template_id=tpl.id).all()}

    loi: list[str] = []
    rows: list[_Dong] = []
    so_bo_qua = 0

    with p.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        thieu_cot = _COT_BAT_BUOC - set(reader.fieldnames or [])
        if thieu_cot:
            loi.append(f"thiếu cột bắt buộc trong CSV: {sorted(thieu_cot)}")
            return rows, loi, so_bo_qua

        for so_dong, r in enumerate(reader, start=2):  # dòng 1 là header
            org_code = (r.get("org_code") or "").strip()
            period_key = (r.get("period") or "").strip()
            indicator_code = (r.get("indicator_code") or "").strip()
            note = (r.get("note") or "").strip() or None

            org = orgs.get(org_code)
            if org is None:
                loi.append(f"dòng {so_dong}: đơn vị '{org_code}' không có trong seed")
                continue
            period = periods.get(period_key)
            if period is None:
                loi.append(f"dòng {so_dong}: kỳ '{period_key}' không có trong seed")
                continue
            ind = inds.get(indicator_code)
            if ind is None:
                loi.append(f"dòng {so_dong}: chỉ tiêu '{indicator_code}' không có trong danh mục")
                continue
            if ind.agg_type == "computed":
                # tự tính, không lưu — coi như cột dư trong file nguồn, không phải lỗi
                so_bo_qua += 1
                continue

            try:
                this_period = Decimal((r.get("this_period") or "").strip())
                acc_prev = Decimal((r.get("acc_prev") or "").strip())
                acc_total = Decimal((r.get("acc_total") or "").strip())
            except InvalidOperation:
                loi.append(
                    f"dòng {so_dong} ({org_code},{period_key},{indicator_code}): số sai định dạng"
                )
                continue

            co_loi_so = False
            for ten_cot, gia_tri in (
                ("this_period", this_period), ("acc_prev", acc_prev), ("acc_total", acc_total),
            ):
                if gia_tri < 0:
                    loi.append(
                        f"dòng {so_dong} ({org_code},{period_key},{indicator_code}): "
                        f"{ten_cot} = {gia_tri} không được âm"
                    )
                    co_loi_so = True
                elif qua_thap_phan(gia_tri, ind.decimals):
                    loi.append(
                        f"dòng {so_dong} ({org_code},{period_key},{indicator_code}): "
                        f"{ten_cot} = {gia_tri} quá {ind.decimals} chữ số thập phân"
                    )
                    co_loi_so = True
            if co_loi_so:
                continue

            rows.append(_Dong(
                so_dong=so_dong, org_code=org_code, org_id=org.id,
                period_key=period_key, period_id=period.id, period_start=period.start_date,
                indicator_code=indicator_code, indicator_id=ind.id, agg_type=ind.agg_type,
                decimals=ind.decimals,
                this_period=this_period, acc_prev=acc_prev, acc_total=acc_total, note=note,
            ))

    da_thay: dict[tuple[str, str, str], int] = {}
    for d in rows:
        khoa = (d.org_code, d.period_key, d.indicator_code)
        if khoa in da_thay:
            loi.append(
                f"dòng {d.so_dong}: trùng dòng {da_thay[khoa]} "
                f"({d.org_code},{d.period_key},{d.indicator_code})"
            )
        else:
            da_thay[khoa] = d.so_dong

    if rows:
        ky_dau_start = min(d.period_start for d in rows)
        moc_dau_theo_cap: dict[tuple[str, str], date] = {}
        for d in rows:
            khoa = (d.org_code, d.indicator_code)
            if khoa not in moc_dau_theo_cap or d.period_start < moc_dau_theo_cap[khoa]:
                moc_dau_theo_cap[khoa] = d.period_start
        for (org_code, indicator_code), moc in moc_dau_theo_cap.items():
            if moc != ky_dau_start:
                loi.append(
                    f"{org_code},{indicator_code}: số dư khởi đầu rơi vào kỳ không phải kỳ đầu "
                    f"của fixture (bắt đầu {moc}, kỳ đầu fixture {ky_dau_start})"
                )

    return rows, loi, so_bo_qua


def _assert_luy_ke(rows: list[_Dong]) -> list[str]:
    """dòng `sum`: acc_prev + this_period phải bằng acc_total của CHÍNH dòng đó.

    Mọi dòng (`sum` lẫn `counter`) từ kỳ thứ hai trở đi: acc_prev phải khớp
    acc_total của kỳ liền trước — CHỈ kiểm liên tục, không áp công thức cộng
    cho `counter` vì bộ đếm được phép reset (LTI / đầu năm / đầu dự án).
    """
    loi: list[str] = []
    theo_nhom: dict[tuple[str, str], list[_Dong]] = {}
    for d in rows:
        theo_nhom.setdefault((d.org_code, d.indicator_code), []).append(d)

    for (org_code, indicator_code), nhom in theo_nhom.items():
        nhom.sort(key=lambda d: d.period_start)
        truoc: _Dong | None = None
        for d in nhom:
            if d.agg_type == "sum" and d.acc_prev + d.this_period != d.acc_total:
                loi.append(
                    f"{org_code},{indicator_code},{d.period_key}: lệch lũy kế "
                    f"(acc_prev {d.acc_prev} + this_period {d.this_period} "
                    f"≠ acc_total {d.acc_total})"
                )
            if truoc is not None and d.acc_prev != truoc.acc_total:
                loi.append(
                    f"{org_code},{indicator_code},{d.period_key}: acc_prev ({d.acc_prev}) "
                    f"không khớp acc_total kỳ trước {truoc.period_key} ({truoc.acc_total})"
                )
            truoc = d
    return loi


def _moc_17h_ngay_5_thang_sau(period_key: str) -> datetime:
    """17:00 ngày 05 tháng SAU kỳ báo cáo, giờ Việt Nam — mốc quyết định/nộp giả định
    cho toàn bộ dữ liệu nạp từ fixture (spec Step 4 của brief)."""
    nam, thang = (int(x) for x in period_key.split("-"))
    nam_sau, thang_sau = (nam + 1, 1) if thang == 12 else (nam, thang + 1)
    return datetime(nam_sau, thang_sau, 5, 17, 0, 0, tzinfo=VN)


def _admin(db):
    from app.models import AppUser, Role, UserRole
    return (
        db.query(AppUser)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(Role.code == "admin_atcl", UserRole.scope_org_unit_id.is_(None))
        .one()
    )


def _nguoi_nhap_theo_org(db) -> dict[int, int]:
    """org_unit_id -> id tài khoản người nhập (reporter) của đúng đơn vị đó."""
    from app.models import AppUser, Role, UserRole
    hang = (
        db.query(UserRole.scope_org_unit_id, AppUser.id)
        .join(AppUser, AppUser.id == UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(Role.code == "reporter")
        .all()
    )
    return {org_id: user_id for org_id, user_id in hang}


def _quantize(v: Decimal, decimals: int) -> Decimal:
    """Chuẩn hoá `v` về đúng `decimals` chữ số thập phân trước khi lưu.

    CSV kiểu Excel ghi "3.00" cho chỉ tiêu decimals=0; lưu vào report_value
    phải là "3", không phải "3.00" — đường CSV làm giống đường API PUT
    /reports/{id}/values ("server quantize theo indicator.decimals", spec
    dòng 231 docs/designs/hseq-platform-mvp-fm01.md). Gọi sau khi đã qua
    `qua_thap_phan()` nên không bao giờ làm tròn mất số có nghĩa — chỉ đổi
    hình dạng exponent.
    """
    return v.quantize(Decimal(1).scaleb(-decimals))


def _ghi(db, tpl, rows: list[_Dong]) -> int:
    from app.models import AuditLog, OpeningBalance, Report, ReportValue, WorkflowState

    if not rows:
        return 0

    approved = db.query(WorkflowState).filter_by(template_id=tpl.id, code="approved").one()
    admin = _admin(db)
    nguoi_nhap_theo_org = _nguoi_nhap_theo_org(db)
    ky_dau_start = min(d.period_start for d in rows)

    theo_bao_cao: dict[tuple[str, str], list[_Dong]] = {}
    for d in rows:
        theo_bao_cao.setdefault((d.org_code, d.period_key), []).append(d)

    bao_cao_moi: list[tuple[Report, list[_Dong]]] = []
    for (org_code, period_key), nhom in theo_bao_cao.items():
        org_id = nhom[0].org_id
        moc = _moc_17h_ngay_5_thang_sau(period_key)
        report = Report(
            template_id=tpl.id, org_unit_id=org_id, period_id=nhom[0].period_id,
            state_id=approved.id, version=1, source="seed",
            first_submitted_at=moc, submitted_at=moc, decided_at=moc,
            decided_by=admin.id, is_late=False,
            created_by=nguoi_nhap_theo_org[org_id],
        )
        db.add(report)
        bao_cao_moi.append((report, nhom))

    db.flush()  # cần report.id trước khi ghi report_value / audit_log

    for report, nhom in bao_cao_moi:
        for d in nhom:
            this_period = _quantize(d.this_period, d.decimals)
            acc_prev = _quantize(d.acc_prev, d.decimals)
            acc_total = _quantize(d.acc_total, d.decimals)
            db.add(ReportValue(
                report_id=report.id, indicator_id=d.indicator_id,
                this_period=this_period, acc_prev_entered=acc_prev,
                acc_total_entered=acc_total, note=d.note,
            ))
            if d.period_start == ky_dau_start:
                db.add(OpeningBalance(
                    org_unit_id=d.org_id, indicator_id=d.indicator_id,
                    period_id=d.period_id, value=acc_prev, source="seed",
                ))
        db.add(AuditLog(
            entity="report", entity_id=report.id, action="seed_import",
            actor_id=admin.id,
            after_json={"note": f"nạp từ file tổng hợp kỳ {nhom[0].period_key}"},
        ))

    db.flush()
    return len(bao_cao_moi)


def _ghi_audit_sha(db, tpl, sha: str) -> None:
    from app.models import AuditLog
    admin = _admin(db)
    db.add(AuditLog(
        entity="report_template", entity_id=tpl.id, action="fixture_sha",
        actor_id=admin.id, after_json={"sha256": sha},
    ))
    db.flush()


def _sha_da_nap(db, tpl) -> str | None:
    from app.models import AuditLog
    dong = (
        db.query(AuditLog)
        .filter_by(entity="report_template", entity_id=tpl.id, action="fixture_sha")
        .order_by(AuditLog.id.desc())
        .first()
    )
    return dong.after_json.get("sha256") if dong else None
