import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.VITE_DEV_PORT || 5173)
  const previewPort = Number(env.VITE_PREVIEW_PORT || 4173)

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: devPort,
      strictPort: false,
      allowedHosts: ['easy.gte.co.id', 'localhost'],
    },
    preview: {
      host: '0.0.0.0',
      port: previewPort,
      strictPort: false,
      allowedHosts: ['easy.gte.co.id', 'localhost'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  }
})
