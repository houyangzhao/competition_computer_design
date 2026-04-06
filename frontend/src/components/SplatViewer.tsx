import { useEffect, useRef, useState, useCallback } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

const DEFAULT_CAMERA_UP: [number, number, number] = [0, -1, 0]
const DEFAULT_CAMERA_POSITION: [number, number, number] = [2, -2, -2]
const DEFAULT_CAMERA_LOOK_AT: [number, number, number] = [0, 0, 0]

interface SplatViewerProps {
  modelPath: string
  cameraUp?: [number, number, number]
  initialCameraPosition?: [number, number, number]
  initialCameraLookAt?: [number, number, number]
  className?: string
}

const MOVE_SPEED = 0.02  // 每帧移动距离（scene units）
const KEYS: Record<string, boolean> = {}

function fmt(v: THREE.Vector3) {
  return `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}]`
}

export default function SplatViewer({
  modelPath,
  cameraUp = DEFAULT_CAMERA_UP,
  initialCameraPosition = DEFAULT_CAMERA_POSITION,
  initialCameraLookAt = DEFAULT_CAMERA_LOOK_AT,
  className = '',
}: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<InstanceType<typeof GaussianSplats3D.Viewer> | null>(null)
  const plcRef = useRef<PointerLockControls | null>(null)
  const rafRef = useRef<number>(0)
  const [locked, setLocked] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const captureCamera = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    try {
      // @ts-ignore
      const cam: THREE.PerspectiveCamera = viewer.camera
      if (!cam) return
      const pos = cam.position.clone()
      const up = cam.up.clone()
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
      const lookAt = pos.clone().addScaledVector(dir, pos.length())
      const info = `position: ${fmt(pos)}\nup:       ${fmt(up)}\nlookAt:   ${fmt(lookAt)}`
      setDebugInfo(info)
      console.log('[SplatViewer camera]\n' + info)
    } catch {
      setDebugInfo('无法读取相机参数')
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    // ── 1. 启动 Viewer（禁用内置 controls）─────────────────────────
    const viewer = new GaussianSplats3D.Viewer({
      cameraUp,
      initialCameraPosition,
      initialCameraLookAt,
      rootElement: containerRef.current,
      useBuiltInControls: false,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Gradual,
    })
    viewerRef.current = viewer

    viewer
      .addSplatScene(modelPath, { splatAlphaRemovalThreshold: 5 })
      .then(() => {
        viewer.start()

        // ── 2. 绑定 PointerLockControls ──────────────────────────────
        // @ts-ignore
        const camera: THREE.PerspectiveCamera = viewer.camera
        // @ts-ignore
        const renderer: THREE.WebGLRenderer = viewer.renderer

        const plc = new PointerLockControls(camera, renderer.domElement)
        plcRef.current = plc

        plc.addEventListener('lock',   () => setLocked(true))
        plc.addEventListener('unlock', () => setLocked(false))

        // ── 3. 键盘事件 ──────────────────────────────────────────────
        const onKeyDown = (e: KeyboardEvent) => { KEYS[e.code] = true }
        const onKeyUp   = (e: KeyboardEvent) => { KEYS[e.code] = false }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup',   onKeyUp)

        // ── 4. 每帧移动逻辑 ──────────────────────────────────────────
        // 移动方向向量（不含 up 分量，在 cameraUp 平面内移动）
        const upVec = new THREE.Vector3(...cameraUp).normalize()
        const tmpFwd  = new THREE.Vector3()
        const tmpRight = new THREE.Vector3()

        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          if (!plc.isLocked) return

          // 相机朝向（水平分量）
          camera.getWorldDirection(tmpFwd)
          tmpFwd.sub(upVec.clone().multiplyScalar(tmpFwd.dot(upVec))).normalize()
          tmpRight.crossVectors(tmpFwd, upVec).normalize()

          const speed = MOVE_SPEED * (KEYS['ShiftLeft'] || KEYS['ShiftRight'] ? 3 : 1)

          if (KEYS['KeyW'] || KEYS['ArrowUp'])    camera.position.addScaledVector(tmpFwd,   speed)
          if (KEYS['KeyS'] || KEYS['ArrowDown'])  camera.position.addScaledVector(tmpFwd,  -speed)
          if (KEYS['KeyA'] || KEYS['ArrowLeft'])  camera.position.addScaledVector(tmpRight, -speed)
          if (KEYS['KeyD'] || KEYS['ArrowRight']) camera.position.addScaledVector(tmpRight,  speed)
          if (KEYS['Space'])     camera.position.addScaledVector(upVec,  speed)
          if (KEYS['KeyQ'] || KEYS['KeyC']) camera.position.addScaledVector(upVec, -speed)
        }
        rafRef.current = requestAnimationFrame(loop)

        // cleanup
        return () => {
          cancelAnimationFrame(rafRef.current)
          window.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('keyup',   onKeyUp)
          plc.dispose()
        }
      })
      .catch((err: unknown) => console.error('SplatViewer load error:', err))

    return () => {
      cancelAnimationFrame(rafRef.current)
      viewerRef.current?.dispose()
      viewerRef.current = null
      plcRef.current = null
    }
  }, [modelPath])

  const handleClick = () => {
    plcRef.current?.lock()
  }

  return (
    <div className={`relative w-full h-full ${className}`} onClick={handleClick}>
      <div ref={containerRef} className="w-full h-full" />

      {/* 未锁定时的提示覆盖层 */}
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded px-6 py-4 text-center space-y-2">
            <p className="text-paper/90 text-sm tracking-widest">点击进入漫游模式</p>
            <p className="text-paper/40 text-xs font-mono">
              WASD 移动 · 鼠标转视角 · Space 上升 · Q 下降 · Shift 加速 · ESC 退出
            </p>
          </div>
        </div>
      )}

      {/* 锁定时的准星 */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-1 h-1 bg-white/60 rounded-full" />
        </div>
      )}

      {/* Debug 按钮 */}
      <button
        onClick={e => { e.stopPropagation(); setShowDebug(v => !v); captureCamera() }}
        className="absolute bottom-4 right-4 z-50 px-2 py-1 text-[10px] font-mono bg-black/60 text-white/60 hover:text-white rounded border border-white/20"
      >
        {showDebug ? '隐藏相机' : '相机参数'}
      </button>

      {showDebug && (
        <div className="absolute bottom-12 right-4 z-50 bg-black/80 text-green-400 font-mono text-[11px] px-3 py-2 rounded border border-white/10 whitespace-pre leading-5">
          <div className="text-white/40 mb-1 text-[10px]">当前相机</div>
          {debugInfo ?? '点击"相机参数"刷新'}
          <button
            onClick={e => { e.stopPropagation(); captureCamera() }}
            className="block mt-2 text-[10px] text-white/40 hover:text-white"
          >
            ↻ 刷新
          </button>
        </div>
      )}
    </div>
  )
}
