# backend/app/core/security.py
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.config import settings

# LỆCH SO VỚI task-8-brief.md Step 3: brief viết `PasswordHash.recommended()`.
# `.recommended()` chọn Argon2Hasher, nhưng dependency chỉ cài `pwdlib[bcrypt]`
# (pyproject.toml) — gọi thẳng sẽ raise HasherNotAvailable ngay lúc import
# module này, sập cả app. Dùng tường minh BcryptHasher, đúng pattern
# `app/seed/__init__.py` (Task 6) đã dùng để băm mật khẩu seed — nếu không,
# _hash.verify() cũng không nhận ra hash bcrypt mà seed đã tạo.
_hash = PasswordHash((BcryptHasher(),))
THUAT_TOAN = "HS256"
HAN_GIO = 12


def bam_mat_khau(mk: str) -> str:
    return _hash.hash(mk)


def kiem_mat_khau(mk: str, bam: str) -> bool:
    return _hash.verify(mk, bam)


def tao_token(user_id: int) -> str:
    # payload chỉ sub + exp; không refresh token ở MVP
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=HAN_GIO),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=THUAT_TOAN)


def doc_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[THUAT_TOAN])
        return int(payload["sub"])
    except Exception:
        return None
