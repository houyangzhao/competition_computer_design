import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MapLocationPicker, { type SelectedLocation } from '../components/MapLocationPicker'
import ReconstructProgress from '../components/ReconstructProgress'
import SplatViewer from '../components/SplatViewer'
import { useAuth } from '../context/useAuth'
import { createAdminProject, deleteAdminProject, fetchBuildings, fetchJobStatus, saveReconstructionJob, submitReconstruction } from '../lib/api'
import type { AdminProjectInput, Building, ReconstructionJob } from '../types'

type Step = 'upload' | 'processing' | 'done'
type AdminMode = 'create' | 'delete'

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
  const [adminMode, setAdminMode] = useState<AdminMode>('create')
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

  function handleLocationConfirm(location: SelectedLocation) {
    setProjectForm((current) => ({
      ...current,
      location: location.displayName,
      latitude: location.latitude,
      longitude: location.longitude,
    }))
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

  const isAdmin = user?.role === 'admin'

  return (
    <div className={`mx-auto px-6 ${isAdmin ? 'max-w-[1500px] pb-8 pt-20' : 'max-w-4xl pb-16 pt-20'}`}>
      <h1 className="mb-2 text-3xl font-bold text-stone-100">{isAdmin ? '众包项目管理' : '上传重建'}</h1>
      <p className="mb-4 text-stone-500">
        {isAdmin ? '创建新的公共众包项目，或删除不再收集照片的项目。' : '上传同一座建筑的多角度照片，我们会为你生成一个可预览的三维模型。'}
      </p>
      {!isAdmin && (
        <p className="mb-10 text-sm text-stone-600">
          {user ? `当前账号：${user.username}。重建完成后，你可以把结果保存到“我的模型”。` : '登录后即可开始上传，并在完成后保存到自己的模型库。'}
        </p>
      )}

      {isAdmin && (
        <div className="rounded-3xl border border-stone-800 bg-stone-900/75 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur">
          <div className="mb-4 flex items-start justify-between gap-5">
            <div>
              <p className="text-xs tracking-[0.28em] text-cinnabar/70">项目维护</p>
              <h2 className="mt-1 font-serif text-2xl text-stone-100">众包项目管理</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">
                在这里添加需要大家共同补拍的建筑，也可以下架已经不再收集照片的项目。
              </p>
            </div>
            <button
              onClick={() => void reloadProjects()}
              className="rounded-full border border-stone-700 px-5 py-2.5 text-sm tracking-[0.16em] text-stone-300 transition-colors hover:border-amber-500 hover:text-amber-300"
            >
              刷新项目
            </button>
          </div>

          <div className="mb-4 grid max-w-xl grid-cols-2 gap-2 rounded-2xl border border-stone-800 bg-stone-950/70 p-2">
            {[
              { key: 'create', label: '新增项目' },
              { key: 'delete', label: '删除项目' },
            ].map((item) => {
              const active = adminMode === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setAdminMode(item.key as AdminMode)}
                  className={`rounded-xl px-4 py-2.5 font-serif text-base transition-colors ${
                    active ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:bg-stone-900 hover:text-stone-100'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {adminMode === 'create' ? (
            <div className="grid min-h-[540px] gap-5 rounded-2xl border border-white/5 bg-black/10 p-5 xl:grid-cols-[0.82fr_1.18fr]">
              <div className="flex min-h-[500px] flex-col gap-4">
                <div>
                  <p className="font-serif text-2xl text-stone-100">新增众包项目</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">填写基础信息，在地图里定位建筑，用户就能在探索页参与补拍。</p>
                </div>

                <input
                  value={projectForm.name}
                  onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="项目名称"
                  className="w-full rounded-xl border border-stone-700 bg-stone-950 px-5 py-4 font-serif text-lg text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={projectForm.dynasty}
                    onChange={(event) => setProjectForm((current) => ({ ...current, dynasty: event.target.value }))}
                    placeholder="朝代"
                    className="w-full rounded-xl border border-stone-700 bg-stone-950 px-5 py-4 font-serif text-base text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    value={projectForm.location}
                    readOnly
                    placeholder="地图确认后自动填写地点"
                    className="w-full cursor-default rounded-xl border border-stone-700 bg-stone-950 px-5 py-4 font-serif text-base text-stone-100 placeholder-stone-600 focus:outline-none"
                  />
                </div>

                <textarea
                  value={projectForm.description}
                  onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="项目简介"
                  rows={7}
                  className="custom-scrollbar min-h-40 flex-1 rounded-xl border border-stone-700 bg-stone-950 px-5 py-4 text-base leading-relaxed text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={() => void handleCreateProject()}
                  disabled={adminSubmitting}
                  className="w-full rounded-xl bg-amber-500 py-4 text-base font-semibold text-stone-950 transition-colors hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500"
                >
                  {adminSubmitting ? '处理中...' : '新增众包项目'}
                </button>
              </div>

              <MapLocationPicker
                initialQuery={projectForm.location || projectForm.name}
                selectedLocation={
                  projectForm.latitude !== 0 || projectForm.longitude !== 0
                    ? {
                        displayName: projectForm.location,
                        latitude: projectForm.latitude,
                        longitude: projectForm.longitude,
                      }
                    : null
                }
                onConfirm={handleLocationConfirm}
              />
            </div>
          ) : (
            <div className="flex min-h-[540px] flex-col rounded-2xl border border-white/5 bg-black/10 p-5">
              <div className="max-w-3xl">
                <p className="font-serif text-2xl text-stone-100">删除众包项目</p>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">选择不再收集照片的项目，下架后探索页不会继续展示。</p>
              </div>

              <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-5">
                  <select
                    value={deletingProjectId}
                    onChange={(event) => setDeletingProjectId(event.target.value)}
                    className="custom-scrollbar w-full rounded-xl border border-stone-700 bg-stone-950 px-5 py-4 text-base text-stone-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">选择要删除的项目</option>
                    {publicProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} · {project.location}
                      </option>
                    ))}
                  </select>

                  <div className="rounded-2xl border border-stone-800 bg-stone-950/70 px-5 py-4 text-sm leading-relaxed text-stone-400">
                    当前公共项目数：{publicProjects.length}。删除只会影响公共众包列表，不会删除用户自己的模型库。
                  </div>

                  <button
                    onClick={() => void handleDeleteProject()}
                    disabled={adminSubmitting || !deletingProjectId}
                    className="w-full rounded-xl border border-red-500/20 bg-red-500/10 py-4 text-base font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:border-stone-800 disabled:bg-stone-900 disabled:text-stone-600"
                  >
                    {adminSubmitting ? '处理中...' : '删除选中项目'}
                  </button>
                </div>

                <div className="custom-scrollbar max-h-[360px] overflow-y-auto rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
                  {publicProjects.length === 0 ? (
                    <div className="flex h-full min-h-72 items-center justify-center rounded-xl border border-dashed border-stone-800 text-sm text-stone-600">
                      暂无公共众包项目
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {publicProjects.map((project) => {
                        const active = deletingProjectId === project.id
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => setDeletingProjectId(project.id)}
                            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                              active
                                ? 'border-red-500/40 bg-red-500/10 text-stone-100'
                                : 'border-stone-800 bg-black/30 text-stone-400 hover:border-stone-700 hover:text-stone-200'
                            }`}
                          >
                            <span className="block font-serif text-base text-stone-100">{project.name}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-stone-500">{project.location}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {adminError && <p className="mt-4 text-sm text-red-400">{adminError}</p>}
          {adminSuccess && <p className="mt-4 text-sm text-emerald-400">{adminSuccess}</p>}
        </div>
      )}

      {!isAdmin && (
        <>
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
            <p className="text-xs text-stone-600">请上传同一座建筑的连续照片，尽量覆盖正面、侧面、转角和屋檐细节，至少 3 张。</p>
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
        </>
      )}
    </div>
  )
}
