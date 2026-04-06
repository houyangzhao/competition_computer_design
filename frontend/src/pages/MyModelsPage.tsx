import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchMyJobs } from '../lib/api'
import type { ReconstructionJob } from '../types'

const STATUS_LABEL: Record<ReconstructionJob['status'], string> = {
  queued: '排队中',
  extracting: '筛选图片',
  matching: 'COLMAP 重建',
  reconstructing: '3DGS 训练',
  done: '已完成',
  failed: '失败',
}

const STATUS_COLOR: Record<ReconstructionJob['status'], string> = {
  queued: 'text-stone-400',
  extracting: 'text-amber-400',
  matching: 'text-amber-400',
  reconstructing: 'text-amber-400',
  done: 'text-emerald-400',
  failed: 'text-red-400',
}

export default function MyModelsPage() {
  const { token } = useAuth()
  const [jobs, setJobs] = useState<ReconstructionJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetchMyJobs(token)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [token])

  if (!token) {
    return (
      <div className="pt-20 max-w-6xl mx-auto px-8 pb-16">
        <h1 className="text-3xl font-bold text-stone-100 mb-2">我的模型</h1>
        <p className="text-stone-500 mt-2 mb-8">你上传重建的个人古建筑三维模型</p>
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
          <span className="text-5xl opacity-20">🔒</span>
          <p className="text-stone-400">请先登录查看你的重建记录</p>
          <Link to="/" className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium rounded-full text-sm transition-colors">
            登录
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-20 max-w-6xl mx-auto px-8 pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100">我的模型</h1>
        <p className="text-stone-500 mt-2">你上传重建的个人古建筑三维模型</p>
      </div>

      {loading && <p className="text-stone-500 text-sm">加载中...</p>}

      {!loading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
          <span className="text-6xl opacity-20">🏛</span>
          <div>
            <p className="text-stone-400 font-medium">还没有重建记录</p>
            <p className="text-stone-600 text-sm mt-1">上传古建筑照片，系统自动重建三维模型</p>
          </div>
          <Link
            to="/reconstruct"
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium rounded-full text-sm transition-colors"
          >
            开始重建
          </Link>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <div key={job.id} className="bg-stone-900 border border-stone-800 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-stone-100 font-medium leading-snug">{job.buildingName}</h3>
                <span className={`text-xs shrink-0 ${STATUS_COLOR[job.status]}`}>
                  {STATUS_LABEL[job.status]}
                </span>
              </div>

              {job.status !== 'done' && job.status !== 'failed' && (
                <div className="w-full bg-stone-800 rounded-full h-1">
                  <div
                    className="bg-amber-400 h-1 rounded-full transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              )}

              <p className="text-stone-600 text-xs">{new Date(job.createdAt).toLocaleString('zh-CN')}</p>

              {job.status === 'done' && job.modelPath && (
                <Link
                  to={`/building/${job.id}`}
                  className="mt-auto text-center py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-medium rounded-lg transition-colors"
                >
                  查看模型
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
