// e2e/spa-fallback.spec.ts
//
// task-28-review.md P5/B5 (nâng từ "cân nhắc" lên "phải làm") — bằng chứng HIỆN VẬT ĐÃ BUILD cho
// cơ chế mới của task-28-fix-2.md P1 (docJsonHopLe/thuGoiHealth: "tôi vừa xin JSON và nhận về cái
// gì?" thay cho "tôi đang đứng ở đâu?"), không chỉ unit test có fetch giả — Ruling 403: vấn đề
// liên quan `import.meta.env.*` bắt buộc đo trên hiện vật đã build hoặc e2e thật.
//
// `page.route('**/*')` tự phục vụ `frontend/dist` (bundle THẬT, build bởi `npm run build`, KHÔNG
// đặt VITE_API_BASE — đúng bản mặc định `npm test` để lại) theo đúng luật SPA fallback của
// `vercel.json` (`"/(.*)" → "/index.html"`) — không cần mạng/deploy thật, không mở server nào.
//
// Cần `frontend/dist` tồn tại trước (chạy `npm run build` hoặc `npm test` trong `frontend/` —
// README "Chạy e2e (Playwright)"). Hai ca dưới đây hoàn toàn cách ly mạng — không dùng
// `LA_CUC_BO`/`BASE_URL`/`webServer` — nên chạy được ở MỌI chế độ, kể cả `BASE_URL` trỏ ra ngoài.
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Route } from '@playwright/test'

const DIST = fileURLToPath(new URL('../frontend/dist', import.meta.url))

const LOAI_THEO_DUOI: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

/** `readFileSync` ném nếu `duong` không phải file thật (không tồn tại, hoặc là một thư mục — vd.
 *  request tới route SPA như `/reports/12`) — bắt lỗi đó để rơi về SPA fallback thay vì làm hỏng
 *  cả route handler. */
function docFileAnToan(duong: string): Buffer | null {
  try {
    return readFileSync(duong)
  } catch {
    return null
  }
}

/** Phục vụ `frontend/dist` đúng luật `vercel.json` — file tĩnh khớp đường dẫn thì trả file đó,
 *  không khớp (không tồn tại, hoặc là thư mục/route SPA) thì trả `index.html` (SPA fallback), KHÔNG
 *  BAO GIỜ 404 — y hệt rewrite `"/(.*)" → "/index.html"` mà Vercel áp dụng cho mọi path không phải
 *  file tĩnh có thật. */
function phucVuDist(route: Route): void {
  const { pathname } = new URL(route.request().url())
  const ung = join(DIST, pathname === '/' ? 'index.html' : pathname.slice(1))
  const noiDungUng = docFileAnToan(ung)
  const duongThat = noiDungUng !== null ? ung : join(DIST, 'index.html')
  const noiDung = noiDungUng ?? readFileSync(duongThat)
  void route.fulfill({
    status: 200,
    contentType: LOAI_THEO_DUOI[extname(duongThat)] ?? 'application/octet-stream',
    body: noiDung,
  })
}

test.describe('SPA fallback trên hiện vật đã build (task-28-review.md P5, task-28-fix-2.md P1)', () => {
  test.skip(
    !existsSync(join(DIST, 'index.html')),
    'frontend/dist chưa build — chạy "npm run build" (hoặc "npm test") trong frontend/ trước khi ' +
      'chạy ca này (xem README "Chạy e2e (Playwright)").',
  )

  test('hostname LAN/mDNS bất kỳ (A1, cửa thứ ba của P1) + có "proxy" trả JSON thật ở /api/v1 thì trang chạy bình thường', async ({
    page,
  }) => {
    await page.route('**/*', (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname.startsWith('/api/v1/')) {
        void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) })
        return
      }
      phucVuDist(route)
    })
    // Hostname KHÔNG nằm trong bất kỳ danh sách cục bộ/LAN/RFC1918 nào — mDNS `.local`, cách rất
    // thường để mở web từ điện thoại trên cùng LAN (task-28-fix-2.md P1: "cửa thứ tư đã nhìn thấy
    // được"). Cơ chế MỚI không hỏi "ở đâu" nên hostname này không cần nằm trong danh sách nào cả.
    await page.goto('http://cai-may-tinh-cua-toi.local:5173/login')
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()
    await expect(page.getByText(/VITE_API_BASE/)).toHaveCount(0)
  })

  test('domain production giả, KHÔNG có backend ở /api/v1 (SPA fallback trả HTML cho mọi path) thì hỏng ồn ào — không phải màn trắng', async ({
    page,
  }) => {
    // MỌI path, kể cả /api/v1/*, đều ăn SPA fallback — mô phỏng đúng lỗ hổng gốc của vòng sửa 1
    // (Vercel không có backend cùng origin) VÀ chiều B4 (VITE_API_BASE đặt sai hình dạng cũng cho
    // hệt kết quả này, vì baseApi() không phân biệt "thiếu" với "đặt sai thành giá trị mặc định").
    await page.route('**/*', phucVuDist)
    await page.goto('http://hseq-demo-fake.vercel.app/login')
    // Trang vẫn DỰNG ĐƯỢC (khác vòng sửa 1: BASE không còn ném lúc tải module) — nút vẫn hiện,
    // không phải #root rỗng/màn trắng trước khi React kịp vẽ gì.
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()
    // /health nhận 200 kèm HTML → thuGoiHealth() (task-28-fix-2.md P1) KHÔNG tính là "đã thức" →
    // sau đủ số lần thử lại, banner mất kết nối hiện ra — CÓ CHỮ, không im lặng chỉ trong console.
    await expect(page.getByText(/Không kết nối được máy chủ/)).toBeVisible({ timeout: 15_000 })

    // Bấm thật (không chỉ đợi /health tự chạy) để cũng THI HÀNH chỗ chạm thứ hai của P1
    // (client.ts: docJsonHopLe trong nhánh request() thành công) trên CHÍNH hiện vật đã build này
    // — POST /auth/login cũng ăn SPA fallback (200 kèm HTML) y hệt, rơi vào docJsonHopLe() chứ
    // không phải nhánh !res.ok (502/503) đã có từ trước Task 28.
    //
    // task-28-fix-3.md P1: docJsonHopLe() giờ ném ApiError (không phải Error trần), nên
    // xuLySubmit() (Login.tsx:212, `err instanceof ApiError ? err.detail : '…chung…'`) hiện ĐÚNG
    // câu nói tên VITE_API_BASE ở banner loiDangNhap — banner NÀY khác banner loiKetNoi (câu
    // chung ở assertion phía trên, còn nguyên trên DOM vì loiKetNoi không bị xoá lúc submit): hai
    // banner độc lập, `getByText(/VITE_API_BASE/)` chỉ khớp banner loiDangNhap vì loiKetNoi không
    // chứa chuỗi đó (xem Login.tsx dòng ~263-278). Trước fix-3, docJsonHopLe() ném Error trần nên
    // xuLySubmit() rơi vào nhánh câu chung — assertion cũ ở đây từng khoá được đúng câu chung đó,
    // "mù dạng (b)" trước đúng lỗi P1 sửa vì trùng với banner loiKetNoi đã hiện sẵn phía trên.
    //
    // BẤT ĐỐI XỨNG CÒN LẠI (KHÔNG thuộc phạm vi fix-3, xem "KHÔNG làm trong vòng này" của
    // task-28-fix-3.md — chỉ đụng đường xuLySubmit, không đụng thuGoiHealth): banner loiKetNoi ở
    // assertion phía trên VẪN hiện câu chung "Không kết nối được máy chủ", vì thuGoiHealth()
    // không đi qua docJsonHopLe/ApiError — đường health-check tự động lúc mở trang chưa được P1
    // xử lý, chỉ đường bấm Đăng nhập (xuLySubmit) mới được xử lý ở vòng sửa này.
    await page.getByLabel('Email').fill('u01@ptsc.local')
    await page.getByLabel('Mật khẩu').fill('Demo@2026')
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page.getByText(/VITE_API_BASE/)).toBeVisible()
  })
})
