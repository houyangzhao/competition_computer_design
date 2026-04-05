import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { User } from '../types'
import { loadAuthState, saveAuthState, clearAuthState } from '../lib/auth'
import { apiLogin, apiRegister } from '../lib/api'

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => loadAuthState())

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await apiLogin(email, password)
    const next = { user, token }
    setState(next)
    saveAuthState(next)
  }, [])

  const register = useCallback(async (username: string, email: string, password: string) => {
    const { user, token } = await apiRegister(username, email, password)
    const next = { user, token }
    setState(next)
    saveAuthState(next)
  }, [])

  const logout = useCallback(() => {
    setState({ user: null, token: null })
    clearAuthState()
  }, [])

  return (
    <AuthContext.Provider value={{ user: state.user, token: state.token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
