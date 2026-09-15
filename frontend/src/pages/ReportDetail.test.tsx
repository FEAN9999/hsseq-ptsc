// frontend/src/pages/ReportDetail.test.tsx
//
// KHÔNG có trong danh sách file của task-22-brief.md — thêm vì vòng đột biến M43/M44/M45 cho thấy
// ba quyết định của trang này không ai đo: (a) danh mục lấy theo `header.template_code` chứ không
// phải chuỗi "FM01" viết cứng (ràng buộc "không hardcode FM01" của CONTEXT.md), (b) 403 nói
// "không có quyền" chứ không dựng form rỗng, (c) 404 nói "không tìm thấy" chứ không lẫn vào câu
// lỗi mạng. routes.test.tsx chỉ khoá được lớp bọc route, không với tới ba nhánh này.
//
// Mẫu dùng ở đây cố tình là FM02: nếu ReportDetail viết cứng "FM01" thì test đòi /templates/FM02
// đỏ ngay, còn đòi /templates/FM01 thì đúng cả khi mã sai (đó chính là lý do M43 sống ở vòng đầu).
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'

import { ReportDetail } from './ReportDetail'
import { useSession } from '../app/session'

const QUYEN_NGUOI_NOP = ['report.view_own_unit', 'report.edit', 'report.submit']
const QUYEN_NGUOI_DUYET = [...QUYEN_NGUOI_NOP, 'report.view_all', 'report.approve', 'report.return']

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
})

afterEach(() => {
  vi.useRealTimers()
})

const CHI_TIET = {
  id: 12,
  version: 1,
  state: 'draft',
  source: 'live',
  is_late: false,
  header: {
    org_unit: { code: 'U01', name: 'PTSC Miền Trung' },
    template_code: 'FM02',
    period_key: '2026-08',
    due_at: '2026-10-05T16:59:59Z',
    report_no: null,
    location: null,
    report_date: null,
    reporter_name: null,
    reporter_position: null,
    submitted_at: null,
    decided_at: null,
    decision_note: null,
  },
  missing_periods: [],
  values: [
    {
      indicator_code: 'B-1.1',
      this_period: null,
      acc_prev_entered: null,
      acc_total_entered: null,
      acc_prev_computed: 402100,
      acc_total_computed: null,
      diff: null,
      counter_check: null,
      note: null,
    },
    {
      indicator_code: 'B-1.2',
      this_period: null,
      acc_prev_entered: null,
      acc_total_entered: null,
      acc_prev_computed: null,
      acc_total_computed: null,
      diff: null,
      counter_check: null,
      note: null,
    },
  ],
  texts: {},
}

const MAU = {
  sections: [{ code: 'B-1', name_vi: 'TỔNG GIỜ CÔNG', name_en: 'Total Man Hours' }],
  indicators: [
    {
      code: 'B-1.1',
      section_code: 'B-1',
      name_vi: 'TCT PTSC',
      name_en: 'PTSC Corp.',
      unit: 'Giờ',
      agg_type: 'sum',
      formula: null,
      decimals: 2,
      required: true,
      sort_order: 1,
    },
    {
      code: 'B-1.2',
      section_code: 'B-1',
      name_vi: 'Nhà thầu phụ',
      name_en: 'Subcontractor',
      unit: 'Giờ',
      agg_type: 'sum',
      formula: null,
      decimals: 2,
      required: false,
      sort_order: 2,
    },
  ],
  text_fields: [],
  states: [{ code: 'draft', name_vi: 'Nháp', is_editable: true }],
  transitions: [],
}

/** Trả lời mọi URL bằng `ok`, trừ những path có trong `loi` (đưa về status + thân lỗi phẳng của
 * backend). `loi` được đọc lại ở MỖI lượt gọi, nên ca test bật hỏng giữa chừng được — đó là cách
 * duy nhất dựng cảnh "tải xong rồi mới có một lượt làm mới nền hỏng".
 *
 * `PUT` trả lời riêng: lớp lưu của Task 23 nằm trong form, và chính lượt `PUT` thành công là thứ
 * kéo theo lượt `GET` làm mới (`invalidateReportQueries`). Ghi lại danh sách URL đã gọi để khẳng
 * định ĐÃ gọi đúng endpoint nào. */
function moiApi(loi: Record<string, number> = {}) {
  const daGoi: string[] = []
  const f = vi.fn(async (url: string, init?: { method?: string }) => {
    daGoi.push(url)
    if (init?.method === 'PUT') {
      return { ok: true, status: 200, json: async () => ({ version: 2, values: CHI_TIET.values }) }
    }
    for (const [phan, status] of Object.entries(loi)) {
      if (url.includes(phan)) return { ok: false, status, json: async () => ({ detail: 'x' }) }
    }
    if (url.includes('/reports/12')) return { ok: true, status: 200, json: async () => CHI_TIET }
    if (url.includes('/templates/')) return { ok: true, status: 200, json: async () => MAU }
    throw new Error(`URL không lường trước: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return daGoi
}

/** Dựng cảnh "gõ một số rồi để nó tự lưu": lớp lưu của Task 23 nằm trong `ReportForm`, hẹn 1,5 s
 * sau khi rời ô có sửa. */
async function goRoiLuu(u: ReturnType<typeof userEvent.setup>, ma: string, so: string) {
  await u.click(await screen.findByLabelText(new RegExp(`^${ma.replace(/\./g, '\\.')} .+, Tháng này$`)))
  await u.keyboard(so)
  await u.tab()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600)
  })
}

/** Quay lại tab — `refetchOnWindowFocus` (app/queryClient.ts:11) nghe `visibilitychange`. Đây là
 * lượt làm mới NỀN KHÔNG gắn với lần lưu nào: đường người dùng đi mỗi lần chuyển sang cửa sổ khác
 * rồi quay lại giữa lúc đang nhập dở.
 *
 * TỰ KHẲNG ĐỊNH ĐÃ CÓ LƯỢT GỌI MỚI. Chỗ nghe sự kiện là chi tiết bên trong của
 * `@tanstack/query-core` (5.102.8 nghe trên WINDOW — `focusManager.js:12`; bản đầu của helper này
 * bắn vào `document` và KHÔNG refetch gì cả). Nâng phiên bản mà nó đổi chỗ nghe thì mọi ca dùng
 * helper này sẽ xanh GIẢ — không có lượt làm mới nào nên chẳng có gì để hỏng. Dòng khẳng định dưới
 * đây là thứ duy nhất ngăn điều đó. */
async function quayLaiTab(daGoi: string[]) {
  const truoc = daGoi.length
  await act(async () => {
    window.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(50)
  })
  expect(daGoi.length).toBeGreaterThan(truoc)
}

/** Đồng hồ giả CÓ nhích theo thời gian thật + `userEvent` gắn vào nó: `userEvent` treo cứng với
 * đồng hồ giả đứng yên (đã đo ở ReportForm.test.tsx). */
function nguoiDung() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
}

function ve(quyen: string[] = QUYEN_NGUOI_NOP) {
  useSession
    .getState()
    .login('tok-1', { id: 1, email: 'u@ptsc.local', full_name: 'Người dùng', position: null }, { id: 2, code: 'U01', name: 'PTSC Miền Trung' }, quyen)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // P4 (final-fix-FE.md, Ruling 426): DATA router (`createMemoryRouter` + `RouterProvider`), đúng
  // loại `app/routes.tsx` dùng. `ReportForm` — dựng bên trong trang này — gọi `useBlocker` để trang
  // không chết câm khi còn ô chưa lưu, và `useBlocker` CHỈ chạy trong data router. Bọc cho khớp
  // CÂY THẬT thay vì bẻ mã sản phẩm cho vừa test.
  const router = createMemoryRouter([{ path: '/reports/:id', element: <ReportDetail /> }], {
    initialEntries: ['/reports/12'],
  })
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('ReportDetail', () => {
  it('gọi /templates/ theo template_code CỦA BÁO CÁO (FM02), không phải chuỗi FM01 viết cứng', async () => {
    const daGoi = moiApi()
    ve()
    expect(await screen.findByRole('heading', { name: 'PTSC Miền Trung · FM02 · 08/2026' })).toBeTruthy()
    expect(daGoi.some((u) => u.endsWith('/templates/FM02'))).toBe(true)
    expect(daGoi.some((u) => u.includes('/templates/FM01'))).toBe(false)
  })

  // Đột biến N10 của reviewer: bỏ nhánh `report.approve` của breadcrumb. Người duyệt tới màn này
  // từ hàng đợi "Chờ duyệt", người nộp tới từ "Báo cáo của đơn vị" — breadcrumb phải trỏ về đúng
  // chỗ họ vừa rời đi, và quyền là thứ duy nhất phân biệt (carry C1: không đọc chuỗi vai trò).
  it('breadcrumb đi theo QUYỀN: người duyệt thấy "Chờ duyệt", người nộp thấy "Báo cáo của đơn vị"', async () => {
    moiApi()
    const r = ve(QUYEN_NGUOI_DUYET)
    expect(await screen.findByText('Chờ duyệt')).toBeTruthy()
    expect(screen.queryByText('Báo cáo của đơn vị')).toBeNull()
    r.unmount()

    moiApi()
    ve(QUYEN_NGUOI_NOP)
    expect(await screen.findByText('Báo cáo của đơn vị')).toBeTruthy()
    expect(screen.queryByText('Chờ duyệt')).toBeNull()
  })

  it('báo cáo trả 403: hiện "không có quyền" + lối về /reports, KHÔNG dựng bảng chỉ tiêu', async () => {
    moiApi({ '/reports/12': 403 })
    ve()
    expect(await screen.findByText('Bạn không có quyền xem báo cáo này')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Về báo cáo của đơn vị' }).getAttribute('href')).toBe('/reports')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('báo cáo trả 404: hiện "Không tìm thấy báo cáo", KHÔNG hiện câu lỗi mạng kèm nút Thử lại', async () => {
    moiApi({ '/reports/12': 404 })
    ve()
    expect(await screen.findByText('Không tìm thấy báo cáo')).toBeTruthy()
    expect(screen.queryByText('Không tải được báo cáo')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })

  it('báo cáo trả 500: hiện InlineError "Không tải được báo cáo" kèm nút Thử lại', async () => {
    moiApi({ '/reports/12': 500 })
    ve()
    expect(await screen.findByText('Không tải được báo cáo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy()
  })

  it('danh mục trả 404 (báo cáo thì OK): vẫn là "Không tìm thấy báo cáo", không kẹt ở skeleton', async () => {
    moiApi({ '/templates/': 404 })
    ve()
    expect(await screen.findByText('Không tìm thấy báo cáo')).toBeTruthy()
  })

  // Nhánh "chưa có dữ liệu" phải kiểm CẢ HAI lượt tải: báo cáo về rồi mà danh mục hỏng thì vẫn
  // chưa dựng được form — chỉ kiểm `baoCao.data` là kẹt ở skeleton mãi mãi, không câu nào nói gì.
  it('danh mục trả 500 (báo cáo thì OK): hiện InlineError, không kẹt ở skeleton', async () => {
    moiApi({ '/templates/': 500 })
    ve()
    expect(await screen.findByText('Không tải được báo cáo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy()
  })

  // fix-1 F1 — LỖI NỀN KHÔNG ĐƯỢC PHÁ MÀN HÌNH ĐANG CÓ DỮ LIỆU.
  //
  // Task 23 là thứ đầu tiên khiến trang này gọi lại `GET /reports/{id}` sau mỗi 1,5 giây gõ
  // (`invalidateReportQueries` sau mỗi lần lưu). TanStack Query GIỮ NGUYÊN `data` cũ khi một lượt
  // refetch NỀN hỏng và chỉ dựng thêm `error`; kiểm `error` TRƯỚC `data` sẽ thay cả form bằng
  // `InlineError` vì một cú 502 của Render free — `ReportForm` unmount, reducer (mọi số đang gõ),
  // hàng chờ lưu và cái hẹn debounce mất sạch. Đúng lớp lỗi Task 20 (`/auth/me` trả 503 lúc Render
  // ngủ dậy làm đăng xuất một phiên còn hợp lệ).
  it('lượt làm mới nền trả 502: form VẪN còn, ô đang gõ còn nguyên, chỉ nói ở dải trạng thái', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const u = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    const loi: Record<string, number> = {}
    moiApi(loi)
    ve()

    await u.click(await screen.findByLabelText(/^B-1\.1 .+, Tháng này$/))
    await u.keyboard('7')
    await u.tab()

    loi['/reports/12'] = 502 // lượt GET làm mới ngay sau khi lưu sẽ hỏng
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })

    expect(await screen.findByText('Không làm mới được số liệu')).toBeTruthy()
    expect(screen.queryByText('Không tải được báo cáo')).toBeNull()
    const oNhap = screen.getByLabelText(/^B-1\.1 .+, Tháng này$/) as HTMLInputElement
    expect(oNhap.value).toBe('7')
  })

  // G7 — câu cảnh báo KHÔNG dính vĩnh viễn: nó đọc `error` của query, mà TanStack Query xoá
  // `error` ngay khi một lượt fetch thành công. Đã ĐO (vòng sửa 2) rồi mới khoá: sau một lượt hỏng
  // + một lượt lọt, dải đầu quay về "Đã lưu HH:MM". Không có ca này thì một bản "nhớ luôn đã từng
  // hỏng" cũng xanh, và người vừa qua cú mạng chập chờn mất luôn chỉ báo họ cần nhất.
  it('làm mới THÀNH CÔNG trở lại thì câu cảnh báo tự tắt, "Đã lưu HH:MM" quay lại', async () => {
    const u = nguoiDung()
    const loi: Record<string, number> = {}
    moiApi(loi)
    ve()

    loi['/reports/12'] = 502
    await goRoiLuu(u, 'B-1.1', '7')
    expect(await screen.findByText('Không làm mới được số liệu')).toBeTruthy()

    delete loi['/reports/12'] // mạng trở lại
    await goRoiLuu(u, 'B-1.2', '9')
    expect(screen.queryByText('Không làm mới được số liệu')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/^Đã lưu \d\d:\d\d$/)
  })

  // G1 — lượt làm mới nền THÀNH CÔNG cũng không được dựng lại form. Không ca nào trong cả dự án
  // khoá đường này, nên một `key={baoCao.dataUpdatedAt}` đặt nhầm sẽ remount `ReportForm` sau MỌI
  // lần lưu (và mọi lần quay lại tab), xoá sạch reducer + hàng chờ lưu + hẹn debounce — đúng thiệt
  // hại F1 sinh ra để chặn, nhưng trên đường chạy thường xuyên hơn nhiều.
  it('làm mới nền THÀNH CÔNG không dựng lại form: ô đã gõ và ô còn trong hàng chờ đều còn nguyên', async () => {
    const u = nguoiDung()
    const daGoi = moiApi()
    ve()
    await goRoiLuu(u, 'B-1.1', '7') // ô này đã lên server

    // Ô thứ hai: gõ rồi rời ô, CHƯA hết 1,5 giây nên còn nằm trong hàng chờ lưu.
    await u.click(screen.getByLabelText(/^B-1\.2 .+, Tháng này$/))
    await u.keyboard('9')
    await u.tab()
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()

    await quayLaiTab(daGoi)

    expect((screen.getByLabelText(/^B-1\.1 .+, Tháng này$/) as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText(/^B-1\.2 .+, Tháng này$/) as HTMLInputElement).value).toBe('9')
    // Hàng chờ lưu sống sót: ô B-1.2 vẫn được gửi đi khi mốc debounce tới.
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    expect(screen.getByRole('status').textContent).toMatch(/^Đã lưu \d\d:\d\d$/)
  })

  // G4 — `loiLamMoi` phải phủ CẢ HAI lượt tải. `loi = baoCao.error ?? mau.error`, nên một lượt làm
  // mới DANH MỤC hỏng cũng phải nói ra: bảng chỉ tiêu trên màn có thể đã cũ.
  it('làm mới DANH MỤC hỏng cũng nói ra ở dải đầu, và vẫn giữ form', async () => {
    const u = nguoiDung()
    const loi: Record<string, number> = {}
    const daGoi = moiApi(loi)
    ve()
    await goRoiLuu(u, 'B-1.1', '7')

    loi['/templates/'] = 502
    await quayLaiTab(daGoi)

    expect(screen.getByText('Không làm mới được số liệu')).toBeTruthy()
    expect((screen.getByLabelText(/^B-1\.1 .+, Tháng này$/) as HTMLInputElement).value).toBe('7')
    expect(screen.queryByText('Không tải được báo cáo')).toBeNull()
  })

  // G5 — ranh giới của F1 theo CẢ HAI chiều: 5xx là trục trặc tạm thời (giữ form), còn 403 là KẾT
  // LUẬN — quyền vừa bị thu hồi thì không được để người ta gõ tiếp vào một form họ không còn
  // quyền ghi. Ca 404 đã có ở trên; ca này khoá nửa còn lại.
  it('403 NỀN (quyền vừa bị thu hồi) vẫn thay cả trang, không giữ form như 5xx', async () => {
    const u = nguoiDung()
    const loi: Record<string, number> = {}
    const daGoi = moiApi(loi)
    ve()
    await goRoiLuu(u, 'B-1.1', '7')

    loi['/reports/12'] = 403
    await quayLaiTab(daGoi)

    expect(screen.getByText('Bạn không có quyền xem báo cáo này')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('Không làm mới được số liệu')).toBeNull()
  })
})
