export interface Building {
  id: string
  name: string
  dynasty: string
  location: string
  coordinates: [number, number] // [lng, lat]
  description: string
  modelPath: string | null      // .splat 文件路径，null 表示待重建
  coverImage: string | null
  type: 'public' | 'personal'
  status: 'ready' | 'pending' | 'processing'
}

export interface ReconstructionJob {
  id: string
  buildingName: string
  status: 'queued' | 'extracting' | 'matching' | 'reconstructing' | 'done' | 'failed'
  progress: number              // 0-100
  createdAt: string
  modelPath: string | null
}

// 预留 AI 对话类型
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

// 用户类型
export interface User {
  id: string
  username: string
  email: string
  avatar: string | null
  createdAt: string
}

export interface AuthState {
  user: User | null
  token: string | null
}
