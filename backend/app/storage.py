"""File storage operations: save uploads, publish models and covers."""

import shutil
from pathlib import Path

from fastapi import UploadFile

from .config import GENERATED_COVERS_DIR, GENERATED_DIR, JOBS_ROOT, MODELS_DIR, SAMPLE_MODEL


def save_uploaded_files(target_dir: Path, photos: list[UploadFile]) -> list[Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    saved_files: list[Path] = []

    for index, photo in enumerate(photos):
        suffix = Path(photo.filename or "").suffix.lower() or ".jpg"
        filename = f"{index:03d}{suffix}"
        destination = target_dir / filename
        with destination.open("wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo.file.close()
        saved_files.append(destination)

    return saved_files


def append_job_log(job_id: str, line: str):
    log_path = JOBS_ROOT / job_id / "reconstruction.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line if line.endswith("\n") else f"{line}\n")


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


def publish_cover_image(source_path: Path, prefix: str) -> str:
    GENERATED_COVERS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = source_path.suffix.lower() or ".jpg"
    target = GENERATED_COVERS_DIR / f"{prefix}{suffix}"
    shutil.copy2(source_path, target)
    return f"/generated/covers/{target.name}"


def choose_mock_model() -> Path:
    sample_name = SAMPLE_MODEL.lstrip("/").replace("models/", "")
    sample_path = MODELS_DIR / sample_name
    if sample_path.exists():
        return sample_path

    generated_models = sorted(GENERATED_DIR.glob("*.splat"))
    if generated_models:
        return generated_models[0]

    fallback = MODELS_DIR / "bonsai.splat"
    if fallback.exists():
        return fallback

    raise RuntimeError("未找到可用于开发环境 mock 的 .splat 示例模型。")
