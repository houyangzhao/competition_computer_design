import { useState, useRef } from 'react'
import ReconstructProgress from '../components/ReconstructProgress'
import SplatViewer from '../components/SplatViewer'
import type { ReconstructionJob } from '../types'

type Step = 'upload' | 'processing' | 'done'

// Mock 重建进度序列（后续替换为真实 API 轮询）
const mockProgress = async (
  onUpdate: (job: ReconstructionJob) => void
): Promise<void> => {
  const stages: Array<{ status: ReconstructionJob['status']; progress: number; delay: number }> = [
    { status: 'queued', progress: 5, delay: 800 },
    { status: 'extracting', progress: 20, delay: 1500 },
    { status: 'extracting', progress: 40, delay: 1500 },
    { status: 'matching', progress: 55, delay: 1500 },
    { status: 'matching', progress: 70, delay: 1500 },
    { status: 'reconstructing', progress: 82, delay: 2000 },
    { status: 'reconstructing', progress: 93, delay: 2000 },
    { status: 'done', progress: 100, delay: 500 },
  ]
  for (const s of stages) {
    await new Promise((r) => setTimeout(r, s.delay))
    onUpdate({ id: 'demo-job', buildingName: '', status: s.status, progress: s.progress, createdAt: '', modelPath: s.status === 'done' ? '/models/bonsai.splat' : null })
  }
}

export default function ReconstructPage() {
  const [step, setStep] = useState<Step>('upload')
  const [buildingName, setBuildingName] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [job, setJob] = useState<ReconstructionJob>({
    id: '', buildingName: '', status: 'queued', progress: 0, createdAt: '', modelPath: null,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    setPhotos((prev) => [...prev, ...Array.from(files)])
  }

  const handleSubmit = async () => {
    if (!buildingName.trim() || photos.length < 20) return
    setStep('processing')
    setJob((j) => ({ ...j, buildingName, status: 'queued', progress: 0 }))
    await mockProgress((updated) => setJob(updated))
    setStep('done')
  }

  return (
    <div className="pt-20 max-w-3xl mx-auto px-8 pb-16">
      <h1 className="text-3xl font-bold text-stone-100 mb-2">上传重建</h1>
      <p className="text-stone-500 mb-10">
        拍摄建筑多角度照片（至少20张，保持70%重叠），系统自动重建三维模型
      </p>

      {/* 步骤指示器 */}
      <div className="flex items-center gap-3 mb-10">
        {['上传照片', '自动重建', '查看结果'].map((label, idx) => {
          const stepMap: Step[] = ['upload', 'processing', 'done']
          const active = stepMap[idx] === step
          const done = stepMap.indexOf(step) > idx
          return (
            <div key={label} className="flex items-center gap-3">
              <div className={`flex items-center gap-2`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-500'
                }`}>
                  {done ? '✓' : idx + 1}
                </div>
                <span className={`text-sm ${active ? 'text-amber-400' : done ? 'text-emerald-400' : 'text-stone-600'}`}>
                  {label}
                </span>
              </div>
              {idx < 2 && <div className="w-8 h-px bg-stone-800" />}
            </div>
          )
        })}
      </div>

      {/* 上传步骤 */}
      {step === 'upload' && (
        <div className="flex flex-col gap-6">
          <div>
            <label className="block text-sm text-stone-400 mb-2">建筑名称</label>
            <input
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              placeholder="例：岳麓书院大门"
              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-3 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* 拖拽上传区 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
            className="border-2 border-dashed border-stone-700 hover:border-amber-500 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
          >
            <span className="text-4xl">📷</span>
            <p className="text-stone-400 text-sm">点击或拖拽上传照片</p>
            <p className="text-stone-600 text-xs">支持 JPG/PNG，建议50-100张，每张不超过10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {/* 照片预览网格 */}
          {photos.length > 0 && (
            <div>
              <p className="text-stone-400 text-sm mb-3">已选择 {photos.length} 张照片</p>
              <div className="grid grid-cols-6 gap-2">
                {photos.slice(0, 12).map((f, i) => (
                  <div key={i} className="aspect-square bg-stone-800 rounded-lg overflow-hidden">
                    <img
                      src={URL.createObjectURL(f)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {photos.length > 12 && (
                  <div className="aspect-square bg-stone-800 rounded-lg flex items-center justify-center text-stone-500 text-sm">
                    +{photos.length - 12}
                  </div>
                )}
              </div>
            </div>
          )}

          {photos.length > 0 && photos.length < 20 && (
            <p className="text-amber-500 text-sm">建议至少上传20张照片以保证重建质量（当前{photos.length}张）</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!buildingName.trim() || photos.length === 0}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold rounded-lg transition-colors"
          >
            开始重建
          </button>
        </div>
      )}

      {/* 重建等待步骤 */}
      {step === 'processing' && <ReconstructProgress job={job} />}

      {/* 完成步骤 */}
      {step === 'done' && job.modelPath && (
        <div className="flex flex-col gap-6">
          <div className="h-96 rounded-xl overflow-hidden border border-stone-800">
            <SplatViewer modelPath={job.modelPath} />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep('upload'); setPhotos([]); setBuildingName('') }}
              className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-100 rounded-lg text-sm transition-colors"
            >
              重建另一个
            </button>
            <button className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg transition-colors">
              保存到我的模型
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
