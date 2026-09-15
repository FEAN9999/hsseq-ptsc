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
