# TODOS

## Backend

### Reset lũy kế `sum` đầu năm (trước kỳ 01/2027)

**What:** Thêm `org_unit.acc_reset` (`yearly` | `never`) và cho view `v_report_value_computed` cộng từ `GREATEST(dòng opening_balance gần nhất, đầu năm)`; hoặc tối thiểu script `open_year.py` chèn `opening_balance = 0` cho mọi (đơn vị lũy kế theo năm, chỉ tiêu `sum`) tại kỳ 01.

**Why:** MVP hoãn reset đầu năm (quyết định gstack `3bc0293c`, Completeness 3/10). Không làm thì kỳ 01/2027 cộng tiếp số 2026 ở cột "Lũy kế tháng trước" của 22 đơn vị, ngay kỳ đầu năm mới.

**Context:** View chỉ dựa vào dòng `opening_balance` gần nhất theo `start_date` của kỳ (xem `docs/designs/hseq-platform-mvp-fm01.md`, mục Mô hình dữ liệu). Marker `gstack-shortcut(dec-3bc0293c)` nằm trong migration định nghĩa view. Ban dự án lũy kế theo đời dự án nên có thể không reset; Đơn vị theo năm dương lịch (cần Ban ATCL xác nhận, Open Question 2). Bắt đầu từ `backend/tests/sql` (thêm ca "kỳ 01 của năm mới"), rồi migration thêm cột và sửa view.

**Effort:** M
**Priority:** P1
**Depends on:** Ban ATCL chốt Open Question 2 (cơ sở lũy kế Đơn vị vs Ban dự án); MVP đã demo.

### Chặn dò mật khẩu, audit đăng nhập sai, đổi mật khẩu lần đầu (trước khi dùng thật / on-prem)

**What:** Giới hạn đăng nhập sai (ví dụ 5 lần / 15 phút theo tài khoản + IP, trả 429, đếm trong Postgres), ghi `audit_log` cho mỗi lần đăng nhập sai, cột `app_user.must_change_password` + endpoint đổi mật khẩu + màn hình đổi mật khẩu; đổi mật khẩu demo chung của 22 tài khoản người nhập.

**Why:** MVP chỉ có vệ sinh tối thiểu (bcrypt, `JWT_SECRET` env, `CORS_ORIGINS` env) và 22 tài khoản người nhập dùng chung một mật khẩu demo trên URL công khai. Chấp nhận được trong 3 tuần demo; không chấp nhận được khi giao cho đơn vị dùng thật hoặc lên on-prem (câu hỏi đầu tiên của Ban NCPT & CĐS).

**Context:** `POST /auth/login` trong `backend/app/api/auth.py`; bảng `audit_log` đã có; seed 22 tài khoản trong `backend/app/seed/`. Nếu Open Question 9 trả lời "cần SSO/AD ngay" thì phần throttling và đổi mật khẩu có thể thay bằng tích hợp AD; audit đăng nhập sai vẫn cần.

**Effort:** M
**Priority:** P1
**Depends on:** Sau demo; trước khi mở cho đơn vị dùng thật hoặc on-prem; câu trả lời Open Question 9 (SSO/AD).

### Import lite từ file tổng hợp chung theo CSV layout của fixture

**What:** `scripts/import_lite.py`: đọc sheet tổng hợp bằng openpyxl + bảng ánh xạ tên đơn vị / dòng chỉ tiêu, xuất ra đúng CSV layout của fixture (`org_code, period, indicator_code, this_period, acc_prev, acc_total, note`), rồi đi qua loader + assert lũy kế sẵn có; chỉ insert-if-absent (không bao giờ đè báo cáo nộp sống); in danh sách lệch. Không có endpoint upload.

**Why:** MVP bỏ script nạp lịch sử (quyết định gstack `8896ec11`, Completeness 7/10): số thật đến từ CSV dán tay 3 tháng. Mỗi tháng cũ muốn thêm sau demo lại là ~1.200 ô dán tay; khi chuyển hẳn từ sheet sang hệ thống cần một lệnh.

**Context:** Loader, validate chặt và assert `OB + Σ this_period == acc_total` đã có trong `backend/app/seed/` (marker `gstack-shortcut(dec-8896ec11)`). Chỉ thiếu đoạn sheet → CSV. Cấu trúc file thật chưa biết (Open Question 1) và form "điều chỉnh theo từng dự án" nên ánh xạ theo từng đơn vị. Bắt đầu bằng hàm sheet → CSV và test trên file thật 1 tháng.

**Effort:** M
**Priority:** P2
**Depends on:** Có file tổng hợp thật với cấu trúc ổn định; cần > 3 tháng lịch sử hoặc Ban ATCL muốn bỏ sheet; sau demo.

### KPI toàn Tổng công ty "giờ an toàn kể từ LTI cuối"

**What:** Khi Ban ATCL chốt định nghĩa, thêm KPI toàn TCT vào `GET /dashboard/summary`: tính từ 3 dòng giờ `sum` + dòng LTI theo tháng (chính xác tới tháng), hoặc từ trường "ngày LTI gần nhất" nếu FM01 được bổ sung; nhãn ghi rõ độ chính xác; 2 test domain.

**Why:** Eng review D22 bỏ KPI này khỏi 6 ô KPI vì "min của các đơn vị" sai nghiệp vụ và FM01 không có ngày xảy ra LTI; thay bằng "số đơn vị có LTI trong kỳ / 22". Con số theo đơn vị vẫn hiện trong bảng 22 đơn vị. Đây là con số lãnh đạo HSE quen nhìn nhất nên cần đường quay lại có định nghĩa đúng.

**Context:** Định nghĩa đúng hướng: tổng giờ công toàn TCT cộng dồn kể từ LTI gần nhất ở bất kỳ đơn vị nào. Câu hỏi chốt: tính từ ngày xảy ra hay ngày ghi nhận (Open Question 2); có thêm ô "ngày LTI gần nhất" vào FM01 không (đổi mẫu). Bắt đầu từ hàm KPI trong `backend/app/domain/` và seed `indicator`.

**Effort:** S
**Priority:** P3
**Depends on:** Ban ATCL trả lời Open Question 2; phản hồi của Trưởng Ban sau dashboard tĩnh 15/09.

## Frontend

### Logo PTSC chính thức thay wordmark chữ (sau demo, trước on-prem)

**What:** Thay component `Wordmark` (chữ "PTSC" 16/600 + "Ban An toàn Chất lượng" 12px) bằng logo PTSC chuẩn 24px kèm dòng tên Ban; giữ nguyên vị trí ở đỉnh sidebar và đầu khối `/login`.

**Why:** Design review D10: màn đầu tiên lãnh đạo thấy phải nhận ra ngay là hệ thống của Tổng công ty, không phải một "HSEQ Platform" chung chung. Wordmark chữ đủ cho demo vì không phụ thuộc ai, nhưng bản dùng thật nên theo bộ nhận diện.

**Context:** Component đã chừa sẵn chỗ cho ảnh 24px, thay là đổi một file. Cần xin file SVG (hoặc PNG @2x) và quy định nhận diện từ bộ phận truyền thông; nếu bộ nhận diện có màu xanh dương riêng thì cân nhắc dùng cho wordmark, **không** đổi accent cyan của app (token app UI ở `docs/designs/hseq-platform-mvp-fm01.md`, mục "Kết quả /plan-design-review").

**Effort:** S
**Priority:** P3
**Depends on:** File logo từ bộ phận truyền thông; sau demo.

### Kiểm a11y bằng screen reader thật (trước on-prem)

**What:** Chạy VoiceOver (macOS) hoặc NVDA (Windows) trên `/reports/:id` (55 dòng) và `/dashboard`, nghe cách đọc `aria-label` từng ô, banner `role="alert"`, chip trạng thái và ô "—"; rút gọn hoặc sửa câu đọc nếu dài dòng; ghi lại kết quả vào `docs/`.

**Why:** Design review D22 đặt sẵn thuộc tính a11y (ô chỉ đọc là `<td>`, `aria-label` "B-2.1 Số vụ LTI, Tháng này", `aria-invalid` + `aria-describedby`, `aria-label` "chưa có dữ liệu" cho "—", tương phản ≥ 4.5:1) nhưng chưa ai nghe thử. Viết đúng thuộc tính không bảo đảm nghe ra nghĩa, nhất là bảng 55 × 5 ô.

**Context:** Bắt đầu từ một nhóm chỉ tiêu (B-1) rồi mới cả form; kiểm cả điều hướng bằng bàn phím (Enter xuống ô cùng cột, Tab bỏ qua ô chỉ đọc, Esc khôi phục, Ctrl+S) vì đó là đường dùng chính của người nhập. Không cần trong 3 tuần demo (không có người dùng khiếm thị được biết), nhưng hệ thống sẽ dùng thật cho 22 đầu mối.

**Effort:** S
**Priority:** P3
**Depends on:** FE form và dashboard chạy được (T12); sau demo.

## Completed
