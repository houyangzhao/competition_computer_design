import { useEffect, useRef, useState } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'

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

export default function SplatViewer({
  modelPath,
  cameraUp = DEFAULT_CAMERA_UP,
  initialCameraPosition = DEFAULT_CAMERA_POSITION,
  initialCameraLookAt = DEFAULT_CAMERA_LOOK_AT,
  className = '',
}: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<InstanceType<typeof GaussianSplats3D.Viewer> | null>(null)
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [error, setError] = useState<{ path: string; message: string } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const viewer = new GaussianSplats3D.Viewer({
      cameraUp,
      initialCameraPosition,
      initialCameraLookAt,
      rootElement: containerRef.current,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Gradual,
    })
    viewerRef.current = viewer

    viewer
      .addSplatScene(modelPath, { splatAlphaRemovalThreshold: 5 })
      .then(() => {
        viewer.start()
        setLoadedPath(modelPath)
        setError(null)
      })
      .catch((err: unknown) => {
        setLoadedPath(null)
        setError({
          path: modelPath,
          message: err instanceof Error ? err.message : '模型加载失败',
        })
      })

    return () => {
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [cameraUp, initialCameraLookAt, initialCameraPosition, modelPath])

  const isLoading = loadedPath !== modelPath && error?.path !== modelPath
  const errorMessage = error?.path === modelPath ? error.message : null

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/60 backdrop-blur-sm">
          <div className="space-y-3 text-center">
            <div className="mx-auto h-10 w-10 rounded-full border-2 border-stone-700 border-t-gold animate-spin" />
            <p className="text-xs uppercase tracking-[0.3em] text-paper/60">Loading Model</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/80 px-6 text-center backdrop-blur-sm">
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-medium text-paper">模型暂时无法加载</p>
            <p className="text-xs leading-relaxed text-paper/50">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  )
}
