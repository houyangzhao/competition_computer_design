import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SplatViewer from '../components/SplatViewer'
import { fetchOverview } from '../lib/api'
import type { OverviewStats } from '../types'

const fallbackStats: OverviewStats = {
  rescuedModels: 1284,
  contributedPhotos: 42900,
  publicBuildings: 28,
  personalModels: 0,
  activeJobs: 0,
}

export default function HomePage() {
  const [stats, setStats] = useState<OverviewStats>(fallbackStats)

  useEffect(() => {
    let cancelled = false

    fetchOverview()
      .then((next) => {
        if (!cancelled) setStats(next)
      })
      .catch(() => {
        if (!cancelled) setStats(fallbackStats)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const items = [
    { label: '已抢救模型', value: stats.rescuedModels.toLocaleString() },
    { label: '众包照片', value: `${stats.contributedPhotos.toLocaleString()}+` },
    { label: '公共项目', value: stats.publicBuildings.toLocaleString() },
  ]

  return (
    <div className="relative h-screen w-full overflow-hidden bg-ink">
      <div className="absolute inset-0 z-0">
        <SplatViewer
          modelPath="/models/bonsai.splat"
          initialCameraPosition={[2, -1.5, -2]}
          initialCameraLookAt={[0, 0, 0]}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-ink via-transparent to-ink/20" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(10,12,13,0.45)_100%)]" />

      <div className="relative z-20 flex h-full flex-col items-center justify-center px-6">
        <div className="pointer-events-auto w-full max-w-4xl space-y-8 text-center">
          <div className="animate-in slide-in-from-bottom-8 space-y-4 fade-in duration-1000">
            <h1 className="font-serif text-8xl font-bold tracking-[0.4em] text-paper drop-shadow-2xl md:text-9xl">
              筑<span className="text-cinnabar">忆</span>
            </h1>
            <div className="mx-auto h-px w-24 bg-gold/40" />
            <p className="font-serif text-xl uppercase tracking-[0.3em] text-paper/80 md:text-2xl">
              濒危古建筑数字抢救平台
            </p>
          </div>

          <p className="mx-auto max-w-2xl text-sm font-light leading-relaxed tracking-[0.25em] text-paper/55 md:text-base">
            用手机拍摄古建筑多角度照片，系统自动进行三维重建、生成数字档案，并支持公共项目众包采集与浏览器漫游展示。
          </p>

          <div className="animate-in flex flex-col items-center justify-center gap-6 pt-8 fade-in duration-1000 delay-500 sm:flex-row">
            <Link
              to="/explore"
              className="group relative overflow-hidden rounded-sm bg-cinnabar/90 px-10 py-4 text-sm font-bold tracking-[0.3em] text-white transition-all gold-border cinnabar-glow hover:bg-cinnabar"
            >
              <span className="relative z-10">探索数字档案</span>
              <div className="absolute inset-0 translate-y-full bg-white/10 transition-transform duration-300 group-hover:translate-y-0" />
            </Link>
            <Link
              to="/reconstruct"
              className="rounded-sm border border-white/10 px-10 py-4 text-sm font-bold tracking-[0.3em] text-paper/80 transition-all glass-panel hover:bg-white/5 hover:text-paper"
            >
              开始图像重建
            </Link>
          </div>
        </div>

        <div className="pointer-events-auto absolute bottom-12 left-0 right-0 hidden px-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700 lg:block">
          <div className="mx-auto flex max-w-7xl items-end justify-between border-t border-white/5 pt-8">
            <div className="flex gap-16">
              {items.map((stat) => (
                <div key={stat.label} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-paper/40">{stat.label}</p>
                  <p className="font-serif text-2xl tracking-tighter text-gold">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="text-right">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-paper/40">交互指南</p>
              <div className="flex gap-4 font-mono text-[10px] tracking-widest text-paper/60">
                <span>ROTATE: MOUSE L</span>
                <span className="my-auto h-1 w-1 rounded-full bg-white/20" />
                <span>ZOOM: SCROLL</span>
                <span className="my-auto h-1 w-1 rounded-full bg-white/20" />
                <span>PAN: MOUSE R</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-40 bg-gradient-to-b from-ink/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-40 bg-gradient-to-t from-ink/80 to-transparent" />
    </div>
  )
}
