import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { deleteMyBuilding, fetchMyBuildings } from '../lib/api'
import type { Building } from '../types'

export default function MyModelsPage() {
  const { ready, token, user } = useAuth()
  const [models, setModels] = useState<Building[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !token) return

    let cancelled = false

    fetchMyBuildings(token)
      .then((items) => {
        if (cancelled) return
        setModels(items)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '个人模型加载失败')
      })

    return () => {
      cancelled = true
    }
  }, [ready, token])

  const loading = ready && Boolean(token) && models === null && !error

  async function handleDelete(model: Building) {
    if (!token || deletingId) return
    const confirmed = window.confirm(`确定从我的模型库删除“${model.name}”吗？`)
    if (!confirmed) return

    setDeletingId(model.id)
    setError(null)
    try {
      await deleteMyBuilding(model.id, token)
      setModels((current) => current?.filter((item) => item.id !== model.id) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '模型删除失败，请稍后再试')
    } finally {
      setDeletingId(null)
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl px-8 pb-16 pt-20">
        <p className="text-stone-500">登录状态同步中...</p>
      </div>
    )
  }

  if (!user || !token) {
    return (
      <div className="mx-auto max-w-6xl px-8 pb-16 pt-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100">我的模型</h1>
          <p className="mt-2 text-stone-500">登录后即可保存和管理你自己的古建筑数字档案。</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
          <span className="text-6xl opacity-20">🏛</span>
          <div>
            <p className="font-medium text-stone-300">当前还没有登录账号</p>
            <p className="mt-1 text-sm text-stone-600">先去注册或登录，再把重建完成的模型保存进个人模型库。</p>
          </div>
          <Link
            to="/reconstruct"
            className="rounded-full bg-amber-500 px-6 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-amber-400"
          >
            先去创建重建任务
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-8 pb-16 pt-20">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-100">我的模型</h1>
          <p className="mt-2 text-stone-500">这里会展示你保存下来的个人古建筑三维模型与封面图。</p>
        </div>
        <Link
          to="/reconstruct"
          className="rounded-full bg-amber-500 px-6 py-2.5 text-center text-sm font-medium text-stone-950 transition-colors hover:bg-amber-400"
        >
          新建重建任务
        </Link>
      </div>

      {loading && <p className="text-stone-500">正在加载你的模型库...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && (models?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
          <span className="text-6xl opacity-20">🏛</span>
          <div>
            <p className="font-medium text-stone-400">还没有保存的模型</p>
            <p className="mt-1 text-sm text-stone-600">完成一次重建后点击“保存到我的模型”，这里就会自动出现你的个人档案。</p>
          </div>
        </div>
      )}

      {!loading && !error && (models?.length ?? 0) > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {models?.map((model) => (
            <article
              key={model.id}
              className="group overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/70 transition-all hover:border-gold/40 hover:shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
            >
              <Link to={`/building/${model.id}`} className="block">
                <div className="aspect-[4/3] overflow-hidden bg-stone-950">
                  {model.coverImage ? (
                    <img
                      src={model.coverImage}
                      alt={model.name}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl text-stone-700">🏛</div>
                  )}
                </div>
                <div className="space-y-3 p-5 pb-4">
                  <div>
                    <p className="font-serif text-2xl text-stone-100">{model.name}</p>
                    <p className="mt-1 text-sm text-stone-500">{model.description}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-stone-500">
                    <span>{model.photoCount} Photos</span>
                    <span>{model.updatedAt?.slice(0, 10) || model.createdAt?.slice(0, 10) || 'Archived'}</span>
                  </div>
                </div>
              </Link>
              <div className="border-t border-stone-800/80 px-5 py-4">
                <button
                  onClick={() => void handleDelete(model)}
                  disabled={deletingId === model.id}
                  className="w-full rounded-lg border border-red-500/20 bg-red-500/10 py-2.5 text-sm font-medium text-red-300 transition-colors hover:border-red-400/40 hover:bg-red-500/15 disabled:border-stone-800 disabled:bg-stone-900 disabled:text-stone-600"
                >
                  {deletingId === model.id ? '删除中...' : '从模型库删除'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
