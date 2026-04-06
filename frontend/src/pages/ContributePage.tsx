import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { contributePhotos, fetchBuilding } from '../lib/api'
import type { Building } from '../types'

export default function ContributePage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()
  const [building, setBuilding] = useState<Building | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('未提供项目编号')
      return
    }

    let cancelled = false

    fetchBuilding(id, token)
      .then((item) => {
        if (cancelled) return
        setBuilding(item)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '项目加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, token])

  function handleFiles(files: FileList | null) {
    if (!files) return
    setPhotos((current) => [...current, ...Array.from(files)])
    setSuccess(null)
  }

  async function handleSubmit() {
    if (!id || photos.length === 0) {
      setError('请先选择要上传的照片')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await contributePhotos(id, photos, token)
      setSuccess(`本次成功上传 ${result.received} 张照片。项目累计贡献 ${result.totalContributions} 次，照片总数 ${result.totalPhotos} 张。`)
      setPhotos([])
      const refreshed = await fetchBuilding(id, token)
      setBuilding(refreshed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-20">
        <p className="text-stone-500">项目加载中...</p>
      </div>
    )
  }

  if (!building) {
    return (
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-20">
        <p className="text-red-400">{error || '未找到该众包项目'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-8 pb-16 pt-20">
      <Link to={`/building/${building.id}`} className="text-sm text-stone-500 transition-colors hover:text-amber-400">
        ← 返回建筑详情
      </Link>

      <div className="mb-8 mt-6">
        <h1 className="text-3xl font-bold text-stone-100">众包贡献</h1>
        <p className="mt-1 text-amber-400">{building.name}</p>
        <p className="mt-2 text-stone-500">
          为公共大型古建筑项目贡献照片，共同构建更完整的三维数字档案。当前项目已累计 {building.contributionCount} 次贡献、{building.photoCount} 张照片。
        </p>
      </div>

      <div className="mb-8 rounded-xl border border-stone-800 bg-stone-900 p-6">
        <h3 className="mb-3 font-medium text-stone-100">拍摄要求</h3>
        <ul className="space-y-2 text-sm text-stone-400">
          <li>• 相邻照片重叠率尽量保持在 70% 以上。</li>
          <li>• 建议补充入口、转角、檐口、台基等斜向细节照片。</li>
          <li>• 保持曝光稳定，避免强阴影、逆光和明显模糊。</li>
          <li>• 如果是大型建筑，请分段环绕拍摄，保证视角连续。</li>
        </ul>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          handleFiles(event.dataTransfer.files)
        }}
        className="flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed border-stone-700 p-16 text-center transition-colors hover:border-amber-500"
      >
        <span className="text-4xl">📷</span>
        <p className="text-stone-300">点击或拖拽上传你的众包照片</p>
        <p className="text-sm text-stone-600">支持批量上传，未登录也可参与，但登录后更方便追踪自己的贡献记录。</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {photos.length > 0 && (
        <div className="mt-6 rounded-xl border border-stone-800 bg-stone-900/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-stone-300">待上传 {photos.length} 张照片</p>
            <button
              onClick={() => setPhotos([])}
              className="text-xs text-stone-500 transition-colors hover:text-stone-300"
            >
              清空列表
            </button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-2">
            {photos.map((photo) => (
              <div key={`${photo.name}-${photo.size}`} className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-400">
                {photo.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-6 text-sm text-emerald-400">{success}</p>}

      <button
        onClick={handleSubmit}
        disabled={photos.length === 0 || submitting}
        className="mt-6 w-full rounded-xl bg-amber-500 py-3 font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500"
      >
        {submitting ? '上传中...' : '提交众包照片'}
      </button>
    </div>
  )
}
