# backend/tests/api/test_put_values.py
from app.seed import seed_all
from tests.api.test_catalog import MA_CHI_TIEU_THEO_THU_TU
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


# --- vòng sửa 1 (task-11-fix-brief.md) --------------------------------------

def _ghi(client, h, report_id, version, values):
    return client.put(f"/api/v1/reports/{report_id}/values",
                      json={"version": version, "values": values}, headers=h)


def _o(body, ma):
    """Ô `ma` trong thân phản hồi (200, 409 hoặc GET /reports/{id})."""
    return next(v for v in body["values"] if v["indicator_code"] == ma)


def _xem(client, h, report_id):
    return client.get(f"/api/v1/reports/{report_id}", headers=h).json()


def _bao_cao_cua(db, ma_don_vi, period_key):
    """Bản ghi `Report` của (đơn vị, kỳ) trong dữ liệu seed."""
    from app.models import OrgUnit, Report, ReportingPeriod, ReportTemplate
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    o = db.query(OrgUnit).filter_by(code=ma_don_vi).one()
    p = db.query(ReportingPeriod).filter_by(template_id=tpl.id, period_key=period_key).one()
    return db.query(Report).filter_by(
        template_id=tpl.id, org_unit_id=o.id, period_id=p.id).one()


def _trang_thai(db, ma):
    from app.models import ReportTemplate, WorkflowState
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    return db.query(WorkflowState).filter_by(template_id=tpl.id, code=ma).one()


# G2 — quantize nuốt dấu âm

def test_so_am_bi_tu_choi_ke_ca_khi_lam_tron_ve_khong(client, db):
    """`Decimal("-0.4").quantize(Decimal("1"))` ra `Decimal("-0")`, mà
    `Decimal("-0") < 0` là False: quantize chạy trước validate nên kiểm số âm
    không bắt được. Người nhập gõ -0,4 vào ô đếm nhận 200 và ô lưu thành 0,
    không thông báo gì, ô cũng không sáng đỏ (FE chỉ tô theo lỗi 400). Kiểm
    dấu phải chạy trên giá trị GỐC. B-2.1 có decimals=0 nên đây là ca thật."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    truoc = _o(_xem(client, h, bc["id"]), "B-2.1")

    for so in (-0.4, -0.004, -3):
        v = _xem(client, h, bc["id"])["version"]
        r = _ghi(client, h, bc["id"], v,
                 [{"indicator_code": "B-2.1", "this_period": so}])
        assert r.status_code == 400, f"{so} → {r.status_code} {r.text}"
        assert r.json()["detail"] == "Dữ liệu không hợp lệ", f"{so}"
        assert r.json()["errors"] == [
            {"indicator_code": "B-2.1", "message": "Số không được âm"}], f"{so}"

    assert _o(_xem(client, h, bc["id"]), "B-2.1") == truoc, \
        "payload bị từ chối mà ô vẫn đổi"


# G5.5 — quantize theo `decimals` của CHÍNH chỉ tiêu, không hardcode

def test_quantize_theo_decimals_cua_chi_tieu_decimals_0(client, db):
    """43/53 chỉ tiêu FM01 khai decimals=0 và không cái nào từng được test
    quantize — test cũ chỉ dùng B-1.1 (decimals=2). Hardcode bước
    `Decimal("0.01")` để 3,5 nguyên vẹn rồi chính `qua_thap_phan()` trả 400
    "Chỉ nhận tối đa 0 chữ số thập phân": người nhập bị CHẶN ở 43/53 dòng thay
    vì được server làm tròn như spec hứa (quantize trước validate làm hai bước
    dính vào nhau, sai bước không còn là lệch một chữ số mà lật thành lỗi)."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-2.1", "this_period": 3.5}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-2.1")["this_period"] == 4.0      # ROUND_HALF_UP, decimals=0

    # 12.345 → 12: giữ nguyên quyết định "quantize trước" cho luật thập phân
    # (spec dòng 231 bắt server làm tròn, dòng 449 nêu rủi ro mất số người dùng)
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-2.1", "this_period": 12.345}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-2.1")["this_period"] == 12.0
    assert _o(_xem(client, h, bc["id"]), "B-2.1")["this_period"] == 12.0


# G3 — payload MỘT PHẦN không được đòi ô bắt buộc của cùng dòng

def test_sua_moi_ghi_chu_cua_dong_dang_co_so_van_luu_duoc(client, db):
    """Spec D23 chốt granularity ở mức Ô: "gửi chỉ ô đổi". Vòng "ô bắt buộc"
    chạy trên MỌI mã có mặt trong payload nên gõ thêm Ghi chú vào một dòng
    ĐANG HIỂN THỊ SỐ bị 400 "Ô bắt buộc, chưa có giá trị" — 52/53 chỉ tiêu
    FM01 có required=True nên đây là thao tác thường nhất trên form."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    truoc = _o(_xem(client, h, bc["id"]), "B-3.2")
    assert truoc["this_period"] is not None, "tiền đề: dòng B-3.2 đang có số"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-3.2", "note": "chờ xác nhận từ BQL"}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-3.2")
    assert o["note"] == "chờ xác nhận từ BQL"
    assert o["this_period"] == truoc["this_period"], "sửa Ghi chú làm mất số của dòng"


def test_counter_ghi_mot_cot_khong_xoa_cot_kia(client, db):
    """`counter` là agg_type DUY NHẤT có hai cột nhập được — đúng chỗ payload
    một phần có thể xoá dữ liệu. Với B-1.5 (LTI) cột bắt buộc là "Cộng dồn",
    nên sửa mỗi "Tháng này" vừa bị 400 (vòng bắt buộc), vừa là ca mà bỏ guard
    `is not None` sẽ ghi NULL đè lên cột còn lại: `counter_check` lật sang
    `bo_qua` và ô trống trơn sau khi tải lại."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    truoc = _o(_xem(client, h, bc["id"]), "B-1.5")
    assert truoc["acc_total_entered"] is not None, "tiền đề: B-1.5 đang có Cộng dồn"

    # chỉ "Tháng này" — thiếu cột BẮT BUỘC của dòng counter
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.5", "this_period": 7}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-1.5")
    assert o["this_period"] == 7.0
    assert o["acc_total_entered"] == truoc["acc_total_entered"], \
        "ghi mỗi Tháng này đã xoá Cộng dồn"

    # chỉ "Cộng dồn" — chiều ngược lại
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.5", "acc_total_entered": 20}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-1.5")
    assert o["acc_total_entered"] == 20.0
    assert o["this_period"] == 7.0, "ghi mỗi Cộng dồn đã xoá Tháng này"


# G5.7 — `note` ở đường ghi

def test_note_luu_that_va_khong_bi_xoa_khi_luot_sau_chi_gui_so(client, db):
    """`note` nằm trong hợp đồng brief nhưng không test nào trong repo từng ghi
    hay đọc nó qua PUT /values. Bỏ guard `if v.note is not None` thì lượt ghi
    chỉ gửi ô số sẽ xoá sạch ghi chú — đúng cột mà `counter_check` khuyên
    người dùng ghi lý do lệch, và không ai thấy nó biến mất."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.5", "note": "reset sau LTI 12/08"}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-1.5")["note"] == "reset sau LTI 12/08"
    assert _o(_xem(client, h, bc["id"]), "B-1.5")["note"] == "reset sau LTI 12/08"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.5", "this_period": 2}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-1.5")
    assert o["this_period"] == 2.0
    assert o["note"] == "reset sau LTI 12/08", "ghi ô số đã xoá ghi chú của dòng"


# G4 — ba đường ra 500 phải thành 400 tiếng Việt

def test_so_qua_lon_tra_400_tieng_viet_khong_phai_500(client, db):
    """Hai nhánh vỡ khác nhau, cả hai đều là exception không ai bắt → 500 trần
    (không có handler nào ngoài AppError): 1e30 nổ `InvalidOperation` lúc
    quantize (vượt precision 28 của context decimal), 999999999999999999 nổ
    `NumericValueOutOfRange` lúc ghi (`report_value` là Numeric(18,2), phải
    nhỏ hơn 10^16). Người nhập dán một ô Excel dạng mũ vào "Tổng giờ công"
    thấy màn hình trắng và dải trạng thái kẹt ở "Chưa lưu" vĩnh viễn."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    truoc = _o(_xem(client, h, bc["id"]), "B-2.1")

    for so in (1e30, 999999999999999999, 10 ** 16):
        v = _xem(client, h, bc["id"])["version"]
        r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-2.1", "this_period": so}])
        assert r.status_code == 400, f"{so} → {r.status_code} {r.text}"
        assert r.json()["detail"] == "Dữ liệu không hợp lệ", f"{so}"
        assert r.json()["errors"] == [
            {"indicator_code": "B-2.1",
             "message": "Số quá lớn, tối đa 16 chữ số phần nguyên"}], f"{so}"
    assert _o(_xem(client, h, bc["id"]), "B-2.1") == truoc

    # ngay dưới ngưỡng vẫn ghi được — chặn không được nới rộng thành chặn nhầm
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-2.1", "this_period": 10 ** 15}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-2.1")["this_period"] == 1e15


def test_trung_ma_chi_tieu_trong_cung_payload_tra_400(client, db):
    """FE gộp "các ô đổi từ lần lưu trước" (D23) trong một cửa sổ debounce 1,5
    giây: gõ số vào "Số vụ tai nạn" rồi Tab sang "Ghi chú" CÙNG dòng sinh hai
    mục cùng `indicator_code`. Session để `autoflush=False` nên lượt get-or-
    create thứ hai không thấy dòng đang pending → thêm dòng thứ hai →
    UNIQUE(report_id, indicator_id) nổ thành 500 và mất cả hai ô. Chỉ vỡ với
    báo cáo MỚI (chưa có dòng report_value nào), tức đúng đường demo."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    tao = client.post("/api/v1/reports",
                      json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert tao.status_code == 201, tao.text
    bc_id = tao.json()["id"]
    assert _o(_xem(client, h, bc_id), "B-2.1")["this_period"] is None, \
        "tiền đề: báo cáo mới, chưa có dòng report_value nào"

    r = _ghi(client, h, bc_id, 1, [
        {"indicator_code": "B-2.1", "this_period": 3},
        {"indicator_code": "B-2.1", "note": "gõ tiếp trong cùng cửa sổ debounce"},
    ])
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Dữ liệu không hợp lệ"
    assert r.json()["errors"] == [
        {"indicator_code": "B-2.1", "message": "Mã chỉ tiêu bị lặp trong cùng một payload"}]
    assert _xem(client, h, bc_id)["version"] == 1, "payload bị từ chối mà version vẫn tăng"


# G5.1 — `is_editable` là dữ liệu, không phải "state == draft"

def test_returned_ghi_duoc_con_submitted_thi_403(client, db):
    """Vòng "Trả lại → sửa → nộp lại" là nhánh chính của kịch bản demo, và
    `returned` cũng có `is_editable = True` (seed/__init__.py::STATES). Test cũ
    chỉ phủ `draft` (ghi được) và `approved` (403) nên hardcode
    `code != "draft"` vẫn xanh — mà nó giết đúng vòng đó: mọi lần lưu trên báo
    cáo bị trả lại nhận 403 "Báo cáo ở trạng thái không cho sửa"."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    r_db = _bao_cao_cua(db, "P05", "2026-08")

    r_db.state_id = _trang_thai(db, "returned").id
    db.flush()
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-2.1", "this_period": 5}])
    assert r.status_code == 200, f"returned phải ghi được: {r.text}"
    assert _o(r.json(), "B-2.1")["this_period"] == 5.0

    r_db.state_id = _trang_thai(db, "submitted").id
    db.flush()
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-2.1", "this_period": 6}])
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "Báo cáo ở trạng thái không cho sửa"
    assert _o(_xem(client, h, bc["id"]), "B-2.1")["this_period"] == 5.0


# G5.3 — phạm vi ghi lấy từ VAI, không từ `app_user.org_unit_id`

def test_pham_vi_ghi_theo_vai_tro_khong_theo_app_user_org_unit_id(client, db):
    """`app_user.org_unit_id` KHÔNG phải nguồn phân quyền (docstring
    `CurrentUser` viết hoa cả câu để cấm đọc nó) và hai cột CÓ THỂ LỆCH nhau.
    Fixture cho mọi reporter hai cột trùng nhau nên phản-mẫu `{u.org_unit_id}`
    cho đúng cùng kết quả — dựng một tài khoản LỆCH để hai đường tách ra.

    Ca thật: chuyên viên Ban ATCL (`app_user.org_unit_id` = một đơn vị khác)
    được cấp thêm vai reporter scope U01 để nhập hộ."""
    seed_all(db)
    from app.models import AppUser
    bc_u01 = _bao_cao_cua(db, "U01", "2026-08")
    bc_p05 = _bao_cao_cua(db, "P05", "2026-08")
    assert bc_p05.state_id == _trang_thai(db, "draft").id, \
        "tiền đề: P05 kỳ 08 là nháp, nên 403 dưới đây chỉ có thể tới từ phạm vi"
    bc_u01.state_id = _trang_thai(db, "draft").id
    # vai giữ nguyên scope U01; chỉ đổi đơn vị GHI TRÊN TÀI KHOẢN sang P05
    u01 = db.query(AppUser).filter_by(email="u01@ptsc.local").one()
    u01.org_unit_id = bc_p05.org_unit_id
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    r = _ghi(client, h, bc_u01.id, bc_u01.version,
             [{"indicator_code": "B-2.1", "this_period": 9}])
    assert r.status_code == 200, f"phải ghi được đơn vị của VAI (U01): {r.text}"
    assert _o(r.json(), "B-2.1")["this_period"] == 9.0

    r = _ghi(client, h, bc_p05.id, bc_p05.version,
             [{"indicator_code": "B-2.1", "this_period": 9}])
    assert r.status_code == 403, "ghi được đơn vị ghi trên tài khoản (P05) là rò quyền"
    assert r.json()["detail"] == "Bạn không có quyền sửa báo cáo của đơn vị này"


# G5.4 — thân 409 mang TOÀN BỘ values hiện tại

def test_than_409_tra_du_53_dong_dung_bang_GET(client, db):
    """Brief đòi "toàn bộ `values` hiện tại". Test cũ chỉ viết
    `assert r.json()["values"]` — khẳng định TỒN TẠI, nên cắt thân xuống 1/53
    dòng vẫn xanh. FE vá các cột chỉ đọc (Lũy kế tháng trước / Cộng dồn /
    Lệch) từ đúng thân này: thiếu dòng thì 52/53 dòng giữ số trước xung đột và
    dấu "Lệch" sai, trong khi banner báo "đã tải lại số mới nhất"."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = _xem(client, h, bc["id"])["version"]

    thang = _ghi(client, h, bc["id"], v0, [{"indicator_code": "B-2.1", "this_period": 41}])
    assert thang.status_code == 200, thang.text
    thua = _ghi(client, h, bc["id"], v0, [{"indicator_code": "B-2.1", "this_period": 42}])
    assert thua.status_code == 409, thua.text

    hien_tai = _xem(client, h, bc["id"])
    assert [v["indicator_code"] for v in thua.json()["values"]] == MA_CHI_TIEU_THEO_THU_TU
    assert thua.json()["values"] == hien_tai["values"], \
        "thân 409 phải là đúng bộ values hiện tại, không phải một phần"
    assert _o(thua.json(), "B-2.1")["this_period"] == 41.0, "phải là số của lần ghi THẮNG"
    assert thua.json()["version"] == hien_tai["version"] == v0 + 1


# G5.8 — D21: lượt ghi sống đổi `source` sang "live"

def test_ghi_song_doi_source_tu_seed_sang_live(client, db):
    """D21. Báo cáo nạp từ Excel bị sửa tay mà vẫn mang nhãn `seed` trên màn
    hình danh sách thì trong buổi demo Ban ATCL không phân biệt được số thật
    với số mẫu."""
    seed_all(db)
    bc = _bao_cao_cua(db, "U01", "2026-08")
    assert bc.source == "seed", "tiền đề: báo cáo này là dữ liệu nạp từ Excel"
    bc.state_id = _trang_thai(db, "draft").id
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    r = _ghi(client, h, bc.id, bc.version, [{"indicator_code": "B-2.1", "this_period": 6}])
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc.id)["source"] == "live"


# G6 — không N+1 ở đường ghi

def test_ghi_nhieu_o_khong_ton_them_query_moi_o(client, db):
    """`upsert` gọi trong vòng lặp là 1 query MỖI Ô: reviewer đo 7 query cho 1
    ô và 16 cho 10 ô, tức Ctrl+S sau khi điền cả form 53 ô ≈ 59 round-trip
    trên Render free + pooler Supabase. Spec không chốt ngân sách cho PUT nên
    test này KHÔNG khoá một con số, nó khoá đúng tính chất "không N+1": số
    query của lượt ghi 10 ô phải bằng lượt ghi 1 ô."""
    from app.core.db import engine
    from tests.conftest_query import dem_query

    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    # B-1.4 là chỉ tiêu `computed` duy nhất của FM01 — không có đường ghi
    ma_10 = [ma for ma in MA_CHI_TIEU_THEO_THU_TU if ma != "B-1.4"][:10]

    v = _xem(client, h, bc["id"])["version"]
    with dem_query(engine) as mot_o:
        r = _ghi(client, h, bc["id"], v,
                 [{"indicator_code": ma_10[0], "this_period": 1}])
    assert r.status_code == 200, r.text

    v = _xem(client, h, bc["id"])["version"]
    with dem_query(engine) as muoi_o:
        r = _ghi(client, h, bc["id"], v,
                 [{"indicator_code": ma, "this_period": 1} for ma in ma_10])
    assert r.status_code == 200, r.text
    for ma in ma_10:
        assert _o(r.json(), ma)["this_period"] == 1.0, f"{ma} không được ghi"

    assert muoi_o["n"] == mot_o["n"], \
        f"N+1 ở đường ghi: 1 ô = {mot_o['n']} query, 10 ô = {muoi_o['n']} query"
