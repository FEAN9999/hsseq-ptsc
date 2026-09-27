# Cách nạp số liệu thật

Đưa số của các tháng đã qua từ file tổng hợp chung vào hệ thống, kiểm trên máy trước, rồi nạp lên bản demo.

## Cần có

- Stack local chạy được (`docker compose -f infra/docker-compose.yml up -d --build`), hoặc `backend/.venv` và `backend/.env` có `JWT_SECRET` hợp lệ.
- Số của các tháng cần nạp, đủ mọi đơn vị và mọi chỉ tiêu bắt buộc.
- Định dạng file ở [Fixture CSV](../reference/fixture-csv.md). Đọc mục "Quy tắc kiểm" trước khi chép số.

## Các bước

### 1. Chép số ra file CSV

Ghi vào `backend/app/seed/fixtures/fm01_2026-06_2026-08.csv`, file mặc định mà seed đọc. Giữ nguyên dòng tiêu đề:

```csv
org_code,period,indicator_code,this_period,acc_prev,acc_total,note
```

- Mỗi dòng một ô (đơn vị, kỳ, chỉ tiêu). `org_code` là mã seed (`U01` đến `U17`, `P01` đến `P05`), không phải tên đơn vị.
- Số dùng dấu chấm thập phân, không có dấu ngăn nghìn. `3.00` được chấp nhận với chỉ tiêu không có số lẻ.
- `acc_prev` của kỳ đầu tiên là lũy kế mang sang từ trước khi dùng hệ thống. Mọi cặp (đơn vị, chỉ tiêu) phải bắt đầu ở cùng kỳ đầu tiên đó.
- Bỏ dòng `B-1.4` (Tổng giờ công) cũng được; có thì loader bỏ qua.
- Lưu UTF-8. Excel "CSV UTF-8" thêm BOM ở đầu file, loader đọc được.

### 2. Kiểm trên máy

Container `api` chép mã nguồn lúc build, nên phải build lại để nó thấy file mới:

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml exec api python -m scripts.reset_demo --yes
```

Hoặc chạy thẳng từ máy, đọc file trên đĩa, không cần build:

```bash
cd backend
APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes
```

File đúng thì lệnh in `Đã nạp N báo cáo.`, với N là số cặp (đơn vị, kỳ) trong file. File sai thì lệnh in danh sách mọi dòng lỗi và thoát mã 1; database giữ nguyên như trước khi chạy. Sửa từng dòng theo danh sách rồi chạy lại.

### 3. Đối chiếu trên giao diện

Chạy frontend (`npm run dev` trong `frontend/`), đăng nhập `admin@ptsc.local`:

- Dashboard kỳ cuối của file hiện "Tổng từ N báo cáo đã duyệt". Nếu file có báo cáo kỳ `2026-08` của P05 thì N ít hơn một, vì seed đưa báo cáo đó về Nháp cho đường demo.
- Mở vài báo cáo, so với file tổng hợp. Cột "Lệch" (cộng dồn trong file trừ cộng dồn hệ thống tính) phải bằng 0 ngay sau khi nạp, vì loader đã từ chối file cộng sai. Nó chỉ khác 0 về sau, khi một kỳ trước đó bị trả lại hoặc mở lại.

### 4. Đưa lên repo

```bash
git add backend/app/seed/fixtures/fm01_2026-06_2026-08.csv
git commit -m "seed: số thật FM01 kỳ 06 đến 08/2026"
git push
```

Đẩy lên `main` làm Vercel và Render tự deploy lại. Khi Render khởi động, seed thấy file khác với file đã nạp trước đó và chỉ ghi cảnh báo `fixture đã đổi ...`, không nạp. Số chưa lên bản demo cho tới bước 5.

### 5. Nạp lên database của bản demo

Lệnh này XOÁ mọi báo cáo, số liệu, nhật ký trên database đích rồi nạp lại từ file. Chỉ chạy khi chắc chắn không có số nào nhập tay trên bản demo cần giữ.

Chạy từ máy, trỏ vào Supabase. `read -rs` để chuỗi kết nối (có mật khẩu) không hiện ra màn hình và không vào lịch sử shell:

```bash
cd backend
read -rs DB_URL
APP_ENV=demo DATABASE_URL="$DB_URL" .venv/bin/python -m scripts.reset_demo --yes
unset DB_URL
```

Dán chuỗi Session pooler (cổng 5432, có `?sslmode=require`) vào dòng `read`, rồi Enter. Lệnh đọc file CSV từ bản checkout trên máy, nên máy phải đang ở đúng commit vừa đẩy.

## Kiểm tra

- Lệnh ở bước 5 in `Đã nạp N báo cáo.` với cùng N như bước 2.
- Mở https://hsseq-ptsc.vercel.app, đăng nhập admin: dashboard hiện cùng số như trên máy.
- Log Render lần khởi động sau không còn dòng `fixture đã đổi`.

## Gỡ lỗi

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| `FixtureError: Fixture không hợp lệ:` kèm danh sách | Sửa từng dòng được nêu. Câu báo nghĩa là gì: xem [Fixture CSV](../reference/fixture-csv.md#quy-tắc-kiểm). |
| `CẢNH BÁO: file fixture ... không có dòng dữ liệu nào nạp được` | File chỉ có tiêu đề. Lưu file trước khi chạy, hoặc (với Docker) chưa build lại image. |
| `CẢNH BÁO: không có file fixture ..., bỏ qua` | Sai đường dẫn, hoặc `FIXTURE_CSV` còn trỏ chỗ khác. `unset FIXTURE_CSV` rồi chạy lại. |
| `APP_ENV chưa được đặt, không thuộc các môi trường an toàn...` | Đặt `APP_ENV` ngay trên dòng lệnh. Ghi trong `.env` không có tác dụng với lệnh này. |
| `RuntimeError: JWT_SECRET thiếu hoặc còn là giá trị mặc định...` | `backend/.env` còn giá trị mẫu. Xem [Cấu hình và lệnh](../reference/cau-hinh-va-lenh.md#jwt_secret). |
| Dashboard trên máy vẫn là số cũ | Chạy bằng Docker mà quên `--build`: container vẫn giữ file cũ. |
| Sau `down -v`, container `api` không lên | Database trống nên seed kiểm file ngay lúc khởi động, file sai làm seed lỗi và uvicorn không mở. Xem `docker compose -f infra/docker-compose.yml logs api`. |
| Bộ e2e báo sai số sau khi có số thật | `e2e/helpers.ts` vẫn trỏ `FIXTURE_CSV` sang bộ số tổng hợp. Xem ghi chú `FIXTURE_CSV` trong mục e2e của [README](../../README.md#chạy-e2e-playwright). |

## Xem thêm

- [Fixture CSV](../reference/fixture-csv.md): định dạng, quy tắc kiểm, dấu sha256.
- [Lũy kế](../explanation/luy-ke.md): số dư mang sang và cột "Lệch".
- [Cấu hình và lệnh](../reference/cau-hinh-va-lenh.md): `APP_ENV`, `FIXTURE_CSV`, `DATABASE_URL`.
