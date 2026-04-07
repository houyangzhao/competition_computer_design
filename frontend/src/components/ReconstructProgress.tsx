import type { ReconstructionJob } from '../types'

const stages: { key: ReconstructionJob['status']; label: string }[] = [
  { key: 'queued', label: '排队中' },
  { key: 'extracting', label: '筛选照片' },
  { key: 'matching', label: '匹配图像' },
  { key: 'reconstructing', label: '三维重建' },
  { key: 'done', label: '完成' },
]

function stageIndex(status: ReconstructionJob['status']) {
  return stages.findIndex((stage) => stage.key === status)
}

export default function ReconstructProgress({ job }: { job: ReconstructionJob }) {
  const currentIdx = stageIndex(job.status)
  const sourcePhotoCount = typeof job.photoCount === 'number' ? job.photoCount : 0
  const selectedPhotoCount = typeof job.selectedCount === 'number' ? job.selectedCount : null
  const helperText =
    job.status === 'done'
      ? '重建完成，现在可以预览结果并选择保存到个人模型库。'
      : job.status === 'failed'
      ? job.error || '重建失败，请稍后重试。'
      : job.status === 'extracting'
      ? '系统正在筛选清晰、连续的照片。'
      : job.status === 'matching'
      ? '系统正在对齐不同角度的照片。'
      : '系统正在生成可浏览的三维模型，请稍等片刻。'

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      {job.status !== 'done' && job.status !== 'failed' && (
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 rounded-full border-4 border-stone-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-amber-400 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-2xl">🏛</div>
        </div>
      )}

      {job.status === 'done' && (
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-900/30 text-4xl">
          ✓
        </div>
      )}

      {job.status === 'failed' && (
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-red-500 bg-red-900/30 text-4xl">
          ✗
        </div>
      )}

      <div className="flex items-center gap-2">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`h-3 w-3 rounded-full transition-colors ${
                  index < currentIdx ? 'bg-emerald-500' : index === currentIdx ? 'bg-amber-400 animate-pulse' : 'bg-stone-700'
                }`}
              />
              <span className={`whitespace-nowrap text-xs ${index === currentIdx ? 'text-amber-400' : 'text-stone-600'}`}>
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div className={`mb-4 h-px w-8 ${index < currentIdx ? 'bg-emerald-500' : 'bg-stone-700'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="w-72">
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-800">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
          <span>{job.progress}%</span>
          <span>{selectedPhotoCount !== null ? `${selectedPhotoCount} 张进入重建` : `${sourcePhotoCount} 张原始照片`}</span>
        </div>
      </div>

      <p className="max-w-md text-center text-sm text-stone-400">{helperText}</p>
    </div>
  )
}
