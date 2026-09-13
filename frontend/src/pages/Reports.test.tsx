// frontend/src/pages/Reports.test.tsx
//
// task-20-carry.md C7: fixture của brief có trường `is_open` — TRƯỜNG MA, `ReportListItem`
// (backend/app/schemas/report.py) không có nó. `moiApi` dưới đây dựng ĐÚNG hình dạng API thật:
// đủ cả tám khoá kể cả khi test không quan tâm (id, period_key, org_unit, state, source, is_late,
// due_at, updated_at, decision_note), không thêm/thiếu trường nào.
//
// C4: `className.toContain('bg-transparent')` là test mù (utility Tailwind cùng độ đặc hiệu, lớp
// đứng SAU trong CSS build ra mới thắng) — thay bằng `resolveCascadeWinner` đọc CSS build thật.
// PHẢI `npm run build` trước khi chạy file này.
//
// C1: GET /reports thiếu `template` là 422, không phải rỗng — mọi lần gọi trong `moiApi` phải
// nhận được đúng tham số này; có test riêng khoá lại (không chỉ tin ngầm qua các test khác).
//
// S1a (vòng sửa 1, task-20-fix-1.md): Reports.tsx giờ dùng <Link>/useNavigate() (react-router) —
// renderReports() bọc <MemoryRouter> với một route bắt hết ("*") render <DichDen/> hiện lại
// pathname hiện tại, để khẳng định điều hướng nội bộ (Tạo báo cáo/409) trên CÂY THẬT thay vì spy
// `location.assign` (Reports.tsx không còn gọi nó nữa cho điều hướng nội bộ).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { Reports } from './Reports'
import { Toast } from '../components/ui/Toast'
import { useSession } from '../app/session'
import { resolveCascadeWinner } from '../components/ui/cascade'
import { formatDue, formatDateTime } from '../lib/format'

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
})

// ---- Fixture: đúng hình dạng ReportListItem thật (carry C7) ----

interface FakeRow {
  id?: number | null
  period_key: string
  org_unit?: { code: string; name: string }
  state?: string | null
  source?: string | null
  is_late?: boolean | null
  due_at?: string
  updated_at?: string | null
  decision_note?: string | null
}

const DON_VI_MAC_DINH = { code: 'U01', name: 'Đơn vị thành viên 01 (tên tạm)' }

function dongDayDu(r: FakeRow) {
  return {
    id: r.id ?? null,
    period_key: r.period_key,
    org_unit: r.org_unit ?? DON_VI_MAC_DINH,
    state: r.state ?? null,
    source: r.source ?? null,
    is_late: r.is_late ?? null,
    due_at: r.due_at ?? '2026-10-05T16:59:59Z',
    updated_at: r.updated_at ?? null,
    decision_note: r.decision_note ?? null,
  }
}

interface KetQuaPost {
  status: number
  body: Record<string, unknown>
}

// Stub `fetch` THẬT (giống Login.test.tsx), không stub `api` module — chuỗi gọi phải đi qua đúng
// client.ts thật. Phân biệt GET (danh sách) / POST (tạo báo cáo) theo `init.method`, giống
// `fetchDangNhapThanhCong` của Login.test.tsx.
function moiApi(rows: FakeRow[], onPost?: (body: unknown) => KetQuaPost) {
  const daDay = rows.map(dongDayDu)
  const f = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.includes('/reports')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => daDay })
    }
    if (method === 'POST' && url.includes('/reports')) {
      const ket = onPost?.(JSON.parse(init?.body ?? '{}')) ?? { status: 201, body: { id: 999 } }
      return Promise.resolve({ ok: ket.status < 400, status: ket.status, json: async () => ket.body })
    }
    throw new Error(`URL không lường trước trong test: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}

// Đích điều hướng nội bộ ("Tạo báo cáo"/409) — /reports/:id chưa tồn tại (Task 22), route bắt hết
// này chỉ để test đọc lại ĐÚNG path mà Reports.tsx đã điều hướng tới, không suy đoán qua spy.
function DichDen() {
  const { pathname } = useLocation()
  return <div data-testid="dich-den">{pathname}</div>
}

function renderReports(kemToast = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<DichDen />} />
        </Routes>
      </MemoryRouter>
      {kemToast && <Toast />}
    </QueryClientProvider>,
  )
}

function thamSoUrl(url: string) {
  return new URL(url, 'http://x.invalid').searchParams
}

describe('/reports — người nộp', () => {
  it('thấy kỳ chưa tạo với nút Tạo báo cáo, KHÔNG tự tạo nháp', async () => {
    const f = moiApi([
      { period_key: '2026-09', state: null },
      { period_key: '2026-08', state: 'draft' },
    ])
    renderReports()
    expect(await screen.findByRole('button', { name: 'Tạo báo cáo' })).toBeTruthy()
    const coPost = f.mock.calls.some(([, init]) => init?.method === 'POST')
    expect(coPost).toBe(false)
  })

  it('kỳ đang mở xếp trên kỳ cũ (period_key giảm dần, không cần is_open — C7)', async () => {
    moiApi([
      { period_key: '2026-06', state: 'approved', due_at: '2026-07-05T16:59:59Z' },
      { period_key: '2026-09', state: null, due_at: '2026-10-05T16:59:59Z' },
    ])
    renderReports()
    const ky = (await screen.findAllByTestId('o-ky')).map((e) => e.textContent)
    expect(ky).toEqual(['09/2026', '06/2026'])
  })

  it('báo cáo Trả lại hiện 120 ký tự đầu của ghi chú dưới chip', async () => {
    moiApi([{ period_key: '2026-08', state: 'returned', decision_note: 'x'.repeat(300) }])
    renderReports()
    expect((await screen.findByTestId('ghi-chu-tra-lai')).textContent).toHaveLength(120 + 1)
  })

  it('ghi chú Trả lại ngắn hơn 120 ký tự thì hiện nguyên văn, không thêm dấu …', async () => {
    moiApi([{ period_key: '2026-08', state: 'returned', decision_note: 'Ngắn thôi' }])
    renderReports()
    expect((await screen.findByTestId('ghi-chu-tra-lai')).textContent).toBe('Ngắn thôi')
  })

  it('source = seed thì nền chip PHẢI thắng cascade về trong suốt (C4 — không suy đoán qua className)', async () => {
    moiApi([{ period_key: '2026-06', state: 'approved', source: 'seed' }])
    renderReports()
    const chip = await screen.findByText('Đã duyệt')
    expect(resolveCascadeWinner(chip.className, 'background-color')).toBe('bg-transparent')
  })

  it('source = live (sống) thì KHÔNG chịu cascade trong suốt — chỉ seed mới viền rỗng', async () => {
    moiApi([{ period_key: '2026-06', state: 'approved', source: 'live' }])
    renderReports()
    const chip = await screen.findByText('Đã duyệt')
    expect(resolveCascadeWinner(chip.className, 'background-color')).toBe('bg-successBg')
  })

  it('trống thì hiện Chưa có kỳ báo cáo nào đang mở', async () => {
    moiApi([])
    renderReports()
    expect(await screen.findByText('Chưa có kỳ báo cáo nào đang mở')).toBeTruthy()
  })

  it('GET /reports luôn kèm template=FM01 (carry C1 — thiếu là 422, không phải danh sách rỗng)', async () => {
    const f = moiApi([{ period_key: '2026-09', state: null }])
    renderReports()
    await screen.findByRole('button', { name: 'Tạo báo cáo' })
    expect(thamSoUrl(f.mock.calls[0][0] as string).get('template')).toBe('FM01')
  })

  it('trạng thái sửa được (draft/returned) dẫn nút Mở; đã khoá (approved) dẫn Xem; cùng trỏ /reports/:id', async () => {
    moiApi([
      { id: 10, period_key: '2026-07', state: 'draft' },
      { id: 11, period_key: '2026-06', state: 'approved' },
    ])
    renderReports()
    await screen.findAllByTestId('o-ky')
    expect(screen.getByRole('link', { name: 'Mở' }).getAttribute('href')).toBe('/reports/10')
    expect(screen.getByRole('link', { name: 'Xem' }).getAttribute('href')).toBe('/reports/11')
  })

  // R1 (vòng sửa 2, task-20-fix-2.md) — ca href ở trên chỉ soi THUỘC TÍNH href, mà một `<a href>`
  // thật (không phải `<Link>`) thoả CÙNG điều kiện đó (cùng role 'link', cùng href) nên đổi <Link>
  // thành <a href> ở OHanhDong vẫn xanh — S1a (thứ từng làm cả ứng dụng không dùng được) không có
  // gì giữ. Ca này BẤM vào "Mở" rồi khẳng định trang ĐÍCH đã render trong CÙNG một lượt điều hướng
  // SPA (route bắt-hết dich-den có sẵn) — <a href> trong jsdom không điều hướng route (không có
  // server thật đứng sau) nên ca này ĐỎ nếu <Link> bị đổi lại thành <a href>.
  it('R1: bấm Mở điều hướng SPA thật tới /reports/:id (chốt <Link>, không phải <a href>)', async () => {
    moiApi([{ id: 10, period_key: '2026-07', state: 'draft' }])
    renderReports()
    await userEvent.click(await screen.findByRole('link', { name: 'Mở' }))
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/reports/10')
  })

  // g (task-20-review.md S4) — "Trả lại" còn sửa được (is_editable=True, backend seed STATES):
  // phải là nút "Mở" (cyan), không phải "Xem" (ghost) — điểm khởi đầu của vòng sửa-nộp lại.
  it('trạng thái Trả lại (returned) vẫn còn sửa được: nút Mở, không phải Xem', async () => {
    moiApi([{ id: 15, period_key: '2026-08', state: 'returned' }])
    renderReports()
    expect(await screen.findByRole('link', { name: 'Mở' })).toBeTruthy()
  })

  // d (task-20-review.md S4) — is_late phải đổi NHÃN chip, không chỉ đổi màu ngầm.
  it('is_late true hiện chip Đã nộp (muộn), không phải Đã nộp thường', async () => {
    moiApi([{ period_key: '2026-08', state: 'submitted', is_late: true }])
    renderReports()
    expect(await screen.findByText('Đã nộp (muộn)')).toBeTruthy()
  })

  // e (task-20-review.md S4) — chip "Nháp" chưa từng được khẳng định trực tiếp.
  it('state draft hiện chip Nháp', async () => {
    moiApi([{ period_key: '2026-08', state: 'draft' }])
    renderReports()
    expect(await screen.findByText('Nháp')).toBeTruthy()
  })

  // a (task-20-review.md S4) — ràng buộc toàn cục "null hiện —, không bao giờ hiện 0".
  it('updated_at null hiện gạch ngang, KHÔNG hiện 0 (ràng buộc toàn cục)', async () => {
    moiApi([{ period_key: '2026-09', state: null, updated_at: null }])
    renderReports()
    const o = await screen.findByTestId('o-cap-nhat')
    expect(o.textContent).toBe('—')
  })

  // S3 (task-20-fix-1.md) — dòng ĐÃ KHOÁ (submitted/approved) hiện ngày tuyệt đối, không đếm
  // ngược: đếm ngược cho một báo cáo đã xong chỉ đưa tin sai ("quá hạn N ngày" cạnh "Đã duyệt").
  it('S3: dòng đã khoá (approved) hiện NGÀY TUYỆT ĐỐI ở Hạn nộp, không đếm ngược', async () => {
    const dueIso = '2026-07-05T16:59:59Z'
    moiApi([{ period_key: '2026-06', state: 'approved', due_at: dueIso }])
    renderReports()
    const o = await screen.findByTestId('o-han-nop')
    expect(o.textContent).toBe(formatDateTime(dueIso))
  })

  it('S3: dòng đã khoá (submitted) hiện NGÀY TUYỆT ĐỐI ở Hạn nộp, không đếm ngược', async () => {
    const dueIso = '2026-08-05T16:59:59Z'
    moiApi([{ period_key: '2026-07', state: 'submitted', due_at: dueIso }])
    renderReports()
    const o = await screen.findByTestId('o-han-nop')
    expect(o.textContent).toBe(formatDateTime(dueIso))
  })

  it('S3: dòng còn mở (draft) vẫn hiện đếm ngược formatDue như cũ', async () => {
    const dueIso = '2099-01-05T16:59:59Z'
    moiApi([{ period_key: '2026-09', state: 'draft', due_at: dueIso }])
    renderReports()
    const o = await screen.findByTestId('o-han-nop')
    const kyVong = formatDue(dueIso, new Date())
    expect(o.textContent).toBe(kyVong.text)
    expect(o.getAttribute('title')).toBe(kyVong.title)
  })

  it('Hạn nộp (kỳ chưa tạo) render qua formatDue thật: chữ tương đối + title là ngày tuyệt đối giờ VN', async () => {
    const dueIso = '2099-01-05T16:59:59Z'
    moiApi([{ period_key: '2026-09', state: null, due_at: dueIso }])
    renderReports()
    const o = await screen.findByTestId('o-han-nop')
    const kyVong = formatDue(dueIso, new Date())
    expect(o.textContent).toBe(kyVong.text)
    expect(o.getAttribute('title')).toBe(kyVong.title)
  })

  it('đang tải hiện Skeleton, chưa hiện bảng hay thông báo trống', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { container } = renderReports()
    expect(container.querySelectorAll('.bg-gradient-to-r').length).toBeGreaterThan(0)
    expect(screen.queryByText('Chưa có kỳ báo cáo nào đang mở')).toBeNull()
  })

  it('lỗi tải hiện InlineError kèm nút Thử lại; bấm Thử lại gọi lại API', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
    vi.stubGlobal('fetch', f)
    renderReports()
    expect(await screen.findByText('Không tải được danh sách báo cáo')).toBeTruthy()
    const soLanTruoc = f.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(soLanTruoc))
  })

  it('bấm Tạo báo cáo: POST đúng {template, period_key} rồi điều hướng tới báo cáo mới', async () => {
    const f = moiApi([{ period_key: '2026-09', state: null }], () => ({ status: 201, body: { id: 77 } }))
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/reports/77')
    const goiPost = f.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse((goiPost?.[1] as { body?: string } | undefined)?.body ?? '{}')).toEqual({
      template: 'FM01',
      period_key: '2026-09',
    })
  })

  // j (task-20-review.md S4) — invalidateReportQueries phải được gọi: sau khi tạo thành công,
  // danh sách phải được nạp lại (GET /reports gọi thêm lần nữa), không chỉ điều hướng đi.
  it('tạo báo cáo thành công thì danh sách được nạp lại (invalidateReportQueries)', async () => {
    const f = moiApi([{ period_key: '2026-09', state: null }], () => ({ status: 201, body: { id: 77 } }))
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    await waitFor(() => {
      const soLanGet = f.mock.calls.filter(([, init]) => init?.method === 'GET').length
      expect(soLanGet).toBeGreaterThanOrEqual(2)
    })
  })

  // S6/S8 (task-20-fix-1.md, task-20-review.md) — toast "Đã tạo báo cáo <kỳ>" theo bảng trạng
  // thái thiết kế; trước S1a không hiện được vì location.assign xoá cả trang ngay sau đó.
  it('S6: tạo báo cáo thành công hiện toast "Đã tạo báo cáo <kỳ>"', async () => {
    moiApi([{ period_key: '2026-09', state: null }], () => ({ status: 201, body: { id: 77 } }))
    renderReports(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    expect(await screen.findByText('Đã tạo báo cáo 09/2026')).toBeTruthy()
  })

  it('tạo báo cáo bị 409 kèm existing_id: điều hướng thẳng tới báo cáo đã có, không báo lỗi', async () => {
    moiApi([{ period_key: '2026-09', state: null }], () => ({
      status: 409,
      body: { detail: 'Báo cáo đã tồn tại cho đơn vị và kỳ này', existing_id: 55 },
    }))
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/reports/55')
  })

  it('tạo báo cáo lỗi khác 409: hiện lỗi qua Toast, KHÔNG điều hướng', async () => {
    moiApi([{ period_key: '2026-09', state: null }], () => ({
      status: 403,
      body: { detail: 'Bạn không có quyền tạo báo cáo' },
    }))
    renderReports(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    expect(await screen.findByText('Bạn không có quyền tạo báo cáo')).toBeTruthy()
    expect(screen.queryByTestId('dich-den')).toBeNull()
  })

  // h (task-20-review.md S4) — key React phải là composite (mã đơn vị-kỳ), không phải row.id: hai
  // kỳ mở CHƯA tạo báo cáo đều có id null, dùng id làm key sẽ trùng (React cảnh báo "same key").
  it('hai kỳ mở CHƯA tạo (id null) không trùng React key: cả hai dòng đều hiện, không cảnh báo key trùng', async () => {
    const canhBao = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      moiApi([
        { period_key: '2026-09', state: null },
        { period_key: '2026-08', state: null },
      ])
      renderReports()
      const ky = (await screen.findAllByTestId('o-ky')).map((e) => e.textContent)
      expect(ky).toEqual(['09/2026', '08/2026'])
      const coCanhBaoKeyTrung = canhBao.mock.calls.some(([msg]) =>
        typeof msg === 'string' && msg.includes('same key'),
      )
      expect(coCanhBaoKeyTrung).toBe(false)
    } finally {
      canhBao.mockRestore()
    }
  })
})

describe('/reports — admin (report.approve) và viewer (report.view_all)', () => {
  it('admin: tiêu đề "Chờ duyệt (n)", mặc định kèm state=submitted, có cột Đơn vị (6 cột)', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    const f = moiApi([
      { period_key: '2026-08', state: 'submitted', org_unit: { code: 'U02', name: 'Đơn vị thành viên 02 (tên tạm)' } },
    ])
    const { container } = renderReports()
    expect(await screen.findByText('Chờ duyệt (1)')).toBeTruthy()
    expect(screen.getByText('Đơn vị thành viên 02 (tên tạm)')).toBeTruthy()
    expect(thamSoUrl(f.mock.calls[0][0] as string).get('state')).toBe('submitted')
    // c (task-20-review.md S4) — bảng admin phải có đủ 6 cột header (kèm "Đơn vị").
    expect(container.querySelectorAll('thead th').length).toBe(6)
  })

  it('admin trống thì hiện Không có báo cáo chờ duyệt', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    moiApi([])
    renderReports()
    expect(await screen.findByText('Không có báo cáo chờ duyệt')).toBeTruthy()
  })

  it('bấm Tất cả bỏ lọc state=submitted, gọi lại API, và đổi tiêu đề (S2 — không còn chữ Chờ duyệt)', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    const f = moiApi([{ period_key: '2026-08', state: 'submitted' }])
    renderReports()
    await screen.findByText('Chờ duyệt (1)')
    await userEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(2))
    const urlSauCung = f.mock.calls[f.mock.calls.length - 1][0] as string
    expect(thamSoUrl(urlSauCung).has('state')).toBe(false)
    expect(await screen.findByText('Tất cả báo cáo (1)')).toBeTruthy()
    expect(screen.queryByText(/^Chờ duyệt/)).toBeNull()
  })

  // i (task-20-review.md S4) — đường quay lại của admin trong demo: bấm Tất cả rồi bấm lại Đã nộp
  // phải thật sự lọc lại state=submitted, không phải nút chết.
  it('bấm Tất cả rồi bấm lại Đã nộp: quay về lọc state=submitted', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    const f = moiApi([{ period_key: '2026-08', state: 'submitted' }])
    renderReports()
    await screen.findByText('Chờ duyệt (1)')
    await userEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(2))
    await userEvent.click(screen.getByRole('button', { name: 'Đã nộp' }))
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(3))
    const urlSauCung = f.mock.calls[f.mock.calls.length - 1][0] as string
    expect(thamSoUrl(urlSauCung).get('state')).toBe('submitted')
    expect(await screen.findByText('Chờ duyệt (1)')).toBeTruthy()
  })

  // f (task-20-review.md S4) — "số theo vi-VN" (ràng buộc toàn cục) áp dụng cho cả con số đếm ở
  // tiêu đề, không chỉ số liệu báo cáo. n ≤ 66 (seed thật) không lộ khác biệt — dựng đủ 1000 dòng
  // để dấu chấm ngăn nghìn ("1.000") phân biệt được với nối chuỗi thô ("1000").
  it('tiêu đề "Chờ duyệt (n)" định dạng n theo vi-VN (dấu chấm ngăn nghìn), không nối chuỗi thô', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    const nhieuDong: FakeRow[] = Array.from({ length: 1000 }, (_, i) => ({
      period_key: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      state: 'submitted',
    }))
    moiApi(nhieuDong)
    renderReports()
    expect(await screen.findByText('Chờ duyệt (1.000)')).toBeTruthy()
  })

  it('admin luôn thấy Mở, kể cả báo cáo đã duyệt — không áp luật is_editable của người nộp', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    moiApi([{ id: 20, period_key: '2026-06', state: 'approved' }])
    renderReports()
    const lienKet = await screen.findByRole('link')
    expect(lienKet.textContent).toBe('Mở')
  })

  // S5 (task-20-fix-1.md) — report.view_all KHÔNG có report.create: kỳ mở chưa tạo phải hiện gạch
  // ngang, KHÔNG hiện nút "Tạo báo cáo" (BE đổi hình dạng theo phạm vi, FE không được suy vai
  // ngược từ mã quyền). R4 (vòng sửa 2, task-20-fix-2.md) — ca này trước chỉ khẳng định VẮNG nút,
  // không khẳng định CÓ dấu "—"; thêm dòng cuối để chốt luôn nội dung nhánh isAdmin của OHanhDong.
  it('S5: report.view_all (viewer) với state null KHÔNG thấy nút Tạo báo cáo, ô Hành động hiện gạch ngang', async () => {
    useSession.setState({ permissions: new Set(['report.view_all']) })
    moiApi([{ period_key: '2026-09', state: null }])
    renderReports()
    await screen.findByTestId('o-ky')
    expect(screen.queryByRole('button', { name: 'Tạo báo cáo' })).toBeNull()
    expect(screen.getByTestId('o-hanh-dong-rong').textContent).toBe('—')
  })

  // Ruling 169/170 (progress.md): report.view_all (viewer) không có mockup riêng, và server trả
  // CÙNG hình dạng dữ liệu cho report.view_all lẫn report.approve (pham_vi_bao_cao — deps.py).
  // Quyết định của task này: gộp chung màn "hàng đợi" cho cả hai — xem task-20-report.md. S2
  // (task-20-fix-1.md): PHẦN CHỮ phải tách riêng — viewer không có report.approve nên KHÔNG được
  // thấy chữ "Chờ duyệt" (hứa một hành động họ không làm được), ở CẢ HAI chế độ lọc.
  it('viewer (report.view_all, KHÔNG có report.approve) thấy hàng đợi kèm cột Đơn vị, tiêu đề KHÔNG hứa "Chờ duyệt"', async () => {
    useSession.setState({ permissions: new Set(['report.view_all']) })
    moiApi([
      { period_key: '2026-08', state: 'submitted', org_unit: { code: 'U03', name: 'Đơn vị thành viên 03 (tên tạm)' } },
    ])
    renderReports()
    expect(await screen.findByText('Báo cáo đã nộp (1)')).toBeTruthy()
    expect(screen.queryByText(/^Chờ duyệt/)).toBeNull()
    expect(screen.getByText('Đơn vị thành viên 03 (tên tạm)')).toBeTruthy()
  })

  it('viewer bấm Tất cả: tiêu đề vẫn không có chữ Chờ duyệt (S2, cả hai chế độ)', async () => {
    useSession.setState({ permissions: new Set(['report.view_all']) })
    moiApi([{ period_key: '2026-08', state: 'submitted' }])
    renderReports()
    await screen.findByText('Báo cáo đã nộp (1)')
    await userEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
    expect(await screen.findByText('Tất cả báo cáo (1)')).toBeTruthy()
    expect(screen.queryByText(/^Chờ duyệt/)).toBeNull()
  })

  it('người chỉ có report.view_own_unit (reporter) KHÔNG thấy cột Đơn vị hay khung admin', async () => {
    useSession.setState({ permissions: new Set(['report.view_own_unit']) })
    moiApi([{ period_key: '2026-09', state: null }])
    const { container } = renderReports()
    await screen.findByRole('button', { name: 'Tạo báo cáo' })
    expect(screen.queryByText(/^Chờ duyệt/)).toBeNull()
    expect(screen.queryByText('Lọc:')).toBeNull()
    // b, c (task-20-review.md S4) — cột "Đơn vị" (header lẫn ô dữ liệu) không được hiện cho
    // reporter; trước đây không khẳng định nào thật sự chạm cột này (test mù).
    expect(screen.queryByText('Đơn vị')).toBeNull()
    expect(screen.queryByText(DON_VI_MAC_DINH.name)).toBeNull()
    expect(container.querySelectorAll('thead th').length).toBe(5)
  })
})
