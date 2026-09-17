/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // C8 (task-19-carry.md): client.ts gọi đường dẫn tương đối '/api/v1' — ở `npm run dev` (cổng
  // 5173) lời gọi đó đâm vào chính dev server (404) thay vì backend (cổng 8000, xem
  // infra/docker-compose.yml). Cần CẢ HAI: Task 27 chạy Playwright qua `npm run preview`, không
  // qua `npm run dev`. Production không qua proxy này — VITE_API_BASE ở đó là URL tuyệt đối.
  server: { proxy: { '/api/v1': 'http://localhost:8000' } },
  preview: { proxy: { '/api/v1': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
