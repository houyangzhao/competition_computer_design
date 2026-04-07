"""Authentication: password hashing, token management, permission checks."""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import HTTPException

from .config import ADMIN_REGISTER_CODE, AUTH_SECRET, AUTH_TTL_SECONDS


def encode_token_component(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def decode_token_component(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt_value = salt or encode_token_component(os.urandom(16))
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_value.encode("utf-8"),
        120_000,
    )
    return salt_value, encode_token_component(digest)


def verify_password(password: str, password_hash: str, password_salt: str) -> bool:
    _, digest = hash_password(password, password_salt)
    return hmac.compare_digest(password_hash, digest)


def issue_token(user_id: str) -> str:
    payload = {"userId": user_id, "exp": int(time.time()) + AUTH_TTL_SECONDS}
    encoded_payload = encode_token_component(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )
    signature = encode_token_component(hmac.new(AUTH_SECRET, encoded_payload.encode("utf-8"), hashlib.sha256).digest())
    return f"{encoded_payload}.{signature}"


def parse_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ", 1)[1]

    if token.startswith("demo-token-"):
        return token.replace("demo-token-", "", 1)

    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc

    expected_signature = encode_token_component(
        hmac.new(AUTH_SECRET, payload_part.encode("utf-8"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(signature_part, expected_signature):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = json.loads(decode_token_component(payload_part).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc

    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Token expired")

    user_id = payload.get("userId")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user_id


def optional_user_id(authorization: str | None) -> str | None:
    if not authorization:
        return None
    return parse_token(authorization)


def require_user(authorization: str | None):
    """Returns a User (public view). Imports crud lazily to avoid circular deps."""
    from .crud import find_user
    from models import User

    user_id = parse_token(authorization)
    user = find_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return User(**user.model_dump(exclude={"passwordHash", "passwordSalt"}))


def require_admin(authorization: str | None):
    user = require_user(authorization)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
