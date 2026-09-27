# Lũy kế

Trang này giải thích hệ thống tính số lũy kế thế nào, vì sao tính lại mỗi lần đọc thay vì lưu sẵn, và cái giá của cách làm đó.

## Bài toán

Mỗi dòng của FM01 có ba cột số: lũy kế đến tháng trước, số tháng này, và cộng dồn. Trong file tổng hợp chung, người nhập tự gõ cả ba. Hai lỗi hay gặp:

- Cộng sai: lũy kế tháng trước cộng tháng này không bằng cộng dồn.
- Đứt mạch: lũy kế tháng trước của tháng này không bằng cộng dồn của tháng trước, thường vì ai đó sửa số tháng cũ mà không sửa các tháng sau.

Không phải chỉ tiêu nào cũng cộng dồn được. "Số giờ làm việc an toàn liên tục" về 0 khi xảy ra tai nạn mất ngày công (LTI). Có chỉ tiêu đếm lại từ đầu năm, có chỉ tiêu đếm từ đầu dự án.

## Bốn loại chỉ tiêu

Mỗi chỉ tiêu có một `agg_type` quyết định ai lo phần lũy kế:

| `agg_type` | Người nhập gõ | Hệ thống làm | FM01 có |
|---|---|---|---|
| `sum` | Số tháng này | Tự tính lũy kế tháng trước và cộng dồn | 48 dòng |
| `counter` | Số tháng này và lũy kế | Kiểm tính liên tục, cảnh báo khi lệch, không chặn | 4 dòng (`B-1.5` đến `B-1.8`) |
| `snapshot` | Giá trị tại thời điểm | Không cộng gì | 0 dòng |
| `computed` | Không gõ gì | Cộng các dòng trong `formula` | 1 dòng (`B-1.4` Tổng giờ công) |

Bảng cột nhập được nằm ở `backend/app/domain/report_rules.py` (`COT_NHAP_DUOC`) và bản sao ở `frontend/src/features/report/cellPolicy.ts`.

## Chỉ tiêu `sum`: tính lại mỗi lần đọc

Lũy kế của dòng `sum` không được lưu. View `v_report_value_computed` tính nó mỗi lần có người mở báo cáo:

```
lũy kế tháng trước = số dư mang sang (không có thì 0)
                   + Σ số tháng này của các báo cáo ĐÃ DUYỆT
                     cùng đơn vị, cùng chỉ tiêu,
                     ở các kỳ trước kỳ này, từ kỳ của số dư trở đi
cộng dồn           = lũy kế tháng trước + số tháng này (trống tính là 0)
```

Chỉ báo cáo ở trạng thái có `counts_in_totals` (hiện là Đã duyệt) được cộng. Nháp, Đã nộp, Trả lại đều không.

Các kỳ xếp theo `start_date`, không theo thứ tự tạo trong database.

### Ví dụ

Các ví dụ lấy từ `backend/tests/sql/test_view_accumulation.py`, mỗi ví dụ là một đơn vị và một chỉ tiêu.

Không có số dư:

| Kỳ | Trạng thái | Tháng này | Lũy kế tháng trước | Cộng dồn |
|---|---|---|---|---|
| 06 | Đã duyệt | 100 | 0 | 100 |

Có một kỳ ở giữa chưa duyệt:

| Kỳ | Trạng thái | Tháng này | Lũy kế tháng trước | Cộng dồn |
|---|---|---|---|---|
| 06 | Đã duyệt | 100 | 0 | 100 |
| 07 | Nháp | 999 | | |
| 08 | Đã duyệt | 20 | 100 | 120 |

999 của kỳ 07 không vào tổng. Báo cáo kỳ 08 được báo "thiếu kỳ 07" (`missing_periods = ["2026-07"]`).

Có số dư mang sang ở kỳ 07 là 500:

| Kỳ | Trạng thái | Tháng này | Lũy kế tháng trước | Cộng dồn |
|---|---|---|---|---|
| 06 | Đã duyệt | 100 | | |
| 07 | Đã duyệt | 30 | 500 | 530 |

Số dư đặt mốc mới: 100 của kỳ 06 nằm trước mốc nên không được cộng.

### Số dư mang sang

Hệ thống bắt đầu chạy giữa năm, trong khi lũy kế đã có từ trước. Bảng `opening_balance` giữ con số đó cho từng cặp (đơn vị, chỉ tiêu) ở một kỳ. Loader fixture ghi nó từ cột `acc_prev` của kỳ đầu tiên trong file, xem [Fixture CSV](../reference/fixture-csv.md).

Khi có nhiều dòng số dư, view lấy dòng mới nhất có kỳ không muộn hơn kỳ đang xem.

### Kỳ thiếu

`missing_periods` liệt kê các kỳ nằm giữa mốc xuất phát (kỳ của số dư, hoặc kỳ sớm nhất đã có số được cộng) và kỳ đang xem mà đơn vị chưa có báo cáo đã duyệt. Form hiện dòng "Lũy kế đã tính tới <kỳ>" để người đọc biết lũy kế đang thiếu tháng nào. Kỳ thiếu không chặn nộp.

Kỳ đã duyệt nhưng để trống một ô không bị coi là kỳ thiếu: ô trống tính là 0.

### Vì sao không lưu sẵn

Lưu lũy kế vào cột có nghĩa là mỗi lần một báo cáo cũ đổi trạng thái (trả lại, mở lại, duyệt muộn) phải tính lại lũy kế của mọi kỳ sau nó, cho đúng đơn vị và đúng chỉ tiêu, trong cùng transaction. Quên một đường là số sai im lặng.

Tính lại mỗi lần đọc thì không có gì để quên. Mở lại báo cáo tháng 6 đã duyệt, lũy kế tháng 7 và tháng 8 đổi ngay ở lần mở kế tiếp.

### Cái giá

- **Tốc độ đọc.** View cộng lại từ đầu mỗi lần. Bản đầu của `GET /reports/{id}` mất khoảng 490 ms vì Postgres chạy lại thân view cho từng dòng chỉ tiêu. CTE `MATERIALIZED` lọc theo báo cáo đưa về khoảng 17 ms. Chi phí vẫn lớn dần theo số tháng vận hành. Materialized view là bước kế tiếp khi đo thấy chậm, tài liệu thiết kế đã hoãn nó khỏi MVP vì lý do đó.
- **Không reset đầu năm.** Kỳ 01/2027 sẽ cộng tiếp số năm 2026. Đây là lối tắt có chủ đích, đánh dấu `gstack-shortcut(dec-3bc0293c)` trong migration `0002`, phải xử lý trước kỳ 01/2027.
- **Dashboard không dùng view.** KPI trên dashboard cộng thẳng số tháng này từ `report_value` của các báo cáo đã duyệt trong kỳ đang xem. Hai đường cộng khác nhau cho hai câu hỏi khác nhau (trong kỳ và từ đầu), nhưng cũng là hai chỗ phải giữ cho khớp luật "chỉ cộng báo cáo đã duyệt".

### Số nhập và số tính

Loader fixture lưu cả lũy kế chép từ file (`acc_prev_entered`, `acc_total_entered`) cho dòng `sum`. `GET /reports/{id}` trả kèm `diff` là cộng dồn nhập trừ cộng dồn tính, và người có quyền duyệt thấy cột "Lệch" trên form.

Ngay sau khi nạp, hai số bằng nhau vì loader đã từ chối file cộng sai. Chúng lệch nhau khi một kỳ trước bị trả lại hoặc mở lại: số của kỳ đó rời khỏi tổng tính, còn số chép từ file thì đứng yên. Cột "Lệch" cho người duyệt thấy điều đó ngay trên dòng.

Nhập qua màn hình thì hai cột nhập của dòng `sum` luôn bị đặt về trống, nên `diff` chỉ có nghĩa với số nạp từ fixture.

## Chỉ tiêu `counter`: tin người nhập, kiểm tính liên tục

Bộ đếm reset theo sự kiện nên hệ thống không tự cộng được. Người nhập gõ cả số tháng này và lũy kế. Hệ thống so với kỳ trước:

```
mong đợi = lũy kế của kỳ gần nhất trước đó đã duyệt + số tháng này
```

| Trường hợp | Trạng thái | Câu hiện |
|---|---|---|
| Không có kỳ trước đã duyệt | `bo_qua` | Kỳ trước chưa duyệt, không kiểm tra liên tục |
| Thiếu số tháng này hoặc lũy kế | `bo_qua` | Chưa đủ số để kiểm tra liên tục |
| Lũy kế bằng mong đợi | `ok` | |
| Khác | `lech` | Lệch công thức (kỳ trước X + tháng này Y = Z). Có reset (LTI / đầu năm)? Nên ghi lý do vào Ghi chú |

Lệch không chặn nộp. Form gom các dòng lệch chưa có ghi chú vào một khối nhắc ở đầu form, để người nộp giải thích và người duyệt biết mà hỏi.

Chọn cảnh báo thay vì chặn vì hệ thống không biết một lần reset là đúng hay sai. Cột `reset_rule` (`on_event:LTI`, `yearly`, `project_start`) đã có trong danh mục nhưng chưa có mã nào đọc. Khi có, cảnh báo có thể biết trước tháng nào được phép reset.

## Chỉ tiêu `computed`

`B-1.4` Tổng giờ công có `formula = "B-1.1,B-1.2,B-1.3"`. Server cộng ba dòng đó của chính báo cáo, dòng trống tính là 0. Chỉ hỗ trợ phép cộng. Server từ chối mọi giá trị gửi vào dòng này, loader fixture bỏ qua nó.

Frontend không chép công thức này. Số của dòng tự tính chỉ đổi khi phản hồi của lượt lưu về tới, nên không có hai bản công thức có thể lệch nhau.

## Xem thêm

- [Mô hình dữ liệu](../reference/mo-hinh-du-lieu.md#view-v_report_value_computed): định nghĩa view theo cột.
- [Fixture CSV](../reference/fixture-csv.md): phép kiểm lũy kế lúc nạp số cũ.
- [Quyền và quy trình](../reference/quyen-va-quy-trinh.md#trạng-thái): trạng thái nào được cộng vào tổng.
- [Nền tảng theo dữ liệu](nen-tang-theo-du-lieu.md): `agg_type` là một phần của danh mục, không phải của mã.
