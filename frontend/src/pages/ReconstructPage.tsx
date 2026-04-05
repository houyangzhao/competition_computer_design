import { useEffect, useRef, useState } from 'react'
import ReconstructProgress from '../components/ReconstructProgress'
import SplatViewer from '../components/SplatViewer'
import type { ReconstructionJob } from '../types'
import { fetchJobStatus, submitReconstruction } from '../lib/api'
import { useAuth } from '../context/AuthContext'

type Step = 'upload' | 'processing' | 'done'

export default function ReconstructPage() {
  const { token } = useAuth()
  const [step, setStep] = useState<Step>('upload')
  const [buildingName, setBuildingName] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<ReconstructionJob>({
    id: '',
    buildingName: '',
    status: 'queued',
    progress: 0,
    createdAt: '',
    modelPath: null,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step !== 'processing' || !job.id) return
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchJobStatus(job.id)
        setJob(next)
        if (next.status === 'done') {
          window.clearInterval(timer)
          setStep('done')
        }
        if (next.status === 'failed') {
          window.clearInterval(timer)
          setError('重建任务失败')
          setStep('upload')
        }
      } catch {
        window.clearInterval(timer)
        setError('重建进度获取失败')
        setStep('upload')
      }
    }, 1200)
    return () => window.clearInterval(timer)
  }, [job.id, step])

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    setPhotos((prev) => [...prev, ...Array.from(files)])
  }

  const handleSubmit = async () => {
    if (!buildingName.trim() || photos.length === 0) return
    setError(null)
    setStep('processing')
    try {
      const created = await submitReconstruction(buildingName, photos, token)
      setJob(created)
    } catch {
      setStep('upload')
      setError('重建任务提交失败')
    }
  }

  return (
    <div className="pt-20 max-w-3xl mx-auto px-8 pb-16">
      <h1 className="text-3xl font-bold text-stone-100 mb-2">上传重建</h1>
      <p className="text-stone-500 mb-10">拍摄建筑多角度照片，前端会真实提交到后端并轮询重建任务进度，当前测试环境支持先用 3 张图片快速验证流程。</p>

      <div className="flex items-center gap-3 mb-10">
        {['上传照片', '自动重建', '查看结果'].map((label, idx) => {
          const stepMap: Step[] = ['upload', 'processing', 'done']
          const active = stepMap[idx] === step
          const done = stepMap.indexOf(step) > idx
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-500'
                  }`}
                >
                  {done ? '✓' : idx + 1}
                </div>
                <span className={`text-sm ${active ? 'text-amber-400' : done ? 'text-emerald-400' : 'text-stone-600'}`}>{label}</span>
              </div>
              {idx < 2 && <div className="w-8 h-px bg-stone-800" />}
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <div className="flex flex-col gap-6">
          <div>
            <label className="block text-sm text-stone-400 mb-2">建筑名称</label>
            <input
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              placeholder="例如：岳麓书院大门"
              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-3 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFiles(e.dataTransfer.files)
            }}
            className="border-2 border-dashed border-stone-700 hover:border-amber-500 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
          >
            <span className="text-4xl">📷</span>
            <p className="text-stone-400 text-sm">点击或拖拽上传照片</p>
            <p className="text-stone-600 text-xs">支持 JPG/PNG，当前已接入真实后端重建流程，测试时可先上传 3 张图片快速验证。</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {photos.length > 0 && (
            <div>
              <p className="text-stone-400 text-sm mb-3">已选择 {photos.length} 张照片</p>
              <div className="grid grid-cols-6 gap-2">
                {photos.slice(0, 12).map((f, i) => (
                  <div key={i} className="aspect-square bg-stone-800 rounded-lg overflow-hidden">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
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

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!buildingName.trim() || photos.length === 0}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold rounded-lg transition-colors"
          >
            开始重建
          </button>
        </div>
      )}

      {step === 'processing' && <ReconstructProgress job={job} />}

      {step === 'done' && job.modelPath && (
        <div className="flex flex-col gap-6">
          <div className="h-96 rounded-xl overflow-hidden border border-stone-800">
            <SplatViewer modelPath={job.modelPath} />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep('upload')
                setPhotos([])
                setBuildingName('')
                setJob({ id: '', buildingName: '', status: 'queued', progress: 0, createdAt: '', modelPath: null })
              }}
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
