# backend/tests/api/test_reset_demo.py
"""Test `scripts/reset_demo.py`: hai cầu chì (`--yes`, `APP_ENV`) và `reset()`.

Cầu chì `APP_ENV` là fail-closed (task-14-carry.md, khác brief gốc): chỉ chạy
khi `APP_ENV` nằm trong tập môi trường an toàn biết trước
(`scripts.reset_demo.MOI_TRUONG_AN_TOAN`); mọi giá trị khác — kể cả thiếu hẳn
biến, ca hay gặp nhất khi thiếu cấu hình trên server — đều bị từ chối, không
chỉ riêng `production`.

`main(["--yes"])` được gọi THẬT ở đây, nhưng không còn đạn thật trong súng:
fixture autouse `chan_lop_dung_db` thay `reset_demo.SessionLocal` bằng một
phiên giả cho cả module. Trước đây thứ DUY NHẤT giữ cho file test này khỏi xoá
sạch `$DATABASE_URL` là chính cầu chì mà nó đang kiểm — nên một lượt đột biến
cầu chì (đúng việc một vòng rà soát phải làm) biến bộ test thành lệnh huỷ dữ
liệu: `DELETE` + `seed_all` + `commit` vào `hseq_test`, rồi lỗi hiện ra ở 17 ca
`test_fixture_loader.py` với thông báo chỉ tay sai chỗ hoàn toàn
(final-review-R1-report.md §1 và §(A4)).

Hai cầu chì vẫn được kiểm y nguyên, và chặt hơn trước: đường TỪ CHỐI khẳng
định thêm rằng phiên DB chưa hề được mở, đường THỰC THI khẳng định nó ĐÃ đi
tới lớp đụng DB rồi bị chặn tại đó (`_ChamDB`) — chứ không phải im lặng không
chạy gì. `test_reset_*` ở cuối file gọi thẳng `reset(db)` qua fixture `db`
(không qua `main()`), nên không dính phiên giả.
"""
import pytest

from app.seed import seed_all


class _ChamDB(RuntimeError):
    """`main()` đã đi tới lớp đụng CSDL. Trong suite, lớp đó dừng ở đây."""


@pytest.fixture(autouse=True)
def chan_lop_dung_db(monkeypatch):
    """Thay `reset_demo.SessionLocal` bằng phiên giả: ghi lại câu SQL đầu tiên
    rồi ném `_ChamDB`, không chạm Postgres.

    Chỉ thay `SessionLocal` — KHÔNG thay `reset` hay `seed_all`, vì các ca
    `test_reset_*` gọi thẳng `reset(db)` trên fixture `db` thật và cần cả hai
    chạy thật.

    Trả về sổ `dau_vet` để test khẳng định main() đã (hoặc chưa) đi tới đây.
    """
    import scripts.reset_demo as reset_demo

    dau_vet = {"mo_phien": 0, "sql": []}

    class _PhienGia:
        def __enter__(self):
            dau_vet["mo_phien"] += 1
            return self

        def __exit__(self, *ngoai_le):
            return False

        def execute(self, cau, *args, **kwargs):
            dau_vet["sql"].append(str(cau))
            raise _ChamDB(str(cau))

        def flush(self):
            raise _ChamDB("flush")

        def commit(self):
            raise _ChamDB("commit")

    monkeypatch.setattr(reset_demo, "SessionLocal", _PhienGia)
    return dau_vet


def test_tu_choi_khi_thieu_co_yes(monkeypatch, chan_lop_dung_db):
    from scripts.reset_demo import main
    with pytest.raises(SystemExit) as e:
        main([])
    assert e.value.code == 1
    assert chan_lop_dung_db["mo_phien"] == 0


def test_tu_choi_khi_APP_ENV_production(monkeypatch, chan_lop_dung_db):
    from scripts.reset_demo import main
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit) as e:
        main(["--yes"])
    assert e.value.code == 1
    assert chan_lop_dung_db["mo_phien"] == 0


def test_tu_choi_khi_APP_ENV_khong_dat(monkeypatch, chan_lop_dung_db):
    """Thiếu hẳn biến APP_ENV (lỗi cấu hình hay gặp khi dựng server) phải bị
    từ chối giống hệt một giá trị nguy hiểm — mặc định là TỪ CHỐI, không phải
    cho phép. Đây là test carry E3 yêu cầu thêm, brief gốc không có."""
    from scripts.reset_demo import main
    monkeypatch.delenv("APP_ENV", raising=False)
    with pytest.raises(SystemExit) as e:
        main(["--yes"])
    assert e.value.code == 1
    assert chan_lop_dung_db["mo_phien"] == 0


def test_thong_bao_tu_choi_neu_ro_gia_tri_APP_ENV_hien_tai(monkeypatch, capsys):
    """Thông báo từ chối phải nói rõ APP_ENV đang là gì, và nói ĐÚNG NGỮ PHÁP.

    (task-14-fix-brief.md S5) Giá trị nêu bằng ngoặc kép thường ("production"),
    không phải repr() kiểu Python ('production').

    (final-fix-brief.md §F1) Bản cũ dựng câu bằng cách nhét một CỤM vào giữa
    khung cố định "APP_ENV đang là {…}, …", nên ca thiếu biến in ra "APP_ENV
    đang là chưa được đặt, …". Người đọc câu này đang cứu hộ giữa buổi demo.
    Hai assert `in` cũ ('"production"' và "chưa được đặt") vẫn XANH nguyên với
    câu sai ngữ pháp đó — chúng chỉ hỏi "mẩu này có nằm đâu đó trong câu
    không". Nên khoá nguyên MỆNH ĐỀ ĐẦU bằng `startswith`, cộng danh sách môi
    trường an toàn (trước đây không ca nào khoá). Vế "nêu lệnh gõ lại" do
    test_thong_bao_APP_ENV_chi_duong_lenh_dung giữ.
    """
    from scripts.reset_demo import main

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit):
        main(["--yes"])
    out = capsys.readouterr().out
    assert out.startswith('APP_ENV đang là "production", '), out
    # Danh sách viết thẳng, KHÔNG dựng lại từ MOI_TRUONG_AN_TOAN: dựng lại thì
    # hai vế cùng dịch khi hằng đổi và test hết nhìn thấy gì.
    assert "môi trường an toàn: demo, local, test." in out

    monkeypatch.delenv("APP_ENV", raising=False)
    with pytest.raises(SystemExit):
        main(["--yes"])
    out = capsys.readouterr().out
    assert out.startswith("APP_ENV chưa được đặt, "), out
    assert "môi trường an toàn: demo, local, test." in out


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


def test_APP_ENV_demo_duoc_chap_nhan(monkeypatch, chan_lop_dung_db):
    """demo là môi trường Render thật (Task 28, task-14-fix-brief.md S1) — chính
    script này sinh ra để reset nó trước mỗi lượt demo. Với APP_ENV=demo,
    main() KHÔNG được SystemExit: nó phải đi qua cầu chì tới lớp đụng DB, nơi
    fixture autouse chặn lại. Khẳng định ĐÃ tới đó, chứ không phải chạy thật."""
    import scripts.reset_demo as reset_demo

    monkeypatch.setenv("APP_ENV", "demo")

    with pytest.raises(_ChamDB):
        reset_demo.main(["--yes"])

    assert chan_lop_dung_db["mo_phien"] == 1


def test_cau_chi_bi_bop_van_khong_xoa_gi(monkeypatch, chan_lop_dung_db):
    """Ca canh cho chính lưới an toàn của file này (R1 §(A4)).

    Bóp cầu chì `APP_ENV` đúng kiểu một vòng rà soát sẽ làm — nới
    `MOI_TRUONG_AN_TOAN` cho lọt một giá trị nguy hiểm — rồi gọi
    `main(["--yes"])` thật. Hai điều phải đúng cùng lúc:

    1. đường thực thi PHẢI chạy tới lớp đụng DB (nếu không, mọi ca "từ chối"
       ở trên chỉ đang đo một đường chết và `mo_phien == 0` mất hết ý nghĩa);
    2. câu `DELETE` đầu tiên phải dừng tại phiên giả, KHÔNG tới Postgres — tức
       cầu chì hỏng thì bộ test vẫn không xoá gì.
    """
    import scripts.reset_demo as reset_demo

    monkeypatch.setattr(reset_demo, "MOI_TRUONG_AN_TOAN", {"production"})
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(_ChamDB):
        reset_demo.main(["--yes"])

    assert chan_lop_dung_db["mo_phien"] == 1
    assert chan_lop_dung_db["sql"] == ["DELETE FROM audit_log"]


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
