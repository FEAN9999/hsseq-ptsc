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
    expect(screen.getByRole('link', { name: 'Về báo cáo của đơn vị' })).toBeTruthy()
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
    expect(await screen.findByTestId('skeleton')).toBeTruthy()
  })

  // B7 (N35): điều kiện skeleton phải gồm CẢ `units.isLoading` — nếu chỉ có `summary.isLoading`,
  // bảng đơn vị tải chậm hơn sẽ lọt qua nhánh "có dữ liệu" và hiện bảng RỖNG (chỉ header) một nhịp.
  it('bảng đơn vị tải chậm hơn KPI vẫn hiện skeleton, không hiện bảng rỗng (B7, N35)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_SUMMARY })
      }
      if (url.includes('/dashboard/units')) return new Promise<never>(() => {}) // treo mãi
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
