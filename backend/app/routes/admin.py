from uuid import uuid4

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from models import AdminProjectCreateRequest, Building

from ..auth import require_admin
from ..config import DATA_LOCK, GENERATED_DIR
from ..crud import create_public_project, delete_public_project, upsert_building_record
from ..database import now_iso, open_db
from ..normalize import normalize_building

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/projects", response_model=Building)
def admin_create_project(payload: AdminProjectCreateRequest, authorization: str | None = Header(default=None)):
    require_admin(authorization)

    if len(payload.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Project name must be at least 2 characters")
    if len(payload.location.strip()) < 2:
        raise HTTPException(status_code=400, detail="Project location is required")
    if len(payload.description.strip()) < 8:
        raise HTTPException(status_code=400, detail="Project description must be at least 8 characters")

    building = create_public_project(payload)
    return Building(**building)


@router.delete("/projects/{building_id}")
def admin_delete_project(building_id: str, authorization: str | None = Header(default=None)):
    require_admin(authorization)
    delete_public_project(building_id)
    return {"ok": True, "deletedId": building_id}


@router.post("/import-model", response_model=Building)
async def admin_import_model(
    splat: UploadFile = File(...),
    name: str = Form(...),
    dynasty: str = Form("现代"),
    location: str = Form("位置待补充"),
    description: str = Form("暂无建筑介绍。"),
    latitude: float = Form(0),
    longitude: float = Form(0),
    camera_up: str = Form("0,0,-1"),
    camera_position: str = Form("0,0,5"),
    camera_look_at: str = Form("0,0,0"),
    photo_count: int = Form(0),
    building_id: str | None = Form(None),
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    if not splat.filename or not splat.filename.lower().endswith(".splat"):
        raise HTTPException(status_code=400, detail="File must be a .splat file")

    def parse_vec3(s: str) -> tuple[float, float, float]:
        parts = [float(x.strip()) for x in s.split(",")]
        if len(parts) != 3:
            raise ValueError
        return (parts[0], parts[1], parts[2])

    try:
        up = parse_vec3(camera_up)
        position = parse_vec3(camera_position)
        look_at = parse_vec3(camera_look_at)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Camera vectors must be 3 comma-separated floats, e.g. '0.1,-0.2,0.3'")

    bid = building_id or f"import-{uuid4().hex[:8]}"

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    published_path = GENERATED_DIR / f"{bid}.splat"
    content = await splat.read()
    published_path.write_bytes(content)
    model_url = f"/generated/{published_path.name}"

    created_at = now_iso()
    building = normalize_building(
        {
            "id": bid,
            "name": name.strip(),
            "dynasty": dynasty.strip(),
            "location": location.strip(),
            "coordinates": [longitude, latitude],
            "description": description.strip(),
            "modelPath": model_url,
            "coverImage": None,
            "type": "public",
            "status": "ready",
            "ownerId": None,
            "sourceJobId": None,
            "contributionCount": 0,
            "photoCount": photo_count,
            "createdAt": created_at,
            "updatedAt": created_at,
            "cameraSettings": {
                "up": list(up),
                "position": list(position),
                "lookAt": list(look_at),
            },
        }
    )
    with DATA_LOCK:
        with open_db() as conn:
            upsert_building_record(conn, building)

    return Building(**building)
