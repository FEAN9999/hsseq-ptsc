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

import { BASE_URL, LA_CUC_BO } from './moi-truong'


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
  //
  // task-28-fix-4.md P5 (A7') — `npm run build &&` TRƯỚC `preview`, và `reuseExistingServer: false`.
  // Cả bộ e2e cần trình duyệt đo `frontend/dist`, mà `preview` KHÔNG build: đo được trước vòng sửa
  // này, đột biến `client.ts` rồi chạy thẳng `npx playwright test` (đúng lệnh README dạy, và rẻ hơn
  // `npm test` nên là lệnh người ta thật sự gõ) cho 36/36 XANH — hiện vật được kiểm là bundle của
  // lần build TRƯỚC. Đúng hình dạng bẫy Ruling 408 (`__pycache__` giữ bytecode đột biến), chỉ đổi
  // chỗ: `.pyc` cũ → `dist` cũ.
  //
  // KHÔNG hỏi "dist có mới không" (so `mtime`, thứ Ruling 408 vừa dạy là không đáng tin ở độ phân
  // giải giây, và chỉ đóng được đúng ca `spa-fallback`) mà làm cho nó LUÔN mới. Giá đo được:
  // `npm run build` 1,57 s tường (vite build 187 ms) trên một lượt e2e ~1,6 phút.
  //
  // `reuseExistingServer: false` là CỬA THỨ HAI của cùng nước đi, không phải thứ trang trí:
  // `true` khiến Playwright BỎ QUA HẲN `command` khi đã có server nghe ở cổng đó, nên một
  // `vite preview` sót lại từ lượt trước vẫn phục vụ `dist` cũ và bản build mới không bao giờ được
  // dùng. Đã đo đúng cửa này: thêm `npm run build &&` mà vẫn để `true`, với một server sót lại
  // thật (`vite preview` chạy từ lượt trước), thì build không chạy và đột biến vẫn xanh 2/2. Hệ
  // quả cố ý: có gì đang nghe ở 5173 thì Playwright DỪNG kèm lỗi thay vì âm thầm mượn — tắt nó đi
  // rồi chạy lại. `moi-truong.spec.ts` có ca canh hai thuộc tính này.
  webServer: LA_CUC_BO
    ? {
        command: 'npm run build && npm run preview -- --port 5173 --strictPort',
        cwd: '../frontend',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
})
