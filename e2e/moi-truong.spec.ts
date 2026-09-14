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
import { expect, test } from '@playwright/test'

import { laCucBo } from './moi-truong'

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
