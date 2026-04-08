import { useEffect, useRef, useState, useCallback } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import * as THREE from 'three'

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
  const rafRef = useRef<number>(0)
  const fallbackLockedRef = useRef(false)
  const [locked, setLocked] = useState(false)
  const [normalRotateMode, setNormalRotateMode] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const captureCamera = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    try {
      const cam = viewer.camera
      if (!cam) return
      const pos = cam.position.clone()
      const up = cam.up.clone()
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
      const lookAt = pos.clone().addScaledVector(dir, pos.length())
      const info = `position: ${fmt(pos)}\nup:       ${fmt(up)}\nlookAt:   ${fmt(lookAt)}`
      setDebugInfo(info)
      console.log('[SplatViewer camera]\n' + info)
    } catch {
      setDebugInfo('暂时无法读取视角信息')
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    let cleanupViewerControls: (() => void) | null = null
    let disposed = false

    // ── 1. 启动 Viewer（禁用内置 controls）─────────────────────────
    const KEYS: Record<string, boolean> = {}

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
        if (disposed) {
          viewer.dispose()
          return
        }

        viewer.start()

        // ── 2. 相机 & 渲染器引用 ─────────────────────────────────────
        const camera = viewer.camera
        const renderer = viewer.renderer

        // 强制对齐相机到 cameraSettings，消除 viewer 内部可能引入的 roll
        camera.up.set(...cameraUp)
        camera.position.set(...initialCameraPosition)
        camera.lookAt(new THREE.Vector3(...initialCameraLookAt))

        // ── 3. 原生 Pointer Lock + 绝对角度旋转 ──────────────────────
        // 用绝对 yaw/pitch 角重建 quaternion，避免增量叠加导致的 roll 漂移。
        // 公式：Q = Q_yaw(totalYaw) * Q0 * Q_pitch(totalPitch)
        //   - Q0：初始相机方向（camera.up + lookAt 对齐后）
        //   - Q_yaw：绕初始水平面法线的世界空间偏航
        //   - Q_pitch：绕初始 right 轴（本地 [1,0,0]）的俯仰
        const SENSITIVITY = 0.002
        const MAX_PITCH = Math.PI / 2 - 0.05
        const horizontalNormal = new THREE.Vector3(...cameraUp).normalize()
        const horizontalPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          horizontalNormal,
          new THREE.Vector3(...initialCameraLookAt)
        )
        const Q0 = camera.quaternion.clone()   // 初始相机方向，只捕获一次
        let totalYaw = 0
        let totalPitch = 0
        let isLocked = false
        let orbitPivot: THREE.Vector3 | null = null

        const Q_yaw   = new THREE.Quaternion()
        const Q_pitch = new THREE.Quaternion()
        const Q_orbit = new THREE.Quaternion()
        const orbitOffset = new THREE.Vector3()
        const viewRay = new THREE.Ray()
        const viewDirection = new THREE.Vector3()

        const applyRotation = () => {
          Q_yaw.setFromAxisAngle(horizontalNormal, totalYaw)
          Q_pitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), totalPitch)
          // Q_yaw * Q0 * Q_pitch
          camera.quaternion.copy(Q0).premultiply(Q_yaw).multiply(Q_pitch)
        }

        const MAX_ORBIT_DIST = 5
        const getOrbitPivot = () => {
          camera.getWorldDirection(viewDirection)
          viewRay.set(camera.position, viewDirection)
          const hit = viewRay.intersectPlane(horizontalPlane, new THREE.Vector3())
          if (hit && hit.distanceTo(camera.position) < MAX_ORBIT_DIST) return hit
          return camera.position.clone().addScaledVector(viewDirection, 1.5)
        }

        const rotateAroundCurrentPivot = (deltaYaw: number) => {
          if (!orbitPivot) orbitPivot = getOrbitPivot()
          totalYaw += deltaYaw
          Q_orbit.setFromAxisAngle(horizontalNormal, deltaYaw)
          orbitOffset.copy(camera.position).sub(orbitPivot).applyQuaternion(Q_orbit)
          camera.position.copy(orbitPivot).add(orbitOffset)
          applyRotation()
        }

        const onPointerLockChange = () => {
          isLocked = document.pointerLockElement === renderer.domElement
          fallbackLockedRef.current = false
          setLocked(isLocked)
          if (!isLocked) {
            orbitPivot = null
            setNormalRotateMode(false)
          }
        }
        document.addEventListener('pointerlockchange', onPointerLockChange)

        const onMouseMove = (e: MouseEvent) => {
          if (!isLocked && !fallbackLockedRef.current) return
          const lockToNormal = e.ctrlKey || KEYS['ControlLeft'] || KEYS['ControlRight']
          const deltaYaw = -e.movementX * SENSITIVITY
          if (lockToNormal) {
            rotateAroundCurrentPivot(deltaYaw)
            return
          }

          orbitPivot = null
          totalYaw += deltaYaw
          totalPitch = THREE.MathUtils.clamp(totalPitch - e.movementY * SENSITIVITY, -MAX_PITCH, MAX_PITCH)
          applyRotation()
        }
        document.addEventListener('mousemove', onMouseMove)

        // ── 3. 键盘事件 ──────────────────────────────────────────────
        const onKeyDown = (e: KeyboardEvent) => {
          KEYS[e.code] = true
          if (e.code === 'Escape' && fallbackLockedRef.current) {
            fallbackLockedRef.current = false
            orbitPivot = null
            setLocked(false)
            setNormalRotateMode(false)
          }
          if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && (isLocked || fallbackLockedRef.current)) {
            orbitPivot = getOrbitPivot()
            setNormalRotateMode(true)
          }
        }
        const onKeyUp = (e: KeyboardEvent) => {
          KEYS[e.code] = false
          if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
            orbitPivot = null
            setNormalRotateMode(false)
          }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup',   onKeyUp)

        // ── 4. 每帧移动逻辑 ──────────────────────────────────────────
        const tmpFwd = new THREE.Vector3()
        const tmpMoveRight = new THREE.Vector3()

        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          if (!isLocked && !fallbackLockedRef.current) return

          camera.getWorldDirection(tmpFwd)
          tmpMoveRight.crossVectors(tmpFwd, horizontalNormal).normalize()

          const speed = MOVE_SPEED * (KEYS['ShiftLeft'] || KEYS['ShiftRight'] ? 3 : 1)

          if (KEYS['KeyW'] || KEYS['ArrowUp'])    camera.position.addScaledVector(tmpFwd,       speed)
          if (KEYS['KeyS'] || KEYS['ArrowDown'])  camera.position.addScaledVector(tmpFwd,      -speed)
          if (KEYS['KeyA'] || KEYS['ArrowLeft'])  camera.position.addScaledVector(tmpMoveRight, -speed)
          if (KEYS['KeyD'] || KEYS['ArrowRight']) camera.position.addScaledVector(tmpMoveRight,  speed)
        }
        rafRef.current = requestAnimationFrame(loop)

        cleanupViewerControls = () => {
          cancelAnimationFrame(rafRef.current)
          document.removeEventListener('pointerlockchange', onPointerLockChange)
          document.removeEventListener('mousemove', onMouseMove)
          window.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('keyup',   onKeyUp)
          fallbackLockedRef.current = false
          orbitPivot = null
          Object.keys(KEYS).forEach(k => delete KEYS[k])
          if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
        }
      })
      .catch((err: unknown) => console.error('SplatViewer load error:', err))

    return () => {
      disposed = true
      cleanupViewerControls?.()
      cancelAnimationFrame(rafRef.current)
      try {
        viewerRef.current?.dispose()
      } catch (err) {
        console.warn('SplatViewer dispose warning:', err)
      }
      viewerRef.current = null
    }
  }, [modelPath])

  const handleClick = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    const renderer = viewer.renderer
    const requestPointerLock = renderer?.domElement.requestPointerLock
    if (!requestPointerLock) {
      fallbackLockedRef.current = true
      setLocked(true)
      return
    }

    try {
      const result = requestPointerLock.call(renderer.domElement) as Promise<void> | undefined
      result?.catch(() => {
        fallbackLockedRef.current = true
        setLocked(true)
      })
    } catch {
      fallbackLockedRef.current = true
      setLocked(true)
    }
  }

  return (
    <div className={`relative w-full h-full ${className}`} onClick={handleClick}>
      <div ref={containerRef} className="w-full h-full" />

      {/* 未锁定时的提示覆盖层 */}
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded px-6 py-4 text-center space-y-2">
            <p className="text-paper/90 text-sm tracking-widest">点击进入漫游模式</p>
          </div>
        </div>
      )}

      {/* 锁定时的准星 */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-1 h-1 bg-white/60 rounded-full" />
          {normalRotateMode && (
            <div className="absolute top-6 rounded-full border border-gold/30 bg-black/60 px-3 py-1 text-[10px] tracking-[0.18em] text-gold/80">
              水平旋转锁定
            </div>
          )}
        </div>
      )}

      {/* 视角信息按钮 */}
      <button
        onClick={e => { e.stopPropagation(); setShowDebug(v => !v); captureCamera() }}
        className="absolute bottom-4 right-4 z-50 px-2 py-1 text-[10px] font-mono bg-black/60 text-white/60 hover:text-white rounded border border-white/20"
      >
        {showDebug ? '隐藏视角' : '视角信息'}
      </button>

      {showDebug && (
        <div className="absolute bottom-12 right-4 z-50 bg-black/80 text-green-400 font-mono text-[11px] px-3 py-2 rounded border border-white/10 whitespace-pre leading-5">
          <div className="text-white/40 mb-1 text-[10px]">当前视角</div>
          {debugInfo ?? '点击“视角信息”刷新'}
          <button
            onClick={e => { e.stopPropagation(); captureCamera() }}
            className="block mt-2 text-[10px] text-white/40 hover:text-white"
          >
            刷新视角
          </button>
        </div>
      )}
    </div>
  )
}
