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

`BASE_URL` luôn là origin **frontend** — bốn lời gọi API qua `request` của Playwright
(`tokenApi`, `dsBaoCao`, `nopBaoCaoQuaApi`) đi bằng đường dẫn tương đối nên mặc định bám theo đúng
origin đó (same-origin, đúng cho local qua proxy của `vite preview`). Khi API nằm ở origin RIÊNG
(Vercel ≠ Render — xem mục "Deploy" bên dưới), đặt thêm `API_BASE_URL`:

```bash
BASE_URL=https://<vercel-app>.vercel.app API_BASE_URL=https://<render-app>.onrender.com \
  npx playwright test --project=desktop-1280
```

Không đặt `API_BASE_URL` ⇒ mặc định bằng chính `BASE_URL` — không đổi hành vi cũ. Lớp phân giải
này (`apiUrl()` ở `e2e/moi-truong.ts`) là logic thuần, có ca test riêng ở `moi-truong.spec.ts`.

**Chú ý hình dạng — khác `VITE_API_BASE`:** `API_BASE_URL` chỉ là ORIGIN trần, KHÔNG kèm `/api/v1`
(bốn lời gọi API trong `helpers.ts` tự thêm `/api/v1/...` vào sau qua `goiApi()`, xem ví dụ lệnh ở
trên). `VITE_API_BASE` (frontend, mục "Deploy" bên dưới) thì NGƯỢC LẠI — **phải** kèm sẵn `/api/v1`
ở cuối, vì `client.ts` dùng nó làm tiền tố đứng ngay trước path (`/health`, `/auth/login`...). Chép
nhầm giá trị của biến này sang biến kia ra `.../api/v1/api/v1/...` (lỡ kèm `/api/v1` vào
`API_BASE_URL`) hoặc thiếu hẳn `/api/v1` (quên kèm vào `VITE_API_BASE`) — hai kiểu hỏng khác nhau,
dễ nhầm vì tên hai biến rất giống nhau.

Lúc đó `webServer` tự tắt (server đã có sẵn) và `resetDemo()` **tự bỏ qua** — `.venv` trên máy này
không nói chuyện được với database của server đó, và xoá dữ liệu trên máy chủ thật là chuyện khác
hẳn về hậu quả. Bộ test vì vậy chia đôi theo đúng thứ nó CẦN:

| ở chế độ `BASE_URL` | ca |
|---|---|
| **chạy** (10) | thuần, không cần server: phân loại hostname ×2 · `apiUrl` ×2 · lớp nối F23 ×2 (`API_ORIGIN` đọc `process.env` thật · `helpers.ts` đi qua `goiApi`) — cộng bốn ca cần trình duyệt: không cuộn ngang · titlebar · rbac 403 · rbac chưa đăng nhập — đây là bộ khói cho một bản deploy |
| **bỏ qua**, in rõ lý do (6) | demo phân đoạn 2 · lớp làm mới cache · Ctrl+S · hộp thoại trên lớp dính · hộp thoại trên Toast · rbac người xem — sáu ca này cần một báo cáo **nháp sạch** |

Tổng 16 ca/project (32 cho cả hai project `desktop-1280` + `zoom-125`).

Muốn chạy cả sáu ca kia trên bản deploy thì reset ở chính máy chủ đó trước
(`docker compose exec api python -m scripts.reset_demo --yes`) rồi chạy lẻ từng ca bằng `-g`.

**Riêng `spa-fallback.spec.ts` (2 ca, task-28-review.md P5):** cũng cách ly mạng hoàn toàn (chạy ở
MỌI chế độ `BASE_URL`, không nằm trong bảng trên) nhưng có điều kiện RIÊNG — cần `frontend/dist` đã
build sẵn (`npm run build` hoặc `npm test` trong `frontend/`, xem "Chạy test" phía trên). Chưa build
thì hai ca này tự báo `skipped` kèm lý do, không phải một ca đỏ khó hiểu trên cây vừa clone.

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

## Deploy

Bản demo dự kiến chạy trên **Vercel** (frontend) + **Render** (backend) + **Supabase** (database),
giữ ấm bằng **UptimeRobot**. **Chưa có project nào trong bốn dịch vụ này được tạo** — mục này mô tả
cách làm và những gì đã kiểm chứng được TRÊN MÁY NÀY, không phải một bản deploy cloud thật đã chạy
qua.

Bốn việc dưới đây nằm NGOÀI máy này — của Chồng yêu, không phải việc của subagent (tạo tài khoản /
cấu hình dịch vụ ngoài, hoặc repo chưa có remote nào để push):

| Việc | Ghi chú |
|---|---|
| Tạo project Vercel — root `frontend/`, build `npm run build`, output `dist`, Production Branch = `demo` | Đặt biến `VITE_API_BASE` ở đây (xem dưới) |
| Sửa `CORS_ORIGINS` trên Render | Thêm domain Vercel, **giữ cả** `http://localhost:5173`, ngăn bằng dấu phẩy |
| `gh repo create` (hoặc tương đương) rồi `git push` | Repo này **hiện không có remote nào** — cố ý |
| Tạo monitor UptimeRobot | HTTP(s), URL `https://<render-app>.onrender.com/api/v1/health`, mỗi 5 phút |

Trên Render, nhớ thêm `APP_ENV=demo`: thiếu biến này thì cầu chì fail-closed của
`backend/scripts/reset_demo.py` từ chối chạy — đúng sáng demo sẽ không reset được dữ liệu.

**`frontend/vercel.json`** (đã có trong repo) khai SPA fallback — thiếu nó thì F5 (tải lại trang) ở
một route con như `/reports/12` trả 404, vì Vercel không biết đó là một route phía client.

**`VITE_API_BASE`** đặt ở biến môi trường project trên Vercel, dạng origin kèm sẵn `/api/v1` (vd.
`https://<render-app>.onrender.com/api/v1`) — KHÔNG đặt bằng file `.env.production` trong repo (file
đó bị đọc ở MỌI lần build production, kể cả `npm run build && npm run preview` mà local/CI dùng để
test, nên ghi cứng URL Render vào đó sẽ khiến phép đo local vô tình gọi sang cloud).

**Quên đặt biến này (hoặc đặt sai hình dạng, vd. chỉ `/api/v1` — task-28-fix-2.md B4) thì ứng dụng
hỏng ỒN ÀO khi thật sự gọi API, KHÔNG phải ngay lúc tải trang:** `frontend/src/api/client.ts`
(nguồn origin API duy nhất; `Login.tsx` import lại `BASE` từ đây) không còn đoán trước "đang đứng ở
hostname nào" (cơ chế đó đã bị bỏ hẳn ở task-28-fix-2.md P1 sau ba lần vá liên tiếp vẫn còn cửa hở —
xem "Vòng sửa 2" trong `task-28-report.md`) — thay vào đó, MỌI response 200 nhưng KHÔNG PHẢI JSON
(dấu hiệu SPA fallback ở trên đang trả `index.html` cho path lẽ ra phải là API) đều bị chặn lại
ngay tại đó và ném lỗi nói RÕ TÊN BIẾN `VITE_API_BASE`. Trang vẫn dựng được (React vẫn render bình
thường) — không còn màn trắng trước khi kịp vẽ gì như cơ chế cũ. Cơ chế mới này không cần biết
hostname là gì nên an toàn ở MỌI nơi có ai đó đứng ra proxy `/api/v1` (máy nhà qua `vite.config.ts`,
kể cả mở bằng địa chỉ IP LAN hay tên mDNS `.local` khi chạy `vite preview --host`) — không riêng gì
`localhost`.

**Trỏ e2e vào bản deploy:** xem "Chạy e2e (Playwright)" ở trên — `BASE_URL` (origin frontend) và
`API_BASE_URL` (origin API, tách riêng từ Task 28) là hai biến ĐỘC LẬP; không đặt `API_BASE_URL` ⇒
mặc định bằng `BASE_URL` (same-origin, đúng hành vi cũ).

Kết nối Supabase: xem mục ngay dưới đây.

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
