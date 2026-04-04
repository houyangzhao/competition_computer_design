import type { ReconstructionJob } from '../types'

const stages: { key: ReconstructionJob['status']; label: string }[] = [
  { key: 'queued', label: '排队中' },
  { key: 'extracting', label: '提取特征' },
  { key: 'matching', label: '匹配图像' },
  { key: 'reconstructing', label: '三维重建' },
  { key: 'done', label: '完成' },
]

const stageIndex = (status: ReconstructionJob['status']) =>
  stages.findIndex((s) => s.key === status)

export default function ReconstructProgress({ job }: { job: ReconstructionJob }) {
  const currentIdx = stageIndex(job.status)

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      {/* 旋转动画 */}
      {job.status !== 'done' && job.status !== 'failed' && (
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-stone-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-amber-400 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-2xl">🏛</div>
        </div>
      )}

      {job.status === 'done' && (
        <div className="w-24 h-24 rounded-full bg-emerald-900/30 border-2 border-emerald-500 flex items-center justify-center text-4xl">
          ✓
        </div>
      )}

      {job.status === 'failed' && (
        <div className="w-24 h-24 rounded-full bg-red-900/30 border-2 border-red-500 flex items-center justify-center text-4xl">
          ✗
        </div>
      )}

      {/* 阶段指示器 */}
      <div className="flex items-center gap-2">
        {stages.map((stage, idx) => (
          <div key={stage.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-3 h-3 rounded-full transition-colors ${
                  idx < currentIdx
                    ? 'bg-emerald-500'
                    : idx === currentIdx
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-stone-700'
                }`}
              />
              <span
                className={`text-xs whitespace-nowrap ${
                  idx === currentIdx ? 'text-amber-400' : 'text-stone-600'
                }`}
              >
                {stage.label}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <div className={`w-8 h-px mb-4 ${idx < currentIdx ? 'bg-emerald-500' : 'bg-stone-700'}`} />
            )}
          </div>
        ))}
      </div>

      {/* 进度条 */}
      <div className="w-64">
        <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <p className="text-center text-stone-500 text-sm mt-2">{job.progress}%</p>
      </div>

      <p className="text-stone-400 text-sm">
        {job.status === 'done'
          ? '重建完成！'
          : job.status === 'failed'
          ? '重建失败，请重试'
          : 'COLMAP 正在自动估计相机位姿并重建三维模型…'}
      </p>
    </div>
  )
}
