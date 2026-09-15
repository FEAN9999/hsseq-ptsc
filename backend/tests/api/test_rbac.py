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
# Task 11 mount thêm PUT /reports/{id}/values, Task 12 mount thêm
# POST /reports/{id}/transition (task-12-carry.md D3) — cả hai route
# test_viewer_khong_sua_duoc_gi đụng tới giờ đã tồn tại, xfail cuối cùng của
# file này đã gỡ, chạy xanh thật.


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


def test_viewer_khong_sua_duoc_gi(client, sanh):
    """403 của viewer phải đến từ QUYỀN, không phải từ TRẠNG THÁI báo cáo.

    Bản cũ dùng `Report.first()` — báo cáo đầu trong seed là `approved`, mà
    `ghi_gia_tri` cũng ném 403 "Báo cáo ở trạng thái không cho sửa" cho trạng
    thái không sửa được. Ba danh tính (viewer, admin, reporter) đều ra 403 trên
    báo cáo đó, nên danh tính `viewer` không đóng góp gì vào con số 403: bóp
    chết `require_permission("report.edit")` vẫn 305/305 XANH
    (final-review-R1-report.md §(A1), M9b). Đúng họ lỗi "so một giá trị với
    chính cái mặc định nó rơi về".

    Nên ca này chạy trên báo cáo **`draft`** — trạng thái SỬA ĐƯỢC, tức phép
    thử phân biệt thật — và khẳng định CẢ HAI vế: viewer bị chặn (kèm đúng câu
    lỗi của tầng quyền, không phải câu của tầng trạng thái) còn admin qua
    được với y hệt request đó.
    """
    from app.models import Report, WorkflowState
    bc = (sanh.query(Report).join(WorkflowState, WorkflowState.id == Report.state_id)
          .filter(WorkflowState.code == "draft").first())
    assert bc is not None, "seed phải có ít nhất một báo cáo draft"
    than = {"version": bc.version, "values": []}

    h_viewer = dang_nhap(client, "viewer@ptsc.local")
    r = client.put(f"/api/v1/reports/{bc.id}/values", json=than, headers=h_viewer)
    assert r.status_code == 403
    assert r.json()["detail"] == "Bạn không có quyền thực hiện thao tác này", \
        "403 này phải là 403 của QUYỀN, không phải 'Báo cáo ở trạng thái không cho sửa'"

    # Đối chứng — cùng request, cùng báo cáo, chỉ đổi danh tính: nếu vế này
    # cũng 403 thì vế trên đang mượn sức phân biệt của trạng thái.
    h_admin = dang_nhap(client, "admin@ptsc.local")
    assert client.put(f"/api/v1/reports/{bc.id}/values",
                      json=than, headers=h_admin).status_code == 200

    assert client.post(f"/api/v1/reports/{bc.id}/transition",
                       json={"action": "approve", "expected_state": "submitted",
                             "version": 1}, headers=h_viewer).status_code == 403


def test_khong_token_thi_401_khong_phai_403(client, sanh):
    assert client.get("/api/v1/reports").status_code == 401


def test_sai_mat_khau_khong_lo_tai_khoan_co_ton_tai(client, sanh):
    a = client.post("/api/v1/auth/login",
                    json={"email": "u01@ptsc.local", "password": "sai"})
    b = client.post("/api/v1/auth/login",
                    json={"email": "khong-ton-tai@ptsc.local", "password": "sai"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]
