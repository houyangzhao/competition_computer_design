from fastapi import APIRouter, Header

from models import ChatMessage, ChatRequest

from ..auth import optional_user_id
from ..chat import build_chat_reply, build_deepseek_reply, build_fallback_notice
from ..crud import get_accessible_building_or_404

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatMessage)
def chat_endpoint(payload: ChatRequest, authorization: str | None = Header(default=None)):
    building = get_accessible_building_or_404(payload.building_id, optional_user_id(authorization))
    reply, fallback_reason = build_deepseek_reply(building, payload.message, payload.history)
    if reply:
        return reply
    return build_chat_reply(
        building,
        payload.message,
        payload.history,
        fallback_notice=build_fallback_notice(fallback_reason, payload.history),
    )
