# backend/tests/api/test_put_values.py
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap


def _nhap_08(client, h):
    ds = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()
    return next(r for r in ds if r["state"] == "draft")


def test_payload_mot_phan_khong_dung_o_khac(client, db):
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    truoc = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    r = client.put(f"/api/v1/reports/{bc['id']}/values",
                   json={"version": truoc["version"],
                         "values": [{"indicator_code": "B-2.1", "this_period": 3}]},
                   headers=h)
    assert r.status_code == 200
    sau = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    doi = [v["indicator_code"] for a, v in zip(truoc["values"], sau["values"])
           if a != v]
    assert doi == ["B-2.1"], f"đụng thêm ô: {doi}"


def test_version_tang_1_sau_moi_lan_ghi(client, db):
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()["version"]
    r = client.put(f"/api/v1/reports/{bc['id']}/values",
                   json={"version": v0, "values": [{"indicator_code": "B-2.1",
                                                    "this_period": 1}]}, headers=h)
    assert r.json()["version"] == v0 + 1


def test_version_cu_tra_409_kem_gia_tri_moi(client, db):
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()["version"]
    client.put(f"/api/v1/reports/{bc['id']}/values",
               json={"version": v0, "values": [{"indicator_code": "B-2.1",
                                                "this_period": 1}]}, headers=h)
    r = client.put(f"/api/v1/reports/{bc['id']}/values",
                   json={"version": v0, "values": [{"indicator_code": "B-2.1",
                                                    "this_period": 2}]}, headers=h)
    assert r.status_code == 409
    assert r.json()["version"] == v0 + 1
    assert r.json()["values"], "409 phải kèm giá trị mới để FE vá cột chỉ đọc"


def test_quantize_theo_decimals_va_tra_lai_so_da_luu(client, db):
    """FE hiện 12,35 nhưng server lưu 12,34 là bug đã biết — chặn bằng test này."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()["version"]
    r = client.put(f"/api/v1/reports/{bc['id']}/values",
                   json={"version": v0, "values": [{"indicator_code": "B-1.1",
                                                    "this_period": 12.345}]}, headers=h)
    o = next(v for v in r.json()["values"] if v["indicator_code"] == "B-1.1")
    assert o["this_period"] == 12.35        # decimals=2, ROUND_HALF_UP
    assert isinstance(o["this_period"], float)


def test_dong_sum_ghi_NULL_vao_hai_cot_acc(client, db):
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()["version"]
    client.put(f"/api/v1/reports/{bc['id']}/values",
               json={"version": v0, "values": [{"indicator_code": "B-1.1",
                                                "this_period": 10}]}, headers=h)
    from app.models import Indicator, ReportValue
    ind = db.query(Indicator).filter_by(code="B-1.1").one()
    rv = db.query(ReportValue).filter_by(report_id=bc["id"], indicator_id=ind.id).one()
    assert rv.acc_prev_entered is None and rv.acc_total_entered is None


def test_trang_thai_khong_editable_thi_403(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=h).json()
    da_duyet = next(r for r in ds if r["state"] == "approved")
    r = client.put(f"/api/v1/reports/{da_duyet['id']}/values",
                   json={"version": 1, "values": []}, headers=h)
    assert r.status_code == 403


def test_reporter_khong_ghi_duoc_don_vi_khac_du_dang_o_trang_thai_sua_duoc(client, db):
    """Cô lập kiểm phạm vi khỏi kiểm is_editable. Báo cáo của U02 trong
    test_rbac.py::test_reporter_khong_ghi_duoc_bao_cao_don_vi_khac luôn
    `approved` (mọi báo cáo 06/07/08 của mọi đơn vị TRỪ P05 kỳ 08 đều vậy) —
    403 ở đó có thể tới từ `is_editable`, không hẳn từ phạm vi (mutation-tự
    kiểm phát hiện: bỏ hẳn kiểm phạm vi ở `_kiem_quyen_ghi`, test đó vẫn
    xanh). Dùng báo cáo NHÁP (editable) của đơn vị KHÁC — P05 kỳ 2026-08 là
    báo cáo nháp duy nhất không thuộc U01 — để 403 chỉ có thể tới từ phạm vi,
    khoá cả message để không lẫn với is_editable/404."""
    seed_all(db)
    from app.models import OrgUnit, Report, ReportingPeriod, ReportTemplate, WorkflowState
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    p05 = db.query(OrgUnit).filter_by(code="P05").one()
    ky08 = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key="2026-08").one()
    bc = db.query(Report).filter_by(
        template_id=tpl.id, org_unit_id=p05.id, period_id=ky08.id).one()
    draft = db.query(WorkflowState).filter_by(template_id=tpl.id, code="draft").one()
    assert bc.state_id == draft.id, "tiền đề của test: báo cáo này phải editable"
    h = dang_nhap(client, "u01@ptsc.local")
    r = client.put(f"/api/v1/reports/{bc.id}/values",
                   json={"version": bc.version, "values": []}, headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "Bạn không có quyền sửa báo cáo của đơn vị này"


# --- task-11-carry.md C4: chỉ tiêu `computed` không có đường ghi ----------
# B-1.4 (Tổng giờ công) là chỉ tiêu computed duy nhất của FM01. `agg_type`
# "computed" không có cột nào trong COT_NHAP_DUOC (report_rules.py) nên
# validate_values() chặn ngay khi payload đụng tới nó — khoá lại đây để nhánh
# "ghi tay vào dòng tự tính" không âm thầm mất bảo vệ khi services/reports.py
# bị sửa sau này. Vì bị chặn nên nhánh 2 của C4 (GET vẫn trả None cho
# acc_total_entered của dòng computed dù "ghi được") không áp dụng — không có
# đường nào ghi được để dựng dữ liệu thật, xem task-11-report.md.

def test_khong_ghi_duoc_vao_chi_tieu_computed(client, db):
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()["version"]
    r = client.put(f"/api/v1/reports/{bc['id']}/values",
                   json={"version": v0, "values": [{"indicator_code": "B-1.4",
                                                    "this_period": 5}]}, headers=h)
    assert r.status_code == 400
    assert r.json()["errors"] == [
        {"indicator_code": "B-1.4", "message": "Dòng tự tính, không nhận giá trị gửi lên"}]

    sau = client.get(f"/api/v1/reports/{bc['id']}", headers=h).json()
    o = next(v for v in sau["values"] if v["indicator_code"] == "B-1.4")
    assert o["acc_total_entered"] is None
