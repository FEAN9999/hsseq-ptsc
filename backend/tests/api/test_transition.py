# backend/tests/api/test_transition.py
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.seed import seed_all
from tests.api.test_rbac import dang_nhap

VN = ZoneInfo("Asia/Ho_Chi_Minh")


def _nhap_08(client, h):
    ds = client.get("/api/v1/reports?template=FM01&period=2026-08", headers=h).json()
    return next(r for r in ds if r["state"] == "draft")


def _chuyen(client, h, rid, action, state, version, note=None):
    return client.post(f"/api/v1/reports/{rid}/transition",
                       json={"action": action, "expected_state": state,
                             "version": version, "note": note}, headers=h)


def test_luong_day_du_nop_tra_lai_nop_lai_duyet(client, db):
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]

    r = _chuyen(client, hu, bc["id"], "submit", "draft", v); assert r.status_code == 200
    v = r.json()["version"]
    r = _chuyen(client, ha, bc["id"], "return", "submitted", v, note="Thiếu số B-8")
    assert r.status_code == 200 and r.json()["state"] == "returned"
    v = r.json()["version"]
    r = _chuyen(client, hu, bc["id"], "submit", "returned", v); assert r.status_code == 200
    v = r.json()["version"]
    r = _chuyen(client, ha, bc["id"], "approve", "submitted", v)
    assert r.status_code == 200 and r.json()["state"] == "approved"


def test_409_khi_expected_state_lech(client, db):
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    r = _chuyen(client, hu, bc["id"], "submit", "submitted", v)   # sai trạng thái kỳ vọng
    assert r.status_code == 409 and r.json()["state"] == "draft"


def test_409_khi_version_lech(client, db):
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    assert v == 1
    r = _chuyen(client, hu, bc["id"], "submit", "draft", v - 1)
    assert r.status_code == 409
    # Thân 409 phải mang version HIỆN TẠI của server (1), không phải con số
    # client vừa gửi (0). Đổi `version=r.version` thành `version=version` trong
    # apply_transition mà cả suite vẫn xanh: khi đó FE nhận 409 kèm version CŨ
    # của chính mình, banner "tải lại" gọi lại đúng version đó và nhận 409 tiếp
    # — người nhập kẹt vòng lặp không thoát được. Khoá nguyên thân, không chỉ
    # riêng `version`, để câu lỗi cũng không trôi đi.
    assert r.json() == {"detail": "Người khác vừa sửa báo cáo này",
                        "state": "draft", "version": 1}


def test_return_thieu_ghi_chu_tra_400(client, db):
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    v = _chuyen(client, hu, bc["id"], "submit", "draft", v).json()["version"]
    assert _chuyen(client, ha, bc["id"], "return", "submitted", v).status_code == 400


# task-12-brief.md Step 4 nói rõ test này "cần Task 13 — chạy lại sau Task 13 nếu
# tạm xfail": `GET /dashboard/summary` là sản phẩm của Task 13 (chưa tồn tại,
# `app/api/` chưa có file `dashboard.py`, chưa mount ở `app/main.py`) nên vế thứ
# hai của test (so `approved_count` trước/sau) hiện 404, không phải KeyError sai
# lệch logic. Phần WORKFLOW của test (reopen approved -> returned) tự nó ĐàXANH
# nếu bỏ hai dòng dashboard — xem task-12-report.md mục "Quyết định riêng" về việc
# giữ nguyên assert gốc và tạm xfail thay vì sửa/xoá test, dù task-12-carry.md D3
# nói "sau Task 12 không còn xfail nào" (D3 viết về xfail CÒN LẠI của test_rbac.py,
# không tính test MỚI này — mâu thuẫn nội tại giữa D3 và Step 4 của chính brief).
@pytest.mark.xfail(
    reason="GET /dashboard/summary là sản phẩm Task 13, chưa tồn tại — brief Step 4 "
           "cho phép xfail tạm, gỡ khi Task 13 mount endpoint này.",
    strict=True,
)
def test_reopen_dua_so_ra_khoi_tong(client, db):
    seed_all(db)
    ha = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=ha).json()
    bc = next(r for r in ds if r["state"] == "approved")
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=ha).json()["version"]
    truoc = client.get("/api/v1/dashboard/summary?period=2026-07", headers=ha).json()
    r = _chuyen(client, ha, bc["id"], "reopen", "approved", v, note="Duyệt nhầm đơn vị")
    assert r.status_code == 200 and r.json()["state"] == "returned"
    sau = client.get("/api/v1/dashboard/summary?period=2026-07", headers=ha).json()
    assert sau["approved_count"] == truoc["approved_count"] - 1


def test_is_late_theo_gio_viet_nam(client, db):
    """Render chạy UTC; so giờ naive sẽ gắn nhãn muộn sai 7 tiếng."""
    seed_all(db)
    from app.models import ReportingPeriod
    db.query(ReportingPeriod).filter_by(period_key="2026-08").update(
        {"due_at": datetime(2026, 9, 5, 23, 59, 59, tzinfo=VN)})
    db.flush()
    hu = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    _chuyen(client, hu, bc["id"], "submit", "draft", v)
    from app.models import Report
    r = db.query(Report).filter_by(id=bc["id"]).one()
    assert r.is_late is True                      # hôm nay đã qua 05/09
    assert r.first_submitted_at is not None


def test_is_late_chot_o_lan_nop_dau(client, db):
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    v = _chuyen(client, hu, bc["id"], "submit", "draft", v).json()["version"]
    from app.models import Report
    lan_dau = db.query(Report).filter_by(id=bc["id"]).one().first_submitted_at
    v = _chuyen(client, ha, bc["id"], "return", "submitted", v, note="Sửa lại").json()["version"]
    _chuyen(client, hu, bc["id"], "submit", "returned", v)
    db.expire_all()
    assert db.query(Report).filter_by(id=bc["id"]).one().first_submitted_at == lan_dau


def test_audit_ghi_cung_transaction(client, db):
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    bc = _nhap_08(client, hu)
    v = client.get(f"/api/v1/reports/{bc['id']}", headers=hu).json()["version"]
    _chuyen(client, hu, bc["id"], "submit", "draft", v)
    ls = client.get(f"/api/v1/reports/{bc['id']}/history", headers=hu).json()
    assert any(d["action"] == "submit" for d in ls)


def _lay(client, h, rid):
    return client.get(f"/api/v1/reports/{rid}", headers=h).json()


def _o(values, ma):
    return next(o for o in values if o["indicator_code"] == ma)


def _ghi_o(client, h, rid, version, ma, so):
    return client.put(f"/api/v1/reports/{rid}/values", headers=h,
                      json={"version": version,
                            "values": [{"indicator_code": ma, "this_period": so}]})


def test_vong_tra_lai_sua_nop_lai_chay_that(client, db):
    """Vòng khoá của phân đoạn demo: nộp → trả lại → SỬA THẬT → nộp lại → duyệt.

    Khác `test_luong_day_du_nop_tra_lai_nop_lai_duyet` (nguyên văn brief) ở hai chỗ,
    và cả hai đều là lỗ hổng thật đã đo được:

    1. Khẳng định `version` bằng SỐ CỤ THỂ ở từng bước (1→2→3→4→5→6), không chỉ
       chuyền tay giá trị server vừa trả về. Chuyền tay thì `version` đứng yên,
       hay nhảy 2 mỗi lượt, test vẫn xanh.
    2. Có một `PUT /values` THẬT ở trạng thái `returned`, và một cái BỊ TỪ CHỐI ở
       `submitted`. Đó là chỗ duy nhất khoá `workflow_state.is_editable`: review
       Task 11 đo được rằng đổi phép kiểm của `ghi_gia_tri` thành `code != "draft"`
       vẫn giữ cả suite xanh — mà báo cáo bị trả lại không sửa được thì không bao
       giờ nộp lại được, bế tắc đúng kịch bản demo.
    3. Khoá bộ ba `submitted_at` / `decided_at` / `decided_by` theo GIÁ TRỊ ở
       từng bước. Xoá `r.submitted_at = now` khỏi apply_transition mà cả suite
       vẫn xanh: trên thật mọi báo cáo nộp sống có `submitted_at = NULL`, cột
       "Cập nhật" ở /reports và dải mốc thời gian của form trống, `/status`
       không biết nộp lúc nào; bỏ `decided_at`/`decided_by` thì không ai biết
       ai duyệt và duyệt lúc nào. `is not None` suông không đủ — nó vẫn xanh
       khi `submitted_at` chỉ được ghi ở lượt nộp ĐẦU (lẫn với
       `first_submitted_at`), hay khi `decided_by` lấy nhầm người tạo báo cáo.
       Nên ở đây so: submit KHÔNG đụng cột quyết định, `return` KHÔNG đụng
       `submitted_at`, lượt nộp thứ hai phải ghi lại `submitted_at` MỚI, và
       `decided_by` đúng bằng id người vừa bấm.
    """
    seed_all(db)
    from app.models import AppUser, Report
    id_admin = db.query(AppUser).filter_by(email="admin@ptsc.local").one().id
    id_u22 = db.query(AppUser).filter_by(email="u22@ptsc.local").one().id
    hu = dang_nhap(client, "u22@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")
    rid = _nhap_08(client, hu)["id"]
    assert _lay(client, hu, rid)["version"] == 1

    def _moc():
        """(submitted_at, decided_at, decided_by) đọc thẳng từ DB — `decided_by`
        không có trong thân `GET /reports/{id}`."""
        db.expire_all()
        bc = db.query(Report).filter_by(id=rid).one()
        return bc.submitted_at, bc.decided_at, bc.decided_by

    assert _moc() == (None, None, None), "báo cáo nháp chưa nộp, chưa ai quyết định"

    r = _chuyen(client, hu, rid, "submit", "draft", 1)
    assert (r.status_code, r.json()) == (200, {"state": "submitted", "version": 2})
    nop_1, quyet_1, ai_1 = _moc()
    assert nop_1 is not None, "submit phải ghi submitted_at"
    assert (quyet_1, ai_1) == (None, None), "submit KHÔNG phải một quyết định"

    # submitted: is_editable = false → không sửa được
    assert _ghi_o(client, hu, rid, 2, "B-2.1", 7).status_code == 403

    r = _chuyen(client, ha, rid, "return", "submitted", 2, note="Thiếu số B-8")
    assert (r.status_code, r.json()) == (200, {"state": "returned", "version": 3})
    assert _lay(client, hu, rid)["header"]["decision_note"] == "Thiếu số B-8"
    nop_2, tra_luc, ai_tra = _moc()
    assert nop_2 == nop_1, "`return` không được đụng submitted_at"
    assert tra_luc is not None and tra_luc >= nop_1
    assert ai_tra == id_admin != id_u22, "decided_by là người BẤM, không phải người tạo"

    # returned: is_editable = true → SỬA ĐƯỢC, và số sửa phải lưu thật
    r = _ghi_o(client, hu, rid, 3, "B-2.1", 7)
    assert r.status_code == 200 and r.json()["version"] == 4
    assert _o(r.json()["values"], "B-2.1")["this_period"] == 7

    r = _chuyen(client, hu, rid, "submit", "returned", 4)
    assert (r.status_code, r.json()) == (200, {"state": "submitted", "version": 5})
    nop_3, quyet_3, ai_3 = _moc()
    assert nop_3 > nop_1, "mỗi lượt nộp ghi lại submitted_at, không chỉ lượt đầu"
    assert (quyet_3, ai_3) == (tra_luc, id_admin), "submit KHÔNG đụng cột quyết định"

    r = _chuyen(client, ha, rid, "approve", "submitted", 5)
    assert (r.status_code, r.json()) == (200, {"state": "approved", "version": 6})
    nop_4, duyet_luc, ai_duyet = _moc()
    assert nop_4 == nop_3, "`approve` không được đụng submitted_at"
    assert duyet_luc > tra_luc, "approve phải ghi decided_at MỚI, không giữ mốc lượt trả lại"
    assert ai_duyet == id_admin

    cuoi = _lay(client, ha, rid)
    assert cuoi["state"] == "approved" and cuoi["version"] == 6
    assert _o(cuoi["values"], "B-2.1")["this_period"] == 7
    # cùng ba mốc đó phải đi ra được tới API, không chỉ nằm trong DB
    assert cuoi["header"]["submitted_at"] is not None
    assert cuoi["header"]["decided_at"] is not None


def test_reopen_tu_approved_ve_returned_va_ra_khoi_tong(client, db):
    """Dòng chuyển trạng thái thứ 5 (`reopen`, approved → returned).

    Phần WORKFLOW của `test_reopen_dua_so_ra_khoi_tong` (đang xfail vì
    `GET /dashboard/summary` là sản phẩm Task 13). Khẳng định "ra khỏi tổng" bằng
    CHÍNH cột quyết định điều đó — `workflow_state.counts_in_totals` — thay vì qua
    dashboard: approved đếm vào tổng, returned thì không. Không có test này thì
    xoá hẳn dòng `reopen` khỏi bảng chuyển trạng thái không ai thấy (cả suite chỉ
    còn cái xfail đụng tới nó).
    """
    seed_all(db)
    from app.models import Report, WorkflowState
    ha = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=ha).json()
    rid = next(r for r in ds if r["state"] == "approved")["id"]
    v = _lay(client, ha, rid)["version"]

    def trang_thai():
        db.expire_all()
        r = db.query(Report).filter_by(id=rid).one()
        return db.query(WorkflowState).filter_by(id=r.state_id).one()

    truoc = trang_thai()
    assert (truoc.code, truoc.counts_in_totals) == ("approved", True)

    r = _chuyen(client, ha, rid, "reopen", "approved", v, note="Duyệt nhầm đơn vị")
    assert (r.status_code, r.json()) == (200, {"state": "returned", "version": v + 1})

    sau = trang_thai()
    assert (sau.code, sau.counts_in_totals) == ("returned", False)


def test_reopen_thieu_ghi_chu_tra_400_va_khong_doi_trang_thai(client, db):
    """`reopen` cũng `requires_note = true` như `return` — bỏ cờ đó ở một trong
    hai dòng mà chỉ có test cho `return` thì không ai thấy."""
    seed_all(db)
    ha = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=ha).json()
    rid = next(r for r in ds if r["state"] == "approved")["id"]
    v = _lay(client, ha, rid)["version"]

    r = _chuyen(client, ha, rid, "reopen", "approved", v)
    assert r.status_code == 400
    assert r.json()["detail"] == "Thao tác này bắt buộc có ghi chú"
    con = _lay(client, ha, rid)
    assert (con["state"], con["version"]) == ("approved", v)


def test_action_khong_co_dong_trong_bang_tra_409(client, db):
    """`approve` từ `draft` không có dòng nào trong `workflow_transition` → 409
    kèm trạng thái + version HIỆN TẠI để FE vẽ lại nút. Đây là phép kiểm "bảng
    chuyển trạng thái là nguồn chân lý": nếu `tim_transition` bỏ lọc
    `from_state_id` thì lượt này lại thành 200 và duyệt thẳng từ nháp."""
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")
    rid = _nhap_08(client, hu)["id"]

    r = _chuyen(client, ha, rid, "approve", "draft", 1)
    assert r.status_code == 409
    # `name_vi` của dòng `approve` trong workflow_transition ("Duyệt"), KHÔNG
    # phải mã action tiếng Anh client gửi lên — mọi `detail` là tiếng Việt.
    assert r.json() == {"detail": 'Không thể "Duyệt" ở trạng thái hiện tại',
                        "state": "draft", "version": 1}
    assert _lay(client, ha, rid)["state"] == "draft"


def test_action_la_khong_lot_chuoi_client_gui_len_vao_cau_loi(client, db):
    """`action` là chuỗi TỰ DO từ thân request, không đối chiếu danh mục.

    Mã lạ không có dòng nào trong `workflow_transition` nên cũng không có
    `name_vi` nào để hiện — câu lỗi phải lùi về câu chung, vẫn tiếng Việt, và
    tuyệt đối không dội ngược nguyên văn chuỗi client gửi lên.
    """
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    rid = _nhap_08(client, hu)["id"]

    r = _chuyen(client, hu, rid, "<script>alert(1)</script>", "draft", 1)
    assert r.status_code == 409
    assert r.json() == {"detail": "Không thể thực hiện thao tác này ở trạng thái hiện tại",
                        "state": "draft", "version": 1}
    assert _lay(client, hu, rid)["state"] == "draft"


def test_moi_action_doi_dung_quyen_cua_dong_do(client, db):
    """Người nhập có `report.submit` nhưng KHÔNG có `report.return`/`report.approve`.

    Endpoint chỉ kiểm quyền THÔ ("có ít nhất một quyền chuyển trạng thái của mẫu
    này") nên lượt này qua được tầng dependency — quyền CHÍNH XÁC theo `action` do
    `apply_transition` kiểm. Bỏ phép kiểm đó là người nhập tự duyệt báo cáo của
    chính mình.
    """
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    rid = _nhap_08(client, hu)["id"]
    assert _chuyen(client, hu, rid, "submit", "draft", 1).status_code == 200

    for action in ("return", "approve"):
        r = _chuyen(client, hu, rid, action, "submitted", 2, note="tự duyệt")
        assert r.status_code == 403, action
        assert r.json()["detail"] == "Bạn không có quyền thực hiện thao tác này"
    assert _lay(client, hu, rid)["state"] == "submitted"


def test_pham_vi_o_endpoint_chuyen_trang_thai_403_chu_khong_phai_422(client, db):
    """Người nhập U01 không được chuyển trạng thái báo cáo của U02 — kể cả khi
    thân request THIẾU field bắt buộc.

    FastAPI validate thân request SAU vòng dependency, nên kiểm phạm vi trong
    thân hàm route khiến lượt thứ hai dưới đây trả 422 (thiếu `expected_state`)
    thay vì 403: rò ra rằng báo cáo đó có tồn tại, và che mất lỗi phân quyền
    thật (Task 10 đã vấp đúng bẫy này ở `GET /reports`).
    """
    seed_all(db)
    from app.models import OrgUnit, Report
    h = dang_nhap(client, "u01@ptsc.local")
    u02 = db.query(OrgUnit).filter_by(code="U02").one()
    rid = db.query(Report).filter_by(org_unit_id=u02.id).first().id

    day_du = _chuyen(client, h, rid, "submit", "draft", 1)
    assert day_du.status_code == 403
    assert day_du.json()["detail"] == "Bạn không có quyền chuyển trạng thái báo cáo của đơn vị này"

    thieu_field = client.post(f"/api/v1/reports/{rid}/transition",
                              json={"action": "submit"}, headers=h)
    assert thieu_field.status_code == 403


def test_nop_khi_thieu_o_bat_buoc_tra_400_va_giu_nguyen_draft(client, db):
    """Nộp phải kiểm ô bắt buộc trên TOÀN BỘ báo cáo (spec D10), không phải trên
    payload một phần của `PUT /values` (xem docstring `validate_values`).

    Báo cáo kỳ 2026-09 vừa tạo chưa có dòng `report_value` nào nên mọi chỉ tiêu
    `required` đều thiếu. Khẳng định ĐÚNG câu lỗi, không chỉ đếm: câu "Dòng tự
    tính, không nhận giá trị gửi lên" ở đây là dấu hiệu của lỗi đã sửa trong
    Task 12 (nạp cả cột không nhập-được vào `validate_values` làm mọi dòng `sum`
    có số fixture trông như dòng tự tính, và báo cáo demo không nộp được).
    """
    seed_all(db)
    hu = dang_nhap(client, "u22@ptsc.local")
    tao = client.post("/api/v1/reports", headers=hu,
                      json={"template": "FM01", "period_key": "2026-09"})
    assert tao.status_code == 201
    rid = tao.json()["id"]

    r = _chuyen(client, hu, rid, "submit", "draft", 1)
    assert r.status_code == 400
    than = r.json()
    assert than["detail"] == "Dữ liệu không hợp lệ"
    assert {"indicator_code": "B-1.1", "message": "Ô bắt buộc, chưa có giá trị"} in than["errors"]
    assert {e["message"] for e in than["errors"]} == {"Ô bắt buộc, chưa có giá trị"}
    con = _lay(client, hu, rid)
    assert (con["state"], con["version"]) == ("draft", 1)


def test_is_late_false_khi_han_con_3_tieng_khong_lech_mui_gio(client, db):
    """Cặp đối của `test_is_late_theo_gio_viet_nam`: hạn còn 3 tiếng → KHÔNG muộn.

    Khoá hai lỗi cùng lúc:
      - đảo dấu so sánh (`now < due_at`): lượt này thành muộn;
      - dán nhãn múi giờ sai 7 tiếng (lấy giờ treo tường VN rồi gắn `tzinfo=UTC`,
        đúng lỗi mà docstring test kia cảnh báo): "bây giờ" nhảy lên 7 tiếng, quá
        mốc 3 tiếng, cũng thành muộn.
    """
    seed_all(db)
    from app.models import Report, ReportingPeriod
    db.query(ReportingPeriod).filter_by(period_key="2026-08").update(
        {"due_at": datetime.now(VN) + timedelta(hours=3)})
    db.flush()
    hu = dang_nhap(client, "u22@ptsc.local")
    rid = _nhap_08(client, hu)["id"]
    assert _chuyen(client, hu, rid, "submit", "draft", 1).status_code == 200

    db.expire_all()
    r = db.query(Report).filter_by(id=rid).one()
    assert r.is_late is False
    assert r.first_submitted_at is not None


def test_history_ghi_dung_tung_buoc_va_khong_ghi_luot_bi_tu_choi(client, db):
    """`GET /history` phải kể đúng câu chuyện: ai làm gì, từ trạng thái nào sang
    trạng thái nào, theo đúng thứ tự.

    Cũng khoá quyết định D1 (task-12-carry.md): CHỈ audit lượt THÀNH CÔNG. Lượt
    bị từ chối (403 dưới đây) không được để lại dòng nào — `get_db()` rollback cả
    request lỗi nên một dòng audit ghi ở đó sẽ biến mất, và `/history` sẽ nói dối
    theo kiểu khó phát hiện nhất: có lúc có, có lúc không.
    """
    seed_all(db)
    from app.models import AppUser
    id_u22 = db.query(AppUser).filter_by(email="u22@ptsc.local").one().id
    id_admin = db.query(AppUser).filter_by(email="admin@ptsc.local").one().id
    hu = dang_nhap(client, "u22@ptsc.local")
    ha = dang_nhap(client, "admin@ptsc.local")
    rid = _nhap_08(client, hu)["id"]

    _chuyen(client, hu, rid, "submit", "draft", 1)
    assert _chuyen(client, hu, rid, "approve", "submitted", 2).status_code == 403  # bị từ chối
    _chuyen(client, ha, rid, "return", "submitted", 2, note="Thiếu số B-8")
    _chuyen(client, hu, rid, "submit", "returned", 3)
    _chuyen(client, ha, rid, "approve", "submitted", 4)

    ls = client.get(f"/api/v1/reports/{rid}/history", headers=hu).json()
    assert [(d["action"], d["actor_id"], d["before"]["state"], d["after"]["state"],
             d["before"]["version"], d["after"]["version"])
            for d in reversed(ls) if d["action"] != "seed_import"] == [
        ("submit",  id_u22,  "draft",     "submitted", 1, 2),
        ("return",  id_admin, "submitted", "returned",  2, 3),
        ("submit",  id_u22,  "returned",  "submitted", 3, 4),
        ("approve", id_admin, "submitted", "approved",  4, 5),
    ]


def test_history_dong_seed_import_co_before_null(client, db):
    """Hợp đồng hai hình dạng dòng của `/history` (HistoryItemOut).

    Dòng `seed_import` (do app/seed/fixture.py ghi, là dòng ĐẦU của mọi báo cáo
    nạp từ fixture) có `before = null` và `after` chỉ mang `note`; dòng chuyển
    trạng thái có `before`/`after` là ảnh chụp cột workflow đầy đủ. Khoá cả hai
    ở đây để `response_model` không âm thầm bị bỏ đi, và để không ai "chuẩn hoá"
    dòng seed bằng cách bịa `before` cho nó — test của chính Task 12 phải lọc
    `action != "seed_import"` chính vì hình dạng này.
    """
    seed_all(db)
    ha = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/reports?template=FM01&period=2026-07", headers=ha).json()
    rid = next(r for r in ds if r["state"] == "approved")["id"]
    v = _lay(client, ha, rid)["version"]
    assert _chuyen(client, ha, rid, "reopen", "approved", v,
                   note="Duyệt nhầm đơn vị").status_code == 200

    ls = client.get(f"/api/v1/reports/{rid}/history", headers=ha).json()
    seed = [d for d in ls if d["action"] == "seed_import"]
    assert len(seed) == 1
    assert seed[0]["before"] is None
    assert seed[0]["after"] == {"note": "nạp từ file tổng hợp kỳ 2026-07"}

    chuyen = [d for d in ls if d["action"] == "reopen"]
    assert len(chuyen) == 1
    assert set(chuyen[0]["before"]) == {
        "state", "version", "source", "submitted_at", "first_submitted_at",
        "decided_at", "decided_by", "decision_note", "is_late"}
    assert (chuyen[0]["before"]["state"], chuyen[0]["after"]["state"]) == ("approved", "returned")


def test_history_ngoai_pham_vi_tra_403(client, db):
    """`/history` dùng cùng hợp đồng phạm vi với `GET /reports/{id}` —
    `require_permission` không kiểm phạm vi, quên `pham_vi_bao_cao` ở đây là rò
    lịch sử của cả 22 đơn vị cho đúng endpoint này."""
    seed_all(db)
    from app.models import OrgUnit, Report
    h = dang_nhap(client, "u01@ptsc.local")
    u02 = db.query(OrgUnit).filter_by(code="U02").one()
    rid = db.query(Report).filter_by(org_unit_id=u02.id).first().id
    assert client.get(f"/api/v1/reports/{rid}/history", headers=h).status_code == 403


def test_apply_transition_tu_kiem_pham_vi_khi_goi_thang_khong_qua_http(db):
    """`apply_transition` TỰ CHỦ về phân quyền (docstring `app/services/workflow.py`):
    gọi thẳng từ một script quản trị, không đi qua dependency nào của FastAPI, thì
    vẫn phải chặn người nhập đụng báo cáo của đơn vị khác.

    Qua đường HTTP hai phép kiểm phạm vi CHE NHAU: `_kiem_quyen_chuyen_trang_thai`
    (endpoint) chặn trước nên bỏ hẳn phép kiểm phạm vi trong service mà cả suite
    vẫn xanh — đo được, xem mutation M19 trong task-12-report.md. Test này gọi
    thẳng hàm để phép kiểm của service có test riêng của nó.

    `reopen` chứ không phải `submit`: thứ tự kiểm trong `apply_transition` là
    (2) expected_state/version → (3) có dòng chuyển trạng thái → (4) quyền + phạm
    vi, nên muốn chạm tới nhánh phạm vi thì action phải hợp lệ từ trạng thái hiện
    tại (báo cáo fixture là `approved`) và actor phải CÓ quyền của dòng đó
    (`report.return`), chỉ sai mỗi phạm vi.
    """
    seed_all(db)
    from app.api.deps import CurrentUser
    from app.core.errors import ForbiddenError
    from app.models import AppUser, OrgUnit, Report
    from app.services.workflow import apply_transition

    u01 = db.query(AppUser).filter_by(email="u01@ptsc.local").one()
    dv_u01 = db.query(OrgUnit).filter_by(code="U01").one()
    dv_u02 = db.query(OrgUnit).filter_by(code="U02").one()
    bc = db.query(Report).filter_by(org_unit_id=dv_u02.id).first()
    actor = CurrentUser(
        id=u01.id, org_unit_id=dv_u01.id,
        permissions={"report.return", "report.view_own_unit"},
        scope={"report.return": {dv_u01.id}, "report.view_own_unit": {dv_u01.id}},
    )

    with pytest.raises(ForbiddenError) as loi:
        apply_transition(db, bc.id, "reopen", "Duyệt nhầm", "approved", bc.version, actor)
    assert loi.value.detail == "Bạn không có quyền thực hiện thao tác này trên đơn vị này"
    assert db.query(Report).filter_by(id=bc.id).one().version == bc.version
