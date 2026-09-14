// frontend/src/pages/Status.test.tsx
//
// task-26-brief.md Step 1 liệt 6 ca (trích) — file này viết lại đủ 6 ca đó, với HAI thay đổi
// NGUYÊN VĂN theo task-26-carry.md:
//   C2: hai khẳng định ở ca "chip viền rỗng/đặc" chỉ đọc chuỗi className (mù trước cascade) — thay
//       bằng resolveCascadeWinner(className, 'background-color') (components/ui/cascade.ts).
//   C8: StatusCellOut trước đây thiếu report_id nên "ô Chưa nộp không click được" (khẳng định
//       o.closest('a') === null) chỉ có nghĩa nếu ô ĐÃ NỘP là <a> thật — backend đã vá (carry C8),
//       StatusGrid.tsx dùng report_id (không phải state) làm nguồn chân lý "bấm được".
//
// Cộng thêm: các ca tự viết cho carry C6/C7 (periods suy từ GET /templates/FM01/periods, không
// khoá cứng from/to), C12 (đọc theo tiêu đề không theo chỉ số, FE không tự sort), C13 (hai nguồn
// dữ liệu — ca bất đối xứng cho từng nguồn; lỗi nền không phá màn đang có dữ liệu), và ba số đo
// pixel brief cho NGUYÊN VĂN (260px/104px/40px).
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { Status } from './Status'
import type { StatusUnit } from '../features/status/StatusGrid'
import { Toast } from '../components/ui/Toast'
import { resolveCascadeWinner } from '../components/ui/cascade'
import { queryClient as queryClientSanXuat } from '../app/queryClient'

beforeEach(() => {
  vi.unstubAllGlobals()
})

// ---- Fixture: 4 kỳ (06..09/2026, is_open ĐÚNG như seed thật — 08 VÀ 09 cùng true, "kỳ đang mở"
// phải là kỳ CUỐI trong số đó — carry C7), 4 đơn vị. U22 "PTSC Đình Vũ" + U23 "PTSC Quảng Ngãi"
// chưa nộp ở kỳ đang mở (2026-09) — đúng NGUYÊN VĂN hai tên brief đòi trong ca sao chép clipboard.
// U05 có is_late=true ở 2026-08 cho ca "Đã nộp (muộn)". ----

const PERIODS = [
  { period_key: '2026-06', is_open: false },
  { period_key: '2026-07', is_open: false },
  { period_key: '2026-08', is_open: true },
  { period_key: '2026-09', is_open: true },
]

function o(
  period_key: string,
  state: string | null,
  source: string | null,
  is_late: boolean | null,
  report_id: number | null,
) {
  return { period_key, state, source, is_late, report_id }
}

const DEFAULT_UNITS: StatusUnit[] = [
  {
    code: 'U01',
    name: 'PTSC Miền Trung',
    cells: [
      o('2026-06', 'approved', 'seed', false, 601),
      o('2026-07', 'approved', 'seed', false, 701),
      o('2026-08', 'approved', 'seed', false, 801),
      o('2026-09', 'approved', 'live', false, 901),
    ],
  },
  {
    code: 'U05',
    name: 'PTSC Thanh Hoá',
    cells: [
      o('2026-06', 'approved', 'seed', false, 602),
      o('2026-07', 'approved', 'seed', false, 702),
      o('2026-08', 'submitted', 'live', true, 802),
      o('2026-09', 'submitted', 'live', false, 902),
    ],
  },
  {
    code: 'U22',
    name: 'PTSC Đình Vũ',
    cells: [
      o('2026-06', 'approved', 'seed', false, 622),
      o('2026-07', 'approved', 'seed', false, 722),
      o('2026-08', 'approved', 'live', false, 822), // outline=false: nộp SỐNG (o-U22-2026-08)
      o('2026-09', null, null, null, null), // chưa nộp ở kỳ đang mở
    ],
  },
  {
    code: 'U23',
    name: 'PTSC Quảng Ngãi',
    cells: [
      o('2026-06', 'approved', 'seed', false, 623),
      o('2026-07', 'approved', 'seed', false, 723),
      o('2026-08', 'approved', 'seed', false, 823),
      o('2026-09', null, null, null, null), // chưa nộp ở kỳ đang mở
    ],
  },
]

const DEFAULT_STATUS = { periods: PERIODS.map((p) => p.period_key), units: DEFAULT_UNITS }

function moiApi(
  overrides: { periods?: typeof PERIODS; trangThai?: typeof DEFAULT_STATUS } = {},
) {
  const periods = overrides.periods ?? PERIODS
  const trangThai = overrides.trangThai ?? DEFAULT_STATUS
  const f = vi.fn((url: string) => {
    if (url.includes('/templates/FM01/periods')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => periods })
    }
    if (url.includes('/status?')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => trangThai })
    }
    throw new Error(`URL không lường trước trong test: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}

// Đích điều hướng nội bộ (khuôn "dich-den" — Dashboard.test.tsx/carry C12 task-25) — hiện lại
// path+search+hash trên CÂY THẬT thay vì spy.
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

// Toast là store TOÀN CỤC (Task 15) — mount cạnh <Status/> giống production (routes.tsx: <Toast/>
// đứng cạnh <RouterProvider>, không lồng trong trang) để ca "Đã sao chép n đơn vị" tìm được chữ
// trên màn hình qua chính useToast() thật, không phải một cơ chế toast riêng của trang.
function renderStatus(initialPath = '/status') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/status" element={<Status />} />
            <Route path="*" element={<DichDen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
      <Toast />
    </>,
  )
}

describe('/status', () => {
  it('nút sao chép đưa đúng danh sách tên đơn vị chưa nộp vào clipboard', async () => {
    moiApi()
    const viet = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: viet } })
    renderStatus()
    await userEvent.click(await screen.findByRole('button', { name: /Sao chép danh sách chưa nộp/ }))
    expect(viet).toHaveBeenCalledWith('PTSC Đình Vũ\nPTSC Quảng Ngãi')
    expect(await screen.findByText('Đã sao chép 2 đơn vị')).toBeTruthy()
  })

  // C2 (task-26-carry.md): thay hai khẳng định className-mù của brief bằng resolveCascadeWinner.
  it('chip viền rỗng = nạp từ file, chip đặc = nộp sống', async () => {
    moiApi()
    renderStatus()
    const o1 = await screen.findByTestId('o-U01-2026-06') // approved + seed -> outline
    expect(resolveCascadeWinner(o1.className, 'background-color')).toBe('bg-transparent')
    const o2 = screen.getByTestId('o-U22-2026-08') // approved + live -> KHÔNG outline
    expect(resolveCascadeWinner(o2.className, 'background-color')).not.toBe('bg-transparent')
  })

  it('is_late hiện Đã nộp (muộn)', async () => {
    moiApi()
    renderStatus()
    expect(await screen.findByText('Đã nộp (muộn)')).toBeTruthy()
  })

  // C8 (task-26-carry.md): report_id nay có ở backend — ô ĐÃ nộp là <a> thật (khoá ở ca điều
  // hướng bên dưới), nên "closest('a') === null" ở đây khẳng định thật, không mù.
  it('ô Chưa nộp không click được', async () => {
    moiApi()
    renderStatus()
    const o = await screen.findByTestId('o-U22-2026-09')
    expect(o.getAttribute('aria-disabled')).toBe('true')
    expect(o.closest('a')).toBeNull()
  })

  // Tự phát hiện qua mutation-test (khuôn M-51, Dashboard.test.tsx/task-25 — carry C1 cùng họ bug
  // với carry C8 ở đây): tự mutate `cell.report_id === null` (StatusGrid.tsx) thành
  // `cell.state === null` rồi chạy lại CẢ FILE này — 24/24 ca cũ vẫn xanh, vì mọi cell trong
  // DEFAULT_UNITS có report_id/state LUÔN cùng null hoặc cùng khác null (đúng thật với dữ liệu
  // backend hiện tại — hai cột cùng ra từ một hàng Report outer-join), nên không ca nào phân biệt
  // được nếu OTrangThai lỡ đổi sang đọc `state`. Dựng MỘT ô lệch cố ý (state khác null, report_id
  // null — không thể xảy ra thật từ backend hiện tại, nhưng đúng NGUỒN CHÂN LÝ carry C8 đòi) để
  // khoá quyết định đó — lỗ phủ test thuần tuý, mã sản phẩm (đã viết theo report_id) vốn đã đúng.
  it('carry C8: state khác null nhưng report_id null thì Ô VẪN không bấm được', async () => {
    const donViLa: StatusUnit[] = [
      {
        code: 'U99',
        name: 'Đơn vị lạ',
        cells: [o('2026-06', 'approved', 'seed', false, null)],
      },
    ]
    moiApi({
      periods: [{ period_key: '2026-06', is_open: true }],
      trangThai: { periods: ['2026-06'], units: donViLa },
    })
    renderStatus()
    const o1 = await screen.findByTestId('o-U99-2026-06')
    expect(o1.getAttribute('aria-disabled')).toBe('true')
    expect(o1.closest('a')).toBeNull()
  })

  it('KHÔNG có cột Nộp muộn và KHÔNG có nút xuất file', async () => {
    moiApi()
    renderStatus()
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.queryByText(/Nộp muộn/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Xuất|Excel|CSV/ })).toBeNull()
  })

  it('dòng cuối là Tổng theo kỳ', async () => {
    moiApi()
    renderStatus()
    const dong = await screen.findAllByRole('row')
    expect(dong[dong.length - 1].textContent).toContain('Tổng theo kỳ')
  })

  // Tự phát hiện qua mutation-test: tự mutate tongTheoKy (StatusGrid.tsx) bỏ hẳn
  // `.filter((n) => (dem.get(n.state) ?? 0) > 0)` — ca "dòng cuối là Tổng theo kỳ" trên chỉ kiểm
  // .textContent CÓ CHỨA "Tổng theo kỳ" (tên dòng), không kiểm NỘI DUNG con số từng ô, nên 25/25 ca
  // cũ vẫn xanh dù mọi ô kỳ sẽ hiện đủ "4 duyệt · 0 nộp · 0 nháp · 0 trả lại · 0 chưa" thay vì đúng
  // "4 duyệt" NGẮN GỌN (mockup: "22/22 duyệt" — không liệt nhóm rỗng). Đọc theo ÁNH XẠ tiêu đề kỳ
  // (carry C12 mục 2, không theo chỉ số cột cứng) — kỳ 2026-06 trong DEFAULT_UNITS mọi đơn vị đều
  // 'approved', nên kết quả ĐÚNG DUY NHẤT phải là chuỗi "4 duyệt", không có nhóm 0 nào kèm theo.
  it('dòng Tổng theo kỳ chỉ liệt nhóm khác 0 — kỳ toàn "đã duyệt" chỉ hiện "4 duyệt", không kèm "0 nộp"/"0 nháp"/…', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dongTong = screen.getByText('Tổng theo kỳ').closest('tr')!
    const oCells = within(dongTong).getAllByRole('cell').map((c) => c.textContent)
    expect(oCells[tieuDe.indexOf('06/2026')]).toBe('4 duyệt')
  })

  // Tự phát hiện qua mutation-test: tự mutate thứ tự khai NHOM_TONG (StatusGrid.tsx, đổi chỗ
  // 'submitted' lên trước 'approved') — ca trên (kỳ 06/2026, CHỈ một nhóm 'approved') không phân
  // biệt được thứ tự nối chuỗi khi chỉ có MỘT nhóm khác 0. Kỳ 2026-08 trong DEFAULT_UNITS có HAI
  // nhóm cùng khác 0 (U01/U22/U23 'approved', U05 'submitted') — đúng ca cần để khoá thứ tự nối
  // "duyệt" TRƯỚC "nộp" (khớp mockup: duyệt, nộp, nháp, trả lại, chưa).
  it('dòng Tổng theo kỳ nối ĐÚNG thứ tự "duyệt" trước "nộp" khi một kỳ có cả hai nhóm', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dongTong = screen.getByText('Tổng theo kỳ').closest('tr')!
    const oCells = within(dongTong).getAllByRole('cell').map((c) => c.textContent)
    // U01 duyệt(seed), U05 nộp(live,muộn), U22 duyệt(live), U23 duyệt(seed) -> 3 duyệt · 1 nộp
    expect(oCells[tieuDe.indexOf('08/2026')]).toBe('3 duyệt · 1 nộp')
  })

  // ---- Ngoài brief — carry C6/C7: from/to suy từ GET /templates/FM01/periods, không khoá cứng.

  it('dòng phạm vi hiện đúng kỳ đầu/kỳ đang mở theo dữ liệu (carry C7)', async () => {
    moiApi()
    renderStatus()
    expect(
      await screen.findByText('Từ 06/2026 (kỳ đầu có dữ liệu) đến 09/2026 (kỳ đang mở)'),
    ).toBeTruthy()
  })

  it('dòng phạm vi KHÔNG khoá cứng 06/2026-09/2026 — đổi dữ liệu thì đổi theo (carry C7)', async () => {
    const periodsKhac = [
      { period_key: '2026-01', is_open: false },
      { period_key: '2026-02', is_open: true },
    ]
    moiApi({ periods: periodsKhac, trangThai: { periods: periodsKhac.map((p) => p.period_key), units: [] } })
    renderStatus()
    expect(
      await screen.findByText('Từ 01/2026 (kỳ đầu có dữ liệu) đến 02/2026 (kỳ đang mở)'),
    ).toBeTruthy()
  })

  it('GET /status nhận from/to suy từ GET /templates/FM01/periods — "kỳ đang mở" là kỳ CUỐI có is_open=true, không phải kỳ ĐẦU (carry C7)', async () => {
    const f = moiApi() // PERIODS: 08 VÀ 09 cùng is_open=true — phải chọn 09, không phải 08
    renderStatus()
    await waitFor(() => {
      expect(
        f.mock.calls.some(([u]) => String(u).includes('/status?template=FM01&from=2026-06&to=2026-09')),
      ).toBe(true)
    })
  })

  it('gọi đúng GET /templates/FM01/periods (không khoá mã mẫu khác)', async () => {
    const f = moiApi()
    renderStatus()
    await waitFor(() => {
      expect(f.mock.calls.some(([u]) => String(u).includes('/templates/FM01/periods'))).toBe(true)
    })
  })

  // ---- carry C12 mục 3: FE không tự sắp lại — giữ ĐÚNG thứ tự backend trả về.

  it('bảng giữ ĐÚNG thứ tự backend trả về, FE không tự sort lại theo mã đơn vị (carry C12 mục 3)', async () => {
    const unitsLech: StatusUnit[] = [
      { code: 'U22', name: 'PTSC Đình Vũ', cells: DEFAULT_UNITS[2].cells },
      { code: 'U01', name: 'PTSC Miền Trung', cells: DEFAULT_UNITS[0].cells },
    ]
    moiApi({ trangThai: { periods: DEFAULT_STATUS.periods, units: unitsLech } })
    renderStatus()
    const dong = await screen.findAllByRole('row')
    // dong[0] = tiêu đề, dong[1] = U22 (mã LỚN hơn nhưng đứng TRƯỚC vì backend trả trước)
    expect(within(dong[1]).getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(within(dong[2]).getByText('PTSC Miền Trung')).toBeTruthy()
  })

  // ---- carry C12 mục 2: đọc theo ÁNH XẠ tiêu đề kỳ, không theo chỉ số cột cứng.

  it('đọc đúng theo tiêu đề kỳ (ánh xạ), không theo chỉ số cột cứng — chặn hoán vị cột kỳ (carry C12 mục 2)', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dong = screen.getByText('PTSC Thanh Hoá').closest('tr')!
    const oCells = within(dong).getAllByRole('cell').map((c) => c.textContent)
    const theo = (ky: string) => oCells[tieuDe.indexOf(ky)]
    // U05: 06,07 = Đã duyệt; 08 = Đã nộp (muộn); 09 = Đã nộp (không muộn)
    expect(theo('06/2026')).toBe('Đã duyệt')
    expect(theo('07/2026')).toBe('Đã duyệt')
    expect(theo('08/2026')).toBe('Đã nộp (muộn)')
    expect(theo('09/2026')).toBe('Đã nộp')
  })

  // ---- Ba số đo NGUYÊN VĂN của brief Step 2 (không phải đếm/mù — width/height không có utility
  // nào khác cùng thuộc tính cạnh tranh trên CHÍNH các phần tử này nên className.toContain hợp lệ,
  // khác tình huống C2 của Chip nơi outline+kind cộng dồn hai utility background-color).

  it('cột Đơn vị rộng đúng 260px và dính trái (sticky) — brief Step 2', async () => {
    moiApi()
    renderStatus()
    const th = await screen.findByRole('columnheader', { name: 'Đơn vị' })
    expect(th.className).toContain('w-[260px]')
    expect(th.className).toContain('sticky')
    expect(th.className).toContain('left-0')
  })

  it('mỗi cột kỳ rộng đúng 104px — brief Step 2', async () => {
    moiApi()
    renderStatus()
    const th = await screen.findByRole('columnheader', { name: '06/2026' })
    expect(th.className).toContain('w-[104px]')
  })

  it('dòng lưới cao đúng 40px (h-10) — brief Step 2', async () => {
    moiApi()
    renderStatus()
    const dong = (await screen.findByText('PTSC Miền Trung')).closest('tr')!
    expect(within(dong).getAllByRole('cell')[0].className).toContain('h-10')
  })

  // ---- Điều hướng: ô ĐÃ nộp phải là <a> thật, dẫn đúng /reports/:id (bù cho carry C8).

  it('bấm ô đã có báo cáo điều hướng SPA thật tới /reports/:id đúng report_id', async () => {
    moiApi()
    renderStatus()
    await userEvent.click(await screen.findByTestId('o-U01-2026-06'))
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/reports/601')
  })

  // ---- Nút sao chép ẩn khi không có gì để sao chép (quyết định riêng, không có test brief).

  it('không có đơn vị nào chưa nộp ở kỳ đang mở: KHÔNG hiện nút sao chép', async () => {
    const unitsDuNop: StatusUnit[] = DEFAULT_UNITS.map((u) => ({
      ...u,
      cells: u.cells.map((c) =>
        c.period_key === '2026-09' ? o('2026-09', 'approved', 'live', false, 9999) : c,
      ),
    }))
    moiApi({ trangThai: { periods: DEFAULT_STATUS.periods, units: unitsDuNop } })
    renderStatus()
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.queryByRole('button', { name: /Sao chép danh sách chưa nộp/ })).toBeNull()
  })

  // ---- Tải/lỗi: khuôn ReportDetail.tsx/Dashboard.tsx, carry C13.

  it('lần tải đầu tiên CÓ hiện skeleton trước khi dữ liệu về', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
    renderStatus()
    expect(await screen.findByTestId('skeleton')).toBeTruthy()
  })

  // C13 mục 1 — nguồn 1 (periods) hỏng: /status KHÔNG BAO GIỜ được gọi (enabled phụ thuộc periods).
  it('CHỈ /templates/FM01/periods hỏng: hiện InlineError, /status chưa từng được gọi (C13 mục 1)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
    expect(f.mock.calls.some(([u]) => String(u).includes('/status?'))).toBe(false)
  })

  // C13 mục 1 — nguồn 2 (status) hỏng, periods lành.
  it('CHỈ GET /status hỏng (periods lành): vẫn hiện InlineError (C13 mục 1)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      if (url.includes('/status?')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
  })

  it('lỗi tải hiện InlineError kèm nút Thử lại; bấm Thử lại gọi lại CẢ HAI endpoint', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
    const dem = (u: string) => f.mock.calls.filter(([url]) => String(url).includes(u)).length
    const truocKy = dem('/templates/FM01/periods')
    const truocTrangThai = dem('/status?')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => {
      expect(dem('/templates/FM01/periods')).toBeGreaterThan(truocKy)
      expect(dem('/status?')).toBeGreaterThan(truocTrangThai)
    })
  })

  // C13 mục 2 — lỗi NỀN không được phá màn đang có dữ liệu (lớp lỗi đã cắn dự án BA lần).
  it('đang xem lưới, rời tab rồi quay lại gặp 502: TRANG VẪN CÒN, không bị thay bằng InlineError (C13 mục 2)', async () => {
    let goiThu = 0
    const f = vi.fn((url: string) => {
      goiThu++
      const laLanDau = goiThu <= 2
      if (url.includes('/templates/FM01/periods')) {
        return laLanDau
          ? Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      if (url.includes('/status?')) {
        return laLanDau
          ? Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(goiThu).toBeGreaterThan(2))
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.queryByText('Không tải được dữ liệu')).toBeNull()
  })

  // ---- 403 (thiếu status.view — vd. reporter gõ thẳng URL /status).

  it('403 (thiếu status.view) hiện đúng câu "không có quyền" kèm lối thoát, không phải InlineError chung', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      return Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Không có quyền status.view' }),
      })
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Bạn không có quyền xem tình trạng nộp này')).toBeTruthy()
    expect(screen.queryByText('Không tải được dữ liệu')).toBeNull()
    expect(screen.getByRole('link', { name: 'Về báo cáo của đơn vị' }).getAttribute('href')).toBe('/reports')
  })

  // Mirror Dashboard.test.tsx M-01: QueryClient CẤU HÌNH NHƯ BẢN THẬT (chặn retry cho 4xx ở lớp
  // queryClient.ts) — 403 hiện NGAY, đúng 2 lần gọi (periods + status), không lượt thử lại nào.
  it('403 hiện NGAY với QueryClient cấu hình như bản thật, không đợi hết lượt thử lại 4xx', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      return Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Không có quyền status.view' }),
      })
    })
    vi.stubGlobal('fetch', f)
    const qc = new QueryClient({ defaultOptions: queryClientSanXuat.getDefaultOptions() })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/status']}>
          <Routes>
            <Route path="/status" element={<Status />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Bạn không có quyền xem tình trạng nộp này')).toBeTruthy()
    expect(f.mock.calls.length).toBe(2)
  })
})
