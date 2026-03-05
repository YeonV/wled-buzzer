import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow access from other devices on the LAN (Phase 2 tablets / phones)
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Forward Socket.IO and API calls to the backend (handles both HTTP and HTTPS)
      '/socket.io': {
        target: 'https://localhost:1303',
        ws: true,
        secure: false, // allow self-signed cert in dev
        changeOrigin: true,
      },
    },
  },
})
