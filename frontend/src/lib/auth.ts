import type { User, AuthState } from '../types'

const STORAGE_KEY = 'zhuy_auth'

// ─── localStorage 持久化 ──────────────────────────────────────────────────────

export function loadAuthState(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: null, token: null }
    return JSON.parse(raw) as AuthState
  } catch {
    return { user: null, token: null }
  }
}

export function saveAuthState(state: AuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearAuthState() {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Mock 实现（后端就绪后替换为真实 API 调用）───────────────────────────────

const MOCK_USERS_KEY = 'zhuy_users'

interface StoredUser extends User {
  passwordHash: string // mock 下直接存明文，生产环境绝对不能这样
}

function loadUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users))
}

function makeMockToken(userId: string): string {
  return `mock_token_${userId}_${Date.now()}`
}

export async function mockRegister(
  username: string,
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  await new Promise((r) => setTimeout(r, 600)) // 模拟网络延迟

  const users = loadUsers()
  if (users.find((u) => u.email === email)) {
    throw new Error('该邮箱已被注册')
  }

  const user: User = {
    id: `user_${Date.now()}`,
    username,
    email,
    avatar: null,
    createdAt: new Date().toISOString(),
  }
  saveUsers([...users, { ...user, passwordHash: password }])

  const token = makeMockToken(user.id)
  return { user, token }
}

export async function mockLogin(
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  await new Promise((r) => setTimeout(r, 600))

  const users = loadUsers()
  const found = users.find((u) => u.email === email && u.passwordHash === password)
  if (!found) throw new Error('邮箱或密码错误')

  const { passwordHash: _, ...user } = found
  const token = makeMockToken(user.id)
  return { user, token }
}
