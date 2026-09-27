# Nền tảng theo dữ liệu

Trang này giải thích vì sao mẫu báo cáo, quy trình duyệt và quyền được giữ trong database thay vì viết trong mã, phần nào đã đúng như vậy, và phần nào vẫn còn viết cứng cho FM01.

## Bài toán

FM01 là quy định đầu tiên Ban ATCL số hoá, không phải quy định cuối. Kế hoạch là thêm mẫu tuần (FM02), mẫu quý (FM03) rồi các quy định khác. Form FM01 cũng được "điều chỉnh cho phù hợp thực tế từng dự án", nên danh mục chỉ tiêu sẽ đổi theo thời gian (`docs/designs/hseq-platform-mvp-fm01.md`, mục Constraints).

Nếu mỗi chỉ tiêu là một cột trong bảng, hoặc mỗi bước duyệt là một nhánh `if` trong mã, thì mỗi lần Ban ATCL đổi form là một lần sửa mã, viết migration và deploy lại. Tài liệu thiết kế đặt mục tiêu ngược lại: thêm mẫu mới không cần migration.

## Cách làm

Bốn thứ nằm trong bảng, mã chỉ đọc chúng:

```
report_template ─┬─ template_section ── indicator      danh mục: form vẽ gì, kiểm gì
                 ├─ template_text_field                 ô chữ
                 ├─ workflow_state ── workflow_transition ── permission
                 │                                      quy trình: nút nào, ai bấm
                 └─ reporting_period                    kỳ: mở, đóng, hạn nộp
org_unit, role, permission, user_role                   ai thuộc đâu, ai được gì
```

Hệ quả cụ thể:

- **Form tự dựng từ danh mục.** `GET /templates/{code}` trả nhóm, chỉ tiêu (loại, số chữ số thập phân, bắt buộc, công thức) và ô chữ. Form vẽ theo đó, không có dòng nào viết sẵn trong JSX.
- **Luật kiểm đọc từ danh mục.** Server và form cùng đọc `decimals`, `required`, `agg_type` của từng chỉ tiêu. Thêm một chỉ tiêu bắt buộc là thêm một dòng dữ liệu, cả hai phía tự kiểm.
- **Số lưu theo dòng.** `report_value` là một dòng cho mỗi (báo cáo, chỉ tiêu), không phải một cột cho mỗi chỉ tiêu. Chỉ tiêu mới không cần cột mới.
- **Nút chuyển trạng thái tự hiện.** Form lấy danh sách bước chuyển của mẫu, giữ những bước đi ra từ trạng thái hiện tại mà người dùng có quyền, và hộp thoại tự đòi lý do khi bước đó có `requires_note`. Đổi quyền duyệt từ `report.approve` sang quyền khác là sửa một dòng `workflow_transition`.
- **Dashboard không nêu tên mẫu.** Nó đọc mẫu đang `active` và nhóm báo cáo theo cờ `counts_in_totals` và `is_editable` của trạng thái, không so chuỗi `"approved"`.
- **Giao diện quyết theo quyền, không theo vai.** Một vai trò mới với tập quyền mới tự có đúng menu và đúng chế độ form, trừ một chỗ nêu ở dưới.

## Phần còn viết cứng

Danh sách này là giới hạn thật của nền tảng hôm nay. Mẫu thứ hai sẽ đụng vào từng mục.

### Backend

| Chỗ | Viết cứng gì | Hệ quả khi thêm mẫu mới |
|---|---|---|
| `app/services/workflow.py` | Mã hành động `"submit"` (kiểm ô bắt buộc, đặt thời điểm nộp, tính nộp muộn) và `approve`, `return`, `reopen` (`CAC_ACTION_QUYET_DINH`, ghi người quyết định) | Mẫu dùng mã khác vẫn chuyển được trạng thái, nhưng mất các hành vi này. Giữ đúng bốn mã khi khai quy trình mới. |
| `app/api/dashboard.py` | Mã chỉ tiêu của 6 KPI: `B-2.2`, `B-2.1`, `B-2.10`, `B-2.11`, `B-1.1` đến `B-1.3` | Mẫu khác không có các mã này thì KPI về 0. |
| `app/api/dashboard.py` | Chỉ một mẫu `active` tại một thời điểm | Hai mẫu cùng active và cùng dạng mã kỳ `YYYY-MM` thì dashboard lấy dòng kỳ được tạo trước trong hai mẫu. |
| `app/domain/report_rules.py` và view lũy kế | Nghĩa của bốn `agg_type`, và `computed` chỉ biết cộng | Loại tính mới là sửa mã. |
| `app/seed/fixture.py` | Trạng thái `approved`, vai `admin_atcl` và `reporter` | Loader chỉ chạy với quy trình và vai trò có đúng các mã này. |
| `app/seed/__init__.py` | Danh mục FM01, kỳ `2026-06` đến `2026-09`, báo cáo nháp của đơn vị thứ 22 kỳ `2026-08` | Seed chỉ dựng FM01. Mẫu mới cần hàm seed riêng hoặc SQL. |

### Frontend

| Chỗ | Viết cứng gì |
|---|---|
| `pages/Dashboard.tsx`, `pages/Status.tsx`, `pages/QuanTriMau.tsx` | `const TEMPLATE = 'FM01'` |
| `features/reports/useReportList.ts`, `pages/Reports.tsx`, `components/Sidebar.tsx` | Chuỗi `'FM01'` khi tải danh sách, tạo báo cáo, tải kỳ |
| `lib/format.ts` | `KY_MAC_DINH = '2026-08'`, kỳ mặc định khi địa chỉ chưa có `?period=` |
| `features/report/useChuyenTrangThai.ts` | Câu chữ hộp thoại và thông báo theo `action_code` (`CAU_CHU`). Mã lạ rơi về `name_vi` của bước chuyển, nên không vỡ, chỉ nhận câu chung. |
| `features/report/cellPolicy.ts` | Bản sao bảng cột nhập được theo `agg_type` của backend |
| `pages/Login.tsx` | Vai `reporter` vào `/reports`, còn lại vào `/dashboard`. Chỗ duy nhất đọc tên vai. |
| Bộ chọn kỳ, lưới tình trạng nộp | Kỳ là tháng, mã dạng `YYYY-MM`. `GET /status` kiểm `from` và `to` bằng mẫu `^[0-9]{4}-(0[1-9]\|1[0-2])$`. |

Cái giá của việc để `'FM01'` trong frontend: danh sách báo cáo, lưới tình trạng và trang quản trị sẽ không thấy mẫu thứ hai cho tới khi trang có bộ chọn mẫu. Lợi: mọi lời gọi API đều nêu rõ mẫu, không có lời gọi nào ngầm trộn số của hai mẫu.

## Vì sao không làm hết ngay

Dữ liệu hoá phần còn lại có giá của nó, và chưa có mẫu thứ hai để biết nó cần gì:

- **Màn sửa mẫu và quy trình** cần kiểm rằng danh mục mới không làm hỏng báo cáo đã có (xoá chỉ tiêu đang có số, đổi `decimals` khi đã có số lẻ). Tài liệu thiết kế cắt màn này khỏi MVP; mẫu được dựng bằng seed.
- **KPI theo cấu hình** cần định nghĩa KPI như dữ liệu (công thức, đơn vị, cách cộng giữa các đơn vị). Sáu KPI hiện tại được chốt trong tài liệu thiết kế (D22), mỗi KPI một định nghĩa cố định.
- **Mã hành động theo cấu hình** cần một cách khai "bước này là nộp", "bước này là quyết định" trong dữ liệu. Với bốn trạng thái của FM01, giữ bốn mã cố định rẻ hơn.

Lựa chọn khác từng được cân nhắc là form builder kéo thả. Tài liệu thiết kế loại nó: danh mục chỉ tiêu nằm trong database gắn với mẫu, không có trình dựng form.

## Khi thêm mẫu thứ hai

Việc cần làm theo thứ tự rủi ro:

1. Seed mẫu, nhóm, chỉ tiêu, ô chữ, trạng thái, bước chuyển, kỳ. Không cần migration.
2. Giữ bốn mã hành động `submit`, `return`, `approve`, `reopen`, hoặc sửa `workflow.py` để đọc vai trò của bước từ dữ liệu.
3. Thay các hằng `'FM01'` ở frontend bằng mẫu người dùng chọn.
4. Quyết định dashboard hiện KPI của mẫu nào, và đổi luật "một mẫu active".

## Xem thêm

- [Quyền và quy trình](../reference/quyen-va-quy-trinh.md): dữ liệu quy trình và quyền hiện có.
- [Mô hình dữ liệu](../reference/mo-hinh-du-lieu.md): các bảng danh mục và quy trình.
- [Cách thêm hoặc sửa chỉ tiêu](../how-to/them-hoac-sua-chi-tieu.md): sửa danh mục của FM01.
- [Kiến trúc](kien-truc.md): chỗ của phần dữ liệu hoá trong toàn hệ thống.
