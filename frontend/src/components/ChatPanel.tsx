import { useState } from 'react'
import { useAuth } from '../context/useAuth'
import { sendChatMessage } from '../lib/api'
import type { ChatMessage as ChatMessageType } from '../types'

const PROMPT_SUGGESTIONS = [
  '先用通俗的话概括一下这座建筑的历史背景',
  '这座建筑最值得观察的结构细节是什么？',
  '如果我继续补拍照片，应该优先拍哪些角度？',
]

function makeMessage(role: 'user' | 'assistant', content: string): ChatMessageType {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

export default function ChatPanel({ buildingId }: { buildingId: string }) {
  const { token } = useAuth()
  const [messages, setMessages] = useState<ChatMessageType[]>([
    makeMessage('assistant', '我会结合建筑档案和构件知识来讲解。你可以直接问历史背景、空间结构，或者让助手给出继续补拍照片的建议。'),
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitMessage(rawMessage: string) {
    const trimmed = rawMessage.trim()
    if (!trimmed || loading) return

    const nextUserMessage = makeMessage('user', trimmed)
    const nextHistory = [...messages, nextUserMessage]

    setMessages(nextHistory)
    setInput('')
    setError(null)
    setLoading(true)

    try {
      const reply = await sendChatMessage(buildingId, trimmed, nextHistory, token)
      setMessages((current) => [...current, reply])
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submitMessage(input)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              message.role === 'assistant'
                ? 'bg-stone-900 border border-stone-800 text-stone-200'
                : 'bg-amber-500 text-stone-950 ml-8'
            }`}
          >
            {message.content}
          </div>
        ))}

        {loading && (
          <div className="rounded-2xl border border-stone-800 bg-stone-900 px-4 py-3 text-sm text-stone-500">
            正在整理讲解内容...
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {PROMPT_SUGGESTIONS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void submitMessage(prompt)}
            disabled={loading}
            className="rounded-full border border-stone-700 bg-stone-900/70 px-3 py-2 text-xs text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder="例如：这座建筑最值得观察的结构细节是什么？"
          className="w-full resize-none rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-100 outline-none transition-colors focus:border-amber-500"
        />
        <p className="text-xs leading-relaxed text-stone-500">问历史、结构、拍摄建议都可以，支持连续追问同一座建筑。</p>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500"
        >
          发送提问
        </button>
      </form>
    </div>
  )
}
