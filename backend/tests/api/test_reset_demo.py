# backend/tests/api/test_reset_demo.py
"""Test `scripts/reset_demo.py`: hai cầu chì (`--yes`, `APP_ENV`) và `reset()`.

Cầu chì `APP_ENV` là fail-closed (task-14-carry.md, khác brief gốc): chỉ chạy
khi `APP_ENV` nằm trong tập môi trường an toàn biết trước
(`scripts.reset_demo.MOI_TRUONG_AN_TOAN`); mọi giá trị khác — kể cả thiếu hẳn
biến, ca hay gặp nhất khi thiếu cấu hình trên server — đều bị từ chối, không
chỉ riêng `production`.

Không gọi `main(["--yes"])` thật trong suite: hai cầu chì đều thoát TRƯỚC khi
mở `SessionLocal()` nên test qua `main()` vẫn là thật, nhưng nếu code sai
(cầu chì bị nới lỏng) và thật sự chạy tới `SessionLocal()`, nó sẽ commit một
lượt xoá + seed ra ngoài transaction của fixture `db` và làm hỏng các test
khác — đây chính là ca mutation cần khoá, không phải lý do để né test.
`test_reset_xoa_sach_ca_nam_bang...` khoá riêng bước xoá của `reset()` (gọi
trực tiếp, qua fixture `db`, không qua `main()`) bằng cách vô hiệu `seed_all`.
"""
import pytest

from app.seed import seed_all


def test_tu_choi_khi_thieu_co_yes(monkeypatch):
    from scripts.reset_demo import main
    with pytest.raises(SystemExit) as e:
        main([])
    assert e.value.code == 1


def test_tu_choi_khi_APP_ENV_production(monkeypatch):
    from scripts.reset_demo import main
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit) as e:
        main(["--yes"])
    assert e.value.code == 1


def test_tu_choi_khi_APP_ENV_khong_dat(monkeypatch):
    """Thiếu hẳn biến APP_ENV (lỗi cấu hình hay gặp khi dựng server) phải bị
    từ chối giống hệt một giá trị nguy hiểm — mặc định là TỪ CHỐI, không phải
    cho phép. Đây là test carry E3 yêu cầu thêm, brief gốc không có."""
    from scripts.reset_demo import main
    monkeypatch.delenv("APP_ENV", raising=False)
    with pytest.raises(SystemExit) as e:
        main(["--yes"])
    assert e.value.code == 1


def test_thong_bao_tu_choi_neu_ro_gia_tri_APP_ENV_hien_tai(monkeypatch, capsys):
    """Thông báo từ chối phải nói rõ APP_ENV đang là gì, không chỉ thoát im lặng.

    (task-14-fix-brief.md S5) Giá trị nêu bằng ngoặc kép thường ("production"),
    không phải repr() kiểu Python ('production') — đổi assert cũ theo đúng
    format mới, không đổi ý nghĩa của test.
    """
    from scripts.reset_demo import main

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit):
        main(["--yes"])
    assert '"production"' in capsys.readouterr().out

    monkeypatch.delenv("APP_ENV", raising=False)
    with pytest.raises(SystemExit):
        main(["--yes"])
    assert "chưa được đặt" in capsys.readouterr().out


def test_thong_bao_APP_ENV_chi_duong_lenh_dung(monkeypatch, capsys):
    """Người bị chặn đang đứng trước giờ demo, không có thời gian tra tài liệu —
    thông báo phải tự chỉ lệnh đúng, không chỉ nêu vấn đề (task-14-fix-brief.md
    S2: reviewer chạy đúng lệnh trong tài liệu ở shell sạch thì bị chặn vì
    pydantic-settings đọc `.env` vào `settings`, không export ra os.environ)."""
    from scripts.reset_demo import main

    monkeypatch.delenv("APP_ENV", raising=False)
    with pytest.raises(SystemExit):
        main(["--yes"])
    assert "APP_ENV=local" in capsys.readouterr().out


def test_APP_ENV_demo_duoc_chap_nhan(monkeypatch):
    """demo là môi trường Render thật (Task 28, task-14-fix-brief.md S1) — chính
    script này sinh ra để reset nó trước mỗi lượt demo. Không chạy reset() thật:
    monkeypatch SessionLocal và reset() thành no-op, chỉ khẳng định main()
    KHÔNG ném SystemExit khi APP_ENV=demo."""
    import scripts.reset_demo as reset_demo

    class _PhienGia:
        def __enter__(self):
            return self

        def __exit__(self, *ngoai_le):
            return False

        def commit(self):
            pass

    monkeypatch.setenv("APP_ENV", "demo")
    monkeypatch.setattr(reset_demo, "SessionLocal", _PhienGia)
    monkeypatch.setattr(reset_demo, "reset", lambda db: None)

    reset_demo.main(["--yes"])  # không raise SystemExit


def test_cau_chi_yes_duoc_kiem_truoc_APP_ENV(monkeypatch, capsys):
    """Thiếu --yes phải bị chặn với đúng thông báo về --yes, kể cả khi APP_ENV
    cũng không an toàn cùng lúc. Đảo thứ tự hai cầu chì vẫn cho exit code 1 ở
    mọi test khác (cả hai điều kiện đều sai), nhưng đổi hẳn thông báo hiện cho
    người vận hành — đây là chỗ duy nhất phân biệt được thứ tự kiểm tra."""
    from scripts.reset_demo import main

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit) as e:
        main([])
    assert e.value.code == 1
    out = capsys.readouterr().out
    assert "--yes" in out
    assert "APP_ENV" not in out


def test_reset_giu_catalog_va_tai_khoan_xoa_bao_cao(db):
    from app.models import AppUser, Indicator, OrgUnit, Report
    from scripts.reset_demo import reset

    seed_all(db)
    ind, usr, org = (db.query(Indicator).count(), db.query(AppUser).count(),
                     db.query(OrgUnit).count())
    bc = db.query(Report).count()
    assert bc > 0
    reset(db)
    assert (db.query(Indicator).count(), db.query(AppUser).count(),
            db.query(OrgUnit).count()) == (ind, usr, org)
    assert db.query(Report).count() == bc          # seed_all nạp lại đúng bấy nhiêu


def test_chay_hai_lan_van_ra_cung_trang_thai(db):
    from app.models import Report, ReportValue
    from scripts.reset_demo import reset

    seed_all(db)
    reset(db)
    a = (db.query(Report).count(), db.query(ReportValue).count())
    reset(db)
    assert a == (db.query(Report).count(), db.query(ReportValue).count())


def test_reset_xoa_sach_ca_nam_bang_ke_ca_khi_seed_all_khong_chay(db, monkeypatch):
    """`test_reset_giu_catalog...` không bắt được ca thiếu một bảng trong
    BANG_XOA, vì seed_all() nạp lại đúng số lượng ngay sau đó. Khoá riêng bước
    xoá: vô hiệu seed_all() rồi khẳng định cả 5 bảng còn đúng 0 dòng."""
    import scripts.reset_demo as reset_demo
    from app.models import AuditLog, OpeningBalance, Report, ReportText, ReportValue

    seed_all(db)
    # Fixture hiện tại không nạp dòng report_text nào (3 ô văn bản chỉ sinh
    # qua nhập sống) — tự thêm một dòng để bảng này cũng có gì mà xoá, nếu
    # không ca "thiếu report_text trong BANG_XOA" sẽ đỏ giả (trước và sau đều
    # là 0, không do reset() xoá).
    mot_report = db.query(Report).first()
    db.add(ReportText(report_id=mot_report.id, field_code="C1", content="demo"))
    db.flush()

    truoc = (
        db.query(Report).count(),
        db.query(ReportValue).count(),
        db.query(ReportText).count(),
        db.query(AuditLog).count(),
        db.query(OpeningBalance).count(),
    )
    assert all(so_dong > 0 for so_dong in truoc)

    monkeypatch.setattr(reset_demo, "seed_all", lambda _db: None)
    reset_demo.reset(db)

    assert (
        db.query(Report).count(),
        db.query(ReportValue).count(),
        db.query(ReportText).count(),
        db.query(AuditLog).count(),
        db.query(OpeningBalance).count(),
    ) == (0, 0, 0, 0, 0)
