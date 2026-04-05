import type { Building, ReconstructionJob, ChatMessage, User } from '../types'

const BASE = '/api'

// ─── Auth（预留后端接口，当前由 AuthContext mock 实现）────────────────────────

export async function apiRegister(
  username: string,
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function apiGetMe(token: string): Promise<User> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

// ─── Buildings ────────────────────────────────────────────────────────────────

export async function fetchBuildings(type?: 'public' | 'personal'): Promise<Building[]> {
  const url = type ? `${BASE}/buildings?type=${type}` : `${BASE}/buildings`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch buildings')
  return res.json()
}

export async function fetchBuilding(id: string): Promise<Building> {
  const res = await fetch(`${BASE}/buildings/${id}`)
  if (!res.ok) throw new Error('Failed to fetch building')
  return res.json()
}

// ─── Reconstruction ───────────────────────────────────────────────────────────

export async function submitReconstruction(
  buildingName: string,
  files: File[],
  token?: string | null
): Promise<ReconstructionJob> {
  const form = new FormData()
  form.append('building_name', buildingName)
  files.forEach((f) => form.append('photos', f))
  const res = await fetch(`${BASE}/reconstruct`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) throw new Error('Failed to submit reconstruction job')
  return res.json()
}

export async function fetchJobStatus(jobId: string): Promise<ReconstructionJob> {
  const res = await fetch(`${BASE}/reconstruct/${jobId}`)
  if (!res.ok) throw new Error('Failed to fetch job status')
  return res.json()
}

// ─── Chat（预留 AI 对话接口）─────────────────────────────────────────────────

export async function sendChatMessage(
  buildingId: string,
  message: string,
  history: ChatMessage[],
  token?: string | null
): Promise<ChatMessage> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ building_id: buildingId, message, history }),
  })
  if (!res.ok) throw new Error('Failed to send chat message')
  return res.json()
}

// ─── Contribute（预留众包接口）───────────────────────────────────────────────

export async function contributePhotos(
  projectId: string,
  files: File[],
  token?: string | null
): Promise<{ received: number }> {
  const form = new FormData()
  files.forEach((f) => form.append('photos', f))
  const res = await fetch(`${BASE}/contribute/${projectId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) throw new Error('Failed to contribute photos')
  return res.json()
}
