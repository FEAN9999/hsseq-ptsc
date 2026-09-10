# backend/tests/api/test_catalog.py
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap
from tests.conftest import _seed_khung


def test_get_template_tra_du_danh_muc_trang_thai_va_chuyen(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    # brief gốc ghi 55 — CONTEXT.md + test_seed.py::test_seed_du_chi_tieu_va_3_o_van_ban
    # (đã pass trước Task 10) đều khẳng định catalog FM01.xlsx thật có 53 dòng
    # chỉ tiêu; 55 là con số cũ của spec (ghi nhớ office-hours). File là nguồn.
    assert len(t["indicators"]) == 53
    assert len(t["text_fields"]) == 3
    assert {s["code"] for s in t["states"]} == {"draft", "submitted", "returned", "approved"}
    assert {x["action_code"] for x in t["transitions"]} == {"submit", "return", "approve", "reopen"}


def test_org_units_reporting_tra_dung_22(client, db):
    seed_all(db)
    h = dang_nhap(client, "admin@ptsc.local")
    assert len(client.get("/api/v1/org-units/reporting", headers=h).json()) == 22


def test_periods_tra_4_ky_kem_is_open(client, db):
    seed_all(db)
    h = dang_nhap(client, "u01@ptsc.local")
    ky = client.get("/api/v1/templates/FM01/periods", headers=h).json()
    assert [k["period_key"] for k in ky] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    assert [k["period_key"] for k in ky if k["is_open"]] == ["2026-08", "2026-09"]


# --- Vòng sửa 1 (task-10-fix-brief.md F6, F9): endpoint danh mục là trục của
# phân đoạn 3 buổi demo và có 6 mutation liên tiếp sống. Ba test cũ ở trên chỉ
# ĐẾM (`len == 53`, `len == 3`) và so TẬP HỢP một field, nên tráo
# `from_state` ↔ `to_state`, đảo thứ tự chỉ tiêu, trả sai `section_code` /
# `agg_type` / `decimals` đều lọt. Nhóm dưới khoá theo GIÁ TRỊ từng dòng.
# Dùng `_seed_khung(db)` (không nạp fixture số liệu) vì danh mục không đọc
# report_value — rẻ hơn `seed_all(db)` khoảng 200 ms mỗi test.

# Thứ tự 53 chỉ tiêu theo đúng bố cục biểu mẫu nhà nước: 9 nhóm B-1…B-9 liền
# khối, trong mỗi nhóm đánh số lại từ 1. Viết thẳng ra đây (không sinh bằng
# code, không so tập hợp) vì đây LÀ hợp đồng: `Indicator.sort_order` chỉ duy
# nhất trong từng section nên sắp thiếu `TemplateSection.sort_order` sẽ trộn
# các nhóm vào nhau — Task 6 đã ship đúng lỗi này một lần với fm01-catalog.json.
MA_CHI_TIEU_THEO_THU_TU = [
    "B-1.1", "B-1.2", "B-1.3", "B-1.4", "B-1.5", "B-1.6", "B-1.7", "B-1.8",
    "B-2.1", "B-2.2", "B-2.3", "B-2.4", "B-2.5", "B-2.6", "B-2.7", "B-2.8",
    "B-2.9", "B-2.10", "B-2.11", "B-2.12", "B-2.13", "B-2.14", "B-2.15",
    "B-2.16", "B-2.17", "B-2.18",
    "B-3.1", "B-3.2", "B-3.3",
    "B-4.1", "B-4.2",
    "B-5.1", "B-5.2", "B-5.3", "B-5.4", "B-5.5",
    "B-6.1", "B-6.2", "B-6.3",
    "B-7.1", "B-7.2", "B-7.3", "B-7.4",
    "B-8.1", "B-8.2", "B-8.3", "B-8.4", "B-8.5", "B-8.6",
    "B-9.1", "B-9.2", "B-9.3", "B-9.4",
]


def test_get_template_chi_tieu_dung_thu_tu_bo_cuc_bieu_mau(client, db):
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert [i["code"] for i in t["indicators"]] == MA_CHI_TIEU_THEO_THU_TU
    # nhóm phải liền khối: section_code của 53 dòng đi theo đúng thứ tự nhóm,
    # không nhảy qua nhảy lại (bắt cả M30 "section_code luôn A")
    assert [i["section_code"] for i in t["indicators"]] == [
        ma.rsplit(".", 1)[0] for ma in MA_CHI_TIEU_THEO_THU_TU
    ]
    assert [s["code"] for s in t["sections"]] == [
        "A", "B-1", "B-2", "B-3", "B-4", "B-5", "B-6", "B-7", "B-8", "B-9", "C"]
    assert [s["sort_order"] for s in t["sections"]] == list(range(1, 12))


# task-11-carry.md C3: `name_vi`/`name_en` của 11 nhóm không bị khoá theo giá
# trị — tráo hai trường cho nhau (vd trả `name_vi` vào chỗ `name_en`) mà suite
# vẫn xanh 171 passed. `name_en` HIỆN trên UI (header nhóm 11px + title khi
# hover) nên tráo là lỗi thấy được trên form, không phải chi tiết nội bộ. Viết
# thẳng giá trị mong đợi ra đây (không import từ app/seed/catalog_fm01.py) —
# cùng lý do MA_CHI_TIEU_THEO_THU_TU ở trên không import: test phải là một
# nguồn độc lập với code đang bị kiểm, nếu không dữ liệu seed tự sai thì test
# tự sai theo, không bắt được gì.
def test_get_template_ten_11_nhom_dung_gia_tri_khong_trao_vi_en(client, db):
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert [(s["code"], s["name_vi"], s["name_en"]) for s in t["sections"]] == [
        ("A", "THÔNG TIN CHUNG", "General Information"),
        ("B-1", "TỔNG GIỜ CÔNG", "Total Man Hours"),
        ("B-2", "Tai nạn/ Sự cố", "Accident / Incident"),
        ("B-3", "Hướng dẫn, đào tạo, huấn luyện SKATMT", "HSE Training/Presentation/Induction"),
        ("B-4", "Thực tập - Diễn tập", "HSE Exercise/Drill"),
        ("B-5", "Họp an toàn", "HSE Meeting/Talk"),
        ("B-6", "Kiểm tra/ đánh giá SKATMT", "HSE Audit/Inspection/Visit"),
        ("B-7", "Báo cáo công tác an toàn tới Cơ quan chức năng", "HSE Report to Authority"),
        ("B-8", "Quản lý môi trường", "Environmental Management"),
        ("B-9", "Hoạt động SKATMT khác", "Other HSE Activity"),
        ("C", "CÁC HOẠT ĐỘNG NỔI BẬT", "Outstanding HSE activities"),
    ]


def test_get_template_chi_tieu_mau_dung_agg_type_decimals_formula(client, db):
    """FE dựng `cellPolicy` + `zodSchemaFromCatalog` từ chính ba field này:
    `agg_type` sai biến ô `computed`/`counter` thành ô nhập tự do."""
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    theo_ma = {i["code"]: i for i in t["indicators"]}

    assert theo_ma["B-1.1"] == {
        "code": "B-1.1", "section_code": "B-1", "name_vi": "TCT PTSC",
        "name_en": "PTSC Corp.", "unit": "Giờ", "agg_type": "sum",
        "formula": None, "decimals": 2, "required": True, "sort_order": 1}
    assert theo_ma["B-1.4"] == {
        "code": "B-1.4", "section_code": "B-1", "name_vi": "Tổng giờ công",
        "name_en": "Total Man Hours", "unit": "Giờ", "agg_type": "computed",
        "formula": "B-1.1,B-1.2,B-1.3", "decimals": 2, "required": False,
        "sort_order": 4}
    assert theo_ma["B-1.5"]["agg_type"] == "counter"
    assert theo_ma["B-1.5"]["formula"] is None
    # B-2.1 "Chết người" là số vụ — decimals 0, KHÔNG phải 2
    assert theo_ma["B-2.1"]["decimals"] == 0
    assert theo_ma["B-2.1"]["section_code"] == "B-2"
    assert theo_ma["B-9.1"]["section_code"] == "B-9"
    # đúng 53 dòng, và chỉ 1 dòng computed / 4 dòng counter
    assert len(t["indicators"]) == 53
    assert [i["code"] for i in t["indicators"] if i["agg_type"] == "computed"] == ["B-1.4"]
    assert [i["code"] for i in t["indicators"] if i["agg_type"] == "counter"] == [
        "B-1.5", "B-1.6", "B-1.7", "B-1.8"]


def test_get_template_bo_chi_tieu_active_false(client, db):
    _seed_khung(db)
    from app.models import Indicator
    db.query(Indicator).filter_by(code="B-1.2").update({"active": False})
    db.flush()
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert [i["code"] for i in t["indicators"]] == [
        ma for ma in MA_CHI_TIEU_THEO_THU_TU if ma != "B-1.2"]


def test_get_template_text_fields_dung_ba_dong(client, db):
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert t["text_fields"] == [
        {"code": "C1", "label_vi": "Hoạt động nổi bật trong tháng", "sort_order": 1},
        {"code": "C2", "label_vi": "Hoạt động dự kiến cho tháng tới", "sort_order": 2},
        {"code": "C3", "label_vi": "Kiến nghị/ Đề xuất", "sort_order": 3},
    ]


def test_get_template_states_dung_tung_dong(client, db):
    """`counts_in_totals` quyết định báo cáo nào được cộng vào lũy kế
    (spec:153) — chỉ `approved` được True. `is_editable` quyết định form có
    khoá hay không."""
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert t["states"] == [
        {"code": "draft", "name_vi": "Nháp", "is_initial": True,
         "is_editable": True, "counts_in_totals": False, "sort_order": 1},
        {"code": "submitted", "name_vi": "Đã nộp", "is_initial": False,
         "is_editable": False, "counts_in_totals": False, "sort_order": 2},
        {"code": "returned", "name_vi": "Trả lại", "is_initial": False,
         "is_editable": True, "counts_in_totals": False, "sort_order": 3},
        {"code": "approved", "name_vi": "Đã duyệt", "is_initial": False,
         "is_editable": False, "counts_in_totals": True, "sort_order": 4},
    ]


def test_get_template_chuyen_trang_thai_so_tung_dong_khong_so_tap_hop(client, db):
    """Bẫy đắt nhất của dự án (CONTEXT.md nguyên tắc 1): một dòng chuyển trạng
    thái bị xoá, hoặc `from_state`↔`to_state` bị tráo, mà test so tập hợp
    `action_code` thì không thấy — "Nộp báo cáo" sẽ chuyển ngược Đã nộp → Nháp.
    So CẢ SÁU field của từng dòng.

    Endpoint không khai `order_by` cho `transitions` nên thứ tự Postgres trả về
    KHÔNG phải hợp đồng — sắp lại ở đây cho ổn định rồi so từng dòng đầy đủ, chứ
    không phải so tập hợp một field.
    """
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    thuc_te = sorted(
        ((x["action_code"], x["from_state"], x["to_state"], x["name_vi"],
          x["required_permission"], x["requires_note"]) for x in t["transitions"]),
    )
    assert thuc_te == sorted([
        ("submit", "draft", "submitted", "Nộp báo cáo", "report.submit", False),
        ("submit", "returned", "submitted", "Nộp lại", "report.submit", False),
        ("return", "submitted", "returned", "Trả lại", "report.return", True),
        ("approve", "submitted", "approved", "Duyệt", "report.approve", False),
        ("reopen", "approved", "returned", "Mở lại", "report.return", True),
    ])


# task-12-carry.md D2: thêm order_by cho transitions vì FE vẽ nút hành động thẳng
# theo danh sách này — thứ tự TRỞ THÀNH hợp đồng từ đây, khoá bằng một test MỚI,
# không sửa test so-tập-hợp-rồi-tự-sắp ở trên (đúng cách viết khi thứ tự chưa phải
# hợp đồng — vẫn còn giá trị, không xoá).
def test_get_template_chuyen_trang_thai_dung_thu_tu_khong_ngau_nhien(client, db):
    """Thứ tự đúng theo `WorkflowTransition.id` (thứ tự `TRANSITIONS` trong
    `app/seed/__init__.py`) — không sắp lại ở test, để lộ nếu ai bỏ `order_by`
    khỏi `chi_tiet_mau` (Postgres không cam kết thứ tự không `ORDER BY`)."""
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    t = client.get("/api/v1/templates/FM01", headers=h).json()
    assert [(x["action_code"], x["from_state"], x["to_state"]) for x in t["transitions"]] == [
        ("submit", "draft", "submitted"),
        ("submit", "returned", "submitted"),
        ("return", "submitted", "returned"),
        ("approve", "submitted", "approved"),
        ("reopen", "approved", "returned"),
    ]


def test_get_org_units_tra_cay_theo_parent_id_va_giu_is_reporting(client, db):
    """MI-5: `GET /org-units` (cây) chưa có một test nào. Seed chưa gán
    `parent_id` nên cây tạm thời phẳng — tự gán ở đây để cây có thật một tầng,
    nếu không thì "làm phẳng cây" là mutation không thể phát hiện."""
    _seed_khung(db)
    from app.models import OrgUnit
    ban01 = db.query(OrgUnit).filter_by(code="BAN01").one()
    db.query(OrgUnit).filter(OrgUnit.code.in_(["U01", "U02"])).update(
        {"parent_id": ban01.id}, synchronize_session=False)
    db.flush()

    h = dang_nhap(client, "admin@ptsc.local")
    cay = client.get("/api/v1/org-units", headers=h).json()
    ma_goc = [o["code"] for o in cay]
    assert "U01" not in ma_goc and "U02" not in ma_goc
    assert ma_goc[0] == "PTSC"
    nut_ban01 = next(o for o in cay if o["code"] == "BAN01")
    assert [c["code"] for c in nut_ban01["children"]] == ["U01", "U02"]
    # is_reporting phải giữ nguyên giá trị thật của từng đơn vị
    assert nut_ban01["is_reporting"] is False
    assert nut_ban01["type"] == "dept"
    assert [c["is_reporting"] for c in nut_ban01["children"]] == [True, True]
    assert next(o for o in cay if o["code"] == "PTSC")["is_reporting"] is False
    assert 35 == len(ma_goc) + len(nut_ban01["children"])


def test_org_units_reporting_dung_22_dau_moi_dung_ma(client, db):
    _seed_khung(db)
    h = dang_nhap(client, "admin@ptsc.local")
    ds = client.get("/api/v1/org-units/reporting", headers=h).json()
    assert [o["code"] for o in ds] == [f"U{i:02d}" for i in range(1, 18)] + [
        f"P{i:02d}" for i in range(1, 6)]
    assert [o["type"] for o in ds] == ["member_unit"] * 17 + ["project_board"] * 5


def test_danh_muc_fail_closed_khi_thu_hoi_het_vai(client, db):
    """MI-6: người phụ trách chuyển công tác, Ban ATCL xoá vai của họ — token
    12 giờ cũ vẫn còn hạn. `/reports` trả 403 đúng; danh mục trước vòng sửa
    này vẫn trả 200 kèm sơ đồ 35 đơn vị và danh mục 53 chỉ tiêu."""
    _seed_khung(db)
    h = dang_nhap(client, "u01@ptsc.local")  # lấy token TRƯỚC khi thu hồi vai
    from app.models import AppUser, UserRole
    u01 = db.query(AppUser).filter_by(email="u01@ptsc.local").one()
    db.query(UserRole).filter_by(user_id=u01.id).delete()
    db.flush()

    for url in ("/api/v1/templates", "/api/v1/templates/FM01",
                "/api/v1/templates/FM01/periods",
                "/api/v1/org-units", "/api/v1/org-units/reporting",
                "/api/v1/reports?template=FM01"):
        r = client.get(url, headers=h)
        assert r.status_code == 403, f"{url} trả {r.status_code}, đáng lẽ 403"
        assert r.json()["detail"] == "Bạn không có quyền xem báo cáo"
