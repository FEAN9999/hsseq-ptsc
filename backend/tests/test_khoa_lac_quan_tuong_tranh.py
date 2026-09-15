# backend/tests/test_khoa_lac_quan_tuong_tranh.py
"""Khoá lạc quan phải còn hiệu lực khi hai request CHỒNG THỜI GIAN.

KHÔNG dùng fixture `db`/`client` của conftest, có chủ ý — cùng lý do với
tests/test_get_db_commit.py, và đây là lần thứ hai trong dự án harness test
che một ràng buộc thật.

`conftest.py` đưa MỘT session duy nhất cho cả `db` lẫn `client`, nên mọi
request trong một test dùng CHUNG identity map và chung transaction: không
có cách nào dựng hai request chồng nhau bằng fixture đó. Kịch bản tuần tự
(request thứ hai bắt đầu SAU KHI request thứ nhất xong) — thứ mà
`test_409_khi_version_lech` và `test_put_values.py::test_version_cu_tra_409_
kem_gia_tri_moi` đo — thì ĐÚNG cả khi bug còn nguyên. Bug chỉ lộ ra khi
request thứ hai đã NẠP báo cáo vào session của nó TRƯỚC lúc request thứ nhất
ghi xong, đúng hình dạng mà dependency kiểm quyền của cả hai endpoint tạo ra
(`_kiem_quyen_ghi` / `_kiem_quyen_chuyen_trang_thai`, app/api/reports.py,
đọc `Report` để lấy `org_unit_id`).

Nên test ở đây dựng đúng hình dạng thật: hai `SessionLocal()` RIÊNG (một
session mỗi request, như `get_db()`), cả hai nạp `Report` trước, A ghi và
COMMIT, rồi B mới chạy. Không cần luồng: cửa sổ phơi nhiễm là "B đọc trước,
A commit trước, B ghi sau", tái lập được tuần tự.

Không cần luồng cũng đồng nghĩa dữ liệu phải là dữ liệu THẬT trên đĩa (hai
session hai kết nối, không chia nhau được transaction của fixture). Bộ dữ
liệu tối thiểu dưới đây tự dựng và tự dọn, mã đều mang tiền tố `ZZ-TT` để
lệnh dọn không bao giờ chạm dữ liệu của test khác.

MỘT CÁI BẪY đã vấp phải khi viết test này, ghi lại để đừng ai "dọn cho gọn":
identity map của SQLAlchemy giữ WEAK reference. Viết bước nạp trước thành
`assert b.query(Report).filter_by(id=rid).one().version == 1` (vứt ngay kết
quả) thì đối tượng bị thu gom trước lời gọi sau, lần query kế nạp lại bản
MỚI từ DB, và test XANH cả khi bỏ `.populate_existing()` — xanh vì một lý do
chẳng liên quan gì tới thứ đang kiểm. Phải giữ tham chiếu (`nap_truoc_b`)
suốt kịch bản. Đường thật giữ y như vậy: `_kiem_quyen_ghi` trả THẲNG đối
tượng `Report` vào tham số của route `PUT /values`, nên nó sống suốt request.
"""
import threading
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from app.api.deps import CurrentUser
from app.core.db import SessionLocal, engine
from app.core.errors import ConflictError
from app.models import (
    AppUser,
    AuditLog,
    Indicator,
    OrgUnit,
    Permission,
    Report,
    ReportingPeriod,
    ReportTemplate,
    ReportValue,
    TemplateSection,
    WorkflowState,
    WorkflowTransition,
)
from app.schemas.report import ValueIn
from app.services.reports import ghi_gia_tri
from app.services.workflow import apply_transition

VN = ZoneInfo("Asia/Ho_Chi_Minh")

MA_TPL = "ZZ-TT"
MA_DV = "ZZ-TT-DV"
EMAIL = "zz-tt@ptsc.local"
MA_QUYEN = "zz.tt.chuyen"
MA_CHI_TIEU = "B-1.1"

# Xoá theo đúng thứ tự khoá ngoại, chỉ chạm dòng mang mã ZZ-TT. Chạy cả TRƯỚC
# lẫn SAU test (như `_don()` của test_get_db_commit.py): một lần chạy bị giết
# giữa chừng không được làm lần sau đỏ khó hiểu.
_SQL_DON = """
DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM app_user WHERE email = :email);
DELETE FROM report_value WHERE report_id IN (
    SELECT r.id FROM report r JOIN report_template t ON t.id = r.template_id WHERE t.code = :tpl);
DELETE FROM report WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl);
DELETE FROM opening_balance WHERE period_id IN (
    SELECT id FROM reporting_period
     WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl));
DELETE FROM reporting_period WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl);
DELETE FROM workflow_transition WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl);
DELETE FROM workflow_state WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl);
DELETE FROM indicator WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl);
DELETE FROM template_section WHERE template_id IN (SELECT id FROM report_template WHERE code = :tpl);
DELETE FROM report_template WHERE code = :tpl;
DELETE FROM app_user WHERE email = :email;
DELETE FROM permission WHERE code = :quyen;
DELETE FROM org_unit WHERE code = :dv;
"""


def _don() -> None:
    with engine.begin() as c:
        for cau in _SQL_DON.strip().split(";\n"):
            if cau.strip():
                c.execute(text(cau), {"tpl": MA_TPL, "email": EMAIL,
                                      "quyen": MA_QUYEN, "dv": MA_DV})


@pytest.fixture()
def du_lieu():
    """Bộ dữ liệu tối thiểu, COMMIT thật xuống `hseq_test`, tự dọn ở cuối.

    `is_reporting=False` trên đơn vị là bắt buộc, không phải mặc định cho
    tiện: tests/api/test_seed.py khẳng định đúng 22 đơn vị `is_reporting=True`.
    """
    _don()
    s = SessionLocal()
    try:
        dv = OrgUnit(code=MA_DV, name="Đơn vị thử tương tranh", type="member_unit",
                     is_reporting=False, active=True)
        quyen = Permission(code=MA_QUYEN)
        s.add_all([dv, quyen])
        s.flush()

        nguoi = AppUser(email=EMAIL, full_name="Người thử tương tranh", position=None,
                        password_hash="khong-dung-de-dang-nhap", org_unit_id=dv.id, active=True)
        tpl = ReportTemplate(code=MA_TPL, name_vi="Mẫu thử tương tranh", name_en=None,
                             period_type="month", version=1, active=True)
        s.add_all([nguoi, tpl])
        s.flush()

        muc = TemplateSection(template_id=tpl.id, code="B-1", name_vi="Nhóm thử", sort_order=1)
        s.add(muc)
        s.flush()
        s.add(Indicator(template_id=tpl.id, section_id=muc.id, code=MA_CHI_TIEU,
                        name_vi="Chỉ tiêu thử", unit="Giờ", agg_type="sum", formula=None,
                        reset_rule="none", decimals=2, required=True, sort_order=1, active=True))

        trang_thai = {}
        for code, editable, initial, tong in (("draft", True, True, False),
                                              ("submitted", False, False, False),
                                              ("returned", True, False, False),
                                              ("approved", False, False, True)):
            st = WorkflowState(template_id=tpl.id, code=code, name_vi=code, is_initial=initial,
                               is_terminal=False, is_editable=editable, counts_in_totals=tong,
                               sort_order=1)
            s.add(st)
            trang_thai[code] = st
        s.flush()

        for action, tu, den, can_ghi_chu in (("approve", "submitted", "approved", False),
                                             ("return", "submitted", "returned", True)):
            s.add(WorkflowTransition(
                template_id=tpl.id, from_state_id=trang_thai[tu].id,
                to_state_id=trang_thai[den].id, action_code=action, name_vi=action,
                required_permission_id=quyen.id, requires_note=can_ghi_chu))

        # hai kỳ: UNIQUE(template_id, org_unit_id, period_id) không cho hai báo
        # cáo của cùng một đơn vị nằm chung một kỳ
        ky08 = ReportingPeriod(template_id=tpl.id, period_key="2026-08",
                               start_date=date(2026, 8, 1), end_date=date(2026, 8, 31),
                               due_at=datetime(2026, 9, 5, 17, 0, tzinfo=VN), is_open=True)
        ky09 = ReportingPeriod(template_id=tpl.id, period_key="2026-09",
                               start_date=date(2026, 9, 1), end_date=date(2026, 9, 30),
                               due_at=datetime(2026, 10, 5, 17, 0, tzinfo=VN), is_open=True)
        s.add_all([ky08, ky09])
        s.flush()

        # hai báo cáo riêng: một để thử `apply_transition` (đã nộp), một để thử
        # `ghi_gia_tri` (nháp — `is_editable` phải đúng, nếu không 403 thắng trước 409)
        bc_nop = Report(template_id=tpl.id, org_unit_id=dv.id, period_id=ky08.id,
                        state_id=trang_thai["submitted"].id, version=1, source="live",
                        created_by=nguoi.id)
        bc_nhap = Report(template_id=tpl.id, org_unit_id=dv.id, period_id=ky09.id,
                         state_id=trang_thai["draft"].id, version=1, source="live",
                         created_by=nguoi.id)
        s.add_all([bc_nop, bc_nhap])
        s.flush()

        s.commit()
        yield {
            "id_nop": bc_nop.id,
            "id_nhap": bc_nhap.id,
            "actor": CurrentUser(
                id=nguoi.id, org_unit_id=dv.id,
                permissions={MA_QUYEN, "report.view_all"},
                scope={MA_QUYEN: None, "report.view_all": None},
            ),
        }
    finally:
        s.close()
        _don()


def _ma_trang_thai(s, r: Report) -> str:
    return s.query(WorkflowState.code).filter_by(id=r.state_id).scalar()


def test_apply_transition_409_khi_request_kia_vua_ghi_xong(du_lieu):
    """Trưởng Ban bấm "Duyệt", chuyên viên bấm "Trả lại" gần như cùng lúc.

    Lượt thứ hai PHẢI nhận 409 "Người khác vừa sửa báo cáo này" kèm trạng
    thái + version MỚI. Bỏ `.populate_existing()` ở app/services/workflow.py
    thì lượt thứ hai cũng nhận 200: lượt duyệt biến mất không dấu vết,
    `version` chỉ tăng 1 cho hai lượt ghi, và `/history` kể hai dòng cùng
    xuất phát từ `submitted/v1` — lịch sử nói dối.
    """
    rid, actor = du_lieu["id_nop"], du_lieu["actor"]
    a, b = SessionLocal(), SessionLocal()
    try:
        # dependency kiểm quyền của CẢ HAI request đọc `Report` trước khi route
        # chạy (app/api/reports.py:_kiem_quyen_chuyen_trang_thai) — đây là bước
        # đưa đối tượng CŨ vào identity map, tức nguồn của bug.
        # PHẢI giữ lại tham chiếu (`nap_truoc_*`), không được vứt ngay kết quả
        # query: identity map của SQLAlchemy giữ WEAK reference, nên đối tượng
        # không ai trỏ tới bị thu gom ngay và lần query sau nạp lại bản mới —
        # bug biến mất vì lý do chẳng liên quan gì tới bản vá. Đường thật giữ
        # tham chiếu suốt request (`_kiem_quyen_ghi` trả thẳng `Report` vào
        # tham số route), nên đây mới là hình dạng đúng.
        nap_truoc_a = a.query(Report).filter_by(id=rid).one()
        nap_truoc_b = b.query(Report).filter_by(id=rid).one()
        assert (nap_truoc_a.version, nap_truoc_b.version) == (1, 1)

        r = apply_transition(a, rid, "approve", None, "submitted", 1, actor)
        assert (r.version, _ma_trang_thai(a, r)) == (2, "approved")
        a.commit()

        with pytest.raises(ConflictError) as loi:
            apply_transition(b, rid, "return", "Thiếu số B-8", "submitted", 1, actor)
        assert loi.value.detail == "Người khác vừa sửa báo cáo này"
        assert loi.value.extra == {"state": "approved", "version": 2}
        assert nap_truoc_b.version == 2, "câu FOR UPDATE phải ghi đè bản cũ trong identity map"
        b.rollback()
    finally:
        a.close()
        b.close()

    with SessionLocal() as s:
        r = s.query(Report).filter_by(id=rid).one()
        assert (r.version, _ma_trang_thai(s, r)) == (2, "approved"), \
            "lượt duyệt bị lượt trả lại nuốt mất"
        assert [(d.action, d.before_json["version"], d.after_json["version"])
                for d in s.query(AuditLog).filter_by(entity="report", entity_id=rid)
                          .order_by(AuditLog.id).all()] == [("approve", 1, 2)], \
            "audit phải có đúng MỘT dòng — lượt bị từ chối không được ghi"


def test_ghi_gia_tri_409_khi_request_kia_vua_ghi_xong(du_lieu):
    """Chính sách "lưu khi rời ô" (D23) bắn hai `PUT /values` sát nhau.

    Lượt thứ hai PHẢI nhận 409 chứ không được ghi đè số của lượt thứ nhất.
    Bỏ `.populate_existing()` ở app/services/reports.py thì cả hai nhận 200
    và số nhập sau đè lên số nhập trước, không ai biết.
    """
    rid, actor = du_lieu["id_nhap"], du_lieu["actor"]
    a, b = SessionLocal(), SessionLocal()
    try:
        # `_kiem_quyen_ghi` (app/api/reports.py) nạp `Report` trước khi route chạy
        # rồi TRẢ THẲNG đối tượng đó vào tham số route, nên nó sống suốt request —
        # phải giữ tham chiếu ở đây mới đúng hình dạng (xem test trên)
        nap_truoc_a = a.query(Report).filter_by(id=rid).one()
        nap_truoc_b = b.query(Report).filter_by(id=rid).one()
        assert (nap_truoc_a.version, nap_truoc_b.version) == (1, 1)

        v, _ = ghi_gia_tri(
            a, rid, 1, [ValueIn(indicator_code=MA_CHI_TIEU, this_period=Decimal("10"))], actor)
        assert v == 2
        a.commit()

        with pytest.raises(ConflictError) as loi:
            ghi_gia_tri(
                b, rid, 1, [ValueIn(indicator_code=MA_CHI_TIEU, this_period=Decimal("99"))], actor)
        assert loi.value.detail == "Người khác vừa sửa báo cáo này"
        assert (loi.value.extra["state"], loi.value.extra["version"]) == ("draft", 2)
        assert nap_truoc_b.version == 2, "câu FOR UPDATE phải ghi đè bản cũ trong identity map"
        b.rollback()
    finally:
        a.close()
        b.close()

    with SessionLocal() as s:
        assert s.query(Report).filter_by(id=rid).one().version == 2
        dong = s.query(ReportValue).filter_by(report_id=rid).one()
        assert dong.this_period == Decimal("10.00"), "số của lượt ghi thứ nhất bị đè mất"


# ---------------------------------------------------------------------------
# HAI LUỒNG THẬT — phần này canh `FOR UPDATE`, không phải `populate_existing`
#
# Hai ca tuần tự ở trên (A commit xong B mới đọc) canh được `.populate_existing()`
# nhưng KHÔNG hỏi tới `.with_for_update()`: bỏ hẳn `FOR UPDATE` thì cả 305 ca vẫn
# XANH (final-review-R1-report.md §5, M6-FULL và M24-FULL). Cảnh duy nhất phân
# biệt được là hai transaction ĐỌC TRƯỚC KHI bên nào kịp GHI — không dựng được
# nếu không có luồng thật.
# ---------------------------------------------------------------------------


def _hai_luong_chong_thoi_gian(rid: int, viec_a, viec_b):
    """Hai luồng, hai session, hai transaction, cùng nạp `Report` rồi cùng ghi.

    Mỗi luồng nạp `Report` TRƯỚC cổng chắn — đúng như dependency kiểm quyền của
    route làm (`_kiem_quyen_ghi` / `_kiem_quyen_chuyen_trang_thai`,
    app/api/reports.py) — và giữ tham chiếu suốt lượt chạy, vì identity map của
    SQLAlchemy dùng WEAK reference (xem bẫy đã ghi ở docstring module).

    `threading.Barrier` là đủ, KHÔNG cần `sleep`: bên trong
    `ghi_gia_tri`/`apply_transition`, quãng từ lượt ĐỌC `Report` tới lúc COMMIT
    còn vài query nữa (WorkflowState, Indicator, ReportValue…) nên dài hàng
    mili-giây, trong khi barrier nhả hai luồng lệch nhau cỡ micro-giây.

    Trả về `(ket_a, ket_b)`, mỗi cái là `("ok", giá trị viec trả về)` hoặc
    `("loi", ngoại lệ)`. COMMIT hỏng cũng tính là thua.
    """
    cong = threading.Barrier(2)
    ket: dict[str, tuple] = {}

    def _chay(ten, viec):
        s = SessionLocal()
        try:
            nap_truoc = s.query(Report).filter_by(id=rid).one()
            cong.wait(timeout=20)
            gia_tri = viec(s)
            s.commit()
            assert nap_truoc.id == rid          # giữ tham chiếu sống tới hết lượt
            ket[ten] = ("ok", gia_tri)
        except BaseException as loi:            # noqa: BLE001 — test tự phân loại lỗi
            s.rollback()
            ket[ten] = ("loi", loi)
        finally:
            s.close()

    luong = [threading.Thread(target=_chay, args=("a", viec_a)),
             threading.Thread(target=_chay, args=("b", viec_b))]
    for t in luong:
        t.start()
    for t in luong:
        t.join(timeout=30)
        assert not t.is_alive(), "luồng treo — nhiều khả năng kẹt ở FOR UPDATE"
    return ket["a"], ket["b"]


def _phan_loai(ket_a, ket_b):
    thang = [k[1] for k in (ket_a, ket_b) if k[0] == "ok"]
    thua = [k[1] for k in (ket_a, ket_b) if k[0] == "loi"]
    return thang, thua


def test_ghi_gia_tri_hai_luong_chi_mot_ben_ghi_duoc(du_lieu):
    """Hai `PUT /values` chồng thời gian trên ô ĐÃ CÓ số — đường UPDATE.

    Chính sách "lưu khi rời ô" (`DO_TRE = 1500 ms`, D23) làm cảnh này là
    chuyện thường ngày, không cần hai người. Bỏ `.with_for_update()` ở
    `app/services/reports.py::ghi_gia_tri`: cả hai luồng đọc `version` cùng một
    mốc, cả hai qua phép so, **cả hai nhận 200** — và số của người ghi TRƯỚC
    biến mất, không 409, không cảnh báo, không cách nào biết.
    """
    rid, actor = du_lieu["id_nhap"], du_lieu["actor"]

    with SessionLocal() as s:                       # dựng sẵn ô có dữ liệu
        ghi_gia_tri(s, rid, 1,
                    [ValueIn(indicator_code=MA_CHI_TIEU, this_period=Decimal("5"))], actor)
        s.commit()

    def _put(so):
        def _viec(s):
            ghi_gia_tri(s, rid, 2,
                        [ValueIn(indicator_code=MA_CHI_TIEU, this_period=Decimal(so))], actor)
            return so
        return _viec

    thang, thua = _phan_loai(*_hai_luong_chong_thoi_gian(rid, _put("111"), _put("222")))

    assert len(thang) == 1, f"CẢ HAI lượt PUT cùng được ghi — số của lượt trước mất trắng: {thang}"
    assert isinstance(thua[0], ConflictError), f"lượt thua phải là 409, đang là {thua[0]!r}"
    assert thua[0].detail == "Người khác vừa sửa báo cáo này"

    with SessionLocal() as s:
        assert s.query(Report).filter_by(id=rid).one().version == 3
        assert s.query(ReportValue).filter_by(report_id=rid).one().this_period == \
            Decimal(thang[0]), "số đang lưu không phải của lượt ghi thắng"


def test_ghi_gia_tri_hai_luong_o_trong_khong_no_500(du_lieu):
    """Cùng cảnh nhưng ô CHƯA CÓ dòng nào — đường INSERT, hỏng theo kiểu khác.

    Bỏ `.with_for_update()`: hai luồng cùng không thấy dòng nào, cùng INSERT,
    lượt sau đụng `UNIQUE(report_id, indicator_id)` ⇒ `IntegrityError`. Không
    ai bắt ngoại lệ đó ⇒ **500 trần**, vi phạm ràng buộc "mọi câu lỗi hướng
    tới người dùng đều bằng tiếng Việt". Lượt thua PHẢI là `ConflictError`.
    """
    rid, actor = du_lieu["id_nhap"], du_lieu["actor"]

    def _put(so):
        def _viec(s):
            ghi_gia_tri(s, rid, 1,
                        [ValueIn(indicator_code=MA_CHI_TIEU, this_period=Decimal(so))], actor)
            return so
        return _viec

    thang, thua = _phan_loai(*_hai_luong_chong_thoi_gian(rid, _put("111"), _put("222")))

    assert len(thang) == 1, f"CẢ HAI lượt PUT cùng được ghi: {thang}"
    assert isinstance(thua[0], ConflictError), \
        f"lượt thua phải là 409 tiếng Việt, đang là {type(thua[0]).__name__}: {thua[0]!r}"
    assert thua[0].detail == "Người khác vừa sửa báo cáo này"

    with SessionLocal() as s:
        assert s.query(ReportValue).filter_by(report_id=rid).count() == 1
