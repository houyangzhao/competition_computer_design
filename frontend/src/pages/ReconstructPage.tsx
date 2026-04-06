import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReconstructProgress from '../components/ReconstructProgress'
import SplatViewer from '../components/SplatViewer'
import { useAuth } from '../context/useAuth'
import { createAdminProject, deleteAdminProject, fetchBuildings, fetchJobStatus, saveReconstructionJob, submitReconstruction } from '../lib/api'
import type { AdminProjectInput, Building, ReconstructionJob } from '../types'

type Step = 'upload' | 'processing' | 'done'

const STORAGE_KEY = 'zhuy_reconstruction_session'

const emptyJob: ReconstructionJob = {
  id: '',
  buildingName: '',
  status: 'queued',
  progress: 0,
  createdAt: '',
  modelPath: null,
  error: null,
  savedBuildingId: null,
  photoCount: 0,
  selectedCount: null,
  targetBuildingId: null,
}

interface PersistedReconstructionState {
  step: Step
  buildingName: string
  job: ReconstructionJob
  savedBuilding: Building | null
}

function normalizeJob(raw: Partial<ReconstructionJob> | null | undefined): ReconstructionJob {
  return {
    ...emptyJob,
    ...raw,
    photoCount: typeof raw?.photoCount === 'number' ? raw.photoCount : 0,
    progress: typeof raw?.progress === 'number' ? raw.progress : 0,
    selectedCount: typeof raw?.selectedCount === 'number' ? raw.selectedCount : null,
  }
}

function loadPersistedState(): PersistedReconstructionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedReconstructionState>
    if (!parsed?.job?.id) return null
    return {
      step: parsed.step === 'processing' || parsed.step === 'done' ? parsed.step : 'upload',
      buildingName: typeof parsed.buildingName === 'string' ? parsed.buildingName : '',
      job: normalizeJob(parsed.job),
      savedBuilding: parsed.savedBuilding ?? null,
    }
  } catch {
    return null
  }
}

function clearPersistedState() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export default function ReconstructPage() {
  const persistedState = loadPersistedState()
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const [step, setStep] = useState<Step>(persistedState?.job?.id ? persistedState.step : 'upload')
  const [buildingName, setBuildingName] = useState(persistedState?.buildingName ?? '')
  const [photos, setPhotos] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedBuilding, setSavedBuilding] = useState<Building | null>(persistedState?.savedBuilding ?? null)
  const [job, setJob] = useState<ReconstructionJob>(persistedState?.job?.id ? normalizeJob(persistedState.job) : emptyJob)
  const [publicProjects, setPublicProjects] = useState<Building[]>([])
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null)
  const [adminSubmitting, setAdminSubmitting] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<string>('')
  const [projectForm, setProjectForm] = useState<AdminProjectInput>({
    name: '',
    dynasty: '',
    location: '',
    description: '',
    latitude: 0,
    longitude: 0,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const nextUrls = photos.map((photo) => URL.createObjectURL(photo))
    setPreviewUrls(nextUrls)

    return () => {
      nextUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photos])

  useEffect(() => {
    if (user?.role !== 'admin' || !token) {
      setPublicProjects([])
      return
    }

    let cancelled = false
    fetchBuildings('public', token)
      .then((items) => {
        if (!cancelled) setPublicProjects(items)
      })
      .catch(() => {
        if (!cancelled) setAdminError('管理员项目列表加载失败')
      })

    return () => {
      cancelled = true
    }
  }, [token, user?.role])

  useEffect(() => {
    if (!job.id) {
      if (step === 'upload' && !savedBuilding) {
        clearPersistedState()
      }
      return
    }

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step,
        buildingName,
        job,
        savedBuilding,
      } satisfies PersistedReconstructionState)
    )
  }, [buildingName, job, savedBuilding, step])

  useEffect(() => {
    if (step !== 'processing' || !job.id) return

    const timer = window.setInterval(async () => {
      try {
        const next = await fetchJobStatus(job.id, token)
        setJob(next)

        if (next.status === 'done') {
          window.clearInterval(timer)
          setStep('done')
        }

        if (next.status === 'failed') {
          window.clearInterval(timer)
          setError(next.error || '重建任务失败')
          setStep('upload')
          clearPersistedState()
        }
      } catch (err) {
        window.clearInterval(timer)
        setError(err instanceof Error ? err.message : '重建进度获取失败')
        setStep('upload')
        clearPersistedState()
      }
    }, 1200)

    return () => window.clearInterval(timer)
  }, [job.id, step, token])

  function handleFiles(files: FileList | null) {
    if (!files) return
    setPhotos((current) => [...current, ...Array.from(files)])
  }

  async function reloadProjects() {
    if (!token) return
    const items = await fetchBuildings('public', token)
    setPublicProjects(items)
  }

  async function handleCreateProject() {
    if (!token) return

    setAdminSubmitting(true)
    setAdminError(null)
    setAdminSuccess(null)
    try {
      const created = await createAdminProject(projectForm, token)
      setPublicProjects((current) => [created, ...current])
      setProjectForm({
        name: '',
        dynasty: '',
        location: '',
        description: '',
        latitude: 0,
        longitude: 0,
      })
      setAdminSuccess(`已新增众包项目：${created.name}`)
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : '新增项目失败')
    } finally {
      setAdminSubmitting(false)
    }
  }

  async function handleDeleteProject() {
    if (!token || !deletingProjectId) return

    setAdminSubmitting(true)
    setAdminError(null)
    setAdminSuccess(null)
    try {
      await deleteAdminProject(deletingProjectId, token)
      const deleted = publicProjects.find((item) => item.id === deletingProjectId)
      setPublicProjects((current) => current.filter((item) => item.id !== deletingProjectId))
      setDeletingProjectId('')
      setAdminSuccess(`已删除项目：${deleted?.name ?? '已选项目'}`)
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : '删除项目失败')
    } finally {
      setAdminSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!buildingName.trim()) {
      setError('请输入建筑名称')
      return
    }
    if (!token) {
      setError('请先登录后再使用重建模型')
      return
    }
    if (photos.length < 3) {
      setError('至少上传 3 张照片才能启动重建')
      return
    }

    setError(null)
    setSaveError(null)
    setSavedBuilding(null)
    setStep('processing')

    try {
      const created = await submitReconstruction(buildingName, photos, token)
      setJob(created)
    } catch (err) {
      setStep('upload')
      setError(err instanceof Error ? err.message : '重建任务提交失败')
    }
  }

  async function handleSave() {
    if (!token || !job.id) return

    setSaving(true)
    setSaveError(null)

    try {
      const building = await saveReconstructionJob(job.id, token)
      setSavedBuilding(building)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败，请稍后再试')
    } finally {
      setSaving(false)
    }
  }

  function resetFlow() {
    setStep('upload')
    setPhotos([])
    setBuildingName('')
    setJob(emptyJob)
    setError(null)
    setSaveError(null)
    setSavedBuilding(null)
    clearPersistedState()
  }

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-20">
      <h1 className="mb-2 text-3xl font-bold text-stone-100">上传重建</h1>
      <p className="mb-4 text-stone-500">
        上传同一座建筑的多角度照片，系统会自动启动重建任务。现在模型重建能力已经绑定账号权限，未登录时不能直接调用。
      </p>
      <p className="mb-10 text-sm text-stone-600">
        {user ? `当前登录账号：${user.username}，重建完成后可以直接保存到“我的模型”。` : '请先注册并登录，再上传照片启动重建任务。'}
      </p>

      {user?.role === 'admin' && (
        <div className="mb-10 rounded-3xl border border-stone-800 bg-stone-900/70 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-cinnabar/70">Admin Controls</p>
              <h2 className="mt-2 font-serif text-2xl text-stone-100">众包项目管理</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                管理员可在这里维护探索页的众包项目。普通用户界面保持不变，这些入口只在管理员账号下显示。
              </p>
            </div>
            <button
              onClick={() => void reloadProjects()}
              className="rounded-full border border-stone-700 px-4 py-2 text-xs tracking-[0.18em] text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300"
            >
              刷新项目
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-white/5 bg-black/10 p-5">
              <div>
                <p className="text-sm font-semibold text-stone-100">新增项目</p>
                <p className="mt-1 text-xs text-stone-500">创建一个新的公共众包项目，进入探索页后用户就能看到。</p>
              </div>

              <input
                value={projectForm.name}
                onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="项目名称"
                className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={projectForm.dynasty}
                  onChange={(event) => setProjectForm((current) => ({ ...current, dynasty: event.target.value }))}
                  placeholder="朝代"
                  className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                />
                <input
                  value={projectForm.location}
                  onChange={(event) => setProjectForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="地点"
                  className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  value={projectForm.latitude}
                  onChange={(event) => setProjectForm((current) => ({ ...current, latitude: Number(event.target.value) || 0 }))}
                  placeholder="纬度"
                  className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="number"
                  value={projectForm.longitude}
                  onChange={(event) => setProjectForm((current) => ({ ...current, longitude: Number(event.target.value) || 0 }))}
                  placeholder="经度"
                  className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <textarea
                value={projectForm.description}
                onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="项目简介"
                rows={4}
                className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={() => void handleCreateProject()}
                disabled={adminSubmitting}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500"
              >
                {adminSubmitting ? '处理中...' : '新增众包项目'}
              </button>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/5 bg-black/10 p-5">
              <div>
                <p className="text-sm font-semibold text-stone-100">删除项目</p>
                <p className="mt-1 text-xs text-stone-500">只删除公共众包项目，不影响普通用户当前的浏览体验。</p>
              </div>

              <select
                value={deletingProjectId}
                onChange={(event) => setDeletingProjectId(event.target.value)}
                className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">选择要删除的项目</option>
                {publicProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} · {project.location}
                  </option>
                ))}
              </select>

              <div className="rounded-2xl border border-stone-800 bg-stone-950/70 px-4 py-3 text-xs leading-relaxed text-stone-500">
                当前公共项目数：{publicProjects.length}。删除后探索页会自动少一条记录，普通用户不需要额外适应新的操作入口。
              </div>

              <button
                onClick={() => void handleDeleteProject()}
                disabled={adminSubmitting || !deletingProjectId}
                className="w-full rounded-xl border border-red-500/20 bg-red-500/10 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:border-stone-800 disabled:bg-stone-900 disabled:text-stone-600"
              >
                {adminSubmitting ? '处理中...' : '删除选中项目'}
              </button>
            </div>
          </div>

          {adminError && <p className="mt-4 text-sm text-red-400">{adminError}</p>}
          {adminSuccess && <p className="mt-4 text-sm text-emerald-400">{adminSuccess}</p>}
        </div>
      )}

      <div className="mb-10 flex items-center gap-3">
        {['上传照片', '自动重建', '查看结果'].map((label, idx) => {
          const stepMap: Step[] = ['upload', 'processing', 'done']
          const active = stepMap[idx] === step
          const done = stepMap.indexOf(step) > idx

          return (
            <div key={label} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-500'
                  }`}
                >
                  {done ? '✓' : idx + 1}
                </div>
                <span className={`text-sm ${active ? 'text-amber-400' : done ? 'text-emerald-400' : 'text-stone-600'}`}>{label}</span>
              </div>
              {idx < 2 && <div className="h-px w-8 bg-stone-800" />}
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <div className="flex flex-col gap-6">
          <div>
            <label className="mb-2 block text-sm text-stone-400">建筑名称</label>
            <input
              value={buildingName}
              onChange={(event) => setBuildingName(event.target.value)}
              placeholder="例如：岳麓书院大门"
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-4 py-3 text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              handleFiles(event.dataTransfer.files)
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-700 p-10 transition-colors hover:border-amber-500"
          >
            <span className="text-4xl">📷</span>
            <p className="text-sm text-stone-400">点击或拖拽上传照片</p>
            <p className="text-xs text-stone-600">建议至少上传 3 张 JPG/PNG，照片越连续、重叠越充分，重建结果越稳定。</p>
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
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-stone-400">已选择 {photos.length} 张照片</p>
                <button
                  onClick={() => setPhotos([])}
                  className="text-xs text-stone-500 transition-colors hover:text-stone-300"
                >
                  清空
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {previewUrls.slice(0, 12).map((url, index) => (
                  <div key={url} className="aspect-square overflow-hidden rounded-lg bg-stone-800">
                    <img src={url} alt={photos[index]?.name || ''} className="h-full w-full object-cover" />
                  </div>
                ))}
                {photos.length > 12 && (
                  <div className="flex aspect-square items-center justify-center rounded-lg bg-stone-800 text-sm text-stone-500">
                    +{photos.length - 12}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!token || !buildingName.trim() || photos.length < 3}
            className="w-full rounded-lg bg-amber-500 py-3 font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-600"
          >
            {token ? '开始重建' : '登录后才能开始重建'}
          </button>
        </div>
      )}

      {step === 'processing' && <ReconstructProgress job={job} />}

      {step === 'done' && job.modelPath && (
        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-xl border border-stone-800 h-96">
            <SplatViewer modelPath={job.modelPath} />
          </div>

          <div className="grid gap-3 rounded-2xl border border-stone-800 bg-stone-900/60 p-5 text-sm text-stone-400 sm:grid-cols-3">
            <div>
              <p className="text-stone-600">上传照片</p>
              <p className="mt-1 text-stone-100">{job.photoCount}</p>
            </div>
            <div>
              <p className="text-stone-600">筛选后照片</p>
              <p className="mt-1 text-stone-100">{job.selectedCount ?? job.photoCount}</p>
            </div>
            <div>
              <p className="text-stone-600">任务编号</p>
              <p className="mt-1 text-stone-100">{job.id}</p>
            </div>
          </div>

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          {savedBuilding && (
            <p className="text-sm text-emerald-400">
              已保存到个人模型库。你现在可以直接进入这个建筑档案继续查看。
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={resetFlow}
              className="flex-1 rounded-lg border border-stone-700 py-3 text-sm text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-100"
            >
              重建另一个
            </button>

            {savedBuilding ? (
              <button
                onClick={() => navigate(`/building/${savedBuilding.id}`)}
                className="flex-1 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
              >
                进入我的模型
              </button>
            ) : token ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 py-3 font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500"
              >
                {saving ? '保存中...' : '保存到我的模型'}
              </button>
            ) : (
              <Link
                to="/about"
                className="flex-1 rounded-lg bg-stone-800 py-3 text-center text-sm text-stone-200 transition-colors hover:bg-stone-700"
              >
                先注册账号再保存
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
