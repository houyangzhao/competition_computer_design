from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class User(BaseModel):
    id: str
    username: str
    email: EmailStr
    role: Literal["user", "admin"] = "user"
    avatar: str | None = None
    createdAt: str


class StoredUser(User):
    passwordHash: str
    passwordSalt: str


class AuthPayload(BaseModel):
    user: User
    token: str


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class AdminRegisterRequest(RegisterRequest):
    adminCode: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CameraSettings(BaseModel):
    up: tuple[float, float, float]
    position: tuple[float, float, float]
    lookAt: tuple[float, float, float]


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
    cameraSettings: CameraSettings | None = None
    ownerId: str | None = None
    sourceJobId: str | None = None
    contributionCount: int = 0
    photoCount: int = 0
    createdAt: str | None = None
    updatedAt: str | None = None


class ReconstructionJob(BaseModel):
    id: str
    buildingName: str
    status: Literal["queued", "extracting", "matching", "reconstructing", "done", "failed"]
    progress: int
    createdAt: str
    modelPath: str | None = None
    error: str | None = None
    savedBuildingId: str | None = None
    photoCount: int = 0
    selectedCount: int | None = None
    targetBuildingId: str | None = None


class KnowledgeItem(BaseModel):
    term: str
    description: str
    imageUrl: str | None = None


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    building_id: str = Field(alias="building_id")
    message: str
    history: list[ChatMessage] = Field(default_factory=list)


class ContributionResult(BaseModel):
    contributionId: str
    projectId: str
    received: int
    totalContributions: int
    totalPhotos: int


class OverviewStats(BaseModel):
    rescuedModels: int
    contributedPhotos: int
    publicBuildings: int
    personalModels: int
    activeJobs: int


class AdminProjectCreateRequest(BaseModel):
    name: str
    dynasty: str
    location: str
    description: str
    latitude: float = 0
    longitude: float = 0
