# backend/tests/api/test_errors.py
from decimal import Decimal

from app.schemas.base import ApiModel, JsonNumber


def test_decimal_ra_json_number_khong_phai_chuoi():
    class M(ApiModel):
        this_period: JsonNumber

    import json
    got = json.loads(M(this_period=Decimal("1284500.50")).model_dump_json())
    assert isinstance(got["this_period"], float), f"ra kiểu {type(got['this_period'])}"
    assert got["this_period"] == 1284500.50


def test_decimal_None_van_la_null():
    class M(ApiModel):
        this_period: JsonNumber

    import json
    assert json.loads(M(this_period=None).model_dump_json())["this_period"] is None


def test_400_co_errors_theo_indicator_code(client):
    from app.core.errors import ValidationError
    from app.main import app

    @app.get("/api/v1/_thu400")
    def _thu():
        raise ValidationError("Dữ liệu không hợp lệ",
                              errors=[{"indicator_code": "B-2.1",
                                       "message": "Ô bắt buộc, chưa có giá trị"}])

    r = client.get("/api/v1/_thu400")
    assert r.status_code == 400
    assert r.json()["errors"][0]["indicator_code"] == "B-2.1"


def test_409_mang_state_va_version(client):
    from app.core.errors import ConflictError
    from app.main import app

    @app.get("/api/v1/_thu409")
    def _thu():
        raise ConflictError("Người khác vừa sửa báo cáo này",
                            state="submitted", version=7)

    r = client.get("/api/v1/_thu409")
    assert r.status_code == 409
    assert r.json()["state"] == "submitted" and r.json()["version"] == 7


def test_moi_cau_loi_deu_tieng_viet(client):
    from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
    for e in (UnauthorizedError("Chưa đăng nhập hoặc phiên đã hết hạn"),
              ForbiddenError("Bạn không có quyền thực hiện thao tác này"),
              NotFoundError("Không tìm thấy báo cáo")):
        assert not any(c in e.detail for c in "{}[]"), "không lộ JSON ra câu lỗi"
        assert e.detail[0].isupper()


def test_tung_lop_loi_dung_ma_http_theo_bang_spec():
    # test_400/test_409 ở trên đã kiểm 400/409 qua HTTP thật; test_auth.py
    # (Task 8, loi.value.status_code) đã kiểm 403 qua đường gọi thẳng hàm;
    # nhiều test ở test_auth.py/test_rbac.py đã kiểm 401 qua /auth/login và
    # /auth/me. Còn 404 (NotFoundError) chưa nơi nào khẳng định bằng số —
    # chỉ tiêu này gộp cả 5 lớp vào một chỗ để chắc không lớp nào bị gán
    # nhầm mã, kể cả lớp đã được kiểm gián tiếp ở nơi khác.
    from app.core.errors import (ConflictError, ForbiddenError, NotFoundError,
                                  UnauthorizedError, ValidationError)
    assert ValidationError("x").status == 400
    assert UnauthorizedError("x").status == 401
    assert ForbiddenError("x").status == 403
    assert NotFoundError("x").status == 404
    assert ConflictError("x").status == 409


def test_422_body_sai_hinh_dang_van_giu_mac_dinh_cua_fastapi(client):
    # Spec: "422 để nguyên mặc định của FastAPI" — dang_ky_handler chỉ được
    # đăng ký cho AppError, không được bắt nhầm RequestValidationError của
    # pydantic (endpoint thật duy nhất có body ở Task 8 là /auth/login).
    r = client.post("/api/v1/auth/login", json={"email": "khong-co-password@ptsc.local"})
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"] == ["body", "password"]
    assert r.json()["detail"][0]["msg"] == "Field required"
