import { useEffect, useState } from 'react'
import { fetchOverview } from '../lib/api'
import type { OverviewStats } from '../types'

const fallbackStats: OverviewStats = {
  rescuedModels: 0,
  contributedPhotos: 0,
  publicBuildings: 0,
  personalModels: 0,
  activeJobs: 0,
}

export default function AboutPage() {
  const [stats, setStats] = useState<OverviewStats>(fallbackStats)

  useEffect(() => {
    let cancelled = false

    fetchOverview()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setStats(fallbackStats)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-8 pb-16 pt-20">
      <h1 className="mb-2 text-3xl font-bold text-stone-100">关于筑忆</h1>
      <p className="mb-12 text-stone-500">让每一座古建筑都有数字生命</p>

      <section className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '已归档模型', value: stats.rescuedModels },
          { label: '众包照片', value: stats.contributedPhotos },
          { label: '公共项目', value: stats.publicBuildings },
          { label: '活跃任务', value: stats.activeJobs },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-stone-800 bg-stone-900/70 p-5">
            <p className="text-sm text-stone-500">{item.label}</p>
            <p className="mt-3 font-serif text-3xl text-gold">{item.value.toLocaleString()}</p>
          </div>
        ))}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-semibold text-amber-400">项目背景</h2>
        <p className="leading-relaxed text-stone-400">
          大量分散在乡村、街巷和山区的传统建筑并没有条件接受专业测绘，但它们同样处在快速消失的过程中。
          筑忆希望把“手机拍照、多人补充、浏览器查看”做成一条真正能跑起来的数字抢救链路。
        </p>
        <p className="mt-3 leading-relaxed text-stone-400">
          你可以在这里发起个人重建、保存自己的模型，也可以参与公共项目的照片补充，让更多建筑逐步拥有可浏览的数字档案。
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-semibold text-amber-400">使用模式</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
            <h3 className="mb-2 font-medium text-stone-100">个人重建</h3>
            <p className="text-sm leading-relaxed text-stone-500">
              用户上传同一座建筑的多角度照片，系统自动启动重建任务，生成可在浏览器漫游的三维模型，并支持一键保存到个人模型库。
            </p>
          </div>
          <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
            <h3 className="mb-2 font-medium text-stone-100">公共众包</h3>
            <p className="text-sm leading-relaxed text-stone-500">
              平台维护公共建筑项目，任何人都可以贡献照片，持续补充照片池，为后续高质量重建和知识展示打基础。
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-semibold text-amber-400">当前能力</h2>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6 text-sm text-stone-400">
          <div className="flex flex-col gap-2">
            <div>浏览古建筑档案与三维模型</div>
            <div className="text-stone-600">↓</div>
            <div>上传多角度照片并发起重建</div>
            <div className="text-stone-600">↓</div>
            <div>保存个人模型，持续补充公共项目</div>
            <div className="text-stone-600">↓</div>
            <div>在详情页查看建筑说明，并通过问答了解构件与历史背景</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-amber-400">后续方向</h2>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6 text-sm leading-relaxed text-stone-400">
          后续会继续完善项目审核、地图定位、建筑知识库和讲解体验，让平台更适合长期维护真实建筑档案。
        </div>
      </section>
    </div>
  )
}
