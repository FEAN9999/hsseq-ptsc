// e2e/helpers.ts
//
// Hai nhóm việc: (1) đưa DB về đúng trạng thái demo, (2) đăng nhập và tra cứu id thật.
//
// Vì sao phải TRA id thật thay vì viết cứng: `reset_demo.py` XOÁ rồi CHÈN LẠI toàn bộ bảng
// `report`, nên `report.id` là chuỗi sequence tăng dần — không lượt reset nào cho lại id cũ.
// Mọi số id viết cứng trong spec (brief có `/reports/1`, `/reports/9999`) sẽ hoặc 404 hoặc trỏ
// nhầm đơn vị sau lượt reset thứ hai.
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type APIRequestContext, type Page } from '@playwright/test'

const GOC_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND = resolve(GOC_REPO, 'backend')

/** `backend/.venv/bin/python` — máy này KHÔNG có `python` trần trên PATH. */
const PYTHON = resolve(BACKEND, '.venv/bin/python')

/** Mật khẩu chung của mọi tài khoản seed (`backend/app/seed/__init__.py`: env `SEED_PASSWORD`,
 *  mặc định `Demo@2026`). */
export const MAT_KHAU = 'Demo@2026'

/** Kỳ demo — kỳ duy nhất đang mở có đơn vị thứ 22 ở trạng thái nháp (`_nhap_don_vi_22`). */
export const KY_DEMO = '2026-08'

/** Đơn vị thứ 22 trong danh sách `is_reporting` xếp theo id = `P05` (17 đơn vị thành viên U01..U17
 *  rồi 5 ban dự án P01..P05). `u22@ptsc.local` là người nhập của chính đơn vị này. */
export const DON_VI_U22 = 'P05'

/** PHÁT HIỆN, không phải tiện nghi — xem task-27-report.md mục 0.1.
 *
 *  `backend/app/seed/fixtures/fm01_2026-06_2026-08.csv` (fixture số THẬT của buổi demo) hiện chỉ
 *  có ĐÚNG dòng tiêu đề, không một số nào. Với nó, `seed_all()` không tạo báo cáo nào, nên phân
 *  đoạn 2 của demo không có điểm bắt đầu: `/reports` của u22 chỉ có nút "Tạo báo cáo", dashboard
 *  `approved_count = 0`, và câu "Tổng từ 22 báo cáo đã duyệt" không bao giờ xuất hiện.
 *
 *  `load_fixture()` đã có sẵn cửa `FIXTURE_CSV` cho đúng mục đích này (docstring của nó: "test
 *  trỏ sang tests/fixtures/full_synthetic.csv"). Dùng cửa đó ở đây là quyết định của MÔI TRƯỜNG
 *  TEST, không phải sửa mã sản phẩm — `backend/app` và `frontend/src` không bị đụng dòng nào.
 *  Buổi demo thật vẫn cần số thật dán vào file fixture kia. */
const FIXTURE_E2E = resolve(BACKEND, 'tests/fixtures/full_synthetic.csv')

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'
const LA_LOCAL = BASE_URL.startsWith('http://localhost') || BASE_URL.startsWith('http://127.0.0.1')

/** Gọi `scripts/reset_demo.py --yes`. `APP_ENV` phải đặt ngay trên dòng lệnh: `.env` KHÔNG tự
 *  export ra biến môi trường tiến trình, và cầu chì của script đọc thẳng `os.environ` (fail-closed
 *  — thiếu biến là TỪ CHỐI, không phải mặc định "local").
 *
 *  Chạy đồng bộ (`execFileSync`) có chủ ý: mọi ca sau nó phải thấy DB đã ở trạng thái cuối, và
 *  suite chạy `workers: 1` nên không có gì để song song mà tiết kiệm. */
export function resetDemo(): void {
  if (!LA_LOCAL) {
    throw new Error(
      `resetDemo() chỉ chạy được với DB local. BASE_URL=${BASE_URL} là môi trường ngoài — ` +
        'chạy reset ở đó bằng `docker compose exec api python -m scripts.reset_demo --yes`.',
    )
  }
  execFileSync(PYTHON, ['-m', 'scripts.reset_demo', '--yes'], {
    cwd: BACKEND,
    env: { ...process.env, APP_ENV: 'local', FIXTURE_CSV: FIXTURE_E2E },
    stdio: 'pipe',
    timeout: 120_000,
  })
}

/** Đăng nhập qua GIAO DIỆN thật (không nhét token vào storage): đường đi này là thứ buổi demo
 *  dùng, và nó cũng là chỗ duy nhất `dieuHuongSauDangNhap` (reporter → /reports, còn lại →
 *  /dashboard) được chạy thật.
 *
 *  Chờ đúng MỐC chứ không chờ một chuỗi: `/auth/me` 200 là lúc phiên đã đủ user+quyền, và
 *  `waitForURL` rời khỏi `/login` là lúc router đã điều hướng xong. Chờ bằng `getByText(...)`
 *  của trang đích sẽ bắt trúng khung hình nhấp nháy lúc trang còn đang tải (luật Task 26). */
export async function dangNhap(page: Page, email: string, opts: { tuMo?: boolean } = {}): Promise<void> {
  // `tuMo: false` khi trang ĐÃ ở /login sẵn — ví dụ vừa bị `RequireAuth` đá về `/login?next=…`.
  // Gọi `goto('/login')` lúc đó sẽ XOÁ mất chính cái `?next=` mà ca test đang muốn kiểm.
  if (opts.tuMo !== false) await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu').fill(MAT_KHAU)

  const choMe = page.waitForResponse(
    (r) => r.url().includes('/api/v1/auth/me') && r.request().method() === 'GET' && r.ok(),
  )
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await choMe
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

/** Token cho các lượt tra cứu bằng API (lấy id báo cáo thật). Đi qua `baseURL` nên cùng một
 *  proxy `/api/v1` mà trình duyệt dùng — không tự đoán cổng backend. */
export async function tokenApi(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post('/api/v1/auth/login', { data: { email, password: MAT_KHAU } })
  expect(res.ok(), `đăng nhập API ${email} lỗi ${res.status()}`).toBeTruthy()
  return (await res.json()).access_token as string
}

export interface BaoCaoTom {
  id: number
  org_unit: { code: string; name: string }
  period_key: string
  state: string | null
}

/** Danh sách báo cáo của một kỳ, đọc bằng tài khoản admin (phạm vi toàn TCT). */
export async function dsBaoCao(
  request: APIRequestContext,
  token: string,
  period = KY_DEMO,
): Promise<BaoCaoTom[]> {
  const res = await request.get(`/api/v1/reports?template=FM01&period=${period}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `GET /reports lỗi ${res.status()}`).toBeTruthy()
  return (await res.json()) as BaoCaoTom[]
}

/** Id báo cáo của đúng một đơn vị trong kỳ. Ném lỗi nói rõ tên đơn vị nếu không có — im lặng trả
 *  `undefined` ở đây sẽ biến thành một `/reports/undefined` khó lần ra ở ca test. */
export async function idBaoCao(
  request: APIRequestContext,
  token: string,
  orgCode: string,
  period = KY_DEMO,
): Promise<number> {
  const ds = await dsBaoCao(request, token, period)
  const bc = ds.find((r) => r.org_unit.code === orgCode && r.id !== null)
  if (bc === undefined) throw new Error(`không có báo cáo ${orgCode} kỳ ${period} (đã reset chưa?)`)
  return bc.id
}

/** Số pixel trang bị TRÀN ngang. > 0 nghĩa là thanh cuộn ngang của CẢ TRANG xuất hiện — khác hẳn
 *  với một cái bảng tự cuộn trong khung `overflow-x` của nó (C3: lưới tự cuộn là ĐÚNG, trang cuộn
 *  mới là lỗi). */
export async function tranNgang(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

/** Khi tràn, liệt kê phần tử nào thò ra ngoài mép phải — không có dòng này thì một ca đỏ chỉ nói
 *  "tràn 37px" và người sửa phải tự đi tìm. */
export async function thuPhamTranNgang(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rong = document.documentElement.clientWidth
    const ra: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.right <= rong + 1 || r.width === 0) continue
      const cha = el.parentElement
      // Chỉ báo phần tử THÒ RA mà cha nó KHÔNG thò ra: cha đã thò thì con thò theo là hệ quả.
      if (cha && cha.getBoundingClientRect().right > rong + 1) continue
      ra.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 80)} → ${Math.round(r.right)}px`)
    }
    return ra.slice(0, 8)
  })
}
