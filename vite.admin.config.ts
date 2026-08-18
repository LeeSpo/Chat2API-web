import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'frontend'),
  base: '/',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out-admin'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'frontend/admin.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'frontend/src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/v0/management': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/v1': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/v1beta': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/stats': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})
