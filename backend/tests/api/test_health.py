def test_health_tra_200_khi_db_song(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_tra_503_khi_db_chet(client, monkeypatch):
    from app.api import health

    def db_hong():
        raise RuntimeError("connection refused")

    monkeypatch.setattr(health, "ping_db", db_hong)
    r = client.get("/api/v1/health")
    assert r.status_code == 503
    assert r.json() == {"status": "down"}


def test_ping_db_that_su_goi_engine_khong_phai_no_op(client, monkeypatch):
    """Khoá C-T28c#1 / task-28-scope.md mục 4.1: ping_db() phải THẬT SỰ mở engine.connect() và
    chạy một truy vấn — đây là TOÀN BỘ lý do UptimeRobot ping /health mỗi 5 phút giữ được Supabase
    không pause sau 7 ngày. Một /health "tối ưu" thành trả 200 vô điều kiện (không chạm DB nữa)
    vẫn giữ Render thức nhưng để Supabase ngủ — hỏng CÂM, phát hiện đúng vào buổi demo.

    Hai ca phía trên (200/503) monkeypatch THẲNG `ping_db` nên chỉ canh route xử lý đúng khi
    `ping_db` ném lỗi — không canh được NỘI DUNG của chính `ping_db`. Ca này vá ở tầng THẤP HƠN
    (chính `engine` mà `ping_db` dùng), không đụng `ping_db`: nếu ai đó rút `ping_db()` xuống
    `pass` (bỏ hẳn `engine.connect()`), engine hỏng thay vào đây không còn được gọi tới nữa, và ca
    sẽ đỏ đúng lúc cần đỏ.
    """
    from sqlalchemy import create_engine

    from app.api import health

    # Cổng 1 trên loopback: không service nào lắng nghe (cần quyền root mới BIND được, còn CONNECT
    # tới thì ai cũng làm được) — hệ điều hành từ chối kết nối NGAY, không có gì để đợi timeout.
    engine_hong = create_engine("postgresql+psycopg://x:x@127.0.0.1:1/khong_ton_tai")
    monkeypatch.setattr(health, "engine", engine_hong)
    r = client.get("/api/v1/health")
    assert r.status_code == 503
    assert r.json() == {"status": "down"}


def test_ping_db_chay_that_truy_van_khi_connect_thanh_cong(monkeypatch):
    """task-28-fix-2.md P7/B1: ca trên chỉ canh được NHÁNH LỖI của `engine.connect()` (cổng không
    ai lắng nghe) — connect() tự ném TRƯỚC khi kịp chạm dòng `conn.execute(...)`, nên nếu ai đó viết
    lại `ping_db()` thành `with engine.connect(): pass` (bỏ hẳn `conn.execute(text("SELECT 1"))`),
    ca trên VẪN đỏ giống hệt, không phân biệt được có hay không có lệnh execute — mutation đó SỐNG.

    Ca này giả một `engine` mà `connect()` LUÔN THÀNH CÔNG (không đụng DB thật), để bắt buộc phải
    chạm tới `execute()` thật thì assertion mới xanh — đúng phần bổ khuyết mà ca trên không canh
    tới, không thay thế nó (hai ca canh hai nhánh khác nhau của cùng một hàm).
    """
    from sqlalchemy import text

    from app.api import health

    class ConnGia:
        def __init__(self) -> None:
            self.cau_lenh: list[object] = []

        def execute(self, cau_lenh: object) -> None:
            self.cau_lenh.append(cau_lenh)

        def __enter__(self) -> "ConnGia":
            return self

        def __exit__(self, *_a: object) -> bool:
            return False

    class EngineGia:
        def __init__(self) -> None:
            self.conn = ConnGia()

        def connect(self) -> ConnGia:
            return self.conn

    engine_gia = EngineGia()
    monkeypatch.setattr(health, "engine", engine_gia)
    health.ping_db()
    assert len(engine_gia.conn.cau_lenh) == 1
    assert str(engine_gia.conn.cau_lenh[0]) == str(text("SELECT 1"))
