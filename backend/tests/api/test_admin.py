# backend/tests/api/test_admin.py
#
# Hai endpoint của Lát 8: `GET /users` và `PATCH /templates/{code}/periods/{key}`.
# Cả hai gác bằng quyền QUẢN TRỊ (`user.manage`, `template.manage`) chứ không
# phải `yeu_cau_xem_bao_cao` như phần còn lại của `/templates` — nên vế "ai KHÔNG
# vào được" là ca đầu tiên của mỗi nhóm, không phải ca phụ.
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap


# ───────────────────────── GET /users ─────────────────────────

def test_users_doi_quyen_user_manage(client, db):
    seed_all(db)
    # reporter và viewer đều đăng nhập được và đều đọc được danh mục
    # (/templates, /org-units) — nhưng danh sách tài khoản thì không.
    for email in ("u01@ptsc.local", "viewer@ptsc.local"):
        h = dang_nhap(client, email)
        assert client.get("/api/v1/users", headers=h).status_code == 403, email


def test_users_tra_24_tai_khoan_kem_vai_pham_vi_va_so_quyen(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/users", headers=h).json()

    # 1 admin + 22 người nhập (đúng 22 đầu mối is_reporting) + 1 người xem.
    assert len(ds) == 24
    theo_email = {n["email"]: n for n in ds}

    admin = theo_email["admin@ptsc.local"]
    assert admin["full_name"] == "Admin Ban ATCL"
    assert admin["org_unit"] == {"code": "PTSC",
                                 "name": "Tổng công ty CP Dịch vụ Kỹ thuật Dầu khí"}
    assert admin["active"] is True
    # `scope: None` = toàn Tổng công ty. Với admin đó là cấu hình ĐÚNG; với
    # reporter thì chính None mới là cấu hình sai (pham_vi_bao_cao ném 403) —
    # hai nghĩa khác nhau trên cùng một giá trị, nên endpoint trả nguyên `null`
    # và để FE phân biệt theo vai.
    assert admin["roles"] == [{"code": "admin_atcl", "name": "Admin Ban ATCL", "scope": None}]
    # admin_atcl giữ TOÀN BỘ danh mục quyền (seed ROLE_PERMS).
    assert admin["permission_count"] == 14

    u01 = theo_email["u01@ptsc.local"]
    assert u01["position"] == "Đại diện SKATMT"
    assert u01["roles"] == [
        {"code": "reporter", "name": "Người nhập",
         "scope": {"code": "U01", "name": "Đơn vị thành viên 01 (tên tạm)"}},
    ]
    assert u01["permission_count"] == 4

    assert theo_email["viewer@ptsc.local"]["permission_count"] == 3


def test_users_dem_quyen_KHAC_NHAU_khi_mot_nguoi_giu_hai_vai(client, db):
    """`count(distinct)`, không phải `count(*)`.

    admin_atcl và viewer CHỒNG nhau 3 quyền (report.view_all, dashboard.view,
    status.view). Gán thêm vai viewer cho admin: tổng số dòng role_permission
    của người đó là 14 + 3 = 17, nhưng số quyền HIỆU DỤNG vẫn là 14. Không có
    ca này thì `count(*)` xanh suốt, vì seed không cho ai hai vai.
    """
    seed_all(db)
    from app.models import AppUser, Role, UserRole
    admin = db.query(AppUser).filter_by(email="admin@ptsc.local").one()
    viewer_role = db.query(Role).filter_by(code="viewer").one()
    db.add(UserRole(user_id=admin.id, role_id=viewer_role.id, scope_org_unit_id=None))
    db.flush()

    h = dang_nhap(client, "admin@ptsc.local")
    ds = {n["email"]: n for n in client.get("/api/v1/users", headers=h).json()}
    assert ds["admin@ptsc.local"]["permission_count"] == 14
    assert [v["code"] for v in ds["admin@ptsc.local"]["roles"]] == ["admin_atcl", "viewer"]


def test_users_khong_lo_password_hash(client, db):
    """`app_user.password_hash` là cột NẰM NGAY CẠNH những cột đang trả về.

    Endpoint dựng dict tay (không `response_model`), nên hàng rào duy nhất là
    danh sách khoá viết tay ấy — một lượt "trả luôn cả object cho tiện" sau này
    sẽ đẩy băm mật khẩu của 24 người ra API mà không test nào khác đỏ.
    """
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/users", headers=h).json()
    assert all("password_hash" not in n for n in ds)


# ────────────── PATCH /templates/{code}/periods/{period_key} ──────────────

def test_doi_ky_doi_quyen_template_manage(client, db):
    seed_all(db)
    for email in ("u01@ptsc.local", "viewer@ptsc.local"):
        h = dang_nhap(client, email)
        r = client.patch("/api/v1/templates/FM01/periods/2026-09", json={"is_open": False},
                         headers=h)
        assert r.status_code == 403, email
    # và kỳ KHÔNG bị đổi bởi lượt bị từ chối
    from app.models import ReportingPeriod
    assert db.query(ReportingPeriod).filter_by(period_key="2026-09").one().is_open is True


def test_dong_ky_roi_mo_lai_hien_ngay_tren_GET_periods(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")

    r = client.patch("/api/v1/templates/FM01/periods/2026-09", json={"is_open": False}, headers=h)
    assert r.status_code == 200, r.text

    ds = client.get("/api/v1/templates/FM01/periods", headers=h).json()
    assert {k["period_key"]: k["is_open"] for k in ds} == {
        "2026-06": False, "2026-07": False, "2026-08": True, "2026-09": False}
    # Thân PATCH trả về ĐÚNG BẰNG dòng tương ứng của GET — FE thay thẳng dòng
    # này vào bảng đang hiển thị, nên hai nơi lệch một trường là một dòng méo
    # cho tới lượt tải lại. So với chính GET (không viết cứng chuỗi ngày) vì
    # cách hiển thị múi giờ của `due_at` là việc của tầng dưới, không phải hợp
    # đồng mà ca này canh.
    assert r.json() == next(k for k in ds if k["period_key"] == "2026-09")
    assert set(r.json()) == {"period_key", "start_date", "end_date", "due_at", "is_open"}

    # Đảo ngược được: mở kỳ 2026-06 (đang đóng từ seed).
    assert client.patch("/api/v1/templates/FM01/periods/2026-06", json={"is_open": True},
                        headers=h).json()["is_open"] is True


def test_dong_ky_chan_tao_bao_cao_moi_mo_lai_thi_cho(client, db):
    """Vế HÀNH VI của thao tác — không chỉ một cột boolean đổi giá trị.

    CÙNG một request `POST /reports` (cùng người, cùng kỳ) đổi kết quả từ 409
    sang 201 chỉ vì lượt PATCH ở giữa. Thiếu ca này thì một endpoint ghi vào
    cột sai — hay ghi đúng cột nhưng của kỳ khác — vẫn xanh.

    Kỳ 2026-09 vì fixture chưa có báo cáo nào ở kỳ đó (test_dashboard.py:
    `len(missing_units) == 22`): 409 "đã tồn tại" cũng là 409, nên chọn kỳ còn
    trống để con số 409 chỉ có MỘT nghĩa. Người gọi là reporter chứ không phải
    admin: `POST /reports` lấy đơn vị TỪ PHẠM VI VAI, mà admin phạm vi None nên
    không tạo được báo cáo cho ai (api/reports.py:67).
    """
    seed_all(db)
    h_admin = dang_nhap(client, "admin@ptsc.local")
    h_u01 = dang_nhap(client, "u01@ptsc.local")
    tao = lambda: client.post("/api/v1/reports", headers=h_u01,  # noqa: E731
                              json={"template": "FM01", "period_key": "2026-09"})

    client.patch("/api/v1/templates/FM01/periods/2026-09", json={"is_open": False},
                 headers=h_admin)
    dong = tao()
    assert dong.status_code == 409
    assert "đã đóng" in dong.json()["detail"]

    client.patch("/api/v1/templates/FM01/periods/2026-09", json={"is_open": True},
                 headers=h_admin)
    assert tao().status_code == 201


def test_doi_ky_ghi_audit_log(client, db):
    seed_all(db)
    from app.models import AppUser, AuditLog, ReportingPeriod
    h = dang_nhap(client, "admin@ptsc.local")
    client.patch("/api/v1/templates/FM01/periods/2026-09", json={"is_open": False}, headers=h)

    ky = db.query(ReportingPeriod).filter_by(period_key="2026-09").one()
    admin = db.query(AppUser).filter_by(email="admin@ptsc.local").one()
    dong = db.query(AuditLog).filter_by(entity="reporting_period", entity_id=ky.id).one()
    assert dong.action == "close_period"
    assert dong.actor_id == admin.id
    assert dong.before_json == {"is_open": True}
    assert dong.after_json == {"is_open": False}


def test_doi_ky_404_cho_mau_va_ky_khong_co(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    assert client.patch("/api/v1/templates/FM99/periods/2026-09", json={"is_open": False},
                        headers=h).status_code == 404
    assert client.patch("/api/v1/templates/FM01/periods/2099-01", json={"is_open": False},
                        headers=h).status_code == 404


def test_doi_ky_khoa_go_sai_bi_tu_choi_422_khong_doi_gi(client, db):
    """`ApiModel` (`extra="forbid"`) phủ cả thân request này.

    Với `extra="ignore"` mặc định của pydantic, `{"isOpen": false}` sẽ đi lọt
    thành 422 vì thiếu `is_open`… nhưng `{"is_open": false, "isOpen": true}`
    thì không — và một FE gõ sai khoá sẽ nhận 200 "đã lưu" cho một lượt ghi
    không như nó tưởng. Khoá lạ ⇒ 422, không ghi gì.
    """
    seed_all(db)
    from app.models import ReportingPeriod
    h = dang_nhap(client, "admin@ptsc.local")
    r = client.patch("/api/v1/templates/FM01/periods/2026-09",
                     json={"is_open": False, "isOpen": True}, headers=h)
    assert r.status_code == 422
    assert db.query(ReportingPeriod).filter_by(period_key="2026-09").one().is_open is True
