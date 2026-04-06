import json
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

from fastapi import File, Form, Header, HTTPException, UploadFile, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import AuthPayload, Building, LoginRequest, ReconstructionJob, RegisterRequest, StoredUser, User

BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = BASE_DIR / "storage"
JOBS_ROOT = STORAGE_DIR / "jobs"
FRONTEND_PUBLIC_DIR = REPO_DIR / "frontend" / "public"
GENERATED_DIR = FRONTEND_PUBLIC_DIR / "generated"

RECONSTRUCTION_DIR = REPO_DIR / "reconstraction"
FILTER_SCRIPT = RECONSTRUCTION_DIR / "filter_images.py"
CONVERT_SCRIPT = RECONSTRUCTION_DIR / "convert_ply_to_splat.py"
RECONSTRUCT_SCRIPT = RECONSTRUCTION_DIR / "reconstruct.sh"

BUILDINGS_FILE = DATA_DIR / "buildings.json"
USERS_FILE = DATA_DIR / "users.json"
JOBS_FILE = DATA_DIR / "jobs.json"

PYTHON_BIN = os.environ.get("ZHUYI_RECON_PYTHON", sys.executable)
GAUSSIAN_SPLATTING_DIR = Path(os.environ.get("ZHUYI_GAUSSIAN_SPLATTING_DIR", "/root/gaussian-splatting"))
RECONSTRUCTION_ITERATIONS = int(os.environ.get("ZHUYI_RECON_ITERATIONS", "7000"))
RECONSTRUCTION_IMAGE_LIMIT = int(os.environ.get("ZHUYI_RECON_IMAGE_LIMIT", "300"))
MIN_RECONSTRUCTION_IMAGES = int(os.environ.get("ZHUYI_RECON_MIN_IMAGES", "3"))
COLMAP_NO_GPU = os.environ.get("ZHUYI_COLMAP_NO_GPU", "1")

JOBS_LOCK = threading.Lock()

app = FastAPI(title="Zhuyi Backend", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json(path: Path):
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def issue_token(user_id: str) -> str:
    return f"demo-token-{user_id}"


def parse_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ", 1)[1]
    if not token.startswith("demo-token-"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token.replace("demo-token-", "", 1)


def load_users() -> list[StoredUser]:
    return [StoredUser(**item) for item in read_json(USERS_FILE)]


def save_users(users: list[StoredUser]):
    write_json(USERS_FILE, [user.model_dump() for user in users])


def load_jobs() -> list[dict]:
    with JOBS_LOCK:
        return read_json(JOBS_FILE)


def save_jobs(jobs: list[dict]):
    with JOBS_LOCK:
        write_json(JOBS_FILE, jobs)


def add_job(job: dict):
    jobs = load_jobs()
    jobs.append(job)
    save_jobs(jobs)


def get_job(job_id: str) -> dict | None:
    jobs = load_jobs()
    return next((item for item in jobs if item["id"] == job_id), None)


def update_job(job_id: str, **updates) -> dict:
    jobs = load_jobs()
    for index, job in enumerate(jobs):
        if job["id"] == job_id:
            jobs[index] = {**job, **updates, "updatedAt": now_iso()}
            save_jobs(jobs)
            return jobs[index]
    raise KeyError(f"job not found: {job_id}")


def append_job_log(job_id: str, line: str):
    job_dir = JOBS_ROOT / job_id
    log_path = job_dir / "reconstruction.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line if line.endswith("\n") else f"{line}\n")


def to_job_response(job: dict) -> ReconstructionJob:
    return ReconstructionJob(
        id=job["id"],
        buildingName=job["buildingName"],
        status=job.get("status", "queued"),
        progress=int(job.get("progress", 0)),
        createdAt=job["createdAt"],
        modelPath=job.get("modelPath"),
    )


def save_uploaded_files(job_id: str, photos: list[UploadFile]) -> tuple[Path, Path]:
    job_dir = JOBS_ROOT / job_id
    raw_dir = job_dir / "raw"
    input_dir = job_dir / "input"
    raw_dir.mkdir(parents=True, exist_ok=True)
    input_dir.mkdir(parents=True, exist_ok=True)

    for index, photo in enumerate(photos):
        suffix = Path(photo.filename or "").suffix or ".jpg"
        filename = f"{index:03d}{suffix.lower()}"
        target = raw_dir / filename
        with target.open("wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo.file.close()

    return job_dir, raw_dir


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
    job_dir = JOBS_ROOT / job_id
    raw_dir = job_dir / "raw"
    input_dir = job_dir / "input"
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
    except Exception as exc:
        append_job_log(job_id, f"[ERROR] {exc}")
        update_job(job_id, status="failed", progress=100, error=str(exc))


def start_reconstruction_thread(job_id: str):
    worker = threading.Thread(target=process_reconstruction_job, args=(job_id,), daemon=True)
    worker.start()


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "reconstructScript": RECONSTRUCT_SCRIPT.exists(),
        "gaussianSplattingDir": str(GAUSSIAN_SPLATTING_DIR),
    }


@app.post("/api/auth/register", response_model=AuthPayload)
def register(payload: RegisterRequest):
    users = load_users()
    if any(user.email == payload.email for user in users):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = StoredUser(
        id=f"user-{uuid4().hex[:8]}",
        username=payload.username,
        email=payload.email,
        avatar=None,
        createdAt=now_iso(),
        password=payload.password,
    )
    users.append(user)
    save_users(users)
    return AuthPayload(user=User(**user.model_dump(exclude={"password"})), token=issue_token(user.id))


@app.post("/api/auth/login", response_model=AuthPayload)
def login(payload: LoginRequest):
    users = load_users()
    user = next((u for u in users if u.email == payload.email and u.password == payload.password), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthPayload(user=User(**user.model_dump(exclude={"password"})), token=issue_token(user.id))


@app.get("/api/auth/me", response_model=User)
def me(authorization: str | None = Header(default=None)):
    user_id = parse_token(authorization)
    users = load_users()
    user = next((u for u in users if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return User(**user.model_dump(exclude={"password"}))


@app.get("/api/buildings", response_model=list[Building])
def list_buildings(type: str | None = None):
    buildings = [Building(**item) for item in read_json(BUILDINGS_FILE)]
    if type:
        buildings = [item for item in buildings if item.type == type]
    return buildings


@app.get("/api/buildings/{building_id}", response_model=Building)
def get_building(building_id: str):
    buildings = [Building(**item) for item in read_json(BUILDINGS_FILE)]
    building = next((item for item in buildings if item.id == building_id), None)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@app.post("/api/reconstruct", response_model=ReconstructionJob)
async def reconstruct(
    building_name: str = Form(...),
    photos: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    user_id = None
    if authorization:
        user_id = parse_token(authorization)
    if not photos:
        raise HTTPException(status_code=400, detail="No photos uploaded")
    if not building_name.strip():
        raise HTTPException(status_code=400, detail="Building name is required")

    job_id = f"job-{uuid4().hex[:8]}"
    created_at = now_iso()
    job_dir, _ = save_uploaded_files(job_id, photos)

    job = {
        "id": job_id,
        "buildingName": building_name.strip(),
        "createdAt": created_at,
        "updatedAt": created_at,
        "createdTs": time.time(),
        "photoCount": len(photos),
        "status": "queued",
        "progress": 0,
        "modelPath": None,
        "error": None,
        "jobDir": str(job_dir),
        "userId": user_id,
    }
    add_job(job)
    start_reconstruction_thread(job_id)
    return to_job_response(job)


@app.get("/api/reconstruct", response_model=list[ReconstructionJob])
def list_jobs(authorization: str | None = Header(default=None)):
    """列出当前用户的所有重建任务（需登录）"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.removeprefix("Bearer ").strip()
    users = read_json(USERS_FILE)
    user = next((u for u in users if u.get("id") == token), None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    jobs = [j for j in load_jobs() if j.get("userId") == user["id"]]
    jobs.sort(key=lambda j: j.get("createdAt", ""), reverse=True)
    return [to_job_response(j) for j in jobs]


@app.get("/api/reconstruct/{job_id}", response_model=ReconstructionJob)
def reconstruct_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return to_job_response(job)


@app.post("/api/chat")
def chat():
    return {
        "id": f"msg-{uuid4().hex[:8]}",
        "role": "assistant",
        "content": "AI 功能即将上线，当前版本先完成前后端联调。",
        "timestamp": now_iso(),
    }


@app.post("/api/contribute/{project_id}")
async def contribute(project_id: str, photos: list[UploadFile] = File(...)):
    return {"projectId": project_id, "received": len(photos)}
