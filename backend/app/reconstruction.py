"""Reconstruction pipeline orchestration, GPU semaphore, and thread management."""

import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from .config import (
    CAMERA_SETTINGS_SCRIPT, COLMAP_NO_GPU, CONVERT_SCRIPT, DATA_LOCK,
    FILTER_SCRIPT, GAUSSIAN_SPLATTING_DIR, MIN_RECONSTRUCTION_IMAGES,
    PYTHON_BIN, RECONSTRUCT_SCRIPT, RECONSTRUCTION_IMAGE_LIMIT,
    RECONSTRUCTION_ITERATIONS, RECONSTRUCTION_MODE, REPO_DIR,
)
from .crud import (
    add_job, find_building, get_job, update_building, update_job,
    upsert_building_record,
)
from .database import now_iso, open_db
from .normalize import normalize_building, normalize_job
from .storage import (
    append_job_log, choose_mock_model, detect_model_output,
    publish_cover_image, publish_model,
)


def run_command(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=str(cwd), env=env, text=True, capture_output=True, check=False)


def run_filter_images(job_id: str, raw_dir: Path, input_dir: Path) -> int:
    command = [
        PYTHON_BIN,
        str(FILTER_SCRIPT),
        "--src", str(raw_dir),
        "--dst", str(input_dir),
        "--lat-min", "0",
        "--lat-max", "90",
        "--lon-min", "-180",
        "--lon-max", "180",
        "--limit", str(RECONSTRUCTION_IMAGE_LIMIT),
    ]
    result = run_command(command, cwd=REPO_DIR)
    if result.stdout:
        append_job_log(job_id, result.stdout.rstrip())
    if result.stderr:
        append_job_log(job_id, result.stderr.rstrip())
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "filter_images.py failed")
    return len(list(input_dir.glob("*")))


def can_run_real_reconstruction() -> bool:
    return (
        RECONSTRUCT_SCRIPT.exists()
        and FILTER_SCRIPT.exists()
        and CONVERT_SCRIPT.exists()
        and GAUSSIAN_SPLATTING_DIR.exists()
        and (GAUSSIAN_SPLATTING_DIR / "convert.py").exists()
        and (GAUSSIAN_SPLATTING_DIR / "train.py").exists()
    )


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


def _try_compute_camera_settings(job_id: str, job_dir: Path) -> dict | None:
    if not CAMERA_SETTINGS_SCRIPT.exists():
        append_job_log(job_id, "[cameraSettings] script not found, skipping")
        return None
    result = run_command(
        [PYTHON_BIN, str(CAMERA_SETTINGS_SCRIPT), str(job_dir),
         "--iterations", str(RECONSTRUCTION_ITERATIONS)],
        cwd=REPO_DIR,
    )
    if result.returncode != 0:
        append_job_log(job_id, f"[cameraSettings] computation failed: {result.stderr or result.stdout}")
        return None
    try:
        marker = "__CAMERA_JSON__="
        for line in result.stdout.splitlines():
            if line.strip().startswith(marker):
                return json.loads(line.strip()[len(marker):])
    except (json.JSONDecodeError, ValueError) as exc:
        append_job_log(job_id, f"[cameraSettings] failed to parse output: {exc}")
    return None


def _run_real_pipeline(job_id: str, job_dir: Path):
    raw_dir = job_dir / "raw"
    input_dir = job_dir / "input"

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

    camera_settings = _try_compute_camera_settings(job_id, job_dir)
    if camera_settings:
        append_job_log(job_id, f"[cameraSettings] {json.dumps(camera_settings)}")

    update_job(job_id, status="done", progress=100,
               modelPath=public_model_path, cameraSettings=camera_settings, error=None)


def process_reconstruction_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return

    job_dir = Path(job["jobDir"])
    try:
        if RECONSTRUCTION_MODE == "real":
            _run_real_pipeline(job_id, job_dir)
            return

        if RECONSTRUCTION_MODE == "auto" and can_run_real_reconstruction():
            try:
                _run_real_pipeline(job_id, job_dir)
                return
            except Exception as real_exc:
                append_job_log(job_id, f"[WARN] real pipeline failed, fallback to mock: {real_exc}")

        run_mock_reconstruction(job_id, job_dir)
    except Exception as exc:
        append_job_log(job_id, f"[ERROR] {exc}")
        update_job(job_id, status="failed", progress=100, error=str(exc))


GPU_SEMAPHORE = threading.Semaphore(1)


def process_reconstruction_job_queued(job_id: str):
    update_job(job_id, status="queued", progress=0)
    append_job_log(job_id, "[QUEUE] 等待 GPU 资源...")
    GPU_SEMAPHORE.acquire()
    try:
        append_job_log(job_id, "[QUEUE] 获得 GPU 资源，开始重建")
        process_reconstruction_job(job_id)
    finally:
        GPU_SEMAPHORE.release()


def start_reconstruction_thread(job_id: str):
    worker = threading.Thread(target=process_reconstruction_job_queued, args=(job_id,), daemon=True)
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
            "cameraSettings": job.get("cameraSettings"),
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
