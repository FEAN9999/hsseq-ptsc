# backend/tests/api/test_rbac.py
import pytest

from app.seed import seed_all


@pytest.fixture()
def sanh(db):
    seed_all(db)
    return db


def dang_nhap(client, email, mk="Demo@2026"):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": mk})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# Task 10 mount /reports nhưng CHỈ 3 route: GET /reports, POST /reports,
# GET /reports/{id} (xem task-10-brief.md mục Produces và
# docs/superpowers/plans/2026-09-09-hseq-mvp-fm01.md, bảng "Cặp task dùng
# chung file": "10 tạo, 11 thêm PUT, 12 thêm transition; không sửa chồng").
# Task 11 mount thêm PUT /reports/{id}/values (test ngay dưới đã gỡ marker,
# xanh thật). POST /reports/{id}/transition vẫn CHƯA tồn tại tới Task 12 —
# xfail còn lại đụng đúng route đó nên vẫn giữ.
_XFAIL_CHO_TASK_12 = pytest.mark.xfail(
    reason="Task 10/11 chỉ mount GET/POST /reports + GET /reports/{id} + "
           "PUT /reports/{id}/values; POST .../transition do Task 12 thêm — gỡ khi đó.",
    strict=True,
)


def test_reporter_khong_doc_duoc_bao_cao_don_vi_khac(client, sanh):
    h = dang_nhap(client, "u01@ptsc.local")
    from app.models import OrgUnit, Report
    dv_khac = sanh.query(OrgUnit).filter_by(code="U02").one()
    bc = sanh.query(Report).filter_by(org_unit_id=dv_khac.id).first()
    assert client.get(f"/api/v1/reports/{bc.id}", headers=h).status_code == 403


def test_reporter_khong_ghi_duoc_bao_cao_don_vi_khac(client, sanh):
    h = dang_nhap(client, "u01@ptsc.local")
    from app.models import OrgUnit, Report
    dv_khac = sanh.query(OrgUnit).filter_by(code="U02").one()
    bc = sanh.query(Report).filter_by(org_unit_id=dv_khac.id).first()
    r = client.put(f"/api/v1/reports/{bc.id}/values",
                   json={"version": 1, "values": []}, headers=h)
    assert r.status_code == 403


def test_reporter_scope_NULL_bi_tu_choi_chu_khong_thanh_toan_quyen(client, sanh):
    """Critical gap: scope NULL với reporter KHÔNG bao giờ hiểu là 'mọi đơn vị'."""
    from app.models import AppUser, Role, UserRole
    u = sanh.query(AppUser).filter_by(email="u01@ptsc.local").one()
    reporter = sanh.query(Role).filter_by(code="reporter").one()
    sanh.query(UserRole).filter_by(user_id=u.id, role_id=reporter.id).update(
        {"scope_org_unit_id": None})
    sanh.flush()
    h = dang_nhap(client, "u01@ptsc.local")
    assert client.get("/api/v1/reports", headers=h).status_code == 403


@_XFAIL_CHO_TASK_12
def test_viewer_khong_sua_duoc_gi(client, sanh):
    h = dang_nhap(client, "viewer@ptsc.local")
    from app.models import Report
    bc = sanh.query(Report).first()
    assert client.put(f"/api/v1/reports/{bc.id}/values",
                      json={"version": 1, "values": []}, headers=h).status_code == 403
    assert client.post(f"/api/v1/reports/{bc.id}/transition",
                       json={"action": "approve", "expected_state": "submitted",
                             "version": 1}, headers=h).status_code == 403


def test_khong_token_thi_401_khong_phai_403(client, sanh):
    assert client.get("/api/v1/reports").status_code == 401


def test_sai_mat_khau_khong_lo_tai_khoan_co_ton_tai(client, sanh):
    a = client.post("/api/v1/auth/login",
                    json={"email": "u01@ptsc.local", "password": "sai"})
    b = client.post("/api/v1/auth/login",
                    json={"email": "khong-ton-tai@ptsc.local", "password": "sai"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]
