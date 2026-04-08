"""Zhuyi Backend — FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import CORS_ORIGINS, GENERATED_DIR, MODELS_DIR
from .crud import cleanup_stale_jobs
from .database import initialize_database
from .routes import include_routers


def create_app() -> FastAPI:
    app = FastAPI(title="Zhuyi Backend", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    initialize_database()
    cleanup_stale_jobs()
    include_routers(app)

    # 静态文件服务：.splat 模型和生成文件由后端直接 serve
    app.mount("/generated", StaticFiles(directory=str(GENERATED_DIR)), name="generated")
    app.mount("/models", StaticFiles(directory=str(MODELS_DIR)), name="models")

    return app
