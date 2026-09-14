# HSEQ PTSC

Nền tảng báo cáo HSEQ nội bộ PTSC — FastAPI + Postgres (backend), React (frontend).

## Chạy local

```bash
docker compose -f infra/docker-compose.yml up -d
```

- `db`: Postgres 16, cổng `55432` (55432 là cổng host vì cổng 5432 đã bị dự án khác chiếm), database `hseq` (user/pass `hseq`).
- `api`: cổng `8000` → http://localhost:8000.

Dừng: `docker compose -f infra/docker-compose.yml down`.

## Seed dữ liệu

Tự động: mỗi lần container `api` khởi động, entrypoint chạy `alembic upgrade head && python -m scripts.seed` trước khi mở server. Seed insert-if-absent nên chạy lại nhiều lần vô hại.

Chạy tay, không khởi động lại container:

```bash
docker compose -f infra/docker-compose.yml exec api python -m scripts.seed
```

## Reset demo

### Đường nhanh (giây, giữ nguyên container)

Xoá `report`, `report_value`, `report_text`, `audit_log`, `opening_balance` rồi nạp lại từ fixture qua `seed_all()`; giữ nguyên danh mục, đơn vị, tài khoản. Chạy trước mỗi lượt demo hoặc Playwright (`backend/scripts/reset_demo.py`):

```bash
docker compose -f infra/docker-compose.yml exec api python -m scripts.reset_demo --yes
```

Từ máy host, ngoài container (`.venv`) — `.env` không tự export ra biến môi trường tiến trình nên phải đặt `APP_ENV` ngay trên dòng lệnh:

```bash
cd backend && APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes
```

### Đường toàn phần

Xoá sạch dữ liệu kể cả volume Postgres rồi dựng lại từ đầu — `db` tạo lại `hseq`/`hseq_test` sạch, `api` tự migrate và seed lại:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
```

## Chạy test

Test chạy trên database riêng `hseq_test`, qua cổng host `55432` — chỉ cần service `db`, không cần `api`:

```bash
docker compose -f infra/docker-compose.yml up -d db
cd backend
cp .env.example .env   # TEST_DATABASE_URL đã trỏ sẵn tới hseq_test
uv pip install --system -r pyproject.toml --extra dev
pytest
```

## Chạy e2e (Playwright)

Bộ e2e nằm ở `e2e/` gốc repo và là một **gói npm riêng** — cố ý không nằm trong `frontend/`, vì
`npm test` của frontend (`npm run build && vitest run`) không được phép phụ thuộc vào một server
đang chạy. Nó nói chuyện với cả backend lẫn frontend.

```bash
docker compose -f infra/docker-compose.yml up -d --build   # --build: xem cảnh báo dưới
cd e2e
npm install && npx playwright install chromium             # chỉ lần đầu
npx playwright test                                        # 2 viewport: 1280×800 và 1024×640 (=125%)
```

Không cần tự chạy `npm run preview`: `playwright.config.ts` khai `webServer` nên nó tự dựng
`frontend` và tự dọn.

### Trỏ vào một bản deploy: `BASE_URL`

```bash
BASE_URL=https://<bản-deploy> npx playwright test
```

Lúc đó `webServer` tự tắt (server đã có sẵn) và `resetDemo()` **tự bỏ qua** — `.venv` trên máy này
không nói chuyện được với database của server đó, và xoá dữ liệu trên máy chủ thật là chuyện khác
hẳn về hậu quả. Bộ test vì vậy chia đôi theo đúng thứ nó CẦN:

| ở chế độ `BASE_URL` | ca |
|---|---|
| **chạy** (6) | phân loại hostname ×2 (thuần, không cần server) · không cuộn ngang · titlebar · rbac 403 · rbac chưa đăng nhập — đây là bộ khói cho một bản deploy |
| **bỏ qua**, in rõ lý do (6) | demo phân đoạn 2 · lớp làm mới cache · Ctrl+S · hộp thoại trên lớp dính · hộp thoại trên Toast · rbac người xem — sáu ca này cần một báo cáo **nháp sạch** |

Muốn chạy cả sáu ca kia trên bản deploy thì reset ở chính máy chủ đó trước
(`docker compose exec api python -m scripts.reset_demo --yes`) rồi chạy lẻ từng ca bằng `-g`.

"Máy nhà hay từ xa" được quyết ở `e2e/moi-truong.ts` theo **hostname đã phân tích cú pháp**, không
theo tiền tố chuỗi: `localhost`, `127.0.0.1`, `0.0.0.0`, `::1` và `*.localhost` là máy nhà, bất kể
`http`/`https` hay cổng. (`http://0.0.0.0:5173` được xếp đúng là máy nhà, nhưng muốn chạy thật ở
địa chỉ đó thì `vite preview` phải thêm `--host` — mặc định nó chỉ nghe ở loopback.)

- **Phải `--build`.** `docker compose up -d` không tự build lại khi image `infra-api` đã tồn tại, nên
  nó chạy im lặng bằng mã cũ. Một lần như vậy đã làm `GET /status` trả thiếu `report_id` và mọi chip
  trong lưới trỏ về `/reports/undefined` mà không có lỗi nào hiện ra.
- **`FIXTURE_CSV`:** helper `resetDemo()` trỏ `FIXTURE_CSV` sang `backend/tests/fixtures/full_synthetic.csv`
  vì fixture số thật (`backend/app/seed/fixtures/fm01_2026-06_2026-08.csv`) hiện mới có dòng tiêu đề.
  Khi đã dán số thật vào đó thì bỏ biến này đi.

## Kết nối Supabase

Tạo project Supabase và nhập mật khẩu database là việc của Chồng yêu — hành động ngoài máy này, không phải việc của subagent.

Checklist khi dựng:

- [ ] Tạo project Supabase, region Singapore. Lưu lại mật khẩu database (Supabase chỉ hiện một lần).
- [ ] Supabase → Connect → chọn **Session pooler**, cổng **5432** (host dạng `aws-0-<region>.pooler.supabase.com`).
  - **Không** dùng *Direct connection* — chỉ IPv6, Render free không ra được.
  - **Không** dùng *Transaction pooler* (cổng **6543**) — không hợp với connection pool của SQLAlchemy ở `app/core/db.py`.
- [ ] Giữ `?sslmode=require` ở cuối chuỗi.
- [ ] Thử tại chỗ bằng `create_engine` + `select version()`; kỳ vọng in ra `PostgreSQL 15.x ...`. Lỗi `Network is unreachable` nghĩa là đang cầm nhầm chuỗi Direct connection — quay lại bước chọn pooler.
- [ ] Dán chuỗi đã chạy được vào đây, **che mật khẩu**:

  ```
  postgresql+psycopg://postgres.<project-ref>:***@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
  ```

  _(placeholder — chưa có project Supabase thật nên chưa có chuỗi thật để dán)_
