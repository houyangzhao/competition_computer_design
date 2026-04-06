import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

/**
 * 重建动画背景组件
 * 模拟照片碎片汇聚成 3D 模型的过程
 */
function ReconstructionBg() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  // 生成一些随机的“碎片”路径
  const fragments = Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    initialX: Math.random() * 100 - 50 + '%',
    initialY: Math.random() * 100 - 50 + '%',
    rotation: Math.random() * 360,
    size: Math.random() * 80 + 40,
    delay: Math.random() * 2,
  }))

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-ink">
      {/* 核心英雄图：作为汇聚后的最终结果 */}
      <motion.div
        initial={{ opacity: 0, scale: 1.1, filter: 'blur(20px) grayscale(0.5)' }}
        animate={{ 
          opacity: isLoaded ? 0.4 : 0, 
          scale: 1, 
          filter: 'blur(8px) grayscale(0.2)' 
        }}
        transition={{ duration: 3, ease: "easeOut" }}
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url("/src/assets/hero.png")' }}
      />

      {/* 漂浮碎片层 */}
      <div className="absolute inset-0 flex items-center justify-center">
        {fragments.map((frag) => (
          <motion.div
            key={frag.id}
            initial={{ 
              x: frag.initialX, 
              y: frag.initialY, 
              opacity: 0, 
              rotate: frag.rotation,
              scale: 0.5
            }}
            animate={{ 
              x: 0, 
              y: 0, 
              opacity: [0, 0.4, 0],
              rotate: 0,
              scale: 1.2
            }}
            transition={{ 
              duration: 4, 
              delay: frag.delay,
              repeat: Infinity,
              repeatType: "loop",
              ease: "easeInOut"
            }}
            className="absolute w-12 h-16 bg-white/5 border border-white/10 backdrop-blur-sm rounded-sm"
          />
        ))}
      </div>

      {/* 数字化扫描线 */}
      <motion.div
        initial={{ top: '-10%' }}
        animate={{ top: '110%' }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/30 to-transparent shadow-[0_0_15px_rgba(212,175,55,0.3)] z-10"
      />

      {/* 艺术遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink via-transparent to-ink z-20" />
      <div className="absolute inset-0 bg-radial-at-center from-transparent to-ink/60 z-20" />
    </div>
  )
}

export default function HomePage() {
  const stats = [
    { label: '已抢救模型', value: '1,284' },
    { label: '众包照片', value: '42,900+' },
    { label: '覆盖省份', value: '28' },
  ]

  return (
    <div className="relative w-full h-screen overflow-hidden bg-ink">
      <ReconstructionBg />

      {/* 核心内容区 */}
      <div className="relative z-30 h-full flex flex-col items-center justify-center px-6 pointer-events-none">
        <div className="max-w-4xl w-full text-center space-y-10 pointer-events-auto">
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2 }}
              className="space-y-4"
            >
              <h1 className="text-8xl md:text-9xl font-serif font-bold tracking-[0.4em] text-paper drop-shadow-2xl">
                筑<span className="text-cinnabar">忆</span>
              </h1>
              <div className="h-px w-32 bg-gold/40 mx-auto" />
              <p className="text-xl md:text-2xl text-paper/80 font-serif tracking-[0.4em] uppercase">
                濒危古建筑数字抢救平台
              </p>
            </motion.div>
          </div>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.5 }}
            className="max-w-xl mx-auto text-paper/60 text-sm md:text-base leading-relaxed tracking-[0.2em] font-light font-serif"
          >
            我们不与专业测绘比精度，只为在它们消失前留下最后的数字基因。
            <br />
            手机拍照，AI 自动重建，全民参与的数字文保行动。
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-8 pt-6"
          >
            <Link
              to="/explore"
              className="group relative px-12 py-4 bg-cinnabar/90 hover:bg-cinnabar text-white text-sm font-bold tracking-[0.3em] rounded-sm transition-all gold-border cinnabar-glow overflow-hidden"
            >
              <span className="relative z-10">探索数字档案</span>
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Link>
            <Link
              to="/reconstruct"
              className="px-12 py-4 glass-panel text-paper/80 hover:text-paper text-sm font-bold tracking-[0.3em] rounded-sm transition-all hover:bg-white/5 border-white/10"
            >
              开始图像重建
            </Link>
          </motion.div>
        </div>

        {/* 底部实时数据面板 */}
        <div className="absolute bottom-16 left-0 right-0 px-16 hidden lg:block animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-1000 pointer-events-auto">
          <div className="max-w-7xl mx-auto flex justify-between items-end border-t border-white/5 pt-10">
            <div className="flex gap-24">
              {stats.map((stat) => (
                <div key={stat.label} className="space-y-2">
                  <p className="text-[10px] text-paper/30 uppercase tracking-[0.3em]">{stat.label}</p>
                  <p className="text-3xl font-serif text-gold/80 tracking-tighter">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="text-right flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-gold/60 animate-pulse" />
              <p className="text-[10px] text-paper/30 uppercase tracking-[0.3em]">AI Reconstruction Engine v2.5 Stable</p>
            </div>
          </div>
        </div>
      </div>

      {/* 边缘虚化效果：增强景深感 */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-ink/90 to-transparent pointer-events-none z-30" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink/90 to-transparent pointer-events-none z-30" />
    </div>
  )
}
