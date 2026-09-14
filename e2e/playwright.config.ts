// e2e/playwright.config.ts
//
// Đặt ở `e2e/` GỐC REPO (không phải `frontend/e2e/`): bộ test này nói chuyện với CẢ backend
// (reset DB, đọc id báo cáo thật qua API) lẫn frontend, nên nó không thuộc riêng `frontend/`.
// Gói npm cũng RIÊNG (`e2e/package.json`) — `frontend` có `"test": "npm run build && vitest run"`
// là cổng gác của 26 task đã xong; nhét e2e vào đó sẽ làm mọi lượt chạy test từ nay về sau đòi
// một server đang chạy (task-27-carry.md C-T26).
//
// `workers: 1` + `fullyParallel: false` KHÔNG phải để cho chậm: cả suite dùng CHUNG một database
// `hseq`, và `resetDemo()` xoá sạch `report`/`report_value` rồi nạp lại. Hai worker song song =
// một worker xoá dữ liệu dưới chân worker kia. Cũng vì vậy `retries: 0`: chạy lại một ca đã làm
// đổi trạng thái DB cho ra một kết quả "xanh" không nói lên điều gì về lượt chạy đầu.
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'
const LA_LOCAL = BASE_URL.startsWith('http://localhost') || BASE_URL.startsWith('http://127.0.0.1')

export default defineConfig({
  testDir: '.',
  timeout: 60_000, // Render cold start ~60 s
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // 1024×640 = đúng 1280×800 xem ở 125%. Đây là viewport mà C2/C3 (task-27-carry.md) nói tới:
    // 1024 − 220 (sidebar) − 48 (đệm 24 hai bên) = 756px cho nội dung.
    { name: 'zoom-125', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } } },
  ],
  // Chỉ tự dựng server khi đang chạy local. `BASE_URL=https://…` (Render/Supabase) thì server đã
  // có sẵn, không có gì để dựng — và cũng không có `frontend/` nào để `npm run preview`.
  //
  // `preview` chứ KHÔNG phải `dev`: `vite.config.ts` ghi rõ (C8, task-19-carry.md) rằng
  // `client.ts` gọi đường dẫn tương đối `/api/v1`, và chỉ `preview.proxy` mới đẩy nó sang cổng
  // 8000. Chạy qua `npm run dev` thì mọi lời gọi API đâm vào chính dev server → 404.
  webServer: LA_LOCAL
    ? {
        command: 'npm run preview -- --port 5173 --strictPort',
        cwd: '../frontend',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
})
