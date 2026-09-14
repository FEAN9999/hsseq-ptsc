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

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

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
/** `true` khi bộ test đang chạy với DB local mà `backend/.env` trỏ tới, tức là `resetDemo()` có
 *  quyền và có đường xoá-nạp lại. `BASE_URL` từ xa (Vercel/Render, Task 28) thì KHÔNG: cái
 *  `.venv` trên máy này không nói chuyện được với database của server đó, và kể cả nói được thì
 *  xoá dữ liệu trên máy chủ thật là một hành động khác hẳn về hậu quả. */
export const CO_THE_RESET = LA_LOCAL

/** Bỏ qua ca đang chạy khi không reset được.
 *
 *  S1 (vòng sửa 1): bản trước `resetDemo()` NÉM LỖI vô điều kiện ở chế độ `BASE_URL` từ xa, nên
 *  `BASE_URL=https://… npx playwright test` — đường chạy mà brief liệt kê ở "Produces" và README
 *  mô tả như cách dùng hợp lệ — giết cả 8 ca ngay trong `beforeEach`/`beforeAll`. Task 28 dựng
 *  demo lên Vercel + Render, và cách duy nhất để biết bản deploy có chạy đúng là trỏ e2e vào nó.
 *
 *  Chia đôi bộ test theo đúng thứ chúng CẦN, không theo ý muốn:
 *  - Bốn ca chỉ ĐỌC (không cuộn ngang · titlebar · rbac 403 · rbac chưa đăng nhập) chạy được ở mọi
 *    nơi ⇒ đó là bộ khói cho một bản deploy.
 *  - Bốn ca cần một báo cáo NHÁP sạch (demo phân đoạn 2 · Ctrl+S · hộp thoại · rbac người xem) thì
 *    gọi hàm này để tự bỏ qua — Playwright in ra "skipped" kèm nguyên văn lý do, không im lặng và
 *    cũng không xanh giả. */
export function boQuaNeuKhongResetDuoc(): void {
  test.skip(
    !CO_THE_RESET,
    `Ca này cần DB ở trạng thái demo sạch (một báo cáo nháp của ${DON_VI_U22} kỳ ${KY_DEMO}). ` +
      `BASE_URL=${BASE_URL} là môi trường ngoài nên resetDemo() không chạy được. Reset ở đó bằng ` +
      '`docker compose exec api python -m scripts.reset_demo --yes` rồi chạy lẻ ca này.',
  )
}

export function resetDemo(): void {
  if (!CO_THE_RESET) {
    // Không ném: nơi gọi đã tự bỏ qua bằng `boQuaNeuKhongResetDuoc()` nếu nó thật sự cần trạng
    // thái sạch. Nói ra một lần cho người chạy biết chắc chắn là ĐÃ BỎ QUA, không phải đã reset.
    console.warn(
      `[e2e] BỎ QUA resetDemo(): BASE_URL=${BASE_URL} là môi trường ngoài. ` +
        'Các ca cần trạng thái sạch sẽ tự báo "skipped" kèm lý do.',
    )
    return
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

/** Nộp một báo cáo bằng API — DỰNG CẢNH, không phải thứ đang được kiểm.
 *
 *  Dùng ở ca Q1 (dashboard đổi số không tải lại trang): ca đó canh LỚP LÀM MỚI CACHE của trình
 *  duyệt, nên bước đưa báo cáo về `submitted` phải nhanh và tất định, và quan trọng hơn: phải xảy
 *  ra NGOÀI trình duyệt đang đo, để không có lượt `invalidateReportQueries` nào của chính nó lẫn
 *  vào phép đo. Đường nộp bằng giao diện đã có ca riêng canh (ca demo phân đoạn 2). */
export async function nopBaoCaoQuaApi(
  request: APIRequestContext,
  token: string,
  reportId: number,
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` }
  const xem = await request.get(`/api/v1/reports/${reportId}`, { headers })
  expect(xem.ok(), `GET /reports/${reportId} lỗi ${xem.status()}`).toBeTruthy()
  const { state, version } = (await xem.json()) as { state: string; version: number }
  const res = await request.post(`/api/v1/reports/${reportId}/transition`, {
    headers,
    data: { action: 'submit', expected_state: state, version },
  })
  expect(res.ok(), `nộp báo cáo ${reportId} lỗi ${res.status()}: ${await res.text()}`).toBeTruthy()
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
