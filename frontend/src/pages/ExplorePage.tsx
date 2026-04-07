import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BuildingCard from '../components/BuildingCard'
import SplatViewer from '../components/SplatViewer'
import { fetchBuildings } from '../lib/api'
import type { Building } from '../types'

const SAMPLE_PREVIEW_MODEL = '/models/bonsai.splat'

export default function ExplorePage() {
  const [filter, setFilter] = useState<'all' | 'ready' | 'pending'>('all')
  const [query, setQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
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
  const previewBuilding =
    filtered.find((building) => building.id === previewId && building.status === 'ready' && building.modelPath) ??
    buildings.find((building) => building.id === previewId && building.status === 'ready' && building.modelPath) ??
    filtered.find((building) => building.status === 'ready' && building.modelPath) ??
    buildings.find((building) => building.status === 'ready' && building.modelPath) ??
    null
  const previewModelPath = previewBuilding?.modelPath ?? SAMPLE_PREVIEW_MODEL

  return (
    <div className="relative h-screen w-full overflow-hidden bg-ink pt-16">
      <div className="absolute inset-0 z-0 overflow-hidden bg-ink">
        <SplatViewer
          modelPath={previewModelPath}
          className="opacity-80"
          initialCameraPosition={[2.2, -1.8, -2.4]}
          initialCameraLookAt={[0, 0, 0]}
        />

        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle, #d4af37 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 h-[2px] w-full bg-gradient-to-r from-transparent via-gold/20 to-transparent animate-[scan_8s_linear_infinite]" />
        </div>

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-1/4 h-2 w-2 rounded-full bg-cinnabar/40 blur-[2px]" />
          <div className="absolute bottom-1/3 right-1/4 h-2 w-2 rounded-full bg-gold/40 blur-[2px]" />
          <div className="absolute left-16 top-14 h-72 w-72 rounded-full bg-cinnabar/10 blur-3xl" />
          <div className="absolute bottom-10 right-[28rem] h-96 w-96 rounded-full bg-gold/10 blur-3xl" />
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/40 to-ink/90" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/85 via-transparent to-ink/80" />
      </div>

      <div className="pointer-events-none absolute left-8 top-24 z-20 max-w-2xl space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-ink/50 px-4 py-2 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_16px_rgba(212,175,55,0.7)]" />
            <span className="text-[10px] tracking-[0.35em] text-paper/60">沉浸式古建预览</span>
          </div>
          <div className="space-y-2 font-serif">
            <h1 className="text-5xl font-bold tracking-[0.15em] text-paper drop-shadow-2xl">古建筑探索场</h1>
            <p className="max-w-xl text-sm font-light leading-relaxed tracking-[0.18em] text-paper/65">
              悬停右侧已完成的建筑档案可以切换三维预览，进入详情页后还能继续查看讲解与构件知识卡片。
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
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[10px] tracking-[0.28em] text-paper/40">当前预览</p>
              <h2 className="font-serif text-3xl text-paper">{previewBuilding?.name ?? '平台示例模型'}</h2>
              <p className="text-xs uppercase tracking-[0.22em] text-gold">
                {previewBuilding ? `${previewBuilding.location} · ${previewBuilding.dynasty}` : '平台示例模型'}
              </p>
            </div>
            <div className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-gold">
              可预览
            </div>
          </div>

          <p className="text-sm leading-relaxed text-paper/65">
            {previewBuilding
              ? previewBuilding.description
              : '当前展示的是平台内置的示例模型，你可以用鼠标拖拽观察细节。'}
          </p>

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: '照片', value: previewBuilding ? previewBuilding.photoCount : 240 },
              { label: '贡献', value: previewBuilding ? previewBuilding.contributionCount : 12 },
              { label: '状态', value: previewBuilding ? (previewBuilding.status === 'ready' ? '完成' : '待补充') : '演示' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-paper/35">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-paper">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
            <p className="text-xs leading-relaxed text-paper/45">操作提示：鼠标拖拽旋转、滚轮缩放，右侧悬停已完成档案可切换当前预览。</p>
            {previewBuilding && (
              <Link
                to={`/building/${previewBuilding.id}`}
                className="pointer-events-auto rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-gold transition-colors hover:bg-gold/20"
              >
                进入档案
              </Link>
            )}
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
                <div
                  key={building.id}
                  onMouseEnter={() => {
                    if (building.status === 'ready' && building.modelPath) {
                      setPreviewId(building.id)
                    }
                  }}
                  className={`rounded-sm transition-all duration-300 ${
                    previewBuilding?.id === building.id ? 'shadow-[0_0_0_1px_rgba(212,175,55,0.45),0_0_28px_rgba(212,175,55,0.08)]' : ''
                  }`}
                >
                  <BuildingCard building={building} />
                </div>
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
