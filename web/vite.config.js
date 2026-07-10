import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_ESP_URL || 'http://192.168.1.50'
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
