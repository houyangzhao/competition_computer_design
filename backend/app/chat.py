"""DeepSeek AI chat integration and local fallback."""

import sys
from typing import Any
from uuid import uuid4

import httpx

from models import ChatMessage, KnowledgeItem

from .config import (
    DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_HISTORY_LIMIT,
    DEEPSEEK_MAX_TOKENS, DEEPSEEK_MODEL, DEEPSEEK_TEMPERATURE, DEEPSEEK_TIMEOUT,
)
from .crud import get_knowledge_items
from .database import now_iso


def build_chat_history(history: list[ChatMessage], message: str) -> list[dict[str, str]]:
    normalized_history = [
        {"role": item.role, "content": item.content.strip()}
        for item in history
        if item.role in {"user", "assistant"} and item.content.strip()
    ]
    normalized_history = normalized_history[-DEEPSEEK_HISTORY_LIMIT:]

    trimmed_message = message.strip()
    if (
        trimmed_message
        and (
            not normalized_history
            or normalized_history[-1]["role"] != "user"
            or normalized_history[-1]["content"] != trimmed_message
        )
    ):
        normalized_history.append({"role": "user", "content": trimmed_message})

    return normalized_history


def detect_architectural_focus(message: str) -> tuple[str, list[str]]:
    normalized = message.strip().lower()
    focus_points: list[str] = []

    if any(keyword in normalized for keyword in ("历史", "朝代", "沿革", "背景", "典礼", "礼制", "时代")):
        focus_points.extend([
            "优先解释建筑的时代背景、礼制功能、历史角色，以及这些因素如何影响形制和等级。",
            "如果提到历史，不要只讲朝代名称，要顺带说明建筑为什么会长成现在这种样子。",
        ])

    if any(keyword in normalized for keyword in ("结构", "构件", "屋顶", "斗拱", "梁", "柱", "檐", "台基", "木构", "做法", "受力")):
        focus_points.extend([
            "优先从构造体系回答，尽量说明屋顶、梁柱、斗拱、台基、檐口等部分分别起什么作用。",
            "回答结构问题时，尽量点出受力路径、构件关系和典型做法，但不要杜撰未提供的细部尺寸。",
        ])

    if any(keyword in normalized for keyword in ("布局", "空间", "中轴", "院落", "序列", "流线", "平面")):
        focus_points.extend([
            "优先解释空间秩序、轴线关系、主次层级和参观时应如何理解建筑的空间序列。",
        ])

    if any(keyword in normalized for keyword in ("拍摄", "补拍", "照片", "重建", "众包", "扫描", "建模")):
        focus_points.extend([
            "如果用户问拍摄或重建，请给出摄影测量导向的建议，比如环绕路线、俯仰角变化、遮挡处理、重叠度和细部补拍位。",
            "拍摄建议要具体到角度和区域，而不是只说\u201c多拍一点\u201d。",
        ])

    if any(keyword in normalized for keyword in ("保护", "修缮", "病害", "维护", "风化")):
        focus_points.extend([
            "如果用户问保护修缮，请从材料老化、构件脆弱部位、风化和信息记录价值的角度回答。",
        ])

    if not focus_points:
        focus_points.extend([
            "默认从建筑类型定位、最值得观察的构件、空间或礼制意义这三个维度组织回答。",
            "默认补上一条现场观察建议，让用户知道进入模型后应该先看哪里。",
        ])

    focus_summary = "本轮问题的讲解重点：" + " ".join(focus_points)
    return focus_summary, focus_points


def build_deepseek_messages(building: dict[str, Any], message: str, history: list[ChatMessage]) -> list[dict[str, str]]:
    knowledge_items = get_knowledge_items(building["id"])
    knowledge_text = "\n".join(
        f"{index}. {item.term}：{item.description}" for index, item in enumerate(knowledge_items[:6], start=1)
    )
    if not knowledge_text:
        knowledge_text = "暂无额外构件知识卡片。"
    focus_summary, focus_points = detect_architectural_focus(message)
    focus_text = "\n".join(f"- {item}" for item in focus_points)

    status_map = {
        "ready": "这座建筑已经有可浏览的数字模型。",
        "pending": "这座建筑还在补充照片和数字档案。",
        "processing": "这座建筑当前正处于重建处理中。",
    }
    system_prompt = (
        "你是\u201c筑忆\u201d的古建筑数字讲解员，请始终使用中文回答。\n"
        "你同时也是建筑学导览员，回答时要尽量体现建筑史、构造逻辑和空间分析能力，而不是泛泛介绍。\n"
        "回答要求：\n"
        "1. 优先基于下面给出的建筑档案与知识卡片，不要编造未提供的事实。\n"
        "2. 优先从这些建筑学维度中选择最相关的内容回答：建筑类型与形制、屋顶与木构体系、斗拱与檐口、台基与立面比例、空间秩序与轴线、礼制等级、材料与保护价值。\n"
        "3. 当提到专业术语时，要顺带用一句通俗话解释术语，不要只堆术语。\n"
        "4. 如果资料不足，请明确说明\u201c目前档案中还没有这部分信息\u201d，并给出下一步观察、补拍或查证建议。\n"
        "5. 默认输出 3 到 5 句，高信息密度，少空话。优先给出\u201c这是什么建筑\u201d+\u201c最值得看的建筑点\u201d+\u201c为什么重要\u201d。\n"
        "6. 如果用户问拍摄、建模或众包，请切换到摄影测量视角，明确说明该拍哪些面、哪些构件、如何保证连续重叠。\n"
        "7. 不要假装自己真的看到了用户当前屏幕上的某个具体视角；如果提到观察建议，只能基于档案和一般建筑观察逻辑来建议。\n"
        "8. 如果问题比较宽泛，默认按这个顺序组织：一句定位、两个专业观察点、一条现场观察建议。\n\n"
        f"建筑名称：{building['name']}\n"
        f"所属朝代：{building['dynasty']}\n"
        f"地理位置：{building['location']}\n"
        f"建筑简介：{building['description']}\n"
        f"当前状态：{status_map.get(building['status'], '这座建筑的数字档案状态待确认。')}\n"
        f"平台记录照片数：{int(building.get('photoCount') or 0)}\n"
        f"平台记录贡献次数：{int(building.get('contributionCount') or 0)}\n"
        "相关知识卡片：\n"
        f"{knowledge_text}\n\n"
        f"{focus_summary}\n"
        "请优先遵循下面这些本轮讲解策略：\n"
        f"{focus_text}"
    )

    return [{"role": "system", "content": system_prompt}, *build_chat_history(history, message)]


def extract_deepseek_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    message = choices[0].get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
    return "\n".join(parts).strip()


def build_deepseek_reply(
    building: dict[str, Any], message: str, history: list[ChatMessage]
) -> tuple[ChatMessage | None, str | None]:
    if not DEEPSEEK_API_KEY:
        return None, "missing_api_key"

    request_payload = {
        "model": DEEPSEEK_MODEL,
        "messages": build_deepseek_messages(building, message, history),
        "temperature": DEEPSEEK_TEMPERATURE,
        "max_tokens": DEEPSEEK_MAX_TOKENS,
        "stream": False,
    }

    try:
        response = httpx.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json=request_payload,
            timeout=DEEPSEEK_TIMEOUT,
        )
        if response.is_error:
            raise RuntimeError(f"DeepSeek API returned {response.status_code}: {response.text[:240]}")

        content = extract_deepseek_content(response.json())
        if not content:
            raise RuntimeError("DeepSeek returned an empty response")

        return (
            ChatMessage(
                id=f"msg-{uuid4().hex[:8]}",
                role="assistant",
                content=content,
                timestamp=now_iso(),
            ),
            None,
        )
    except Exception as exc:
        print(f"[chat] DeepSeek request failed: {exc}", file=sys.stderr)
        return None, "service_error"


def build_fallback_notice(reason: str | None, history: list[ChatMessage]) -> str | None:
    if len(history) > 2:
        return None
    if reason == "missing_api_key":
        return "当前尚未配置 DeepSeek API Key，先使用本地知识库讲解。"
    if reason == "service_error":
        return "当前 DeepSeek 讲解服务暂时不可用，先使用本地知识库讲解。"
    return None


def build_chat_reply(
    building: dict[str, Any], message: str, history: list[ChatMessage], fallback_notice: str | None = None
) -> ChatMessage:
    del history
    normalized_message = message.strip()
    knowledge_items = get_knowledge_items(building["id"])

    if any(keyword in normalized_message for keyword in ("哪里", "位置", "在哪")):
        content = f"{building['name']}位于{building['location']}，目前平台记录为{building['dynasty']}时期相关建筑。"
    elif any(keyword in normalized_message for keyword in ("朝代", "年代", "历史")):
        content = f"{building['name']}目前归档为{building['dynasty']}时期，简介是：{building['description']}"
    elif any(keyword in normalized_message for keyword in ("上传", "拍摄", "照片", "众包", "重建")):
        content = (
            "建议围绕建筑做连续环绕拍摄，保证相邻照片至少 70% 重叠。"
            "同时补充檐口、转角、入口和台基等斜向细节，这会明显提升 SfM 和重建质量。"
        )
    elif knowledge_items:
        highlighted = knowledge_items[0]
        for item in knowledge_items:
            if item.term in normalized_message:
                highlighted = item
                break
        content = f"{building['name']}里和\u201c{highlighted.term}\u201d最相关的信息是：{highlighted.description}"
    else:
        content = f"{building['name']}目前的简介是：{building['description']} 如果你想，我也可以继续从结构、朝代或拍摄建议这几个角度来讲解。"

    if building["status"] != "ready":
        content += " 这座建筑目前还在补充数字档案阶段，继续贡献照片会很有帮助。"
    if fallback_notice:
        content = f"{fallback_notice}\n\n{content}"

    return ChatMessage(
        id=f"msg-{uuid4().hex[:8]}",
        role="assistant",
        content=content,
        timestamp=now_iso(),
    )
