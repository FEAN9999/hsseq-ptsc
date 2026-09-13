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

    # Khẳng định "không ghi gì" của ca này KHÔNG đi qua GET được:
    # `lay_chi_tiet_bao_cao` ép `acc_total_entered = None` cho MỌI dòng
    # `computed`, nên `o["acc_total_entered"] is None` luôn đúng dù dòng có bị
    # ghi hay không — nó không canh được gì (đo thật: probe ghi 777 vào đúng
    # dòng B-1.4 rồi mới ném 400, ca vẫn xanh). Đọc thẳng `report_value`, và
    # `db.flush()` trước vì `autoflush=False` + fixture `client` ghi đè `get_db`
    # giấu mọi thứ chưa flush khỏi câu SELECT kế tiếp.
    db.flush()
    from app.models import Indicator, ReportValue
    ind = db.query(Indicator).filter_by(code="B-1.4").one()
    assert db.query(ReportValue).filter_by(
        report_id=bc["id"], indicator_id=ind.id).count() == 0, \
        "payload bị từ chối mà dòng tự tính vẫn được ghi"


# --- vòng sửa 1 (task-11-fix-brief.md) --------------------------------------
# (`_KHONG_GUI` và tham số `texts` của `_ghi` ngay dưới đây là mã của Task 23b,
# không phải của vòng sửa 1 — để chung ở đây vì mọi ca dưới banner này gọi cùng
# một hàm trợ giúp.)

# Phân biệt "thân request KHÔNG có khoá `texts`" với "`texts: null`" — hai thứ
# này cùng nghĩa với backend (không đụng report_text) nhưng phải gửi được cả
# hai dạng mới khoá được điều đó.
_KHONG_GUI = object()


def _ghi(client, h, report_id, version, values, texts=_KHONG_GUI):
    than = {"version": version, "values": values}
    if texts is not _KHONG_GUI:
        than["texts"] = texts
    return client.put(f"/api/v1/reports/{report_id}/values", json=than, headers=h)


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

    # Xem chú thích dài về `db.flush()` ở
    # test_texts_ma_ngoai_mau_bao_cao_tra_400_va_khong_ghi_gi: thiếu dòng này thì
    # khẳng định ngay dưới KHÔNG bao giờ thấy dữ liệu đã ghi (autoflush=False +
    # fixture `client` ghi đè `get_db`), tức ca này canh mà không canh gì cả.
    db.flush()
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
    # Xem chú thích dài về `db.flush()` ở
    # test_texts_ma_ngoai_mau_bao_cao_tra_400_va_khong_ghi_gi: thiếu dòng này thì
    # khẳng định ngay dưới KHÔNG bao giờ thấy dữ liệu đã ghi (autoflush=False +
    # fixture `client` ghi đè `get_db`), tức ca này canh mà không canh gì cả.
    db.flush()
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
    # Xem chú thích dài về `db.flush()` ở
    # test_texts_ma_ngoai_mau_bao_cao_tra_400_va_khong_ghi_gi: thiếu dòng này thì
    # khẳng định ngay dưới KHÔNG bao giờ thấy dữ liệu đã ghi (autoflush=False +
    # fixture `client` ghi đè `get_db`), tức ca này canh mà không canh gì cả.
    db.flush()
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
    # Xem chú thích dài về `db.flush()` ở
    # test_texts_ma_ngoai_mau_bao_cao_tra_400_va_khong_ghi_gi: thiếu dòng này thì
    # khẳng định ngay dưới KHÔNG bao giờ thấy dữ liệu đã ghi (autoflush=False +
    # fixture `client` ghi đè `get_db`), tức ca này canh mà không canh gì cả.
    db.flush()
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


# =========================================================================
# Task 23b — hai đường mất dữ liệu ở chỗ Task 22 (dựng form) gặp Task 23
# (lưu form), xem task-23b-brief.md.
# =========================================================================

# --- Lỗ hổng 2: `null` phải XOÁ ô; chỉ trường VẮNG MẶT mới là "giữ nguyên" ---
# Mỗi trường phải khoá CẢ HAI chiều, vì sửa sai một chiều chỉ đổi lỗi mất dữ
# liệu này lấy lỗi mất dữ liệu khác. Chiều "vắng mặt giữ nguyên" của `note` và
# của hai cột `counter` đã có test từ vòng sửa 1 ở trên
# (test_note_luu_that_va_khong_bi_xoa_khi_luot_sau_chi_gui_so,
# test_counter_ghi_mot_cot_khong_xoa_cot_kia,
# test_sua_moi_ghi_chu_cua_dong_dang_co_so_van_luu_duoc) — phần dưới bổ sung
# chiều `null`-xoá cho cả bốn chỗ, cộng hai chiều còn thiếu của `sum`/`snapshot`.

def test_null_xoa_trang_o_thang_nay_cua_dong_sum(client, db):
    """Người nhập gõ nhầm 1000, bôi đen xoá trắng rồi rời ô: FE gửi đúng khoá
    với `this_period: null` (Task 23 đã có ca khoá điều đó). Bản cũ chỉ ghi khi
    `is not None` nên lượt ấy là lệnh không làm gì — dải đầu vẫn báo "Đã lưu",
    tải lại trang thì 1000 quay về và người nhập không hiểu vì sao."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.1", "this_period": 1000}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-1.1")["this_period"] == 1000.0

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.1", "this_period": None}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-1.1")["this_period"] is None, "phản hồi 200 vẫn trả số cũ"
    assert _o(_xem(client, h, bc["id"]), "B-1.1")["this_period"] is None, \
        "tải lại trang thì số đã xoá quay về"


def test_ghi_so_vao_dong_sum_khong_xoa_ghi_chu_cua_chinh_dong_do(client, db):
    """Chiều ngược lại của test trên, cho `sum` — 48/53 chỉ tiêu FM01 là `sum`
    (`Counter({'sum': 48, 'counter': 4, 'computed': 1})`; 43/53 là số dòng
    `decimals=0`, con số của docstring ngay phía trên) nên đây là dòng thường
    gặp nhất. FE chỉ gửi ô ĐÃ đổi, nên payload
    `{indicator_code, this_period}` KHÔNG có khoá `note`: hiểu "vắng mặt" thành
    "xoá" sẽ xoá sạch ghi chú mỗi lần người dùng sửa một con số.
    test_note_luu_that_... ở trên khoá đúng tính chất này nhưng trên dòng
    `counter` (B-1.5), nhánh code khác."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.1", "note": "số của nhà thầu phụ chưa về"}])
    assert r.status_code == 200, r.text

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.1", "this_period": 8}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-1.1")
    assert o["this_period"] == 8.0
    assert o["note"] == "số của nhà thầu phụ chưa về", "ghi ô số đã xoá ghi chú của dòng"


def test_null_xoa_dung_mot_cot_cua_dong_counter_con_cot_kia_giu_nguyen(client, db):
    """`counter` là agg_type DUY NHẤT có hai cột nhập được, nên nó là chỗ duy
    nhất mà nhầm lẫn "vắng mặt" ↔ "null" xoá nhầm sang cột bên cạnh. Bốn lượt
    ghi dưới đây đi đủ hai chiều cho cả hai cột."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.5", "this_period": 7, "acc_total_entered": 20}])
    assert r.status_code == 200, r.text
    assert (_o(r.json(), "B-1.5")["this_period"],
            _o(r.json(), "B-1.5")["acc_total_entered"]) == (7.0, 20.0)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.5", "this_period": None}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-1.5")
    assert o["this_period"] is None, "null không xoá được cột Tháng này"
    assert o["acc_total_entered"] == 20.0, "xoá Tháng này đã xoá lây Cộng dồn"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.5", "this_period": 9}])
    assert r.status_code == 200, r.text

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.5", "acc_total_entered": None}])
    assert r.status_code == 200, r.text
    o = _o(r.json(), "B-1.5")
    assert o["acc_total_entered"] is None, "null không xoá được cột Cộng dồn"
    assert o["this_period"] == 9.0, "xoá Cộng dồn đã xoá lây Tháng này"
    sau = _o(_xem(client, h, bc["id"]), "B-1.5")
    assert (sau["this_period"], sau["acc_total_entered"]) == (9.0, None)


def test_null_xoa_trang_ghi_chu(client, db):
    """`counter_check` khuyên người dùng ghi lý do lệch vào Ghi chú; xoá lại
    lời khuyên đó khi đã hết lệch là thao tác có thật. Không xoá được nghĩa là
    dòng chữ cũ dính vĩnh viễn trên bản in gửi Ban ATCL."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.5", "note": "reset sau LTI 12/08"}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-1.5")["note"] == "reset sau LTI 12/08"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-1.5", "note": None}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-1.5")["note"] is None
    assert _o(_xem(client, h, bc["id"]), "B-1.5")["note"] is None, \
        "tải lại trang thì ghi chú đã xoá quay về"


def _them_chi_tieu_snapshot(db):
    """FM01 KHÔNG khai chỉ tiêu `snapshot` nào (app/seed/catalog_fm01.py chỉ có
    sum/counter/computed), nên nhánh `snapshot` của `ghi_gia_tri` — một trong
    bốn chỗ brief bắt sửa — không có đường dữ liệu thật nào đi qua. Dựng một
    chỉ tiêu snapshot ngay trong transaction của test là cách duy nhất khoá
    được nhánh đó; nó sống và chết cùng transaction, không rò sang test khác."""
    from app.models import Indicator, ReportTemplate, TemplateSection
    tpl = db.query(ReportTemplate).filter_by(code="FM01").one()
    sec = db.query(TemplateSection).filter_by(template_id=tpl.id, code="B-1").one()
    db.add(Indicator(
        template_id=tpl.id, section_id=sec.id, code="S-TEST",
        name_vi="Chỉ tiêu ảnh chụp dựng trong test", agg_type="snapshot",
        formula=None, reset_rule="none", decimals=0, required=False,
        sort_order=999, active=True,
    ))
    db.flush()


def test_dong_snapshot_null_xoa_cong_don_con_truong_vang_mat_giu_nguyen(client, db):
    seed_all(db)
    _them_chi_tieu_snapshot(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "S-TEST", "acc_total_entered": 15}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "S-TEST")["acc_total_entered"] == 15.0

    # trường VẮNG MẶT: lượt chỉ gửi Ghi chú không được đụng cột Cộng dồn
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "S-TEST", "note": "kiểm kê ngày 31/08"}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "S-TEST")["acc_total_entered"] == 15.0, \
        "ghi mỗi Ghi chú đã xoá Cộng dồn của dòng snapshot"

    # trường CÓ MẶT mang null: xoá trắng
    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "S-TEST", "acc_total_entered": None}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "S-TEST")["acc_total_entered"] is None
    assert _o(_xem(client, h, bc["id"]), "S-TEST")["acc_total_entered"] is None


# --- Lỗ hổng 1: ba ô chữ nhóm C phải lưu được ------------------------------
# Trước Task 23b KHÔNG endpoint nào ghi `report_text`: người dùng gõ ghi chú
# nhóm C, dải đầu báo "Đã lưu", đóng tab, chữ mất sạch.

def test_ghi_texts_luu_that_va_GET_doc_lai_dung_noi_dung(client, db):
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    assert _xem(client, h, bc["id"])["texts"] == {"C1": None, "C2": None, "C3": None}, \
        "tiền đề: báo cáo chưa gõ chữ nào"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": "Diễn tập PCCC ngày 12/08"})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"] == {
        "C1": "Diễn tập PCCC ngày 12/08", "C2": None, "C3": None}


def test_texts_vang_mat_hoac_null_khong_dung_toi_chu_da_luu(client, db):
    """Mọi ca test có từ trước Task 23b đều gửi thân KHÔNG có khoá `texts` và
    phải vẫn xanh nguyên — khoá đúng tính chất đó ở đây, cho cả hai dạng
    "vắng mặt" (không có khoá) và `texts: null`."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    assert _ghi(client, h, bc["id"], v, [], texts={"C2": "Huấn luyện tháng 9"}
                ).status_code == 200

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [{"indicator_code": "B-2.1", "this_period": 3}])
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C2"] == "Huấn luyện tháng 9", \
        "lượt ghi không gửi `texts` đã xoá chữ nhóm C"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts=None)
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C2"] == "Huấn luyện tháng 9", \
        "`texts: null` phải là không-đụng-gì, không phải xoá cả ba ô"


def test_texts_chi_ghi_ma_co_mat_ma_vang_mat_giu_nguyen(client, db):
    """Cùng luật "payload một phần" với `values`: người dùng sửa C2 thì C1 và
    C3 phải nguyên vẹn, kể cả khi FE chỉ gửi mỗi ô vừa đổi."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    assert _ghi(client, h, bc["id"], v, [],
                texts={"C1": "nổi bật", "C3": "đề xuất"}).status_code == 200

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C2": "dự kiến tháng tới"})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"] == {
        "C1": "nổi bật", "C2": "dự kiến tháng tới", "C3": "đề xuất"}


def test_texts_null_xoa_trang_o_chu(client, db):
    """`null` là XOÁ TRẮNG, không phải "bỏ qua" — cùng quy ước với `values`.
    Không xoá được thì người nhập dán nhầm cả trang Word vào C1 là kẹt vĩnh
    viễn (textarea rỗng nhưng server vẫn giữ bản cũ)."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    assert _ghi(client, h, bc["id"], v, [], texts={"C1": "dán nhầm"}).status_code == 200

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": None})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C1"] is None


def test_texts_ma_ngoai_mau_bao_cao_tra_400_va_khong_ghi_gi(client, db):
    """Hai đường vào cùng một lỗi: mã không tồn tại ở đâu cả, và mã CÓ THẬT
    nhưng thuộc MẪU KHÁC (mẫu thứ hai dựng ngay trong test — FM01 là mẫu duy
    nhất của seed nên bỏ điều kiện `template_id` vẫn xanh nếu chỉ thử mã bịa).
    Payload bị từ chối không được để lại ô số nào đã ghi: `ghi_gia_tri` kiểm
    trường chữ TRƯỚC vòng ghi, `version` phải đứng yên."""
    seed_all(db)
    from app.models import ReportTemplate, TemplateTextField
    mau_khac = ReportTemplate(code="FM99", name_vi="Mẫu khác (dựng trong test)",
                              name_en=None, period_type="month", version=1, active=True)
    db.add(mau_khac)
    db.flush()
    db.add(TemplateTextField(template_id=mau_khac.id, code="Z9",
                             label_vi="Ô chữ của mẫu khác", sort_order=1))
    db.flush()

    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = _xem(client, h, bc["id"])["version"]
    truoc = _o(_xem(client, h, bc["id"]), "B-2.1")

    # Mã HỢP LỆ đứng trước mã lạ trong cùng dict: vòng kiểm phải duyệt hết, và
    # ô chữ hợp lệ đi kèm cũng không được ghi khi lượt đó bị từ chối.
    for ma in ("C9", "Z9"):
        r = _ghi(client, h, bc["id"], v0,
                 [{"indicator_code": "B-2.1", "this_period": 3}],
                 texts={"C1": "ô hợp lệ đi cùng lượt", ma: "x"})
        assert r.status_code == 400, f"{ma} → {r.status_code} {r.text}"
        assert r.json()["detail"] == "Dữ liệu không hợp lệ", ma
        assert r.json()["errors"] == [
            {"field_code": ma, "message": "Trường chữ không có trong mẫu báo cáo"}], ma

    # `db.flush()` là phần KHÔNG bỏ được của phép kiểm "không ghi gì". Session
    # để `autoflush=False` (core/db.py) nên một ô ghi TRƯỚC lúc ném lỗi không
    # hiện ra ở câu SELECT kế tiếp — nó nằm im trong session rồi đổ xuống DB ở
    # lần flush sau. Thiếu dòng này thì dời phép kiểm trường chữ xuống SAU vòng
    # ghi ô số vẫn xanh (đã đo: đột biến M25 sống), tức bất biến "kiểm xong hết
    # rồi mới ghi" mất hẳn người canh và mọi 400 phải trông cậy vào rollback.
    db.flush()
    assert _xem(client, h, bc["id"])["version"] == v0, "payload bị từ chối mà version vẫn tăng"
    assert _o(_xem(client, h, bc["id"]), "B-2.1") == truoc, \
        "payload bị từ chối mà ô số trong cùng lượt vẫn được ghi"
    assert _xem(client, h, bc["id"])["texts"] == {"C1": None, "C2": None, "C3": None}


def test_texts_ma_la_va_dai_qua_tran_cung_luc_chi_bao_mot_loi(client, db):
    """Cùng quy ước với `validate_values` ("một ô chỉ báo lỗi cụ thể nhất,
    không chồng thêm lỗi lên cùng một mã"): đổi `elif` thành `if` sẽ trả hai
    mục lỗi cho một textarea, FE tô hai câu chồng nhau dưới cùng một ô."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v = _xem(client, h, bc["id"])["version"]

    r = _ghi(client, h, bc["id"], v, [], texts={"C9": "y" * 2001})
    assert r.status_code == 400, r.text
    assert r.json()["errors"] == [
        {"field_code": "C9", "message": "Trường chữ không có trong mẫu báo cáo"}]


def test_texts_tran_2000_dem_KY_TU_va_ap_cho_moi_o_trong_luot(client, db):
    """2000 là con số của thiết kế (dòng 625, 719) và là `maxLength` của
    textarea phía FE. Ranh giới 2000 lưu được / 2001 bị chặn là một nửa; hai
    nửa còn lại từng bị hụt vì payload quá hiền:

    1. Đơn vị là KÝ TỰ, không phải byte. Chuỗi ASCII không phân biệt được hai
       cách đếm, mà ba ô nhóm C là ba ô văn xuôi TIẾNG VIỆT (mỗi ký tự 3 byte
       UTF-8): đếm byte thì người dùng gõ ~667 ký tự đã bị 400 trong khi bộ đếm
       trên màn hình mới hiện 700/2000.
    2. Trần áp cho MỌI ô trong lượt, không riêng ô đầu dict — nên ô vi phạm
       dưới đây đứng THỨ HAI, sau một ô hợp lệ.
    """
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    dung_tran = "ố" * 2000
    qua_tran = "ồ" * 2001
    assert (len(dung_tran), len(dung_tran.encode())) == (2000, 6000), \
        "tiền đề: chuỗi dựng sẵn phải là 2000 KÝ TỰ tiếng Việt = 6000 byte"
    assert len(qua_tran) == 2001

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": dung_tran})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C1"] == dung_tran

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": "ngắn, hợp lệ", "C2": qua_tran})
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Dữ liệu không hợp lệ"
    assert r.json()["errors"] == [
        {"field_code": "C2", "message": "Nội dung tối đa 2000 ký tự"}]
    db.flush()          # xem chú thích `db.flush()` ở ca mã trường chữ lạ
    sau = _xem(client, h, bc["id"])
    assert sau["texts"]["C1"] == dung_tran, "payload bị từ chối mà ô chữ vẫn bị ghi đè"
    assert sau["texts"]["C2"] is None
    assert sau["version"] == v


def test_texts_sai_tren_bao_cao_khong_sua_duoc_van_la_403_chu_khong_phai_400(client, db):
    """Thứ tự kiểm của `ghi_gia_tri` (404 → 403 → 409 → 400) không được xê
    dịch vì có thêm `texts`. Báo cáo đã duyệt phải nhận 403 kể cả khi payload
    còn mang mã trường chữ sai — người nhập cần biết "báo cáo đã khoá", chứ
    không phải một câu lỗi dữ liệu đẩy họ đi sửa payload rồi vẫn hỏng."""
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=h).json()
    da_duyet = next(r for r in ds if r["state"] == "approved")
    r = _ghi(client, h, da_duyet["id"], 1, [], texts={"C9": "x"})
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "Báo cáo ở trạng thái không cho sửa"


def test_version_lech_thang_loi_trong_chu_nen_van_tra_409(client, db):
    """Vế thứ hai của cùng thứ tự đó: lượt vừa lệch `version` vừa mang mã
    trường chữ sai phải nhận 409, không phải 400. Thân 409 mang `version` +
    `values` để FE vẽ lại bảng (hop-dong-loi-backend.md mục 1); đổi thành 400
    thì FE chỉ tô một câu lỗi dữ liệu và người nhập kẹt lại ở bản cũ."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v0 = _xem(client, h, bc["id"])["version"]
    assert _ghi(client, h, bc["id"], v0, [], texts={"C1": "lượt thắng"}).status_code == 200

    r = _ghi(client, h, bc["id"], v0, [], texts={"C9": "mã sai"})
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == "Người khác vừa sửa báo cáo này"
    assert r.json()["version"] == v0 + 1


def test_luot_chi_co_texts_van_tang_version_dung_mot_lan(client, db):
    """Ruling 250: một endpoint, một `version`. Lượt ghi chỉ đụng nhóm C
    (`values` rỗng) vẫn là một lượt ghi — không tăng `version` thì hai tab mở
    song song cùng ghi đè chữ của nhau mà khoá lạc quan không thấy gì."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v0 = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v0, [], texts={"C1": "chỉ có chữ"})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == v0 + 1
    assert _xem(client, h, bc["id"])["version"] == v0 + 1

    # gửi lại version cũ phải 409 — chứng minh version mới là thật, không chỉ
    # là con số trong phản hồi
    r = _ghi(client, h, bc["id"], v0, [], texts={"C1": "ghi đè"})
    assert r.status_code == 409, r.text
    db.flush()          # xem chú thích `db.flush()` ở ca mã trường chữ lạ
    assert _xem(client, h, bc["id"])["texts"]["C1"] == "chỉ có chữ", \
        "lượt bị 409 vẫn ghi được chữ nhóm C"


def test_ghi_texts_lan_hai_cap_nhat_dong_cu_khong_them_dong_moi(client, db):
    """`report_text` khoá chính là (report_id, field_code): INSERT lần hai nổ
    UniqueViolation thành 500 trần ngay ở lần sửa thứ hai của cùng một ô chữ —
    tức lần gõ thứ hai của mọi người dùng."""
    seed_all(db)
    from app.models import ReportText
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    for noi_dung in ("bản nháp", "bản sửa", "bản cuối"):
        v = _xem(client, h, bc["id"])["version"]
        r = _ghi(client, h, bc["id"], v, [], texts={"C1": noi_dung})
        assert r.status_code == 200, f"{noi_dung} → {r.status_code} {r.text}"
        assert _xem(client, h, bc["id"])["texts"]["C1"] == noi_dung

    assert db.query(ReportText).filter_by(report_id=bc["id"], field_code="C1").count() == 1


def test_ghi_texts_chi_dung_bao_cao_dang_sua(client, db):
    """Tương quan `report_id`: bỏ điều kiện đó thì lượt ghi C1 của đơn vị này
    cập nhật nhầm dòng C1 của báo cáo khác (bảng `report_text` chung cho mọi
    báo cáo). GET đã có test tương quan tương tự ở test_reports.py, đường GHI
    thì chưa."""
    seed_all(db)
    from app.models import ReportText
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    khac = _bao_cao_cua(db, "U01", "2026-08")
    db.add(ReportText(report_id=khac.id, field_code="C1", content="chữ của U01"))
    db.flush()

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": "chữ của P05"})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C1"] == "chữ của P05"
    assert db.query(ReportText).filter_by(
        report_id=khac.id, field_code="C1").one().content == "chữ của U01", \
        "lượt ghi đã đụng vào chữ của báo cáo khác"


def test_ghi_texts_cung_luot_voi_values_chi_tang_version_mot_lan(client, db):
    """Ctrl+S sau khi vừa sửa số vừa gõ nhóm C gửi CẢ HAI trong một thân
    request. Hai lần tăng `version` trong một lượt sẽ làm lần lưu kế tiếp của
    chính người đó nhận 409 giả."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v0 = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v0, [{"indicator_code": "B-2.1", "this_period": 4}],
             texts={"C3": "đề nghị cấp thêm găng tay"})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == v0 + 1
    assert _o(r.json(), "B-2.1")["this_period"] == 4.0
    sau = _xem(client, h, bc["id"])
    assert sau["version"] == v0 + 1
    assert sau["texts"]["C3"] == "đề nghị cấp thêm găng tay"
    assert _o(sau, "B-2.1")["this_period"] == 4.0


# =========================================================================
# Task 23b — vòng sửa 1 (task-23b-fix-1.md). Mười một mục dưới đây là KHOÁ
# TEST cho mã đã đúng: người soát tự nghĩ 22 đột biến mới và 11 cái sống, gần
# như tất cả vì hai giả định không bao giờ bị phá trong file này — mọi ca chạy
# trên báo cáo 2026-08 ĐÃ CÓ SẴN dòng `report_value`, và mọi ca `texts` chỉ gửi
# MỘT mã chữ mỗi lượt. Các ca dưới đây phá đúng hai giả định đó.
# =========================================================================

def test_o_chu_rong_duoc_chuan_hoa_ve_null(client, db):
    """FE nạp bằng `noiDung ?? ''` (ReportForm.tsx:182) nên ô bị xoá trắng gửi
    lên `""` chứ KHÔNG phải `null` — đường `null` mà mấy ca trên khoá rất kỹ có
    thể không bao giờ được FE đi qua. Không chuẩn hoá thì `report_text.content`
    có hai cách biểu diễn "rỗng" (`NULL` cho ô chưa ai gõ, `''` cho ô đã xoá) và
    mọi truy vấn `WHERE content IS NOT NULL` ở đường in/xuất sau này đếm sai.
    Khoá cả hai đường ghi: ô ĐÃ CÓ dòng (UPDATE) và ô chưa có dòng (INSERT)."""
    seed_all(db)
    from app.models import ReportText
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    assert _ghi(client, h, bc["id"], v, [], texts={"C1": "có chữ"}).status_code == 200

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": ""})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C1"] is None
    assert db.query(ReportText).filter_by(
        report_id=bc["id"], field_code="C1").one().content is None, \
        "đường UPDATE lưu `''` xuống DB thay vì NULL"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C2": ""})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"]["C2"] is None
    assert db.query(ReportText).filter_by(
        report_id=bc["id"], field_code="C2").one().content is None, \
        "đường INSERT lưu `''` xuống DB thay vì NULL"


def test_hai_o_chu_dang_co_noi_dung_cap_nhat_duoc_trong_cung_mot_luot(client, db):
    """Ctrl+S sau khi sửa CẢ HAI ô chữ đã có nội dung. Nạp trước dòng
    `report_text` mà chỉ lấy mã ĐẦU thì ô thứ hai đi đường INSERT →
    UNIQUE(report_id, field_code) → 500 trần, mất cả lượt gõ (cả số lẫn chữ).
    test_ghi_texts_lan_hai_cap_nhat_dong_cu_... ở trên chỉ gửi MỘT mã mỗi lượt
    nên không thấy."""
    seed_all(db)
    from app.models import ReportText
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    assert _ghi(client, h, bc["id"], v, [],
                texts={"C1": "cũ 1", "C2": "cũ 2"}).status_code == 200

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C1": "mới 1", "C2": "mới 2"})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc["id"])["texts"] == {
        "C1": "mới 1", "C2": "mới 2", "C3": None}
    assert db.query(ReportText).filter_by(report_id=bc["id"]).count() == 2, \
        "ô chữ thứ hai đi đường INSERT thay vì UPDATE"


def test_ghi_chu_dau_tien_cua_dong_tren_bao_cao_moi_tao_khong_bi_nuot(client, db):
    """Báo cáo kỳ mới chưa có dòng `report_value` nào, nên lượt ghi đầu tiên của
    một dòng vừa tạo dòng vừa ghi. Mọi ca khác của file chạy trên báo cáo
    2026-08 đã có sẵn dòng từ fixture, nên lỗi dạng "chỉ ghi khi dòng ĐÃ TỒN
    TẠI" đi lọt hết — mà đó đúng là đường demo."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    tao = client.post("/api/v1/reports",
                      json={"template": "FM01", "period_key": "2026-09"}, headers=h)
    assert tao.status_code == 201, tao.text
    bc_id = tao.json()["id"]
    assert _o(_xem(client, h, bc_id), "B-1.1")["this_period"] is None, \
        "tiền đề: báo cáo mới, chưa có dòng report_value nào"

    r = _ghi(client, h, bc_id, 1, [{"indicator_code": "B-1.1", "this_period": 7,
                                    "note": "ghi chú đầu tiên của dòng"}])
    assert r.status_code == 200, r.text
    o = _o(_xem(client, h, bc_id), "B-1.1")
    assert o["this_period"] == 7.0, "ô số bị nuốt ở lần ghi đầu của dòng"
    assert o["note"] == "ghi chú đầu tiên của dòng", "Ghi chú bị nuốt ở lần ghi đầu của dòng"


def test_dong_sum_ep_NULL_hai_cot_acc_ke_ca_luot_chi_gui_ghi_chu(client, db):
    """Hai dòng ép NULL của nhánh `sum` nằm NGOÀI `if "this_period" in co_mat`
    — cố ý. Fixture ghi cả `acc_prev_entered` lẫn `acc_total_entered` cho MỌI
    dòng, kể cả dòng `sum` vốn không nhập được hai cột đó, và GET trả nguyên cột
    acc của dòng sum rồi tính "Lệch" từ nó. Chui hai dòng ép NULL vào trong `if`
    thì lượt chỉ sửa Ghi chú không chuẩn hoá nữa, cột "Lệch" của 48/53 dòng hiện
    số rác và không có cách nào tự hết. test_dong_sum_ghi_NULL_vao_hai_cot_acc ở
    trên luôn gửi kèm `this_period` nên không phân biệt được."""
    seed_all(db)
    from app.models import Indicator, ReportValue
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    ind = db.query(Indicator).filter_by(code="B-3.2").one()
    rv = db.query(ReportValue).filter_by(report_id=bc["id"], indicator_id=ind.id).one()
    assert ind.agg_type == "sum"
    assert rv.acc_prev_entered is not None and rv.acc_total_entered is not None, \
        "tiền đề: dòng sum nạp từ Excel có sẵn cả hai cột acc"

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-3.2", "note": "chỉ sửa mỗi ghi chú"}])
    assert r.status_code == 200, r.text
    rv = db.query(ReportValue).filter_by(report_id=bc["id"], indicator_id=ind.id).one()
    assert rv.acc_prev_entered is None and rv.acc_total_entered is None, \
        "lượt chỉ sửa Ghi chú không chuẩn hoá hai cột acc của dòng sum"


def test_cot_cong_don_cua_dong_counter_duoc_lam_tron_theo_decimals(client, db):
    """Spec dòng 231: server làm tròn rồi mới lưu. Hai ca `test_quantize_*` ở
    trên chỉ phủ cột "Tháng này"; cột "Cộng dồn" của dòng `counter` đi qua một
    lệnh gán KHÁC nên có thể ghi thẳng giá trị chưa quantize mà không ai thấy.
    Dùng B-1.7 (counter, `decimals=0`) — B-1.5 là `decimals=2` nên 3,5 lưu
    nguyên vẫn hợp lệ, không phân biệt được hai đường."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-1.7", "acc_total_entered": 3.5}])
    assert r.status_code == 200, r.text
    assert _o(r.json(), "B-1.7")["acc_total_entered"] == 4.0, "Cộng dồn chưa được làm tròn"
    assert _o(_xem(client, h, bc["id"]), "B-1.7")["acc_total_entered"] == 4.0


def test_texts_ma_la_mang_null_van_bi_tu_choi_khong_de_lai_dong_rac(client, db):
    """FE xoá trắng một ô gửi `null`. Nếu mã đó lệch phiên bản mẫu thì lượt vẫn
    phải 400: bỏ qua mã mang `null` sẽ đẻ dòng rác trong `report_text`, và
    `GET /reports/{id}` trả thêm khoá lạ trong `texts` (`texts.update(...)`
    không lọc lại theo mẫu) — form mọc thêm một textarea không ai khai."""
    seed_all(db)
    from app.models import ReportText
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)

    v = _xem(client, h, bc["id"])["version"]
    r = _ghi(client, h, bc["id"], v, [], texts={"C9": None})
    assert r.status_code == 400, r.text
    assert r.json()["errors"] == [
        {"field_code": "C9", "message": "Trường chữ không có trong mẫu báo cáo"}]
    db.flush()          # xem chú thích `db.flush()` ở ca mã trường chữ lạ
    assert db.query(ReportText).filter_by(
        report_id=bc["id"], field_code="C9").count() == 0, "mã chữ lạ lọt xuống report_text"
    assert set(_xem(client, h, bc["id"])["texts"]) == {"C1", "C2", "C3"}


def test_hai_o_chu_sai_trong_cung_luot_bao_du_hai_muc_loi(client, db):
    """Cắt `errors` xuống một mục thì FE tô đỏ một textarea, ô thứ hai im lặng:
    người dùng sửa xong ô được tô rồi lưu lại vẫn 400 mà không biết vì sao."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v = _xem(client, h, bc["id"])["version"]

    r = _ghi(client, h, bc["id"], v, [], texts={"C8": "x", "C9": "y"})
    assert r.status_code == 400, r.text
    assert r.json()["errors"] == [
        {"field_code": "C8", "message": "Trường chữ không có trong mẫu báo cáo"},
        {"field_code": "C9", "message": "Trường chữ không có trong mẫu báo cáo"},
    ]


def test_luot_chi_sua_nhom_C_van_doi_source_tu_seed_sang_live(client, db):
    """D21, vế mà test_ghi_song_doi_source_tu_seed_sang_live chưa phủ: một lượt
    ghi SỐNG có thể chỉ đụng ba ô chữ nhóm C, `values` rỗng. Vẫn còn nhãn `seed`
    thì trong buổi demo Ban ATCL không phân biệt được số thật với số mẫu."""
    seed_all(db)
    bc = _bao_cao_cua(db, "U01", "2026-08")
    assert bc.source == "seed", "tiền đề: báo cáo này là dữ liệu nạp từ Excel"
    bc.state_id = _trang_thai(db, "draft").id
    db.flush()

    h = dang_nhap(client, "u01@ptsc.local")
    r = _ghi(client, h, bc.id, bc.version, [], texts={"C1": "chỉ sửa nhóm C"})
    assert r.status_code == 200, r.text
    assert _xem(client, h, bc.id)["source"] == "live"


def test_payload_sai_ca_so_lan_o_chu_thi_bao_loi_SO_truoc(client, db):
    """Thứ tự hai loại 400: lỗi giá trị số (`validate_values`) chạy TRƯỚC lỗi
    trường chữ. Đảo lại thì payload vừa sai số vừa sai mã chữ trả lỗi CHỮ — FE
    tô sai ô, người nhập sửa xong ô chữ mà vẫn 400 không hiểu vì sao."""
    seed_all(db)
    h = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, h)
    v = _xem(client, h, bc["id"])["version"]

    r = _ghi(client, h, bc["id"], v,
             [{"indicator_code": "B-2.1", "this_period": -5}], texts={"C9": "mã chữ sai"})
    assert r.status_code == 400, r.text
    assert r.json()["errors"] == [
        {"indicator_code": "B-2.1", "message": "Số không được âm"}]
