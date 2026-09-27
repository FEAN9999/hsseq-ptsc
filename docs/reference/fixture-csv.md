# Fixture CSV

Định dạng file số liệu mà seed nạp vào database, các quy tắc kiểm, và những gì loader ghi ra. Loader nằm ở `backend/app/seed/fixture.py`.

Fixture là cách đưa số của các kỳ đã qua (chép từ file Excel của Ban ATCL) vào hệ thống. Mỗi báo cáo nạp từ fixture vào thẳng trạng thái Đã duyệt. Cách làm từng bước ở [Cách nạp số liệu thật](../how-to/nap-so-lieu-that.md).

## File nào được nạp

Loader chọn file theo thứ tự:

1. Tham số `path` khi gọi `load_fixture` trong mã.
2. Biến môi trường `FIXTURE_CSV`.
3. Mặc định `backend/app/seed/fixtures/fm01_2026-06_2026-08.csv`.

File mặc định hiện chỉ có dòng tiêu đề. Bộ số tổng hợp để thử là `backend/tests/fixtures/full_synthetic.csv`: 22 đơn vị, 3 kỳ (`2026-06` đến `2026-08`), 52 chỉ tiêu, tổng cộng 66 báo cáo.

## Định dạng

UTF-8, có hoặc không có BOM. Dòng đầu là tiêu đề:

```csv
org_code,period,indicator_code,this_period,acc_prev,acc_total,note
U01,2026-06,B-1.1,3.00,0.00,3.00,
U01,2026-07,B-1.1,4.00,3.00,7.00,
```

| Cột | Bắt buộc | Ý nghĩa |
|---|:-:|---|
| `org_code` | ✓ | Mã đơn vị phải nộp, ví dụ `U01`, `P05`. |
| `period` | ✓ | Mã kỳ đã có trong database, ví dụ `2026-06`. |
| `indicator_code` | ✓ | Mã chỉ tiêu đang `active` của mẫu, ví dụ `B-1.1`. |
| `this_period` | ✓ | Số tháng này. |
| `acc_prev` | ✓ | Lũy kế đến hết kỳ trước. |
| `acc_total` | ✓ | Lũy kế đến hết kỳ này. |
| `note` | | Ghi chú dòng. Để trống được. |

Mỗi dòng là một ô (đơn vị, kỳ, chỉ tiêu). Mọi dòng cùng (đơn vị, kỳ) tạo thành một báo cáo.

Số viết theo kiểu máy: dấu chấm thập phân, không có dấu ngăn nghìn. `3.00` với chỉ tiêu không có số lẻ là hợp lệ vì loader đếm chữ số thập phân có nghĩa, không đếm số chữ số trong chuỗi. `1.50` với chỉ tiêu 0 chữ số thập phân thì bị từ chối.

## Quy tắc kiểm

Loader đọc cả file và gom mọi lỗi trước khi báo. Có một lỗi là không nạp dòng nào.

Theo từng dòng:

| Lỗi | Câu báo |
|---|---|
| Thiếu một trong sáu cột bắt buộc | `thiếu cột bắt buộc trong CSV: [...]` |
| Đơn vị không có, hoặc không phải đơn vị phải nộp | `dòng N: đơn vị 'X' không có trong seed` |
| Kỳ không có | `dòng N: kỳ 'X' không có trong seed` |
| Chỉ tiêu không có hoặc đã tắt | `dòng N: chỉ tiêu 'X' không có trong danh mục` |
| Ô số rỗng hoặc không phải số | `dòng N (...): số sai định dạng` |
| Số âm | `dòng N (...): this_period = -1 không được âm` |
| Quá số chữ số thập phân của chỉ tiêu | `dòng N (...): acc_total = 1.5 quá 0 chữ số thập phân` |

Số dòng `N` tính cả dòng tiêu đề, nên dòng dữ liệu đầu tiên là dòng 2.

Dòng của chỉ tiêu `computed` (hiện chỉ có `B-1.4` Tổng giờ công) không phải lỗi. Loader bỏ qua và đếm vào số dòng bỏ qua, vì hệ thống tự tính dòng này.

Theo cả file:

| Quy tắc | Câu báo |
|---|---|
| Không trùng (đơn vị, kỳ, chỉ tiêu) | `dòng N: trùng dòng M (...)` |
| Mỗi cặp (đơn vị, chỉ tiêu) phải bắt đầu ở kỳ đầu tiên của file | `U01,B-1.1: số dư khởi đầu rơi vào kỳ không phải kỳ đầu của fixture (...)` |
| Dòng `sum`: `acc_prev + this_period = acc_total` | `U01,B-1.1,2026-06: lệch lũy kế (acc_prev 0.00 + this_period 3.00 ≠ acc_total 4.00)` |
| Mọi dòng từ kỳ thứ hai: `acc_prev` bằng `acc_total` của kỳ trước đó trong file | `U01,B-1.1,2026-07: acc_prev (...) không khớp acc_total kỳ trước 2026-06 (...)` |
| Mỗi (đơn vị, kỳ) có đủ mọi chỉ tiêu bắt buộc xuất hiện ở bất kỳ đâu trong file | `U01,2026-07: thiếu 2 chỉ tiêu bắt buộc (file có ở (đơn vị, kỳ) khác): ...` |

Dòng `counter` không bị kiểm phép cộng, chỉ bị kiểm tính liên tục giữa các kỳ, vì bộ đếm được phép reset (sau sự cố LTI, đầu năm, đầu dự án).

Phép kiểm chỉ tiêu bắt buộc so với các chỉ tiêu có trong chính file, không so với danh mục. File bỏ sót một chỉ tiêu ở mọi đơn vị và mọi kỳ sẽ lọt qua bước này, nhưng sau đó không nộp được báo cáo nào có thiếu ô đó.

Ví dụ một lần nạp hỏng, chạy bằng `reset_demo`:

```
app.seed.fixture.FixtureError: Fixture không hợp lệ:
  - dòng 3: đơn vị 'U99' không có trong seed
  - dòng 4 (U01,2026-06,B-2.1): this_period = -1 không được âm
  - dòng 4 (U01,2026-06,B-2.1): acc_total = -1 không được âm
  - U01,B-1.1,2026-06: lệch lũy kế (acc_prev 0.00 + this_period 3.00 ≠ acc_total 4.00)
```

Lệnh thoát mã 1 và cả transaction bị huỷ, kể cả bước xoá báo cáo cũ. Database giữ nguyên như trước khi chạy.

## Loader ghi gì

Khi file hợp lệ, trong một transaction:

- Mỗi (đơn vị, kỳ) thành một dòng `report`: trạng thái `approved`, `source = "seed"`, `version = 1`, `is_late = false`, người tạo là tài khoản người nhập của đơn vị đó, người duyệt là tài khoản `admin_atcl`.
- Thời điểm nộp và duyệt giả định là 17:00 ngày 05 tháng sau kỳ, giờ Việt Nam. Ví dụ kỳ `2026-06` có mốc 05/07/2026 17:00.
- Mỗi dòng CSV thành một dòng `report_value` với cả ba cột số, làm tròn về đúng số chữ số thập phân của chỉ tiêu.
- Mỗi dòng CSV thuộc kỳ đầu tiên của file sinh thêm một dòng `opening_balance`, giá trị là `acc_prev` của dòng đó. Đây là số dư mang sang mà view lũy kế dùng làm điểm xuất phát.
- Mỗi báo cáo có một dòng `audit_log` hành động `seed_import`.
- Cuối cùng ghi dấu sha256 của file vào `audit_log` (`entity = "report_template"`, hành động `fixture_sha`).

Seed chạy xong loader thì đưa báo cáo kỳ `2026-08` của P05 về Nháp, xem [Quyền và quy trình](quyen-va-quy-trinh.md#tài-khoản-seed).

## Dấu sha256

Loader so sha256 của file với dấu đã ghi cho mẫu báo cáo đó:

| Tình huống | Kết quả |
|---|---|
| Chưa có dấu | Kiểm và nạp. Ghi dấu, kể cả khi file không có dòng nào để nạp. |
| Cùng dấu | Bỏ qua, không ghi log. |
| Khác dấu | Cảnh báo `fixture đã đổi (sha256 xxxxxxxx → yyyyyyyy); chạy scripts/reset_demo.py --yes để nạp lại`, không nạp. |
| Không thấy file | Cảnh báo `không có file fixture <đường dẫn>, bỏ qua`, không ghi dấu. |
| File chỉ có tiêu đề | Cảnh báo `file fixture <đường dẫn> không có dòng dữ liệu nào nạp được, tạo 0 báo cáo`, vẫn ghi dấu. |

Các cảnh báo này vào log, đóng khung bằng một dòng `=` ở trên và dưới để không chìm giữa log của Render. `reset_demo` in lại chúng thành dòng `CẢNH BÁO: ...`.

Vì vậy sửa file fixture rồi khởi động lại API không nạp lại số. Phải chạy `scripts/reset_demo.py --yes`: lệnh này xoá `audit_log` (mất dấu cũ), `report_text`, `report_value`, `report`, `opening_balance`, rồi seed lại. Danh mục, đơn vị và tài khoản giữ nguyên.

Khi dấu đã có mà khác, loader dừng trước bước kiểm. File mới có hỏng cũng chỉ lộ ra ở lần chạy `reset_demo`.

Ngược lại, trên database chưa có dấu nào (lần khởi động đầu, hoặc sau `down -v`), file hỏng làm `python -m scripts.seed` lỗi. Lệnh khởi động của container nối các bước bằng `&&`, nên uvicorn không mở và API không lên.

## Kết quả của `reset_demo`

```
Đã nạp 66 báo cáo.
```

Có dòng `computed` trong file thì in thêm `Bỏ qua N dòng chỉ tiêu tự tính (computed)`. Mỗi cảnh báo in thành một dòng `CẢNH BÁO: ...`. Nạp được 0 báo cáo thì in lý do và thoát mã 1.

## Sinh lại bộ số tổng hợp

`backend/tests/fixtures/gen_fixture.py` sinh `full_synthetic.csv` từ danh mục chỉ tiêu trong `app/seed/catalog_fm01.py`, không dùng số ngẫu nhiên nên chạy lại luôn ra cùng một file. Mỗi ô có `this_period = 1 + (thứ tự đơn vị + thứ tự chỉ tiêu + thứ tự kỳ) mod 5`, cộng dồn qua ba kỳ bắt đầu từ 0. Mọi số ghi hai chữ số thập phân như Excel xuất ra.

```bash
cd backend
.venv/bin/python tests/fixtures/gen_fixture.py
```

Chạy lại lệnh này sau khi đổi danh mục chỉ tiêu. Nhiều test backend khẳng định số cụ thể trong file này, nên chạy `pytest` sau khi sinh lại.

## Xem thêm

- [Cách nạp số liệu thật](../how-to/nap-so-lieu-that.md): từ file Excel đến database, cả local lẫn bản deploy.
- [Mô hình dữ liệu](mo-hinh-du-lieu.md): các bảng `report`, `report_value`, `opening_balance`, `audit_log`.
- [Lũy kế](../explanation/luy-ke.md): vì sao cần số dư mang sang và phép kiểm liên tục.
- [Cấu hình và lệnh](cau-hinh-va-lenh.md#fixture_csv): biến `FIXTURE_CSV`.
