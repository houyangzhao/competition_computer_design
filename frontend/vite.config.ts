import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,   // 允许所有外部域名（含 AutoDL 公网 URL）
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api': 'http://localhost:8000',
      '/generated': 'http://localhost:8000',
      '/models': 'http://localhost:8000',
    },
  },
})
