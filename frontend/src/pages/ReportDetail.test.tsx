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
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ReportDetail } from './ReportDetail'
import { useSession } from '../app/session'

const QUYEN_NGUOI_NOP = ['report.view_own_unit', 'report.edit', 'report.submit']
const QUYEN_NGUOI_DUYET = [...QUYEN_NGUOI_NOP, 'report.view_all', 'report.approve', 'report.return']

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
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
  ],
  text_fields: [],
  states: [{ code: 'draft', name_vi: 'Nháp', is_editable: true }],
  transitions: [],
}

/** Trả lời mọi URL bằng `ok`, trừ những path có trong `loi` (đưa về status + thân lỗi phẳng của
 * backend). Ghi lại danh sách URL đã gọi để khẳng định ĐÃ gọi đúng endpoint nào. */
function moiApi(loi: Record<string, number> = {}) {
  const daGoi: string[] = []
  const f = vi.fn(async (url: string) => {
    daGoi.push(url)
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

function ve(quyen: string[] = QUYEN_NGUOI_NOP) {
  useSession
    .getState()
    .login('tok-1', { id: 1, email: 'u@ptsc.local', full_name: 'Người dùng', position: null }, { id: 2, code: 'U01', name: 'PTSC Miền Trung' }, quyen)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/reports/12']}>
        <Routes>
          <Route path="/reports/:id" element={<ReportDetail />} />
        </Routes>
      </MemoryRouter>
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
})
