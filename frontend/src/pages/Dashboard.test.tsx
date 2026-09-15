// frontend/src/pages/Dashboard.test.tsx
//
// task-25-brief.md Step 1 liệt 7 ca (trích) — file này viết lại đủ 7 ca đó với dữ liệu ĐẦY ĐỦ
// (brief chỉ trích một phần đối tượng, vd. `kpis: [{...}, /*…*/]`), cộng thêm 1 ca cho nửa còn lại
// của tên ca 2 ("LTI = 0 với approved_count > 0 thì ô thường" — brief đặt tên nhưng thân ca gốc chỉ
// assert nửa đầu).
//
// HAI chỗ khác brief NGUYÊN VĂN, cả hai đều nêu trong task-25-report.md mục "khác brief":
//   1) `.closest('div')` của brief KHÔNG tới được div gốc của Tile: label/value trong Tile.tsx
//      (carry C4, không được sửa) TỰ nó đã là <div>, nên `.closest('div')` trả về CHÍNH nó (MDN:
//      closest() tự kiểm phần tử trước khi lên tổ tiên) — assert luôn xem nhầm className của
//      div nhãn/số, không phải div gốc mang 'bg-dangerBg'/'flash'. Sửa bằng `.closest('.rounded-tile')`
//      (test 2, dùng chung Dashboard) và `container.firstElementChild` (test 7, render Tile đơn lẻ
///     — đúng khuôn ui.test.tsx đã dùng cho chính Tile).
//   2) Neo `#B-2-1` (brief) là mã FAT, không phải LTI — app/seed/catalog_fm01.py:77-78 xác nhận
//      B-2.1="FAT (Fatality)"/"Chết người", B-2.2="LTI (Lost Time Injury)"/"Thương tật mất thời
//      gian"; dashboard.py tự map y hệt (`Indicator.code == "B-2.2"` -> cột "lti"). Neo đúng cho
//      "click số LTI" là `maNeo('B-2.2')` = "B-2-2". Test dưới khoá theo mã THẬT, không theo brief.
// Đồng thời đổi khẳng định điều hướng từ `nhaySpy` (brief) sang khuôn "dich-den" đã dùng ở
// Reports.test.tsx/Login.test.tsx (carry C12 cho phép chọn; dich-den kiểm được router THẬT SỰ tới
// nơi, spy chỉ kiểm lời gọi) — cần Dashboard nằm trong Router thật để đọc `?period=` nên khuôn này
// tự nhiên hơn dựng thêm một mock react-router-dom riêng.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { Dashboard } from './Dashboard'
import { KpiTile } from '../features/dashboard/KpiTile'
import type { UnitRow } from '../features/dashboard/useUnits'
import { queryClient as queryClientSanXuat } from '../app/queryClient'

beforeEach(() => {
  vi.unstubAllGlobals()
})

// ---- Fixture mặc định: 22 đơn vị, U05 có report_id=105 (ca click LTI), U22 "PTSC Đình Vũ" chưa
// nộp (report_id/state/mọi số null). Mọi số MẶC ĐỊNH đều > 0 (carry test 1: trang không được lẫn
// số 0 GIẢ của một ô với số 0 THẬT khi approved_count=0 — nên fixture nền không có ô nào là "0"). ----

function donViMacDinh(i: number): UnitRow {
  const code = `U${String(i).padStart(2, '0')}`
  return {
    org_unit: { code, name: `Đơn vị ${code}` },
    gio_cong: 100 + i,
    lti: (i % 5) + 1,
    fat: (i % 3) + 1,
    near_miss: (i % 4) + 1,
    hazob: (i % 6) + 1,
    gio_an_toan_tu_lti_cuoi: 1000 + i * 10,
    state: 'approved',
    report_id: 200 + i,
  }
}

const DON_VI_CHUA_NOP: UnitRow = {
  org_unit: { code: 'U22', name: 'PTSC Đình Vũ' },
  gio_cong: null,
  lti: null,
  fat: null,
  near_miss: null,
  hazob: null,
  gio_an_toan_tu_lti_cuoi: null,
  state: null,
  report_id: null,
}

const DEFAULT_UNITS: UnitRow[] = Array.from({ length: 21 }, (_, i) => donViMacDinh(i + 1))
  .concat(DON_VI_CHUA_NOP)
  .map((u) => (u.org_unit.code === 'U05' ? { ...u, report_id: 105 } : u))

const DEFAULT_SUMMARY = {
  period_key: '2026-08',
  reporting_units: 22,
  approved_count: 21,
  submitted_count: 0,
  missing_units: [{ code: 'U22', name: 'PTSC Đình Vũ' }],
  kpis: [
    { code: 'B-2.2', label: 'LTI trong kỳ', value: 5, unit: 'Số vụ' },
    { code: 'B-2.1', label: 'FAT trong kỳ', value: 3, unit: 'Số vụ' },
    { code: 'DON_VI_CO_LTI', label: 'Đơn vị có LTI', value: 2, unit: 'Đơn vị' },
    { code: 'B-1.4', label: 'Tổng giờ công', value: 128450, unit: 'Giờ' },
    { code: 'B-2.10', label: 'Near miss', value: 12, unit: 'Số vụ' },
    { code: 'B-2.11', label: 'HAZOB card', value: 44, unit: 'Cái' },
  ],
}

// P2 (final-review-R2-report.md A3): dải kỳ CÓ THẬT của seed — GET /templates/FM01/periods trả
// đúng 4 kỳ 2026-06…2026-09 đã sắp theo start_date. Đây là NGUỒN CHÂN LÝ Dashboard dùng để biết
// "kỳ này có thật không"; mọi ca dưới đây chạy trên dải đó trừ khi truyền `periods` khác.
const DEFAULT_PERIODS = ['2026-06', '2026-07', '2026-08', '2026-09'].map((period_key, i) => ({
  period_key,
  start_date: `${period_key}-01`,
  end_date: `${period_key}-28`,
  due_at: `${period_key}-28T23:59:59Z`,
  is_open: i >= 2,
}))

function moiApi(overrides: Partial<typeof DEFAULT_SUMMARY> = {}, periods: unknown[] = DEFAULT_PERIODS) {
  const summary = { ...DEFAULT_SUMMARY, ...overrides }
  const f = vi.fn((url: string) => {
    if (url.includes('/dashboard/summary')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => summary })
    }
    if (url.includes('/dashboard/units')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_UNITS })
    }
    if (url.includes('/periods')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => periods })
    }
    throw new Error(`URL không lường trước trong test: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}

// Request kỳ mới treo vĩnh viễn — mô phỏng "đang tải" để kiểm keepPreviousData (test 5). Trả về
// chính mock để nơi gọi xem lại được ĐÃ có request nào bay lên với period mới hay chưa (không thì
// một nút bấm không làm gì cũng qua được ca "dữ liệu cũ còn nguyên, không skeleton" — hai khẳng
// định đó đúng y hệt khi không có gì xảy ra).
function moiApiCham() {
  const f = vi.fn((_url: string) => new Promise<never>(() => {}))
  vi.stubGlobal('fetch', f)
  return f
}

// Đích điều hướng nội bộ (khuôn dich-den — xem carry C12) — hiện lại path+search+hash để khẳng
// định trên CÂY THẬT thay vì spy.
function DichDen() {
  const { pathname, search, hash } = useLocation()
  return (
    <div data-testid="dich-den">
      {pathname}
      {search}
      {hash}
    </div>
  )
}

function renderDashboard(initialPath = '/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<DichDen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('/dashboard', () => {
  it('approved_count = 0: 6 ô hiện — và coverage nói ĐỦ như bản vẽ states.html D11', async () => {
    moiApi({
      approved_count: 0,
      submitted_count: 2,
      reporting_units: 22,
      kpis: DEFAULT_SUMMARY.kpis.map((k) => ({ ...k, value: 0 })),
    })
    renderDashboard()
    expect(await screen.findAllByLabelText('chưa có dữ liệu')).toHaveLength(6)
    // Vòng sửa 1 (task-25-fix-1.md A2, review mục 2 NẶNG): states.html D11 viết ĐỦ bốn số —
    // "Chưa có báo cáo được duyệt · Đã nộp 1/22 · Chờ duyệt 1 · Chưa nộp 21" — bản trước dừng
    // sau "Đã nộp n/N", làm luật "coverage nói 'ai chưa nộp' ĐÚNG MỘT LẦN" thành KHÔNG lần nào ở
    // đúng nhánh kỳ demo (approved_count = 0). Khoá đủ CẢ CÂU, không chỉ tiền tố.
    const coverage = await screen.findByText(/Chưa có báo cáo được duyệt/)
    expect(coverage.textContent).toBe('Chưa có báo cáo được duyệt · Đã nộp 2/22 · Chờ duyệt 2 · Chưa nộp 1')
    expect(screen.queryByText('0')).toBeNull()
    // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-11+M-32, task-25-rereview-1.md mục 9 [NHẸ]): nhánh
    // `approvedCount === 0` (Coverage.tsx) — bỏ `mb-5` (M-11, mất khoảng cách dưới dòng coverage,
    // đẩy sát lưới KPI) hoặc đổi `text-sec` thành `text-ink` (M-32, mất tín hiệu "đây là dòng phụ,
    // không phải nội dung chính") đều vẫn xanh vì không ca nào đọc class của CHÍNH nhánh này.
    expect(coverage.className).toContain('mb-5')
    expect(coverage.className).toContain('text-sec')
  })

  it('LTI > 0 thì ô đỏ', async () => {
    moiApi({
      approved_count: 21,
      kpis: DEFAULT_SUMMARY.kpis.map((k) => (k.code === 'B-2.2' ? { ...k, value: 2 } : k)),
    })
    renderDashboard()
    const nhan = await screen.findByText('LTI trong kỳ')
    expect(nhan.closest('.rounded-tile')?.className).toContain('bg-dangerBg')
  })

  // Nửa sau của tên ca 2 (brief chỉ assert nửa đầu ở thân ca gốc) — khoá luôn nhánh còn lại để
  // mutation "bỏ điều kiện value>0" (đổi thành luôn đỏ khi approved_count>0) không sống sót.
  it('LTI = 0 với approved_count > 0 thì ô KHÔNG đỏ', async () => {
    moiApi({
      approved_count: 21,
      kpis: DEFAULT_SUMMARY.kpis.map((k) => (k.code === 'B-2.2' ? { ...k, value: 0 } : k)),
    })
    renderDashboard()
    const nhan = await screen.findByText('LTI trong kỳ')
    expect(nhan.closest('.rounded-tile')?.className).not.toContain('bg-dangerBg')
  })

  it('coverage liệt kê tối đa 4 tên đơn vị chưa nộp rồi +n', async () => {
    moiApi({
      approved_count: 15,
      missing_units: Array.from({ length: 7 }, (_, i) => ({ code: `U${i}`, name: `Đơn vị ${i}` })),
    })
    renderDashboard()
    // So khớp CHUỖI ĐỦ (không chỉ mảnh "Đơn vị 3, +3" của brief) — khoá cả số đếm ("Chưa nộp 7"),
    // đúng 4 tên đầu (không lệch 3 hay 5) và dấu phẩy-khoảng-trắng nối "+3" vào tên cuối cùng.
    const coverage = await screen.findByText(/Chưa nộp 7:/)
    expect(coverage.textContent).toContain(
      'Chưa nộp 7: Đơn vị 0, Đơn vị 1, Đơn vị 2, Đơn vị 3, +3',
    )
  })

  it('coverage: đúng 4 đơn vị chưa nộp thì KHÔNG có đuôi +n', async () => {
    moiApi({
      approved_count: 15,
      missing_units: Array.from({ length: 4 }, (_, i) => ({ code: `U${i}`, name: `Đơn vị ${i}` })),
    })
    renderDashboard()
    const coverage = await screen.findByText(/Chưa nộp 4:/)
    expect(coverage.textContent).toContain('Chưa nộp 4: Đơn vị 0, Đơn vị 1, Đơn vị 2, Đơn vị 3')
    expect(coverage.textContent).not.toContain('+0')
  })

  it('coverage: không đơn vị nào chưa nộp thì không có đoạn "Chưa nộp"', async () => {
    moiApi({ approved_count: 22, submitted_count: 0, missing_units: [] })
    renderDashboard()
    // So trên CHÍNH dòng coverage (không phải toàn trang) — bảng 22 đơn vị mặc định (moiApi luôn
    // trả DEFAULT_UNITS, không đổi theo override) vẫn có một dòng chip "Chưa nộp" (U22), nên tìm
    // trên toàn `screen` sẽ luôn thấy chữ đó bất kể coverage đúng hay sai.
    const coverage = await screen.findByText(/Toàn Tổng công ty/)
    expect(coverage.textContent).not.toContain('Chưa nộp')
  })

  it('bảng đủ 22 dòng; dòng Chưa nộp hiện — và không click được', async () => {
    moiApi()
    renderDashboard()
    const dong = await screen.findAllByRole('row')
    expect(dong).toHaveLength(23) // 1 header + 22
    const chuaNop = screen.getByText('PTSC Đình Vũ').closest('tr')!
    expect(chuaNop.getAttribute('aria-disabled')).toBe('true')
  })

  // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-51, task-25-rereview-1.md M-51 [NHẸ]): carry C1
  // (UnitsTable.tsx:9-11) nói nguồn chân lý cho "dòng bấm được" là `report_id !== null`, KHÔNG
  // phải `state !== null` — hai thứ trùng nhau ở MỌI fixture hiện có (DEFAULT_UNITS,
  // DON_VI_CHUA_NOP) nên không ca nào phân biệt được nếu UnitsTable.tsx lỡ đổi điều kiện
  // `coBaoCao` sang đọc `state`. Dựng MỘT dòng lệch cố ý (state khác null, report_id null) để
  // khoá đúng quyết định carry C1 — lỗ phủ test thuần tuý, mã sản phẩm đã đúng từ trước.
  it('carry C1: state khác null nhưng report_id null thì DÒNG VẪN không bấm được (M-51)', async () => {
    const donViLa: UnitRow = {
      org_unit: { code: 'U23', name: 'Đơn vị lạ' },
      gio_cong: 50,
      lti: 1,
      fat: 1,
      near_miss: 1,
      hazob: 1,
      gio_an_toan_tu_lti_cuoi: 500,
      state: 'approved', // khác null — nhưng report_id null bên dưới mới là thứ QUYẾT ĐỊNH
      report_id: null,
    }
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
      }
      if (url.includes('/dashboard/units')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [donViLa] })
      }
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_PERIODS })
      }
      throw new Error(`URL không lường trước trong test: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()

    const dong = (await screen.findByText('Đơn vị lạ')).closest('tr')!
    expect(dong.getAttribute('aria-disabled')).toBe('true')
    expect(within(dong).queryByTestId('lti-U23')).toBeNull()
  })

  it('đổi kỳ giữ dữ liệu cũ trong lúc tải (keepPreviousData), không nháy skeleton', async () => {
    moiApi()
    renderDashboard()
    await screen.findByText('PTSC Đình Vũ')
    const fCham = moiApiCham() // request kỳ mới treo
    await userEvent.click(screen.getByRole('button', { name: '‹ 07/2026' }))
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy() // bảng cũ còn nguyên
    expect(screen.queryByTestId('skeleton')).toBeNull()
    // Xác nhận kỳ ĐÃ thật sự đổi (không phải nút không làm gì nên hai khẳng định "không đổi gì" ở
    // trên trùng khớp giả): cả hai hook phải phát request MỚI mang đúng period=2026-07 — nếu
    // useSummary/useUnits thiếu `period` trong queryKey (carry C11), request này sẽ không bao giờ
    // bay lên vì react-query nghĩ vẫn là cùng một query.
    await waitFor(() => {
      const urls = fCham.mock.calls.map(([u]) => String(u))
      expect(urls.some((u) => u.includes('/dashboard/summary') && u.includes('period=2026-07'))).toBe(true)
      expect(urls.some((u) => u.includes('/dashboard/units') && u.includes('period=2026-07'))).toBe(true)
    })
  })

  // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-47, task-25-rereview-1.md mục 9 [NHẸ]): đổi
  // `key={row.org_unit.code}` (UnitsTable.tsx, Dong) thành `key={Math.random()}` vẫn xanh — mọi
  // ca hiện có chỉ đọc TEXT/class sau khi render lại, không ca nào chứng minh React THỰC SỰ TÁI
  // SỬ DỤNG đúng node DOM cũ (key không ổn định thì React huỷ+dựng lại node dù dữ liệu dòng không
  // đổi). Đo bằng chính THAM CHIẾU node DOM: đổi kỳ trong lúc request mới còn treo khiến
  // `keepPreviousData` giữ NGUYÊN mảng `rows` cũ (cùng `org_unit.code`) — key ổn định thì React
  // tái dùng ĐÚNG node cũ (cùng tham chiếu), key đổi mỗi lần render (Math.random()) thì không.
  it('key theo mã đơn vị ổn định: đổi kỳ (keepPreviousData) không dựng lại DOM node của dòng (M-47)', async () => {
    moiApi()
    renderDashboard()
    await screen.findByText('PTSC Đình Vũ')
    const dongTruoc = screen.getByText('Đơn vị U05').closest('tr')!
    moiApiCham() // request kỳ mới treo — buộc re-render với rows CŨ (keepPreviousData)
    await userEvent.click(screen.getByRole('button', { name: '‹ 07/2026' }))
    expect(screen.queryByTestId('skeleton')).toBeNull() // đã re-render thật, không còn ở lần tải đầu
    const dongSau = screen.getByText('Đơn vị U05').closest('tr')!
    expect(dongSau).toBe(dongTruoc)
  })

  it('nút kỳ sau hiện đúng "09/2026 ›" và bấm vào đổi đúng period', async () => {
    const f = moiApi()
    renderDashboard()
    await screen.findByText('PTSC Đình Vũ')
    await userEvent.click(await screen.findByRole('button', { name: '09/2026 ›' }))
    await waitFor(() => {
      const urls = f.mock.calls.map(([u]) => String(u))
      expect(urls.some((u) => u.includes('period=2026-09'))).toBe(true)
    })
  })

  // congThang dùng Date.UTC nên tự tràn năm đúng (JS chuẩn hoá tháng âm/>11) — không test qua ranh
  // giới năm thì mutation "lấy `nam` gốc thay vì d.getUTCFullYear()" (đúng với MỌI kỳ giữa năm,
  // vd. 2026-08 dùng ở các ca trên) sống sót, chỉ lộ sai ở kỳ đầu/cuối năm.
  //
  // P2: dải kỳ của ca này phải BAO kỳ 2026-01 và kỳ liền trước nó — nếu không, 2026-01 rơi vào
  // nhánh "kỳ ngoài dải" và PeriodNav không còn được vẽ, ca mất đối tượng đo. Dải riêng giữ ĐÚNG
  // thứ ca này đang đo (số học tràn năm), không đo lây sang chuyện biên.
  it('congThang qua ranh giới năm: kỳ 01/2026 thì nút lùi hiện "‹ 12/2025"', async () => {
    moiApi({}, ['2025-11', '2025-12', '2026-01', '2026-02'].map((period_key) => ({ period_key, is_open: false })))
    renderDashboard('/dashboard?period=2026-01')
    expect(await screen.findByRole('button', { name: '‹ 12/2025' })).toBeTruthy()
  })

  it('click số LTI của một đơn vị mở đúng báo cáo bằng điều hướng SPA thật', async () => {
    moiApi()
    renderDashboard()
    await userEvent.click(await screen.findByTestId('lti-U05'))
    expect((await screen.findByTestId('dich-den')).textContent).toBe(
      '/reports/105?from=dashboard&period=2026-08#B-2-2',
    )
  })

  // Chỉ LTI/FAT được tô đỏ khi dương (thiết kế dòng 623) — Near miss mặc định = 12 (dương) trong
  // fixture nhưng KHÔNG được đỏ. Không có ca này thì mutation "bỏ điều kiện mã LTI/FAT" (mọi ô
  // dương đều đỏ) sống sót — test 'LTI > 0 thì ô đỏ' ở trên không phân biệt được vì mọi KPI mặc
  // định đều dương.
  it('Near miss > 0 nhưng KHÔNG đỏ — chỉ LTI/FAT được tô đỏ khi dương', async () => {
    moiApi()
    renderDashboard()
    // "Near miss" khớp CẢ nhãn ô KPI lẫn tiêu đề cột bảng (cùng chữ) — lọc lấy đúng cái nằm trong
    // một ô KPI (.rounded-tile), bỏ qua tiêu đề cột.
    const oKpi = (await screen.findAllByText('Near miss')).find((el) => el.closest('.rounded-tile'))
    expect(oKpi?.closest('.rounded-tile')?.className).not.toContain('bg-dangerBg')
  })

  it('trạng thái: đơn vị có báo cáo hiện chip Đã duyệt, đơn vị chưa nộp hiện chip Chưa nộp', async () => {
    moiApi()
    renderDashboard()
    const dongChuaNop = (await screen.findByText('PTSC Đình Vũ')).closest('tr')!
    expect(within(dongChuaNop).getByText('Chưa nộp')).toBeTruthy()
    const dongDaDuyet = screen.getByText('Đơn vị U05').closest('tr')!
    expect(within(dongDaDuyet).getByText('Đã duyệt')).toBeTruthy()
  })

  it('bảng đúng 8 cột theo thiết kế', async () => {
    moiApi()
    renderDashboard()
    expect(await screen.findAllByRole('columnheader')).toHaveLength(8)
  })

  // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-43, task-25-rereview-1.md mục 7 [NHẸ]): ca trên chỉ
  // đếm `columnheader` (8 <th> của `<thead>`) — thêm một `<td>` thứ 9 thừa vào MỖI dòng thân bảng
  // vẫn xanh vì không ca nào đếm `cell` của một DÒNG THÂN cụ thể.
  it('mỗi dòng thân bảng đúng 8 ô, không thừa/thiếu (M-43)', async () => {
    moiApi()
    renderDashboard()
    const dong = (await screen.findByText('Đơn vị U05')).closest('tr')!
    expect(within(dong).getAllByRole('cell')).toHaveLength(8)
  })

  // Vòng sửa 1 (task-25-fix-1.md A5-a, review mục 11 "a"): bản vẽ đặt class="num" (canh PHẢI)
  // lên đúng 6 <th> cột số — "Đơn vị"/"Trạng thái" canh trái như cũ.
  it('6 tiêu đề cột SỐ canh phải, "Đơn vị"/"Trạng thái" canh trái (A5-a)', async () => {
    moiApi()
    renderDashboard()
    await screen.findAllByRole('columnheader')
    const oCot = (ten: string) => screen.getByRole('columnheader', { name: ten })
    for (const ten of ['Giờ công', 'LTI', 'FAT', 'Near miss', 'HAZOB', 'Giờ AT kể từ LTI cuối']) {
      expect(oCot(ten).className).toContain('text-right')
    }
    expect(oCot('Đơn vị').className).not.toContain('text-right')
    expect(oCot('Trạng thái').className).not.toContain('text-right')
  })

  // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-15, task-25-rereview-1.md mục 7 [NHẸ]): A5-a ở trên
  // chỉ khoá canh phải của TIÊU ĐỀ cột — bỏ `text-right` khỏi `O_SO` (áp cho `<td>` thân bảng,
  // UnitsTable.tsx) vẫn xanh vì không ca nào đọc class của chính Ô SỐ trong thân bảng.
  it('các ô SỐ trong thân bảng canh phải, không chỉ tiêu đề (M-15)', async () => {
    moiApi()
    renderDashboard()
    const dong = (await screen.findByText('Đơn vị U05')).closest('tr')!
    const oCells = within(dong).getAllByRole('cell')
    for (const o of oCells.slice(1, 7)) expect(o.className).toContain('text-right')
    expect(oCells[0].className).not.toContain('text-right')
    expect(oCells[7].className).not.toContain('text-right')
  })

  // Vòng sửa 1 (task-25-fix-1.md A5-c, review mục 11 "c"): bản vẽ làm MỜ CẢ DÒNG "Chưa nộp"
  // (class="sec" trên mọi ô) — tín hiệu thị giác "dòng này không bấm được" (D4), hiện đang mất.
  it('dòng "Chưa nộp" mờ CẢ DÒNG, dòng đã duyệt thì không (A5-c)', async () => {
    moiApi()
    renderDashboard()
    const dongChuaNop = (await screen.findByText('PTSC Đình Vũ')).closest('tr')!
    const oChuaNop = within(dongChuaNop).getAllByRole('cell')
    expect(oChuaNop.length).toBeGreaterThan(0)
    for (const o of oChuaNop) expect(o.className).toContain('text-sec')

    const dongDaDuyet = screen.getByText('Đơn vị U05').closest('tr')!
    const oDaDuyet = within(dongDaDuyet).getAllByRole('cell')
    for (const o of oDaDuyet) expect(o.className).not.toContain('text-sec')
  })

  // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-02+M-25, task-25-rereview-1.md mục 6 [NHẸ]): không ca
  // nào khoá class bỏ viền dòng cuối (A5-h, UnitsTable.tsx) — xoá hẳn
  // `[&_tbody_tr:last-child_td]:border-b-0` khỏi `<table>` vẫn xanh.
  it('bảng có class bỏ viền dưới dòng cuối, tránh viền đôi sát khung ngoài (A5-h)', async () => {
    moiApi()
    renderDashboard()
    const bang = await screen.findByRole('table')
    expect(bang.className).toContain('[&_tbody_tr:last-child_td]:border-b-0')
  })

  // Không có trong 7 ca trích của brief, nhưng cùng khuôn InlineError đã dùng ở Reports.tsx
  // (carry: dashboard.py docstring — period không khớp trả 0/rỗng KHÔNG 404, nên isError ở đây
  // chỉ còn xảy ra khi mạng/máy chủ lỗi thật) — thêm để nhánh isError không phải mã chết-không-test.
  // Vòng sửa 1 (task-25-fix-1.md B8, review N13/mục 8 nhóm 2): "Thử lại" phải gọi lại CẢ HAI
  // endpoint — đếm riêng từng URL, không chỉ đếm TỔNG số lần gọi (tổng tăng vẫn xanh dù chỉ MỘT
  // trong hai được gọi lại).
  it('lỗi tải hiện InlineError kèm nút Thử lại; bấm Thử lại gọi lại CẢ HAI endpoint', async () => {
    const f = vi.fn((_url: string) =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) }),
    )
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
    const dem = (url: string) => f.mock.calls.filter(([u]) => String(u).includes(url)).length
    const truocSummary = dem('/dashboard/summary')
    const truocUnits = dem('/dashboard/units')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => {
      expect(dem('/dashboard/summary')).toBeGreaterThan(truocSummary)
      expect(dem('/dashboard/units')).toBeGreaterThan(truocUnits)
    })
  })

  // Vòng sửa 2 (task-25-fix-2.md P1/B-01, task-25-rereview-1.md B-01 [NẶNG] — LẦN THỨ BA của cùng
  // lớp lỗi: Task 20 (/auth/me 503 đăng xuất phiên còn hợp lệ), Task 23 (refetch nền hỏng xoá
  // sạch reducer, task-23-fix-1 F1), nay Task 25. `Dashboard.tsx:72` trước bản vá chỉ đọc
  // `summary.isError || units.isError` (boolean thô) — một lượt `refetchOnWindowFocus` hỏng khi
  // dữ liệu cũ còn nguyên trong cache vẫn làm `isError = true`, xoá mất bảng + 6 KPI + coverage
  // ĐANG ĐÚNG trên màn hình, thay bằng "Không tải được dữ liệu". Khuôn chép nguyên
  // `ReportDetail.tsx:67` (`loi && (…data === undefined || …data === undefined)`).
  it('đang xem bảng + KPI + coverage, rời tab rồi quay lại gặp 502: TRANG VẪN CÒN, không bị thay bằng InlineError (P1/B-01)', async () => {
    let goiThu = 0
    const f = vi.fn((url: string) => {
      goiThu++
      const laLanDau = goiThu <= 2 // 2 request đầu (summary + units) tải thành công
      if (url.includes('/dashboard/summary')) {
        return laLanDau
          ? Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      if (url.includes('/dashboard/units')) {
        return laLanDau
          ? Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_UNITS })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_PERIODS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()

    expect(await screen.findByText('Đơn vị U05')).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()

    // `refetchOnWindowFocus` (mặc định TanStack v5 `true`, `renderDashboard()`/`QueryClient` của
    // ca này không tắt nó) nghe `visibilitychange` trên WINDOW — cùng cơ chế `quayLaiTab` của
    // ReportDetail.test.tsx.
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(goiThu).toBeGreaterThan(2))
    expect(screen.getByText('Đơn vị U05')).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByText('Không tải được dữ liệu')).toBeNull()
  })

  // Vòng sửa 1 (task-25-fix-1.md A4, review mục 3/12): vai `reporter` không có `dashboard.view`
  // (seed/__init__.py:70) nên gõ thẳng /dashboard là đường đi tới được thật, không phải suy diễn.
  // Khuôn 403 đã có sẵn ở ReportDetail.tsx:46 ("không có quyền" + lối thoát) — Dashboard trước bản
  // vá này gộp mọi lỗi vào "Không tải được dữ liệu" + Thử lại lặp vô ích mãi mãi.
  it('403 (thiếu dashboard.view) hiện đúng câu "không có quyền" kèm lối thoát, không phải InlineError chung', async () => {
    const f = vi.fn((_url: string) =>
      Promise.resolve({ ok: false, status: 403, json: async () => ({ detail: 'Không có quyền dashboard.view' }) }),
    )
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByText('Bạn không có quyền xem dashboard này')).toBeTruthy()
    expect(screen.queryByText('Không tải được dữ liệu')).toBeNull()
    // Vòng sửa 2 (task-25-fix-2.md P3/M-05): trước bản vá chỉ kiểm CHỮ của link — đổi
    // `to="/reports"` thành `to="/dashboard"` (quay lại đúng màn vừa từ chối, vòng lặp kín) vẫn
    // xanh. Khoá luôn ĐÍCH ĐẾN (khuôn `ReportDetail.test.tsx:219` đã dùng cho ca 403 của nó).
    expect(screen.getByRole('link', { name: 'Về báo cáo của đơn vị' }).getAttribute('href')).toBe('/reports')
    // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-07, task-25-rereview-1.md mục 9 [NHẸ]): bỏ hẳn
    // `<TieuDe/>` khỏi nhánh 403 (Dashboard.tsx) vẫn xanh — không ca nào kiểm <h1>/điều hướng kỳ
    // còn sống khi trang đang ở màn 403.
    expect(screen.getByRole('heading', { name: 'Dashboard SKATMT' })).toBeTruthy()
    // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-31, task-25-rereview-1.md mục 9 [NHẸ]): đổi
    // `rounded-tile` của khung 403 thành `rounded-input` vẫn xanh — không ca nào đọc class bo góc
    // của khung này.
    expect(screen.getByText('Bạn không có quyền xem dashboard này').className).toContain('rounded-tile')
  })

  // Vòng sửa 2 (task-25-fix-2.md P2/M-01, task-25-rereview-1.md M-01 [VỪA]): `renderDashboard()`
  // tự tắt `retry` — ca 403 phía trên XANH vì một lý do KHÔNG TỒN TẠI ngoài production.
  // `app/queryClient.ts` (singleton thật) trước bản vá không đặt `retry` nào → mặc định TanStack
  // Query là 3 lần thử lại kèm backoff, nên 403 THẬT (reporter thiếu dashboard.view) mất ~7-8 giây
  // và bắn 8 request mới hiện đúng câu. Ca này dùng ĐÚNG cấu hình mặc định của singleton thật
  // (`getDefaultOptions()`, không chép tay lại logic retry để tránh lệch bản gốc) — QueryClient
  // MỚI (không đụng cache singleton, tránh C2/M-T1) nhưng cùng `retry`.
  it('403 hiện NGAY với QueryClient cấu hình như bản thật, không đợi hết lượt thử lại 4xx (M-01)', async () => {
    const f = vi.fn((_url: string) =>
      Promise.resolve({ ok: false, status: 403, json: async () => ({ detail: 'Không có quyền dashboard.view' }) }),
    )
    vi.stubGlobal('fetch', f)
    const qc = new QueryClient({ defaultOptions: queryClientSanXuat.getDefaultOptions() })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Bạn không có quyền xem dashboard này')).toBeTruthy()
    // Không thử lại 4xx: đúng 1 lần gọi MỖI endpoint — không phải 4 lượt mặc định TanStack khi
    // không đặt retry nào. P2: đếm THEO TỪNG endpoint chứ không đếm TỔNG — trang giờ hỏi thêm
    // /templates/FM01/periods, và một con số tổng khoá cứng biến mọi lần thêm/bớt query thành ca
    // đỏ giả trong khi vẫn không nói được endpoint NÀO bị thử lại.
    const dem = (u: string) => f.mock.calls.filter(([x]) => String(x).includes(u)).length
    expect(dem('/dashboard/summary')).toBe(1)
    expect(dem('/dashboard/units')).toBe(1)
    expect(dem('/templates/FM01/periods')).toBe(1)
  })

  // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-04+M-34, task-25-rereview-1.md mục 5 [NHẸ]): ca 403 ở
  // trên (và M-01) luôn cho CẢ HAI endpoint cùng trả 403 — không phân biệt được nếu xoá hẳn trường
  // `error` khỏi useSummary.ts (M-04) hay bỏ nhánh `units.error...` của phép OR trong `loi403`
  // (M-34, Dashboard.tsx). Hai ca dưới ép LỆCH: chỉ MỘT bên trả 403, bên kia bình thường — mỗi ca
  // khoá đúng MỘT nửa của `loi403`.
  it('CHỈ units trả 403 (summary bình thường): vẫn hiện đúng câu "không có quyền" (M-34)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
      }
      if (url.includes('/dashboard/units')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ detail: 'Không có quyền dashboard.view' }),
        })
      }
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_PERIODS })
      }
      throw new Error(`URL không lường trước trong test: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByText('Bạn không có quyền xem dashboard này')).toBeTruthy()
  })

  it('CHỈ summary trả 403 (units bình thường): vẫn hiện đúng câu "không có quyền" (M-04)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ detail: 'Không có quyền dashboard.view' }),
        })
      }
      if (url.includes('/dashboard/units')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_UNITS })
      }
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_PERIODS })
      }
      throw new Error(`URL không lường trước trong test: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByText('Bạn không có quyền xem dashboard này')).toBeTruthy()
  })

  // ---- Vòng sửa 1 (task-25-fix-1.md Nhóm 2) — mã đã đúng, khoá thêm test cho các đột biến review
  // tự nghĩ SỐNG. Mỗi ca dưới đây trỏ thẳng số hiệu N* của task-25-review.md Phần C. ----

  // B1 (N2): ô cảnh báo NẶNG NHẤT trang (chết người) mà ca đỏ duy nhất trước bản vá chỉ thử LTI.
  it('FAT > 0 thì ô đỏ (B1, N2)', async () => {
    moiApi({
      approved_count: 21,
      kpis: DEFAULT_SUMMARY.kpis.map((k) => (k.code === 'B-2.1' ? { ...k, value: 1 } : k)),
    })
    renderDashboard()
    const nhan = await screen.findByText('FAT trong kỳ')
    expect(nhan.closest('.rounded-tile')?.className).toContain('bg-dangerBg')
  })

  // B2 (N6, N25): đọc theo HÀNG, ánh xạ tiêu đề cột → giá trị — không theo chỉ số cứng (chỉ số
  // cứng chính là thứ để lọt hoán vị FAT↔Near miss hay Giờ công↔Giờ AT).
  it('đọc đúng CỘT theo tiêu đề, không theo chỉ số cứng — chặn hoán vị FAT/Near miss, Giờ công/Giờ AT (B2, N6, N25)', async () => {
    moiApi()
    renderDashboard()
    const tenCot = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dong = screen.getByText('Đơn vị U05').closest('tr')!
    const oCells = within(dong).getAllByRole('cell').map((c) => c.textContent)
    const theo = (ten: string) => oCells[tenCot.indexOf(ten)]
    // U05 = donViMacDinh(5): gio_cong=105, lti=1, fat=3, near_miss=2, hazob=6, gio_an_toan=1050
    expect(theo('Giờ công')).toBe('105')
    expect(theo('LTI')).toBe('1')
    expect(theo('FAT')).toBe('3')
    expect(theo('Near miss')).toBe('2')
    expect(theo('HAZOB')).toBe('6')
    expect(theo('Giờ AT kể từ LTI cuối')).toBe('1.050')
  })

  // B3 (N32): carry C2 cấm sắp lại lưới KPI — `[...kpis].reverse()` phải làm ca này đỏ.
  it('lưới 6 KPI render đúng thứ tự mảng API, không tự sắp lại (B3, N32, carry C2)', async () => {
    moiApi()
    renderDashboard()
    const oDau = await screen.findByText('LTI trong kỳ')
    const luoi = oDau.closest('.rounded-tile')!.parentElement!
    const text = luoi.textContent ?? ''
    const viTri = DEFAULT_SUMMARY.kpis.map((k) => text.indexOf(k.label))
    expect(viTri.every((v) => v !== -1)).toBe(true)
    for (let i = 1; i < viTri.length; i++) expect(viTri[i]).toBeGreaterThan(viTri[i - 1])
  })

  // B4 (N33): backend đã sắp LTI giảm dần để đơn vị có tai nạn nằm trên đầu — FE KHÔNG được tự
  // `sort` lại theo mã đơn vị (nếu có thì đơn vị có tai nạn tụt xuống giữa bảng).
  it('bảng giữ ĐÚNG thứ tự do backend trả về, FE không tự sort lại theo mã đơn vị (B4, N33)', async () => {
    const donViU10 = { ...donViMacDinh(10), lti: 1 }
    const donViU05 = { ...donViMacDinh(5), lti: 9 } // "mã nhỏ hơn" NHƯNG đứng SAU trong mảng BE
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
      }
      if (url.includes('/dashboard/units')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [donViU10, donViU05] })
      }
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_PERIODS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()
    const dong = await screen.findAllByRole('row')
    expect(within(dong[1]).getByText('Đơn vị U10')).toBeTruthy()
    expect(within(dong[2]).getByText('Đơn vị U05')).toBeTruthy()
  })

  // B5 (N3): đảo approvedCount ↔ submittedCount trong Coverage — dùng hai giá trị PHÂN BIỆT để
  // hoán vị lộ ra (fixture mặc định approved=21/submitted=0 ở các ca khác không phân biệt được
  // hai nhánh "0 vào chỗ nào").
  it('dòng bao phủ gán ĐÚNG approvedCount/submittedCount, không hoán đổi (B5, N3)', async () => {
    moiApi({ approved_count: 15, submitted_count: 3, missing_units: [] })
    renderDashboard()
    const coverage = await screen.findByText(/Toàn Tổng công ty/)
    expect(coverage.textContent).toContain('Tổng từ 15 báo cáo đã duyệt · Chờ duyệt 3')
  })

  // B5 (N36): "22 đầu mối" không được khoá cứng — phải theo ĐÚNG reportingUnits truyền vào.
  it('dòng bao phủ hiện ĐÚNG số đầu mối theo dữ liệu, không khoá cứng 22 (B5, N36)', async () => {
    moiApi({ reporting_units: 10, missing_units: [] })
    renderDashboard()
    const coverage = await screen.findByText(/Toàn Tổng công ty/)
    expect(coverage.textContent).toContain('10 đầu mối')
    expect(coverage.textContent).not.toContain('22 đầu mối')
  })

  // B6 (N12): trang PHẢI hiện skeleton ở lần tải đầu — trước bản vá này không ca nào khẳng định
  // "CÓ" skeleton (chỉ có ca 5 khẳng định "sau khi đổi kỳ thì KHÔNG còn" — rỗng ruột nếu skeleton
  // chưa từng tồn tại).
  it('lần tải đầu tiên CÓ hiện skeleton trước khi dữ liệu về (B6, N12)', async () => {
    moiApiCham()
    renderDashboard()
    const khungSkeleton = await screen.findByTestId('skeleton')
    expect(khungSkeleton).toBeTruthy()
    // Vòng sửa 2 (task-25-fix-2.md P6-P10/M-21, task-25-rereview-1.md mục 9 [NHẸ]): đổi
    // `<Skeleton rows={10}/>` (Dashboard.tsx) thành `rows={3}` vẫn xanh — không ca nào đếm số
    // dòng placeholder thật sự vẽ ra. `.rounded` định vị đúng các <div> DÒNG (Skeleton.tsx) —
    // <div> bọc ngoài của chính Skeleton không có class này nên không lẫn vào số đếm.
    expect(khungSkeleton.querySelectorAll('.rounded')).toHaveLength(10)
  })

  // B7 (N35): điều kiện skeleton phải gồm CẢ `units.isLoading` — nếu chỉ có `summary.isLoading`,
  // bảng đơn vị tải chậm hơn sẽ lọt qua nhánh "có dữ liệu" và hiện bảng RỖNG (chỉ header) một nhịp.
  it('bảng đơn vị tải chậm hơn KPI vẫn hiện skeleton, không hiện bảng rỗng (B7, N35)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
      }
      if (url.includes('/dashboard/units')) return new Promise<never>(() => {}) // treo mãi
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_PERIODS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByTestId('skeleton')).toBeTruthy()
    // `units` không BAO GIỜ tải xong trong ca này (treo mãi) nên khẳng định ngay-lập-tức phía trên
    // đúng cả khi SAI (đo trước khi `summary` — vốn tải nhanh — kịp chạy hết chuỗi await + cập nhật
    // React thật). Đợi thêm một nhịp macrotask THẬT (không dùng fake timer trong ca này) để chuỗi
    // đó chắc chắn đã xong rồi mới đo lại — nếu điều kiện skeleton thiếu `units.isLoading`, trang sẽ
    // lọt sang nhánh có dữ liệu ngay khi `summary` xong, và bảng (dù rỗng) sẽ xuất hiện ở đây.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.getByTestId('skeleton')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  // B9 (N37): link LTI phải mang ĐÚNG kỳ đang xem — ca click duy nhất trước bản vá luôn chạy ở
  // đúng kỳ mặc định 2026-08 nên một `period=2026-08` khoá cứng vẫn qua được.
  it('link LTI mang ĐÚNG kỳ đang xem, không khoá cứng 2026-08 (B9, N37)', async () => {
    moiApi()
    renderDashboard('/dashboard?period=2026-09')
    await userEvent.click(await screen.findByTestId('lti-U05'))
    expect((await screen.findByTestId('dich-den')).textContent).toBe(
      '/reports/105?from=dashboard&period=2026-09#B-2-2',
    )
  })

  // B10 (N5): ô kỳ ĐANG XEM (span giữa) phải hiện đúng kỳ hiện tại, không phải kỳ liền trước —
  // getByText khớp CHÍNH XÁC toàn bộ text riêng của phần tử, nên không lẫn với chữ "‹ 07/2026"
  // của nút (nút mang CẢ ký tự "‹ " trong cùng text, khác chuỗi "08/2026" đứng riêng của span).
  it('ô kỳ đang xem hiện ĐÚNG kỳ đang xem, không phải kỳ liền trước (B10, N5)', async () => {
    moiApi()
    renderDashboard()
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.getByText('08/2026')).toBeTruthy()
  })

  // B11 (N15): period_key hiện trên dòng bao phủ phải lấy từ MÁY CHỦ trả về, không phải tham số
  // URL — hai nguồn tình cờ trùng nhau ở mọi ca khác nên không phân biệt được nếu không cố ý lệch.
  it('dòng bao phủ lấy period_key theo MÁY CHỦ trả về, không theo tham số URL (B11, N15)', async () => {
    moiApi({ period_key: '2026-07' })
    renderDashboard() // URL không có ?period=, mặc định 2026-08
    expect(await screen.findByText(/Kỳ 07\/2026/)).toBeTruthy()
  })

  // B12 (N16): đổi kỳ phải dùng {replace:true} — nếu không, bấm đổi kỳ rồi bấm Back một lần sẽ
  // quay lại kỳ TRƯỚC đó thay vì không đi đâu cả (mỗi lần đổi kỳ chỉ THAY chỗ đứng hiện tại, không
  // đẩy thêm một mục lịch sử mới).
  it('đổi kỳ dùng {replace:true}: Back một lần sau khi đổi 1 lần KHÔNG quay lại kỳ cũ (B12, N16)', async () => {
    moiApi()
    function LuiLai() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate(-1)}>
          Lùi
        </button>
      )
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <LuiLai />
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<DichDen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByText('PTSC Đình Vũ')
    await userEvent.click(await screen.findByRole('button', { name: '09/2026 ›' }))
    expect(await screen.findByText('09/2026')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Lùi' }))
    // Không có mục lịch sử nào TRƯỚC lần đổi kỳ đầu tiên (nó THAY chỗ đứng ban đầu, không đẩy
    // thêm) — Back phải là một bước đi vào chỗ trống, kỳ vẫn còn là 09/2026.
    expect(screen.getByText('09/2026')).toBeTruthy()
  })

  // B14 (N10): brief nêu MINH THỊ thứ tự khối — coverage → 6 KPI → bảng.
  it('thứ tự khối trên trang: coverage → 6 KPI → bảng (B14, N10)', async () => {
    moiApi()
    const { container } = renderDashboard()
    await screen.findByText('PTSC Đình Vũ')
    const text = container.textContent ?? ''
    const iCoverage = text.indexOf('Toàn Tổng công ty')
    const iKpi = text.indexOf('LTI trong kỳ')
    const iBang = text.indexOf('Giờ công')
    expect(iCoverage).toBeGreaterThan(-1)
    expect(iKpi).toBeGreaterThan(iCoverage)
    expect(iBang).toBeGreaterThan(iKpi)
  })

  // B14 (N11): brief nêu MINH THỊ lưới 3×2 (grid-cols-3) — grid-cols-2 đẩy bảng xuống dưới màn.
  it('lưới KPI dùng đúng 3 cột (grid-cols-3), không phải 2 (B14, N11)', async () => {
    moiApi()
    renderDashboard()
    const the = await screen.findByText('LTI trong kỳ')
    expect(the.closest('.rounded-tile')?.parentElement?.className).toContain('grid-cols-3')
  })

  // B15 (N4): "Kỳ MM/YYYY ·" là tiền tố CỐ ĐỊNH của dòng bao phủ ở nhánh bình thường.
  it('dòng bao phủ có tiền tố "Kỳ MM/YYYY ·" (B15, N4)', async () => {
    moiApi()
    renderDashboard()
    expect(await screen.findByText(/^Kỳ 08\/2026 ·/)).toBeTruthy()
  })

  // B15 (N7): chữ tiêu đề cột đúng NGUYÊN VĂN bản vẽ — ca "đếm 8 columnheader" không đọc chữ.
  it('tiêu đề 8 cột đúng chữ bản vẽ, kể cả "Giờ AT kể từ LTI cuối" (B15, N7)', async () => {
    moiApi()
    renderDashboard()
    const chu = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    expect(chu).toEqual([
      'Đơn vị',
      'Giờ công',
      'LTI',
      'FAT',
      'Near miss',
      'HAZOB',
      'Giờ AT kể từ LTI cuối',
      'Trạng thái',
    ])
  })

  // B15 (N14): <h1> đúng chữ — không ca nào đọc <h1> trước bản vá này.
  it('<h1> đúng chữ "Dashboard SKATMT" (B15, N14)', async () => {
    moiApi()
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Dashboard SKATMT' })).toBeTruthy()
  })

  // B15 (N9): formatNumber(gio_cong, 0) — không có phần thập phân (khác mọi cột "2" chữ số lẻ).
  it('Giờ công không có phần thập phân (B15, N9)', async () => {
    moiApi()
    renderDashboard()
    const dong = (await screen.findByText('Đơn vị U05')).closest('tr')!
    const oCells = within(dong).getAllByRole('cell').map((c) => c.textContent)
    expect(oCells).toContain('105')
    expect(oCells).not.toContain('105,00')
  })
})

// ---- P2 (final-fix-FE.md, Ruling 424 · final-review-R2-report.md §A3) — BA CỬA của cùng một câu
// hỏi: "kỳ này có thật không?".
//
// Vì sao ba ca chứ không một: mỗi cửa mở bằng một cách KHÁC NHAU và bịt một cửa không bịt hai cửa
// kia. (1) bấm `›` ở kỳ cuối dải — `congThang` luôn cho một kỳ mới, không có biên; (2) gõ tay
// `?period=2026-10` — ĐÚNG định dạng, chỉ là không tồn tại, nên siết `pattern` phía backend không
// bắt được; (3) `?period=xyz` — sai cả định dạng, làm `formatPeriod` in "undefined/xyz" và
// `congThang` in "NaN/NaN".
//
// Cả ba đóng bằng MỘT nguồn: GET /templates/FM01/periods, đúng nguồn Status.tsx đã dùng (cùng
// queryKey nên hai trang dùng chung một lượt tải).
describe('/dashboard — kỳ ngoài dải (P2)', () => {
  // Cửa 1. Kịch bản demo nguyên văn: người trình bày đang ở kỳ CUỐI dải (2026-09) bấm `›` đúng một
  // lần. Trước bản vá, màn hình nhảy sang 2026-10 và hiện "0 đã duyệt / 22 chưa nộp" — không phân
  // biệt được với mất sạch dữ liệu.
  it('cửa 1 — ở kỳ CUỐI dải thì nút `›` bị khoá, bấm KHÔNG đẩy sang kỳ không có thật', async () => {
    const f = moiApi()
    renderDashboard('/dashboard?period=2026-09')
    await screen.findByText('PTSC Đình Vũ')

    const nutSau = screen.getByRole('button', { name: '10/2026 ›' })
    expect(nutSau.hasAttribute('disabled')).toBe(true)
    await userEvent.click(nutSau)

    // Khoá bằng CẢ HAI mặt: không request nào mang period=2026-10 bay lên, VÀ ô kỳ đang xem vẫn là
    // 09/2026. Chỉ khẳng định "không có request" thì một nút render ra rồi bị chặn ở tầng khác vẫn
    // qua; chỉ khẳng định "ô kỳ không đổi" thì một lượt tải ngầm sai kỳ vẫn lọt.
    expect(f.mock.calls.map(([u]) => String(u)).some((u) => u.includes('period=2026-10'))).toBe(false)
    expect(screen.getByText('09/2026')).toBeTruthy()
  })

  // Nửa ÂM của cùng vị ngữ (bài học K2 — lỗi trốn ở mặt âm): khoá biên mà khoá quá tay thì nút `›`
  // chết ở GIỮA dải, và đó là đường đi bình thường của buổi demo. Không có ca này thì
  // `disabled={true}` cứng cũng xanh.
  it('cửa 1 (mặt âm) — ở GIỮA dải thì CẢ HAI nút còn bấm được', async () => {
    moiApi()
    renderDashboard('/dashboard?period=2026-07')
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.getByRole('button', { name: '‹ 06/2026' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: '08/2026 ›' }).hasAttribute('disabled')).toBe(false)
  })

  it('cửa 1 — ở kỳ ĐẦU dải thì nút `‹` bị khoá', async () => {
    moiApi()
    renderDashboard('/dashboard?period=2026-06')
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.getByRole('button', { name: '‹ 05/2026' }).hasAttribute('disabled')).toBe(true)
  })

  // Cửa 2. URL gõ tay / bookmark cũ: đúng định dạng YYYY-MM, chỉ là kỳ không tồn tại.
  it('cửa 2 — `?period=2026-10` (đúng định dạng, không có thật): một câu tử tế + lối về, KHÔNG phải màn 0/22', async () => {
    moiApi()
    renderDashboard('/dashboard?period=2026-10')

    expect(await screen.findByText('Kỳ 10/2026 chưa có trong hệ thống')).toBeTruthy()
    // Đây là toàn bộ điểm của mục: màn "0 đã duyệt / 22 đơn vị chưa nộp" KHÔNG được hiện, vì nó
    // đọc y hệt "toàn bộ số liệu vừa biến mất".
    expect(screen.queryByText(/Chưa có báo cáo được duyệt/)).toBeNull()
    expect(screen.queryByText(/Toàn Tổng công ty/)).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('cửa 2 — lối về đưa đúng về kỳ MỚI NHẤT có thật, và trang hồi sinh', async () => {
    moiApi()
    renderDashboard('/dashboard?period=2026-10')
    await userEvent.click(await screen.findByRole('button', { name: 'Về kỳ 09/2026' }))
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.queryByText('Kỳ 10/2026 chưa có trong hệ thống')).toBeNull()
  })

  // Cửa 3. Chuỗi rác — trước bản vá cho "undefined/xyz" trên thanh coverage và "NaN/NaN" trên
  // PeriodNav. Khẳng định KHÔNG có hai chuỗi đó ở BẤT KỲ đâu trên trang, không chỉ ở một phần tử.
  it('cửa 3 — `?period=xyz`: không NaN/NaN, không undefined/xyz, chỉ một câu tử tế', async () => {
    moiApi()
    const { container } = renderDashboard('/dashboard?period=xyz')

    expect(await screen.findByText('Kỳ xyz chưa có trong hệ thống')).toBeTruthy()
    const text = container.textContent ?? ''
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('undefined')
    expect(screen.queryByRole('table')).toBeNull()
  })

  // Lưới an toàn của chính bản vá: /templates/FM01/periods là một lượt gọi mạng NỮA, và Render free
  // ngủ dậy trả 502. Nguồn chân lý hỏng KHÔNG được biến một kỳ THẬT thành "chưa có trong hệ thống"
  // — cùng luật "lỗi nền không được phá màn hình đang có dữ liệu" mà P1/B-01 đã đặt ra.
  it('dải kỳ tải HỎNG thì trang vẫn vẽ bình thường, không kết tội kỳ đang xem', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
      }
      if (url.includes('/dashboard/units')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_UNITS })
      }
      if (url.includes('/periods')) {
        return Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.queryByText(/chưa có trong hệ thống/)).toBeNull()
    // Và không khoá nhầm nút nào khi chưa biết dải — khoá "phòng xa" ở đây là chặn đường đi đúng.
    expect(screen.getByRole('button', { name: '09/2026 ›' }).hasAttribute('disabled')).toBe(false)
  })

  // Khe hở thời gian của CHÍNH bản vá: `/dashboard/*` luôn nhanh hơn (2 query) còn dải kỳ là lượt
  // gọi thứ ba. Nếu trang vẽ số ngay khi summary/units về mà chưa biết dải, thì kỳ 2026-10 vẫn
  // chiếu đúng màn "0 đã duyệt / 22 chưa nộp" — chỉ ngắn hơn, đúng cái màn mục P2 đi xoá. Đo bằng
  // cách treo RIÊNG lượt gọi dải kỳ.
  it('dải kỳ chưa về thì CHƯA vẽ số — không chớp màn 0/22 trong lúc chờ nguồn chân lý', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ...DEFAULT_SUMMARY, period_key: '2026-10', approved_count: 0, submitted_count: 0 }),
        })
      }
      if (url.includes('/dashboard/units')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_UNITS })
      }
      if (url.includes('/periods')) return new Promise<never>(() => {}) // treo mãi
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderDashboard('/dashboard?period=2026-10')

    expect(await screen.findByTestId('skeleton')).toBeTruthy()
    // Khẳng định ngay-lập-tức ở trên đúng cả khi SAI (đo trước khi summary/units kịp chạy hết chuỗi
    // await + cập nhật React). Đợi một nhịp macrotask THẬT rồi đo lại — khuôn ca B7/N35 ngay trên.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.getByTestId('skeleton')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(/Chưa có báo cáo được duyệt/)).toBeNull()
  })

  // Dùng CHUNG một queryKey với Status.tsx (`['templates','FM01','periods']`) là điều kiện để hai
  // trang không gọi hai lần — khoá luôn đường dẫn, vì một queryKey trùng mà URL lệch thì cache
  // dùng chung sẽ phát dữ liệu sai cho một trong hai trang.
  it('hỏi ĐÚNG /templates/FM01/periods — cùng nguồn Status.tsx dùng', async () => {
    const f = moiApi()
    renderDashboard()
    await screen.findByText('PTSC Đình Vũ')
    expect(f.mock.calls.map(([u]) => String(u)).some((u) => u.includes('/templates/FM01/periods'))).toBe(true)
  })
})

describe('KpiTile', () => {
  it('ô đổi số sau refetch thì nháy 600 ms; prefers-reduced-motion tắt bằng CSS (index.css), không JS', () => {
    const { container, rerender } = render(<KpiTile label="LTI trong kỳ" value={1} unit="vụ" />)
    rerender(<KpiTile label="LTI trong kỳ" value={2} unit="vụ" />)
    expect(screen.getByText('2')).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('flash')
  })

  // Không có ca này thì mutation "khởi tạo giá trị-trước bằng null/undefined thay vì value" (thay
  // vì useRef(value)) sống sót: mount lần đầu sẽ bị coi là "đổi số" và nháy ngay dù chưa refetch
  // lần nào — sai với "chuyển động DUY NHẤT khi số ĐỔI SAU REFETCH" (thiết kế dòng 623).
  it('mới mount (chưa refetch lần nào) thì KHÔNG nháy', () => {
    const { container } = render(<KpiTile label="LTI trong kỳ" value={1} unit="vụ" />)
    expect(container.firstElementChild?.className).not.toContain('flash')
  })

  it('flash tự tắt sau đúng 600ms (khớp @keyframes flash-bg trong index.css)', async () => {
    vi.useFakeTimers()
    try {
      const { container, rerender } = render(<KpiTile label="LTI trong kỳ" value={1} unit="vụ" />)
      rerender(<KpiTile label="LTI trong kỳ" value={2} unit="vụ" />)
      expect(container.firstElementChild?.className).toContain('flash')
      await vi.advanceTimersByTimeAsync(600)
      expect(container.firstElementChild?.className).not.toContain('flash')
    } finally {
      vi.useRealTimers()
    }
  })

  // B13 (N1): số QUAY VỀ giá trị CŨ (2→3→2) vẫn phải nháy lần thứ hai — nếu `gtTruoc.current`
  // không được cập nhật mỗi lần đổi, lần quay-về sẽ trùng giá trị-trước-khi-cập-nhật và bị coi là
  // "không đổi gì", im lặng bỏ qua. Phải để nháy lần 1 TẮT HẲN trước khi đổi lần 2, nếu không cả
  // mã đúng lẫn mã lỗi đều để lại flash=true (đúng vì retrigger thật, lỗi vì timeout cũ bị huỷ mà
  // flash chưa từng được đặt lại false) — không phân biệt được nếu thiếu bước tắt hẳn ở giữa.
  it('số quay về giá trị CŨ (2→3→2) vẫn phải nháy lần thứ hai (B13, N1)', async () => {
    vi.useFakeTimers()
    try {
      const { container, rerender } = render(<KpiTile label="LTI trong kỳ" value={2} unit="vụ" />)
      rerender(<KpiTile label="LTI trong kỳ" value={3} unit="vụ" />)
      expect(container.firstElementChild?.className).toContain('flash')
      await vi.advanceTimersByTimeAsync(600) // để nháy lần 1 tắt HẲN
      expect(container.firstElementChild?.className).not.toContain('flash')
      rerender(<KpiTile label="LTI trong kỳ" value={2} unit="vụ" />) // quay lại giá trị BAN ĐẦU
      expect(container.firstElementChild?.className).toContain('flash')
    } finally {
      vi.useRealTimers()
    }
  })

  // B13 (N22): hai lần làm mới liên tiếp — hẹn giờ CŨ (từ lần đổi thứ nhất) không được phép tắt
  // nhầm cái nháy của lần đổi thứ hai. Đổi lần 2 ở t=300 (giữa hẹn cũ, còn 300ms nữa mới tới hạn
  // t=600); nếu cleanup không huỷ hẹn cũ, nó vẫn nổ đúng lúc t=600 dù nháy lần 2 lẽ ra phải cháy
  // tới tận t=900.
  it('hai lần làm mới liên tiếp: hẹn giờ CŨ không được tắt sớm cái nháy thứ hai (B13, N22)', async () => {
    vi.useFakeTimers()
    try {
      const { container, rerender } = render(<KpiTile label="LTI trong kỳ" value={1} unit="vụ" />)
      rerender(<KpiTile label="LTI trong kỳ" value={2} unit="vụ" />) // nháy lần 1, hẹn tắt ở t=600
      await vi.advanceTimersByTimeAsync(300) // t=300 — giữa chừng
      rerender(<KpiTile label="LTI trong kỳ" value={3} unit="vụ" />) // nháy lần 2, hẹn tắt ở t=900
      await vi.advanceTimersByTimeAsync(300) // t=600 — hẹn CŨ (nếu còn sống) tắt nhầm ở đây
      expect(container.firstElementChild?.className).toContain('flash') // còn phải cháy tới t=900
    } finally {
      vi.useRealTimers()
    }
  })
})
