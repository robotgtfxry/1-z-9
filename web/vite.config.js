import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: Vite proxyuje /api -> backend Node (nie do ESP32 bezposrednio).
// Backend siedzi na porcie 4000 (patrz server/.env).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_BACKEND_URL || 'http://localhost:4000'
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api':   { target, changeOrigin: true },
        '/sound': { target, changeOrigin: true },
      },
    },
  }
})
