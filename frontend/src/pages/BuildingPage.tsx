import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel'
import KnowledgeCard from '../components/KnowledgeCard'
import SplatViewer from '../components/SplatViewer'
import { useAuth } from '../context/useAuth'
import { fetchBuilding, fetchBuildingKnowledge } from '../lib/api'
import type { Building, KnowledgeItem } from '../types'

export default function BuildingPage() {
  const { id } = useParams<{ id: string }>()
  const buildingId = id ?? ''
  const { token } = useAuth()
  const [building, setBuilding] = useState<Building | null>(null)
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(Boolean(buildingId))
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge'>('knowledge')
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!buildingId) return

    let cancelled = false

    Promise.all([fetchBuilding(buildingId, token), fetchBuildingKnowledge(buildingId, token)])
      .then(([buildingData, knowledgeData]) => {
        if (cancelled) return
        setBuilding(buildingData)
        setKnowledgeItems(knowledgeData)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '建筑档案加载失败')
        setBuilding(null)
        setKnowledgeItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [buildingId, token])

  if (!buildingId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-ink pt-20 text-paper/40">
        <p className="font-serif text-xl">未提供建筑编号</p>
        <Link to="/explore" className="mt-4 text-sm tracking-widest text-gold hover:underline">
          返回探索
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-ink pt-20 text-paper/40">
        <p className="font-serif text-xl">建筑档案加载中</p>
      </div>
    )
  }

  if (!building) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-ink pt-20 text-paper/40">
        <p className="font-serif text-xl">{error || '未找到该建筑档案'}</p>
        <Link to="/explore" className="mt-4 text-sm tracking-widest text-gold hover:underline">
          返回探索
        </Link>
      </div>
    )
  }

  const badges = [
    { label: '朝代', value: building.dynasty },
    { label: '照片', value: building.photoCount.toLocaleString() },
    { label: '贡献', value: building.contributionCount.toLocaleString() },
  ]

  return (
    <div className="relative h-screen w-full overflow-hidden bg-ink">
      <div className="absolute inset-0 z-0">
        {building.status === 'ready' && building.modelPath ? (
          <SplatViewer
            modelPath={building.modelPath}
            initialCameraPosition={[2, -1.5, -2]}
            initialCameraLookAt={[0, 0, 0]}
          />
        ) : (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-stone-900/60 backdrop-blur-sm">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-cinnabar/30 bg-cinnabar/20 animate-pulse">
              <span className="text-4xl">🏛</span>
            </div>
            <div className="space-y-2 text-center">
              <p className="font-serif text-xl tracking-widest text-paper/80">数字基因仍在补全</p>
              <p className="text-xs font-light uppercase tracking-widest text-paper/40">
                This archive still needs more photos
              </p>
            </div>
            {building.type === 'public' ? (
              <Link
                to={`/contribute/${building.id}`}
                className="rounded-sm bg-cinnabar px-8 py-3 text-xs font-bold tracking-[0.2em] text-white transition-all gold-border cinnabar-glow"
              >
                贡献照片 / 参与众包
              </Link>
            ) : (
              <Link
                to="/reconstruct"
                className="rounded-sm bg-cinnabar px-8 py-3 text-xs font-bold tracking-[0.2em] text-white transition-all gold-border cinnabar-glow"
              >
                重新上传 / 再次重建
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-ink/80 to-transparent" />

      <div
        className={`pointer-events-none absolute left-8 bottom-8 z-20 max-w-lg transition-all duration-700 ${
          isPanelOpen ? 'opacity-100' : 'translate-y-4 opacity-40'
        }`}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <h1 className="font-serif text-5xl font-bold tracking-wider text-paper drop-shadow-2xl">{building.name}</h1>
              <div className="flex items-center gap-4">
                <span className="font-serif text-lg tracking-widest text-gold">{building.location}</span>
                <div className="h-px w-8 bg-white/20" />
                <span className="text-xs font-light uppercase tracking-[0.2em] text-paper/60">
                  {building.type === 'public' ? 'PUBLIC ARCHIVE' : 'PERSONAL ARCHIVE'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pointer-events-auto">
              {badges.map((badge) => (
                <div key={badge.label} className="rounded-full border border-white/10 bg-ink/50 px-3 py-1 text-xs text-paper/60">
                  {badge.label}: <span className="text-paper">{badge.value}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="rounded-sm border-l border-cinnabar/40 bg-ink/40 p-4 text-sm font-light leading-relaxed tracking-widest text-paper/40 backdrop-blur-sm">
            {building.description}
          </p>
        </div>
      </div>

      <div
        className={`absolute right-0 top-16 bottom-0 z-30 transition-all duration-500 ease-in-out ${
          isPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full w-96 flex-col border-l border-white/5 glass-panel">
          <div className="flex border-b border-white/5">
            {[
              { key: 'knowledge', label: '建筑构件知识' },
              { key: 'chat', label: '讲解问答助手' },
            ].map(({ key, label }) => {
              const isActive = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={`flex-1 border-b py-5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${
                    isActive
                      ? 'border-gold bg-white/5 text-gold'
                      : 'border-transparent text-paper/30 hover:bg-white/5 hover:text-paper'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
            {activeTab === 'knowledge' ? (
              knowledgeItems.length > 0 ? (
                <div className="space-y-4">
                  {knowledgeItems.map((item) => (
                    <KnowledgeCard key={item.term} item={item} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-white/5 p-5 text-sm text-paper/50">
                  暂时还没有录入这座建筑的构件知识，但你已经可以通过右侧问答助手继续提问。
                </div>
              )
            ) : (
              <ChatPanel buildingId={building.id} />
            )}
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsPanelOpen((open) => !open)}
        className={`absolute right-4 top-1/2 z-40 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full glass-panel text-paper/40 transition-all duration-300 hover:text-gold ${
          isPanelOpen ? 'rotate-0' : 'rotate-180 translate-x-2'
        }`}
      >
        <span className="text-xs tracking-tighter">{isPanelOpen ? '→' : '←'}</span>
      </button>
    </div>
  )
}
