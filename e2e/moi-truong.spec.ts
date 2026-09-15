// e2e/moi-truong.spec.ts
//
// A2 (vòng sửa 3) — HAI CA CANH BỘ PHÂN LOẠI HOSTNAME.
//
// VÌ SAO một hàm thuần 12 dòng lại đáng có ca riêng, trong khi cả bộ e2e còn lại nói chuyện với
// trình duyệt thật: `laCucBo` là thứ DUY NHẤT đứng giữa một lượt chạy e2e trỏ ra ngoài và
// `scripts/reset_demo.py --yes` — lệnh XOÁ SẠCH bảng `report` của database máy nhà. Mối nguy này
// không phải lý thuyết: người soát đã dựng lại được nó trên DB thật. Với công thức `startsWith`
// cũ, `BASE_URL=http://localhost.localtest.me:5173` — một bản ghi DNS CÔNG CỘNG có thật, trỏ về
// 127.0.0.1, mà ai cũng đăng ký được dạng `localhost.<tên-miền-của-mình>` — làm `resetDemo()`
// chạy, và vân tay bảng `report` đổi `f2f837ff…` → `a1b6a823…`.
//
// Trước hai ca này, cơ chế ấy KHÔNG CÓ AI CANH: viết lại `laCucBo` thành "luôn true" vẫn cho
// 10 passed (N53), bỏ nhánh `*.localhost` vẫn 10 passed (N52). Một cơ chế an toàn không người
// canh thì lần refactor sau sẽ lặng lẽ mất, và triệu chứng là MẤT DỮ LIỆU chứ không phải một ca
// đỏ.
//
// Hai ca này không mở trình duyệt (không đòi fixture `page`) nên chạy được ở MỌI chế độ, kể cả
// `BASE_URL` từ xa — đúng chỗ người ta cần chúng nhất.
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { apiUrl, laCucBo } from './moi-truong'

/** Phải trả `false`. Sai ở đây = `resetDemo()` xoá database máy nhà trong lúc test trỏ ra ngoài. */
const HIEM = [
  // tên miền công cộng THẬT phân giải về 127.0.0.1 — con đã được đo là gây mất dữ liệu
  'http://localhost.localtest.me:5173',
  // tiền tố giả: đúng thứ công thức `startsWith` cũ nhận nhầm
  'http://localhost.evil.com',
  'http://localhost.evil.com/x',
  'https://localhost.evil.com:5173',
  'http://LOCALHOST.EVIL.COM',
  // "localhost" nằm ở path / query / fragment, không phải hostname
  'http://evil.com/?x=localhost',
  'http://evil.com/localhost',
  'http://evil.com#localhost',
  // userinfo: chuỗi trước dấu `@` KHÔNG phải hostname
  'http://localhost:5173@evil.com',
  'http://user:localhost@evil.com/',
  // tên miền thật có chứa chữ "localhost"
  'https://localhost.com',
  'https://mylocalhost.com',
  'https://notlocalhost:5173',
  'https://alocalhost.io',
  'https://sub.localhost.attacker.net',
  // LAN / cloud / metadata — máy khác, dữ liệu khác
  'http://192.168.1.66:5173',
  'http://10.0.0.5:5173',
  'https://hseq-demo.onrender.com',
  'http://[2001:db8::1]:5173',
  'http://169.254.169.254',
  // dấu chấm cuối (FQDN tuyệt đối)
  'http://evil.com./',
  // không phân tích cú pháp được ⇒ phải FAIL-CLOSED, không được đoán
  'javascript:alert(1)',
  'file:///etc/passwd',
  'not a url',
  '',
  'localhost:5173',
]

/** Phải trả `true`. Sai ở đây = mọi ca cần DB sạch tự bỏ qua trên chính máy nhà, im lặng. */
const MAY_NHA = [
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost',
  'http://LOCALHOST:5173',
  'http://127.0.0.1:5173',
  'http://0.0.0.0:5173',
  'http://[::1]:5173',
  'http://[0:0:0:0:0:0:0:1]:5173',
  'http://app.localhost:5173',
  // ba cách viết vòng vo của 127.0.0.1 — `new URL()` tự chuẩn hoá về dạng chấm
  'http://127.000.000.001:5173',
  'http://2130706433:5173',
  'http://127.1:5173',
]

test('laCucBo — chiều NHẬN NHẦM: mọi hostname hiểm phải bị xếp là "từ xa"', () => {
  // Chốt chống rỗng: xoá bớt danh sách thì ca phải đổ, không được xanh bằng một mảng trống.
  expect(HIEM.length, 'danh sách hostname hiểm bị rút ngắn — ca này sẽ canh ít hơn nó hứa').toBeGreaterThanOrEqual(20)
  for (const url of HIEM) {
    expect(
      laCucBo(url),
      `laCucBo(${JSON.stringify(url)}) = true ⇒ CO_THE_RESET bật ⇒ resetDemo() sẽ chạy ` +
        '`scripts/reset_demo.py --yes` XOÁ SẠCH database máy nhà trong lúc bộ test trỏ ra ngoài',
    ).toBe(false)
  }
})

test('laCucBo — chiều SÓT: mọi dạng loopback hợp lệ phải được xếp là "máy nhà"', () => {
  expect(MAY_NHA.length, 'danh sách loopback bị rút ngắn — ca này sẽ canh ít hơn nó hứa').toBeGreaterThanOrEqual(10)
  for (const url of MAY_NHA) {
    expect(
      laCucBo(url),
      `laCucBo(${JSON.stringify(url)}) = false ⇒ mọi ca cần DB sạch sẽ tự "skipped" ngay trên máy nhà, ` +
        'và bộ test mất sức phân biệt trong im lặng thay vì đỏ',
    ).toBe(true)
  }
})

// F23 (task-28-scope.md mục 3) — LỚP PHÂN GIẢI tách origin API khỏi origin frontend. Hàm THUẦN,
// nhận cả hai origin làm tham số (như `laCucBo(url)` ở trên) nên test được không cần đụng
// `process.env` hay nạp lại module.
//
// task-28-fix-2.md P3/A4: tên ca DƯỚI đây trước là "mặc định (không đặt API_BASE_URL)" nhưng THÂN
// chỉ truyền hai chuỗi TAY bằng nhau — không hề đọc `process.env.API_BASE_URL` hay module thật, nên
// không canh được việc ĐỌC biến môi trường. Đổi tên cho khớp thứ nó THẬT SỰ kiểm (tính chất thuần
// "hai origin bằng nhau" của apiUrl, không liên quan gì tới localhost hay biến môi trường) — việc
// ĐỌC biến môi trường thật chuyển xuống ca `API_ORIGIN đọc process.env.API_BASE_URL...` bên dưới.
test('apiUrl — hai origin bằng nhau (same-origin) giữ NGUYÊN đường dẫn tương đối, bất kể giá trị cụ thể là gì', () => {
  // Đây chính là hành vi CŨ: `request` của Playwright tự nối đường dẫn tương đối vào `baseURL`
  // của nó — không đổi MỘT KÝ TỰ nào so với trước khi có F23. Cố ý dùng origin KHÔNG PHẢI
  // localhost để chứng minh tính chất này không liên quan gì tới "máy nhà" — chỉ là SO SÁNH BẰNG.
  expect(apiUrl('https://x.example', 'https://x.example', '/api/v1/auth/login')).toBe('/api/v1/auth/login')
})

test('apiUrl — hai origin khác nhau (Task 28: Vercel ≠ Render) trả URL TUYỆT ĐỐI trỏ vào gốc API', () => {
  expect(
    apiUrl('https://hseq-api.onrender.com', 'https://hseq-demo.vercel.app', '/api/v1/auth/login'),
  ).toBe('https://hseq-api.onrender.com/api/v1/auth/login')
})

// task-28-fix-2.md P3/A4: ca trên chỉ canh HÀM THUẦN `apiUrl`, không canh LỚP NỐI — nơi
// `API_ORIGIN`/`BASE_URL` (module-level, tính từ `process.env` lúc nạp) THẬT SỰ được đọc ra. Hai
// đột biến sống trên toàn suite (gõ nhầm tên biến môi trường, hoặc bỏ sót `goiApi` ở một trong bốn
// lời gọi `request.*` của helpers.ts) đều âm thầm quay về same-origin — không ca nào ở trên phát
// hiện được vì cả hai chỉ nói chuyện với `apiUrl` bằng tham số tay.
//
// Cache-bust bằng query string: ESM cache theo ĐÚNG specifier, `?...` khác nhau ép Node nạp lại
// module với `process.env` hiện tại thay vì trả bản đã cache từ lần import đầu (đầu file, hoặc từ
// một ca trước).
test('API_ORIGIN đọc THẬT process.env.API_BASE_URL lúc module nạp (không phải hai chuỗi tay)', async () => {
  const cu = process.env.API_BASE_URL
  try {
    delete process.env.API_BASE_URL
    const khongDat = (await import(`./moi-truong.ts?khong-dat-${Date.now()}`)) as typeof import('./moi-truong')
    expect(khongDat.API_ORIGIN, 'không đặt API_BASE_URL ⇒ API_ORIGIN phải mặc định BẰNG chính BASE_URL').toBe(
      khongDat.BASE_URL,
    )

    process.env.API_BASE_URL = 'https://hseq-api.onrender.com'
    const coDat = (await import(`./moi-truong.ts?co-dat-${Date.now()}`)) as typeof import('./moi-truong')
    expect(coDat.API_ORIGIN, 'đặt API_BASE_URL ⇒ API_ORIGIN phải đọc ĐÚNG giá trị đó, không phải BASE_URL').toBe(
      'https://hseq-api.onrender.com',
    )
  } finally {
    if (cu === undefined) delete process.env.API_BASE_URL
    else process.env.API_BASE_URL = cu
  }
})

// task-28-fix-2.md P3/A4: mọi lời gọi `request.*` (Playwright APIRequestContext) tới API trong
// helpers.ts BẮT BUỘC đi qua `goiApi()` — bỏ sót MỘT chỗ là chỗ đó âm thầm quay về same-origin khi
// API_BASE_URL khác BASE_URL (Task 28: Vercel ≠ Render), không ca nào ở trên phát hiện vì chúng chỉ
// gọi `apiUrl`/đọc `API_ORIGIN` trực tiếp, không đọc chính `helpers.ts`. Ca này đọc THẲNG mã nguồn
// — không phải chạy `request.*` thật — vì mục tiêu là khoá QUY ƯỚC VIẾT MÃ, thứ không hiện ra được
// qua bất kỳ giá trị input/output nào của một lượt chạy đơn lẻ.
test('helpers.ts — mọi lời gọi request.* tới API đều qua goiApi(...), không tự ráp path trần', () => {
  const src = readFileSync(new URL('./helpers.ts', import.meta.url), 'utf-8')
  const loiGoi = [...src.matchAll(/\brequest\.(get|post|put|patch|delete)\(\s*([^,)]+)/g)]
  expect(loiGoi.length, 'không tìm thấy lời gọi request.* nào — regex sai hoặc helpers.ts đã đổi cấu trúc').toBe(4)
  for (const [, phuongThuc, doiSo] of loiGoi) {
    expect(doiSo.trim(), `request.${phuongThuc}(${doiSo.trim()}…) không gọi qua goiApi(...)`).toMatch(/^goiApi\(/)
  }
})

// task-28-fix-4.md P5 (A7') — NGƯỜI CANH cho chính cấu hình `webServer`. Cùng lý do như ca
// `helpers.ts` ngay trên: đây là một QUY ƯỚC CHẠY TEST, không hiện ra được qua input/output của
// bất kỳ ca đơn lẻ nào, nên nếu không đọc thẳng cấu hình thì không ai canh nó.
//
// Vì sao hai thuộc tính này là mã load-bearing chứ không phải sở thích:
//   - `command` không có `npm run build` ⇒ `preview` phục vụ `frontend/dist` của lần build TRƯỚC.
//     Đo được: đột biến `client.ts` mà không build tay ⇒ `spa-fallback.spec.ts` 2/2 XANH trên
//     bundle cũ (và toàn bộ e2e cần trình duyệt cũng đang đo chính `dist` đó).
//   - `reuseExistingServer: true` ⇒ Playwright BỎ QUA HẲN `command` khi đã có server nghe ở cổng,
//     nên một `vite preview` sót lại từ lượt trước làm `npm run build` không bao giờ chạy. Đo
//     được trên một server sót lại thật: đột biến vẫn xanh 2/2 dù `command` đã có `npm run build`.
// Hai cửa phải đóng CÙNG LÚC — đóng một cửa vẫn để lọt đúng kịch bản của cửa kia.
test('webServer — e2e cục bộ phải build lại frontend/dist trước khi preview, và không mượn server cũ', async () => {
  const { default: cauHinh } = (await import(`./playwright.config.ts?p5-${Date.now()}`)) as {
    default: typeof import('./playwright.config').default
  }
  const may = Array.isArray(cauHinh.webServer) ? cauHinh.webServer[0] : cauHinh.webServer
  if (may === undefined) {
    // Chế độ `BASE_URL` từ xa: không có server nào để dựng, cũng không có `frontend/` để build.
    test.skip(true, 'chế độ BASE_URL từ xa: không có webServer để canh')
    return
  }
  expect(
    may.command,
    'webServer.command phải BUILD trước khi preview — không có `npm run build &&` thì e2e đo bundle của lần build TRƯỚC',
  ).toMatch(/npm run build\s*&&/)
  expect(
    may.reuseExistingServer,
    'reuseExistingServer phải là false — `true` khiến Playwright bỏ qua hẳn command khi có server cũ đang nghe, và bản build mới không bao giờ được dùng',
  ).toBe(false)
})
