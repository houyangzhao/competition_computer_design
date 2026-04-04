import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import SplatViewer from '../components/SplatViewer'
import ChatPanel from '../components/ChatPanel'
import KnowledgeCard from '../components/KnowledgeCard'
import { getBuildingById } from '../data/buildings'
import type { KnowledgeItem } from '../types'

// 示例知识卡片数据，后续从 API 加载
const DEMO_KNOWLEDGE: KnowledgeItem[] = [
  { term: '庑殿顶', description: '中国古建筑屋顶等级最高的形式，四面斜坡，有一条正脊和四条垂脊，常见于皇家宫殿。' },
  { term: '斗拱', description: '中国古建筑特有的榫卯结构，位于柱顶，通过层层出挑传递屋顶荷载，兼具装饰与结构功能。' },
  { term: '彩画', description: '施于梁枋之上的彩色装饰纹样，按等级分为和玺彩画、旋子彩画、苏式彩画。' },
]

export default function BuildingPage() {
  const { id } = useParams<{ id: string }>()
  const building = getBuildingById(id ?? '')
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge'>('knowledge')
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  if (!building) {
    return (
      <div className="pt-20 flex flex-col items-center justify-center h-screen bg-ink text-paper/40">
        <p className="font-serif text-xl">未找到该建筑档案</p>
        <Link to="/explore" className="mt-4 text-gold hover:underline text-sm tracking-widest">
          返回探索
        </Link>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-ink">
      {/* 全屏 3D 漫游区 */}
      <div className="absolute inset-0 z-0">
        {building.status === 'ready' && building.modelPath ? (
          <SplatViewer 
            modelPath={building.modelPath} 
            initialCameraPosition={[2, -1.5, -2]}
            initialCameraLookAt={[0, 0, 0]}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/60 backdrop-blur-sm gap-6 z-10">
            <div className="w-24 h-24 bg-cinnabar/20 rounded-full flex items-center justify-center animate-pulse border border-cinnabar/30">
              <span className="text-4xl">🏛</span>
            </div>
            <div className="text-center space-y-2">
              <p className="text-paper/80 font-serif text-xl tracking-widest">数字基因缺失</p>
              <p className="text-paper/40 text-xs tracking-widest uppercase font-light">3D RECONSTRUCTION PENDING</p>
            </div>
            <Link
              to={`/reconstruct`}
              className="px-8 py-3 bg-cinnabar text-white text-xs font-bold tracking-[0.2em] rounded-sm transition-all gold-border cinnabar-glow"
            >
              贡献照片 · 开启抢救
            </Link>
          </div>
        )}
      </div>

      {/* 顶部遮罩 */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ink/80 to-transparent pointer-events-none z-10" />

      {/* 左侧：建筑基本信息（常驻） */}
      <div className={`absolute left-8 bottom-8 z-20 transition-all duration-700 max-w-lg pointer-events-none ${isPanelOpen ? 'opacity-100' : 'opacity-40 translate-y-4'}`}>
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-5xl font-serif font-bold text-paper tracking-wider drop-shadow-2xl">
              {building.name}
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-gold font-serif tracking-widest text-lg">{building.dynasty}</span>
              <div className="h-px w-8 bg-white/20" />
              <span className="text-paper/60 text-xs tracking-[0.2em] uppercase font-light">{building.location}</span>
            </div>
          </div>
          <p className="text-paper/40 text-sm leading-relaxed tracking-widest font-light line-clamp-3 bg-ink/40 p-4 rounded-sm backdrop-blur-sm border-l border-cinnabar/40">
            {building.description}
          </p>
        </div>
      </div>

      {/* 右侧：AI 讲解与知识面板 */}
      <div 
        className={`absolute right-0 top-16 bottom-0 z-30 transition-all duration-500 ease-in-out
          ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full w-96 glass-panel border-l border-white/5 flex flex-col">
          {/* Tab 切换 */}
          <div className="flex border-b border-white/5">
            {[
              { key: 'knowledge', label: '建筑构件知识' },
              { key: 'chat', label: 'AI 实时讲解' },
            ].map(({ key, label }) => {
              const isActive = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={`flex-1 py-5 text-[10px] font-bold tracking-[0.2em] uppercase transition-all
                    ${isActive 
                      ? 'text-gold bg-white/5 border-b border-gold' 
                      : 'text-paper/30 hover:text-paper hover:bg-white/5 border-b border-transparent'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {activeTab === 'knowledge' ? (
              <div className="space-y-4">
                {DEMO_KNOWLEDGE.map((item) => (
                  <KnowledgeCard key={item.term} item={item} />
                ))}
                <div className="pt-8 text-center opacity-20">
                   <div className="w-12 h-px bg-white/40 mx-auto mb-4" />
                   <p className="text-[8px] tracking-[0.3em]">END OF RECORDS</p>
                </div>
              </div>
            ) : (
              <ChatPanel buildingId={building.id} />
            )}
          </div>
        </div>
      </div>

      {/* 面板开关控制 */}
      <button 
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className={`absolute z-40 right-4 top-1/2 -translate-y-1/2 w-10 h-10 glass-panel flex items-center justify-center text-paper/40 hover:text-gold transition-all duration-300 rounded-full
          ${isPanelOpen ? 'rotate-0' : 'rotate-180 translate-x-2'}`}
      >
        <span className="text-xs tracking-tighter">{isPanelOpen ? '→' : '←'}</span>
      </button>

      {/* 操作提示面板（沉浸式） */}
      <div className={`absolute bottom-8 right-12 z-20 flex gap-4 transition-all duration-500 ${isPanelOpen ? 'opacity-0' : 'opacity-60'}`}>
        <div className="flex gap-4 text-[9px] text-paper/40 font-mono tracking-widest bg-ink/40 px-6 py-2 rounded-full backdrop-blur-sm">
          <span>MOUSE L: ROTATE</span>
          <span>MOUSE R: PAN</span>
          <span>SCROLL: ZOOM</span>
        </div>
      </div>
    </div>
  )
}
