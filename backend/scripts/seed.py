# backend/scripts/seed.py
"""Entrypoint container. Chỉ seed khi org_unit trống hoặc khi gọi tay."""
from app.core.db import SessionLocal
from app.models import OrgUnit
from app.seed import seed_all

if __name__ == "__main__":
    with SessionLocal() as db:
        if db.query(OrgUnit).count() == 0:
            print("org_unit trống → seed_all()")
        seed_all(db)
        print("seed xong")
