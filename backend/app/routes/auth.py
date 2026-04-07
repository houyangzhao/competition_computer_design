from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException

from models import AdminRegisterRequest, AuthPayload, LoginRequest, RegisterRequest, StoredUser, User

from ..auth import hash_password, issue_token, require_user, verify_password
from ..config import ADMIN_REGISTER_CODE, DATA_LOCK
from ..crud import find_user_by_email, upsert_user_record
from ..database import now_iso, open_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


def create_registered_user(payload: RegisterRequest, role: str) -> AuthPayload:
    username = payload.username.strip()
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    if find_user_by_email(payload.email.lower()):
        raise HTTPException(status_code=400, detail="Email already registered")

    password_salt, password_hash = hash_password(payload.password)
    user = StoredUser(
        id=f"user-{uuid4().hex[:8]}",
        username=username,
        email=payload.email.lower(),
        role=role,
        avatar=None,
        createdAt=now_iso(),
        passwordHash=password_hash,
        passwordSalt=password_salt,
    )
    with DATA_LOCK:
        with open_db() as conn:
            upsert_user_record(conn, user)
    return AuthPayload(user=User(**user.model_dump(exclude={"passwordHash", "passwordSalt"})), token=issue_token(user.id))


@router.post("/register", response_model=AuthPayload)
def register(payload: RegisterRequest):
    return create_registered_user(payload, role="user")


@router.post("/register-admin", response_model=AuthPayload)
def register_admin(payload: AdminRegisterRequest):
    if not ADMIN_REGISTER_CODE:
        raise HTTPException(status_code=403, detail="Admin registration is disabled")
    if payload.adminCode.strip() != ADMIN_REGISTER_CODE:
        raise HTTPException(status_code=403, detail="Invalid admin registration code")
    return create_registered_user(payload, role="admin")


@router.post("/login", response_model=AuthPayload)
def login(payload: LoginRequest):
    user = find_user_by_email(payload.email.lower())
    if not user or not verify_password(payload.password, user.passwordHash, user.passwordSalt):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthPayload(user=User(**user.model_dump(exclude={"passwordHash", "passwordSalt"})), token=issue_token(user.id))


@router.get("/me", response_model=User)
def me(authorization: str | None = Header(default=None)):
    return require_user(authorization)
