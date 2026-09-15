# task-28-fix-2.md P4 / task-28-review.md A5: test_config.py canh `Settings.cors_list` (chuỗi tách
# đúng theo dấu phẩy) nhưng KHÔNG ca nào canh chỗ DÙNG nó — `app/main.py` nối
# `CORSMiddleware(allow_origins=settings.cors_list, ...)`. Đột biến main.py thành
# `allow_origins=["https://mot-domain-la.example"]` (bỏ hẳn `settings.cors_list`) vẫn 302 passed
# toàn suite trước hai ca này: mọi request khác trong test đi thẳng qua TestClient (không phải
# trình duyệt), và CORS là luật trình duyệt tự áp — chỉ preflight OPTIONS + đọc lại header
# access-control-allow-origin mới khẳng định được server THẬT SỰ cấu hình origin nào.
#
# Dùng `settings.cors_list[0]` (không viết cứng 'http://localhost:5173') để ca này đúng với BẤT KỲ
# giá trị CORS_ORIGINS nào đang cấu hình thật (không chỉ giá trị mặc định) — không đụng
# `backend/app/core/config.py`.
from app.core.config import settings


def test_cors_preflight_cho_phep_origin_nam_trong_cors_list(client):
    origin_dung = settings.cors_list[0]
    r = client.options(
        "/api/v1/health",
        headers={"Origin": origin_dung, "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == origin_dung


def test_cors_preflight_tu_choi_origin_khong_nam_trong_cors_list(client):
    """Chiều ngược: một origin bịa, chắc chắn không nằm trong `settings.cors_list`, không được cấp
    header cho phép — chặn mutant `allow_origin_regex=".*"` (khớp MỌI origin bằng cách echo lại
    nguyên văn) lọt qua ca trên bằng cách tình cờ echo đúng `origin_dung` khi được hỏi đúng nó.
    """
    la = "https://khong-nam-trong-cors-list.example"
    assert la not in settings.cors_list
    r = client.options(
        "/api/v1/health",
        headers={"Origin": la, "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") != la


# Ba tham số còn lại của `CORSMiddleware` — `allow_methods`, `allow_headers`,
# `allow_credentials` — cũng KHÔNG ai canh: siết cả ba đều 305/305 XANH
# (final-review-R1-report.md §(A5), M19/M20/M20b), trong khi đối chứng
# `allow_origins` ĐỎ 1, nên file này có răng và lỗ là thật. Nguyên nhân: hai ca
# trên chỉ preflight bằng `GET` và chỉ đọc lại header
# `access-control-allow-origin` — chúng không bao giờ hỏi bằng method mà FE thật
# sự dùng, cũng không bao giờ đọc hai header kia.
#
# Kịch bản hỏng: siết `allow_methods` về `["GET"]` (hoặc `allow_headers` về
# `[]`, hoặc `allow_credentials=False`) ⇒ trình duyệt chặn MỌI
# `PUT /reports/{id}/values` và `POST /reports/{id}/transition` ngay ở bước
# preflight ⇒ người nhập không lưu và không nộp được gì, mà toàn bộ suite
# backend vẫn XANH và lỗi chỉ hiện trong console trình duyệt.


def _preflight(client, method: str, headers: str | None = None):
    """Preflight đúng hình dạng trình duyệt thật gửi trước một request ghi."""
    h = {"Origin": settings.cors_list[0], "Access-Control-Request-Method": method}
    if headers is not None:
        h["Access-Control-Request-Headers"] = headers
    return client.options("/api/v1/reports/1/values", headers=h)


def test_cors_preflight_cho_phep_method_va_header_ma_FE_that_su_dung(client):
    """`PUT` + `authorization, content-type` — đúng bộ mà `api.put()` của FE
    (`frontend/src/api/client.ts`) làm trình duyệt hỏi trước mỗi lượt lưu."""
    r = _preflight(client, "PUT", "authorization, content-type")
    assert r.status_code == 200, f"preflight bị từ chối: {r.status_code} {r.text}"

    cho_phep = r.headers.get("access-control-allow-methods", "")
    assert "PUT" in cho_phep, f"allow-methods không có PUT: {cho_phep!r}"
    assert "POST" in cho_phep, f"allow-methods không có POST: {cho_phep!r}"

    # `allow_headers=["*"]` làm Starlette DỘI LẠI nguyên văn chuỗi đã hỏi, nên so
    # theo từng mục (viết thường) chứ không so nguyên chuỗi với "*".
    da_cho = {m.strip().lower()
              for m in r.headers.get("access-control-allow-headers", "").split(",")}
    assert {"authorization", "content-type"} <= da_cho, \
        f"allow-headers thiếu header FE gửi: {da_cho}"


def test_cors_preflight_tra_allow_credentials_va_origin_cu_the(client):
    """Hai vế phải đi cùng nhau, một vế không đủ.

    FE gửi `Authorization` nên trình duyệt chỉ chấp nhận phản hồi khi có
    `access-control-allow-credentials: true`. Nhưng `allow_credentials=True`
    cộng `allow_origins=["*"]` làm Starlette **dội lại chính origin thật** thay
    vì trả chuỗi `"*"`, nên một ca chỉ đọc `allow-credentials` vẫn XANH khi ai
    đó nới `allow_origins` — và ngược lại. Ca này khẳng định cả hai: cờ
    credentials có mặt, VÀ origin trả về là origin cụ thể chứ không phải `"*"`
    (trình duyệt từ chối `"*"` khi request mang credentials).
    """
    r = _preflight(client, "PUT", "authorization, content-type")
    assert r.headers.get("access-control-allow-credentials") == "true"
    assert r.headers.get("access-control-allow-origin") == settings.cors_list[0]
