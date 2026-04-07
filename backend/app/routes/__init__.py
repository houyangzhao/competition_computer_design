"""Register all API routers onto the FastAPI app."""

from fastapi import FastAPI

from . import admin, auth, buildings, chat, contribute, reconstruct


def include_routers(app: FastAPI):
    app.include_router(auth.router)
    app.include_router(buildings.router)
    app.include_router(admin.router)
    app.include_router(reconstruct.router)
    app.include_router(chat.router)
    app.include_router(contribute.router)
