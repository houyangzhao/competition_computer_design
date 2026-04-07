import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * 高性能 Three.js 重建背景
 * 优化粒子大小与模型比例，确保背景建筑清晰可见
 */
function ThreeReconstructionBg() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!containerRef.current) return

    // --- Scene Setup ---
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 5000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.current.appendChild(renderer.domElement)

    // --- Particles Setup ---
    const count = 18000 // 进一步增加点数以提高覆盖感
    const positions = new Float32Array(count * 3)
    const targetPositions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // 初始散布更广，模拟未处理的噪声点
      positions[i * 3] = (Math.random() - 0.5) * 3000
      positions[i * 3 + 1] = (Math.random() - 0.5) * 3000
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3000

      targetPositions[i * 3] = positions[i * 3]
      targetPositions[i * 3 + 1] = positions[i * 3 + 1]
      targetPositions[i * 3 + 2] = positions[i * 3 + 2]

      colors[i * 3] = 0.6; colors[i * 3 + 1] = 0.5; colors[i * 3 + 2] = 0.3
      sizes[i] = Math.random() * 5 + 2 // 增大基础粒子尺寸
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    // 优化的着色器：增强发光感和扫描高亮
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScanLine: { value: -500 },
        uOpacity: { value: 0.9 }
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uScanLine;
        
        void main() {
          vColor = color;
          
          // 强化扫描线视觉冲击
          float dist = abs(position.y - uScanLine);
          float highlight = smoothstep(120.0, 0.0, dist);
          vColor += highlight * vec3(0.5, 0.4, 0.2); // 扫描时带出强烈金光
          
          vAlpha = 0.5 + highlight * 0.5;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // 显著增加点的大小计算逻辑
          gl_PointSize = size * (450.0 / -mvPosition.z) * (1.0 + highlight * 1.5);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          // 柔边粒子
          float strength = pow(1.0 - (d * 2.0), 1.5);
          gl_FragColor = vec4(vColor, vAlpha * strength);
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    camera.position.z = 1100 // 拉开距离，配合更大的点
    camera.position.y = 150

    fetch('/models/wumen_points.json')
      .then(res => {
        if (!res.ok) return null
        return res.json()
      })
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) return
        const dataSize = data.length
        const scale = 110.0 // 显著增加模型缩放，使其填满背景

        for (let i = 0; i < count; i++) {
          const p = data[i % dataSize]
          if (!Array.isArray(p) || p.length < 6) continue
          targetPositions[i * 3] = p[0] * scale
          targetPositions[i * 3 + 1] = -p[1] * scale - 100
          targetPositions[i * 3 + 2] = p[2] * scale

          colors[i * 3] = Math.min(1.0, (p[3] / 255) * 1.5)
          colors[i * 3 + 1] = Math.min(1.0, (p[4] / 255) * 1.5)
          colors[i * 3 + 2] = Math.min(1.0, (p[5] / 255) * 1.5)
        }
        geometry.attributes.color.needsUpdate = true
      })
      .catch(() => {})

    // --- Animation Loop ---
    let time = 0
    let scanY = -800

    const animate = () => {
      requestAnimationFrame(animate)
      time += 0.005
      
      scanY += 5
      if (scanY > 1000) scanY = -1000
      material.uniforms.uScanLine.value = scanY
      material.uniforms.uTime.value = time

      // 保持高度稳定的建筑形态 (progress 在 0.85 到 1.0 之间)
      const progress = 0.85 + Math.sin(time * 0.4) * 0.15
      
      const posAttr = geometry.attributes.position
      for (let i = 0; i < count; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2
        posAttr.array[ix] += (targetPositions[ix] * progress + (positions[ix] * (1-progress)) - posAttr.array[ix]) * 0.04
        posAttr.array[iy] += (targetPositions[iy] * progress + (positions[iy] * (1-progress)) - posAttr.array[iy]) * 0.04
        posAttr.array[iz] += (targetPositions[iz] * progress + (positions[iz] * (1-progress)) - posAttr.array[iz]) * 0.04
      }
      posAttr.needsUpdate = true

      points.rotation.y += 0.0015
      renderer.render(scene, camera)
    }
    animate()

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

  return <div ref={containerRef} className="absolute inset-0 z-0 bg-ink" />
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

      {/* 遮罩：让背景更深邃，减少对文字的干扰，但不遮挡建筑 */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-ink/90 via-transparent to-ink/90 pointer-events-none" />
      <div className="absolute inset-0 z-10 bg-radial-at-center from-transparent via-transparent to-ink/40 pointer-events-none" />

      {/* 核心内容区 */}
      <div className="relative z-30 h-full flex flex-col items-center justify-center px-6 pointer-events-none">
        <div className="max-w-5xl w-full text-center space-y-8 pointer-events-auto">
          {/* 标题区：显著缩小字号，避免喧宾夺主 */}
          <div className="relative py-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            >
              <div className="flex items-center justify-center gap-10 mb-4">
                <div className="h-px w-20 bg-gradient-to-r from-transparent to-gold/40" />
                <h1 className="text-7xl md:text-8xl font-serif font-bold tracking-[0.5em] text-paper/90 leading-none drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                  筑<span className="text-cinnabar relative inline-block">忆
                    <span className="absolute -right-10 top-2 text-xs font-mono tracking-normal text-gold/50 opacity-80">
                      RECON
                    </span>
                  </span>
                </h1>
                <div className="h-px w-20 bg-gradient-to-l from-transparent to-gold/40" />
              </div>
              <p className="text-lg md:text-xl text-gold/80 font-serif tracking-[0.8em] uppercase pl-[0.8em] drop-shadow-lg">
                濒危古建筑数字抢救平台
              </p>
            </motion.div>
          </div>

          {/* 核心理念 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.6 }}
            className="max-w-3xl mx-auto"
          >
            <p className="text-paper/70 text-sm md:text-base leading-loose tracking-[0.25em] font-light font-serif [text-shadow:_0_2px_8px_rgba(0,0,0,1)]">
              我们不与专业测绘比精度，只为在它们消失前留下最后的数字基因。
              <br />
              <span className="text-paper/40 italic">基于 18,000 个真实特征点的多维动态重构</span>
            </p>
          </motion.div>

          {/* 交互按钮 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-8 pt-4"
          >
            <Link
              to="/explore"
              className="group relative px-14 py-4 bg-cinnabar/95 hover:bg-cinnabar text-white text-xs font-bold tracking-[0.4em] rounded-sm transition-all gold-border cinnabar-glow overflow-hidden shadow-2xl"
            >
              <span className="relative z-10">探索数字档案</span>
              <div className="absolute inset-0 bg-gold/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
            </Link>
            <Link
              to="/reconstruct"
              className="px-14 py-4 glass-panel text-paper/90 hover:text-paper text-xs font-bold tracking-[0.4em] rounded-sm transition-all hover:bg-white/10 border-white/20 hover:border-gold/40 shadow-xl bg-ink/60"
            >
              发起重建申请
            </Link>
          </motion.div>
        </div>

        {/* 底部实时状态栏 */}
        <div className="absolute bottom-10 left-0 right-0 px-20 hidden lg:block">
          <div className="max-w-7xl mx-auto flex justify-between items-end border-t border-white/10 pt-8">
            <div className="flex gap-16">
              {stats.map((stat) => (
                <div key={stat.label} className="space-y-2">
                  <p className="text-[10px] text-paper/30 uppercase tracking-[0.4em]">{stat.label}</p>
                  <p className="text-3xl font-serif text-gold/70 tracking-tighter tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col items-end gap-2 font-mono text-[9px] text-paper/40 tracking-widest uppercase">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span>Feature Extraction: Stable</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-gold/70" />
                <span>Points Density: 1.8e4 Refined</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none z-40 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
    </div>
  )
}
