# Kiến trúc

Trang này giải thích hệ thống được ghép từ những phần nào, dữ liệu đi qua chúng ra sao, và vì sao chọn cách ghép này. Chi tiết từng phần nằm ở các trang tra cứu, liên kết ở cuối.

## Bài toán

Ban ATCL của PTSC thu báo cáo SKATMT tháng (mẫu FM01) từ 22 đầu mối: 17 đơn vị thành viên và 5 ban dự án. Hiện trạng là một file tổng hợp chung mà 22 đầu mối cùng điền. Khâu thu thập đã chạy, nhưng file chung không cho biết ai chưa nộp, số cũ có thể bị sửa mà không ai biết, lũy kế nhập tay dễ lệch, và không có lịch sử thay đổi (`docs/designs/hseq-platform-mvp-fm01.md`, mục Status Quo).

Hệ thống này giữ nguyên bố cục form mà đầu mối quen, nhưng thêm những gì file chung thiếu: trạng thái nộp và duyệt theo kỳ, lũy kế do máy tính kèm kiểm tra, nhật ký thao tác, dashboard tổng hợp tự cộng từ báo cáo đã duyệt.

Ràng buộc định hình kiến trúc:

- Dưới 3 tuần tới buổi demo, chủ yếu một người làm, hạ tầng dùng gói miễn phí.
- Số đã gõ không được mất, và phải khớp với file tổng hợp mà Ban ATCL vẫn dùng để đối chiếu.
- FM01 là mẫu đầu tiên, không phải mẫu duy nhất. Thêm mẫu mới không được đòi migration.

## Các phần

```
  Trình duyệt
  ┌──────────────────────────────┐
  │ React SPA (frontend/)        │
  │  pages → features → api      │
  └──────────────┬───────────────┘
                 │ HTTPS, JSON, Bearer token
                 │ /api/v1/...
  ┌──────────────▼───────────────┐
  │ FastAPI (backend/app/)       │
  │  api      route, kiểm quyền  │
  │  services đọc ghi báo cáo,   │
  │           chuyển trạng thái  │
  │  domain   luật số, thuần     │
  │  models   ORM                │
  └──────────────┬───────────────┘
                 │ SQLAlchemy + psycopg
  ┌──────────────▼───────────────┐
  │ PostgreSQL                   │
  │  18 bảng + view lũy kế       │
  └──────────────────────────────┘
```

Ba nơi chạy, hai bộ:

| | Máy dev | Bản demo |
|---|---|---|
| Frontend | Vite, cổng 5173 | Vercel, `https://hsseq-ptsc.vercel.app` |
| API | Container Docker, cổng 8000 | Render (Docker), `https://hsseq-ptsc-api.onrender.com` |
| Database | Postgres 16 trong Docker, cổng 55432 | Supabase, Postgres 17.6 |
| Cách frontend gọi API | Cùng origin, Vite chuyển tiếp `/api/v1` | Khác origin, qua CORS |

Mã backend chia lớp theo hướng phụ thuộc một chiều:

- `app/api/`: route FastAPI. Kiểm quyền bằng dependency (`deps.py`), gọi service, trả JSON.
- `app/services/`: `reports.py` đọc và ghi báo cáo, `workflow.py` chuyển trạng thái.
- `app/domain/report_rules.py`: luật số (cột nào nhập được, số âm, số thập phân, ô bắt buộc, dòng tự tính, kiểm bộ đếm). Hàm thuần, không đụng database, test được bằng dữ liệu tay.
- `app/models/`: bảng ORM. `app/schemas/`: hình dạng request và response (pydantic).
- `app/seed/`: dữ liệu khởi tạo và loader fixture.
- `app/core/`: cấu hình, kết nối database, băm mật khẩu, JWT, lớp lỗi.

Frontend chia theo tính năng: `pages/` là trang gắn với route, `features/<tên>/` giữ logic của từng màn (form báo cáo, dashboard, tình trạng nộp, quản trị), `api/client.ts` là cửa duy nhất ra mạng.

## Một lượt ghi số

Đây là đường đi quan trọng nhất của hệ thống:

```
Người nhập rời ô đã sửa
  │  chờ 1,5 giây, gộp các ô đã đổi
  ▼
PUT /api/v1/reports/{id}/values  {version, values[], texts?}
  │
  ▼  app/api/reports.py
  kiểm quyền report.edit, phạm vi đơn vị ──► 403
  │
  ▼  app/services/reports.py
  khoá dòng report
  trạng thái không cho sửa ──► 403
  so version ──► 409 kèm số hiện tại
  làm tròn theo decimals của chỉ tiêu
  kiểm luật số (app/domain/report_rules.py) ──► 400 kèm từng ô lỗi
  ghi report_value, report_text; version + 1; source = live
  đọc lại cả báo cáo qua view lũy kế (một câu SQL)
  │
  ▼  app/core/db.py: COMMIT (lỗi ở bất kỳ bước nào thì ROLLBACK)
  │
  ▼
Form nhận số mới, dòng tự tính và lũy kế đổi theo
```

Server trả lại toàn bộ số đã tính trong cùng phản hồi. Trong lúc gõ, frontend chỉ cộng tạm cột "Cộng dồn" bằng lũy kế kỳ trước (do server tính) cộng số đang gõ. Dòng tự tính "Tổng giờ công" và mọi số lũy kế kỳ trước đều chờ server, nên chỉ có một bản công thức.

## Các lựa chọn và cái giá

### Ba dịch vụ miễn phí thay vì một máy chủ

Vercel, Render, Supabase đều có gói miễn phí và tự deploy khi đẩy mã lên `main`. Không phải quản lý máy chủ, không tốn tiền trước khi biết Ban ATCL có dùng thật hay không.

Cái giá:

- Render free ngủ sau 15 phút không có request, lần đánh thức đầu mất khoảng 50 giây. Trang đăng nhập gọi `/health` ngay khi mở để đánh thức API trong lúc người dùng gõ mật khẩu, và README ghi việc còn thiếu là một monitor UptimeRobot 5 phút một lần.
- Frontend và API khác origin nên phải cấu hình CORS và `VITE_API_BASE`. Sai một trong hai là hỏng ở bản deploy mà máy dev không thấy.
- Supabase buộc dùng Session pooler cổng 5432. Direct connection chỉ có IPv6 mà Render free không ra được.

Bản on-prem vẫn giữ được: `infra/docker-compose.yml` chạy đủ database và API trên một máy, chỉ thiếu nginx phục vụ frontend.

### JWT trong `sessionStorage`, không có refresh token

Token HS256 sống 12 giờ, lưu theo tab. Không có refresh token, không có bảng phiên.

Lợi: không có trạng thái phiên phía server, đủ cho một ca làm việc. Đóng tab là đăng xuất, hợp với máy tính dùng chung ở văn phòng.

Giá: mở tab mới phải đăng nhập lại. Token hết hạn giữa chừng thì lời gọi kế tiếp nhận 401 và trang chuyển về đăng nhập; những ô chưa kịp lưu lúc đó không được giữ lại.

JWT thường không thu hồi được trước khi hết hạn. Ở đây mỗi request đều đọc lại tài khoản và quyền từ database (`app/api/deps.py`), nên tắt `app_user.active` hay gỡ một vai trò có hiệu lực ngay ở request kế tiếp. Đổi lại mỗi request tốn thêm một câu SELECT.

### Lũy kế là view SQL, không phải cột lưu sẵn

Lũy kế của chỉ tiêu cộng dồn được tính lại mỗi lần đọc từ số từng tháng đã duyệt. Trả lại hay mở lại một báo cáo cũ tự đổi lũy kế của mọi kỳ sau, không cần chạy lại gì. Lý do đầy đủ ở [Lũy kế](luy-ke.md).

Giá là tốc độ đọc. Bản đầu mất khoảng 490 ms cho một `GET /reports/{id}` vì Postgres chạy lại thân view một lần cho mỗi dòng chỉ tiêu. Sửa bằng CTE `MATERIALIZED` lọc sẵn theo báo cáo, còn khoảng 17 ms (ghi chú ở `backend/app/services/reports.py`). Một test đếm số câu SQL giữ `GET /reports/{id}` ở tối đa hai câu cho cả request, kể cả câu xác thực.

### Mẫu báo cáo và quy trình là dữ liệu

Chỉ tiêu, nhóm, ô chữ, trạng thái, bước chuyển và quyền của từng bước nằm trong bảng, không nằm trong mã. Form, danh sách nút và luật kiểm đều đọc từ đó. Giới hạn hiện tại và phần còn viết cứng ở [Nền tảng theo dữ liệu](nen-tang-theo-du-lieu.md).

### Lỗi là câu tiếng Việt từ server

Mọi lỗi nghiệp vụ trả `{"detail": "<câu tiếng Việt>", ...}` và frontend hiện nguyên văn. Chỉ có một nơi viết câu lỗi là backend, nên màn hình và API không nói hai câu khác nhau cho cùng một lỗi. Giá là frontend không được dò nội dung câu để rẽ nhánh, phải dựa vào mã HTTP và các trường đi kèm như `values`, `errors`, `state`.

### Một transaction cho mỗi request

`get_db` mở một session cho mỗi request, commit khi xong, rollback khi có lỗi. Nhật ký thao tác ghi trong cùng transaction với thay đổi nó mô tả, nên không có dòng nhật ký nào sống sót khi thay đổi bị huỷ, và ngược lại.

## Không có trong kiến trúc

- Không có hàng đợi, cache phía server, hay tiến trình chạy nền.
- Không có màn hình tạo, sửa mẫu, đơn vị, người dùng. Việc đó hiện làm bằng seed và SQL, xem các trang hướng dẫn.
- Không gửi email hay thông báo. Người nhập biết báo cáo bị trả lại khi mở danh sách hoặc mở báo cáo.

## Xem thêm

- [API](../reference/api.md), [Mô hình dữ liệu](../reference/mo-hinh-du-lieu.md), [Frontend](../reference/frontend.md): chi tiết từng lớp.
- [Cấu hình và lệnh](../reference/cau-hinh-va-lenh.md): biến môi trường và cổng của cả hai bộ.
- [An toàn nhập liệu](an-toan-nhap-lieu.md): các lớp bảo vệ số đã gõ.
