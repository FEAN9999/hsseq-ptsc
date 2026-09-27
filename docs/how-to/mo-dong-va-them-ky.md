# Cách mở, đóng và thêm kỳ báo cáo

Mở hoặc đóng một kỳ có sẵn trên màn hình quản trị, thêm kỳ tháng mới, và đổi hạn nộp.

## Cần có

- Tài khoản có quyền `template.manage` (seed: `admin@ptsc.local`) để mở và đóng kỳ.
- Để thêm kỳ hoặc đổi hạn nộp: sửa được mã trong repo, hoặc chạy được SQL trên database đích.

## Đóng kỳ nghĩa là gì

Đóng kỳ chỉ có hai tác dụng:

1. Không tạo được báo cáo mới cho kỳ đó (`POST /reports` trả 409 `Kỳ báo cáo đã đóng, không thể tạo báo cáo mới`).
2. Đơn vị chưa tạo báo cáo kỳ đó không còn thấy dòng của kỳ trong danh sách.

Báo cáo đã tạo trong kỳ đóng vẫn sửa, nộp, duyệt, trả lại như thường. Đóng kỳ là ngừng nhận báo cáo mới, không phải khoá sổ.

## Mở hoặc đóng một kỳ

1. Đăng nhập tài khoản có `template.manage`.
2. Chọn "Mẫu báo cáo" trên menu (`/admin/templates`).
3. Trong bảng kỳ, mỗi dòng có nhãn "Đang mở" hoặc "Đã đóng" và một nút:
   - "Đóng kỳ": hỏi lại "Đóng kỳ MM/YYYY?", bấm "Đóng kỳ" lần nữa để xác nhận.
   - "Mở kỳ": mở ngay, không hỏi lại.
4. Thông báo "Đã đóng kỳ MM/YYYY" hoặc "Đã mở kỳ MM/YYYY" hiện ở góc màn hình.

Mỗi lần mở hay đóng ghi một dòng `audit_log` (`entity = "reporting_period"`, hành động `open_period` hoặc `close_period`).

Qua API, cùng thao tác đó:

```bash
curl -s -X PATCH "$API/templates/FM01/periods/2026-09" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"is_open": false}'
```

Cách lấy `$API` và `$TOKEN`: mục "Ví dụ gọi bằng curl" của [API](../reference/api.md), nhưng đăng nhập bằng tài khoản có `template.manage`.

## Thêm một kỳ mới

Chưa có màn hình hay endpoint tạo kỳ. Có hai cách.

### Qua seed (nên dùng)

1. Thêm một dòng vào `ky_list` trong hàm `_seed_periods` của `backend/app/seed/__init__.py`:

   ```python
   ("2026-10", date(2026, 10, 1), date(2026, 10, 31), han_nop(2026, 11), True),
   ```

   `han_nop(nam, thang)` là 23:59:59 ngày 05 của tháng đó, giờ Việt Nam. Cột cuối là trạng thái mở.

2. Khởi động lại API để seed chạy lại:
   - Máy dev: `docker compose -f infra/docker-compose.yml up -d --build`.
   - Bản demo: commit và đẩy lên `main`, Render tự deploy và seed khi khởi động.

Seed chỉ chèn kỳ chưa có (tra theo mẫu và mã kỳ), nên chạy lại không tạo trùng và không đụng các kỳ cũ.

### Qua SQL

Khi cần kỳ ngay trên database đang chạy mà chưa deploy được:

```sql
INSERT INTO reporting_period (template_id, period_key, start_date, end_date, due_at, is_open)
SELECT id, '2026-10', DATE '2026-10-01', DATE '2026-10-31',
       TIMESTAMPTZ '2026-11-05 23:59:59+07', true
  FROM report_template
 WHERE code = 'FM01';
```

Phải ghi đủ sáu cột vì database không có giá trị mặc định cho chúng. Chạy một lần thôi: không có ràng buộc UNIQUE nào chặn kỳ trùng, và hai dòng cùng mã kỳ làm các endpoint tra kỳ lỗi 500. Sau đó vẫn thêm dòng tương ứng vào `ky_list` để database dựng mới về sau có cùng kỳ.

### Chuyển kỳ mặc định

Dashboard, lưới tình trạng và bộ chọn kỳ mở kỳ `KY_MAC_DINH` khi địa chỉ chưa có `?period=`. Khi kỳ làm việc chính chuyển sang tháng mới, sửa hằng này trong `frontend/src/lib/format.ts`:

```ts
export const KY_MAC_DINH = '2026-10'
```

## Đổi hạn nộp

Seed không cập nhật kỳ đã có. Dùng SQL:

```sql
UPDATE reporting_period
   SET due_at = TIMESTAMPTZ '2026-10-10 23:59:59+07'
 WHERE period_key = '2026-09'
   AND template_id = (SELECT id FROM report_template WHERE code = 'FM01');
```

`is_late` của báo cáo được tính một lần ở lượt nộp đầu tiên. Đổi hạn không tính lại cho báo cáo đã nộp.

## Kiểm tra

- `GET /api/v1/templates/FM01/periods` có kỳ mới với đúng `due_at` và `is_open`.
- Đăng nhập một người nhập: danh sách báo cáo có dòng của kỳ mới với nút "Tạo báo cáo" (kỳ đang mở).
- Tạo báo cáo cho kỳ mới trả 201. Với kỳ đã đóng thì trả 409.

## Gỡ lỗi

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| Không thấy mục "Mẫu báo cáo" | Tài khoản thiếu `template.manage`. |
| Kỳ mới không hiện sau khi sửa `ky_list` | Container chạy image cũ: thêm `--build`. Trên Render: kiểm tra deploy đã xong. |
| Tạo báo cáo trả 404 `Không tìm thấy kỳ báo cáo` | Mã kỳ sai dạng. Mã kỳ là `YYYY-MM`, tháng có hai chữ số. |
| Dashboard trả số 0 cho kỳ mới | Chưa có báo cáo nào được duyệt trong kỳ đó. Dashboard chỉ cộng báo cáo Đã duyệt. |
| Lỗi 500 sau khi chèn kỳ bằng SQL | Đã chèn trùng mã kỳ. Xoá dòng thừa (khi chưa có báo cáo nào trỏ tới nó). |

## Xem thêm

- [Quyền và quy trình](../reference/quyen-va-quy-trinh.md#kỳ-báo-cáo): bốn kỳ seed và hạn nộp.
- [Mô hình dữ liệu](../reference/mo-hinh-du-lieu.md#reporting_period): bảng `reporting_period`.
- [API](../reference/api.md): `GET` và `PATCH` kỳ báo cáo.
