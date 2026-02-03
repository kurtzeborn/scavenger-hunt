import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Note: For WSL setup, start-dev.ps1 will auto-update the target IP
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.194.197:7072',
        changeOrigin: true,
      },
    },
  },
})
