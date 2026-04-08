import { useEffect, useState } from 'react'
import BuildingCard from '../components/BuildingCard'
import { fetchBuildings } from '../lib/api'
import type { Building } from '../types'

export default function ExplorePage() {
  const [filter, setFilter] = useState<'all' | 'ready' | 'pending'>('all')
  const [query, setQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchBuildings('public')
      .then((items) => {
        if (cancelled) return
        setBuildings(items)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '建筑档案加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = buildings.filter((building) => {
    if (filter !== 'all' && building.status !== filter) return false
    if (!normalizedQuery) return true
    return [building.name, building.location, building.dynasty].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    )
  })
  const readyCount = buildings.filter((item) => item.status === 'ready').length
  const pendingCount = buildings.filter((item) => item.status !== 'ready').length
  return (
    <div className="relative h-screen w-full overflow-hidden bg-ink pt-16">
      <div className="absolute inset-0 z-0 overflow-hidden bg-ink">
        <img
          src="/explore-bg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-ink/60" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-ink/50" />
      </div>

      <div className="pointer-events-none absolute left-8 top-24 z-20 max-w-2xl space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-ink/50 px-4 py-2 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_16px_rgba(212,175,55,0.7)]" />
            <span className="text-[10px] tracking-[0.35em] text-paper/60">数字古建档案</span>
          </div>
          <div className="space-y-2 font-serif">
            <h1 className="text-5xl font-bold tracking-[0.15em] text-paper drop-shadow-2xl">古建筑档案馆</h1>
            <p className="max-w-xl text-sm font-light leading-relaxed tracking-[0.18em] text-paper/65">
              浏览右侧建筑档案，点击进入详情页查看三维模型、讲解与构件知识卡片。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { label: '建筑档案', value: buildings.length.toString().padStart(2, '0') },
            { label: '可预览模型', value: readyCount.toString().padStart(2, '0') },
            { label: '待补充项目', value: pendingCount.toString().padStart(2, '0') },
          ].map((item) => (
            <div key={item.label} className="min-w-[150px] rounded-2xl border border-white/10 bg-ink/45 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] tracking-[0.28em] text-paper/35">{item.label}</p>
              <p className="mt-2 font-mono text-2xl text-gold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-8 left-8 z-20 w-[360px] rounded-[28px] border border-white/10 bg-ink/55 p-6 backdrop-blur-md">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] tracking-[0.28em] text-paper/40">筑忆平台</p>
            <h2 className="font-serif text-3xl text-paper">数字古建档案</h2>
            <p className="text-xs tracking-[0.22em] text-gold">
              三维高斯泼溅 · 众包采集 · AI 讲解
            </p>
          </div>

          <p className="text-sm leading-relaxed text-paper/65">
            通过众包照片与 3D Gaussian Splatting 技术，为每一座古建筑留下数字基因。点击右侧档案查看详情与三维模型。
          </p>

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: '建筑档案', value: buildings.length },
              { label: '可浏览', value: readyCount },
              { label: '待补充', value: pendingCount },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-paper/35">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-paper">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside
        className={`absolute right-0 top-16 bottom-0 z-20 transition-all duration-500 ease-in-out ${
          isSidebarOpen ? 'w-[450px]' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="flex h-full flex-col border-l border-white/5 glass-panel">
          <div className="space-y-6 p-8">
            <div className="space-y-2">
              <h1 className="font-serif text-4xl font-bold tracking-wider text-paper">
                古建筑<span className="text-gold">谱系</span>
              </h1>
              <div className="h-px w-12 bg-cinnabar" />
              <p className="text-xs font-light tracking-[0.2em] text-paper/40">
                共找到 {filtered.length} 个建筑档案
              </p>
            </div>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索建筑名称 / 地点 / 朝代"
              className="w-full rounded-xl border border-white/10 bg-ink/60 px-4 py-3 text-sm text-paper outline-none transition-colors focus:border-gold/50"
            />

            <div className="flex gap-2">
              {[
                { key: 'all', label: '全部档案' },
                { key: 'ready', label: '已完成' },
                { key: 'pending', label: '待重建' },
              ].map(({ key, label }) => {
                const isActive = filter === key
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key as typeof filter)}
                    className={`rounded-sm px-4 py-2 text-[10px] font-bold tracking-[0.1em] transition-all duration-300 ${
                      isActive
                        ? 'bg-cinnabar text-white cinnabar-glow'
                        : 'border border-white/5 bg-white/5 text-paper/40 hover:bg-white/10 hover:text-paper'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto px-8 pb-12">
            <div className="space-y-6">
              {loading && <div className="py-10 text-xs tracking-widest text-paper/30">正在加载建筑档案...</div>}
              {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
              {filtered.map((building) => (
                <BuildingCard key={building.id} building={building} />
              ))}

              {!loading && !error && filtered.length === 0 && (
                <div className="space-y-4 py-20 text-center">
                  <div className="mx-auto h-px w-12 bg-white/10" />
                  <p className="text-xs uppercase tracking-widest text-paper/20">No Records Found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <button
        onClick={() => setIsSidebarOpen((open) => !open)}
        className={`absolute top-1/2 z-30 flex h-20 w-6 -translate-y-1/2 items-center justify-center rounded-l-md border border-white/10 bg-ink/60 text-paper/40 backdrop-blur transition-all duration-500 hover:bg-ink hover:text-paper ${
          isSidebarOpen ? 'right-[450px]' : 'right-0'
        }`}
      >
        <span className="whitespace-nowrap text-[10px] tracking-[0.3em] transform -rotate-90">
          {isSidebarOpen ? 'CLOSE' : 'LIST'}
        </span>
      </button>
    </div>
  )
}
