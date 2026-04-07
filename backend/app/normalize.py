"""Data normalization functions and default seed data."""

import time
from typing import Any
from uuid import uuid4

from models import Building, KnowledgeItem, StoredUser

from .auth import hash_password
from .config import JOBS_ROOT
from .database import now_iso


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
        cameraSettings=item.get("cameraSettings"),
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
    role = str(item.get("role") or "user").strip().lower()
    if role not in {"user", "admin"}:
        role = "user"

    if not password_hash or not password_salt:
        raw_password = str(item.get("password") or "123456")
        password_salt, password_hash = hash_password(raw_password)

    return StoredUser(
        id=str(item.get("id") or f"user-{uuid4().hex[:8]}"),
        username=username or "user",
        email=email,
        role=role,
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
        "cameraSettings": item.get("cameraSettings"),
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
