"""Centralized configuration: all env vars, paths, and constants."""

import os
import sys
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
REPO_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = BASE_DIR / "storage"
# 大文件存储：优先使用 ZHUYI_DATA_DIR（数据盘），否则退回 backend/storage/
_data_dir_env = os.environ.get("ZHUYI_DATA_DIR", "").strip()
_DATA_DISK = Path(_data_dir_env) if _data_dir_env else None
if _DATA_DISK and _DATA_DISK.parent.is_dir():
    JOBS_ROOT = _DATA_DISK / "jobs"
    GENERATED_DIR = _DATA_DISK / "generated"
    MODELS_DIR = _DATA_DISK / "models"
    CONTRIBUTIONS_ROOT = _DATA_DISK / "contributions"
else:
    JOBS_ROOT = STORAGE_DIR / "jobs"
    GENERATED_DIR = STORAGE_DIR / "generated"
    MODELS_DIR = STORAGE_DIR / "models"
    CONTRIBUTIONS_ROOT = STORAGE_DIR / "contributions"
GENERATED_COVERS_DIR = GENERATED_DIR / "covers"

RECONSTRUCTION_DIR = REPO_DIR / "reconstruction"
if not RECONSTRUCTION_DIR.exists():
    RECONSTRUCTION_DIR = REPO_DIR / "reconstraction"
FILTER_SCRIPT = RECONSTRUCTION_DIR / "filter_images.py"
CONVERT_SCRIPT = RECONSTRUCTION_DIR / "convert_ply_to_splat.py"
RECONSTRUCT_SCRIPT = RECONSTRUCTION_DIR / "reconstruct.sh"
CAMERA_SETTINGS_SCRIPT = RECONSTRUCTION_DIR / "compute_camera_settings.py"

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
ADMIN_REGISTER_CODE = os.environ.get("ZHUYI_ADMIN_REGISTER_CODE", "zhuyi-admin-register").strip()

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
