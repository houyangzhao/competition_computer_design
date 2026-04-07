"""SQLite connection, schema definition, and database initialization."""

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from .config import (
    BUILDINGS_FILE, CONTRIBUTIONS_FILE, CONTRIBUTIONS_ROOT, DATA_DIR, DATA_LOCK,
    GENERATED_COVERS_DIR, GENERATED_DIR, JOBS_FILE, JOBS_ROOT, KNOWLEDGE_FILE,
    MODELS_DIR, SQLITE_FILE, USERS_FILE,
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
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    SQLITE_FILE.parent.mkdir(parents=True, exist_ok=True)


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


def initialize_database():
    ensure_storage_dirs()
    # Import here to avoid circular imports at module level
    from .normalize import normalize_building, normalize_contribution, normalize_job, normalize_knowledge_store, normalize_user
    from .crud import upsert_building_record, upsert_contribution_record, upsert_job_record, upsert_user_record, replace_knowledge_records

    with DATA_LOCK:
        with open_db() as conn:
            conn.executescript(DB_SCHEMA)

            if conn.execute("SELECT COUNT(*) FROM buildings").fetchone()[0] == 0:
                from .normalize import default_buildings
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
                from .normalize import default_knowledge
                replace_knowledge_records(conn, normalize_knowledge_store(read_json(KNOWLEDGE_FILE, default_knowledge())))
