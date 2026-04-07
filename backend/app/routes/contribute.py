from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from uuid import uuid4

from models import ContributionResult

from ..auth import require_user
from ..config import CONTRIBUTIONS_ROOT, DATA_LOCK
from ..crud import get_accessible_building_or_404, update_building, upsert_contribution_record
from ..database import now_iso, open_db
from ..normalize import normalize_contribution
from ..storage import save_uploaded_files

router = APIRouter(prefix="/api", tags=["contribute"])


@router.post("/contribute/{project_id}", response_model=ContributionResult)
async def contribute(project_id: str, photos: list[UploadFile] = File(...), authorization: str | None = Header(default=None)):
    if not photos:
        raise HTTPException(status_code=400, detail="No photos uploaded")

    contributor = require_user(authorization)
    contributor_id = contributor.id
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
