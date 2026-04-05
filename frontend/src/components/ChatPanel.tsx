// 预留 AI 对话面板 — MVP 显示占位提示

export default function ChatPanel({ buildingId }: { buildingId: string }) {
  void buildingId // 预留，后续传给 API
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-full bg-stone-800 flex items-center justify-center text-3xl">
        🤖
      </div>
      <div>
        <p className="text-stone-300 font-medium">AI 古建筑讲解</p>
        <p className="text-stone-500 text-sm mt-1">即将上线，敬请期待</p>
      </div>
      <div className="w-full max-w-xs">
        <input
          disabled
          placeholder="向 AI 提问古建筑知识…"
          className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-sm text-stone-500 cursor-not-allowed"
        />
      </div>
    </div>
  )
}
