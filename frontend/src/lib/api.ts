import type {
  AdminProjectInput,
  Building,
  ChatMessage,
  ContributionResult,
  KnowledgeItem,
  OverviewStats,
  ReconstructionJob,
  User,
} from '../types'

const BASE = '/api'

async function readError(res: Response): Promise<never> {
  const contentType = res.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { detail?: string }
    throw new Error(data.detail || 'Request failed')
  }

  throw new Error((await res.text()) || 'Request failed')
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  if (!res.ok) {
    return readError(res)
  }
  return res.json() as Promise<T>
}

export async function apiRegister(
  username: string,
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  return requestJson(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })
}

export async function apiRegisterAdmin(
  username: string,
  email: string,
  password: string,
  adminCode: string
): Promise<{ user: User; token: string }> {
  return requestJson(`${BASE}/auth/register-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, adminCode }),
  })
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  return requestJson(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export async function apiGetMe(token: string): Promise<User> {
  return requestJson(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function fetchOverview(): Promise<OverviewStats> {
  return requestJson(`${BASE}/overview`)
}

export async function fetchBuildings(type: 'public' | 'personal' = 'public', token?: string | null): Promise<Building[]> {
  const url = `${BASE}/buildings?type=${type}`
  return requestJson(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export async function fetchMyBuildings(token: string): Promise<Building[]> {
  return requestJson(`${BASE}/my/buildings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function fetchBuilding(id: string, token?: string | null): Promise<Building> {
  return requestJson(`${BASE}/buildings/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export async function fetchBuildingKnowledge(id: string, token?: string | null): Promise<KnowledgeItem[]> {
  return requestJson(`${BASE}/buildings/${id}/knowledge`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export async function submitReconstruction(
  buildingName: string,
  files: File[],
  token?: string | null
): Promise<ReconstructionJob> {
  const form = new FormData()
  form.append('building_name', buildingName)
  files.forEach((file) => form.append('photos', file))

  return requestJson(`${BASE}/reconstruct`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
}

export async function fetchJobStatus(jobId: string, token?: string | null): Promise<ReconstructionJob> {
  return requestJson(`${BASE}/reconstruct/${jobId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export async function saveReconstructionJob(jobId: string, token: string): Promise<Building> {
  return requestJson(`${BASE}/reconstruct/${jobId}/save`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function sendChatMessage(
  buildingId: string,
  message: string,
  history: ChatMessage[],
  token?: string | null
): Promise<ChatMessage> {
  return requestJson(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ building_id: buildingId, message, history }),
  })
}

export async function contributePhotos(
  projectId: string,
  files: File[],
  token?: string | null
): Promise<ContributionResult> {
  const form = new FormData()
  files.forEach((file) => form.append('photos', file))

  return requestJson(`${BASE}/contribute/${projectId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
}

export async function createAdminProject(project: AdminProjectInput, token: string): Promise<Building> {
  return requestJson(`${BASE}/admin/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(project),
  })
}

export async function deleteAdminProject(buildingId: string, token: string): Promise<{ ok: boolean; deletedId: string }> {
  return requestJson(`${BASE}/admin/projects/${buildingId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}
