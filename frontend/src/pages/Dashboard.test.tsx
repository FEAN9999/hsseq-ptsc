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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { Dashboard } from './Dashboard'
import { KpiTile } from '../features/dashboard/KpiTile'
import type { UnitRow } from '../features/dashboard/useUnits'

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

function moiApi(overrides: Partial<typeof DEFAULT_SUMMARY> = {}) {
  const summary = { ...DEFAULT_SUMMARY, ...overrides }
  const f = vi.fn((url: string) => {
    if (url.includes('/dashboard/summary')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => summary })
    }
    if (url.includes('/dashboard/units')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_UNITS })
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
  it('approved_count = 0: 6 ô hiện — và coverage nói Chưa có báo cáo được duyệt', async () => {
    moiApi({
      approved_count: 0,
      submitted_count: 2,
      reporting_units: 22,
      kpis: DEFAULT_SUMMARY.kpis.map((k) => ({ ...k, value: 0 })),
    })
    renderDashboard()
    expect(await screen.findAllByLabelText('chưa có dữ liệu')).toHaveLength(6)
    expect(screen.getByText(/Chưa có báo cáo được duyệt · Đã nộp 2\/22/)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
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
  it('congThang qua ranh giới năm: kỳ 01/2026 thì nút lùi hiện "‹ 12/2025"', async () => {
    moiApi()
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

  // Không có trong 7 ca trích của brief, nhưng cùng khuôn InlineError đã dùng ở Reports.tsx
  // (carry: dashboard.py docstring — period không khớp trả 0/rỗng KHÔNG 404, nên isError ở đây
  // chỉ còn xảy ra khi mạng/máy chủ lỗi thật) — thêm để nhánh isError không phải mã chết-không-test.
  it('lỗi tải hiện InlineError kèm nút Thử lại; bấm Thử lại gọi lại API', async () => {
    const f = vi.fn((_url: string) =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) }),
    )
    vi.stubGlobal('fetch', f)
    renderDashboard()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
    const soLanTruoc = f.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(soLanTruoc))
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
})
