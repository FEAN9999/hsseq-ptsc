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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Reports } from './Reports'
import { Toast } from '../components/ui/Toast'
import { useSession } from '../app/session'
import { resolveCascadeWinner } from '../components/ui/cascade'
import { formatDue } from '../lib/format'

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

function renderReports(kemToast = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Reports />
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

  it('Hạn nộp render qua formatDue thật: chữ tương đối + title là ngày tuyệt đối giờ VN', async () => {
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
    const nhay = vi.fn()
    vi.stubGlobal('location', { assign: nhay, pathname: '/reports', search: '' } as never)
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    await waitFor(() => expect(nhay).toHaveBeenCalledWith('/reports/77'))
    const goiPost = f.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse((goiPost?.[1] as { body?: string } | undefined)?.body ?? '{}')).toEqual({
      template: 'FM01',
      period_key: '2026-09',
    })
  })

  it('tạo báo cáo bị 409 kèm existing_id: điều hướng thẳng tới báo cáo đã có, không báo lỗi', async () => {
    moiApi([{ period_key: '2026-09', state: null }], () => ({
      status: 409,
      body: { detail: 'Báo cáo đã tồn tại cho đơn vị và kỳ này', existing_id: 55 },
    }))
    const nhay = vi.fn()
    vi.stubGlobal('location', { assign: nhay, pathname: '/reports', search: '' } as never)
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    await waitFor(() => expect(nhay).toHaveBeenCalledWith('/reports/55'))
  })

  it('tạo báo cáo lỗi khác 409: hiện lỗi qua Toast, KHÔNG điều hướng', async () => {
    moiApi([{ period_key: '2026-09', state: null }], () => ({
      status: 403,
      body: { detail: 'Bạn không có quyền tạo báo cáo' },
    }))
    const nhay = vi.fn()
    vi.stubGlobal('location', { assign: nhay, pathname: '/reports', search: '' } as never)
    renderReports(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo báo cáo' }))
    expect(await screen.findByText('Bạn không có quyền tạo báo cáo')).toBeTruthy()
    expect(nhay).not.toHaveBeenCalled()
  })
})

describe('/reports — admin (report.approve) và viewer (report.view_all)', () => {
  it('admin: tiêu đề "Chờ duyệt (n)", mặc định kèm state=submitted, có cột Đơn vị', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    const f = moiApi([
      { period_key: '2026-08', state: 'submitted', org_unit: { code: 'U02', name: 'Đơn vị thành viên 02 (tên tạm)' } },
    ])
    renderReports()
    expect(await screen.findByText('Chờ duyệt (1)')).toBeTruthy()
    expect(screen.getByText('Đơn vị thành viên 02 (tên tạm)')).toBeTruthy()
    expect(thamSoUrl(f.mock.calls[0][0] as string).get('state')).toBe('submitted')
  })

  it('admin trống thì hiện Không có báo cáo chờ duyệt', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    moiApi([])
    renderReports()
    expect(await screen.findByText('Không có báo cáo chờ duyệt')).toBeTruthy()
  })

  it('bấm Tất cả bỏ lọc state=submitted và gọi lại API', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    const f = moiApi([{ period_key: '2026-08', state: 'submitted' }])
    renderReports()
    await screen.findByText('Chờ duyệt (1)')
    await userEvent.click(screen.getByRole('button', { name: 'Tất cả' }))
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(2))
    const urlSauCung = f.mock.calls[f.mock.calls.length - 1][0] as string
    expect(thamSoUrl(urlSauCung).has('state')).toBe(false)
  })

  it('admin luôn thấy Mở, kể cả báo cáo đã duyệt — không áp luật is_editable của người nộp', async () => {
    useSession.setState({ permissions: new Set(['report.approve']) })
    moiApi([{ id: 20, period_key: '2026-06', state: 'approved' }])
    renderReports()
    const lienKet = await screen.findByRole('link')
    expect(lienKet.textContent).toBe('Mở')
  })

  // Ruling 169/170 (progress.md): report.view_all (viewer) không có mockup riêng, và server trả
  // CÙNG hình dạng dữ liệu cho report.view_all lẫn report.approve (pham_vi_bao_cao — deps.py).
  // Quyết định của task này: gộp chung màn "hàng đợi" cho cả hai — xem task-20-report.md.
  it('viewer (report.view_all, KHÔNG có report.approve) cũng thấy hàng đợi kèm cột Đơn vị', async () => {
    useSession.setState({ permissions: new Set(['report.view_all']) })
    moiApi([
      { period_key: '2026-08', state: 'submitted', org_unit: { code: 'U03', name: 'Đơn vị thành viên 03 (tên tạm)' } },
    ])
    renderReports()
    expect(await screen.findByText('Chờ duyệt (1)')).toBeTruthy()
    expect(screen.getByText('Đơn vị thành viên 03 (tên tạm)')).toBeTruthy()
  })

  it('người chỉ có report.view_own_unit (reporter) KHÔNG thấy cột Đơn vị hay khung admin', async () => {
    useSession.setState({ permissions: new Set(['report.view_own_unit']) })
    moiApi([{ period_key: '2026-09', state: null }])
    renderReports()
    await screen.findByRole('button', { name: 'Tạo báo cáo' })
    expect(screen.queryByText(/^Chờ duyệt/)).toBeNull()
    expect(screen.queryByText('Lọc:')).toBeNull()
  })
})
