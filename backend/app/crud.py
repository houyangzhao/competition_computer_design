"""All database CRUD operations."""

import shutil
import sqlite3
import time
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from models import (
    AdminProjectCreateRequest, Building, KnowledgeItem, OverviewStats,
    ReconstructionJob, StoredUser,
)

from .config import CONTRIBUTIONS_ROOT, DATA_LOCK
from .database import dump_payload, load_payload, now_iso, open_db
from .normalize import (
    normalize_building, normalize_contribution, normalize_job, normalize_user,
)


# ── Upsert operations ────────────────────────────────────────

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


# ── Load / Save ───────────────────────────────────────────────

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


# ── Job operations ────────────────────────────────────────────

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


# ── User operations ───────────────────────────────────────────

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


# ── Building operations ──────────────────────────────────────

def find_building(building_id: str) -> dict[str, Any] | None:
    with DATA_LOCK:
        with open_db() as conn:
            row = conn.execute("SELECT payload FROM buildings WHERE id = ?", (building_id,)).fetchone()
    if not row:
        return None
    return normalize_building(load_payload(row["payload"]))


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


def create_public_project(payload: AdminProjectCreateRequest) -> dict[str, Any]:
    created_at = now_iso()
    building = normalize_building(
        {
            "id": f"public-{uuid4().hex[:8]}",
            "name": payload.name.strip(),
            "dynasty": payload.dynasty.strip() or "待考证",
            "location": payload.location.strip() or "位置待补充",
            "coordinates": [payload.longitude, payload.latitude],
            "description": payload.description.strip() or "暂无建筑介绍。",
            "modelPath": None,
            "coverImage": None,
            "type": "public",
            "status": "pending",
            "ownerId": None,
            "sourceJobId": None,
            "contributionCount": 0,
            "photoCount": 0,
            "createdAt": created_at,
            "updatedAt": created_at,
        }
    )
    with DATA_LOCK:
        with open_db() as conn:
            upsert_building_record(conn, building)
    return building


def delete_public_project(building_id: str):
    building = find_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if building["type"] != "public":
        raise HTTPException(status_code=400, detail="Only public crowdsource projects can be deleted")

    with DATA_LOCK:
        with open_db() as conn:
            conn.execute("DELETE FROM contributions WHERE building_id = ?", (building_id,))
            conn.execute("DELETE FROM knowledge_items WHERE building_id = ?", (building_id,))
            conn.execute("DELETE FROM buildings WHERE id = ?", (building_id,))

    shutil.rmtree(CONTRIBUTIONS_ROOT / building_id, ignore_errors=True)


def delete_personal_building(building_id: str, owner_id: str):
    building = find_building(building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if building["type"] != "personal" or building.get("ownerId") != owner_id:
        raise HTTPException(status_code=404, detail="Building not found")

    with DATA_LOCK:
        with open_db() as conn:
            conn.execute("DELETE FROM knowledge_items WHERE building_id = ?", (building_id,))
            conn.execute("DELETE FROM buildings WHERE id = ?", (building_id,))


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
