// frontend/src/features/report/ReportForm.test.tsx
//
// task-22-carry.md C1: `vai` chỉ là tham số của HELPER dưới đây, KHÔNG phải prop của form. `ve()`
// dịch nó thành đúng bộ quyền seed rồi nạp vào `useSession` thật; `ReportForm` chỉ đọc
// `permissions`. Nếu form nhận một prop `vai` thì test sẽ xanh còn sản phẩm hỏng — không có gì
// trong app thật đặt được prop đó (lớp lỗi M9 của Task 18).
//
// Nhãn ô tra bằng regex NEO HAI ĐẦU (`^B-2\.1 .+, Tháng này$`), không phải `/B-2.1.*Tháng này/`
// như brief gõ: danh mục thật có B-2.1 LẪN B-2.10…B-2.18, nên regex không neo khớp 9 ô cùng lúc
// và `getByLabelText` ném lỗi "nhiều phần tử". Dấu `.` trong mã cũng phải thoát, nếu không
// "B-2.1" còn khớp cả "B-201" nếu mai này có mã như vậy.
//
// Một số ca dùng danh mục NHỎ tự dựng (`mauNho`) thay vì danh mục FM01 thật — hai lý do: danh mục
// thật KHÔNG có chỉ tiêu `snapshot` nào (task-16-carry.md C1) nên C9 không thể đo trên nó; và ca
// "không chặn nộp" chỉ có nghĩa khi điền ĐỦ ô bắt buộc rồi bấm Nộp thật, điều không làm được với
// 52 ô trong một ca test đọc được.
//
// PHẢI `npm run build` trước khi chạy file này: các khẳng định màu banner đọc CSS THẬT đã build
// (`resolveCascadeWinner`, task-20-carry.md C4) chứ không hỏi `className.includes`.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportForm, type ChiTietBaoCao, type GiaTriBaoCao, type MauBaoCao, type ChiTieuMau, type LoiXungDot } from './ReportForm'
import { useSession } from '../../app/session'
import { resolveCascadeWinner } from '../../components/ui/cascade'

const CATALOG = (await import('../../test/fixtures/fm01-catalog.json')).default

// `GET /templates/{code}` trả thêm `states` + `transitions` mà fixture hợp đồng BE↔FE không có
// (fixture chỉ chép phần danh mục chỉ tiêu). Hai mảng dưới đây chép NGUYÊN VĂN seed
// `backend/app/seed/__init__.py` STATES/TRANSITIONS — đổi seed mà quên đổi đây thì form thật đổi
// hành vi còn test vẫn xanh, nên chúng phải khớp từng chữ.
const TRANG_THAI = [
  { code: 'draft', name_vi: 'Nháp', is_editable: true },
  { code: 'submitted', name_vi: 'Đã nộp', is_editable: false },
  { code: 'returned', name_vi: 'Trả lại', is_editable: true },
  { code: 'approved', name_vi: 'Đã duyệt', is_editable: false },
]
const CHUYEN = [
  { action_code: 'submit', from_state: 'draft', to_state: 'submitted', name_vi: 'Nộp báo cáo', required_permission: 'report.submit', requires_note: false },
  { action_code: 'submit', from_state: 'returned', to_state: 'submitted', name_vi: 'Nộp lại', required_permission: 'report.submit', requires_note: false },
  { action_code: 'return', from_state: 'submitted', to_state: 'returned', name_vi: 'Trả lại', required_permission: 'report.return', requires_note: true },
  { action_code: 'approve', from_state: 'submitted', to_state: 'approved', name_vi: 'Duyệt', required_permission: 'report.approve', requires_note: false },
  { action_code: 'reopen', from_state: 'approved', to_state: 'returned', name_vi: 'Mở lại', required_permission: 'report.return', requires_note: true },
]

const MAU_FM01: MauBaoCao = {
  sections: CATALOG.sections,
  indicators: CATALOG.indicators as ChiTieuMau[],
  text_fields: CATALOG.text_fields,
  states: TRANG_THAI,
  transitions: CHUYEN,
}

// task-22-carry.md C1: bộ quyền seed THẬT (backend/app/seed/__init__.py PERMISSIONS / ROLE_PERMS).
const QUYEN_ADMIN = [
  'report.create', 'report.edit', 'report.submit', 'report.return', 'report.approve',
  'report.view_own_unit', 'report.view_all', 'dashboard.view', 'status.view',
  'template.manage', 'workflow.manage', 'org.manage', 'user.manage', 'audit.view',
]
const QUYEN_REPORTER = ['report.create', 'report.edit', 'report.submit', 'report.view_own_unit']
const QUYEN_VIEWER = ['report.view_all', 'dashboard.view', 'status.view']

const NGUOI_DUNG = { id: 1, email: 'u01@ptsc.local', full_name: 'Người nhập U01', position: 'Chuyên viên HSE' }
const DON_VI = { id: 2, code: 'U01', name: 'PTSC Miền Trung' }

function chiTieu(p: Partial<ChiTieuMau> & { code: string }): ChiTieuMau {
  return {
    section_code: 'B-1',
    name_vi: 'Chỉ tiêu thử',
    name_en: 'Test indicator',
    unit: 'Giờ',
    agg_type: 'sum',
    formula: null,
    decimals: 0,
    required: true,
    sort_order: 1,
    ...p,
  }
}

function mauNho(ds: ChiTieuMau[]): MauBaoCao {
  return {
    sections: [{ code: 'B-1', name_vi: 'TỔNG GIỜ CÔNG', name_en: 'Total Man Hours' }],
    indicators: ds,
    text_fields: [{ code: 'C1', label_vi: 'Hoạt động nổi bật trong tháng' }],
    states: TRANG_THAI,
    transitions: CHUYEN,
  }
}

function giaTri(p: Partial<GiaTriBaoCao> & { indicator_code: string }): GiaTriBaoCao {
  return {
    this_period: null,
    acc_prev_entered: null,
    acc_total_entered: null,
    acc_prev_computed: null,
    acc_total_computed: null,
    diff: null,
    counter_check: null,
    note: null,
    ...p,
  }
}

interface VeOpts {
  state?: string
  vai?: 'admin' | 'reporter' | 'viewer'
  source?: string
  version?: number
  decision_note?: string | null
  missing_periods?: string[]
  values?: (Partial<GiaTriBaoCao> & { indicator_code: string })[]
  texts?: Record<string, string | null>
  mau?: MauBaoCao
  onLuu?: () => void
  onChuyenTrangThai?: (c: (typeof CHUYEN)[number]) => void
}

function ve(opts: VeOpts = {}) {
  const mau = opts.mau ?? MAU_FM01
  const quyen =
    opts.vai === 'admin' ? QUYEN_ADMIN : opts.vai === 'viewer' ? QUYEN_VIEWER : QUYEN_REPORTER
  useSession.getState().login('tok-test', NGUOI_DUNG, DON_VI, quyen)

  const deGhiDe = new Map((opts.values ?? []).map((v) => [v.indicator_code, v]))
  const chiTiet: ChiTietBaoCao = {
    id: 12,
    version: opts.version ?? 8,
    state: opts.state ?? 'draft',
    source: opts.source ?? 'live',
    is_late: false,
    header: {
      org_unit: { code: DON_VI.code, name: DON_VI.name },
      template_code: 'FM01',
      period_key: '2026-08',
      due_at: '2026-10-05T16:59:59Z',
      report_no: 'DV-2026-08',
      location: 'Hải Phòng',
      report_date: '2026-09-30',
      reporter_name: 'Trần Văn B',
      reporter_position: 'Chuyên viên HSE',
      submitted_at: '2026-09-30T03:12:00Z',
      decided_at: '2026-09-04T08:20:00Z',
      decision_note: opts.decision_note ?? null,
    },
    missing_periods: opts.missing_periods ?? [],
    values: mau.indicators.map((ct) => giaTri({ indicator_code: ct.code, ...deGhiDe.get(ct.code) })),
    texts: opts.texts ?? Object.fromEntries(mau.text_fields.map((t) => [t.code, null])),
  }

  const props = { mau, chiTiet, onLuu: opts.onLuu, onChuyenTrangThai: opts.onChuyenTrangThai }
  const r = render(<ReportForm {...props} />)
  return {
    ...r,
    /** 409 tới từ Task 23 (`useSaveValues`) qua prop `xungDot` — đây là đúng đường đi thật. */
    batLoi409: (loi: LoiXungDot) => r.rerender(<ReportForm {...props} xungDot={loi} />),
  }
}

/** Ô của một dòng theo nhãn đầy đủ "<mã> <tên>, <cột>". Xem ghi chú đầu file về việc neo hai đầu. */
function o(ma: string, cot: string): HTMLElement {
  return screen.getByLabelText(new RegExp(`^${ma.replace(/\./g, '\\.')} .+, ${cot}$`))
}

function timO(ma: string, cot: string): HTMLElement | null {
  return screen.queryByLabelText(new RegExp(`^${ma.replace(/\./g, '\\.')} .+, ${cot}$`))
}

function chu(e: HTMLElement): string {
  return (e as HTMLInputElement).value
}

/** Ghi lại `defaultPrevented` của phím đầu tiên khớp `key` — cách duy nhất đo "Enter KHÔNG submit"
 * và "Ctrl+S không mở hộp thoại lưu trang" mà không phải dựng một `<form>` giả. */
function theoDoiChan(key: string) {
  const ket = { chan: false, thay: false }
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === key && !ket.thay) {
        ket.thay = true
        ket.chan = e.defaultPrevented
      }
    },
    { once: false },
  )
  return ket
}

beforeEach(() => {
  useSession.getState().logout()
})

// ============================================================ 5 chế độ (D14)

describe('chế độ form theo trạng thái × quyền', () => {
  it('chế độ 1 — nháp / người nộp: có ô nhập, nút Lưu và Nộp báo cáo', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Nộp báo cáo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeTruthy()
  })

  it('chế độ 2 — trả lại: banner đỏ nguyên văn ghi chú của admin, nút Nộp lại', () => {
    ve({ state: 'returned', vai: 'reporter', decision_note: 'Thiếu số B-8.1' })
    const b = screen.getByRole('alert')
    expect(b.textContent).toContain('Thiếu số B-8.1')
    expect(resolveCascadeWinner(b.closest('div')!.className, 'background-color')).toBe('bg-dangerBg')
    expect(screen.getByRole('button', { name: 'Nộp lại' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nộp báo cáo' })).toBeNull()
  })

  it('chế độ 3 — đã nộp / admin: không ô nhập, có Duyệt và Trả lại…', () => {
    ve({ state: 'submitted', vai: 'admin' })
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Trả lại…' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull()
  })

  it('chế độ 4 — đã duyệt + source seed: nhãn nạp từ file tổng hợp, chỉ còn Mở lại…', () => {
    ve({ state: 'approved', vai: 'admin', source: 'seed' })
    expect(screen.getByText('nạp từ file tổng hợp')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mở lại…' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull()
  })

  it('chế độ 5 — đã nộp / người nộp: không nút nào', () => {
    ve({ state: 'submitted', vai: 'reporter' })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('source live (không seed) thì KHÔNG có nhãn nạp từ file tổng hợp', () => {
    ve({ state: 'approved', vai: 'admin', source: 'live' })
    expect(screen.queryByText('nạp từ file tổng hợp')).toBeNull()
  })

  it('ô chỉ đọc là <td> chữ thường, KHÔNG phải input disabled — cả lúc form khoá lẫn lúc đang sửa', () => {
    const { container, unmount } = ve({ state: 'approved', vai: 'admin' })
    expect(container.querySelectorAll('input[disabled]')).toHaveLength(0)
    expect(container.querySelectorAll('input')).toHaveLength(0)
    expect(o('B-1.1', 'Tháng này').tagName).toBe('TD')
    unmount()

    // Lúc đang sửa, ô "Lũy kế tháng trước" vẫn phải là <td>, không phải input khoá.
    const nhap = ve({ state: 'draft', vai: 'reporter' })
    expect(nhap.container.querySelectorAll('input[disabled]')).toHaveLength(0)
    expect(o('B-1.1', 'Lũy kế tháng trước').tagName).toBe('TD')
    expect(o('B-1.1', 'Tháng này').tagName).toBe('INPUT')
  })

  // Đột biến M2: bỏ `quyen.has('report.edit')` khỏi `suaDuoc` vẫn XANH với admin/reporter — cả
  // hai vai đó đều CÓ quyền sửa. Người xem (viewer: report.view_all, KHÔNG có report.edit) là vai
  // duy nhất phân biệt được, và đúng là vai sẽ gõ đè lên bản nháp của đơn vị khác nếu mã sai.
  it('người xem (không có report.edit) mở BẢN NHÁP vẫn chỉ đọc, không ô nhập không nút Lưu', () => {
    const { container } = ve({ state: 'draft', vai: 'viewer' })
    expect(container.querySelectorAll('input')).toHaveLength(0)
    expect(container.querySelectorAll('textarea')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull()
    expect(o('B-1.1', 'Tháng này').tagName).toBe('TD')
  })

  it('cột Lệch chỉ hiện cho người có quyền duyệt', () => {
    const { unmount } = ve({ state: 'submitted', vai: 'admin', values: [{ indicator_code: 'B-1.1', diff: -5 }] })
    expect(screen.getByRole('columnheader', { name: 'Lệch' })).toBeTruthy()
    expect(o('B-1.1', 'Lệch').textContent).toBe('-5')
    unmount()

    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.queryByRole('columnheader', { name: 'Lệch' })).toBeNull()
    expect(timO('B-1.1', 'Lệch')).toBeNull()
  })
})

// ============================================================ ba chế độ ô (C9)

describe('ba chế độ ô của cellPolicy', () => {
  const MAU_BA_LOAI = mauNho([
    chiTieu({ code: 'B-1.1', name_vi: 'Cộng dồn được', agg_type: 'sum' }),
    chiTieu({ code: 'B-1.2', name_vi: 'Ảnh chụp', agg_type: 'snapshot' }),
    chiTieu({ code: 'B-1.3', name_vi: 'Tự tính', agg_type: 'computed', formula: 'B-1.1', required: false }),
  ])

  it('C9 — ô snapshot để TRẮNG hoàn toàn: không nhãn, không dấu —, khác hẳn ô derived', () => {
    const { container } = ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_LOAI })

    // snapshot: hai cột đầu KHÔNG tồn tại
    expect(timO('B-1.2', 'Lũy kế tháng trước')).toBeNull()
    expect(timO('B-1.2', 'Tháng này')).toBeNull()
    const oSnapshot = container.querySelectorAll('tr#B-1-2 td')
    expect(oSnapshot[2].textContent).toBe('')
    expect(oSnapshot[3].textContent).toBe('')
    // nhưng Cộng dồn của nó vẫn là ô NHẬP (cellPolicy: snapshot.accTotal = 'input')
    expect(o('B-1.2', 'Cộng dồn').tagName).toBe('INPUT')

    // đối chứng: cùng vị trí đó ở dòng derived thì CÓ nhãn và CÓ dấu —
    expect(o('B-1.3', 'Lũy kế tháng trước').textContent).toBe('—')
    expect(o('B-1.3', 'Tháng này').textContent).toBe('—')
  })

  it('dòng computed hiện icon khoá + title công thức, không có dòng chữ giải thích', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const khoa = screen.getByTitle('Tự tính = B-1.1 + B-1.2 + B-1.3')
    expect(khoa.textContent).toBe('🔒 tự tính')
    expect(o('B-1.4', 'Tháng này').tagName).toBe('TD')
  })
})

// ============================================================ tính toán tại chỗ

describe('Cộng dồn tính ngay trên client', () => {
  it('Cộng dồn đổi theo từng phím, acc_prev null thì tính như 0', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      values: [{ indicator_code: 'B-1.1', acc_prev_computed: null, this_period: null }],
    })
    await userEvent.type(o('B-1.1', 'Tháng này'), '25')
    expect(o('B-1.1', 'Cộng dồn').textContent).toBe('25')
  })

  it('Cộng dồn CỘNG cả lũy kế tháng trước, không chỉ chép lại số vừa gõ', async () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', acc_prev_computed: 11 }] })
    await userEvent.type(o('B-2.1', 'Tháng này'), '3')
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('14')
  })

  it('cả hai cột đều trống thì Cộng dồn hiện — chứ không phải 0', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('—')
  })

  it('C13 — ô nhập và ô chỉ đọc cùng một dòng hiện cùng dạng số, không đệm ",00"', () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      // B-1.1 khai decimals = 2; `formatNumber` cũ sẽ ra "402.100,00" ở ô nhập.
      values: [{ indicator_code: 'B-1.1', acc_prev_computed: 402100, this_period: 61300 }],
    })
    expect(o('B-1.1', 'Lũy kế tháng trước').textContent).toBe('402.100')
    expect(chu(o('B-1.1', 'Tháng này'))).toBe('61.300')
    expect(o('B-1.1', 'Cộng dồn').textContent).toBe('463.400')
  })

  it('số lẻ vẫn hiện đủ tới decimals đã khai', () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-1.1', acc_prev_computed: 12.5 }] })
    expect(o('B-1.1', 'Lũy kế tháng trước').textContent).toBe('12,5')
  })
})

// ============================================================ nộp + ô bắt buộc

describe('nộp và ô bắt buộc', () => {
  it('ô bắt buộc CHỈ đỏ sau lần bấm Nộp đầu tiên', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    const oB = o('B-2.1', 'Tháng này')
    expect(oB.getAttribute('aria-invalid')).not.toBe('true')
    expect(screen.queryByText(/Thiếu \d+ ô bắt buộc/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(oB.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Thiếu \d+ ô bắt buộc/)).toBeTruthy()
  })

  it('thiếu ô bắt buộc thì KHÔNG gọi chuyển trạng thái (chặn trước vòng mạng)', async () => {
    const onChuyenTrangThai = vi.fn()
    ve({ state: 'draft', vai: 'reporter', onChuyenTrangThai })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(onChuyenTrangThai).not.toHaveBeenCalled()
  })

  it('đủ ô bắt buộc thì Nộp gọi đúng chuyển trạng thái submit của trạng thái hiện tại', async () => {
    const onChuyenTrangThai = vi.fn()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      values: [{ indicator_code: 'B-1.1', this_period: 5 }],
      onChuyenTrangThai,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(onChuyenTrangThai).toHaveBeenCalledWith(
      expect.objectContaining({ action_code: 'submit', from_state: 'draft' }),
    )
  })

  it('ô bắt buộc của counter là Cộng dồn, không phải Tháng này (theo cellPolicy)', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(o('B-1.5', 'Cộng dồn').getAttribute('aria-invalid')).toBe('true')
    expect(o('B-1.5', 'Tháng này').getAttribute('aria-invalid')).not.toBe('true')
  })

  it('dòng computed không bao giờ bị tính là thiếu ô bắt buộc', async () => {
    const onChuyenTrangThai = vi.fn()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.4', agg_type: 'computed', formula: 'B-1.1', required: true })]),
      onChuyenTrangThai,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.queryByText(/Thiếu \d+ ô bắt buộc/)).toBeNull()
    expect(onChuyenTrangThai).toHaveBeenCalled()
  })

  it('thanh dưới đếm đúng số ô thiếu và mỗi mã là link tới neo của dòng đó', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-8.1' }), chiTieu({ code: 'B-8.2' }), chiTieu({ code: 'B-8.3' })]),
      values: [{ indicator_code: 'B-8.2', this_period: 7 }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.getByText(/Thiếu 2 ô bắt buộc/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'B-8.1' }).getAttribute('href')).toBe('#B-8-1')
    expect(screen.queryByRole('link', { name: 'B-8.2' })).toBeNull()
    // Neo phải tồn tại thật trong bảng, nếu không link là một lời hứa suông.
    expect(document.getElementById('B-8-1')).toBeTruthy()
  })

  it('điền nốt ô thiếu thì thanh dưới tự hết, không phải bấm Nộp lại mới cập nhật', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-8.1' })]),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.getByText(/Thiếu 1 ô bắt buộc/)).toBeTruthy()
    await userEvent.type(o('B-8.1', 'Tháng này'), '5')
    expect(screen.queryByText(/ô bắt buộc/)).toBeNull()
    expect(o('B-8.1', 'Tháng này').getAttribute('aria-invalid')).not.toBe('true')
  })
})

// ============================================================ 3 banner

describe('banner', () => {
  it('banner 409 giữ nguyên số đang gõ, chỉ vá cột chỉ đọc và version', async () => {
    const t = ve({
      state: 'draft',
      vai: 'reporter',
      version: 8,
      values: [{ indicator_code: 'B-1.1', acc_prev_computed: 402100 }],
    })
    await userEvent.type(o('B-2.1', 'Tháng này'), '7')

    t.batLoi409({
      detail: 'Người khác vừa sửa báo cáo này',
      version: 9,
      values: [giaTri({ indicator_code: 'B-1.1', acc_prev_computed: 999 })],
    })

    expect(await screen.findByText(/Người khác vừa sửa báo cáo này/)).toBeTruthy()
    expect(chu(o('B-2.1', 'Tháng này'))).toBe('7')
    // Đọc qua ô Cộng dồn — ô này tính TỪ STATE, nên nó là bằng chứng số 7 còn nằm trong state
    // chứ không phải chỉ còn dính trên màn hình: `NumberCell` tự giữ chữ của ô ĐANG FOCUS, nên
    // riêng khẳng định `chu(...)` ở trên vẫn xanh cả khi reducer đã xoá sạch giá trị (đột biến M12).
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('7')
    expect(o('B-1.1', 'Lũy kế tháng trước').textContent).toBe('999')
  })

  it('409 lần hai đếm từ version MỚI — chứng minh version đã được vá vào state', async () => {
    const t = ve({ state: 'draft', vai: 'reporter', version: 8 })
    t.batLoi409({ detail: 'Người khác vừa sửa báo cáo này', version: 9, values: [] })
    expect(await screen.findByText(/phiên bản 8 → 9/)).toBeTruthy()
    t.batLoi409({ detail: 'Người khác vừa sửa báo cáo này', version: 12, values: [] })
    expect(await screen.findByText(/phiên bản 9 → 12/)).toBeTruthy()
  })

  it('409 hiện NGUYÊN VĂN detail của server, không viết lại câu', async () => {
    const t = ve({ state: 'draft', vai: 'reporter' })
    t.batLoi409({ detail: 'Một câu hoàn toàn khác từ server', version: 9, values: [] })
    expect(await screen.findByText(/Một câu hoàn toàn khác từ server/)).toBeTruthy()
  })

  it('chưa có 409 thì không có banner vàng nào', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.queryByText(/phiên bản/)).toBeNull()
  })

  it('banner kỳ thiếu là xám và KHÔNG chặn nộp', async () => {
    const onChuyenTrangThai = vi.fn()
    ve({
      state: 'draft',
      vai: 'reporter',
      missing_periods: ['2026-07'],
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      values: [{ indicator_code: 'B-1.1', this_period: 5 }],
      onChuyenTrangThai,
    })
    const b = screen.getByText(/Lũy kế chưa tính kỳ 07\/2026/)
    expect(resolveCascadeWinner(b.closest('div')!.className, 'background-color')).toBe('bg-mutedbg')

    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(onChuyenTrangThai).toHaveBeenCalled()
  })

  it('không thiếu kỳ nào thì không có banner kỳ thiếu', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: [] })
    expect(screen.queryByText(/Lũy kế chưa tính kỳ/)).toBeNull()
  })
})

// ============================================================ counter lệch (D25)

describe('bộ đếm lệch công thức', () => {
  const LECH = {
    status: 'lech',
    expected: 1420,
    message: 'Lệch công thức (kỳ trước 1.240 + tháng này 180 = 1.420). Có reset (LTI / đầu năm)? Nên ghi lý do vào Ghi chú',
  }

  it('counter lệch: cảnh báo ngay ô + câu gợi ý, KHÔNG chặn nộp', async () => {
    const onChuyenTrangThai = vi.fn()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
      values: [{ indicator_code: 'B-1.5', this_period: 180, acc_total_entered: 180, counter_check: LECH }],
      onChuyenTrangThai,
    })
    expect(screen.getByText(/Lệch công thức/)).toBeTruthy()
    expect(screen.getByText(/1 bộ đếm lệch công thức chưa có ghi chú/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(onChuyenTrangThai).toHaveBeenCalled()
  })

  // status 'bo_qua' CÓ message không rỗng (report_rules.py: "Kỳ trước chưa duyệt, không kiểm tra
  // liên tục") — đó là một lời giải thích, không phải một cảnh báo, và nó không được hiện lên dòng
  // như thể có gì sai. Dùng đúng câu của backend: nếu ca này dùng message rỗng thì mã "hiện message
  // cho MỌI status" vẫn xanh (đột biến M15).
  it('bộ đếm status khác lech thì im lặng, dù message của nó không rỗng', () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
      values: [
        {
          indicator_code: 'B-1.5',
          counter_check: { status: 'bo_qua', expected: null, message: 'Kỳ trước chưa duyệt, không kiểm tra liên tục' },
        },
      ],
    })
    expect(screen.queryByText(/Kỳ trước chưa duyệt/)).toBeNull()
    expect(screen.queryByText(/bộ đếm lệch công thức/)).toBeNull()
  })

  it('gõ ghi chú cho dòng lệch thì thanh dưới thôi đếm dòng đó', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
      values: [{ indicator_code: 'B-1.5', counter_check: LECH }],
    })
    expect(screen.getByText(/1 bộ đếm lệch công thức chưa có ghi chú/)).toBeTruthy()
    await userEvent.type(o('B-1.5', 'Ghi chú'), 'Đã reset do LTI 12/08')
    expect(screen.queryByText(/bộ đếm lệch công thức/)).toBeNull()
  })
})

// ============================================================ bàn phím

describe('bàn phím kiểu Excel', () => {
  it('Enter xuống ô nhập kế tiếp CÙNG CỘT và chặn hành vi mặc định (không submit)', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    const theoDoi = theoDoiChan('Enter')
    o('B-1.1', 'Tháng này').focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(o('B-1.2', 'Tháng này'))
    expect(theoDoi.chan).toBe(true)
  })

  it('Enter bỏ qua dòng tự tính (B-1.4 không có ô nhập ở cột Tháng này)', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    o('B-1.3', 'Tháng này').focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(o('B-1.5', 'Tháng này'))
  })

  it('Shift+Enter lên ô phía trên cùng cột', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    o('B-1.2', 'Tháng này').focus()
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(document.activeElement).toBe(o('B-1.1', 'Tháng này'))
  })

  it('↓ và ↑ đi như Enter và Shift+Enter', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    o('B-1.1', 'Tháng này').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(o('B-1.2', 'Tháng này'))
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(o('B-1.1', 'Tháng này'))
  })

  it('Enter ở ô đầu/cuối cột thì đứng yên, không cuộn vòng sang đầu kia', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]) })
    const cuoi = o('B-1.2', 'Tháng này')
    cuoi.focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(cuoi)
  })

  it('Enter đi trong CỘT ĐANG ĐỨNG, không nhảy sang cột khác', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([
        chiTieu({ code: 'B-1.5', agg_type: 'counter' }),
        chiTieu({ code: 'B-1.6', agg_type: 'counter' }),
      ]),
    })
    o('B-1.5', 'Cộng dồn').focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(o('B-1.6', 'Cộng dồn'))
  })

  it('Tab bỏ qua ô chỉ đọc — ô kế tiếp là ô Ghi chú cùng dòng, không phải Lũy kế tháng trước', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    o('B-1.1', 'Tháng này').focus()
    await userEvent.tab()
    const dich = document.activeElement as HTMLElement
    expect(dich.getAttribute('aria-label')).not.toContain('Lũy kế tháng trước')
    expect(dich).toBe(o('B-1.1', 'Ghi chú'))
  })

  it('Esc khôi phục giá trị trước khi sửa, giữ nguyên focus', async () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 11 }] })
    const oB = o('B-2.1', 'Tháng này')
    await userEvent.click(oB)
    await userEvent.type(oB, '9')
    expect(chu(oB)).toBe('119')
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('119')

    await userEvent.keyboard('{Escape}')
    expect(chu(oB)).toBe('11')
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('11')
    expect(document.activeElement).toBe(oB)
  })

  it('Esc ở ô đang trống thì trả về trống, không đẻ ra lỗi "Chỉ nhập số"', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    const oB = o('B-2.1', 'Tháng này')
    await userEvent.click(oB)
    await userEvent.type(oB, '5')
    await userEvent.keyboard('{Escape}')
    expect(chu(oB)).toBe('')
    expect(oB.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('Ctrl+S gọi Lưu và chặn hộp thoại lưu trang của trình duyệt', async () => {
    const onLuu = vi.fn()
    ve({ state: 'draft', vai: 'reporter', onLuu })
    const theoDoi = theoDoiChan('s')
    o('B-1.1', 'Tháng này').focus()
    await userEvent.keyboard('{Control>}s{/Control}')
    expect(onLuu).toHaveBeenCalledTimes(1)
    expect(theoDoi.chan).toBe(true)
  })

  it('nút Lưu gọi đúng cùng một hành động với Ctrl+S', async () => {
    const onLuu = vi.fn()
    ve({ state: 'draft', vai: 'reporter', onLuu })
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(onLuu).toHaveBeenCalledTimes(1)
  })

  it('Enter trong textarea nhóm C giữ mặc định (xuống dòng), không nhảy ô', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    const ta = screen.getByLabelText('C1. Hoạt động nổi bật trong tháng')
    await userEvent.click(ta)
    const theoDoi = theoDoiChan('Enter')
    await userEvent.keyboard('a{Enter}b')
    expect(theoDoi.chan).toBe(false)
    expect(chu(ta)).toBe('a\nb')
    expect(document.activeElement).toBe(ta)
  })
})

// ============================================================ nhãn / a11y

describe('nhãn ô', () => {
  it('mỗi ô SỐ có aria-label dạng "B-2.1 Chết người, Tháng này"', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const oSo = screen.getAllByRole('textbox').filter((e) => e.getAttribute('inputmode') === 'decimal')
    expect(oSo.length).toBeGreaterThan(0)
    for (const e of oSo) {
      expect(e.getAttribute('aria-label')).toMatch(/^[AB]-[\d.]+ .+, (Tháng này|Cộng dồn)$/)
    }
  })

  it('ô Ghi chú có nhãn riêng mang tên dòng, không để trống', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(o('B-2.1', 'Ghi chú').getAttribute('aria-label')).toBe('B-2.1 Chết người, Ghi chú')
  })

  it('ô chỉ đọc mang cùng dạng nhãn với ô nhập cùng cột', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(o('B-1.1', 'Lũy kế tháng trước').getAttribute('aria-label')).toBe('B-1.1 TCT PTSC, Lũy kế tháng trước')
  })
})

// ============================================================ dán cột (C10)

describe('dán một cột từ Excel', () => {
  it('C10 — mỗi dòng phân tích bằng decimals CỦA DÒNG ĐÍCH, không phải của ô khởi điểm', async () => {
    // B-1.7 có sẵn số cũ: chỉ "vẫn trống" thì không phân biệt được "bỏ qua dòng lỗi" với "ghi
    // null đè lên" (đột biến M29) — cả hai đều cho ô trống.
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-1.7', this_period: 9 }] })
    const bd = o('B-1.1', 'Tháng này')
    await userEvent.click(bd)
    // B-1.1…B-1.6 khai decimals = 2; B-1.7 khai decimals = 0 (Ngày, không có phần lẻ).
    await userEvent.paste('1,5\n2,5\n3,5\n4,5\n5,5\n6,5')

    expect(chu(o('B-1.1', 'Tháng này'))).toBe('1,5')
    // B-1.4 là dòng tự tính — không có ô nhập nên chuỗi dán phải NHẢY QUA nó.
    expect(chu(o('B-1.5', 'Tháng này'))).toBe('4,5')
    expect(chu(o('B-1.6', 'Tháng này'))).toBe('5,5')
    // Dòng đích decimals = 0 từ chối "6,5" → GIỮ NGUYÊN số cũ, không làm tròn thành 7, cũng
    // không xoá trắng.
    expect(chu(o('B-1.7', 'Tháng này'))).toBe('9')
  })

  it('dòng trắng giữa vùng dán nghĩa là "để trống", không phải "bỏ qua"', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' }), chiTieu({ code: 'B-1.3' })]),
      values: [{ indicator_code: 'B-1.2', this_period: 42 }],
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n\n30')
    expect(chu(o('B-1.1', 'Tháng này'))).toBe('10')
    expect(chu(o('B-1.2', 'Tháng này'))).toBe('—')
    expect(chu(o('B-1.3', 'Tháng này'))).toBe('30')
  })

  it('dán dài hơn số dòng còn lại thì bỏ phần thừa, không nổ', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n20\n30\n40')
    expect(chu(o('B-1.1', 'Tháng này'))).toBe('10')
    expect(chu(o('B-1.2', 'Tháng này'))).toBe('20')
  })
})

// ============================================================ nhóm C, mục lục, dải đầu

describe('nhóm C, mục lục và dải đầu', () => {
  it('nhóm C là textarea đơn cột dưới bảng, có đếm ký tự và trần 2000', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    const ta = screen.getByLabelText('C1. Hoạt động nổi bật trong tháng') as HTMLTextAreaElement
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta.getAttribute('maxlength')).toBe('2000')
    await userEvent.type(ta, 'abcd')
    expect(screen.getByText('4/2000')).toBeTruthy()
  })

  it('nhóm C nạp sẵn nội dung đã lưu và chuyển thành chữ thường khi form khoá', () => {
    const { unmount } = ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      texts: { C1: 'Đã có nội dung' },
    })
    expect(chu(screen.getByLabelText('C1. Hoạt động nổi bật trong tháng'))).toBe('Đã có nội dung')
    unmount()

    ve({
      state: 'submitted',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      texts: { C1: 'Đã có nội dung' },
    })
    expect(screen.queryByLabelText('C1. Hoạt động nổi bật trong tháng')).toBeNull()
    expect(screen.getByText('Đã có nội dung')).toBeTruthy()
  })

  it('mục lục trỏ tới đúng id của hàng tiêu đề nhóm, và hàng đó có thật', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const muc = screen.getByRole('link', { name: 'B-8. Quản lý môi trường' })
    expect(muc.getAttribute('href')).toBe('#B-8')
    expect(document.getElementById('B-8')?.tagName).toBe('TR')
  })

  it('header nhóm hiện name_vi và name_en (name_en CHỈ ở đây)', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const hang = document.getElementById('B-1')!
    expect(hang.textContent).toContain('B-1. TỔNG GIỜ CÔNG')
    expect(hang.textContent).toContain('Total Man Hours')
    // name_en của một dòng chỉ tiêu nằm ở title khi hover, không in ra chữ.
    expect(screen.queryByText('PTSC Corp.')).toBeNull()
  })

  it('dải đầu: tiêu đề, 5 ô phần đầu và mốc "Lũy kế đã tính tới" theo kỳ thiếu', () => {
    const { unmount } = ve({ state: 'submitted', vai: 'admin' })
    expect(screen.getByRole('heading', { name: 'PTSC Miền Trung · FM01 · 08/2026' })).toBeTruthy()
    expect(screen.getByText('DV-2026-08')).toBeTruthy()
    expect(screen.getByText('Hải Phòng')).toBeTruthy()
    expect(screen.getByText('30/09/2026')).toBeTruthy()
    expect(screen.getByText('Chuyên viên HSE')).toBeTruthy()
    expect(screen.getByText(/Đã nộp .* bởi Trần Văn B/)).toBeTruthy()
    expect(screen.getByText(/Lũy kế đã tính tới 07\/2026/)).toBeTruthy()
    unmount()

    ve({ state: 'draft', vai: 'reporter', missing_periods: ['2026-07'] })
    expect(screen.getByText(/Lũy kế đã tính tới 06\/2026/)).toBeTruthy()
  })

  it('kỳ tháng 1 thì lũy kế tính tới tháng 12 NĂM TRƯỚC', () => {
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const mau = mauNho([chiTieu({ code: 'B-1.1' })])
    render(
      <ReportForm
        mau={mau}
        chiTiet={{
          id: 1,
          version: 1,
          state: 'draft',
          source: 'live',
          is_late: false,
          header: {
            org_unit: { code: 'U01', name: 'PTSC Miền Trung' },
            template_code: 'FM01',
            period_key: '2027-01',
            due_at: '2027-02-05T16:59:59Z',
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
          values: [giaTri({ indicator_code: 'B-1.1' })],
          texts: { C1: null },
        }}
      />,
    )
    expect(screen.getByText(/Lũy kế đã tính tới 12\/2026/)).toBeTruthy()
  })

  it('ô phần đầu trống hiện — chứ không hiện chuỗi rỗng', () => {
    ve({ state: 'draft', vai: 'reporter' })
    // `report_no` mặc định có giá trị; ở đây dựng lại với null để đo đúng nhánh trống.
    const mau = mauNho([chiTieu({ code: 'B-1.1' })])
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const { container } = render(
      <ReportForm
        mau={mau}
        chiTiet={{
          id: 1,
          version: 1,
          state: 'draft',
          source: 'live',
          is_late: false,
          header: {
            org_unit: { code: 'U01', name: 'PTSC Miền Trung' },
            template_code: 'FM01',
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
          values: [giaTri({ indicator_code: 'B-1.1' })],
          texts: { C1: null },
        }}
      />,
    )
    const phanDau = container.querySelectorAll('.grid-cols-5 > div')
    expect(phanDau).toHaveLength(5)
    for (const d of phanDau) expect(d.textContent).toMatch(/—$/)
  })
})

// ============================================================ đối chiếu bản vẽ (đo bằng CSS thật)

describe('bản vẽ: cột lũy kế của counter, màu số, lớp dính', () => {
  it('counter lấy "Lũy kế tháng trước" từ acc_prev_entered, không phải acc_prev_computed', () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter', decimals: 2 })]),
      // Đúng hình dạng backend trả cho dòng counter (services/reports.py:206): số lũy kế nằm ở
      // `acc_prev_entered` (gán từ kỳ duyệt gần nhất), còn `acc_prev_computed` để trống vì view
      // `v_report_value_computed` chỉ phủ agg_type = 'sum'.
      values: [{ indicator_code: 'B-1.5', acc_prev_entered: 1240000, acc_prev_computed: null }],
    })
    expect(o('B-1.5', 'Lũy kế tháng trước').textContent).toBe('1.240.000')
  })

  it('số MÁY tính ra hiện màu chữ phụ, số NGƯỜI nhập giữ màu mực chính khi form đã khoá', () => {
    ve({ state: 'approved', vai: 'admin' })
    const nguoiNhap = o('B-1.1', 'Tháng này')
    const mayTinh = o('B-1.4', 'Tháng này')
    expect(resolveCascadeWinner(nguoiNhap.className, 'color')).toBe('text-ink')
    expect(resolveCascadeWinner(mayTinh.className, 'color')).toBe('text-sec')
  })

  it('header cột dính ở đỉnh khung, header nhóm dính ngay DƯỚI nó', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const cot = screen.getByRole('columnheader', { name: 'Chỉ tiêu' })
    const nhom = document.getElementById('B-1')!.querySelector('td')!
    expect(resolveCascadeWinner(cot.className, 'position')).toBe('sticky')
    expect(resolveCascadeWinner(cot.className, 'top')).toBe('top-0')
    expect(resolveCascadeWinner(nhom.className, 'position')).toBe('sticky')
    // top-9 = 36px = đúng chiều cao một dòng header cột; nếu bằng top-0 thì hai lớp chồng nhau.
    expect(resolveCascadeWinner(nhom.className, 'top')).toBe('top-9')
  })

  it('mục lục chỉ liệt nhóm CÓ dòng — nhóm A/C của danh mục không sinh hàng tiêu đề rỗng', () => {
    ve({ state: 'draft', vai: 'reporter' })
    // Danh mục FM01 khai 11 nhóm nhưng chỉ B-1…B-9 có chỉ tiêu (A là 5 ô phần đầu, C là ô văn bản).
    expect(screen.getAllByRole('link')).toHaveLength(9)
    expect(screen.queryByRole('link', { name: /^A\./ })).toBeNull()
    expect(document.getElementById('A')).toBeNull()
    expect(document.getElementById('C')).toBeNull()
  })
})

// ============================================================ tách khỏi cache

describe('trạng thái form tách khỏi dữ liệu server', () => {
  it('số đang gõ KHÔNG bị chính dữ liệu server vẽ lại đè (cha rerender cùng chiTiet)', async () => {
    const mau = mauNho([chiTieu({ code: 'B-1.1' })])
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const chiTiet: ChiTietBaoCao = {
      id: 1,
      version: 3,
      state: 'draft',
      source: 'live',
      is_late: false,
      header: {
        org_unit: { code: 'U01', name: 'PTSC Miền Trung' },
        template_code: 'FM01',
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
      values: [giaTri({ indicator_code: 'B-1.1', this_period: null })],
      texts: { C1: null },
    }
    const r = render(<ReportForm mau={mau} chiTiet={chiTiet} />)
    await userEvent.type(o('B-1.1', 'Tháng này'), '77')
    r.rerender(<ReportForm mau={mau} chiTiet={chiTiet} />)
    await waitFor(() => expect(chu(o('B-1.1', 'Tháng này'))).toBe('77'))
  })
})
