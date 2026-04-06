import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * 高性能 Three.js 重建背景
 * 模拟数千个特征点的采集与汇聚过程
 */
function ThreeReconstructionBg() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!containerRef.current) return

    // --- Scene Setup ---
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.current.appendChild(renderer.domElement)

    // --- Particles ---
    const count = 4000
    const positions = new Float32Array(count * 3)
    const targetPositions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    const goldColor = new THREE.Color('#d4af37')
    const cinnabarColor = new THREE.Color('#c43c22')

    for (let i = 0; i < count; i++) {
      // 初始随机云状态
      positions[i * 3] = (Math.random() - 0.5) * 1000
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1000
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1000

      // 目标结构状态 (模拟一个大殿的轮廓：底部矩形 + 斗拱层 + 屋顶)
      const r = Math.random()
      if (r < 0.4) {
        // 底部基座/柱廊区
        targetPositions[i * 3] = (Math.random() - 0.5) * 400
        targetPositions[i * 3 + 1] = (Math.random() - 0.8) * 200 - 50
        targetPositions[i * 3 + 2] = (Math.random() - 0.5) * 200
      } else if (r < 0.7) {
        // 庑殿顶/歇山顶轮廓 (梯形)
        const ty = Math.random() * 150
        const widthAtY = 450 - ty * 1.5
        targetPositions[i * 3] = (Math.random() - 0.5) * widthAtY
        targetPositions[i * 3 + 1] = ty + 50
        targetPositions[i * 3 + 2] = (Math.random() - 0.5) * (200 - ty * 0.5)
      } else {
        // 飞檐/细部散点
        const angle = Math.random() * Math.PI * 2
        const rad = 200 + Math.random() * 50
        targetPositions[i * 3] = Math.cos(angle) * rad * (Math.random() > 0.5 ? 1 : -1)
        targetPositions[i * 3 + 1] = Math.random() * 100 + 20
        targetPositions[i * 3 + 2] = Math.sin(angle) * rad
      }

      // 颜色混合
      const mix = Math.random()
      const color = mix > 0.8 ? cinnabarColor : goldColor
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
      
      sizes[i] = Math.random() * 2 + 0.5
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    camera.position.z = 600

    // --- Animation Loop ---
    let time = 0
    
    const animate = () => {
      requestAnimationFrame(animate)
      time += 0.005
      
      // 周期性改变汇聚程度 (使用 sin 平滑过渡)
      const progress = (Math.sin(time * 0.5) + 1) / 2 
      
      const posAttr = geometry.attributes.position
      for (let i = 0; i < count; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2
        
        // 这里的 lerp 逻辑实现了汇聚效果
        // 从原始随机位置到目标结构位置的插值
        posAttr.array[ix] += (targetPositions[ix] * progress + (positions[ix] * (1-progress)) - posAttr.array[ix]) * 0.05
        posAttr.array[iy] += (targetPositions[iy] * progress + (positions[iy] * (1-progress)) - posAttr.array[iy]) * 0.05
        posAttr.array[iz] += (targetPositions[iz] * progress + (positions[iz] * (1-progress)) - posAttr.array[iz]) * 0.05
      }
      posAttr.needsUpdate = true

      // 场景整体缓慢旋转
      points.rotation.y += 0.001
      points.rotation.x = Math.sin(time * 0.2) * 0.1

      renderer.render(scene, camera)
    }
    animate()

    // --- Handle Resize ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 bg-ink" />
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
      <ThreeReconstructionBg />

      {/* 遮罩层：增加景深感 */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-ink/60 via-transparent to-ink/90 pointer-events-none" />
      <div className="absolute inset-0 z-10 bg-radial-at-center from-transparent to-ink/40 pointer-events-none" />

      {/* 核心内容区 */}
      <div className="relative z-30 h-full flex flex-col items-center justify-center px-6 pointer-events-none">
        <div className="max-w-5xl w-full text-center space-y-12 pointer-events-auto">
          {/* 标题区 */}
          <div className="relative py-12">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            >
              <div className="flex items-center justify-center gap-12 mb-6">
                <div className="h-px w-24 bg-gradient-to-r from-transparent to-gold/40" />
                <h1 className="text-9xl md:text-[11rem] font-serif font-bold tracking-[0.6em] text-paper/90 leading-none">
                  筑<span className="text-cinnabar relative inline-block">忆
                    <span className="absolute -right-12 top-2 text-sm font-mono tracking-normal text-gold/40 opacity-60">
                      RECON v2.5
                    </span>
                  </span>
                </h1>
                <div className="h-px w-24 bg-gradient-to-l from-transparent to-gold/40" />
              </div>
              <p className="text-xl md:text-2xl text-gold/60 font-serif tracking-[0.8em] uppercase pl-[0.8em]">
                濒危古建筑数字抢救平台
              </p>
            </motion.div>
          </div>

          {/* 核心理念 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2, delay: 0.8 }}
            className="max-w-2xl mx-auto"
          >
            <p className="text-paper/50 text-base md:text-lg leading-loose tracking-[0.3em] font-light font-serif">
              从照片碎片到三维永恒
              <br />
              <span className="text-paper/30 italic">让消失的文明在数字空间中重生</span>
            </p>
          </motion.div>

          {/* 交互按钮 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-10 pt-8"
          >
            <Link
              to="/explore"
              className="group relative px-16 py-5 bg-cinnabar/90 hover:bg-cinnabar text-white text-sm font-bold tracking-[0.4em] rounded-sm transition-all gold-border cinnabar-glow overflow-hidden"
            >
              <span className="relative z-10">探索数字档案</span>
              <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
            </Link>
            <Link
              to="/reconstruct"
              className="px-16 py-5 glass-panel text-paper/80 hover:text-paper text-sm font-bold tracking-[0.4em] rounded-sm transition-all hover:bg-white/5 border-white/10 hover:border-gold/30"
            >
              发起重建申请
            </Link>
          </motion.div>
        </div>

        {/* 底部实时状态栏 */}
        <div className="absolute bottom-12 left-0 right-0 px-20 hidden lg:block">
          <div className="max-w-7xl mx-auto flex justify-between items-end border-t border-white/5 pt-10">
            <div className="flex gap-20">
              {stats.map((stat) => (
                <div key={stat.label} className="space-y-3">
                  <p className="text-[10px] text-paper/20 uppercase tracking-[0.4em]">{stat.label}</p>
                  <p className="text-4xl font-serif text-gold/60 tracking-tighter tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col items-end gap-3 font-mono text-[9px] text-paper/20 tracking-widest uppercase">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-pulse" />
                <span>Feature Extraction: Active</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-gold/30" />
                <span>SfM Pipeline: Optimized</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 边缘虚化与噪点 */}
      <div className="absolute inset-0 pointer-events-none z-40 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
    </div>
  )
}
