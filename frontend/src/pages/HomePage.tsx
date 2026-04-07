import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import * as THREE from 'three'

/**
 * 首页 Hero 背景：木雕 splat 模型自动平移 + 微摆动
 */
function HeroSplatBg() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const cameraUp: [number, number, number] = [0.20, -0.02, -0.98]
    const startPos: [number, number, number] = [2.70, 1.56, 0.41]
    const startLookAt: [number, number, number] = [-0.38, 1.80, -0.19]
    const endPos: [number, number, number] = [2.20, -3.43, 0.51]
    const endLookAt: [number, number, number] = [-1.73, -2.88, -0.54]

    const viewer = new GaussianSplats3D.Viewer({
      cameraUp,
      initialCameraPosition: startPos,
      initialCameraLookAt: startLookAt,
      rootElement: containerRef.current,
      useBuiltInControls: false,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
      dynamicScene: true,
    })

    let disposed = false
    let rafId = 0

    viewer
      .addSplatScene('/generated/mudiao.splat', { splatAlphaRemovalThreshold: 5 })
      .then(() => {
        if (disposed) return
        viewer.start()

        const camera = viewer.camera
        camera.up.set(...cameraUp)
        camera.position.set(...startPos)
        camera.lookAt(new THREE.Vector3(...startLookAt))

        const DURATION = 25
        const sPos = new THREE.Vector3(...startPos)
        const ePos = new THREE.Vector3(...endPos)
        const sLook = new THREE.Vector3(...startLookAt)
        const eLook = new THREE.Vector3(...endLookAt)
        const upVec = new THREE.Vector3(...cameraUp).normalize()
        const SWAY_ANGLE = 0.06
        const SWAY_SPEED = 0.7
        let time = 0

        const animate = () => {
          rafId = requestAnimationFrame(animate)
          time += 0.016

          const t = (Math.sin((time / DURATION) * Math.PI * 2 - Math.PI / 2) + 1) / 2
          const sway = Math.sin(time * SWAY_SPEED) * SWAY_ANGLE

          camera.position.lerpVectors(sPos, ePos, t)
          const currentLookAt = new THREE.Vector3().lerpVectors(sLook, eLook, t)
          const offset = currentLookAt.clone().sub(camera.position)
          offset.applyAxisAngle(upVec, sway)
          currentLookAt.copy(camera.position).add(offset)

          camera.lookAt(currentLookAt)
          camera.up.set(...cameraUp)
        }
        rafId = requestAnimationFrame(animate)
      })
      .catch((err: unknown) => console.error('Hero splat load error:', err))

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      viewer.dispose()
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0 z-0 bg-ink" />
}

export default function HomePage() {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-ink">
      <HeroSplatBg />

      {/* 顶部渐变遮罩 */}
      <div className="absolute inset-x-0 top-0 h-32 z-10 bg-gradient-to-b from-ink/80 to-transparent pointer-events-none" />

      {/* 核心内容 */}
      <div className="relative z-30 h-full flex flex-col items-center justify-center px-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <h1 className="text-7xl md:text-8xl font-serif font-bold tracking-[0.5em] pl-[0.5em] text-white leading-none drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]">
            筑<span className="text-cinnabar">忆</span>
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6 pointer-events-auto"
        >
          <Link
            to="/explore"
            className="group relative px-12 py-4 bg-cinnabar hover:bg-cinnabar/90 text-white text-sm font-bold tracking-[0.3em] rounded transition-all shadow-[0_4px_20px_rgba(0,0,0,0.4)] overflow-hidden"
          >
            <span className="relative z-10">探索数字档案</span>
            <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          </Link>
          <Link
            to="/reconstruct"
            className="px-12 py-4 bg-white/30 backdrop-blur-md text-ink text-sm font-bold tracking-[0.3em] rounded transition-all hover:bg-white/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
          >
            发起重建申请
          </Link>
        </motion.div>
      </div>

      {/* 底部理念栏 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2.5 }}
        className="absolute inset-x-0 bottom-0 z-20 pointer-events-none"
      >
        <div className="bg-gradient-to-t from-ink/80 to-transparent pt-16 pb-6 px-8">
          <p className="text-left text-sm text-paper/70 font-serif tracking-[0.3em] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            我们不与专业测绘比精度，只为在它们消失前留下最后的数字基因
          </p>
        </div>
      </motion.div>
    </div>
  )
}
