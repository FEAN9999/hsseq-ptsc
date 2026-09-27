# Vòng báo cáo đầu tiên

Bài này dựng hệ thống trên máy của bạn rồi đi hết một vòng báo cáo: một đơn vị nộp, Ban ATCL trả lại, đơn vị nộp lại, Ban ATCL duyệt, và tổng trên dashboard đổi theo. Ba bước đầu đưa bạn tới màn hình đăng nhập.

## Cần có

- Docker kèm `docker compose`.
- Node.js 20.19 trở lên (hoặc 22.12 trở lên).
- Cổng 8000, 55432 và 5173 đang trống.
- Mật khẩu của tài khoản seed: giá trị mặc định trong `_seed_users` của `backend/app/seed/__init__.py`. Mọi tài khoản seed dùng chung mật khẩu này (xem [Tài khoản seed](../reference/quyen-va-quy-trinh.md#tài-khoản-seed)).

Mọi lệnh chạy từ gốc repo.

## Bước 1: Dựng backend

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Lệnh dựng hai container: `db` (Postgres) và `api` (FastAPI). Lần đầu phải build image nên lâu hơn các lần sau. Xem log của `api`:

```bash
docker compose -f infra/docker-compose.yml logs api
```

Bạn sẽ thấy ba migration chạy, rồi:

```
file fixture /app/app/seed/fixtures/fm01_2026-06_2026-08.csv không có dòng dữ liệu nào nạp được, tạo 0 báo cáo
...
org_unit trống → seed_all()
seed xong
...
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Cảnh báo về file fixture là bình thường: file số thật trong repo mới có dòng tiêu đề. Seed đã tạo 35 đơn vị, 24 tài khoản, danh mục 53 chỉ tiêu và bốn kỳ báo cáo, nhưng chưa có báo cáo nào.

## Bước 2: Nạp số liệu mẫu

```bash
docker compose -f infra/docker-compose.yml exec -e FIXTURE_CSV=tests/fixtures/full_synthetic.csv api python -m scripts.reset_demo --yes
```

Kết quả:

```
Đã nạp 66 báo cáo.
```

Đó là 22 đơn vị nhân ba kỳ (06, 07, 08/2026), số tổng hợp giả dùng cho test. Tất cả đã được duyệt, trừ báo cáo kỳ 08/2026 của Ban dự án 05: seed đưa nó về Nháp để có việc cho bạn làm.

## Bước 3: Mở giao diện

```bash
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173. Màn hình "Đăng nhập HSSEQ" hiện ra. Dev server chuyển mọi lời gọi `/api/v1` sang backend ở cổng 8000.

## Nộp báo cáo

Bạn đóng vai người nhập của Ban dự án 05.

1. Đăng nhập `u22@ptsc.local`. Trang "Báo cáo SKATMT" liệt kê bốn kỳ; kỳ 08/2026 đang ở trạng thái "Nháp".
2. Bấm "Mở" ở dòng 08/2026.
3. Tìm dòng B-2.1 "Chết người". Ở cột "Tháng này", đổi số 3 thành 2 rồi bấm Tab. Một lát sau, đầu form hiện "Đã lưu" kèm giờ phút: form tự lưu khi bạn rời một ô đã sửa, không phải bấm nút "Lưu".
4. Bấm "Nộp báo cáo". Hộp thoại hỏi "Nộp báo cáo 08/2026 của Ban dự án 05 (tên tạm)?". Bấm "Nộp".

Thông báo "Đã nộp báo cáo 08/2026" hiện ở góc màn hình. Các ô khoá lại: báo cáo đã nộp thì người nhập không sửa được nữa.

## Trả lại

Giờ bạn đóng vai Ban ATCL. Mở một tab mới và gõ http://localhost:5173. Phiên đăng nhập nằm riêng trong từng tab, nên tab mới đăng nhập được tài khoản khác mà tab cũ vẫn giữ `u22`.

1. Đăng nhập `admin@ptsc.local`. Dashboard mở ra. Dòng dưới tiêu đề "Dashboard SKATMT" ghi "Tổng từ 21 báo cáo đã duyệt · Chờ duyệt 1": báo cáo bạn vừa nộp đang chờ duyệt. Nhớ số ở ô "FAT trong kỳ".
2. Chọn "Duyệt báo cáo" trên menu. Danh sách "Chờ duyệt (1)" có đúng một dòng, Ban dự án 05. Bấm "Mở".
3. Bấm "Trả lại…". Gõ lý do, ít nhất 10 ký tự, ví dụ "Kiểm tra lại số vụ chết người tháng 8". Bấm "Trả lại".

Thông báo "Đã trả lại" hiện ra.

## Nộp lại

Quay về tab đầu (người nhập) và tải lại trang (F5, hoặc Cmd+R trên Mac).

1. Đầu form có dải báo "Ban ATCL trả lại", kèm giờ và đúng lý do bạn vừa gõ. Các ô mở lại.
2. Đổi số ở dòng B-2.1 thành 1, bấm Tab, chờ "Đã lưu".
3. Bấm "Nộp lại", rồi "Nộp" trong hộp thoại.

Thông báo "Đã nộp lại 08/2026" hiện ra.

## Duyệt

Sang tab của Ban ATCL. Tab này vẫn mở báo cáo từ lúc bạn trả lại.

1. Tải lại trang. Báo cáo giờ ở trạng thái "Đã nộp" và có nút "Duyệt".
2. Bấm "Duyệt". Hộp thoại hỏi "Duyệt báo cáo này?". Bấm "Duyệt".
3. Thông báo "Đã duyệt" có liên kết "Xem dashboard". Bấm vào đó.

Dashboard giờ ghi "Tổng từ 22 báo cáo đã duyệt · Chờ duyệt 0". Ô "FAT trong kỳ" tăng đúng bằng số bạn nhập ở dòng B-2.1: số của Ban dự án 05 chỉ vào tổng khi báo cáo được duyệt.

Đừng bỏ bước tải lại. Không tải lại thì trạng thái và nút đã mới, nhưng các ô số vẫn là số của lúc bạn trả lại: dòng B-2.1 còn ghi 2 thay vì 1. Mở lại báo cáo qua menu "Duyệt báo cáo" cũng vậy. Bấm "Duyệt" lúc đó sẽ báo "Không chuyển trạng thái được: Người khác vừa sửa báo cáo này". Gặp câu này thì tải lại trang rồi mới duyệt. Đừng bấm "Duyệt" lần nữa: lần thứ hai sẽ qua, và bạn duyệt những con số chưa hề thấy trên màn hình. Đây là lỗi của form, xem [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md#cái-giá).

## Bạn vừa làm gì

- Đi hết bốn trạng thái của một báo cáo: Nháp, Đã nộp, Trả lại, Đã duyệt. Nút trên form đổi theo trạng thái và theo quyền của người đang xem.
- Thấy form tự lưu sau khi rời một ô đã sửa.
- Thấy dashboard chỉ cộng báo cáo đã duyệt.
- Dùng hai vai với hai phạm vi: `u22` chỉ thấy báo cáo của Ban dự án 05, `admin` thấy cả 22 đơn vị.

## Làm lại hoặc dừng

- Làm lại từ đầu: chạy lại lệnh ở bước 2. Mọi báo cáo về như lúc vừa nạp.
- Dừng frontend: Ctrl+C trong cửa sổ chạy `npm run dev`.
- Dừng backend, giữ dữ liệu: `docker compose -f infra/docker-compose.yml down`.
- Dừng và xoá sạch dữ liệu: `docker compose -f infra/docker-compose.yml down -v`.

## Tiếp theo

- [Quyền và quy trình](../reference/quyen-va-quy-trinh.md): vai trò, phạm vi, trạng thái và bước chuyển.
- [Lũy kế](../explanation/luy-ke.md): cột "Cộng dồn" được tính thế nào.
- [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md): điều gì giữ cho số không bị ghi đè khi hai người cùng sửa.
- [Cách nạp số liệu thật](../how-to/nap-so-lieu-that.md): thay số giả bằng số của các tháng đã qua.
