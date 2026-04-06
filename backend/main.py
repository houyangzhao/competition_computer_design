import base64
import hashlib
import hmac
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from models import (
    AuthPayload,
    Building,
    ChatMessage,
    ChatRequest,
    ContributionResult,
    KnowledgeItem,
    LoginRequest,
    OverviewStats,
    ReconstructionJob,
    RegisterRequest,
    StoredUser,
    User,
)

BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = BASE_DIR / "storage"
JOBS_ROOT = STORAGE_DIR / "jobs"
CONTRIBUTIONS_ROOT = STORAGE_DIR / "contributions"
FRONTEND_PUBLIC_DIR = REPO_DIR / "frontend" / "public"
GENERATED_DIR = FRONTEND_PUBLIC_DIR / "generated"
GENERATED_COVERS_DIR = GENERATED_DIR / "covers"

RECONSTRUCTION_DIR = REPO_DIR / "reconstraction"
FILTER_SCRIPT = RECONSTRUCTION_DIR / "filter_images.py"
CONVERT_SCRIPT = RECONSTRUCTION_DIR / "convert_ply_to_splat.py"
RECONSTRUCT_SCRIPT = RECONSTRUCTION_DIR / "reconstruct.sh"

SQLITE_FILE = Path(os.environ.get("ZHUYI_SQLITE_PATH", str(DATA_DIR / "zhuyi.db")))
BUILDINGS_FILE = DATA_DIR / "buildings.json"
USERS_FILE = DATA_DIR / "users.json"
JOBS_FILE = DATA_DIR / "jobs.json"
CONTRIBUTIONS_FILE = DATA_DIR / "contributions.json"
KNOWLEDGE_FILE = DATA_DIR / "knowledge.json"

PYTHON_BIN = os.environ.get("ZHUYI_RECON_PYTHON", sys.executable)
GAUSSIAN_SPLATTING_DIR = Path(os.environ.get("ZHUYI_GAUSSIAN_SPLATTING_DIR", "/root/gaussian-splatting"))
RECONSTRUCTION_ITERATIONS = int(os.environ.get("ZHUYI_RECON_ITERATIONS", "7000"))
RECONSTRUCTION_IMAGE_LIMIT = int(os.environ.get("ZHUYI_RECON_IMAGE_LIMIT", "300"))
MIN_RECONSTRUCTION_IMAGES = int(os.environ.get("ZHUYI_RECON_MIN_IMAGES", "3"))
COLMAP_NO_GPU = os.environ.get("ZHUYI_COLMAP_NO_GPU", "1")
RECONSTRUCTION_MODE = os.environ.get("ZHUYI_RECONSTRUCTION_MODE", "mock").lower()
AUTH_SECRET = os.environ.get("ZHUYI_AUTH_SECRET", "zhuyi-dev-secret").encode("utf-8")
AUTH_TTL_SECONDS = int(os.environ.get("ZHUYI_AUTH_TTL", str(7 * 24 * 60 * 60)))
SAMPLE_MODEL = os.environ.get("ZHUYI_SAMPLE_MODEL", "/models/bonsai.splat")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"
DEEPSEEK_TIMEOUT = float(os.environ.get("DEEPSEEK_TIMEOUT", "30"))
DEEPSEEK_MAX_TOKENS = int(os.environ.get("DEEPSEEK_MAX_TOKENS", "700"))
DEEPSEEK_TEMPERATURE = float(os.environ.get("DEEPSEEK_TEMPERATURE", "0.6"))
DEEPSEEK_HISTORY_LIMIT = int(os.environ.get("DEEPSEEK_HISTORY_LIMIT", "8"))

CORS_ORIGINS_RAW = os.environ.get("ZHUYI_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")
CORS_ORIGINS = ["*"] if CORS_ORIGINS_RAW.strip() == "*" else [item.strip() for item in CORS_ORIGINS_RAW.split(",") if item.strip()]

DATA_LOCK = threading.RLock()

app = FastAPI(title="Zhuyi Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json(path: Path, default: Any):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def open_db() -> sqlite3.Connection:
    connection = sqlite3.connect(SQLITE_FILE, timeout=30, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def dump_payload(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def load_payload(raw: str) -> dict[str, Any]:
    return json.loads(raw)


def ensure_storage_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_ROOT.mkdir(parents=True, exist_ok=True)
    CONTRIBUTIONS_ROOT.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_COVERS_DIR.mkdir(parents=True, exist_ok=True)
    SQLITE_FILE.parent.mkdir(parents=True, exist_ok=True)


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


def default_buildings() -> list[dict[str, Any]]:
    created_at = now_iso()
    return [
        {
            "id": "forbidden-city",
            "name": "故宫太和殿",
            "dynasty": "明清",
            "location": "北京市东城区",
            "coordinates": [116.3974, 39.9163],
            "description": "太和殿俗称金銮殿，是明清两代皇帝举行重大典礼的场所，也是中国古建筑数字化展示的代表性对象。",
            "modelPath": "/models/bonsai.splat",
            "coverImage": None,
            "type": "public",
            "status": "ready",
            "ownerId": None,
            "sourceJobId": None,
            "contributionCount": 12,
            "photoCount": 240,
            "createdAt": created_at,
            "updatedAt": created_at,
        },
        {
            "id": "chengde-puning",
            "name": "承德普宁寺大乘之阁",
            "dynasty": "清",
            "location": "河北省承德市",
            "coordinates": [117.9333, 40.9963],
            "description": "大乘之阁是承德避暑山庄外八庙中的重要建筑，具有鲜明的藏式建筑特征，适合作为公共重建项目示例。",
            "modelPath": None,
            "coverImage": None,
            "type": "public",
            "status": "pending",
            "ownerId": None,
            "sourceJobId": None,
            "contributionCount": 5,
            "photoCount": 86,
            "createdAt": created_at,
            "updatedAt": created_at,
        },
        {
            "id": "tulou-fujian",
            "name": "福建永定土楼",
            "dynasty": "明清",
            "location": "福建省龙岩市",
            "coordinates": [116.9386, 24.6478],
            "description": "客家土楼是大型民居建筑群，具有独特的空间组织与防御结构，适合作为古建筑重建样本。",
            "modelPath": None,
            "coverImage": None,
            "type": "public",
            "status": "pending",
            "ownerId": None,
            "sourceJobId": None,
            "contributionCount": 3,
            "photoCount": 54,
            "createdAt": created_at,
            "updatedAt": created_at,
        },
    ]


def default_knowledge() -> dict[str, list[dict[str, str]]]:
    return {
        "forbidden-city": [
            {"term": "重檐庑殿顶", "description": "太和殿采用等级极高的重檐庑殿顶，是皇家礼制建筑最典型的屋顶形式之一。"},
            {"term": "斗拱", "description": "太和殿斗拱层级丰富，不仅承担受力传递，也形成了强烈的仪式性视觉节奏。"},
            {"term": "礼制空间", "description": "太和殿位于紫禁城中轴线核心，主要用于登基、大婚、册封等重大典礼。"},
        ],
        "chengde-puning": [
            {"term": "藏汉融合", "description": "普宁寺大乘之阁在平面与立面上融合汉式木构和藏式宗教建筑特征。"},
            {"term": "大型楼阁", "description": "建筑体量高大，适合通过众包照片补足多角度外立面和檐口细节。"},
            {"term": "拍摄建议", "description": "建议围绕主体做环绕拍摄，并补充入口、檐角和台基的斜向照片。"},
        ],
        "tulou-fujian": [
            {"term": "围合式民居", "description": "土楼通过厚夯土外墙围合内部生活空间，兼具防御和聚居功能。"},
            {"term": "圆形与方形", "description": "福建土楼既有圆楼也有方楼，不同形态对应不同地形与家族组织方式。"},
            {"term": "重建难点", "description": "大尺度连续立面和室内天井对照片数量和环绕连续性要求更高。"},
        ],
    }


DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    owner_id TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    name TEXT NOT NULL,
    contribution_count INTEGER NOT NULL DEFAULT 0,
    photo_count INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    owner_id TEXT,
    created_ts REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    building_name TEXT NOT NULL,
    payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL,
    contributor_id TEXT,
    created_at TEXT NOT NULL,
    photo_count INTEGER NOT NULL,
    payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_items (
    building_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    term TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (building_id, position)
);

CREATE INDEX IF NOT EXISTS idx_buildings_type_owner ON buildings(type, owner_id);
CREATE INDEX IF NOT EXISTS idx_buildings_status ON buildings(status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_status ON jobs(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_contributions_building ON contributions(building_id);
"""


def normalize_building(item: dict[str, Any]) -> dict[str, Any]:
    created_at = str(item.get("createdAt") or now_iso())
    updated_at = str(item.get("updatedAt") or created_at)
    raw_coordinates = item.get("coordinates") or [116.3974, 39.9163]
    try:
        coordinates = (float(raw_coordinates[0]), float(raw_coordinates[1]))
    except (TypeError, ValueError, IndexError):
        coordinates = (116.3974, 39.9163)

    building_type = item.get("type")
    if building_type not in {"public", "personal"}:
        building_type = "personal" if item.get("ownerId") else "public"

    model_path = item.get("modelPath")
    status = item.get("status")
    if status not in {"ready", "pending", "processing"}:
        status = "ready" if model_path else "pending"

    return Building(
        id=str(item.get("id") or f"building-{uuid4().hex[:8]}"),
        name=str(item.get("name") or "未命名建筑"),
        dynasty=str(item.get("dynasty") or "未考证"),
        location=str(item.get("location") or "位置待补充"),
        coordinates=coordinates,
        description=str(item.get("description") or "暂无建筑介绍。"),
        modelPath=model_path,
        coverImage=item.get("coverImage"),
        type=building_type,
        status=status,
        ownerId=item.get("ownerId"),
        sourceJobId=item.get("sourceJobId"),
        contributionCount=max(0, int(item.get("contributionCount") or 0)),
        photoCount=max(0, int(item.get("photoCount") or 0)),
        createdAt=created_at,
        updatedAt=updated_at,
    ).model_dump()


def normalize_user(item: dict[str, Any]) -> dict[str, Any]:
    email = str(item.get("email") or "").strip().lower()
    username = str(item.get("username") or email.split("@")[0] or "user").strip()
    password_hash = item.get("passwordHash")
    password_salt = item.get("passwordSalt")

    if not password_hash or not password_salt:
        raw_password = str(item.get("password") or "123456")
        password_salt, password_hash = hash_password(raw_password)

    return StoredUser(
        id=str(item.get("id") or f"user-{uuid4().hex[:8]}"),
        username=username or "user",
        email=email,
        avatar=item.get("avatar"),
        createdAt=str(item.get("createdAt") or now_iso()),
        passwordHash=password_hash,
        passwordSalt=password_salt,
    ).model_dump()


def normalize_job(item: dict[str, Any]) -> dict[str, Any]:
    created_at = str(item.get("createdAt") or now_iso())
    status = item.get("status")
    if status not in {"queued", "extracting", "matching", "reconstructing", "done", "failed"}:
        status = "done" if item.get("modelPath") else "failed"

    progress = int(item.get("progress") or 0)
    progress = max(0, min(progress, 100))
    if status == "done":
        progress = 100

    return {
        "id": str(item.get("id") or f"job-{uuid4().hex[:8]}"),
        "buildingName": str(item.get("buildingName") or "未命名任务"),
        "createdAt": created_at,
        "updatedAt": str(item.get("updatedAt") or created_at),
        "createdTs": float(item.get("createdTs") or time.time()),
        "photoCount": max(0, int(item.get("photoCount") or 0)),
        "status": status,
        "progress": progress,
        "modelPath": item.get("modelPath"),
        "error": item.get("error"),
        "jobDir": str(item.get("jobDir") or (JOBS_ROOT / str(item.get("id") or f"job-{uuid4().hex[:8]}"))),
        "selectedCount": item.get("selectedCount"),
        "ownerId": item.get("ownerId"),
        "targetBuildingId": item.get("targetBuildingId"),
        "savedBuildingId": item.get("savedBuildingId"),
    }


def normalize_contribution(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(item.get("id") or f"contrib-{uuid4().hex[:8]}"),
        "buildingId": str(item.get("buildingId") or ""),
        "contributorId": item.get("contributorId"),
        "createdAt": str(item.get("createdAt") or now_iso()),
        "photoCount": max(0, int(item.get("photoCount") or 0)),
        "files": [str(path) for path in item.get("files", [])],
    }


def normalize_knowledge_store(raw: Any) -> dict[str, list[dict[str, Any]]]:
    if not isinstance(raw, dict):
        raw = default_knowledge()

    normalized: dict[str, list[dict[str, Any]]] = {}
    for building_id, items in raw.items():
        if not isinstance(items, list):
            continue
        normalized[building_id] = [KnowledgeItem(**item).model_dump() for item in items if isinstance(item, dict)]
    return normalized


def upsert_user_record(conn: sqlite3.Connection, user: StoredUser | dict[str, Any]) -> dict[str, Any]:
    raw = user.model_dump() if isinstance(user, StoredUser) else user
    item = normalize_user(raw)
    conn.execute(
        """
        INSERT INTO users (id, email, username, created_at, payload)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            username = excluded.username,
            created_at = excluded.created_at,
            payload = excluded.payload
        """,
        (item["id"], item["email"], item["username"], item["createdAt"], dump_payload(item)),
    )
    return item


def upsert_building_record(conn: sqlite3.Connection, building: dict[str, Any]) -> dict[str, Any]:
    item = normalize_building(building)
    conn.execute(
        """
        INSERT INTO buildings (
            id, type, owner_id, status, created_at, updated_at, name, contribution_count, photo_count, payload
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            owner_id = excluded.owner_id,
            status = excluded.status,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            name = excluded.name,
            contribution_count = excluded.contribution_count,
            photo_count = excluded.photo_count,
            payload = excluded.payload
        """,
        (
            item["id"],
            item["type"],
            item.get("ownerId"),
            item["status"],
            item.get("createdAt") or now_iso(),
            item.get("updatedAt") or item.get("createdAt") or now_iso(),
            item["name"],
            int(item.get("contributionCount") or 0),
            int(item.get("photoCount") or 0),
            dump_payload(item),
        ),
    )
    return item


def upsert_job_record(conn: sqlite3.Connection, job: dict[str, Any]) -> dict[str, Any]:
    item = normalize_job(job)
    conn.execute(
        """
        INSERT INTO jobs (id, status, owner_id, created_ts, created_at, updated_at, building_name, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            owner_id = excluded.owner_id,
            created_ts = excluded.created_ts,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            building_name = excluded.building_name,
            payload = excluded.payload
        """,
        (
            item["id"],
            item["status"],
            item.get("ownerId"),
            float(item.get("createdTs") or time.time()),
            item["createdAt"],
            item.get("updatedAt") or item["createdAt"],
            item["buildingName"],
            dump_payload(item),
        ),
    )
    return item


def upsert_contribution_record(conn: sqlite3.Connection, contribution: dict[str, Any]) -> dict[str, Any]:
    item = normalize_contribution(contribution)
    conn.execute(
        """
        INSERT INTO contributions (id, building_id, contributor_id, created_at, photo_count, payload)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            building_id = excluded.building_id,
            contributor_id = excluded.contributor_id,
            created_at = excluded.created_at,
            photo_count = excluded.photo_count,
            payload = excluded.payload
        """,
        (
            item["id"],
            item["buildingId"],
            item.get("contributorId"),
            item["createdAt"],
            int(item.get("photoCount") or 0),
            dump_payload(item),
        ),
    )
    return item


def replace_knowledge_records(conn: sqlite3.Connection, knowledge_store: dict[str, list[dict[str, Any]]]):
    conn.execute("DELETE FROM knowledge_items")
    for building_id, items in knowledge_store.items():
        for position, item in enumerate(items):
            normalized_item = KnowledgeItem(**item).model_dump()
            conn.execute(
                """
                INSERT INTO knowledge_items (building_id, position, term, payload)
                VALUES (?, ?, ?, ?)
                """,
                (building_id, position, normalized_item["term"], dump_payload(normalized_item)),
            )


def initialize_database():
    ensure_storage_dirs()
    with DATA_LOCK:
        with open_db() as conn:
            conn.executescript(DB_SCHEMA)

            if conn.execute("SELECT COUNT(*) FROM buildings").fetchone()[0] == 0:
                for item in read_json(BUILDINGS_FILE, default_buildings()):
                    if isinstance(item, dict):
                        upsert_building_record(conn, item)

            if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
                for item in read_json(USERS_FILE, []):
                    if isinstance(item, dict):
                        upsert_user_record(conn, item)

            if conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 0:
                for item in read_json(JOBS_FILE, []):
                    if isinstance(item, dict):
                        upsert_job_record(conn, item)

            if conn.execute("SELECT COUNT(*) FROM contributions").fetchone()[0] == 0:
                for item in read_json(CONTRIBUTIONS_FILE, []):
                    if isinstance(item, dict):
                        upsert_contribution_record(conn, item)

            if conn.execute("SELECT COUNT(*) FROM knowledge_items").fetchone()[0] == 0:
                replace_knowledge_records(conn, normalize_knowledge_store(read_json(KNOWLEDGE_FILE, default_knowledge())))


def load_buildings() -> list[dict[str, Any]]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute("SELECT payload FROM buildings ORDER BY created_at, name").fetchall()
    return [normalize_building(load_payload(row["payload"])) for row in rows]


def save_buildings(buildings: list[dict[str, Any]]):
    with DATA_LOCK:
        with open_db() as conn:
            conn.execute("DELETE FROM buildings")
            for building in buildings:
                upsert_building_record(conn, building)


def load_users() -> list[StoredUser]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute("SELECT payload FROM users ORDER BY created_at, username").fetchall()
    return [StoredUser(**normalize_user(load_payload(row["payload"]))) for row in rows]


def save_users(users: list[StoredUser]):
    with DATA_LOCK:
        with open_db() as conn:
            conn.execute("DELETE FROM users")
            for user in users:
                upsert_user_record(conn, user)


def load_jobs() -> list[dict[str, Any]]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute("SELECT payload FROM jobs ORDER BY created_ts DESC, id DESC").fetchall()
    return [normalize_job(load_payload(row["payload"])) for row in rows]


def save_jobs(jobs: list[dict[str, Any]]):
    with DATA_LOCK:
        with open_db() as conn:
            conn.execute("DELETE FROM jobs")
            for job in jobs:
                upsert_job_record(conn, job)


def load_contributions() -> list[dict[str, Any]]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute("SELECT payload FROM contributions ORDER BY created_at DESC, id DESC").fetchall()
    return [normalize_contribution(load_payload(row["payload"])) for row in rows]


def save_contributions(contributions: list[dict[str, Any]]):
    with DATA_LOCK:
        with open_db() as conn:
            conn.execute("DELETE FROM contributions")
            for contribution in contributions:
                upsert_contribution_record(conn, contribution)


def load_knowledge_store() -> dict[str, list[KnowledgeItem]]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute(
                "SELECT building_id, payload FROM knowledge_items ORDER BY building_id, position"
            ).fetchall()

    knowledge_store: dict[str, list[KnowledgeItem]] = {}
    for row in rows:
        knowledge_store.setdefault(row["building_id"], []).append(KnowledgeItem(**load_payload(row["payload"])))
    return knowledge_store


def add_job(job: dict[str, Any]):
    with DATA_LOCK:
        with open_db() as conn:
            upsert_job_record(conn, job)


def get_job(job_id: str) -> dict[str, Any] | None:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return None
    return normalize_job(load_payload(row["payload"]))


def update_job(job_id: str, **updates) -> dict[str, Any]:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not row:
                raise KeyError(f"job not found: {job_id}")
            current = normalize_job(load_payload(row["payload"]))
            updated = normalize_job({**current, **updates, "updatedAt": now_iso()})
            upsert_job_record(conn, updated)
            return updated


def find_user(user_id: str) -> StoredUser | None:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return StoredUser(**normalize_user(load_payload(row["payload"])))


def find_user_by_email(email: str) -> StoredUser | None:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if not row:
        return None
    return StoredUser(**normalize_user(load_payload(row["payload"])))


def require_user(authorization: str | None) -> User:
    user_id = parse_token(authorization)
    user = find_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return User(**user.model_dump(exclude={"passwordHash", "passwordSalt"}))


def find_building(building_id: str) -> dict[str, Any] | None:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM buildings WHERE id = ?", (building_id,)).fetchone()
    if not row:
        return None
    return normalize_building(load_payload(row["payload"]))


def save_uploaded_files(target_dir: Path, photos: list[UploadFile]) -> list[Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    saved_files: list[Path] = []

    for index, photo in enumerate(photos):
        suffix = Path(photo.filename or "").suffix.lower() or ".jpg"
        filename = f"{index:03d}{suffix}"
        destination = target_dir / filename
        with destination.open("wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo.file.close()
        saved_files.append(destination)

    return saved_files


def append_job_log(job_id: str, line: str):
    log_path = JOBS_ROOT / job_id / "reconstruction.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line if line.endswith("\n") else f"{line}\n")


def to_job_response(job: dict[str, Any]) -> ReconstructionJob:
    return ReconstructionJob(
        id=job["id"],
        buildingName=job["buildingName"],
        status=job.get("status", "queued"),
        progress=int(job.get("progress", 0)),
        createdAt=job["createdAt"],
        modelPath=job.get("modelPath"),
        error=job.get("error"),
        savedBuildingId=job.get("savedBuildingId"),
        photoCount=int(job.get("photoCount", 0)),
        selectedCount=job.get("selectedCount"),
        targetBuildingId=job.get("targetBuildingId"),
    )


def get_accessible_building_or_404(building_id: str, viewer_id: str | None = None) -> dict[str, Any]:
    building = find_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if building["type"] == "personal" and building.get("ownerId") != viewer_id:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


def update_building(building_id: str, **updates) -> dict[str, Any]:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM buildings WHERE id = ?", (building_id,)).fetchone()
            if not row:
                raise KeyError(f"building not found: {building_id}")
            current = normalize_building(load_payload(row["payload"]))
            updated = normalize_building({**current, **updates, "updatedAt": now_iso()})
            upsert_building_record(conn, updated)
            return updated


def list_my_buildings(user_id: str) -> list[dict[str, Any]]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute(
                """
                SELECT payload FROM buildings
                WHERE type = 'personal' AND owner_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (user_id,),
            ).fetchall()
    return [normalize_building(load_payload(row["payload"])) for row in rows]


def list_public_buildings() -> list[dict[str, Any]]:
    with DATA_LOCK:
        with open_db() as conn:
            rows = conn.execute(
                """
                SELECT payload FROM buildings
                WHERE type = 'public'
                ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, contribution_count DESC, name ASC
                """
            ).fetchall()
    return [normalize_building(load_payload(row["payload"])) for row in rows]


def get_knowledge_items(building_id: str) -> list[KnowledgeItem]:
    knowledge = load_knowledge_store()
    return knowledge.get(building_id, [])


def build_overview() -> OverviewStats:
    with DATA_LOCK:
        with open_db() as conn:
            rescued_models = conn.execute("SELECT COUNT(*) FROM buildings WHERE status = 'ready'").fetchone()[0]
            contributed_photos = conn.execute("SELECT COALESCE(SUM(photo_count), 0) FROM contributions").fetchone()[0]
            public_buildings = conn.execute("SELECT COUNT(*) FROM buildings WHERE type = 'public'").fetchone()[0]
            personal_models = conn.execute("SELECT COUNT(*) FROM buildings WHERE type = 'personal'").fetchone()[0]
            active_jobs = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status NOT IN ('done', 'failed')"
            ).fetchone()[0]

    return OverviewStats(
        rescuedModels=int(rescued_models),
        contributedPhotos=int(contributed_photos or 0),
        publicBuildings=int(public_buildings),
        personalModels=int(personal_models),
        activeJobs=int(active_jobs),
    )


def build_chat_history(history: list[ChatMessage], message: str) -> list[dict[str, str]]:
    normalized_history = [
        {"role": item.role, "content": item.content.strip()}
        for item in history
        if item.role in {"user", "assistant"} and item.content.strip()
    ]
    normalized_history = normalized_history[-DEEPSEEK_HISTORY_LIMIT:]

    trimmed_message = message.strip()
    if (
        trimmed_message
        and (
            not normalized_history
            or normalized_history[-1]["role"] != "user"
            or normalized_history[-1]["content"] != trimmed_message
        )
    ):
        normalized_history.append({"role": "user", "content": trimmed_message})

    return normalized_history


def detect_architectural_focus(message: str) -> tuple[str, list[str]]:
    normalized = message.strip().lower()
    focus_points: list[str] = []

    if any(keyword in normalized for keyword in ("历史", "朝代", "沿革", "背景", "典礼", "礼制", "时代")):
        focus_points.extend(
            [
                "优先解释建筑的时代背景、礼制功能、历史角色，以及这些因素如何影响形制和等级。",
                "如果提到历史，不要只讲朝代名称，要顺带说明建筑为什么会长成现在这种样子。",
            ]
        )

    if any(
        keyword in normalized
        for keyword in ("结构", "构件", "屋顶", "斗拱", "梁", "柱", "檐", "台基", "木构", "做法", "受力")
    ):
        focus_points.extend(
            [
                "优先从构造体系回答，尽量说明屋顶、梁柱、斗拱、台基、檐口等部分分别起什么作用。",
                "回答结构问题时，尽量点出受力路径、构件关系和典型做法，但不要杜撰未提供的细部尺寸。",
            ]
        )

    if any(keyword in normalized for keyword in ("布局", "空间", "中轴", "院落", "序列", "流线", "平面")):
        focus_points.extend(
            [
                "优先解释空间秩序、轴线关系、主次层级和参观时应如何理解建筑的空间序列。",
            ]
        )

    if any(keyword in normalized for keyword in ("拍摄", "补拍", "照片", "重建", "众包", "扫描", "建模")):
        focus_points.extend(
            [
                "如果用户问拍摄或重建，请给出摄影测量导向的建议，比如环绕路线、俯仰角变化、遮挡处理、重叠度和细部补拍位。",
                "拍摄建议要具体到角度和区域，而不是只说“多拍一点”。",
            ]
        )

    if any(keyword in normalized for keyword in ("保护", "修缮", "病害", "维护", "风化")):
        focus_points.extend(
            [
                "如果用户问保护修缮，请从材料老化、构件脆弱部位、风化和信息记录价值的角度回答。",
            ]
        )

    if not focus_points:
        focus_points.extend(
            [
                "默认从建筑类型定位、最值得观察的构件、空间或礼制意义这三个维度组织回答。",
                "默认补上一条现场观察建议，让用户知道进入模型后应该先看哪里。",
            ]
        )

    focus_summary = "本轮问题的讲解重点：" + " ".join(focus_points)
    return focus_summary, focus_points


def build_deepseek_messages(building: dict[str, Any], message: str, history: list[ChatMessage]) -> list[dict[str, str]]:
    knowledge_items = get_knowledge_items(building["id"])
    knowledge_text = "\n".join(
        f"{index}. {item.term}：{item.description}" for index, item in enumerate(knowledge_items[:6], start=1)
    )
    if not knowledge_text:
        knowledge_text = "暂无额外构件知识卡片。"
    focus_summary, focus_points = detect_architectural_focus(message)
    focus_text = "\n".join(f"- {item}" for item in focus_points)

    status_map = {
        "ready": "这座建筑已经有可浏览的数字模型。",
        "pending": "这座建筑还在补充照片和数字档案。",
        "processing": "这座建筑当前正处于重建处理中。",
    }
    system_prompt = (
        "你是“筑忆”的古建筑数字讲解员，请始终使用中文回答。\n"
        "你同时也是建筑学导览员，回答时要尽量体现建筑史、构造逻辑和空间分析能力，而不是泛泛介绍。\n"
        "回答要求：\n"
        "1. 优先基于下面给出的建筑档案与知识卡片，不要编造未提供的事实。\n"
        "2. 优先从这些建筑学维度中选择最相关的内容回答：建筑类型与形制、屋顶与木构体系、斗拱与檐口、台基与立面比例、空间秩序与轴线、礼制等级、材料与保护价值。\n"
        "3. 当提到专业术语时，要顺带用一句通俗话解释术语，不要只堆术语。\n"
        "4. 如果资料不足，请明确说明“目前档案中还没有这部分信息”，并给出下一步观察、补拍或查证建议。\n"
        "5. 默认输出 3 到 5 句，高信息密度，少空话。优先给出“这是什么建筑”+“最值得看的建筑点”+“为什么重要”。\n"
        "6. 如果用户问拍摄、建模或众包，请切换到摄影测量视角，明确说明该拍哪些面、哪些构件、如何保证连续重叠。\n"
        "7. 不要假装自己真的看到了用户当前屏幕上的某个具体视角；如果提到观察建议，只能基于档案和一般建筑观察逻辑来建议。\n"
        "8. 如果问题比较宽泛，默认按这个顺序组织：一句定位、两个专业观察点、一条现场观察建议。\n\n"
        f"建筑名称：{building['name']}\n"
        f"所属朝代：{building['dynasty']}\n"
        f"地理位置：{building['location']}\n"
        f"建筑简介：{building['description']}\n"
        f"当前状态：{status_map.get(building['status'], '这座建筑的数字档案状态待确认。')}\n"
        f"平台记录照片数：{int(building.get('photoCount') or 0)}\n"
        f"平台记录贡献次数：{int(building.get('contributionCount') or 0)}\n"
        "相关知识卡片：\n"
        f"{knowledge_text}\n\n"
        f"{focus_summary}\n"
        "请优先遵循下面这些本轮讲解策略：\n"
        f"{focus_text}"
    )

    return [{"role": "system", "content": system_prompt}, *build_chat_history(history, message)]


def extract_deepseek_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    message = choices[0].get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
    return "\n".join(parts).strip()


def build_deepseek_reply(
    building: dict[str, Any], message: str, history: list[ChatMessage]
) -> tuple[ChatMessage | None, str | None]:
    if not DEEPSEEK_API_KEY:
        return None, "missing_api_key"

    request_payload = {
        "model": DEEPSEEK_MODEL,
        "messages": build_deepseek_messages(building, message, history),
        "temperature": DEEPSEEK_TEMPERATURE,
        "max_tokens": DEEPSEEK_MAX_TOKENS,
        "stream": False,
    }

    try:
        response = httpx.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json=request_payload,
            timeout=DEEPSEEK_TIMEOUT,
        )
        if response.is_error:
            raise RuntimeError(f"DeepSeek API returned {response.status_code}: {response.text[:240]}")

        content = extract_deepseek_content(response.json())
        if not content:
            raise RuntimeError("DeepSeek returned an empty response")

        return (
            ChatMessage(
                id=f"msg-{uuid4().hex[:8]}",
                role="assistant",
                content=content,
                timestamp=now_iso(),
            ),
            None,
        )
    except Exception as exc:
        print(f"[chat] DeepSeek request failed: {exc}", file=sys.stderr)
        return None, "service_error"


def build_fallback_notice(reason: str | None, history: list[ChatMessage]) -> str | None:
    if len(history) > 2:
        return None
    if reason == "missing_api_key":
        return "当前尚未配置 DeepSeek API Key，先使用本地知识库讲解。"
    if reason == "service_error":
        return "当前 DeepSeek 讲解服务暂时不可用，先使用本地知识库讲解。"
    return None


def build_chat_reply(
    building: dict[str, Any], message: str, history: list[ChatMessage], fallback_notice: str | None = None
) -> ChatMessage:
    del history
    normalized_message = message.strip()
    knowledge_items = get_knowledge_items(building["id"])

    if any(keyword in normalized_message for keyword in ("哪里", "位置", "在哪")):
        content = f"{building['name']}位于{building['location']}，目前平台记录为{building['dynasty']}时期相关建筑。"
    elif any(keyword in normalized_message for keyword in ("朝代", "年代", "历史")):
        content = f"{building['name']}目前归档为{building['dynasty']}时期，简介是：{building['description']}"
    elif any(keyword in normalized_message for keyword in ("上传", "拍摄", "照片", "众包", "重建")):
        content = (
            "建议围绕建筑做连续环绕拍摄，保证相邻照片至少 70% 重叠。"
            "同时补充檐口、转角、入口和台基等斜向细节，这会明显提升 SfM 和重建质量。"
        )
    elif knowledge_items:
        highlighted = knowledge_items[0]
        for item in knowledge_items:
            if item.term in normalized_message:
                highlighted = item
                break
        content = f"{building['name']}里和“{highlighted.term}”最相关的信息是：{highlighted.description}"
    else:
        content = f"{building['name']}目前的简介是：{building['description']} 如果你想，我也可以继续从结构、朝代或拍摄建议这几个角度来讲解。"

    if building["status"] != "ready":
        content += " 这座建筑目前还在补充数字档案阶段，继续贡献照片会很有帮助。"
    if fallback_notice:
        content = f"{fallback_notice}\n\n{content}"

    return ChatMessage(
        id=f"msg-{uuid4().hex[:8]}",
        role="assistant",
        content=content,
        timestamp=now_iso(),
    )


def run_command(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=str(cwd), env=env, text=True, capture_output=True, check=False)


def run_filter_images(job_id: str, raw_dir: Path, input_dir: Path) -> int:
    command = [
        PYTHON_BIN,
        str(FILTER_SCRIPT),
        "--src",
        str(raw_dir),
        "--dst",
        str(input_dir),
        "--lat-min",
        "0",
        "--lat-max",
        "90",
        "--lon-min",
        "-180",
        "--lon-max",
        "180",
        "--limit",
        str(RECONSTRUCTION_IMAGE_LIMIT),
    ]
    result = run_command(command, cwd=REPO_DIR)
    if result.stdout:
        append_job_log(job_id, result.stdout.rstrip())
    if result.stderr:
        append_job_log(job_id, result.stderr.rstrip())
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "filter_images.py failed")
    return len(list(input_dir.glob("*")))


def detect_model_output(job_dir: Path) -> Path | None:
    preferred = job_dir / f"{job_dir.name}.splat"
    if preferred.exists():
        return preferred

    splats = sorted(job_dir.glob("*.splat"))
    if splats:
        return splats[0]

    ply_candidates = sorted(job_dir.glob("output_*/point_cloud/iteration_*/point_cloud.ply"))
    if ply_candidates:
        return ply_candidates[-1]

    return None


def publish_model(job_id: str, model_path: Path) -> str:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    published_path = GENERATED_DIR / f"{job_id}{model_path.suffix.lower()}"
    shutil.copy2(model_path, published_path)
    return f"/generated/{published_path.name}"


def publish_cover_image(source_path: Path, prefix: str) -> str:
    GENERATED_COVERS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = source_path.suffix.lower() or ".jpg"
    target = GENERATED_COVERS_DIR / f"{prefix}{suffix}"
    shutil.copy2(source_path, target)
    return f"/generated/covers/{target.name}"


def can_run_real_reconstruction() -> bool:
    return (
        RECONSTRUCT_SCRIPT.exists()
        and FILTER_SCRIPT.exists()
        and CONVERT_SCRIPT.exists()
        and GAUSSIAN_SPLATTING_DIR.exists()
        and (GAUSSIAN_SPLATTING_DIR / "convert.py").exists()
        and (GAUSSIAN_SPLATTING_DIR / "train.py").exists()
    )


def choose_mock_model() -> Path:
    sample_path = FRONTEND_PUBLIC_DIR / SAMPLE_MODEL.lstrip("/")
    if sample_path.exists():
        return sample_path

    generated_models = sorted(GENERATED_DIR.glob("*.splat"))
    if generated_models:
        return generated_models[0]

    fallback = FRONTEND_PUBLIC_DIR / "models" / "bonsai.splat"
    if fallback.exists():
        return fallback

    raise RuntimeError("未找到可用于开发环境 mock 的 .splat 示例模型。")


def run_mock_reconstruction(job_id: str, job_dir: Path):
    raw_dir = job_dir / "raw"
    input_dir = job_dir / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    selected_images = sorted(raw_dir.glob("*"))[:RECONSTRUCTION_IMAGE_LIMIT]
    selected_count = len(selected_images)
    if selected_count < MIN_RECONSTRUCTION_IMAGES:
        raise RuntimeError(
            f"筛选后仅保留 {selected_count} 张图片，至少需要 {MIN_RECONSTRUCTION_IMAGES} 张才能启动重建。"
        )

    update_job(job_id, status="extracting", progress=12, error=None, modelPath=None, selectedCount=selected_count)
    append_job_log(job_id, f"[MOCK] selected {selected_count} images for local development")
    for image in selected_images:
        shutil.copy2(image, input_dir / image.name)

    time.sleep(0.25)
    update_job(job_id, status="matching", progress=46, selectedCount=selected_count)
    append_job_log(job_id, "[MOCK] simulating COLMAP feature matching")

    time.sleep(0.25)
    update_job(job_id, status="reconstructing", progress=78, selectedCount=selected_count)
    append_job_log(job_id, "[MOCK] simulating Gaussian Splatting training")

    mock_source = choose_mock_model()
    staged_model = job_dir / f"{job_id}.splat"
    shutil.copy2(mock_source, staged_model)
    public_model_path = publish_model(job_id, staged_model)

    time.sleep(0.2)
    update_job(job_id, status="done", progress=100, modelPath=public_model_path, error=None, selectedCount=selected_count)
    append_job_log(job_id, f"[MOCK] finished with sample model {mock_source.name}")


def run_reconstruction_pipeline(job_id: str, job_dir: Path):
    if not RECONSTRUCT_SCRIPT.exists():
        raise RuntimeError(f"reconstruct script not found: {RECONSTRUCT_SCRIPT}")
    if not FILTER_SCRIPT.exists():
        raise RuntimeError(f"filter script not found: {FILTER_SCRIPT}")
    if not CONVERT_SCRIPT.exists():
        raise RuntimeError(f"convert script not found: {CONVERT_SCRIPT}")

    command = ["bash", str(RECONSTRUCT_SCRIPT), str(job_dir), str(RECONSTRUCTION_ITERATIONS)]
    env = os.environ.copy()
    env["PYTHON_BIN"] = PYTHON_BIN
    env["GS_DIR"] = str(GAUSSIAN_SPLATTING_DIR)
    env["CONVERT_SCRIPT"] = str(CONVERT_SCRIPT)
    env["COLMAP_NO_GPU"] = COLMAP_NO_GPU
    env["MIN_IMAGES"] = str(MIN_RECONSTRUCTION_IMAGES)

    process = subprocess.Popen(
        command,
        cwd=str(REPO_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None
    for raw_line in process.stdout:
        line = raw_line.rstrip()
        if not line:
            continue
        append_job_log(job_id, line)
        if "[COLMAP]" in line:
            update_job(job_id, status="matching", progress=45)
        elif "[3DGS]" in line:
            update_job(job_id, status="reconstructing", progress=72)
        elif "[转换]" in line:
            update_job(job_id, status="reconstructing", progress=92)

    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"reconstruct.sh exited with code {return_code}")


def process_reconstruction_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return

    job_dir = Path(job["jobDir"])
    raw_dir = job_dir / "raw"
    input_dir = job_dir / "input"
    try:
        if RECONSTRUCTION_MODE == "real":
            update_job(job_id, status="extracting", progress=10, error=None, modelPath=None)
            selected_count = run_filter_images(job_id, raw_dir, input_dir)
            if selected_count < MIN_RECONSTRUCTION_IMAGES:
                raise RuntimeError(
                    f"筛选后仅保留 {selected_count} 张图片，至少需要 {MIN_RECONSTRUCTION_IMAGES} 张才能启动真实重建。"
                )
            update_job(job_id, status="matching", progress=30, selectedCount=selected_count)
            run_reconstruction_pipeline(job_id, job_dir)
            model_path = detect_model_output(job_dir)
            if model_path is None:
                raise RuntimeError("重建脚本已结束，但没有找到输出的 .splat 或 .ply 文件。")
            public_model_path = publish_model(job_id, model_path)
            update_job(job_id, status="done", progress=100, modelPath=public_model_path, error=None)
            return

        if RECONSTRUCTION_MODE == "auto" and can_run_real_reconstruction():
            try:
                update_job(job_id, status="extracting", progress=10, error=None, modelPath=None)
                selected_count = run_filter_images(job_id, raw_dir, input_dir)
                if selected_count < MIN_RECONSTRUCTION_IMAGES:
                    raise RuntimeError(
                        f"筛选后仅保留 {selected_count} 张图片，至少需要 {MIN_RECONSTRUCTION_IMAGES} 张才能启动真实重建。"
                    )
                update_job(job_id, status="matching", progress=30, selectedCount=selected_count)
                run_reconstruction_pipeline(job_id, job_dir)
                model_path = detect_model_output(job_dir)
                if model_path is None:
                    raise RuntimeError("重建脚本已结束，但没有找到输出的 .splat 或 .ply 文件。")
                public_model_path = publish_model(job_id, model_path)
                update_job(job_id, status="done", progress=100, modelPath=public_model_path, error=None)
                return
            except Exception as real_exc:
                append_job_log(job_id, f"[WARN] real pipeline failed, fallback to mock: {real_exc}")

        run_mock_reconstruction(job_id, job_dir)
    except Exception as exc:
        append_job_log(job_id, f"[ERROR] {exc}")
        update_job(job_id, status="failed", progress=100, error=str(exc))


def start_reconstruction_thread(job_id: str):
    worker = threading.Thread(target=process_reconstruction_job, args=(job_id,), daemon=True)
    worker.start()


def create_personal_building_from_job(job: dict[str, Any], user_id: str) -> dict[str, Any]:
    if job.get("savedBuildingId"):
        building = find_building(str(job["savedBuildingId"]))
        if building:
            if building.get("ownerId") == user_id:
                return building
            raise HTTPException(status_code=403, detail="This reconstruction has already been saved by another account")

    job_dir = Path(job["jobDir"])
    raw_files = sorted((job_dir / "raw").glob("*"))
    cover_image = publish_cover_image(raw_files[0], f"{job['id']}-cover") if raw_files else None
    building_id = f"personal-{uuid4().hex[:8]}"
    created_at = now_iso()
    building = normalize_building(
        {
            "id": building_id,
            "name": job["buildingName"],
            "dynasty": "待考证",
            "location": "用户上传",
            "coordinates": [0, 0],
            "description": f"由用户上传 {job.get('photoCount', 0)} 张照片生成的个人数字档案，可继续补充背景资料与来源信息。",
            "modelPath": job.get("modelPath"),
            "coverImage": cover_image,
            "type": "personal",
            "status": "ready",
            "ownerId": user_id,
            "sourceJobId": job["id"],
            "contributionCount": 0,
            "photoCount": int(job.get("photoCount") or 0),
            "createdAt": created_at,
            "updatedAt": created_at,
        }
    )
    with DATA_LOCK:
        with open_db() as conn:
            upsert_building_record(conn, building)
    update_job(job["id"], savedBuildingId=building_id)
    return building


initialize_database()


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "database": str(SQLITE_FILE),
        "reconstructionMode": RECONSTRUCTION_MODE,
        "realPipelineAvailable": can_run_real_reconstruction(),
        "gaussianSplattingDir": str(GAUSSIAN_SPLATTING_DIR),
        "chatProvider": "deepseek" if DEEPSEEK_API_KEY else "local-fallback",
        "deepseekConfigured": bool(DEEPSEEK_API_KEY),
        "deepseekModel": DEEPSEEK_MODEL if DEEPSEEK_API_KEY else None,
    }


@app.get("/api/overview", response_model=OverviewStats)
def overview():
    return build_overview()


@app.post("/api/auth/register", response_model=AuthPayload)
def register(payload: RegisterRequest):
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
        avatar=None,
        createdAt=now_iso(),
        passwordHash=password_hash,
        passwordSalt=password_salt,
    )
    with DATA_LOCK:
        with open_db() as conn:
            upsert_user_record(conn, user)
    return AuthPayload(user=User(**user.model_dump(exclude={"passwordHash", "passwordSalt"})), token=issue_token(user.id))


@app.post("/api/auth/login", response_model=AuthPayload)
def login(payload: LoginRequest):
    user = find_user_by_email(payload.email.lower())
    if not user or not verify_password(payload.password, user.passwordHash, user.passwordSalt):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthPayload(user=User(**user.model_dump(exclude={"passwordHash", "passwordSalt"})), token=issue_token(user.id))


@app.get("/api/auth/me", response_model=User)
def me(authorization: str | None = Header(default=None)):
    return require_user(authorization)


@app.get("/api/buildings", response_model=list[Building])
def list_buildings(type: str | None = None, authorization: str | None = Header(default=None)):
    viewer_id = optional_user_id(authorization)
    if type == "personal":
        if not viewer_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        buildings = list_my_buildings(viewer_id)
    else:
        buildings = list_public_buildings()
    return [Building(**item) for item in buildings]


@app.get("/api/my/buildings", response_model=list[Building])
def my_buildings(authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    return [Building(**item) for item in list_my_buildings(user.id)]


@app.get("/api/buildings/{building_id}", response_model=Building)
def get_building(building_id: str, authorization: str | None = Header(default=None)):
    building = get_accessible_building_or_404(building_id, optional_user_id(authorization))
    return Building(**building)


@app.get("/api/buildings/{building_id}/knowledge", response_model=list[KnowledgeItem])
def building_knowledge(building_id: str, authorization: str | None = Header(default=None)):
    get_accessible_building_or_404(building_id, optional_user_id(authorization))
    return get_knowledge_items(building_id)


@app.post("/api/reconstruct", response_model=ReconstructionJob)
async def reconstruct(
    building_name: str = Form(...),
    photos: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    owner_id = optional_user_id(authorization)
    if not photos:
        raise HTTPException(status_code=400, detail="No photos uploaded")
    if len(photos) < MIN_RECONSTRUCTION_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"At least {MIN_RECONSTRUCTION_IMAGES} photos are required to start reconstruction",
        )
    if not building_name.strip():
        raise HTTPException(status_code=400, detail="Building name is required")

    job_id = f"job-{uuid4().hex[:8]}"
    created_at = now_iso()
    job_dir = JOBS_ROOT / job_id
    raw_dir = job_dir / "raw"
    input_dir = job_dir / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    saved_files = save_uploaded_files(raw_dir, photos)

    job = normalize_job(
        {
            "id": job_id,
            "buildingName": building_name.strip(),
            "createdAt": created_at,
            "updatedAt": created_at,
            "createdTs": time.time(),
            "photoCount": len(saved_files),
            "status": "queued",
            "progress": 0,
            "modelPath": None,
            "error": None,
            "jobDir": str(job_dir),
            "selectedCount": None,
            "ownerId": owner_id,
            "targetBuildingId": None,
            "savedBuildingId": None,
        }
    )
    add_job(job)
    append_job_log(job_id, f"[INFO] received {len(saved_files)} photos")
    start_reconstruction_thread(job_id)
    return to_job_response(job)


@app.get("/api/reconstruct/{job_id}", response_model=ReconstructionJob)
def reconstruct_status(job_id: str, authorization: str | None = Header(default=None)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    viewer_id = optional_user_id(authorization)
    if job.get("ownerId") and viewer_id != job.get("ownerId"):
        raise HTTPException(status_code=404, detail="Job not found")
    return to_job_response(job)


@app.post("/api/reconstruct/{job_id}/save", response_model=Building)
def save_reconstruction(job_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("ownerId") and job.get("ownerId") != user.id:
        raise HTTPException(status_code=403, detail="You do not own this job")
    if job["status"] != "done" or not job.get("modelPath"):
        raise HTTPException(status_code=400, detail="Reconstruction is not ready to be saved")

    if not job.get("ownerId"):
        job = update_job(job_id, ownerId=user.id)

    building = create_personal_building_from_job(job, user.id)
    return Building(**building)


@app.post("/api/chat", response_model=ChatMessage)
def chat(payload: ChatRequest, authorization: str | None = Header(default=None)):
    building = get_accessible_building_or_404(payload.building_id, optional_user_id(authorization))
    reply, fallback_reason = build_deepseek_reply(building, payload.message, payload.history)
    if reply:
        return reply
    return build_chat_reply(
        building,
        payload.message,
        payload.history,
        fallback_notice=build_fallback_notice(fallback_reason, payload.history),
    )


@app.post("/api/contribute/{project_id}", response_model=ContributionResult)
async def contribute(project_id: str, photos: list[UploadFile] = File(...), authorization: str | None = Header(default=None)):
    if not photos:
        raise HTTPException(status_code=400, detail="No photos uploaded")

    contributor_id = optional_user_id(authorization)
    building = get_accessible_building_or_404(project_id, contributor_id)
    if building["type"] != "public":
        raise HTTPException(status_code=400, detail="Only public projects can accept contributions")

    contribution_id = f"contrib-{uuid4().hex[:8]}"
    contribution_dir = CONTRIBUTIONS_ROOT / project_id / contribution_id / "raw"
    saved_files = save_uploaded_files(contribution_dir, photos)

    contribution = normalize_contribution(
        {
            "id": contribution_id,
            "buildingId": project_id,
            "contributorId": contributor_id,
            "createdAt": now_iso(),
            "photoCount": len(saved_files),
            "files": [str(path) for path in saved_files],
        }
    )
    with DATA_LOCK:
        with open_db() as conn:
            upsert_contribution_record(conn, contribution)
            total_contributions = conn.execute(
                "SELECT COUNT(*) FROM contributions WHERE building_id = ?",
                (project_id,),
            ).fetchone()[0]

    updated_building = update_building(
        project_id,
        contributionCount=int(building.get("contributionCount") or 0) + 1,
        photoCount=int(building.get("photoCount") or 0) + len(saved_files),
    )
    return ContributionResult(
        contributionId=contribution_id,
        projectId=project_id,
        received=len(saved_files),
        totalContributions=int(total_contributions),
        totalPhotos=int(updated_building.get("photoCount") or 0),
    )
