# backend/tests/fixtures/gen_fixture.py
"""Sinh `full_synthetic.csv` — bộ số TỔNG HỢP, GIẢ, tất định, dùng khi chưa có
file thật của Ban ATCL (`app/seed/fixtures/fm01_2026-06_2026-08.csv` còn rỗng).

Không dùng `random` (có seed hay không cũng vậy) — công thức `_delta` thuần
số học nên CÙNG ĐẦU VÀO (danh mục 53 chỉ tiêu, 22 đơn vị, 3 kỳ) LUÔN ra
CÙNG ĐẦU RA, byte-for-byte. Chạy lại file này bao nhiêu lần cũng vậy.

Phạm vi: 22 đơn vị (U01..U17, P01..P05) × 3 kỳ (2026-06, 2026-07, 2026-08) ×
mọi chỉ tiêu KHÔNG PHẢI `computed` trong danh mục thật (53 dòng, trừ 1 dòng
`computed` "Tổng giờ công" còn 52) — danh mục đọc trực tiếp từ
`app.seed.catalog_fm01.INDICATORS`, không chép tay, để không bao giờ lệch
với danh mục seed thật dùng.

Dòng `computed` không đưa vào: matrix agg_type (report_rules.py) quy định
"computed ... không lưu" — sinh số cho một cột không ai lưu là vô nghĩa, và
`load_fixture` tự bỏ qua nếu lỡ có (xem app/seed/fixture.py).

Công thức mỗi ô, tất định và dễ tính tay để viết test khẳng định giá trị cụ
thể (không chỉ đếm số dòng):

    delta(org_idx, ind_idx, ky_idx) = 1 + (org_idx + ind_idx + ky_idx) % 5

  - org_idx: số thứ tự đơn vị trong danh sách U01..U17,P01..P05, bắt đầu 1.
  - ind_idx: số thứ tự chỉ tiêu KHÔNG PHẢI computed, giữ nguyên thứ tự khai
    báo trong INDICATORS, bắt đầu 1 (B-1.1→1, B-1.2→2, B-1.3→3, B-1.5→4 vì
    B-1.4 computed bị bỏ qua không đánh số, ...).
  - ky_idx: 0/1/2 cho kỳ 2026-06/07/08.

Mỗi (đơn vị, chỉ tiêu) cộng dồn qua 3 kỳ: acc_prev kỳ đầu = 0, this_period =
delta, acc_total = acc_prev + this_period; acc_prev kỳ sau = acc_total kỳ
trước — tự thoả phép assert lũy kế của loader (cả dòng `sum` lẫn `counter`,
xem app/seed/fixture.py::_assert_luy_ke). Vì mọi cặp (đơn vị, chỉ tiêu) đều
có đủ 3 kỳ nên lưới luôn đầy hình chữ nhật — không bao giờ phạm kiểm "số dư
đầu tiên không rơi vào kỳ đầu fixture".

Mọi ô ghi 2 chữ số thập phân (`_dinh_dang`), kể cả với chỉ tiêu `decimals=0`
("0.00", "3.00") — đúng hình dạng Excel xuất ra, không phải hình dạng
`decimals` khai báo của từng chỉ tiêu (task-7-fix2: bản cũ ghi "5" cho
decimals=0 nên né mất lỗi đếm chữ số thập phân theo định dạng chuỗi thay vì
theo giá trị — xem task-7-fix2-brief.md).

Chạy độc lập để sinh lại `full_synthetic.csv`:

    cd backend && .venv/bin/python tests/fixtures/gen_fixture.py
"""
import csv
import sys
from decimal import Decimal
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.seed.catalog_fm01 import INDICATORS  # noqa: E402

OUT_PATH = Path(__file__).parent / "full_synthetic.csv"
KY_LIST = ["2026-06", "2026-07", "2026-08"]
CSV_HEADER = ["org_code", "period", "indicator_code", "this_period", "acc_prev", "acc_total", "note"]


def org_codes() -> list[str]:
    """22 đầu mối is_reporting, ĐÚNG thứ tự seed_all gán (U01..U17 rồi P01..P05,
    xem app/seed/__init__.py::ORG_UNITS) — đơn vị "thứ 22" ở đây là P05."""
    return [f"U{i:02d}" for i in range(1, 18)] + [f"P{i:02d}" for i in range(1, 6)]


def danh_muc_khong_computed() -> list[dict]:
    """Lọc bỏ dòng agg_type == 'computed', giữ nguyên thứ tự trong INDICATORS."""
    ds = []
    for (section_code, code, name_vi, name_en, unit, agg_type, formula,
         reset_rule, decimals, required) in INDICATORS:
        if agg_type == "computed":
            continue
        ds.append({"code": code, "agg_type": agg_type})
    return ds


def _delta(org_idx: int, ind_idx: int, ky_idx: int) -> int:
    return 1 + (org_idx + ind_idx + ky_idx) % 5


def _dinh_dang(so: int) -> str:
    """Sheet Excel thật ghi 2 chữ số thập phân cho MỌI ô, bất kể `decimals`
    khai báo của chỉ tiêu (kể cả decimals=0: "0.00", "3.00") — bộ sinh phải
    né đúng hình dạng đó thay vì tránh nó, xem task-7-fix2-brief.md."""
    return str(Decimal(so).quantize(Decimal("0.01")))


def generate_rows() -> list[list[str]]:
    """Trả về TOÀN BỘ dòng CSV (kể cả header), tất định."""
    orgs = org_codes()
    danh_muc = danh_muc_khong_computed()
    rows = [CSV_HEADER]
    for org_idx, org_code in enumerate(orgs, start=1):
        for ind_idx, ct in enumerate(danh_muc, start=1):
            acc = 0
            for ky_idx, period_key in enumerate(KY_LIST):
                d = _delta(org_idx, ind_idx, ky_idx)
                acc_prev, acc_total = acc, acc + d
                rows.append([
                    org_code, period_key, ct["code"],
                    _dinh_dang(d),
                    _dinh_dang(acc_prev),
                    _dinh_dang(acc_total),
                    "",
                ])
                acc = acc_total
    return rows


def main() -> None:
    rows = generate_rows()
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)
    print(f"đã sinh {len(rows) - 1} dòng dữ liệu vào {OUT_PATH}")


if __name__ == "__main__":
    main()
