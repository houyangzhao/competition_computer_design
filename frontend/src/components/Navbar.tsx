import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import AuthModal from './AuthModal'

const links = [
  { to: '/explore', label: '探索' },
  { to: '/reconstruct', label: '上传重建' },
  { to: '/about', label: '关于' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { ready, user, logout } = useAuth()
  const [modal, setModal] = useState<'login' | 'register' | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 20)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <nav
        className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-4 py-4 transition-all duration-500 md:px-8 ${
          isScrolled ? 'border-b border-white/5 bg-ink/80 py-3 backdrop-blur-xl' : 'bg-transparent'
        }`}
      >
        <Link to="/" className="group flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-gold/50 bg-cinnabar shadow-lg transition-transform duration-500 group-hover:rotate-0 group-hover:scale-105 rotate-45">
            <span className="font-serif text-xl text-white transition-transform duration-500 group-hover:rotate-0 -rotate-45">
              筑
            </span>
          </div>
          <span className="font-serif text-2xl font-bold tracking-widest text-paper">
            筑忆 <span className="ml-1 font-sans text-[10px] tracking-normal opacity-40">ZHUYI</span>
          </span>
        </Link>

        <div className="flex items-center gap-4 md:gap-10">
          <div className="hidden items-center gap-6 md:flex">
            {links.map(({ to, label }) => {
              const isActive = pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className={`relative text-sm font-medium tracking-widest transition-colors duration-300 ${
                    isActive ? 'text-cinnabar' : 'text-paper/60 hover:text-paper'
                  }`}
                >
                  {label}
                  {isActive && <span className="absolute left-0 right-0 -bottom-2 h-px animate-pulse bg-cinnabar/60" />}
                </Link>
              )
            })}
          </div>

          {!ready ? (
            <div className="text-xs tracking-[0.2em] text-paper/40 uppercase">Syncing</div>
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((open) => !open)}
                className="group flex items-center gap-3 rounded-full border border-white/5 px-3 py-1.5 transition-all hover:border-gold/30"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/30 bg-gold/20 text-xs font-bold text-gold transition-colors group-hover:bg-gold group-hover:text-ink">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-sm text-paper/80 transition-colors group-hover:text-paper sm:inline">
                  {user.username}
                </span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-14 z-50 w-52 overflow-hidden rounded-lg py-2 shadow-2xl glass-panel">
                  <Link
                    to="/my"
                    className="block px-6 py-3 text-sm text-paper/80 transition-colors hover:bg-white/5 hover:text-paper"
                  >
                    我的模型库
                  </Link>
                  <Link
                    to="/reconstruct"
                    className="block px-6 py-3 text-sm text-paper/80 transition-colors hover:bg-white/5 hover:text-paper"
                  >
                    新建重建任务
                  </Link>
                  <div className="mx-4 my-1 h-px bg-white/5" />
                  <button
                    onClick={() => {
                      logout()
                      setUserMenuOpen(false)
                    }}
                    className="w-full px-6 py-3 text-left text-sm text-cinnabar transition-colors hover:bg-cinnabar/10"
                  >
                    安全登出
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 md:gap-6">
              <button
                onClick={() => setModal('login')}
                className="text-sm tracking-widest text-paper/60 transition-colors hover:text-paper"
              >
                登录
              </button>
              <button
                onClick={() => setModal('register')}
                className="rounded-sm bg-cinnabar/90 px-4 py-2 text-xs font-bold tracking-[0.2em] text-white transition-all gold-border cinnabar-glow hover:bg-cinnabar md:px-6"
              >
                注册账号
              </button>
            </div>
          )}
        </div>
      </nav>

      {modal && <AuthModal defaultTab={modal} onClose={() => setModal(null)} />}
    </>
  )
}
