# Cấu hình và lệnh

Mọi biến môi trường, cổng và lệnh của dự án. Cách dùng chúng theo thứ tự cho một việc cụ thể nằm ở các trang hướng dẫn, xem [README](../../README.md#tài-liệu).

## Cổng

| Cổng | Dịch vụ | Ghi chú |
|---|---|---|
| `8000` | API (uvicorn) | Container `api` của Docker Compose, hoặc uvicorn chạy trên máy. |
| `55432` | Postgres trong Docker | Cổng host, nối vào cổng 5432 trong container. Chọn 55432 vì 5432 trên máy dev đã bị dự án khác chiếm. |
| `5173` | Vite (`npm run dev`, `npm run preview`) | Cả hai chuyển tiếp `/api/v1` sang `http://localhost:8000` (`frontend/vite.config.ts`). |

## Biến môi trường backend

| Biến | Bắt buộc | Mặc định | Ai đọc |
|---|:-:|---|---|
| `DATABASE_URL` | ✓ | | `app/core/config.py` |
| `JWT_SECRET` | ✓ | | `app/core/config.py` |
| `CORS_ORIGINS` | | `http://localhost:5173` | `app/core/config.py` |
| `APP_ENV` | | `local` | `scripts/reset_demo.py` |
| `SEED_PASSWORD` | | Xem `_seed_users` | `app/seed/__init__.py` |
| `FIXTURE_CSV` | | `app/seed/fixtures/fm01_2026-06_2026-08.csv` | `app/seed/fixture.py` |
| `TEST_DATABASE_URL` | | `hseq_test` trên `localhost:55432` | `tests/conftest.py` |
| `PORT` | | `8000` | `CMD` của `backend/Dockerfile` |

### `.env` và biến môi trường thật khác nhau

`app/core/config.py` đọc file `backend/.env` (tính từ thư mục đang đứng, nên chạy lệnh từ `backend/`). Biến môi trường thật thắng giá trị trong file.

Chỉ ba biến `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` đi qua đường này. Các biến còn lại được đọc thẳng bằng `os.environ`, nên ghi chúng vào `.env` không có tác dụng. Phải đặt ngay trên dòng lệnh hoặc trong phần `environment` của Docker Compose:

```bash
cd backend
APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes
```

### `DATABASE_URL`

Dạng `postgresql+psycopg://<user>:<mật khẩu>@<host>:<cổng>/<database>`. Giá trị cho Postgres trong Docker có sẵn ở `backend/.env.example` và `infra/docker-compose.yml`.

Với Supabase: dùng Session pooler cổng 5432 và giữ `?sslmode=require` ở cuối. Không dùng Direct connection (chỉ có IPv6, Render free không ra được) hay Transaction pooler cổng 6543. Checklist đầy đủ ở mục "Kết nối Supabase" của [README](../../README.md#kết-nối-supabase).

### `JWT_SECRET`

Khoá ký token đăng nhập (HS256, hạn 12 giờ). API từ chối khởi động nếu giá trị, sau khi bỏ khoảng trắng hai đầu, ngắn hơn 32 ký tự hoặc thuộc danh sách cấm trong `app/core/config.py`. Lỗi khi đó:

```
RuntimeError: JWT_SECRET thiếu hoặc còn là giá trị mặc định. Đặt một chuỗi ngẫu nhiên ít nhất 32 ký tự rồi khởi động lại.
```

Giá trị mẫu trong `backend/.env.example` nằm trong danh sách cấm. Chép file đó sang `.env` xong phải đổi `JWT_SECRET` mới chạy được API trên máy. Tạo một chuỗi mới:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(40))'
```

Đổi `JWT_SECRET` làm mọi token đã cấp mất hiệu lực, người dùng phải đăng nhập lại.

### `CORS_ORIGINS`

Danh sách origin được gọi API từ trình duyệt, ngăn bằng dấu phẩy. Chạy local qua proxy của Vite thì không cần tới. Trên bản deploy, frontend và API khác origin nên biến này phải chứa origin của frontend.

### `APP_ENV`

Chỉ `scripts/reset_demo.py` đọc, và đọc thẳng biến môi trường. Lệnh reset chỉ chạy khi giá trị là `local`, `test` hoặc `demo`. Thiếu biến hoặc giá trị khác (kể cả `production`) thì từ chối. Docker Compose đặt `local`, pytest đặt `test`, Render đặt `demo`.

### `SEED_PASSWORD`

Mật khẩu chung của mọi tài khoản seed. Chỉ có tác dụng lúc tài khoản được tạo lần đầu, vì seed không cập nhật dòng đã có. Xem [Quyền và quy trình](quyen-va-quy-trinh.md#tài-khoản-seed).

### `FIXTURE_CSV`

Đường dẫn file số liệu mà seed nạp. Đường dẫn tương đối tính từ thư mục làm việc: `backend/` trên máy, `/app` trong container. Bộ số tổng hợp để thử là `tests/fixtures/full_synthetic.csv`. Định dạng file ở [Fixture CSV](fixture-csv.md).

### Biến của pytest

`tests/conftest.py` đặt các biến sau trước khi nạp ứng dụng:

- `DATABASE_URL`: nếu chưa có trong môi trường thì lấy `TEST_DATABASE_URL`, không có nữa thì dùng `hseq_test` trên `localhost:55432`.
- `JWT_SECRET`, `APP_ENV=test`: chỉ đặt khi chưa có.
- `FIXTURE_CSV`: luôn ghi đè thành `tests/fixtures/full_synthetic.csv`.

Vì vậy đừng `export DATABASE_URL` trong shell rồi chạy `pytest`: test sẽ chạy trên database đó thay vì `hseq_test`.

Database `hseq_test` do `infra/initdb/01-test-db.sql` tạo ở lần đầu container `db` khởi tạo volume. Nó được tạo rỗng: container `api` chỉ chạy migration cho `hseq`, còn pytest không tự chạy migration. Trên volume mới, chạy migration cho `hseq_test` một lần trước lần `pytest` đầu tiên (từ `backend/`):

```bash
DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env.example | cut -d= -f2-)" JWT_SECRET="$(openssl rand -hex 32)" alembic upgrade head
```

`TEST_DATABASE_URL` trong `.env.example` trỏ đúng database mà `conftest.py` dùng khi không có biến nào. `JWT_SECRET` ngẫu nhiên chỉ để qua bước kiểm cấu hình lúc nạp ứng dụng. Thiếu bước này thì mọi test đỏ với `UndefinedTable: relation "org_unit" does not exist`. Mỗi migration mới về sau cũng phải chạy lại lệnh này.

## Biến môi trường frontend

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `VITE_API_BASE` | `/api/v1` | Tiền tố đứng trước mọi đường dẫn API trong `frontend/src/api/client.ts`. Phải kèm `/api/v1` ở cuối. |

- Local: để trống. Vite chuyển tiếp `/api/v1` sang cổng 8000.
- Deploy: khai ở `frontend/vercel.json`, mục `build.env`, trỏ tới `https://hsseq-ptsc-api.onrender.com/api/v1`. Chỉ Vercel đọc file này lúc build, nên `npm run build` trên máy không bị trỏ sang cloud.
- Không dùng `.env.production`: file đó được đọc ở mọi lần build production, kể cả bản build mà e2e dùng trên máy.
- Nếu giá trị làm lời gọi API rơi vào trang HTML của frontend (ví dụ để `/api/v1` trên Vercel, nơi không có proxy), `client.ts` báo lỗi có nhắc tên `VITE_API_BASE` thay vì để trang trắng.

## Biến môi trường e2e

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `BASE_URL` | `http://localhost:5173` | Origin của frontend. Khác máy nhà thì Playwright không tự dựng server và bỏ qua mọi bước reset dữ liệu. |
| `API_BASE_URL` | Bằng `BASE_URL` | Origin của API, KHÔNG kèm `/api/v1` (ngược với `VITE_API_BASE`). |
| `CI` | | Có giá trị thì Playwright ghi thêm báo cáo HTML. |

"Máy nhà" là `localhost`, `127.0.0.1`, `0.0.0.0`, `::1` và `*.localhost`, xét theo hostname (`e2e/moi-truong.ts`).

## Lệnh

### Docker Compose (chạy từ gốc repo)

| Lệnh | Việc làm |
|---|---|
| `docker compose -f infra/docker-compose.yml up -d --build` | Dựng Postgres và API. `--build` để image API dùng mã mới nhất. |
| `docker compose -f infra/docker-compose.yml up -d db` | Chỉ dựng Postgres, đủ cho pytest. |
| `docker compose -f infra/docker-compose.yml logs -f api` | Xem log API, gồm cả log migration và seed. |
| `docker compose -f infra/docker-compose.yml exec api python -m scripts.seed` | Seed lại mà không khởi động lại container. |
| `docker compose -f infra/docker-compose.yml exec api python -m scripts.reset_demo --yes` | Xoá mọi báo cáo và nạp lại từ fixture. |
| `docker compose -f infra/docker-compose.yml down` | Dừng, giữ dữ liệu. |
| `docker compose -f infra/docker-compose.yml down -v` | Dừng và xoá volume Postgres. Lần `up` sau dựng database từ đầu. |

Mỗi lần container `api` khởi động, nó chạy `alembic upgrade head`, rồi `python -m scripts.seed`, rồi mới mở uvicorn.

Nạp bộ số tổng hợp thay cho file thật đang rỗng:

```bash
docker compose -f infra/docker-compose.yml exec -e FIXTURE_CSV=tests/fixtures/full_synthetic.csv api python -m scripts.reset_demo --yes
```

Kết quả mong đợi: `Đã nạp 66 báo cáo.`

### Backend trên máy (chạy từ `backend/`)

| Lệnh | Việc làm |
|---|---|
| `uv pip install --system -r pyproject.toml --extra dev` | Cài thư viện, kể cả `pytest`. Cần Python 3.12 trở lên. |
| `pytest` | Chạy test backend trên `hseq_test`. Cần Postgres đang chạy và `hseq_test` đã chạy migration (xem [Biến của pytest](#biến-của-pytest)). |
| `alembic upgrade head` | Đưa database trong `DATABASE_URL` lên migration mới nhất. |
| `.venv/bin/uvicorn app.main:app --port 8000` | Chạy API trên máy. Cần `.env` có `DATABASE_URL` và `JWT_SECRET` hợp lệ, và cổng 8000 đang trống. |
| `APP_ENV=local .venv/bin/python -m scripts.reset_demo --yes` | Reset dữ liệu demo từ máy. |
| `.venv/bin/python tests/fixtures/gen_fixture.py` | Sinh lại `tests/fixtures/full_synthetic.csv` từ danh mục chỉ tiêu hiện tại. |

`scripts/reset_demo.py` thoát mã 1 khi thiếu `--yes`, khi `APP_ENV` không an toàn, hoặc khi nạp được 0 báo cáo.

### Frontend (chạy từ `frontend/`)

| Lệnh | Việc làm |
|---|---|
| `npm install` | Cài thư viện. |
| `npm run dev` | Máy chủ dev ở cổng 5173. |
| `npm run build` | Kiểm kiểu (`tsc -b`) rồi build vào `dist/`. |
| `npm test` | Build rồi chạy vitest. Một số test đọc CSS trong `dist/` nên phải build trước. |
| `npm run lint` | Chạy `oxlint`. |
| `npm run preview` | Phục vụ `dist/` ở cổng 4173 mặc định của Vite, hoặc cổng truyền vào. |

### e2e (chạy từ `e2e/`)

| Lệnh | Việc làm |
|---|---|
| `npm install && npx playwright install chromium` | Cài lần đầu. |
| `npx playwright test` | Chạy cả hai viewport (1280×800 và 1024×640). Tự build frontend và dựng `preview` ở cổng 5173. |
| `npm run test:e2e:desktop` | Chỉ viewport 1280×800. |
| `npx playwright test --list` | Đếm ca mà không chạy. |
| `npm run typecheck` | Kiểm kiểu các file test. |

Playwright chạy một worker, không chạy lại ca hỏng, mỗi ca tối đa 60 giây. Có gì đang nghe ở cổng 5173 thì nó dừng với lỗi thay vì dùng lại. Chi tiết ở mục "Chạy e2e (Playwright)" của [README](../../README.md#chạy-e2e-playwright).

## Địa chỉ bản deploy

| Nơi | Địa chỉ |
|---|---|
| Frontend (Vercel) | https://hsseq-ptsc.vercel.app |
| API (Render) | https://hsseq-ptsc-api.onrender.com |
| Kiểm tra sống | https://hsseq-ptsc-api.onrender.com/api/v1/health |

Đẩy mã lên nhánh `main` là cả Vercel và Render tự deploy lại.

## Xem thêm

- [API](api.md): endpoint và mã lỗi.
- [Fixture CSV](fixture-csv.md): định dạng file mà `FIXTURE_CSV` trỏ tới.
- [Cách nạp số liệu thật](../how-to/nap-so-lieu-that.md): dùng các lệnh reset theo đúng thứ tự.
- [Kiến trúc](../explanation/kien-truc.md): các thành phần trên nối với nhau thế nào.
