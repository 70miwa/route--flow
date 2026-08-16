import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend lives in ./client. API calls to /api are proxied to the
// Express server (default :3000) during development. In production the
// Express server serves the built client/dist directly.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
