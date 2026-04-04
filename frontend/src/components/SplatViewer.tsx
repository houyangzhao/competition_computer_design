import { useEffect, useRef } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'

interface SplatViewerProps {
  modelPath: string
  cameraUp?: [number, number, number]
  initialCameraPosition?: [number, number, number]
  initialCameraLookAt?: [number, number, number]
  className?: string
}

export default function SplatViewer({
  modelPath,
  cameraUp = [0, -1, 0],
  initialCameraPosition = [2, -2, -2],
  initialCameraLookAt = [0, 0, 0],
  className = '',
}: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<InstanceType<typeof GaussianSplats3D.Viewer> | null>(null)

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
      .then(() => viewer.start())
      .catch((err: unknown) => console.error('SplatViewer load error:', err))

    return () => {
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [modelPath]) // modelPath 变化时重新加载

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
