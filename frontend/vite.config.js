import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ensure plugins/ (outside frontend/) resolve deps from frontend/node_modules
    dedupe: ['react', 'react-dom', 'zustand'],
    alias: {
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'lucide-react': resolve(__dirname, 'node_modules/lucide-react'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        standalone: resolve(__dirname, 'standalone.html'),
      },
    },
  },
  server: {
    // Allow access from other devices on the LAN (Phase 2 tablets / phones)
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Forward Socket.IO and API calls to the backend
      '/socket.io': {
        target: 'http://localhost:1303',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:1303',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:1303',
        changeOrigin: true,
      },
      '/custom-packs': {
        target: 'http://localhost:1303',
        changeOrigin: true,
      },
      '/questions.json': {
        target: 'http://localhost:1303',
        changeOrigin: true,
      },
    },
  },
})
