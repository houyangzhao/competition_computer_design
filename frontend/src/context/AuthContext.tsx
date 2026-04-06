import { useEffect, useState, type ReactNode } from 'react'
import { apiGetMe, apiLogin, apiRegister, apiRegisterAdmin } from '../lib/api'
import { clearAuthState, loadAuthState, saveAuthState } from '../lib/auth'
import { AuthContext } from './auth-context'

interface InternalAuthState {
  ready: boolean
  token: string | null
  user: ReturnType<typeof loadAuthState>['user']
}

function getInitialState(): InternalAuthState {
  const initial = loadAuthState()
  return {
    user: initial.user,
    token: initial.token,
    ready: !initial.token,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InternalAuthState>(getInitialState)

  useEffect(() => {
    if (!state.token || state.ready) return

    let cancelled = false

    apiGetMe(state.token)
      .then((user) => {
        if (cancelled) return
        const next = { user, token: state.token, ready: true }
        setState(next)
        saveAuthState({ user: next.user, token: next.token })
      })
      .catch(() => {
        if (cancelled) return
        setState({ user: null, token: null, ready: true })
        clearAuthState()
      })

    return () => {
      cancelled = true
    }
  }, [state.ready, state.token])

  async function login(email: string, password: string) {
    const { user, token } = await apiLogin(email, password)
    const next = { user, token, ready: true }
    setState(next)
    saveAuthState({ user: next.user, token: next.token })
  }

  async function register(username: string, email: string, password: string) {
    const { user, token } = await apiRegister(username, email, password)
    const next = { user, token, ready: true }
    setState(next)
    saveAuthState({ user: next.user, token: next.token })
  }

  async function registerAdmin(username: string, email: string, password: string, adminCode: string) {
    const { user, token } = await apiRegisterAdmin(username, email, password, adminCode)
    const next = { user, token, ready: true }
    setState(next)
    saveAuthState({ user: next.user, token: next.token })
  }

  function logout() {
    setState({ user: null, token: null, ready: true })
    clearAuthState()
  }

  return (
    <AuthContext.Provider value={{ user: state.user, token: state.token, ready: state.ready, login, register, registerAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
