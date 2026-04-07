declare module '@mkkellogg/gaussian-splats-3d' {
  import type { PerspectiveCamera, WebGLRenderer } from 'three'

  export const SceneRevealMode: {
    Default: number
    Gradual: number
    Instant: number
  }

  export interface ViewerOptions {
    cameraUp?: [number, number, number]
    initialCameraPosition?: [number, number, number]
    initialCameraLookAt?: [number, number, number]
    rootElement?: HTMLElement
    useBuiltInControls?: boolean
    sceneRevealMode?: number
  }

  export interface SceneOptions {
    splatAlphaRemovalThreshold?: number
  }

  export class Viewer {
    camera: PerspectiveCamera
    renderer: WebGLRenderer
    constructor(options?: ViewerOptions)
    addSplatScene(path: string, options?: SceneOptions): Promise<void>
    start(): void
    dispose(): void
  }
}
