# backend/tests/api/test_auth.py
"""Test `security.py`, `api/deps.py`, `api/auth.py`.

`test_rbac.py` (task-8-brief.md) đi qua HTTP `/reports` để kiểm scope — nhưng
`/reports` chưa mount tới Task 10 nên 5/6 test ở đó đang `xfail` và KHÔNG hề
chạm `current_user()`/`require_permission()`/`scope_org_unit_ids()`: FastAPI
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

from app.api.deps import CurrentUser, require_permission, scope_org_unit_ids
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
# deps.py: require_permission / scope_org_unit_ids — gọi thẳng hàm, vì chưa
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
    u = _cu({"report.view_all"})
    assert scope_org_unit_ids(u, "report.view_all") is None


def test_scope_view_own_unit_tra_ve_dung_1_don_vi():
    u = _cu({"report.view_own_unit"}, {"report.view_own_unit": 7})
    assert scope_org_unit_ids(u, "report.view_own_unit") == {7}


def test_scope_NULL_bi_tu_choi_403_khong_mo_toan_bo():
    """Ca nguy hiểm nhất: scope NULL của reporter không bao giờ được hiểu
    thành 'không giới hạn' — phải 403, không phải None/set rỗng."""
    u = _cu({"report.view_own_unit"}, {"report.view_own_unit": None})
    with pytest.raises(ForbiddenError) as loi:
        scope_org_unit_ids(u, "report.view_own_unit")
    assert loi.value.status_code == 403
    assert loi.value.detail == (
        "Tài khoản chưa được gán đơn vị. Liên hệ Ban ATCL để cấp lại quyền.")


def test_scope_khong_co_quyen_nao_thi_403():
    u = _cu(set())
    with pytest.raises(ForbiddenError) as loi:
        scope_org_unit_ids(u, "report.view_own_unit")
    assert loi.value.status_code == 403


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
