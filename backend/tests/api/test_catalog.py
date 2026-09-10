# backend/tests/api/test_catalog.py
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap


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
