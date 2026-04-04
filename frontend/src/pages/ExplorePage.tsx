import { useState } from 'react'
import { buildings } from '../data/buildings'
import BuildingCard from '../components/BuildingCard'

export default function ExplorePage() {
  const [filter, setFilter] = useState<'all' | 'ready' | 'pending'>('all')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const filtered = buildings.filter((b) => filter === 'all' || b.status === filter)

  return (
    <div className="relative w-full h-screen overflow-hidden bg-ink pt-16">
      {/* 全屏地图底层 (High-Tech Map Placeholder) */}
      <div className="absolute inset-0 z-0 bg-ink overflow-hidden">
        {/* 数字网格背景 */}
        <div 
          className="absolute inset-0 opacity-10" 
          style={{ 
            backgroundImage: 'radial-gradient(circle, #d4af37 1px, transparent 1px)', 
            backgroundSize: '40px 40px' 
          }} 
        />
        
        {/* 动态扫描线 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-gold/20 to-transparent absolute top-0 animate-[scan_8s_linear_infinite]" />
        </div>

        {/* 模拟坐标点 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[800px] h-[800px] border border-gold/5 rounded-full animate-[ping_10s_linear_infinite]" />
          <div className="absolute top-1/4 left-1/3 w-2 h-2 bg-cinnabar/40 rounded-full blur-[2px]" />
          <div className="absolute bottom-1/3 right-1/4 w-2 h-2 bg-gold/40 rounded-full blur-[2px]" />
          
          <div className="text-center space-y-4">
            <div className="font-serif space-y-1">
              <p className="text-6xl text-gold/20 font-bold tracking-[0.5em]">HERITAGE MAP</p>
              <p className="text-[10px] text-paper/20 tracking-[1em] uppercase">Digital Scanning in Progress</p>
            </div>
            <div className="flex justify-center gap-8 text-[8px] font-mono text-paper/20 tracking-tighter">
              <span>LAT: 39.9165° N</span>
              <span>LNG: 116.3972° E</span>
              <span>ALT: 44.0m</span>
            </div>
          </div>
        </div>
        
        {/* 地图渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/20 to-transparent pointer-events-none" />
      </div>

      {/* 侧边内容面板 - 移至右侧 */}
      <aside 
        className={`absolute right-0 top-16 bottom-0 z-20 transition-all duration-500 ease-in-out
          ${isSidebarOpen ? 'w-[450px]' : 'w-0 overflow-hidden'}`}
      >
        <div className="h-full glass-panel border-l border-white/5 flex flex-col">
          {/* 面板头部 */}
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-serif font-bold text-paper tracking-wider">
                古建筑<span className="text-gold">谱系</span>
              </h1>
              <div className="h-px w-12 bg-cinnabar" />
              <p className="text-xs text-paper/40 tracking-[0.2em] font-light">
                FOUND {filtered.length} ARCHITECTURAL GENES
              </p>
            </div>

            {/* 筛选标签 */}
            <div className="flex gap-2">
              {[
                { key: 'all', label: '全部数据' },
                { key: 'ready', label: '已完成' },
                { key: 'pending', label: '待抢救' },
              ].map(({ key, label }) => {
                const isActive = filter === key
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key as typeof filter)}
                    className={`px-4 py-2 text-[10px] font-bold tracking-[0.1em] transition-all duration-300 rounded-sm
                      ${isActive 
                        ? 'bg-cinnabar text-white cinnabar-glow' 
                        : 'bg-white/5 text-paper/40 hover:bg-white/10 hover:text-paper border border-white/5'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 建筑列表 - 滚动区 */}
          <div className="flex-1 overflow-y-auto px-8 pb-12 custom-scrollbar">
            <div className="space-y-6">
              {filtered.map((building) => (
                <BuildingCard key={building.id} building={building} />
              ))}
              
              {filtered.length === 0 && (
                <div className="py-20 text-center space-y-4">
                  <div className="w-12 h-px bg-white/10 mx-auto" />
                  <p className="text-paper/20 text-xs tracking-widest uppercase">No Records Found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* 侧边栏切换按钮 - 随侧边栏移动 */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={`absolute z-30 top-1/2 -translate-y-1/2 transition-all duration-500 flex items-center justify-center
          ${isSidebarOpen ? 'right-[450px]' : 'right-0'} 
          w-6 h-20 bg-ink/60 backdrop-blur border border-white/10 text-paper/40 hover:text-paper hover:bg-ink rounded-l-md`}
      >
        <span className="text-[10px] transform -rotate-90 whitespace-nowrap tracking-[0.3em]">
          {isSidebarOpen ? 'CLOSE' : 'LIST'}
        </span>
      </button>

      {/* 地图浮动工具栏 - 移至左侧 */}
      <div className="absolute left-8 bottom-8 z-20 flex flex-col gap-3">
        {['+', '-', '⊙', '▤'].map(tool => (
          <button key={tool} className="w-10 h-10 glass-panel hover:bg-white/10 flex items-center justify-center text-lg text-paper/40 hover:text-gold transition-colors font-bold">
            {tool}
          </button>
        ))}
      </div>
    </div>
  )
}
