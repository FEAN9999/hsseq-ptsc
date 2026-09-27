# Cách thêm hoặc sửa chỉ tiêu

Đổi danh mục chỉ tiêu của mẫu FM01: thêm dòng mới, sửa tên hay số chữ số thập phân, bỏ một dòng. Chưa có màn hình cho việc này; danh mục sửa bằng file seed và SQL.

Có hai tình huống, làm khác nhau:

- **Database dựng lại được** (máy dev, hoặc trước lần seed đầu trên bản demo): sửa file seed rồi dựng lại database.
- **Database đã có số cần giữ** (Supabase của bản demo): seed không bao giờ sửa dòng đã có, nên chỉ thêm được dòng mới; sửa và bỏ phải dùng SQL.

## Cần có

- Stack local (`docker compose -f infra/docker-compose.yml up -d --build`) và `backend/.venv`.
- Với tình huống thứ hai: quyền chạy SQL trên database đích (SQL Editor của Supabase, hoặc `psql` với chuỗi kết nối).

## Danh mục nằm ở đâu

`backend/app/seed/catalog_fm01.py`, danh sách `INDICATORS`. Mỗi dòng là một tuple:

```python
# (section_code, code, name_vi, name_en, unit, agg_type, formula, reset_rule, decimals, required)
('B-2', 'B-2.1', 'Chết người', 'FAT (Fatality)', 'Số vụ', 'sum', None, 'none', 0, True),
```

- `code` phải duy nhất trong mẫu.
- `agg_type` là `sum`, `counter`, `snapshot` hoặc `computed`. Chọn loại nào: xem [Lũy kế](../explanation/luy-ke.md#bốn-loại-chỉ-tiêu).
- `formula` chỉ dùng cho `computed`: các mã cần cộng, ngăn bằng dấu phẩy.
- Thứ tự hiển thị trong nhóm là thứ tự dòng trong danh sách. Seed đánh `sort_order` từ 1 lại ở mỗi nhóm.

## Database dựng lại được

1. Sửa `INDICATORS` (và `SECTIONS`, `TEXT_FIELDS` nếu cần).
2. Dựng lại database từ đầu. Lệnh này xoá mọi dữ liệu local:

   ```bash
   docker compose -f infra/docker-compose.yml down -v
   docker compose -f infra/docker-compose.yml up -d --build
   ```

3. Xuất lại danh mục mà test frontend dùng. Lệnh đọc database trong `DATABASE_URL` của `backend/.env`, và cần `JWT_SECRET` hợp lệ trong file đó:

   ```bash
   cd backend
   .venv/bin/python -c "from app.core.db import SessionLocal; from app.seed import export_catalog_json; export_catalog_json(SessionLocal(), '../frontend/src/test/fixtures/fm01-catalog.json')"
   ```

4. Sinh lại bộ số tổng hợp để nó có đủ chỉ tiêu mới:

   ```bash
   .venv/bin/python tests/fixtures/gen_fixture.py
   ```

5. Chạy test hai phía và sửa các ca đếm số chỉ tiêu:

   ```bash
   pytest
   cd ../frontend && npm test
   ```

   `backend/tests/api/test_seed.py` và `backend/tests/api/test_catalog.py` khẳng định đúng 53 chỉ tiêu, 4 dòng `counter`, 1 dòng `computed`. Đổi danh mục là đổi các con số đó có chủ đích.

6. Commit cả `catalog_fm01.py`, `fm01-catalog.json`, `full_synthetic.csv` và test đã sửa.

## Database đã có số cần giữ

### Thêm một chỉ tiêu

1. Thêm dòng vào CUỐI nhóm của nó trong `INDICATORS`. Thêm vào giữa nhóm làm `sort_order` của dòng mới trùng với dòng cũ, vì seed không đánh lại số cho dòng đã có.
2. Làm các bước 3 đến 6 của tình huống trên trên máy, rồi đẩy lên `main`.
3. Render khởi động lại và seed chèn chỉ tiêu mới (vì chưa có mã đó). Không cần SQL.

Hệ quả trên báo cáo đã có:

- Báo cáo Đã duyệt giữ nguyên, dòng mới trống.
- Nếu chỉ tiêu mới là bắt buộc, mọi báo cáo Nháp hoặc Trả lại phải điền dòng đó mới nộp được.
- Chỉ tiêu `sum` mới tự có lũy kế từ 0 (không có số dư mang sang).

### Sửa tên, đơn vị, số chữ số thập phân, bắt buộc

Seed không cập nhật dòng đã có. Chạy SQL trên database đích:

```sql
UPDATE indicator
   SET name_vi = 'Tên mới', required = false
 WHERE code = 'B-9.4'
   AND template_id = (SELECT id FROM report_template WHERE code = 'FM01');
```

Rồi sửa cùng giá trị trong `catalog_fm01.py` để database dựng mới về sau giống database đang chạy.

Cẩn thận:

- Giảm `decimals` khi đã có số lẻ: số cũ vẫn nằm đó. Báo cáo Nháp hoặc Trả lại chứa số đó sẽ bị chặn lúc nộp với lỗi `Chỉ nhận tối đa N chữ số thập phân` cho tới khi người nhập sửa ô. Kiểm trước bằng `SELECT` trên `report_value`.
- Đổi `agg_type` của chỉ tiêu đã có số làm đổi nghĩa các số đó (ví dụ `counter` sang `sum` thì lũy kế nhập bị bỏ qua). Nên tạo mã mới thay vì đổi loại.

### Bỏ một chỉ tiêu

Đừng `DELETE`: `report_value` trỏ tới chỉ tiêu không có `ON DELETE`, nên xoá dòng đã có số sẽ bị database từ chối. Tắt nó:

```sql
UPDATE indicator
   SET active = false
 WHERE code = 'B-9.4'
   AND template_id = (SELECT id FROM report_template WHERE code = 'FM01');
```

Chỉ tiêu tắt biến khỏi danh mục API, khỏi form, khỏi phép kiểm ô bắt buộc lúc nộp và khỏi loader fixture. Số đã nhập vẫn còn trong `report_value`. Bật lại bằng `active = true`.

## Kiểm tra

- `GET /api/v1/templates/FM01` trả đúng số chỉ tiêu mong đợi. Tắt `B-9.4` trên bộ seed hiện tại thì còn 52, và `B-9.4` không còn trong danh sách.
- Mở một báo cáo Nháp: dòng mới hiện đúng nhóm, đúng thứ tự, ô nhập đúng cột theo `agg_type`.
- `pytest` và `npm test` xanh.

## Gỡ lỗi

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| `test_file_catalog_json_trong_repo_dung_thu_tu` đỏ: "file trong repo lệch thứ tự, xuất lại đi" | Chưa làm bước 3, hoặc xuất từ database chưa dựng lại. |
| Sửa `catalog_fm01.py`, khởi động lại mà màn hình không đổi | Seed không cập nhật dòng đã có. Dùng SQL, hoặc `down -v` nếu là máy dev. |
| `ERROR: update or delete on table "indicator" violates foreign key constraint` | Đã có số cho chỉ tiêu đó. Dùng `active = false`. |
| Dòng mới hiện sai chỗ trong nhóm | `sort_order` trùng với dòng cũ. Sửa bằng `UPDATE indicator SET sort_order = ...`. |
| Dashboard không thấy chỉ tiêu mới | Sáu KPI có mã chỉ tiêu viết cứng trong `backend/app/api/dashboard.py`. Xem [Nền tảng theo dữ liệu](../explanation/nen-tang-theo-du-lieu.md#phần-còn-viết-cứng). |

## Xem thêm

- [Mô hình dữ liệu](../reference/mo-hinh-du-lieu.md#indicator): từng cột của bảng `indicator`.
- [Nền tảng theo dữ liệu](../explanation/nen-tang-theo-du-lieu.md): phần nào đổi được bằng dữ liệu, phần nào còn trong mã.
- [Fixture CSV](../reference/fixture-csv.md#sinh-lại-bộ-số-tổng-hợp): sinh lại bộ số thử.
