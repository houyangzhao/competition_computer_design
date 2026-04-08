import time
from uuid import uuid4

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from models import Building, ReconstructionJob

from ..auth import optional_user_id, require_user
from ..config import JOBS_ROOT, MIN_RECONSTRUCTION_IMAGES
from ..crud import add_job, get_job, list_jobs_by_owner, to_job_response, update_job
from ..database import now_iso
from ..normalize import normalize_job
from ..reconstruction import create_personal_building_from_job, start_reconstruction_thread
from ..storage import append_job_log, save_uploaded_files

router = APIRouter(prefix="/api/reconstruct", tags=["reconstruct"])


@router.get("", response_model=list[ReconstructionJob])
def list_my_jobs(authorization: str | None = Header(default=None)):
    user = require_user(authorization)
    return [to_job_response(j) for j in list_jobs_by_owner(user.id)]


@router.post("", response_model=ReconstructionJob)
async def reconstruct(
    building_name: str = Form(...),
    photos: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    owner = require_user(authorization)
    owner_id = owner.id
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


@router.get("/{job_id}", response_model=ReconstructionJob)
def reconstruct_status(job_id: str, authorization: str | None = Header(default=None)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    viewer_id = optional_user_id(authorization)
    if job.get("ownerId") and viewer_id != job.get("ownerId"):
        raise HTTPException(status_code=404, detail="Job not found")
    return to_job_response(job)


@router.post("/{job_id}/save", response_model=Building)
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
