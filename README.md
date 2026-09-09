# HSEQ PTSC

Nền tảng báo cáo HSEQ nội bộ PTSC — FastAPI + Postgres (backend), React (frontend).

## Chạy local

```bash
docker compose -f infra/docker-compose.yml up -d
```

- `db`: Postgres 16, cổng `5432`, database `hseq` (user/pass `hseq`).
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

Test chạy trên database riêng `hseq_test`, qua cổng host `5432` — chỉ cần service `db`, không cần `api`:

```bash
docker compose -f infra/docker-compose.yml up -d db
cd backend
cp .env.example .env   # TEST_DATABASE_URL đã trỏ sẵn tới hseq_test
uv pip install --system -r pyproject.toml --extra dev
pytest
```

## Kết nối Supabase

_(Task 2 điền chuỗi kết nối Supabase chạy được vào đây.)_
