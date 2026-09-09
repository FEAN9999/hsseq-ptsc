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
