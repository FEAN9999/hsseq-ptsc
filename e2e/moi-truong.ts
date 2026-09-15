// e2e/moi-truong.ts
//
// MỘT nơi duy nhất trả lời hai câu hỏi của cả bộ e2e: "đang chạy với địa chỉ nào" và "địa chỉ đó
// có phải máy này không". Trước vòng sửa 2, công thức nằm ở HAI bản chép tay — `helpers.ts` và
// `playwright.config.ts` — nên hai tệp có thể trả lời khác nhau về cùng một `BASE_URL`: config tự
// dựng `vite preview` trong khi helpers lại tưởng đang chạy từ xa, hoặc ngược lại. Bản chép tay ấy
// còn chỉ nhận ĐÚNG hai tiền tố chuỗi (`http://localhost`, `http://127.0.0.1`), nên ba địa chỉ
// local hoàn toàn hợp lệ bị xếp nhầm là "từ xa":
//
//   http://0.0.0.0:5173        (cách `vite preview --host` hay in ra)
//   https://localhost:5173     (chạy preview sau một proxy TLS)
//   http://[::1]:5173          (máy ưu tiên IPv6)
//
// Và ngược lại, `startsWith` còn nhận NHẦM theo chiều nguy hiểm hơn: `http://localhost.evil.com`
// khớp tiền tố `http://localhost` — tức một địa chỉ THẬT SỰ từ xa sẽ được `resetDemo()` coi là
// máy nhà và bị `scripts/reset_demo.py` nhắm vào. So theo `hostname` đã phân tích cú pháp thì cả
// hai chiều sai đó đều biến mất.

/** Địa chỉ front-end mà bộ test trỏ tới. `npm run preview` của `frontend/` mặc định ở 5173. */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'

/** `true` khi `url` trỏ về CHÍNH máy đang chạy test — không phụ thuộc giao thức hay cổng.
 *
 *  Đây là câu hỏi "tôi có quyền và có đường xoá-nạp lại database này không", nên phải trả lời sai
 *  về phía AN TOÀN: URL hỏng, hay hostname lạ, đều là "không phải máy nhà". */
export function laCucBo(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  // `new URL('http://[::1]:5173').hostname` trả về `[::1]` (còn nguyên ngoặc) — giữ cả hai dạng.
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]') {
    return true
  }
  // `*.localhost` được RFC 6761 dành riêng cho loopback và Chrome phân giải thẳng về 127.0.0.1 —
  // `http://app.localhost:5173` là một địa chỉ local thật sự, không phải một tên miền ngoài.
  return host.endsWith('.localhost')
}

/** `true` khi `BASE_URL` của lượt chạy này là máy nhà. */
export const LA_CUC_BO = laCucBo(BASE_URL)

// F23 (task-28-carry.md C-T27c, task-28-scope.md mục 3) — `helpers.ts` gọi API bằng ĐƯỜNG DẪN
// TƯƠNG ĐỐI qua `request` của Playwright, thứ luôn nối vào DUY NHẤT MỘT `baseURL`
// (playwright.config.ts: `use.baseURL = BASE_URL`, tức origin FRONTEND). Ở local đúng, vì
// `vite preview` có proxy `/api/v1` → backend cục bộ (C8, task-19-carry.md). Nhưng Task 28 là
// Vercel ≠ Render — HAI origin: lúc đó đường dẫn tương đối đi nhầm vào Vercel, gặp SPA fallback
// (frontend/vercel.json) trả 200 kèm THÂN HTML cho MỌI path kể cả '/api/v1/health', nên
// `res.ok()` XANH rồi mới vỡ ở `res.json()` — một bộ test xanh-rồi-vỡ ở chỗ không liên quan.

/** Gốc API của lượt chạy này — TÁCH RỜI gốc frontend khi bản deploy có hai origin. Mặc định
 *  (không đặt biến `API_BASE_URL`) bằng CHÍNH `BASE_URL` — same-origin, ĐÚNG HÀNH VI CŨ, không đổi
 *  khi không có gì mới trong môi trường. */
export const API_ORIGIN = process.env.API_BASE_URL ?? BASE_URL

/** Nối một ĐƯỜNG DẪN TƯƠNG ĐỐI ('/api/v1/...') với gốc API. Hàm THUẦN, nhận cả hai origin làm
 *  tham số — không đọc thẳng `API_ORIGIN`/`BASE_URL` module-level — để test được không cần đụng
 *  `process.env` hay nạp lại module, cùng lý do `laCucBo(url)` ở trên nhận tham số thay vì đọc
 *  `BASE_URL` toàn cục.
 *
 *  `apiGoc === feGoc` (mặc định, same-origin): trả NGUYÊN đường dẫn tương đối — `request` của
 *  Playwright tự nối vào `baseURL` của nó, Y HỆT hành vi cũ, không đổi một ký tự nào khi không đặt
 *  `API_BASE_URL`. Khác nhau (Task 28: Vercel ≠ Render): trả URL TUYỆT ĐỐI trỏ thẳng vào `apiGoc`,
 *  vì `request` chỉ có MỘT `baseURL` dùng chung cho cả suite. */
export function apiUrl(apiGoc: string, feGoc: string, duongDanTuongDoi: string): string {
  return apiGoc === feGoc ? duongDanTuongDoi : `${apiGoc}${duongDanTuongDoi}`
}
