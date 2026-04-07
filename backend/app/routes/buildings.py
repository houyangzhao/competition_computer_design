from fastapi import APIRouter, Header, HTTPException

from models import Building, KnowledgeItem, OverviewStats

from ..auth import optional_user_id, require_user
from ..crud import (
    build_overview, delete_personal_building, get_accessible_building_or_404, get_knowledge_items,
    list_my_buildings, list_public_buildings,
)

router = APIRouter(prefix="/api", tags=["buildings"])


@router.get("/health")
def health():
    from ..config import (
        DEEPSEEK_API_KEY, DEEPSEEK_MODEL, GAUSSIAN_SPLATTING_DIR,
        RECONSTRUCTION_MODE, SQLITE_FILE,
    )
    from ..reconstruction import can_run_real_reconstruction
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


@router.get("/overview", response_model=OverviewStats)
def overview():
    return build_overview()


@router.get("/buildings", response_model=list[Building])
def list_buildings_endpoint(type: str | None = None, authorization: str | None = Header(default=None)):
    viewer_id = optional_user_id(authorization)
    if type == "personal":
        if not viewer_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        buildings = list_my_buildings(viewer_id)
    else:
        buildings = list_public_buildings()
    return [Building(**item) for item in buildings]


@router.get("/my/buildings", response_model=list[Building])
def my_buildings(authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    return [Building(**item) for item in list_my_buildings(user.id)]


@router.delete("/my/buildings/{building_id}")
def delete_my_building(building_id: str, authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    delete_personal_building(building_id, user.id)
    return {"ok": True, "deletedId": building_id}


@router.get("/buildings/{building_id}", response_model=Building)
def get_building(building_id: str, authorization: str | None = Header(default=None)):
    building = get_accessible_building_or_404(building_id, optional_user_id(authorization))
    return Building(**building)


@router.get("/buildings/{building_id}/knowledge", response_model=list[KnowledgeItem])
def building_knowledge(building_id: str, authorization: str | None = Header(default=None)):
    get_accessible_building_or_404(building_id, optional_user_id(authorization))
    return get_knowledge_items(building_id)
