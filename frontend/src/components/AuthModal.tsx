import { useState } from 'react'
import { useAuth } from '../context/useAuth'

interface AuthModalProps {
  onClose: () => void
  defaultTab?: 'login' | 'register' | 'admin'
}

export default function AuthModal({ onClose, defaultTab = 'login' }: AuthModalProps) {
  const { login, register, registerAdmin } = useAuth()
  const emptyForm = { username: '', email: '', password: '', adminCode: '' }
  const [tab, setTab] = useState<'login' | 'register' | 'admin'>(defaultTab)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(form.email, form.password)
      } else if (tab === 'admin') {
        if (!form.username.trim()) { setError('请输入用户名'); setLoading(false); return }
        if (!form.adminCode.trim()) { setError('请输入管理员注册码'); setLoading(false); return }
        await registerAdmin(form.username, form.email, form.password, form.adminCode)
      } else {
        if (!form.username.trim()) { setError('请输入用户名'); setLoading(false); return }
        await register(form.username, form.email, form.password)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (nextTab: 'login' | 'register' | 'admin') => {
    setTab(nextTab)
    setForm(emptyForm)
    setError('')
  }

  return (
    /* 遮罩 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl p-8 shadow-2xl">
        {/* Tab */}
        <div className="flex mb-8 bg-stone-800 rounded-lg p-1">
          {(['login', 'register', 'admin'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              {t === 'login' ? '登录' : t === 'register' ? '注册' : '管理员'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="off">
          {tab !== 'login' && (
            <div>
              <label className="block text-xs text-stone-500 mb-1.5">用户名</label>
              <input
                value={form.username}
                onChange={set('username')}
                placeholder="你的名字"
                autoComplete="off"
                className="w-full bg-stone-800 border border-stone-700 focus:border-amber-500 rounded-lg px-4 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none transition-colors"
              />
            </div>
          )}

          {tab === 'admin' && (
            <div>
              <label className="block text-xs text-stone-500 mb-1.5">管理员注册码</label>
              <input
                value={form.adminCode}
                onChange={set('adminCode')}
                placeholder="请输入管理员注册码"
                autoComplete="off"
                className="w-full bg-stone-800 border border-stone-700 focus:border-amber-500 rounded-lg px-4 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-stone-500 mb-1.5">邮箱</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="your@email.com"
              required
              autoComplete={tab === 'login' ? 'email' : 'off'}
              className="w-full bg-stone-800 border border-stone-700 focus:border-amber-500 rounded-lg px-4 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1.5">密码</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-stone-800 border border-stone-700 focus:border-amber-500 rounded-lg px-4 py-2.5 text-sm text-stone-100 placeholder-stone-600 outline-none transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-700 disabled:text-stone-500 text-stone-950 font-semibold rounded-lg transition-colors mt-2"
          >
            {loading ? '请稍候…' : tab === 'login' ? '登录' : tab === 'admin' ? '注册管理员' : '注册'}
          </button>
        </form>

        <p className="text-center text-stone-600 text-xs mt-6">
          {tab === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
            className="text-amber-400 hover:underline ml-1"
          >
            {tab === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  )
}
