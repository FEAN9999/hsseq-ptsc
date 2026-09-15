# Khoá C-T28c#2 / task-28-scope.md mục 4.2: cors_list phải tách CORS_ORIGINS theo dấu phẩy, bỏ
# khoảng trắng thừa quanh mỗi origin và bỏ qua mục rỗng. Cơ chế đang ĐÚNG, nhưng chưa ai canh —
# hỏng thì triệu chứng là preflight chết im lặng trên trình duyệt, đúng thứ brief Step 2 cảnh báo.
#
# Construct Settings TRỰC TIẾP bằng kwargs (không qua load_settings()) — kwargs thắng mọi biến môi
# trường/.env theo precedence của pydantic-settings, nên kết quả không phụ thuộc conftest.py hay
# backend/.env đang có gì.
from app.core.config import Settings


def _settings(**kw) -> Settings:
    co_so = dict(DATABASE_URL="postgresql+psycopg://x:x@localhost/x", JWT_SECRET="x" * 32)
    return Settings(**{**co_so, **kw})


def test_cors_list_tach_dau_phay_bo_khoang_trang_va_muc_rong():
    s = _settings(
        CORS_ORIGINS="https://hseq-demo.vercel.app, http://localhost:5173 ,, https://b.example.com ,",
    )
    assert s.cors_list == [
        "https://hseq-demo.vercel.app",
        "http://localhost:5173",
        "https://b.example.com",
    ]


def test_cors_list_mot_origin_khong_co_dau_phay():
    # task-28-fix-2.md P7/B2: bản trước dùng ĐÚNG giá trị mặc định của field CORS_ORIGINS
    # ("http://localhost:5173") — ca vẫn xanh dù đột biến `cors_list` bỏ hẳn CORS_ORIGINS, trả một
    # hằng số cố định giống giá trị mặc định đó. Đổi sang một origin KHÁC mặc định để buộc phải
    # THẬT SỰ đọc CORS_ORIGINS thì mới xanh.
    s = _settings(CORS_ORIGINS="https://hseq-demo.vercel.app")
    assert s.cors_list == ["https://hseq-demo.vercel.app"]
