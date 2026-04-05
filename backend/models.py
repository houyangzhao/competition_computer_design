from typing import Literal

from pydantic import BaseModel, EmailStr


class User(BaseModel):
    id: str
    username: str
    email: EmailStr
    avatar: str | None = None
    createdAt: str


class StoredUser(User):
    password: str


class AuthPayload(BaseModel):
    user: User
    token: str


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Building(BaseModel):
    id: str
    name: str
    dynasty: str
    location: str
    coordinates: tuple[float, float]
    description: str
    modelPath: str | None
    coverImage: str | None
    type: Literal["public", "personal"]
    status: Literal["ready", "pending", "processing"]


class ReconstructionJob(BaseModel):
    id: str
    buildingName: str
    status: Literal["queued", "extracting", "matching", "reconstructing", "done", "failed"]
    progress: int
    createdAt: str
    modelPath: str | None = None
