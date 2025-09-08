import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/public'),
    emptyOutDir: false
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/types/shared.ts')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8998',
        changeOrigin: true
      },
      '/ws': {
        target: 'http://localhost:8998',
        ws: true,
        changeOrigin: true
      }
    }
  }
})