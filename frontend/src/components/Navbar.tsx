import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'

const links = [
  { to: '/explore', label: '探索' },
  { to: '/reconstruct', label: '上传重建' },
  { to: '/about', label: '关于' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const [modal, setModal] = useState<'login' | 'register' | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-8 py-4 flex items-center justify-between
          ${isScrolled ? 'bg-ink/80 backdrop-blur-xl border-b border-white/5 py-3' : 'bg-transparent'}`}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-cinnabar rounded-sm flex items-center justify-center transform rotate-45 group-hover:rotate-0 transition-transform duration-500 border border-gold/50 shadow-lg">
            <span className="text-white text-xl font-serif transform -rotate-45 group-hover:rotate-0 transition-transform duration-500">
              筑
            </span>
          </div>
          <span className="text-2xl font-serif font-bold tracking-widest text-paper">
            筑忆 <span className="text-[10px] font-sans tracking-normal opacity-40 ml-1">ZHUYI</span>
          </span>
        </Link>

        {/* 主导航 */}
        <div className="flex items-center gap-10">
          {links.map(({ to, label }) => {
            const isActive = pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`relative text-sm font-medium tracking-widest transition-colors duration-300
                  ${isActive ? 'text-cinnabar' : 'text-paper/60 hover:text-paper'}`}
              >
                {label}
                {isActive && (
                  <span className="absolute -bottom-2 left-0 right-0 h-px bg-cinnabar/60 animate-pulse" />
                )}
              </Link>
            )
          })}

          {/* 用户区 */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-3 group px-3 py-1.5 rounded-full border border-white/5 hover:border-gold/30 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold font-bold text-xs border border-gold/30 group-hover:bg-gold group-hover:text-ink transition-colors">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-paper/80 group-hover:text-paper transition-colors">{user.username}</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-14 w-48 glass-panel rounded-lg shadow-2xl py-2 z-50 overflow-hidden">
                  <Link
                    to="/my"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-6 py-3 text-sm text-paper/80 hover:text-paper hover:bg-white/5 transition-colors"
                  >
                    我的模型库
                  </Link>
                  <div className="h-px bg-white/5 mx-4 my-1" />
                  <button
                    onClick={() => { logout(); setUserMenuOpen(false) }}
                    className="w-full text-left px-6 py-3 text-sm text-cinnabar hover:bg-cinnabar/10 transition-colors"
                  >
                    安全登出
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <button
                onClick={() => setModal('login')}
                className="text-sm text-paper/60 hover:text-paper tracking-widest transition-colors"
              >
                登录
              </button>
              <button
                onClick={() => setModal('register')}
                className="px-6 py-2 bg-cinnabar/90 hover:bg-cinnabar text-white text-xs font-bold tracking-[0.2em] rounded-sm transition-all gold-border cinnabar-glow"
              >
                注册账号
              </button>
            </div>
          )}
        </div>
      </nav>

      {modal && (
        <AuthModal
          defaultTab={modal}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
