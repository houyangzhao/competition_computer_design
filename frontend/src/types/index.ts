export interface CameraSettings {
  up: [number, number, number]
  position: [number, number, number]
  lookAt: [number, number, number]
}

// outdoor_arch 变换后的默认相机参数
// outdoor_arch: X→下, Y→朝向观察者, Z→左，所以物理"上"= -X
export const DEFAULT_OUTDOOR_CAMERA: CameraSettings = {
  up: [-1, 0, 0],
  position: [0, 50, 0],
  lookAt: [0, 0, 0],
}

export interface Building {
  id: string
  name: string
  dynasty: string
  location: string
  coordinates: [number, number]
  description: string
  modelPath: string | null
  coverImage: string | null
  type: 'public' | 'personal'
  status: 'ready' | 'pending' | 'processing'
  cameraSettings?: CameraSettings | null
  ownerId: string | null
  sourceJobId: string | null
  contributionCount: number
  photoCount: number
  createdAt: string | null
  updatedAt: string | null
}

export interface ReconstructionJob {
  id: string
  buildingName: string
  status: 'queued' | 'extracting' | 'matching' | 'reconstructing' | 'done' | 'failed'
  progress: number
  createdAt: string
  modelPath: string | null
  error: string | null
  savedBuildingId: string | null
  photoCount: number
  selectedCount: number | null
  targetBuildingId: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface KnowledgeItem {
  term: string
  description: string
  imageUrl?: string
}

export interface User {
  id: string
  username: string
  email: string
  role: 'user' | 'admin'
  avatar: string | null
  createdAt: string
}

export interface AuthState {
  user: User | null
  token: string | null
}

export interface ContributionResult {
  contributionId: string
  projectId: string
  received: number
  totalContributions: number
  totalPhotos: number
}

export interface OverviewStats {
  rescuedModels: number
  contributedPhotos: number
  publicBuildings: number
  personalModels: number
  activeJobs: number
}

export interface AdminProjectInput {
  name: string
  dynasty: string
  location: string
  description: string
  latitude: number
  longitude: number
}
