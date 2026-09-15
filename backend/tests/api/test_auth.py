# backend/tests/api/test_auth.py
"""Test `security.py`, `api/deps.py`, `api/auth.py`.

`test_rbac.py` (task-8-brief.md) đi qua HTTP `/reports` để kiểm scope — nhưng
`/reports` chưa mount tới Task 10 nên 5/6 test ở đó từng phải `xfail` (đã gỡ
hết từ Task 13, repo giờ không còn ca nào) và KHÔNG hề
chạm `current_user()`/`require_permission()`/`pham_vi_bao_cao()`: FastAPI
trả 404 ngay ở tầng routing, trước khi bất kỳ dependency nào chạy. Nếu chỉ có
test_rbac.py, mutation "require_permission trả True khi thiếu quyền" hay
"scope NULL bị bỏ qua" sẽ không có test thật nào bắt được. File này gọi thẳng
các hàm trong deps.py (không qua HTTP /reports) để lấp đúng khoảng trống đó,
cộng test cho `security.py` (băm mật khẩu, chữ ký + hạn token) và hai endpoint
`auth.py` thật sự có trong Task 8 (`/auth/login`, `/auth/me`).
"""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.api.deps import CurrentUser, current_user, pham_vi_bao_cao, require_permission
from app.core.config import settings
from app.core.errors import ForbiddenError
from app.core.security import THUAT_TOAN, bam_mat_khau, doc_token, kiem_mat_khau, tao_token
from tests.conftest import _seed_khung


@pytest.fixture()
def khung(db):
    _seed_khung(db)
    return db


def dang_nhap(client, email, mk="Demo@2026"):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": mk})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _cu(permissions, scope=None):
    return CurrentUser(id=1, org_unit_id=5, permissions=set(permissions), scope=scope or {})


# ---------------------------------------------------------------------------
# security.py: băm/kiểm mật khẩu, tạo/đọc token — test thuần, không cần DB.
# ---------------------------------------------------------------------------

def test_bam_mat_khau_khong_luu_van_ban_ro():
    bam = bam_mat_khau("Demo@2026")
    assert bam != "Demo@2026"
    assert kiem_mat_khau("Demo@2026", bam) is True
    assert kiem_mat_khau("sai-mat-khau", bam) is False


def test_tao_token_roi_doc_token_ra_dung_user_id():
    token = tao_token(908)
    assert doc_token(token) == 908


def test_token_sai_chu_ky_bi_tu_choi():
    gia = jwt.encode({"sub": "1"}, "khoa-bi-mat-khac-hoan-toan-32-ky-tu", algorithm=THUAT_TOAN)
    assert doc_token(gia) is None


def test_token_het_han_bi_tu_choi():
    het_han = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        settings.JWT_SECRET, algorithm=THUAT_TOAN,
    )
    assert doc_token(het_han) is None


# ---------------------------------------------------------------------------
# deps.py: require_permission / pham_vi_bao_cao — gọi thẳng hàm, vì chưa
# có endpoint thật nào dùng tới cho đến Task 10 (xem docstring module).
# ---------------------------------------------------------------------------

def test_require_permission_co_quyen_thi_qua():
    u = _cu({"report.view_own_unit"})
    assert require_permission("report.view_own_unit")(u) is u


def test_require_permission_khong_co_quyen_thi_403():
    u = _cu({"report.view_own_unit"})
    with pytest.raises(ForbiddenError) as loi:
        require_permission("report.approve")(u)
    assert loi.value.status_code == 403
    assert loi.value.detail == "Bạn không có quyền thực hiện thao tác này"


def test_scope_view_all_tra_ve_None():
    u = _cu({"report.view_all"}, {"report.view_all": None})
    assert pham_vi_bao_cao(u) is None


def test_scope_view_own_unit_tra_ve_dung_1_don_vi():
    u = _cu({"report.view_own_unit"}, {"report.view_own_unit": {7}})
    assert pham_vi_bao_cao(u) == {7}


def test_scope_NULL_bi_tu_choi_403_khong_mo_toan_bo():
    """Ca nguy hiểm nhất: scope NULL của reporter không bao giờ được hiểu
    thành 'không giới hạn' — phải 403, không phải None/set rỗng."""
    u = _cu({"report.view_own_unit"}, {"report.view_own_unit": None})
    with pytest.raises(ForbiddenError) as loi:
        pham_vi_bao_cao(u)
    assert loi.value.status_code == 403
    assert loi.value.detail == (
        "Tài khoản chưa được gán đơn vị. Liên hệ Ban ATCL để cấp lại quyền.")


def test_scope_khong_co_quyen_nao_thi_403():
    u = _cu(set())
    with pytest.raises(ForbiddenError) as loi:
        pham_vi_bao_cao(u)
    assert loi.value.status_code == 403


def test_co_ca_hai_quyen_thi_uu_tien_view_all_tra_ve_None():
    """Thay đổi 3 + thứ tự xét: chữ ký cũ scope_org_unit_ids(u, code) là một
    cái bẫy — cách dùng tự nhiên nhất (truyền đúng mã quyền đang gác
    endpoint, vd "report.view_own_unit") làm admin bị 403 cứng dù có
    report.view_all không giới hạn phạm vi (reviewer chạy thật xác nhận
    ca này). Hàm mới pham_vi_bao_cao(u) bỏ hẳn tham số code nên không còn
    cách nào gọi sai: quyền rộng (report.view_all) luôn được đọc trước
    quyền hẹp (report.view_own_unit) — admin có cả hai, cả hai đều không
    giới hạn phạm vi, phải được None (toàn TCT)."""
    u = _cu({"report.view_all", "report.view_own_unit"},
            {"report.view_all": None, "report.view_own_unit": None})
    assert pham_vi_bao_cao(u) is None


def test_co_ca_hai_quyen_va_view_all_bi_gioi_han_thi_dung_tap_cua_view_all():
    """Thứ tự xét (tiếp): kể cả khi view_all CŨNG bị giới hạn phạm vi, vẫn
    phải dùng đúng tập của view_all — không được rơi xuống dùng scope của
    quyền hẹp hơn (view_own_unit) dù nó tồn tại và khác tập."""
    u = _cu({"report.view_all", "report.view_own_unit"},
            {"report.view_all": {9}, "report.view_own_unit": {7}})
    assert pham_vi_bao_cao(u) == {9}


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------

def test_login_thanh_cong_tra_dung_dinh_dang_token(client, khung):
    from app.models import AppUser
    u = khung.query(AppUser).filter_by(email="admin@ptsc.local").one()
    r = client.post("/api/v1/auth/login",
                    json={"email": "admin@ptsc.local", "password": "Demo@2026"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert doc_token(body["access_token"]) == u.id


def test_login_sai_mat_khau_tra_401_dung_cau_loi(client, khung):
    r = client.post("/api/v1/auth/login",
                    json={"email": "admin@ptsc.local", "password": "sai"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Sai email hoặc mật khẩu"


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me
# ---------------------------------------------------------------------------

def test_me_khong_token_tra_401(client, khung):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert r.json()["detail"] == "Chưa đăng nhập hoặc phiên đã hết hạn"


def test_me_token_gia_mao_tra_401(client, khung):
    r = client.get("/api/v1/auth/me",
                   headers={"Authorization": "Bearer khong-phai-jwt-that"})
    assert r.status_code == 401


def test_me_reporter_tra_dung_role_quyen_don_vi(client, khung):
    from app.models import AppUser, OrgUnit
    u = khung.query(AppUser).filter_by(email="u01@ptsc.local").one()
    dv = khung.query(OrgUnit).filter_by(id=u.org_unit_id).one()

    h = dang_nhap(client, "u01@ptsc.local")
    r = client.get("/api/v1/auth/me", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["user"] == {
        "id": u.id, "email": u.email, "full_name": u.full_name, "position": u.position,
    }
    assert body["roles"] == ["reporter"]
    assert body["permissions"] == sorted(
        ["report.create", "report.edit", "report.submit", "report.view_own_unit"])
    assert body["org_unit"] == {"id": dv.id, "code": dv.code, "name": dv.name}


def test_me_admin_co_du_14_quyen_va_scope_toan_TCT(client, khung):
    from app.seed import PERMISSIONS

    h = dang_nhap(client, "admin@ptsc.local")
    r = client.get("/api/v1/auth/me", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["roles"] == ["admin_atcl"]
    assert body["permissions"] == sorted(PERMISSIONS)
    # Thay đổi 5b: dòng trên so với chính hằng PERMISSIONS mà seed dùng để
    # dựng — xoá một quyền khỏi hằng thì hai vế cùng dịch, test vẫn xanh.
    # Chốt thêm bằng danh sách hardcode độc lập với PERMISSIONS để con số
    # "14 quyền" trong tên test thật sự được kiểm, không chỉ suy ra ngược.
    assert body["permissions"] == [
        "audit.view", "dashboard.view", "org.manage", "report.approve",
        "report.create", "report.edit", "report.return", "report.submit",
        "report.view_all", "report.view_own_unit", "status.view",
        "template.manage", "user.manage", "workflow.manage",
    ]
    assert body["org_unit"]["code"] == "PTSC"


def test_me_viewer_khong_co_quyen_ghi(client, khung):
    h = dang_nhap(client, "viewer@ptsc.local")
    r = client.get("/api/v1/auth/me", headers=h)
    body = r.json()
    assert body["roles"] == ["viewer"]
    assert body["permissions"] == sorted(["report.view_all", "dashboard.view", "status.view"])
    assert "report.edit" not in body["permissions"]


def test_me_user_chua_gan_role_van_xac_thuc_duoc_khong_phai_401(client, khung):
    """current_user() dựng bằng LEFT JOIN, không phải INNER: user tồn tại
    nhưng chưa gán role/permission nào vẫn phải qua được xác thực (200, quyền
    rỗng) — không được hiểu nhầm thành 'token không hợp lệ' (401)."""
    from app.models import AppUser, OrgUnit

    tct = khung.query(OrgUnit).filter_by(code="PTSC").one()
    moi = AppUser(
        email="chua-co-quyen@ptsc.local", full_name="Chưa có quyền",
        password_hash=bam_mat_khau("Demo@2026"), org_unit_id=tct.id,
    )
    khung.add(moi)
    khung.flush()

    token = tao_token(moi.id)
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["permissions"] == []
    assert body["roles"] == []


# ---------------------------------------------------------------------------
# Vòng sửa 1 (task-8-fix1-brief.md): 4 lỗ phân quyền + 2 lỗ mutation reviewer
# chứng minh là trống. Khối này VIẾT TRƯỚC khi sửa app/api/deps.py,
# app/api/auth.py, app/core/security.py — chạy đỏ đúng chỗ đang hỏng trước,
# xem report vòng sửa 1 để có output nguyên văn.
# ---------------------------------------------------------------------------

def test_view_all_voi_scope_bi_gioi_han_khong_duoc_tra_ve_None():
    """Thay đổi 1: report.view_all không được fail open khi scope thực sự bị
    giới hạn. Reviewer chứng minh bằng chạy thật: Giám đốc Đơn vị U01 được
    admin Ban ATCL gán vai `viewer` (có report.view_all) với
    scope_org_unit_id = U01 — cách diễn đạt hợp lý duy nhất mô hình dữ liệu
    cho phép — vẫn đọc được số liệu của cả 22 đơn vị vì code cũ trả None
    ngay khi thấy mã quyền khớp, không thèm nhìn scope."""
    u = _cu({"report.view_all"}, {"report.view_all": {9}})
    assert pham_vi_bao_cao(u) == {9}


def test_scope_gop_tu_nhieu_vai_khong_de_vai_sau_de_vai_truoc(khung):
    """Thay đổi 2: hai vai cùng cấp report.view_own_unit với scope khác
    nhau phải HỢP (union), không phải vai xuất hiện sau trong kết quả LEFT
    JOIN ghi đè vai trước. Reviewer chạy thật: user có reporter(scope U01)
    + một vai thứ hai cũng cấp report.view_own_unit (scope U02) →
    scope['report.view_own_unit'] chỉ còn U02, mất hẳn U01. Kịch bản thật:
    một đại diện SKATMT kiêm hai đầu mối (vd U05 + P02)."""
    from app.models import AppUser, OrgUnit, Permission, Role, RolePermission, UserRole

    u01 = khung.query(AppUser).filter_by(email="u01@ptsc.local").one()
    u02_dv = khung.query(OrgUnit).filter_by(code="U02").one()
    quyen = khung.query(Permission).filter_by(code="report.view_own_unit").one()

    # Vai thứ hai (không đụng seed): cũng cấp report.view_own_unit, scope
    # khác — mô phỏng một người kiêm hai đầu mối.
    vai_p = Role(code="reporter_p", name="Người nhập kiêm ban dự án")
    khung.add(vai_p)
    khung.flush()
    khung.add(RolePermission(role_id=vai_p.id, permission_id=quyen.id))
    khung.add(UserRole(user_id=u01.id, role_id=vai_p.id, scope_org_unit_id=u02_dv.id))
    khung.flush()

    token = tao_token(u01.id)
    cu = current_user(authorization=f"Bearer {token}", db=khung)
    assert cu.scope["report.view_own_unit"] == {u01.org_unit_id, u02_dv.id}


def test_login_tai_khoan_bi_khoa_active_false_tra_401(client, khung):
    """Thay đổi 4: reviewer chạy thật — active=False vẫn login được, trả
    200 kèm access_token. Kịch bản thật: đại diện SKATMT của U07 chuyển
    công tác, chuyên viên Ban ATCL tắt active (MVP chưa có màn user.manage
    nên đây là thao tác tự nhiên duy nhất) nhưng người đó vẫn đăng nhập
    được vô thời hạn."""
    from app.models import AppUser
    u = khung.query(AppUser).filter_by(email="u07@ptsc.local").one()
    u.active = False
    khung.flush()
    r = client.post("/api/v1/auth/login",
                    json={"email": "u07@ptsc.local", "password": "Demo@2026"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Sai email hoặc mật khẩu"


def test_token_da_cap_mat_hieu_luc_ngay_khi_tai_khoan_bi_khoa(client, khung):
    """Thay đổi 4: reviewer chạy thật — token cấp trước khi khoá tài khoản
    vẫn dùng được vô thời hạn ở GET /auth/me (200, đủ 4 quyền reporter).
    active phải chặn ở current_user() để token cũ mất hiệu lực ngay, không
    chờ hết hạn 12 giờ."""
    from app.models import AppUser
    u = khung.query(AppUser).filter_by(email="u07@ptsc.local").one()
    h = dang_nhap(client, "u07@ptsc.local")
    u.active = False
    khung.flush()
    r = client.get("/api/v1/auth/me", headers=h)
    assert r.status_code == 401


def test_token_thieu_exp_bi_tu_choi_khong_song_vinh_vien():
    """Thay đổi 5a: PyJWT chỉ kiểm exp KHI CÓ mặt trong payload — token
    thiếu exp hiện sống vĩnh viễn, biến "hạn 12 giờ" của spec thành có điều
    kiện. doc_token() phải từ chối (None), không được đọc ra sub."""
    token = jwt.encode({"sub": "1"}, settings.JWT_SECRET, algorithm=THUAT_TOAN)
    assert doc_token(token) is None


# --- 2 lỗ mutation reviewer chứng minh là trống (110/110 vẫn xanh) --------

def test_pham_vi_lay_tu_user_role_khong_lay_tu_app_user_org_unit_id(khung):
    """Lỗ 1 (mutation M-G): app_user.org_unit_id và user_role.scope_org_unit_id
    cố ý cho LỆCH nhau — phạm vi phải lấy từ user_role, tuyệt đối không
    được lấy từ app_user.org_unit_id (cột đó chỉ để hiển thị, xem docstring
    CurrentUser). Đi qua current_user() thật với AppUser + UserRole dựng
    trong DB, không dựng CurrentUser bằng tay — 4 test phạm vi khác đều
    dựng tay nên không lỗ nào trong số đó bắt được ca này."""
    from app.models import AppUser, OrgUnit, Role, UserRole

    dv_hien_thi = khung.query(OrgUnit).filter_by(code="U01").one()   # app_user.org_unit_id
    dv_scope = khung.query(OrgUnit).filter_by(code="U09").one()      # user_role.scope_org_unit_id
    reporter = khung.query(Role).filter_by(code="reporter").one()

    u = AppUser(
        email="lech-scope@ptsc.local", full_name="Lệch scope",
        password_hash=bam_mat_khau("Demo@2026"), org_unit_id=dv_hien_thi.id,
    )
    khung.add(u)
    khung.flush()
    khung.add(UserRole(user_id=u.id, role_id=reporter.id, scope_org_unit_id=dv_scope.id))
    khung.flush()

    token = tao_token(u.id)
    cu = current_user(authorization=f"Bearer {token}", db=khung)

    assert cu.org_unit_id == dv_hien_thi.id
    assert cu.scope["report.view_own_unit"] == {dv_scope.id}
    assert pham_vi_bao_cao(cu) == {dv_scope.id}


def test_token_han_dung_xap_xi_12_gio_khong_bi_am_tham_doi(khung):
    """Lỗ 2 (mutation M-H): đo trực tiếp khoảng cách exp - thời điểm phát
    hành qua tao_token() thật (không hand-build payload JWT) — test cũ chỉ
    kiểm "chưa hết hạn" (test_token_het_han_bi_tu_choi) nên đổi
    HAN_GIO = 12 thành 12 * 365 vẫn để 110/110 xanh."""
    from app.models import AppUser
    u = khung.query(AppUser).filter_by(email="admin@ptsc.local").one()
    truoc = datetime.now(timezone.utc)
    token = tao_token(u.id)
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[THUAT_TOAN])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    khoang_cach = exp - truoc
    assert timedelta(hours=11, minutes=59) < khoang_cach <= timedelta(hours=12, seconds=5)


def test_khoa_go_sai_o_login_bi_tu_choi_422_khong_cap_token(client, khung):
    """`DangNhapRequest` phải siết như mọi thân request khác — không đứng ngoài.

    Nửa còn lại của §N1 (final-rereview-report.md): lớp này từng kế thừa
    `BaseModel` TRẦN nên `extra="ignore"` — mọi khoá lạ đi lọt thành 200 kèm
    token. Không có trường tuỳ chọn nào để mất nên không có đường câm, nhưng
    hợp đồng "MỌI thân request đều siết" mà chỉ đúng một nửa thì là hợp đồng
    giả. Ca song sinh cho `TransitionIn`: tests/api/test_transition.py::
    test_khoa_go_sai_o_transition_bi_tu_choi_422_khong_duyet_bao_cao.
    """
    r = client.post("/api/v1/auth/login",
                    json={"email": "admin@ptsc.local", "password": "Demo@2026",
                          "remember_me": True})
    assert r.status_code == 422, f"khoá gõ sai đi lọt: {r.status_code} {r.text}"
    assert "access_token" not in r.json(), "khoá lạ đi lọt mà vẫn cấp token"
