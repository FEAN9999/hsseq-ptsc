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
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportForm, type ChiTietBaoCao, type GiaTriBaoCao, type MauBaoCao, type ChiTieuMau, type LoiXungDot } from './ReportForm'
import { api, ApiError } from '../../api/client'
import { useSession } from '../../app/session'
import { resolveCascadeWinner } from '../../components/ui/cascade'

const CATALOG = (await import('../../test/fixtures/fm01-catalog.json')).default

// Ba ô chữ nhóm C nay nằm trong tab "Hoạt động nổi bật" (mockup 04), và Radix gỡ nội dung tab
// không hoạt động khỏi DOM — nên mọi ca chạm tới chúng phải mở tab trước. Radix đổi tab ở
// `mousedown`, KHÔNG phải `click`, nên `fireEvent.click` ở đây sẽ im lặng không làm gì.
function moTabC() {
  const tab = screen.getByRole('tab', { name: 'Hoạt động nổi bật' })
  if (tab.getAttribute('aria-selected') !== 'true') fireEvent.mouseDown(tab)
}

/** Ô chữ nhóm C, tự mở tab chứa nó. Gọi nhiều lần vô hại. */
function oChu(nhan: string): HTMLTextAreaElement {
  moTabC()
  return screen.getByLabelText(nhan) as HTMLTextAreaElement
}

/** Mọi neo `#x` đang có trên trang đều phải có đích thật. Thay cho các khẳng định đếm mục lục cũ:
 *  dải chip của thẻ "Tiến độ nhập" chỉ liệt nhóm CÓ trong bảng, nên "A còn trong mục lục không"
 *  không còn là câu hỏi — câu duy nhất từng quan trọng là "không link nào trỏ vào chỗ trống". */
function neoHong(): string[] {
  return Array.from(document.querySelectorAll('a[href^="#"]'))
    .map((a) => a.getAttribute('href')!.slice(1))
    .filter((id) => document.getElementById(id) === null)
}

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
  /** Mặc định 12. Có ca đặt khác 12 để mã báo cáo viết cứng trong URL của `PUT` không sống được
   * (đột biến N18 của người soát — cùng lớp lỗi M43 "hardcode FM01" của Task 22). */
  id?: number
  state?: string
  vai?: 'admin' | 'reporter' | 'viewer'
  source?: string
  version?: number
  is_late?: boolean
  decided_at?: string | null
  decision_note?: string | null
  missing_periods?: string[]
  values?: (Partial<GiaTriBaoCao> & { indicator_code: string })[]
  texts?: Record<string, string | null>
  mau?: MauBaoCao
  /** P7: ghi đè từng trường của `header` — dùng để dựng cảnh 66/66 báo cáo THẬT trên DB demo, nơi
   * cả năm trường phần đầu đều NULL. */
  header?: Partial<ChiTietBaoCao['header']>
}

/** Cây thật bọc form trong `QueryClientProvider` + router (app/routes.tsx): lớp lưu của Task 23
 * nằm NGAY TRONG form (`useSaveValues` → `useQueryClient()`), và lớp chuyển trạng thái của Task 24
 * gọi `useNavigate()` cho link "Xem dashboard" của toast — thiếu một trong hai provider là ném
 * ngay lúc render. Bọc lại cho khớp CÂY THẬT thay vì bẻ mã sản phẩm sang `location.assign` cho
 * vừa test: đó đúng là nguyên nhân của lỗi S1 ở Task 20 (task-20-fix-1.md). Mỗi cây một client
 * RIÊNG — dùng chung là đường cho cache rò từ ca này sang ca kia. */
// P4 (final-fix-FE.md, Ruling 426): `createMemoryRouter` + `RouterProvider` chứ không
// `MemoryRouter`. `useBlocker` — thứ giữ cho ô số không chết câm khi điều hướng SPA — CHỈ chạy
// trong DATA router, đúng loại `app/routes.tsx` dùng (`createBrowserRouter`). Đây là lần thứ hai
// file này bọc lại cho khớp CÂY THẬT thay vì bẻ mã sản phẩm cho vừa test (lần đầu: S1 của Task 20).
//
// Router giữ NGUYÊN DANH TÍNH qua mọi lần render — 9 ca dùng `rerender`/`batLoiLamMoi` để mô phỏng
// một lượt làm mới nền, và dựng router mới mỗi lần render sẽ thay cả `RouterProvider`, giết state
// của form ngay giữa phép đo. `children` MỚI đi vào router CŨ qua một context: đổi context thì
// chính phần tử route phải vẽ lại, không phụ thuộc vào việc `RouterProvider` có chịu vẽ lại hay
// không.
const ConCuaBoc = createContext<ReactNode>(null)

function KeoCon() {
  return <>{useContext(ConCuaBoc)}</>
}

function BocQuery({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient())
  const [router] = useState(() => createMemoryRouter([{ path: '*', element: <KeoCon /> }]))
  return (
    <QueryClientProvider client={qc}>
      <ConCuaBoc.Provider value={children}>
        <RouterProvider router={router} />
      </ConCuaBoc.Provider>
    </QueryClientProvider>
  )
}

function veCay(ui: ReactElement) {
  return render(ui, { wrapper: BocQuery })
}

/** Dữ liệu `GET /reports/{id}` dựng sẵn. Tách riêng khỏi `ve()` để ca nào cần RERENDER bằng một
 * bản mới (mô phỏng lượt làm mới nền sau khi người KHÁC vừa ghi) dựng được hai bản. */
function duLieu(opts: VeOpts = {}): ChiTietBaoCao {
  const mau = opts.mau ?? MAU_FM01
  const deGhiDe = new Map((opts.values ?? []).map((v) => [v.indicator_code, v]))
  return {
    id: opts.id ?? 12,
    version: opts.version ?? 8,
    state: opts.state ?? 'draft',
    source: opts.source ?? 'live',
    is_late: opts.is_late ?? false,
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
      decided_at: opts.decided_at === undefined ? '2026-09-04T08:20:00Z' : opts.decided_at,
      decision_note: opts.decision_note ?? null,
      ...opts.header,
    },
    missing_periods: opts.missing_periods ?? [],
    values: mau.indicators.map((ct) => giaTri({ indicator_code: ct.code, ...deGhiDe.get(ct.code) })),
    texts: opts.texts ?? Object.fromEntries(mau.text_fields.map((t) => [t.code, null])),
  }
}

function ve(opts: VeOpts = {}) {
  const mau = opts.mau ?? MAU_FM01
  const quyen =
    opts.vai === 'admin' ? QUYEN_ADMIN : opts.vai === 'viewer' ? QUYEN_VIEWER : QUYEN_REPORTER
  useSession.getState().login('tok-test', NGUOI_DUNG, DON_VI, quyen)

  const props = { mau, chiTiet: duLieu(opts) }
  const r = veCay(<ReportForm {...props} />)
  return {
    ...r,
    /** Bật cờ "lượt làm mới nền vừa hỏng" — trong app thật cờ này tới từ `pages/ReportDetail.tsx`
     * (fix-1 F1); đường đi thật đo ở ReportDetail.test.tsx, ở đây chỉ đo phần hiển thị. */
    batLoiLamMoi: () => r.rerender(<ReportForm {...props} loiLamMoi />),
  }
}

/** Hẹn `api.put` từ chối bằng đúng thân 409 "người khác vừa sửa" của
 * `services/reports.py:438`, rồi đi ĐÚNG đường người dùng đi: sửa một ô, bấm "Lưu".
 *
 * Task 22 có prop `xungDot` để bơm thẳng lỗi vào form; Task 24 bỏ prop đó (app thật không ai
 * truyền — task-24-carry.md C-T23b) nên mọi ca 409 dưới đây chạy qua lớp lưu thật. */
async function bat409(
  u: ReturnType<typeof nguoiDung>,
  ma: string,
  so: string,
  loi: LoiXungDot,
) {
  putSpy.mockRejectedValueOnce(
    new ApiError(409, { detail: loi.detail, state: loi.state, version: loi.version, values: loi.values }),
  )
  await u.click(o(ma, 'Tháng này'))
  await u.keyboard(so)
  await u.click(screen.getByRole('button', { name: 'Lưu' }))
}

/** Gõ một số vào ô rồi RỜI ô — `NumberCell` chỉ chốt ô lúc rời, nên không có bước này thì hàng
 * chờ của lớp lưu rỗng và `saveNow()` về ngay, không sinh `PUT` nào. Đây là cách quan sát hành
 * động "Lưu" bằng đường THẬT (`api.put`) thay vì bằng một prop `onLuu` mà app không truyền. */
async function lamBanMotO(u: ReturnType<typeof nguoiDung>, ma = 'B-1.1', so = '12') {
  await u.click(o(ma, 'Tháng này'))
  await u.keyboard(so)
  await u.tab()
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
 * và "Ctrl+S không mở hộp thoại lưu trang" mà không phải dựng một `<form>` giả.
 *
 * Nghe ở `window`, KHÔNG ở `document`: đường bọt kết thúc ở window, nên đây là điểm duy nhất thấy
 * được `preventDefault` của MỌI tầng phía dưới — kể cả tầng window mà `useKeyboardNav` gắn Ctrl+S
 * lên (fix-1 S2). Probe đăng ký SAU hook nên luôn chạy sau nó trên cùng một target. */
function theoDoiChan(key: string) {
  const ket = { chan: false, thay: false }
  window.addEventListener(
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

// Lớp lưu của Task 23 nằm NGAY TRONG form: rời một ô có sửa là hẹn một `PUT` sau 1,5 giây. Chặn
// `api.put` cho CẢ file — ca nào không nói gì về lưu cũng không được bắn request thật ra ngoài.
const putSpy = vi.spyOn(api, 'put')
// Task 24: nút chuyển trạng thái dẫn tới `POST /reports/{id}/transition`. Chặn cho CẢ file —
// ca nào không nói gì về chuyển trạng thái cũng không được bắn request thật ra ngoài.
const postSpy = vi.spyOn(api, 'post')

/** Thân của lần `api.post` thứ `lan` (`mock.calls[lan]` là `[path, body]`). */
function thanPost(lan: number): Record<string, unknown> {
  return postSpy.mock.calls[lan][1] as Record<string, unknown>
}

/** Nút BÊN TRONG hộp thoại. Bắt buộc phải thu hẹp phạm vi: nút chính của hộp thoại "Duyệt" trùng
 * tên với nút "Duyệt" của thanh dính dưới, `screen.getByRole` sẽ ném lỗi "nhiều phần tử". */
function nutHop(ten: string): HTMLElement {
  return within(screen.getByRole('dialog')).getByRole('button', { name: ten })
}

/** Thân của lần `api.put` thứ `lan` (`mock.calls[lan]` là `[path, body]`). */
function thanPut(lan: number): {
  version: number
  values: Record<string, unknown>[]
  texts?: Record<string, string | null>
} {
  return putSpy.mock.calls[lan][1] as {
    version: number
    values: Record<string, unknown>[]
    texts?: Record<string, string | null>
  }
}

beforeEach(() => {
  useSession.getState().logout()
  putSpy.mockReset()
  putSpy.mockResolvedValue({ version: 9, values: [] })
  postSpy.mockReset()
  postSpy.mockResolvedValue({ state: 'submitted', version: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================ 5 chế độ (D14)

describe('chế độ form theo trạng thái × quyền', () => {
  it('chế độ 1 — nháp / người nộp: có ô nhập, nút Lưu và Nộp báo cáo', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Nộp báo cáo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeTruthy()
  })

  // `getByRole('status')`, KHÔNG phải `alert`: banner này nằm sẵn trên trang lúc tải (fix-1 S12).
  it('chế độ 2 — trả lại: banner đỏ nguyên văn ghi chú của admin KÈM mốc trả lại, nút Nộp lại', () => {
    ve({ state: 'returned', vai: 'reporter', decision_note: 'Thiếu số B-8.1' })
    const b = screen.getByRole('status')
    expect(b.textContent).toContain('Thiếu số B-8.1')
    // states.html: "Ban ATCL trả lại 04/09/2026 15:20:" — `decided_at` của fixture là
    // 2026-09-04T08:20:00Z = 15:20 giờ VN.
    expect(b.textContent).toContain('Ban ATCL trả lại 04/09/2026 15:20:')
    expect(resolveCascadeWinner(b.closest('div')!.className, 'background-color')).toBe('bg-destructive-bg')
    expect(screen.getByRole('button', { name: 'Nộp lại' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nộp báo cáo' })).toBeNull()
  })

  // fix-1 S4: `workflow.py:247` KHÔNG xoá `decision_note` khi submit, nên một báo cáo đã nộp lại
  // vẫn mang nguyên ghi chú của lượt trả lại trước. Bỏ điều kiện `state === 'returned'` thì người
  // duyệt mở báo cáo vừa nộp sẽ thấy banner đỏ của lượt trước.
  // fix-2 F10 (R11): fixture luôn có `decided_at` nên nhánh `: ''` chưa từng chạy. Bỏ canh đó thì
  // `formatDateTime(null)` cho "01/01/1970 07:00" — một cái ngày rác in thẳng lên banner đỏ.
  it('banner trả lại khi decided_at là null: chỉ có câu ghi chú, không kèm ngày rác', () => {
    ve({ state: 'returned', vai: 'reporter', decision_note: 'Thiếu số B-8.1', decided_at: null })
    const b = screen.getByRole('status')
    expect(b.textContent).toContain('Thiếu số B-8.1')
    expect(b.textContent).toContain('Ban ATCL trả lại:')
    expect(b.textContent).not.toContain('1970')
  })

  it('đã nộp lại nhưng decision_note cũ còn nguyên: KHÔNG hiện banner trả lại nữa', () => {
    ve({ state: 'submitted', vai: 'admin', decision_note: 'Thiếu số B-8.1' })
    expect(screen.queryByText(/Ban ATCL trả lại/)).toBeNull()
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
    // fix-1 S7: người xem CÓ report.view_all nhưng KHÔNG có report.approve — vai duy nhất tách
    // được hai quyền đó. Đổi điều kiện cột Lệch sang view_all sẽ đỏ đúng ở đây.
    expect(screen.queryByRole('columnheader', { name: 'Lệch' })).toBeNull()
  })

  // fix-1 S7: `is_editable ?? false` — nhánh `??` chỉ chạy khi `state` của báo cáo KHÔNG nằm
  // trong `mau.states` (mẫu đổi mà báo cáo cũ còn trạng thái cũ). Đổi thành `?? true` mở khoá cả
  // form cho một trạng thái không ai biết luật.
  it('trạng thái không có trong danh mục mẫu: form khoá cứng, không ô nhập, không nút nào', () => {
    const { container } = ve({ state: 'trang-thai-la', vai: 'admin' })
    expect(container.querySelectorAll('input')).toHaveLength(0)
    expect(container.querySelectorAll('textarea')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
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

  // fix-1 S3: ca trên chỉ chạy ở chế độ SỬA ĐƯỢC, nên đảo thứ tự hai nhánh `empty` / `!suaDuoc`
  // trong `OGiaTri` không làm ca nào đỏ — mà đảo xong thì MỌI form đã khoá hiện "—" ở ô snapshot,
  // tức nói dối rằng ô đó có tồn tại. FM01 chưa có dòng snapshot nên đây là bẫy cho mẫu thứ hai.
  it('C9 vẫn đúng khi form ĐÃ KHOÁ: ô snapshot trắng, không mượn dấu — của nhánh chỉ đọc', () => {
    const { container } = ve({ state: 'approved', vai: 'admin', mau: MAU_BA_LOAI })
    expect(timO('B-1.2', 'Lũy kế tháng trước')).toBeNull()
    expect(timO('B-1.2', 'Tháng này')).toBeNull()
    const oSnapshot = container.querySelectorAll('tr#B-1-2 td')
    expect(oSnapshot[2].textContent).toBe('')
    expect(oSnapshot[3].textContent).toBe('')
    // cùng lúc đó dòng derived ở form khoá VẪN hiện "—"
    expect(o('B-1.3', 'Tháng này').textContent).toBe('—')
  })

  it('dòng computed hiện icon khoá + title công thức, không có dòng chữ giải thích', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const khoa = screen.getByTitle('Tự tính = B-1.1 + B-1.2 + B-1.3')
    // Icon lucide `aria-hidden` không vào textContent — đo riêng nó, và đo riêng chữ, để một bản
    // bỏ mất icon (hay bỏ mất chữ) đều đỏ.
    expect(khoa.textContent).toBe('tự tính')
    expect(khoa.querySelector('svg.lucide-lock')).toBeTruthy()
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

  it('thiếu ô bắt buộc thì KHÔNG mở hộp thoại và KHÔNG gửi transition (chặn trước vòng mạng)', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('đủ ô bắt buộc thì Nộp mở hộp thoại của đúng chuyển trạng thái submit', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      values: [{ indicator_code: 'B-1.1', this_period: 5 }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    // Câu chữ của hộp thoại là bằng chứng nó chọn ĐÚNG transition `submit` (spec dòng 682), chứ
    // không phải chỉ "có một hộp thoại nào đó" mở ra.
    const hop = await screen.findByRole('dialog')
    expect(hop.textContent).toContain('Nộp báo cáo 08/2026 của PTSC Miền Trung?')
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

  // fix-2 F9 (R15): `giaTriBatBuoc` đọc ĐÚNG cột mà `cellPolicy` chấm. Dữ liệu thật: B-1.5…B-1.8
  // của FM01 là `counter` bắt buộc, kiểm ở cột **Cộng dồn**. Thu cả hai nhánh về `o.thisPeriod`
  // thì điền đủ Cộng dồn vẫn bị chặn nộp, còn điền Tháng này lại lọt qua dù ô bắt buộc trống —
  // hai lỗi ngược chiều nhau, nên ca này đo cả hai chiều.
  it('counter: điền đủ Cộng dồn thì nộp được; điền Tháng này mà bỏ trống Cộng dồn thì bị chặn', async () => {
    const MAU_COUNTER = mauNho([
      chiTieu({ code: 'B-1.1', agg_type: 'sum' }),
      chiTieu({ code: 'B-1.5', agg_type: 'counter' }),
    ])
    const { unmount } = ve({
      state: 'draft',
      vai: 'reporter',
      mau: MAU_COUNTER,
      values: [
        { indicator_code: 'B-1.1', this_period: 1 },
        { indicator_code: 'B-1.5', acc_total_entered: 500 }, // đủ ô bắt buộc của counter
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.queryByText(/Thiếu \d+ ô bắt buộc/)).toBeNull()
    unmount()

    ve({
      state: 'draft',
      vai: 'reporter',
      mau: MAU_COUNTER,
      values: [
        { indicator_code: 'B-1.1', this_period: 1 },
        { indicator_code: 'B-1.5', this_period: 7 }, // điền nhầm cột: Cộng dồn vẫn trống
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/Thiếu 1 ô bắt buộc/)).toBeTruthy()
  })

  it('dòng computed không bao giờ bị tính là thiếu ô bắt buộc', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.4', agg_type: 'computed', formula: 'B-1.1', required: true })]),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.queryByText(/Thiếu \d+ ô bắt buộc/)).toBeNull()
    expect(await screen.findByRole('dialog')).toBeTruthy()
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

  // fix-1 S5: 4 dòng counter thật (B-1.5…B-1.8) có CẢ HAI cột là ô nhập. Bỏ `...cu` trong reducer
  // thì gõ một cột sẽ xoá cột kia, và vòng 1 không có ca nào đỏ vì mọi ca chỉ gõ một cột.
  it('dòng counter: gõ "Tháng này" KHÔNG xoá "Cộng dồn" đã có, và ngược lại', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
      values: [{ indicator_code: 'B-1.5', this_period: 11, acc_total_entered: 500 }],
    })
    await userEvent.type(o('B-1.5', 'Tháng này'), '2')
    expect(chu(o('B-1.5', 'Tháng này'))).toBe('112')
    expect(chu(o('B-1.5', 'Cộng dồn'))).toBe('500')

    await userEvent.type(o('B-1.5', 'Cộng dồn'), '7')
    expect(chu(o('B-1.5', 'Cộng dồn'))).toBe('5007')
    expect(chu(o('B-1.5', 'Tháng này'))).toBe('112')
  })

  // Đột biến N22 của reviewer: bỏ `ct.required` khỏi bộ lọc.
  it('chỉ tiêu KHÔNG bắt buộc để trống thì không bị tính là thiếu, dù cellPolicy có chấm ô cho nó', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-8.1' }), chiTieu({ code: 'B-8.2', required: false })]),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.getByText(/Thiếu 1 ô bắt buộc/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'B-8.2' })).toBeNull()
  })

  // Đột biến N23: đảo `error ?? loiNgoai` thành `loiNgoai ?? error` trong NumberCell. Lỗi VỪA GÕ
  // phải thắng lời nhắc "Bắt buộc" đang treo sẵn — nếu không, người dùng gõ chữ vào ô đỏ sẽ
  // không bao giờ biết vì sao số của họ không vào.
  it('ô đang treo "Bắt buộc" mà gõ chữ: hiện lỗi vừa gõ, không giữ nguyên "Bắt buộc"', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-8.1' })]) })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    const oB = o('B-8.1', 'Tháng này')
    expect(screen.getAllByText('Bắt buộc').length).toBeGreaterThan(0)
    await userEvent.type(oB, 'abc')
    await userEvent.tab() // NumberCell chốt lỗi lúc RỜI ô, không phải theo từng phím
    expect(screen.getByText('Chỉ nhập số')).toBeTruthy()
    expect(screen.queryByText('Bắt buộc')).toBeNull()
  })

  // fix-4: Esc gỡ câu lỗi của LẦN SỬA vừa bị huỷ ("Chỉ nhập số" — nói về chữ đang nằm trong ô),
  // nhưng KHÔNG được gỡ "Bắt buộc" — lỗi đó nói về giá trị ĐÃ CHỐT và Esc không trả lời được nó.
  // Trả ô về đúng trạng thái trống mà lần bấm Nộp vừa rồi đã chỉ ra là thiếu, rồi im lặng, là giấu
  // mất đúng ô đang chặn người ta nộp.
  it('Esc gỡ lỗi chữ vừa gõ nhưng trả lại lời nhắc "Bắt buộc" đang treo sẵn', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-8.1' })]) })
    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    const oB = o('B-8.1', 'Tháng này')
    await u.click(oB)
    await u.keyboard('abc')
    // Ctrl+S chốt ô ngay tại chỗ (K1) nên ô đỏ lên mà con trỏ KHÔNG rời đi — đúng tình huống người
    // ta bấm Esc. Bấm Tab rồi quay lại là một chuyện khác: lúc đó "giá trị trước khi sửa" của lượt
    // focus MỚI chính là chuỗi hỏng, Esc trả về đúng nó (hành vi sẵn có, không thuộc vòng này).
    await u.keyboard('{Control>}s{/Control}')
    expect(screen.getByText('Chỉ nhập số')).toBeTruthy()

    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('')
    expect(screen.queryByText('Chỉ nhập số')).toBeNull()
    // "Bắt buộc" quay lại vì nó là lỗi NGOÀI, tính từ state của form. Rằng Esc KHÔNG chép nó vào
    // lỗi nội bộ của ô thì đo ở NumberCell.test.tsx (ca `loiNgoai` tắt sau Esc) — ở đây hai loại
    // lỗi hiện ra bằng đúng một câu chữ nên không phân biệt được.
    expect(screen.getAllByText('Bắt buộc').length).toBeGreaterThan(0)
  })

  // Đột biến N4: `MA_HIEN_TOI_DA` 8 → 100. Form FM01 trống thiếu 52 ô; liệt hết sẽ đẩy thanh dính
  // cao gần nửa màn hình.
  it('thiếu quá nhiều ô: thanh dưới liệt tối đa 8 mã rồi rút gọn thành "+n"', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    const cauBao = screen.getByText(/Thiếu \d+ ô bắt buộc/).parentElement!
    const soThieu = Number(cauBao.textContent!.match(/Thiếu (\d+) ô/)![1])
    expect(soThieu).toBeGreaterThan(8)
    const maTrongCau = Array.from(cauBao.querySelectorAll('a'))
    expect(maTrongCau).toHaveLength(8)
    expect(cauBao.textContent).toContain(`+${soThieu - 8}`)
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
    // Bắt ĐÚNG câu của thanh dưới: thẻ "Tiến độ nhập" cũng in "n/n ô bắt buộc" và luôn có mặt.
    expect(screen.queryByText(/Thiếu \d+ ô bắt buộc/)).toBeNull()
    expect(o('B-8.1', 'Tháng này').getAttribute('aria-invalid')).not.toBe('true')
  })
})

// ============================================================ 3 banner

describe('banner', () => {
  it('banner 409 giữ nguyên số đang gõ, chỉ vá cột chỉ đọc và version', async () => {
    const u = userEvent.setup()
    ve({
      state: 'draft',
      vai: 'reporter',
      version: 8,
      values: [{ indicator_code: 'B-1.1', acc_prev_computed: 402100 }],
    })

    await bat409(u, 'B-2.1', '7', {
      detail: 'Người khác vừa sửa báo cáo này',
      state: 'draft',
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

  // fix-2 F7 (R13): S12 dặn thẳng "giữ role=alert cho banner 409" nhưng không ai khoá. 409 là sự
  // kiện THẬT (người khác vừa ghi đè báo cáo), phải cắt ngang trình đọc màn hình; hai banner tĩnh
  // thì không. Ca này khoá cả ba vai trò cùng lúc.
  it('ba banner chia vai đúng: 409 là alert, banner trả lại và kỳ thiếu là status', async () => {
    const u = userEvent.setup()
    ve({
      state: 'returned',
      vai: 'reporter',
      decision_note: 'Thiếu số B-8.1',
      missing_periods: ['2026-07'],
    })
    // Trước 409: chỉ có hai banner tĩnh, KHÔNG có vùng alert nào.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(2)

    // `state: 'returned'` — thân 409 nói trạng thái server ĐANG giữ, mà "người khác vừa sửa" là
    // một lượt GHI GIÁ TRỊ, không đổi trạng thái. Từ fix-3 L2 form nhận lấy `state` này, nên khai
    // sai ở đây là tự tay đẩy báo cáo về `draft` và banner trả lại biến mất.
    await bat409(u, 'B-1.1', '7', {
      detail: 'Người khác vừa sửa báo cáo này',
      state: 'returned',
      version: 9,
      values: [],
    })

    const bao = await screen.findByRole('alert')
    expect(bao.textContent).toContain('Người khác vừa sửa báo cáo này')
    // Gọi TÊN từng vùng status thay vì đếm tổng: từ Task 23 dải đầu có thêm một vùng status
    // ("Chưa lưu (1 ô)") mà lượt lưu hỏng ở trên vừa dựng lên, nên một con số tổng không còn nói
    // được banner nào là banner nào — và nó cũng không bao giờ nói được điều quan trọng nhất:
    // câu 409 KHÔNG được nằm trong một vùng status.
    const dsStatus = screen.getAllByRole('status').map((e) => e.textContent ?? '')
    expect(dsStatus.filter((t) => t.includes('Ban ATCL trả lại'))).toHaveLength(1)
    expect(dsStatus.filter((t) => t.includes('Lũy kế chưa tính kỳ 07/2026'))).toHaveLength(1)
    expect(dsStatus.some((t) => t.includes('Người khác vừa sửa báo cáo này'))).toBe(false)
  })

  // fix-2 F8 (R12): riêng banner "kỳ thiếu" — gỡ `role="status"` của nó thì vùng sống biến mất mà
  // ca trên vẫn xanh nếu ai đó chỉ đếm tổng.
  it('banner kỳ thiếu là vùng status kể cả khi đứng một mình', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: ['2026-07'] })
    const b = screen.getByRole('status')
    expect(b.textContent).toContain('Lũy kế chưa tính kỳ 07/2026')
  })

  it('409 lần hai đếm từ version MỚI — chứng minh version đã được vá vào state', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', version: 8 })
    await bat409(u, 'B-1.1', '7', { detail: 'Người khác vừa sửa báo cáo này', state: 'draft', version: 9, values: [] })
    expect(await screen.findByText(/phiên bản 8 → 9/)).toBeTruthy()
    await bat409(u, 'B-1.1', '8', { detail: 'Người khác vừa sửa báo cáo này', state: 'draft', version: 12, values: [] })
    expect(await screen.findByText(/phiên bản 9 → 12/)).toBeTruthy()
  })

  // fix-3 L2 (D1): 409 của LỚP LƯU cũng nói trạng thái server đang giữ. Vứt `state` đi thì
  // `s.version` nhảy lên bằng server trong khi `s.trangThai` đứng ở bản cũ; trọng tài tin cặp đó và
  // thanh dính hiện nút "Nộp báo cáo" cho một báo cáo VỪA BỊ TRẢ LẠI — bấm vào là ăn thêm 409 nữa.
  it('409 của lớp lưu đổi luôn nút thanh dính sang trạng thái server vừa nói', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', version: 8 })
    expect(screen.getByRole('button', { name: 'Nộp báo cáo' })).toBeTruthy()

    await bat409(u, 'B-1.1', '7', {
      detail: 'Người khác vừa sửa báo cáo này',
      state: 'returned',
      version: 12,
      values: [],
    })

    expect(await screen.findByRole('button', { name: 'Nộp lại' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nộp báo cáo' })).toBeNull()
  })

  it('409 hiện NGUYÊN VĂN detail của server, không viết lại câu', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await bat409(u, 'B-1.1', '7', { detail: 'Một câu hoàn toàn khác từ server', state: 'draft', version: 9, values: [] })
    expect(await screen.findByText(/Một câu hoàn toàn khác từ server/)).toBeTruthy()
  })

  it('chưa có 409 thì không có banner vàng nào', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.queryByText(/phiên bản/)).toBeNull()
  })

  // Hai banner xám xếp chồng nay gom thành MỘT khối Alert "n điểm cần biết trước khi nộp/duyệt"
  // (mockup 04). Đổi màu xám → vàng cảnh báo là có chủ ý, nên ca này khoá hai thứ còn lại: nó
  // KHÔNG mang màu lỗi (đỏ) và nó KHÔNG chặn nộp.
  it('nhắc kỳ thiếu là cảnh báo mềm và KHÔNG chặn nộp', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      missing_periods: ['2026-07'],
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      values: [{ indicator_code: 'B-1.1', this_period: 5 }],
    })
    const khoi = screen.getByRole('status')
    expect(khoi.textContent).toContain('Lũy kế chưa tính kỳ 07/2026')
    expect(resolveCascadeWinner(khoi.className, 'background-color')).toBe('bg-warning-bg')

    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('không thiếu kỳ nào thì không có lời nhắc kỳ thiếu', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: [] })
    // Đọc `textContent` chứ không `queryByText`: câu nhắc có <b> ở giữa nên `queryByText` trả null
    // cả khi câu CÒN trên màn hình — ca này sẽ xanh vĩnh viễn mà không đo gì.
    expect(document.body.textContent).not.toContain('Lũy kế chưa tính kỳ')
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
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
      values: [{ indicator_code: 'B-1.5', this_period: 180, acc_total_entered: 180, counter_check: LECH }],
    })
    expect(screen.getByText(/Lệch công thức/)).toBeTruthy()
    expect(screen.getByText(/1 bộ đếm lệch công thức chưa có ghi chú/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
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

  // fix-5 M5 (C13): mốc khôi phục phải SỐNG QUA lượt Esc. Bấm Esc hai lần liên tiếp đúng là thứ
  // người ta làm khi không chắc phím vừa rồi có ăn; nếu lượt đầu xoá luôn mốc thì lượt hai làm
  // TRẮNG ô, và rời ô là chốt `null` — số cũ mất khỏi cả màn hình lẫn server.
  it('Esc hai lần liên tiếp vẫn giữ số cũ, không làm trắng ô', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 100 }] })
    const oB = o('B-2.1', 'Tháng này')
    await u.click(oB)
    await u.keyboard('9')
    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('100')

    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('100')
    // Ô chỉ đọc cùng dòng tính TỪ STATE: một ô bị làm trắng chốt `null` xuống reducer và ô này
    // thành "—".
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('100')
  })

  // fix-5 M8 (C14): nhánh Esc cấp lưới phải NUỐT phím. Không `preventDefault` thì Esc lọt xuống
  // trình duyệt, và lượt "revert ô nhập" riêng của một số trình duyệt chồng lên đúng ô vừa được
  // trả về mốc.
  it('Esc trong ô số bị chặn, không lọt xuống trình duyệt', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 100 }] })
    const theoDoi = theoDoiChan('Escape')
    await u.click(o('B-2.1', 'Tháng này'))
    await u.keyboard('9')
    await u.keyboard('{Escape}')
    expect(theoDoi.thay).toBe(true)
    expect(theoDoi.chan).toBe(true)
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

  // fix-3 L1: Ctrl+S chốt ô bằng cách blur rồi focus lại (K1), và lượt focus ĐÓ không được tính là
  // một lần "người dùng bước vào ô" — nếu tính thì mốc Esc khôi phục về bị dời theo mỗi lần bấm
  // Ctrl+S, trái thẳng dòng thiết kế 676 "Esc khôi phục giá trị TRƯỚC KHI SỬA".
  it('Esc sau Ctrl+S vẫn trả về giá trị trước khi sửa, không phải giá trị lúc lưu', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 100 }] })
    const oB = o('B-2.1', 'Tháng này')
    await u.click(oB)
    await u.clear(oB)
    await u.keyboard('12')
    await u.keyboard('{Control>}s{/Control}')
    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('100')
    // Đọc qua ô chỉ đọc cùng dòng: nó tính TỪ STATE, nên đây là bằng chứng 100 đã về lại reducer
    // chứ không chỉ còn là chữ trên màn hình.
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('100')
  })

  // Ca QUYẾT ĐỊNH của L1: ô đang LỖI. Sau Ctrl+S ô đỏ lên, và Esc là đường thoát DUY NHẤT về số
  // cũ — nếu mốc khôi phục đã bị dời thành "100a" thì Esc trả lại đúng chuỗi hỏng đó và số 100
  // biến mất khỏi cả màn hình lẫn mốc, trên form 55 dòng chỉ còn cách nhớ lại mà gõ tay.
  it('Esc cứu được ô đang lỗi sau Ctrl+S: trả về số cũ VÀ hết đỏ ngay', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 100 }] })
    const oB = o('B-2.1', 'Tháng này')
    await u.click(oB)
    await u.keyboard('a')
    expect(chu(oB)).toBe('100a')
    await u.keyboard('{Control>}s{/Control}')
    expect(oB.getAttribute('aria-invalid')).toBe('true')

    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('100')
    expect(o('B-2.1', 'Cộng dồn').textContent).toBe('100')
    // fix-4: hết đỏ NGAY, không chờ rời ô. `100` là giá trị ô đang có trước khi sửa, tức theo định
    // nghĩa là hợp lệ — một ô mang giá trị hợp lệ mà vẫn `aria-invalid="true"` là trạng thái sai,
    // và trình đọc màn hình đọc "không hợp lệ" cho một ô đã đúng. Người nhập thì thấy Esc "không
    // ăn" rồi bấm tiếp hoặc bỏ cuộc.
    expect(oB.getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText('Chỉ nhập số')).toBeNull()
  })

  // fix-5 M7 (C9): mọi ca của vòng 4 đều gõ `abc`, nên chúng chỉ canh đúng câu 'Chỉ nhập số'.
  // `parseViNumber` còn ba câu nữa và Esc phải gỡ được cả ba — nó tính LẠI lỗi theo chữ vừa khôi
  // phục, chứ không nhận diện riêng một câu nào.
  it.each([
    ['-5', 'Số không được âm'],
    ['1,5', 'Chỉ nhận tối đa 0 chữ số thập phân'],
    ['99999999999999999', 'Số quá lớn, tối đa 16 chữ số phần nguyên'],
  ])('Esc gỡ được cả câu lỗi KHÔNG phải "Chỉ nhập số": gõ %s', async (goVao, cauLoi) => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 100 }] })
    const oB = o('B-2.1', 'Tháng này')
    await u.click(oB)
    await u.clear(oB)
    await u.keyboard(goVao)
    await u.keyboard('{Control>}s{/Control}') // chốt ô tại chỗ: ô đỏ lên mà con trỏ không rời đi
    expect(screen.getByText(cauLoi)).toBeTruthy()

    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('100')
    expect(oB.getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText(cauLoi)).toBeNull()
  })

  // fix-5 M1 — mặt kia của ca ngay trên, và là ca biên vòng 4 bỏ sót. "Esc khôi phục về một giá
  // trị theo định nghĩa là hợp lệ" chỉ đúng khi mốc được ghi trên một ô ĐANG SẠCH. Bỏ dở một ô
  // đang lỗi, quay lại, bấm Esc: mốc của lượt focus MỚI chính là chuỗi hỏng, nên Esc trả về đúng
  // `100a` — xoá đỏ lúc đó là để ô mang chuỗi hỏng mà trông sạch sẽ, và trình đọc màn hình đọc
  // "hợp lệ" cho một ô sai, ngay lúc người ta đang sửa nó.
  it('Esc ở ô đã lỗi từ trước: giữ nguyên chuỗi hỏng thì cũng phải giữ nguyên đỏ', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 100 }] })
    const oB = o('B-2.1', 'Tháng này')
    await u.click(oB)
    await u.keyboard('a')
    await u.tab() // rời ô: lỗi được chốt, chữ hỏng ở lại (fix-1 S3)
    expect(oB.getAttribute('aria-invalid')).toBe('true')

    await u.click(oB) // quay lại ô đang đỏ — mốc khôi phục của lượt này là chính '100a'
    await u.keyboard('{Escape}')
    expect(chu(oB)).toBe('100a')
    expect(oB.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Chỉ nhập số')).toBeTruthy()
  })

  // fix-3 D2: `xuLyBlur` ghi lại `value` của ô trong lúc ô đang KHÔNG focus, nên React không khôi
  // phục được vùng chọn — đo được `[1,3]` thành `[5,5]`. Hệ quả thật: người đang sửa chữ số thứ hai
  // của một số 5 chữ số bấm Ctrl+S theo thói quen rồi gõ tiếp, chữ số rơi vào CUỐI số.
  it('Ctrl+S giữ nguyên vị trí con trỏ và vùng bôi đen trong ô', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 12345 }] })
    const oB = o('B-2.1', 'Tháng này') as HTMLInputElement
    await u.click(oB)
    await u.keyboard('6')
    oB.setSelectionRange(1, 3)
    await u.keyboard('{Control>}s{/Control}')
    expect([oB.selectionStart, oB.selectionEnd]).toEqual([1, 3])
  })

  // fix-5 M3: ca ngay trên đặt một vùng BÔI ĐEN, nên nó vẫn xanh với một bản chỉ khôi phục khi
  // `dau !== cuoi`. Con trỏ RỜI giữa một con số mới là hình dạng phổ biến nhất của lỗi D2 — người
  // ta sửa một chữ số ở giữa, bấm Ctrl+S theo thói quen, gõ tiếp thì chữ số rơi vào CUỐI và ra một
  // con số khác hẳn mà không gì báo.
  it('Ctrl+S giữ nguyên con trỏ RỜI giữa số, không chỉ giữ vùng bôi đen', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', this_period: 12345 }] })
    const oB = o('B-2.1', 'Tháng này') as HTMLInputElement
    await u.click(oB)
    await u.keyboard('6')
    oB.setSelectionRange(2, 2)
    await u.keyboard('{Control>}s{/Control}')
    expect([oB.selectionStart, oB.selectionEnd]).toEqual([2, 2])
  })

  // fix-5 M2: cờ `dangTuChotO` bật quanh khoảng blur→focus của `chotODangGo`. Một ngoại lệ rơi
  // vào giữa khoảng đó (một lượt vẽ ném bên trong `flushSync`) mà không có `try/finally` thì cờ
  // kẹt BẬT tới hết đời component: `focusin` thôi ghi mốc, và Esc ở ô KẾ TIẾP khôi phục bằng mốc
  // của ô TRƯỚC — tức ghi số của dòng khác vào ô người ta đang đứng, rồi chốt luôn xuống reducer.
  it('ngoại lệ giữa blur→focus của Ctrl+S: Esc ở ô sau vẫn về mốc của chính nó, không phải của ô trước', async () => {
    const u = userEvent.setup()
    ve({
      state: 'draft',
      vai: 'reporter',
      values: [
        { indicator_code: 'B-2.1', this_period: 100 },
        { indicator_code: 'B-2.2', this_period: 55 },
      ],
    })
    const o1 = o('B-2.1', 'Tháng này')
    const o2 = o('B-2.2', 'Tháng này')
    await u.click(o1)

    const focusGoc = o1.focus.bind(o1)
    let daNem = false
    o1.focus = () => {
      if (!daNem) {
        daNem = true
        throw new Error('lượt vẽ ném trong flushSync')
      }
      focusGoc()
    }
    // Ngoại lệ này là ĐỐI TƯỢNG ĐO, không phải sự cố: jsdom bắt nó trong lượt gọi listener rồi
    // báo lên window, và vitest tính một "unhandled error" làm đỏ cả lượt chạy. `preventDefault`
    // là cách chuẩn nói "đã xử lý" cho đúng khoảng này.
    const nuotLoi = (e: ErrorEvent) => e.preventDefault()
    window.addEventListener('error', nuotLoi)
    await u.keyboard('{Control>}s{/Control}')
    window.removeEventListener('error', nuotLoi)
    delete (o1 as Partial<HTMLElement>).focus

    await u.click(o2)
    await u.keyboard('{Escape}')
    expect(chu(o2)).toBe('55')
    // Ô chỉ đọc cùng dòng tính TỪ STATE: bằng chứng mốc của dòng khác không chui được xuống reducer.
    expect(o('B-2.2', 'Cộng dồn').textContent).toBe('55')
  })

  it('Ctrl+S khi đang đứng trong ô nhập: gọi Lưu ĐÚNG MỘT lần và chặn hộp thoại lưu trang', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    const theoDoi = theoDoiChan('s')
    await u.click(o('B-1.2', 'Tháng này'))
    await u.keyboard('{Control>}s{/Control}')
    // Đúng MỘT lần: listener nằm ở window, phím gõ trong ô bọt lên tới đó — nếu ai gắn thêm một
    // bản ở cấp lưới nữa thì con số này thành 2.
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(theoDoi.chan).toBe(true)
  })

  // fix-1 S2: ngay sau khi tải trang, và sau mỗi lần bấm vào vùng trống, focus nằm ở <body>.
  // Listener cấp lưới không nghe được phím ở đó → Ctrl+S rơi vào trình duyệt, mở hộp "Lưu trang".
  it('Ctrl+S khi focus đang ở <body> (chưa bấm vào ô nào): vẫn gọi Lưu và vẫn chặn', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    const theoDoi = theoDoiChan('s')
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(theoDoi.chan).toBe(true)
  })

  // fix-2 F4 (R8): 353 ca vòng trước không ca nào gõ phím `meta` — đổi `e.ctrlKey || e.metaKey`
  // thành `e.ctrlKey` là giết phím tắt trên toàn bộ máy Mac mà không test nào đỏ.
  it('Cmd+S (macOS) gọi Lưu và chặn hộp thoại lưu trang', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    const theoDoi = theoDoiChan('s')
    await u.keyboard('{Meta>}s{/Meta}')
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(theoDoi.chan).toBe(true)
  })

  // fix-2 F5 (R9): CapsLock bật (hoặc Ctrl+Shift+S) cho `e.key === 'S'`. Bỏ `toLowerCase()` là
  // phím tắt chết và trình duyệt mở hộp "Lưu trang" đúng lúc người dùng tưởng mình vừa lưu.
  it('Ctrl+S khi CapsLock bật (phím báo "S" hoa) vẫn gọi Lưu và vẫn chặn', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    const theoDoi = theoDoiChan('S')
    await u.keyboard('{Control>}S{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(theoDoi.chan).toBe(true)
  })

  // fix-3 G7 (M27): `luuRef.current()` chứ không phải closure `onLuu` của lần render đầu. Hôm nay
  // vô hại vì `onLuu` không mang dữ liệu, nhưng Task 23 sẽ cho nó gói giá trị form — lúc đó một
  // closure cũ sinh ra lỗi "lưu bằng dữ liệu cũ" rất khó truy.
  it('Ctrl+S gọi bản Lưu MỚI NHẤT, không phải closure của lần render đầu', async () => {
    const u = userEvent.setup()
    const mau = mauNho([chiTieu({ code: 'B-1.1' })])
    const dung = (id: number) =>
      ({
        id, version: 8, state: 'draft', source: 'live', is_late: false,
        header: {
          org_unit: { code: DON_VI.code, name: DON_VI.name }, template_code: 'FM01',
          period_key: '2026-08', due_at: '2026-10-05T16:59:59Z', report_no: null, location: null,
          report_date: null, reporter_name: null, reporter_position: null, submitted_at: null,
          decided_at: null, decision_note: null,
        },
        missing_periods: [], values: [giaTri({ indicator_code: 'B-1.1' })], texts: { C1: null },
      }) as ChiTietBaoCao
    useSession.getState().login('tok-test', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const r = veCay(<ReportForm mau={mau} chiTiet={dung(12)} />)
    await lamBanMotO(u)
    // Báo cáo KHÁC ở lần render sau: `reportId` nằm trong closure của `saveNow`, nên bản cũ gửi
    // tới /reports/12 còn bản mới gửi tới /reports/13 — đó là chỗ phân biệt duy nhất quan sát được.
    r.rerender(<ReportForm mau={mau} chiTiet={dung(13)} />)
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy.mock.calls[0][0]).toBe('/reports/13/values')
  })

  // fix-2 F6 (R10): listener nằm ở `window` nên nó sống lâu hơn component nếu cleanup quên gỡ —
  // rời màn báo cáo rồi bấm Ctrl+S vẫn bắn `onLuu` của form đã chết, và mỗi lần mở một báo cáo
  // lại cộng thêm một listener.
  it('rời màn hình (unmount) rồi bấm Ctrl+S: KHÔNG còn gọi Lưu nữa', async () => {
    const u = userEvent.setup()
    const { unmount } = ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    unmount()
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('Ctrl+S khi con trỏ đang trong textarea nhóm C cũng gọi Lưu', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(1)
  })

  it('nút Lưu gửi đúng cùng một request với Ctrl+S', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter' })
    await lamBanMotO(u)
    await u.click(screen.getByRole('button', { name: 'Lưu' }))
    await lamBanMotO(u, 'B-1.2', '34')
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(2)
    expect(putSpy.mock.calls[0][0]).toBe(putSpy.mock.calls[1][0])
  })

  it('Enter trong textarea nhóm C giữ mặc định (xuống dòng), không nhảy ô', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    const ta = oChu('C1 Hoạt động nổi bật trong tháng')
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

  // fix-1 S10: mọi ca vòng 1 đều GÕ ghi chú rồi đọc lại, không ca nào mở một báo cáo ĐÃ CÓ ghi
  // chú — nên `ghiChu[...] = v.note ?? ''` đổi thành `''` cũng không ai đỏ. Người nộp mở lại bản
  // nháp sẽ thấy ghi chú của mình biến mất.
  it('ghi chú đã lưu của từng dòng nạp sẵn từ server, cả lúc sửa được lẫn lúc form khoá', () => {
    const GC = 'Ngã cao 2 m tại xưởng 3, 12/08'
    const { unmount } = ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-2.1', note: GC }] })
    expect(chu(o('B-2.1', 'Ghi chú'))).toBe(GC)
    expect(chu(o('B-2.2', 'Ghi chú'))).toBe('')
    unmount()

    ve({ state: 'approved', vai: 'admin', values: [{ indicator_code: 'B-2.1', note: GC }] })
    expect(screen.getByText(GC)).toBeTruthy()
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

  // fix-1 S1. Vòng 1 nuốt dòng không đọc được trong im lặng: người nhập dán một cột copy từ Excel
  // bản en-US ("402100.00") và KHÔNG có gì xảy ra — không ô nào đổi, không chữ nào báo. Họ sẽ dán
  // lại rồi tưởng hệ thống hỏng. Đây là đường nhập liệu chính của 15 phút ngồi điền.
  it('dán có dòng không đọc được: thanh dưới nói rõ bỏ qua mấy dòng và mã nào', async () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-1.7', this_period: 9 }] })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5\n3,5\n4,5\n5,5\n6,5')
    // B-1.7 (decimals = 0) từ chối "6,5" — và giờ nói ra.
    expect(screen.getByText(/Dán: bỏ qua 1 dòng không đọc được \(B-1\.7\)/)).toBeTruthy()
    expect(chu(o('B-1.7', 'Tháng này'))).toBe('9') // vẫn KHÔNG đè lên số cũ
  })

  it('dán một cột Excel bản en-US: TOÀN BỘ bị từ chối, thanh dưới nói đủ 3 mã', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([
        chiTieu({ code: 'B-1.1', decimals: 2 }),
        chiTieu({ code: 'B-1.2', decimals: 2 }),
        chiTieu({ code: 'B-1.3', decimals: 2 }),
      ]),
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('402100.00\n118900.00\n96400.00')
    expect(screen.getByText(/Dán: bỏ qua 3 dòng không đọc được \(B-1\.1, B-1\.2, B-1\.3\)/)).toBeTruthy()
    expect(chu(o('B-1.2', 'Tháng này'))).toBe('—')
    expect(chu(o('B-1.3', 'Tháng này'))).toBe('—')
  })

  it('dán sạch (không dòng nào bị từ chối) thì KHÔNG có câu báo nào', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5')
    expect(screen.queryByText(/Dán: bỏ qua/)).toBeNull()
  })

  // Vòng đột biến P4: bỏ `dan-xong` khi không có dòng nào bị từ chối. Ca "dán sạch không có câu
  // báo" ở trên không bắt được vì lúc đó chưa từng có câu báo nào — phải dán HỎNG trước.
  it('dán lại đúng đắn sau một cú dán hỏng: câu báo cũ biến mất', async () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-1.7', this_period: 9 }] })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5\n3,5\n4,5\n5,5\n6,5')
    expect(screen.getByText(/Dán: bỏ qua 1 dòng/)).toBeTruthy()

    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5')
    expect(screen.queryByText(/Dán: bỏ qua/)).toBeNull()
  })

  // Ca trên vẫn còn một lối thoát: lần dán thứ hai GHI được ô, mà `nhap-o` cũng xoá câu báo. Chỉ
  // vùng copy RỖNG (người dùng bôi một cột trắng trong Excel rồi dán — chuỗi chỉ toàn xuống dòng)
  // mới tách được hai đường xoá đó ra: không ô nào được ghi, không dòng nào bị từ chối.
  it('dán một vùng Excel RỖNG sau cú dán hỏng: câu báo vẫn phải biến mất', async () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-1.7', this_period: 9 }] })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5\n3,5\n4,5\n5,5\n6,5')
    expect(screen.getByText(/Dán: bỏ qua 1 dòng/)).toBeTruthy()

    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('\n\n')
    expect(screen.queryByText(/Dán: bỏ qua/)).toBeNull()
  })

  it('gõ tay sau cú dán hỏng thì câu báo biến mất — nó nói về lần dán, không phải trạng thái form', async () => {
    ve({ state: 'draft', vai: 'reporter', values: [{ indicator_code: 'B-1.7', this_period: 9 }] })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5\n3,5\n4,5\n5,5\n6,5')
    expect(screen.getByText(/Dán: bỏ qua 1 dòng/)).toBeTruthy()
    await userEvent.type(o('B-1.2', 'Tháng này'), '7')
    expect(screen.queryByText(/Dán: bỏ qua/)).toBeNull()
  })

  // fix-2 F1 (R20): dòng dán TRÀN khỏi cuối lưới cũng từng bị nuốt im lặng — đúng lớp lỗi S1
  // sinh ra để diệt, chỉ khác nguyên nhân. Dán 60 dòng bắt đầu từ B-8.1 là chuyện có thật khi
  // người nhập copy cả cột của file tổng hợp.
  it('dán TRÀN khỏi cuối lưới: thanh dưới đếm riêng số dòng vượt ngoài bảng', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n20\n30\n40')
    expect(screen.getByText('Dán: 2 dòng vượt ngoài bảng')).toBeTruthy()
    // Hai vế là hai nguyên nhân khác nhau: dòng tràn không có ô đích nào để mà "giữ số cũ".
    expect(screen.queryByText(/không đọc được/)).toBeNull()
    expect(screen.queryByText(/ô đích giữ nguyên số cũ/)).toBeNull()

    // Câu báo nói về LẦN DÁN, không phải trạng thái form: gõ tay là nó hết — đúng như vế
    // "không đọc được" (cùng một dòng reducer phải xoá cả hai con số, không chỉ một).
    await userEvent.type(o('B-1.2', 'Tháng này'), '7')
    expect(screen.queryByText(/^Dán:/)).toBeNull()
  })

  it('dán vừa có dòng không đọc được vừa tràn: câu báo nói CẢ HAI, đếm tách bạch', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    // decimals = 0 nên "1,5" bị từ chối; "2" vào B-1.2; "3" và "4" tràn.
    await userEvent.paste('1,5\n2\n3\n4')
    expect(
      screen.getByText('Dán: bỏ qua 1 dòng không đọc được (B-1.1) · 2 dòng vượt ngoài bảng · ô đích giữ nguyên số cũ'),
    ).toBeTruthy()
  })

  it('dán vừa khít số dòng còn lại: KHÔNG có vế "vượt ngoài bảng"', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n20')
    expect(screen.queryByText(/vượt ngoài bảng/)).toBeNull()
    expect(screen.queryByText(/^Dán:/)).toBeNull()
  })

  // fix-2 F3 (R1+R2+R6): chưa ca nào dán quá MA_HIEN_TOI_DA (8) dòng hỏng, nên ba thứ cùng hở —
  // cắt danh sách, đuôi "+n", và con số tổng. Con số tổng phải là TỔNG THẬT: "bỏ qua 8 dòng … +4"
  // là hai con số chọi nhau ngay trong một câu.
  it('dán 12 dòng hỏng: kể đúng 8 mã, đuôi "+4", và tổng vẫn là 12 chứ không phải 8', async () => {
    const ds = Array.from({ length: 12 }, (_, i) => chiTieu({ code: `B-1.${i + 1}` }))
    ve({ state: 'draft', vai: 'reporter', mau: mauNho(ds) })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste(Array.from({ length: 12 }, () => '1,5').join('\n'))

    const cau = screen.getByText(/^Dán: bỏ qua/)
    expect(cau.textContent).toBe(
      'Dán: bỏ qua 12 dòng không đọc được (B-1.1, B-1.2, B-1.3, B-1.4, B-1.5, B-1.6, B-1.7, B-1.8, +4) · ô đích giữ nguyên số cũ',
    )
    // fix-2 F12 (R5): câu báo phải là chữ CẢNH BÁO, không tụt xuống chữ phụ mờ lẫn vào thanh dưới.
    expect(resolveCascadeWinner(cau.className, 'color')).toBe('text-warning-foreground')
  })

  // fix-3 G2 (M23): mọi ca F1 đều dán vào cột "Tháng này". Cột Cộng dồn là cột NHẬP của 4 dòng
  // `counter` bắt buộc thật của FM01 (B-1.5…B-1.8) — đếm tràn phải không phụ thuộc cột nào.
  it('dán TRÀN vào cột Cộng dồn (cột nhập của dòng counter) cũng được đếm', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([
        chiTieu({ code: 'B-1.5', agg_type: 'counter' }),
        chiTieu({ code: 'B-1.6', agg_type: 'counter' }),
      ]),
    })
    await userEvent.click(o('B-1.5', 'Cộng dồn'))
    await userEvent.paste('10\n20\n30\n40\n50')
    expect(screen.getByText('Dán: 3 dòng vượt ngoài bảng')).toBeTruthy()
    expect(chu(o('B-1.6', 'Cộng dồn'))).toBe('20')
  })

  // fix-3 G3 (M24): con số tràn mới chỉ được kiểm ở đúng giá trị 2. Đây là kịch bản hợp đồng nêu
  // tên: danh mục FM01 THẬT, cột "Tháng này" có 52 ô nhập, B-8.1 là ô thứ 43 → còn 10 ô, dán 60
  // dòng thì 50 dòng không đáp xuống đâu cả.
  it('dán 60 dòng từ B-8.1 trên danh mục FM01 thật: báo đúng 50 dòng vượt ngoài bảng', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    await userEvent.click(o('B-8.1', 'Tháng này'))
    await userEvent.paste(Array.from({ length: 60 }, (_, i) => String(i + 1)).join('\n'))
    expect(screen.getByText('Dán: 50 dòng vượt ngoài bảng')).toBeTruthy()
  })

  // fix-3 G4 (M1): ca biên n = 1. `tran > 0` chứ không phải `tran > 1` — dán lố đúng một dòng
  // vẫn là một dòng số của người dùng biến mất.
  it('dán lố ĐÚNG MỘT dòng vẫn phải báo ra', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n20')
    expect(screen.getByText('Dán: 1 dòng vượt ngoài bảng')).toBeTruthy()
  })

  // fix-3 G6 (M25): dòng TRẮNG trong phần tràn cũng phải đếm. `NumberCell` đã cắt sạch dòng trắng
  // ở ĐUÔI trước khi tới `danCot` (fix-1 S5), nên một dòng trắng còn sót lại trong phần tràn nghĩa
  // là sau nó vẫn còn dòng có dữ liệu — người dùng đã dán n dòng, m dòng không đáp xuống đâu cả,
  // trắng hay không cũng vậy.
  it('dòng TRẮNG nằm trong phần tràn vẫn được tính vào số dòng vượt ngoài bảng', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    // 4 dòng: "10" vào B-1.1; ba dòng sau tràn, dòng giữa là dòng TRẮNG.
    await userEvent.paste('10\n20\n\n40')
    expect(screen.getByText('Dán: 3 dòng vượt ngoài bảng')).toBeTruthy()
  })

  // fix-3 G5 (M2): `tranKhiDan` phải THAY THẾ, không cộng dồn (R16 đã khoá điều đó cho
  // `boQuaKhiDan`). Ca theo đúng hợp đồng: dán tràn rồi dán vừa khít.
  it('dán tràn rồi dán lại vừa khít: cảnh báo cũ biến mất', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n20\n30\n40')
    expect(screen.getByText('Dán: 2 dòng vượt ngoài bảng')).toBeTruthy()

    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('10\n20')
    expect(screen.queryByText(/^Dán:/)).toBeNull()
  })

  // …nhưng riêng ca trên KHÔNG đủ giết đột biến cộng dồn: lần dán thứ hai có ghi được ô, mà
  // `nhap-o` cũng đặt `tranKhiDan` về 0 trước khi `dan-xong` chạy — cộng dồn hay thay thế đều ra
  // 0. Đường duy nhất tách hai cơ chế: một lần dán KHÔNG ghi được ô nào (mọi dòng đều bị từ chối)
  // mà vẫn có phần tràn.
  it('hai lần dán liên tiếp đều hỏng-và-tràn: con số là của LẦN NÀY, không phải tổng hai lần', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    // decimals = 0 nên cả "1,5" lẫn "2,5" bị từ chối (không dòng nào được ghi); "3" và "4" tràn.
    const hong = '1,5\n2,5\n3\n4'
    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste(hong)
    const lan1 = screen.getByText(/^Dán: bỏ qua/).textContent
    expect(lan1).toContain('bỏ qua 2 dòng không đọc được (B-1.1, B-1.2)')
    expect(lan1).toContain('2 dòng vượt ngoài bảng')

    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste(hong)
    expect(screen.getByText(/^Dán: bỏ qua/).textContent).toBe(lan1)
  })

  // fix-3 G1 (M28): F2 mới khoá ưu tiên so với "Thiếu n ô bắt buộc". Trên FM01 thật chỉ cần MỘT
  // dòng counter lệch chưa ghi chú là nhánh "bộ đếm lệch" giành chỗ và mọi câu báo dán biến mất —
  // cùng một lỗi S1, chỉ đổi nhánh.
  it('đang có bộ đếm lệch chưa ghi chú mà dán hỏng: câu báo dán vẫn thắng chỗ', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' }), chiTieu({ code: 'B-1.6', agg_type: 'counter' })]),
      values: [
        {
          indicator_code: 'B-1.5',
          counter_check: { status: 'lech', expected: 512.5, message: 'Lệch 12,5 so với công thức' },
        },
      ],
    })
    expect(screen.getByText(/1 bộ đếm lệch công thức chưa có ghi chú/)).toBeTruthy()

    await userEvent.click(o('B-1.5', 'Cộng dồn'))
    await userEvent.paste('1,5\n2,5')
    expect(screen.getByText(/^Dán: bỏ qua 2 dòng không đọc được/)).toBeTruthy()
    expect(screen.queryByText(/bộ đếm lệch công thức chưa có ghi chú/)).toBeNull()
  })

  // fix-2 F2 (R3): luồng phổ biến nhất của người nhập — bấm Nộp, thấy "Thiếu n ô bắt buộc", sang
  // Excel copy, dán. Nếu "Thiếu n ô" giành chỗ thì đúng lỗi S1 quay lại nguyên vẹn.
  it('đã bấm Nộp (đang thiếu ô bắt buộc) rồi mới dán hỏng: câu báo dán KHÔNG bị "Thiếu n ô" nuốt', async () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(screen.getByText(/Thiếu 2 ô bắt buộc/)).toBeTruthy()

    await userEvent.click(o('B-1.1', 'Tháng này'))
    await userEvent.paste('1,5\n2,5')
    expect(screen.getByText(/Dán: bỏ qua 2 dòng không đọc được/)).toBeTruthy()
    expect(screen.queryByText(/Thiếu 2 ô bắt buộc/)).toBeNull()
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
    const ta = oChu('C1 Hoạt động nổi bật trong tháng')
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
    expect(chu(oChu('C1 Hoạt động nổi bật trong tháng'))).toBe('Đã có nội dung')
    unmount()

    ve({
      state: 'submitted',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
      texts: { C1: 'Đã có nội dung' },
    })
    moTabC()
    expect(screen.queryByLabelText('C1 Hoạt động nổi bật trong tháng')).toBeNull()
    expect(screen.getByText('Đã có nội dung')).toBeTruthy()
  })

  // Cột mục lục 176px đã nhường chỗ cho dải chip trong thẻ "Tiến độ nhập" (mockup 04). Câu hỏi
  // ca này hỏi không đổi: chip trỏ tới đích CÓ THẬT, và đích đó là hàng tiêu đề nhóm trong bảng.
  it('chip nhóm trỏ tới đúng id của hàng tiêu đề nhóm, và hàng đó có thật', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const chip = screen.getByRole('link', { name: /^B-8 Quản lý môi trường/ })
    expect(chip.getAttribute('href')).toBe('#B-8')
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

  // Bản vẽ ghi rõ hàng tiêu đề nhóm mang bộ đếm "18 chỉ tiêu" / "18 chỉ tiêu · 1 thiếu".
  it('hàng tiêu đề nhóm đếm ĐỦ số dòng (kể cả dòng tự tính) và số ô bắt buộc còn thiếu', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const hang = document.getElementById('B-1')!
    const soDong = CATALOG.indicators.filter((ct) => ct.section_code === 'B-1').length
    expect(hang.textContent).toContain(`${soDong} chỉ tiêu`)
    // Form trống: mọi ô bắt buộc của nhóm đều thiếu. Con số phải KHỚP với chip cùng nhóm ở dải
    // tiến độ — hai chỗ đếm riêng là cách để một hôm nào đó chúng nói hai điều khác nhau.
    const chip = screen.getByRole('link', { name: /^B-1 / })
    const [daNhap, tong] = chip.textContent!.match(/(\d+)\/(\d+)\s*$/)!.slice(1).map(Number)
    expect(hang.textContent).toContain(`· ${tong - daNhap} thiếu`)
  })

  it('điền đủ ô bắt buộc của một nhóm thì "· n thiếu" của hàng tiêu đề nhóm tự hết', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    expect(document.getElementById('B-1')!.textContent).toContain('· 1 thiếu')
    await userEvent.type(o('B-1.1', 'Tháng này'), '5')
    expect(document.getElementById('B-1')!.textContent).not.toContain('thiếu')
    expect(document.getElementById('B-1')!.textContent).toContain('1 chỉ tiêu')
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

  // fix-1 S8: chỉ có ca MỘT kỳ thiếu thì "lấy kỳ thiếu ĐẦU TIÊN" không được khoá — `kyThieu[0]` và
  // `kyThieu[cuối]` cho cùng kết quả. Với [05, 07] đáp án đúng là 04/2026 (lũy kế dừng NGAY TRƯỚC
  // kỳ thiếu đầu tiên); lấy kỳ cuối sẽ cho 06/2026, tức khai khống hai kỳ chưa duyệt.
  it('thiếu NHIỀU kỳ: lũy kế dừng trước kỳ thiếu ĐẦU TIÊN, không phải kỳ thiếu gần nhất', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: ['2026-05', '2026-07'] })
    expect(screen.getByText(/Lũy kế đã tính tới 04\/2026/)).toBeTruthy()
    expect(screen.queryByText(/Lũy kế đã tính tới 06\/2026/)).toBeNull()
  })

  // Đột biến N9: nhánh `returned` của `mocThoiGian` trả 'Nháp'.
  it('mốc thời gian của dòng meta đi theo ĐÚNG trạng thái đang đứng', () => {
    const { unmount } = ve({ state: 'returned', vai: 'reporter', decision_note: 'x' })
    expect(screen.getByText(/^Trả lại 04\/09\/2026 15:20$/)).toBeTruthy()
    unmount()

    const r2 = ve({ state: 'approved', vai: 'admin' })
    expect(screen.getByText(/^Đã duyệt 04\/09\/2026 15:20$/)).toBeTruthy()
    r2.unmount()

    ve({ state: 'draft', vai: 'reporter' })
    // "Nháp" xuất hiện hai chỗ ở trạng thái này: chip bên phải và mốc thời gian bên trái — đúng
    // như thiết kế, nên đếm chứ không `getByText`.
    expect(screen.getAllByText('Nháp')).toHaveLength(2)
  })

  // Đột biến N5: chip bỏ `is_late`. "Đã nộp" và "Đã nộp (muộn)" là hai câu chuyện khác nhau với
  // người duyệt, và `is_late` là thứ backend tính bằng giờ VN (task 12).
  it('báo cáo nộp muộn: chip nói "Đã nộp (muộn)", không phải "Đã nộp"', () => {
    const { unmount } = ve({ state: 'submitted', vai: 'admin', is_late: true })
    expect(screen.getByText('Đã nộp (muộn)')).toBeTruthy()
    unmount()

    ve({ state: 'submitted', vai: 'admin', is_late: false })
    expect(screen.getByText('Đã nộp')).toBeTruthy()
    expect(screen.queryByText('Đã nộp (muộn)')).toBeNull()
  })

  it('kỳ tháng 1 thì lũy kế tính tới tháng 12 NĂM TRƯỚC', () => {
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const mau = mauNho([chiTieu({ code: 'B-1.1' })])
    veCay(
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

  // P7 (Ruling 427) — CA NÀY PHẢI ĐỔI DỮ LIỆU, không đổi ý định. Bản cũ dựng CẢ NĂM trường null;
  // từ nay cảnh đó ẩn hẳn khối nên ca mất đối tượng đo. Giữ đúng thứ nó đang đo (ô TRỐNG hiện "—"
  // chứ không hiện chuỗi rỗng) bằng cách để `report_no` có giá trị: lúc đó khối vẫn dựng, và bốn ô
  // còn lại là bốn ô trống THẬT. Ca còn CHẮC HƠN bản cũ — nó chốt thêm rằng ô CÓ giá trị thì hiện
  // giá trị, thứ năm-ô-cùng-trống không phân biệt được.
  it('ô phần đầu trống hiện — chứ không hiện chuỗi rỗng', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const mau = mauNho([chiTieu({ code: 'B-1.1' })])
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const { container } = veCay(
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
            report_no: 'DV-2026-08',
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
    const phanDau = [...container.querySelectorAll('.grid-cols-5 > div')]
    expect(phanDau).toHaveLength(5)
    expect(phanDau[0].textContent).toMatch(/DV-2026-08$/)
    for (const d of phanDau.slice(1)) expect(d.textContent).toMatch(/—$/)
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
    expect(resolveCascadeWinner(nguoiNhap.className, 'color')).toBe('text-foreground')
    expect(resolveCascadeWinner(mayTinh.className, 'color')).toBe('text-muted-foreground')
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

  // fix-1 S11: bốn hằng số hình học brief nói thẳng nhưng vòng 1 không ai đo. Dùng
  // `resolveCascadeWinner` (đọc CSS ĐÃ BUILD) chứ không `className.toContain`: mọi utility
  // Tailwind ở đây cùng độ đặc hiệu, lớp đứng sau trong CSS mới thắng — `toContain` trả lời một
  // câu hỏi khác hẳn câu đang hỏi.
  it('khung bảng là hộp cuộn CÓ TRẦN chiều cao — sticky top-0 không dính được trong hộp cao vô hạn', () => {
    const { container } = ve({ state: 'draft', vai: 'reporter' })
    const hop = container.querySelector('table')!.parentElement!
    expect(resolveCascadeWinner(hop.className, 'overflow')).toBe('overflow-auto')
    expect(resolveCascadeWinner(hop.className, 'max-height')).toBe('max-h-[calc(100vh-17rem)]')
  })

  // P3 (final-fix-FE.md, Ruling 425 · final-review-R3-report.md §A1): `bottom-0` đổi thành
  // `bottom-[var(--toast-cao)]`. Đây KHÔNG phải nới lỏng — biến mặc định là `0px` (index.css) nên
  // vị trí nghỉ của thanh không đổi một pixel nào; nó chỉ thêm một đường để thanh LÙI LÊN khi Toast
  // đang chiếm dải đáy, thay vì để Toast nằm đè lên cụm nút suốt 4 giây. Khẳng định vẫn đi qua
  // `resolveCascadeWinner` (đọc CSS ĐÃ BUILD) nên nó vẫn chốt đúng lớp THẮNG cascade, và vẫn đỏ nếu
  // ai đó bỏ `sticky` hay trả `bottom` về một hằng số cứng. Người canh HÌNH HỌC của chính lỗi đó
  // nằm ở e2e (`C-T24/2c`) — jsdom không có layout nên không đo giao hai hộp được.
  it('thanh chế độ dính đáy màn hình (bản vẽ .bar), lùi theo dải Toast', () => {
    ve({ state: 'draft', vai: 'reporter' })
    const thanh = screen.getByRole('button', { name: 'Lưu' }).parentElement!.parentElement!
    expect(resolveCascadeWinner(thanh.className, 'position')).toBe('sticky')
    expect(resolveCascadeWinner(thanh.className, 'bottom')).toBe('bottom-[var(--toast-cao)]')
  })

  it('mọi đích nhảy có scroll-margin-top 80px để không nấp dưới header cột dính', () => {
    ve({ state: 'draft', vai: 'reporter' })
    // 'C' rời danh sách: nhóm C nay là một TAB, không phải một khối để cuộn tới — Radix gỡ nội
    // dung tab không hoạt động khỏi DOM, nên một neo `#C` sẽ trỏ vào chỗ trống quá nửa thời gian.
    for (const id of ['A', 'B-1', 'B-1-1']) {
      const dich = document.getElementById(id)!
      expect(resolveCascadeWinner(dich.className, 'scroll-margin-top')).toBe('scroll-mt-20')
    }
  })

  // Đột biến N6: `soCot` lệch 1 → hàng tiêu đề nhóm không phủ hết chiều ngang bảng.
  it('hàng tiêu đề nhóm phủ ĐÚNG số cột của bảng, kể cả khi có thêm cột Lệch của người duyệt', () => {
    const { unmount } = ve({ state: 'draft', vai: 'reporter' })
    expect(document.getElementById('B-1')!.querySelector('td')!.getAttribute('colspan')).toBe(
      String(screen.getAllByRole('columnheader').length),
    )
    unmount()

    ve({ state: 'submitted', vai: 'admin' })
    expect(document.getElementById('B-1')!.querySelector('td')!.getAttribute('colspan')).toBe(
      String(screen.getAllByRole('columnheader').length),
    )
  })

  // Đột biến N7: bỏ hai dòng chỉnh chiều cao trong `onChange` của textarea. jsdom không có layout
  // nên `scrollHeight` luôn 0 — đo được là "trình xử lý CÓ chạy và CÓ ghi style.height", tức mã
  // tự giãn còn sống; brief đòi thẳng "textarea tự giãn, không thanh cuộn trong ô".
  it('textarea nhóm C tự chỉnh chiều cao theo nội dung khi gõ', async () => {
    ve({ state: 'draft', vai: 'reporter' })
    const ta = oChu('C1 Hoạt động nổi bật trong tháng')
    expect(ta.style.height).toBe('')
    await userEvent.type(ta, 'a')
    expect(ta.style.height).not.toBe('')
  })

  // Đột biến N14: gộp hai trường bằng `acc_prev_entered ?? acc_prev_computed`. Cột này phải chọn
  // theo LOẠI chỉ tiêu, không theo trường nào tình cờ có số — hợp đồng backend hôm nay để trống
  // `acc_prev_entered` ở dòng `sum`, nhưng luật hiển thị không được phụ thuộc vào sự trống đó
  // (mẫu đổi `agg_type` của một chỉ tiêu là đủ để dữ liệu cũ còn số ở cả hai trường).
  it('dòng sum lấy "Lũy kế tháng trước" từ acc_prev_computed kể cả khi acc_prev_entered có số', () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1', agg_type: 'sum' })]),
      values: [{ indicator_code: 'B-1.1', acc_prev_entered: 777, acc_prev_computed: 402100 }],
    })
    expect(o('B-1.1', 'Lũy kế tháng trước').textContent).toBe('402.100')
  })

  // Kế thừa fix-1 S6 / fix-2 F11 (R14) với đích mới. Mục lục cũ phải liệt cả A và C vì nó là lối
  // đi DUY NHẤT tới hai khối đó; dải chip thì không — A là dải đầu luôn nằm trên màn hình, C là
  // một TAB có nhãn riêng. Nên dải chip liệt đúng chín nhóm CÓ trong bảng, và vẫn khoá THỨ TỰ:
  // một dải đảo ngược (B-9 … B-1) vẫn đủ chín chip và vẫn có đủ mã đang tìm ở dưới.
  it('dải chip liệt ĐỦ 9 nhóm có mặt trong bảng, đúng thứ tự, mỗi chip có đích thật', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#B-1', '#B-2', '#B-3', '#B-4', '#B-5', '#B-6', '#B-7', '#B-8', '#B-9',
    ])
    expect(neoHong()).toEqual([])
    // A và C không còn chip, nhưng CHÚNG PHẢI CÒN LỐI ĐI: khối A ở dải đầu, nhóm C sau một tab.
    expect(document.getElementById('A')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Hoạt động nổi bật' })).toBeTruthy()
  })

  // A và C là đích nhảy của TRANG, không phải hàng của bảng: chúng không được sinh hàng tiêu đề
  // rỗng nào trong bảng 53 dòng.
  it('nhóm A và C KHÔNG sinh hàng tiêu đề rỗng trong bảng', () => {
    const { container } = ve({ state: 'draft', vai: 'reporter' })
    const maHangNhom = Array.from(container.querySelectorAll('tbody tr td[colspan]')).map(
      (td) => td.textContent?.split('.')[0],
    )
    expect(maHangNhom).not.toContain('A')
    expect(maHangNhom).not.toContain('C')
    expect(maHangNhom).toHaveLength(9)
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
    const r = veCay(<ReportForm mau={mau} chiTiet={chiTiet} />)
    await userEvent.type(o('B-1.1', 'Tháng này'), '77')
    r.rerender(<ReportForm mau={mau} chiTiet={chiTiet} />)
    await waitFor(() => expect(chu(o('B-1.1', 'Tháng này'))).toBe('77'))
  })
})

// ============================================================ lưu khi rời ô (Task 23)

/** Đồng hồ giả CÓ nhích theo thời gian thật: `userEvent` treo cứng với đồng hồ giả đứng yên (đã
 * đo — click/keyboard không bao giờ resolve). Debounce 1,5 giây vẫn phải do `choDebounce()` đẩy
 * tới, vì không ca test nào chạy thật 1,5 giây. */
function dongHoGia() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
}

function nguoiDung() {
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
}

/** Đẩy qua mốc debounce rồi vét microtask, trong `act` — trạng thái đổi từ callback `setTimeout`
 * và từ `.then` của request, cả hai đều nằm ngoài `act` nếu không bọc. */
async function choDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600)
  })
}

// task-23-carry.md C8: brief liệt ba chuỗi dải đầu nhưng không có ca nào chạm tới `ReportForm`.
// Cả khối này đo ĐƯỜNG THẬT — từ phím gõ trong ô tới thân `PUT` — chứ không đo hook một mình
// (đã có useSaveValues.test.ts) hay prop giả nào.
describe('lưu khi rời ô', () => {
  beforeEach(dongHoGia)

  const MAU_HAI_DONG = () => mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })])
  /** `mauNho` chỉ dựng MỘT ô chữ; FM01 thật có ba. Lấy thẳng `text_fields` của catalog để ca gộp
   * hàng chờ chữ chạy trên đúng số ô mà người nhập gặp. */
  const MAU_BA_O_CHU = () => ({ ...MAU_HAI_DONG(), text_fields: MAU_FM01.text_fields })

  it('rời ô CÓ SỬA thì 1,5 giây sau gửi đúng ô đó kèm version', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.tab()
    expect(putSpy).not.toHaveBeenCalled() // chưa hết debounce: chưa gửi gì

    await choDebounce()
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy.mock.calls[0][0]).toBe('/reports/12/values')
    expect(thanPut(0)).toEqual({ version: 8, values: [{ indicator_code: 'B-1.1', this_period: 12 }] })
  })

  // Cột "Cộng dồn" của dòng `counter` là ô NHẬP và lưu vào `acc_total_entered` (cellPolicy.ts).
  // Đánh dấu nhầm cột là số của "Cộng dồn" chui vào "Tháng này" trên server — không test nào của
  // cột "Tháng này" bắt được.
  it('rời ô "Cộng dồn" gửi acc_total_entered, không gửi nhầm this_period', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-8.1', agg_type: 'counter', name_vi: 'Số ngày không tai nạn' })]),
    })
    await u.click(o('B-8.1', 'Cộng dồn'))
    await u.keyboard('9')
    await u.tab()
    await choDebounce()
    expect(thanPut(0).values).toEqual([{ indicator_code: 'B-8.1', acc_total_entered: 9 }])
  })

  it('Tab ngang qua ô mà không sửa gì thì không gửi request nào', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG(), values: [{ indicator_code: 'B-1.1', this_period: 5 }] })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.tab()
    await choDebounce()
    expect(putSpy).not.toHaveBeenCalled()
  })

  // Không gửi request nào CHÍNH LÀ cách số cũ trên server sống sót — nhưng ca này chỉ khẳng định
  // được vế thứ nhất, nên tên chỉ nói vế thứ nhất.
  it('ô gõ sai (không đọc được số) thì KHÔNG gửi request nào', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG(), values: [{ indicator_code: 'B-1.1', this_period: 5 }] })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('abc')
    await u.tab()
    await choDebounce()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('dán một cột đánh dấu HẾT các dòng đã ghi, không chỉ ô đang đứng', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' }), chiTieu({ code: 'B-1.3' })]),
    })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.paste('10\n20\n30')
    await choDebounce()
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(thanPut(0).values).toEqual([
      { indicator_code: 'B-1.1', this_period: 10 },
      { indicator_code: 'B-1.2', this_period: 20 },
      { indicator_code: 'B-1.3', this_period: 30 },
    ])
  })

  // Ghi chú của dòng THỨ HAI, không phải dòng đầu: mã chỉ tiêu phải đi theo đúng dòng người dùng
  // gõ, không phải một mã viết cứng.
  it('sửa ghi chú rồi rời ô thì gửi note kèm đúng mã dòng; Tab ngang qua ghi chú không đổi thì không gửi', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: MAU_HAI_DONG(),
      values: [{ indicator_code: 'B-1.1', note: 'Ghi chú cũ' }],
    })
    await u.click(screen.getByLabelText(/^B-1\.1 .+, Ghi chú$/))
    await u.tab()
    await choDebounce()
    expect(putSpy).not.toHaveBeenCalled()

    await u.click(screen.getByLabelText(/^B-1\.2 .+, Ghi chú$/))
    await u.keyboard('Bộ đếm lệch do chuyển ca')
    await u.tab()
    await choDebounce()
    expect(thanPut(0).values).toEqual([{ indicator_code: 'B-1.2', note: 'Bộ đếm lệch do chuyển ca' }])
  })

  it('dán vào cột "Cộng dồn" gửi acc_total_entered cho từng dòng, không gửi this_period', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([
        chiTieu({ code: 'B-8.1', agg_type: 'counter', name_vi: 'Số ngày không tai nạn' }),
        chiTieu({ code: 'B-8.2', agg_type: 'counter', name_vi: 'Số giờ không tai nạn' }),
      ]),
    })
    await u.click(o('B-8.1', 'Cộng dồn'))
    await u.paste('10\n20')
    await choDebounce()
    expect(thanPut(0).values).toEqual([
      { indicator_code: 'B-8.1', acc_total_entered: 10 },
      { indicator_code: 'B-8.2', acc_total_entered: 20 },
    ])
  })

  // Một dòng gọi `useSaveValues(chiTiet.id, chiTiet.version)` — hai nửa, cả hai đều từng có đột
  // biến sống. N18: `12` viết cứng (mọi báo cáo khác #12 ghi đè lên #12). C19-vòng-2 (C8): `8`
  // viết cứng (mọi báo cáo thật bắt đầu từ version 1 nên dính 409 GIẢ ngay lần lưu đầu — banner
  // vàng "Người khác vừa sửa", lượt lưu không lên server, bấm "Nộp" bị chặn). Cả hai fixture cũ
  // đều cố định id 12 / version 8 nên không ca nào bắt được. Ca này đặt CẢ HAI khác mặc định.
  it('gửi tới ĐÚNG báo cáo và ĐÚNG version của báo cáo đó, không phải số viết cứng', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', id: 77, version: 3, mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('5')
    await u.tab()
    await choDebounce()
    expect(putSpy.mock.calls[0][0]).toBe('/reports/77/values')
    expect(thanPut(0)).toEqual({ version: 3, values: [{ indicator_code: 'B-1.1', this_period: 5 }] })
  })

  // N16 của người soát: gửi `0` thay `null` vẫn xanh, vì khoá duy nhất cho hành vi này nằm ở mức
  // hook (gọi thẳng `markDirty`, không đi qua `parseViNumber` lẫn `roiO`). Backend BỎ QUA `null`
  // nhưng GHI THẬT số 0 — ô trống hoá thành 0 rồi chui vào mọi dòng tổng.
  it('xoá trắng một ô có sẵn số thì gửi this_period null, KHÔNG gửi 0 và không bỏ khoá', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: MAU_HAI_DONG(),
      values: [{ indicator_code: 'B-1.1', this_period: 5 }],
    })
    await u.clear(o('B-1.1', 'Tháng này'))
    await u.tab()
    await choDebounce()
    expect(thanPut(0).values).toEqual([{ indicator_code: 'B-1.1', this_period: null }])
  })

  // N14 của người soát: đánh dấu CẢ dòng bị bỏ qua vẫn xanh — mọi ca dán hiện có đều dán toàn dòng
  // đọc được. Dòng rác bị đánh dấu là nó đi kèm `this_period: null`, tức xoá trắng số cũ vì một ô
  // rác trong vùng copy (đúng lớp lỗi fix-1 S5 của Task 22 đã diệt một lần ở tầng hiển thị).
  it('dán cột có dòng RÁC: dòng đó không vào thân request, hai dòng đọc được vẫn đi', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' }), chiTieu({ code: 'B-1.3' })]),
      values: [{ indicator_code: 'B-1.2', this_period: 5 }],
    })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.paste('10\n???\n30')
    await choDebounce()
    expect(thanPut(0).values).toEqual([
      { indicator_code: 'B-1.1', this_period: 10 },
      { indicator_code: 'B-1.3', this_period: 30 },
    ])
    // Ô đích của dòng rác giữ nguyên số cũ trên màn hình, đúng như câu báo dưới thanh nói.
    expect(chu(o('B-1.2', 'Tháng này'))).toBe('5')
  })

  // N19 của người soát: `ghiChu.trim()` vẫn xanh. Ghi chú là câu người nhập viết, không phải mã —
  // form không có quyền sửa chữ của họ trước khi gửi.
  it('ghi chú gửi NGUYÊN VĂN, không tự cắt khoảng trắng hai đầu', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG() })
    await u.click(screen.getByLabelText(/^B-1\.1 .+, Ghi chú$/))
    await u.keyboard('  Nghỉ lễ 02/09  ')
    await u.tab()
    await choDebounce()
    expect(thanPut(0).values).toEqual([{ indicator_code: 'B-1.1', note: '  Nghỉ lễ 02/09  ' }])
  })

  // Trước vòng sửa 1 của Task 24, ba ô chữ nhóm C KHÔNG có đường nào lên tới server: gõ xong, dải
  // đầu báo "Đã lưu 14:02", đóng tab là mất sạch. Backend nhận `texts` trong CHÍNH endpoint này từ
  // Task 23b (`PutValuesIn.texts`) đúng để một lượt lưu là MỘT version, MỘT dòng audit.
  it('gõ ô chữ nhóm C rồi rời ô: 1,5 giây sau gửi texts của đúng mã đó', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG() })
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('Diễn tập PCCC ngày 12/08')
    await u.tab()
    await choDebounce()
    expect(thanPut(0).texts).toEqual({ C1: 'Diễn tập PCCC ngày 12/08' })
    expect(thanPut(0).values).toEqual([])
  })

  it('Tab ngang qua ô chữ mà không sửa gì thì không gửi request nào', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG(), texts: { C1: 'Câu đã lưu từ trước' } })
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.tab()
    await choDebounce()
    expect(putSpy).not.toHaveBeenCalled()
  })

  // fix-3 L4 (R3): XOÁ SẠCH một ghi chú cũng là một lần sửa. Nếu ô rỗng bị coi là "không đổi" thì
  // người nhập xoá câu giải thích bộ đếm lệch đã lỗi thời, dải đầu vẫn báo "Đã lưu 14:02", và tải
  // lại trang thì câu cũ quay về.
  it('xoá sạch ô "Ghi chú" vẫn lên tới server, gửi note rỗng', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      version: 8,
      mau: MAU_HAI_DONG(),
      values: [{ indicator_code: 'B-1.1', note: 'Ca đêm bù giờ' }],
    })
    await u.clear(o('B-1.1', 'Ghi chú'))
    await u.tab()
    await choDebounce()
    expect(thanPut(0)).toEqual({ version: 8, values: [{ indicator_code: 'B-1.1', note: '' }] })
  })

  // fix-3 L5 (R4): y hệt L4 cho ba ô chữ nhóm C. Backend `593d933`/`08b81eb` vừa mở đường cho ca
  // này (chuẩn hoá `''` → `NULL` trong `report_text`); phía FE mà bỏ qua ô rỗng thì đường đó không
  // bao giờ có ai đi.
  it('xoá sạch ô chữ nhóm C vẫn lên tới server, gửi texts rỗng', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      version: 8,
      mau: MAU_HAI_DONG(),
      texts: { C1: 'Câu cũ đã lỗi thời' },
    })
    await u.clear(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.tab()
    await choDebounce()
    expect(thanPut(0)).toEqual({ version: 8, values: [], texts: { C1: '' } })
  })

  // fix-3 L6 (R5): FM01 có ĐÚNG ba ô chữ và người nhập điền liền tay cả ba. Hàng chờ chữ phải gộp,
  // không phải "ô cuối cùng thắng" — mất hai ô đầu thì không có gì trên màn hình nói ra.
  it('hai ô chữ nhóm C đổi trong CÙNG một cửa sổ debounce thì cả hai vào một PUT', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_BA_O_CHU() })
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('Diễn tập PCCC')
    await u.click(oChu('C2 Hoạt động dự kiến cho tháng tới'))
    await u.keyboard('Huấn luyện cứu hộ')
    await u.tab()
    await choDebounce()
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(thanPut(0).texts).toEqual({ C1: 'Diễn tập PCCC', C2: 'Huấn luyện cứu hộ' })
  })

  it('ô số và ô chữ đổi cùng lúc đi CHUNG một PUT, cùng một version', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    // Rời ô số TRƯỚC khi sang tab khác: mở tab "Hoạt động nổi bật" gỡ cả bảng khỏi DOM, và một ô
    // bị gỡ lúc còn focus thì không bắn `blur`. Ca này vì thế đo thêm được một điều thật: hàng chờ
    // lưu sống qua một lượt đổi tab.
    await u.tab()
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('Có diễn tập')
    await u.tab()
    await choDebounce()
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(thanPut(0)).toEqual({
      version: 8,
      values: [{ indicator_code: 'B-1.1', this_period: 12 }],
      texts: { C1: 'Có diễn tập' },
    })
  })

  // `texts` VẮNG MẶT nghĩa là "lượt ghi này không đụng `report_text`" (PutValuesIn); gửi `{}` là
  // một lượt ghi rỗng vào bảng đó — hai chuyện khác nhau trong audit.
  it('không đụng ô chữ nào thì thân request KHÔNG có khoá texts', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.tab()
    await choDebounce()
    expect('texts' in thanPut(0)).toBe(false)
  })

  it('Ctrl+S (không có onLuu) gửi NGAY và huỷ luôn lượt hẹn đang chờ', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('7')
    await u.tab()
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(1) // chưa qua 1,5 s

    await choDebounce()
    expect(putSpy).toHaveBeenCalledTimes(1) // hẹn cũ đã bị huỷ, không có PUT thứ hai
  })

  // fix-2 K1. Ba ca dưới đây đi ĐÚNG đường người cẩn thận đi: gõ xong là bấm Ctrl+S ngay, KHÔNG
  // rời ô. Cả ba loại ô chỉ đẩy giá trị vào hàng chờ lúc `onBlur`, nên trước K1 lượt Ctrl+S đó gửi
  // một `PUT` KHÔNG có ô vừa gõ rồi dải đầu báo "Đã lưu HH:MM" — màn hình nói đã lưu trong khi
  // server chưa hề thấy con số ấy. Khẳng định phải nhìn vào THÂN request, không nhìn số lần gọi:
  // `PUT` vẫn bắn ra như cũ, chỉ thiếu ruột.
  it('Ctrl+S khi CHƯA rời ô số: thân PUT có ngay ô đang gõ dở', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.keyboard('{Control>}s{/Control}')
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(thanPut(0)).toEqual({ version: 8, values: [{ indicator_code: 'B-1.1', this_period: 12 }] })
  })

  it('Ctrl+S khi CHƯA rời ô "Ghi chú": thân PUT có ngay câu đang gõ dở', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Ghi chú'))
    await u.keyboard('bù giờ ca đêm')
    await u.keyboard('{Control>}s{/Control}')
    expect(thanPut(0)).toEqual({ version: 8, values: [{ indicator_code: 'B-1.1', note: 'bù giờ ca đêm' }] })
  })

  it('Ctrl+S khi CHƯA rời ô chữ nhóm C: thân PUT có ngay khoá texts', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('Có diễn tập')
    await u.keyboard('{Control>}s{/Control}')
    expect(thanPut(0)).toEqual({ version: 8, values: [], texts: { C1: 'Có diễn tập' } })
  })

  // Ctrl+S là cử chỉ GIỮA CHỪNG. Chốt ô bằng `blur()` mà không trả focus lại thì focus rơi về
  // `<body>`, và người đang nhập 55 dòng mất luôn Enter/mũi tên/Tab ngay sau cú lưu.
  //
  // fix-3 L3: ô đo là dòng THỨ HAI, có chủ ý. Ca cũ đo ở B-1.1 — đúng là `<input>` đầu tiên của
  // trang — nên nó xanh cả với một bản "trả focus về ô ĐẦU BẢNG". Lỗi đó nếu sống thật: Ctrl+S ở
  // dòng 40 ném focus lên dòng 1, gõ tiếp là ghi đè số của dòng 1.
  it('Ctrl+S không cướp focus khỏi ô đang gõ (ô ở dòng thứ hai, không phải ô đầu trang)', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    const oB = o('B-1.2', 'Tháng này')
    expect(document.querySelector('input')).not.toBe(oB)
    await u.click(oB)
    await u.keyboard('12')
    await u.keyboard('{Control>}s{/Control}')
    expect(document.activeElement).toBe(oB)
  })

  // `flushSync` trong `chotODangGo` là thứ duy nhất giữ được ca này: không ép vẽ lại giữa `blur()`
  // và `focus()` thì `NumberCell` nhận lại focus với `error` CŨ (còn null), nhánh "giữ nguyên chữ
  // người dùng đã gõ" (fix-1 S3) không chạy, và chữ "12a" bị thay bằng giá trị cũ của ô.
  it('Ctrl+S khi ô đang giữ chữ không phải số: giữ nguyên chữ đó, không gửi gì', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MAU_HAI_DONG() })
    const oB = o('B-1.1', 'Tháng này')
    await u.click(oB)
    await u.keyboard('12a')
    await u.keyboard('{Control>}s{/Control}')
    expect(chu(oB)).toBe('12a')
    expect(oB.getAttribute('aria-invalid')).toBe('true')
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('nút Lưu (không có onLuu) cũng gửi ngay', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_HAI_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('7')
    await u.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(putSpy).toHaveBeenCalledTimes(1)
  })
})

describe('dải đầu — trạng thái lưu', () => {
  beforeEach(dongHoGia)

  const MAU_BA_DONG = () =>
    mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' }), chiTieu({ code: 'B-1.3' })])

  async function goVao(u: ReturnType<typeof nguoiDung>, ma: string, so: string) {
    await u.click(o(ma, 'Tháng này'))
    await u.keyboard(so)
    await u.tab()
  }

  it('chưa đụng vào form thì KHÔNG có dòng trạng thái lưu nào', () => {
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    expect(screen.queryByText(/Đang lưu|Đã lưu|Chưa lưu/)).toBeNull()
  })

  it('còn ô chưa lưu thì hiện "Chưa lưu (n ô)" với ĐÚNG n, màu cảnh báo', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    await goVao(u, 'B-1.2', '2')
    await goVao(u, 'B-1.3', '3')
    const dong = screen.getByText('Chưa lưu (3 ô)')
    expect(resolveCascadeWinner(dong.className, 'color')).toBe('text-warning-foreground')
    // Đột biến N9 của người soát (bỏ `role="status"`) sống ở vòng soát: người đọc màn hình không
    // bao giờ nghe "Đang lưu…"/"Đã lưu 14:02" — mà chính chú thích tại chỗ khai đó là lý do đặt role.
    expect(screen.getByRole('status').textContent).toBe('Chưa lưu (3 ô)')
  })

  // Ô chữ nhóm C cũng là thứ đóng tab sẽ mất, nên nó phải được ĐẾM — không đếm thì dải đầu nói
  // "Đã lưu 14:02" trong lúc phần nhận xét vừa gõ còn nằm nguyên trong trình duyệt.
  it('ô chữ nhóm C cũng tính vào "Chưa lưu (n ô)"', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('Có diễn tập')
    await u.tab()
    expect(screen.getByText('Chưa lưu (2 ô)')).toBeTruthy()
  })

  // fix-3 L10 (R15): ca ngay trên chỉ làm bẩn MỘT ô chữ, nên một bản "mọi ô chữ đang chờ tính là
  // một" vẫn ra đúng con số. Ô chữ là thứ dài nhất người ta gõ trong form này — đếm thiếu là nói
  // giảm đúng khối lượng có thể mất khi đóng tab.
  it('hai ô chữ nhóm C bẩn thì đếm là HAI ô, không gộp thành một', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: { ...MAU_BA_DONG(), text_fields: MAU_FM01.text_fields },
    })
    await u.click(oChu('C1 Hoạt động nổi bật trong tháng'))
    await u.keyboard('Có diễn tập')
    await u.click(oChu('C2 Hoạt động dự kiến cho tháng tới'))
    await u.keyboard('Sẽ huấn luyện cứu hộ')
    await u.tab()
    expect(screen.getByText('Chưa lưu (2 ô)')).toBeTruthy()
  })

  it('đang gửi thì hiện "Đang lưu…"', async () => {
    putSpy.mockReturnValueOnce(new Promise(() => {})) // treo: đo đúng lúc request còn bay
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    await choDebounce()
    expect(screen.getByText('Đang lưu…')).toBeTruthy()
    expect(screen.queryByText(/Chưa lưu/)).toBeNull()
  })

  it('lưu xong thì hiện "Đã lưu 14:02" theo giờ Việt Nam', async () => {
    vi.setSystemTime(new Date('2026-09-20T07:02:00Z')) // 14:02 giờ VN
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    await choDebounce()
    expect(screen.getByText('Đã lưu 14:02')).toBeTruthy()
    expect(screen.queryByText(/Chưa lưu/)).toBeNull()
  })

  // N17 của người soát: thu hẹp nhánh `Đang lưu…` về `savedAt === null` vẫn xanh, vì ca trên chỉ
  // đo lần lưu ĐẦU. Từ lần thứ hai trở đi dải đầu sẽ đứng ở "Đã lưu 14:02" cũ suốt lúc đang gửi.
  it('lần lưu THỨ HAI cũng hiện "Đang lưu…", không đứng ở "Đã lưu" cũ', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    await choDebounce()
    expect(screen.getByText(/^Đã lưu /)).toBeTruthy()

    putSpy.mockReturnValueOnce(new Promise(() => {})) // lượt hai treo
    await goVao(u, 'B-1.2', '2')
    await choDebounce()
    expect(screen.getByText('Đang lưu…')).toBeTruthy()
    expect(screen.queryByText(/Đã lưu/)).toBeNull()
  })

  // F1 của vòng sửa 1: lượt `GET /reports/{id}` sau mỗi lần lưu hỏng thì KHÔNG được phá màn hình —
  // trang nói ra ở đúng dải này. Đường đi thật (trang tự bắt lỗi refetch) đo ở ReportDetail.test.tsx.
  it('lượt làm mới nền hỏng thì dải đầu nói ra, và câu đó thắng "Đã lưu 14:02"', async () => {
    const u = nguoiDung()
    const r = ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    await choDebounce()
    expect(screen.getByText(/^Đã lưu /)).toBeTruthy()

    r.batLoiLamMoi()
    const dong = screen.getByText('Không làm mới được số liệu')
    expect(resolveCascadeWinner(dong.className, 'color')).toBe('text-warning-foreground')
    expect(screen.queryByText(/Đã lưu/)).toBeNull()
  })

  // Câu này KHÔNG chờ có lần lưu nào mới nói: thu hẹp nhánh về `savedAt !== null` vẫn xanh ở hai
  // ca trên (cả hai đều lưu trước). Với `refetchOnWindowFocus`, chỉ cần rời tab rồi quay lại lúc
  // Render đang ngủ — chưa gõ gì cả — là màn hình đã đứng số cũ mà không câu nào nói.
  it('làm mới hỏng TRƯỚC lần lưu đầu tiên cũng nói ra, không chờ có "Đã lưu" mới nói', () => {
    const r = ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    r.batLoiLamMoi()
    expect(screen.getByText('Không làm mới được số liệu')).toBeTruthy()
  })

  // …nhưng KHÔNG được thắng "Chưa lưu (n ô)": ô chưa lên tới server là nguy cơ mất số, còn lượt
  // làm mới hỏng thì không mất gì của người dùng.
  it('còn ô chưa lưu thì "Chưa lưu" vẫn thắng câu làm mới hỏng', async () => {
    const u = nguoiDung()
    const r = ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    r.batLoiLamMoi()
    await goVao(u, 'B-1.1', '1')
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    expect(screen.queryByText('Không làm mới được số liệu')).toBeNull()
  })

  it('gõ tiếp sau khi đã lưu thì quay lại "Chưa lưu", không giữ "Đã lưu"', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MAU_BA_DONG() })
    await goVao(u, 'B-1.1', '1')
    await choDebounce()
    await goVao(u, 'B-1.2', '2')
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    expect(screen.queryByText(/Đã lưu/)).toBeNull()
  })
})

describe('phản hồi PUT vẽ lại cột chỉ đọc (C9)', () => {
  beforeEach(dongHoGia)

  it('dòng tự tính đổi số sau khi lưu, lấy từ values của phản hồi', async () => {
    const u = nguoiDung()
    const mau = mauNho([
      chiTieu({ code: 'B-1.1', name_vi: 'Giờ công nhân viên', decimals: 0 }),
      chiTieu({ code: 'B-1.4', name_vi: 'Tổng giờ công', agg_type: 'computed', formula: 'B-1.1,B-1.2,B-1.3', decimals: 0 }),
      chiTieu({ code: 'B-1.5', name_vi: 'Giờ công nhà thầu phụ', agg_type: 'computed', formula: 'B-1.1', decimals: 0 }),
    ])
    // NHIỀU dòng, không phải một: `ghi_gia_tri` trả TRỌN danh sách đã tính lại (55 dòng ở FM01
    // thật). Fixture một dòng để `h.values.slice(0, 1)` sống — đúng đột biến N3 của người soát, và
    // khi đó mọi dòng `computed`/lũy kế/`Lệch` trừ dòng đầu đứng số cũ ngay cạnh chữ "Đã lưu".
    putSpy.mockResolvedValueOnce({
      version: 9,
      values: [
        giaTri({ indicator_code: 'B-1.4', this_period: 402_100, acc_total_computed: 402_100 }),
        giaTri({ indicator_code: 'B-1.5', this_period: 12, acc_total_computed: 30 }),
      ],
    })
    ve({ state: 'draft', vai: 'reporter', mau })
    // Trước khi lưu: không có bản sao `evaluate_computed` nào ở TypeScript nên dòng tổng còn trống.
    expect(o('B-1.4', 'Tháng này').textContent).toBe('—')
    expect(o('B-1.5', 'Tháng này').textContent).toBe('—')

    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('402100')
    await u.tab()
    await choDebounce()
    expect(o('B-1.4', 'Tháng này').textContent).toBe('402.100')
    expect(o('B-1.4', 'Cộng dồn').textContent).toBe('402.100')
    // Dòng CUỐI của phản hồi cũng phải được vá, không riêng dòng đầu.
    expect(o('B-1.5', 'Tháng này').textContent).toBe('12')
    expect(o('B-1.5', 'Cộng dồn').textContent).toBe('30')
    // Ô người dùng đang gõ KHÔNG bị phản hồi đè lên (phản hồi không hề nhắc tới B-1.1).
    expect(chu(o('B-1.1', 'Tháng này'))).toBe('402.100')
  })

  // N4 của người soát: bỏ `version` khỏi nhánh `gia-tri-server` vẫn xanh, vì không ca nào đọc
  // `version` SAU một lần lưu thành công. Hệ quả: banner 409 về sau đọc sai mốc phiên bản.
  it('version của phản hồi vào luôn state: banner 409 sau đó đọc mốc MỚI, không phải mốc lúc mở form', async () => {
    const u = nguoiDung()
    const mau = mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })])
    ve({ state: 'draft', vai: 'reporter', version: 8, mau })

    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('1')
    await u.tab()
    await choDebounce() // phản hồi mặc định: version 9

    putSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Người khác vừa sửa báo cáo này',
        state: 'draft',
        version: 11,
        values: [giaTri({ indicator_code: 'B-1.2' })],
      }),
    )
    await u.click(o('B-1.2', 'Tháng này'))
    await u.keyboard('2')
    await u.tab()
    await choDebounce()
    expect((await screen.findByRole('alert')).textContent).toContain('phiên bản 9 → 11')
  })
})

describe('đường lỗi của lớp lưu', () => {
  beforeEach(dongHoGia)

  async function goRoiCho(u: ReturnType<typeof nguoiDung>) {
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.tab()
    await choDebounce()
  }

  it('mất mạng: banner offline, số vẫn nằm trên màn hình và vẫn là "Chưa lưu"', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]) })
    await goRoiCho(u)
    expect(screen.getByText(/Mất kết nối/).textContent).toContain('sẽ tự gửi lại khi có mạng')
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    expect(chu(o('B-1.1', 'Tháng này'))).toBe('12')
  })

  it('có mạng trở lại thì tự gửi lại, banner offline biến mất', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]) })
    await goRoiCho(u)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(putSpy).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Mất kết nối/)).toBeNull()
  })

  it('lỗi server KHÔNG phải xung đột: hiện nguyên văn detail, không đổi thành câu tự chế', async () => {
    putSpy.mockRejectedValueOnce(new ApiError(403, { detail: 'Báo cáo ở trạng thái không cho sửa' }))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2' })]) })
    await goRoiCho(u)
    expect(screen.getByText(/Báo cáo ở trạng thái không cho sửa/)).toBeTruthy()
    expect(screen.queryByText(/Mất kết nối/)).toBeNull()
  })

  it('409 từ chính lượt lưu: banner vàng, cột chỉ đọc vá theo server, ô đang gõ giữ nguyên', async () => {
    putSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Người khác vừa sửa báo cáo này',
        state: 'draft',
        version: 11,
        values: [
          giaTri({ indicator_code: 'B-1.4', this_period: 777 }),
          giaTri({ indicator_code: 'B-2.1', this_period: 888 }),
        ],
      }),
    )
    const u = nguoiDung()
    const mau = mauNho([
      chiTieu({ code: 'B-1.1' }),
      chiTieu({ code: 'B-1.4', name_vi: 'Tổng giờ công', agg_type: 'computed', formula: 'B-1.1', decimals: 0 }),
      chiTieu({ code: 'B-2.1', name_vi: 'Giờ công nhà thầu', agg_type: 'computed', formula: 'B-1.1', decimals: 0 }),
    ])
    ve({ state: 'draft', vai: 'reporter', version: 8, mau })
    await goRoiCho(u)

    const bao = await screen.findByRole('alert')
    // "Vàng" phải đo trên CSS đã build như mọi khẳng định màu khác của file này, không đọc tên lớp.
    expect(resolveCascadeWinner(bao.closest('div')!.className, 'background-color')).toBe('bg-warning-bg')
    expect(bao.textContent).toContain('Người khác vừa sửa báo cáo này')
    expect(bao.textContent).toContain('phiên bản 8 → 11')
    expect(o('B-1.4', 'Tháng này').textContent).toBe('777')
    // Thân 409 thật mang TRỌN bảng: dòng cuối cũng phải được vá, không riêng dòng đầu (N20).
    expect(o('B-2.1', 'Tháng này').textContent).toBe('888')
    expect(chu(o('B-1.1', 'Tháng này'))).toBe('12')
    // Ô vẫn nằm trong hàng chờ: bấm Lưu lần nữa là gửi lại với version mới.
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(thanPut(1)).toEqual({ version: 11, values: [{ indicator_code: 'B-1.1', this_period: 12 }] })
  })
})

describe('Nộp luôn lưu trước rồi mới chuyển trạng thái', () => {
  beforeEach(dongHoGia)

  // task-24-carry.md C-T23a: ô cuối người dùng gõ trước khi bấm "Nộp" gần như luôn còn trong cửa
  // sổ debounce 1,5 giây. PUT phải đi TRƯỚC `POST .../transition`, nếu không báo cáo được nộp
  // THIẾU đúng con số vừa gõ và không ai biết. Ca này đo cả hai đầu: thân PUT có ô đó, và thứ tự
  // hai lời gọi mạng.
  it('bấm Nộp khi còn ô chưa lưu: PUT đi trước, POST transition đi sau', async () => {
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
    })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    await screen.findByRole('dialog')
    await u.click(nutHop('Nộp'))

    expect(thanPut(0).values).toEqual([{ indicator_code: 'B-1.1', this_period: 12 }])
    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(putSpy.mock.invocationCallOrder[0]).toBeLessThan(postSpy.mock.invocationCallOrder[0])
  })

  // Lưu chạy TRƯỚC khi hộp thoại mở, không phải sau khi xác nhận: người dùng thấy câu "Sau khi nộp
  // bạn không sửa được" thì số của họ đã lên tới server rồi. Nếu lượt lưu đó hỏng thì hộp thoại
  // KHÔNG được mở ra (ca "lưu hỏng" ngay dưới).
  it('PUT chạy ngay lúc bấm nút, TRƯỚC khi hộp thoại xác nhận mở ra', async () => {
    // Giữ PUT TREO rồi mới đo: đây là thứ phân biệt "lưu xong mới hỏi" với "hỏi trước, lưu sau".
    // Bản cũ của ca này chỉ đọc trạng thái cuối (hộp thoại có, PUT 1 lần, POST chưa gọi) — đúng ở
    // CẢ HAI thứ tự, nên nó mù đúng với đột biến mang tên nó (người soát, S15).
    let traLoi: (v: unknown) => void = () => {}
    putSpy.mockImplementationOnce(() => new Promise((res) => { traLoi = res }))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()

    await act(async () => {
      traLoi({ version: 9, values: [] })
    })
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(postSpy).not.toHaveBeenCalled()
  })

  // task-24-carry.md C-T23a nói "409 HOẶC mạng", nhưng vòng 1 chỉ có ca cho nhánh mạng — đột biến
  // "409 lúc lưu vẫn coi là lưu xong" của người soát (N28) SỐNG. Nếu nó sống thật: người nộp gõ ô
  // cuối, lượt lưu bị 409, và báo cáo VẪN được nộp bằng số chưa lên tới server.
  it('lượt lưu bị 409 thì KHÔNG mở hộp thoại và KHÔNG nộp', async () => {
    putSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Người khác vừa sửa báo cáo này',
        state: 'draft',
        version: 11,
        values: [],
      }),
    )
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(postSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/Người khác vừa sửa báo cáo này/)).toBeTruthy()
  })

  // N8 của người soát: thu hẹp "lưu trước" về riêng `submit` vẫn xanh. Danh sách chuyển trạng thái
  // đến từ `GET /templates/{code}` — mẫu thứ hai có thể đặt tên và mã hành động khác hẳn, nên form
  // KHÔNG được rẽ nhánh theo `action_code`. Bộ chuyển dưới đây cố tình không phải bộ seed.
  const MAU_DUYET_TU_NHAP = () => ({
    ...mauNho([chiTieu({ code: 'B-1.1' })]),
    transitions: [
      { action_code: 'approve', from_state: 'draft', to_state: 'approved', name_vi: 'Duyệt', required_permission: 'report.approve', requires_note: false },
    ],
  })

  it('chuyển trạng thái KHÁC "Nộp" cũng lưu trước rồi mới transition', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'admin', mau: MAU_DUYET_TU_NHAP() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Duyệt' }))
    await screen.findByRole('dialog')
    await u.click(nutHop('Duyệt'))

    expect(thanPut(0).values).toEqual([{ indicator_code: 'B-1.1', this_period: 12 }])
    expect(putSpy.mock.invocationCallOrder[0]).toBeLessThan(postSpy.mock.invocationCallOrder[0])
  })

  it('chuyển trạng thái KHÁC "Nộp" mà lưu hỏng thì cũng dừng', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'admin', mau: MAU_DUYET_TU_NHAP() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Duyệt' }))
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('lưu hỏng thì KHÔNG chuyển trạng thái — nộp bằng số chưa lên server là nộp thiếu', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const u = nguoiDung()
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' })]),
    })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(postSpy).not.toHaveBeenCalled()
  })
})

// ============================================================ hộp thoại chuyển trạng thái (Task 24)
//
// Đường đi đầy đủ: bấm nút ở thanh dính → lưu → hộp thoại xác nhận → `POST .../transition`.
// Khối này đo từ cú bấm tới THÂN REQUEST và tới BANNER lỗi, không đo prop giả nào — Task 24 đã bỏ
// hẳn prop `onChuyenTrangThai`/`xungDot` của Task 22 (task-24-carry.md C-T23b).

describe('hộp thoại chuyển trạng thái', () => {
  beforeEach(dongHoGia)

  const MOT_DONG = () => mauNho([chiTieu({ code: 'B-1.1' })])
  const DA_DIEN = [{ indicator_code: 'B-1.1', this_period: 5 }]

  /** Mở hộp thoại của một nút ở thanh dính rồi trả về chính hộp thoại đó. */
  async function moHop(u: ReturnType<typeof nguoiDung>, tenNut: string): Promise<HTMLElement> {
    await u.click(screen.getByRole('button', { name: tenNut }))
    return screen.findByRole('dialog')
  }

  it('Nộp: hộp thoại nêu đúng kỳ, đơn vị và hậu quả (spec dòng 682)', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    const hop = await moHop(u, 'Nộp báo cáo')
    expect(hop.textContent).toContain('Nộp báo cáo 08/2026 của PTSC Miền Trung?')
    expect(hop.textContent).toContain('Sau khi nộp bạn không sửa được cho tới khi Ban ATCL trả lại.')
    // Không phải thao tác `requires_note` thì KHÔNG có ô lý do nào.
    expect(within(hop).queryByRole('textbox')).toBeNull()
  })

  it('Duyệt: hộp thoại nêu hậu quả "vào tổng toàn Tổng công ty"', async () => {
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', mau: MOT_DONG(), values: DA_DIEN })
    const hop = await moHop(u, 'Duyệt')
    expect(hop.textContent).toContain('Duyệt báo cáo này?')
    expect(hop.textContent).toContain('Số liệu sẽ vào tổng toàn Tổng công ty.')
  })

  // task-24-carry.md C8: brief không có ca nào kiểm câu chữ của Trả lại / Mở lại.
  it('Trả lại: nhãn ô lý do đúng nguyên văn spec và nút chính là nút danger', async () => {
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', mau: MOT_DONG(), values: DA_DIEN })
    const hop = await moHop(u, 'Trả lại…')
    expect(hop.textContent).toContain('Trả lại báo cáo')
    expect(within(hop).getByLabelText('Lý do trả lại (người nộp sẽ thấy nguyên văn)')).toBeTruthy()
    expect(resolveCascadeWinner(nutHop('Trả lại').className, 'background-color')).toBe('bg-destructive')
  })

  it('Mở lại: cũng bắt nhập lý do, và nêu hậu quả "rời khỏi tổng"', async () => {
    const u = nguoiDung()
    ve({ state: 'approved', vai: 'admin', mau: MOT_DONG(), values: DA_DIEN })
    const hop = await moHop(u, 'Mở lại…')
    expect(hop.textContent).toContain('Số liệu sẽ rời khỏi tổng cho tới khi duyệt lại')
    expect(within(hop).getByRole('textbox')).toBeTruthy()
    expect(nutHop('Mở lại').hasAttribute('disabled')).toBe(true)
  })

  it('xác nhận Nộp gửi đúng thân transition tới đúng báo cáo', async () => {
    const u = nguoiDung()
    ve({ id: 77, version: 3, state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    expect(postSpy.mock.calls[0][0]).toBe('/reports/77/transition')
    // Không `note` cho thao tác không đòi lý do: gửi thừa chuỗi rỗng là ghi đè `decision_note`
    // của lượt trả lại trước bằng khoảng trắng.
    expect(thanPost(0)).toEqual({ action: 'submit', expected_state: 'draft', version: 3 })
  })

  // `version` của transition phải là số MỚI NHẤT server trả về, không phải số của lần tải trang:
  // cú "Nộp luôn lưu trước" ngay trước đó đã đẩy version lên. Gửi số cũ là 409 với chính mình.
  it('version gửi đi là version SAU lần lưu, không phải version lúc tải trang', async () => {
    putSpy.mockResolvedValueOnce({ version: 20, values: [] })
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 3, mau: MOT_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    expect(thanPut(0).version).toBe(3)
    expect(thanPost(0).version).toBe(20)
  })

  it('Trả lại: lý do người duyệt gõ đi NGUYÊN VĂN vào thân request', async () => {
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', mau: MOT_DONG(), values: DA_DIEN })
    const hop = await moHop(u, 'Trả lại…')
    await u.click(within(hop).getByRole('textbox'))
    // Khoảng trắng hai đầu CÓ trong chuỗi gõ vào: không có nó thì một `.trim()` lén trên đường
    // gửi đi vẫn xanh (đột biến N14 của người soát) — bất biến "nguyên văn" chỉ được canh ở biên
    // `DialogXacNhan`, không ở thân request.
    await u.keyboard('  Thiếu số B-8.1 và B-8.2  ')
    await u.click(nutHop('Trả lại'))
    expect(thanPost(0)).toEqual({
      action: 'return',
      expected_state: 'submitted',
      version: 8,
      note: '  Thiếu số B-8.1 và B-8.2  ',
    })
  })

  // I11 / N25: `bam-nop` chỉ được chạy cho `submit`. Nới ra cho mọi thao tác thì người duyệt bấm
  // "Trả lại…" sẽ thấy thanh dưới đỏ "Thiếu n ô bắt buộc" trên một form CHỈ ĐỌC họ không sửa được
  // — một câu báo động vô nghĩa đúng lúc họ đang quyết định.
  it('bấm thao tác KHÁC "Nộp" không bật câu "Thiếu n ô bắt buộc" của thanh dưới', async () => {
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', mau: MOT_DONG() })
    await moHop(u, 'Trả lại…')
    expect(screen.queryByText(/Thiếu \d+ ô bắt buộc/)).toBeNull()
  })

  // ---------------------------------------------------------------- version đi theo transition
  //
  // `TransitionOut` trả `{state, version}`. Ba ca dưới đây là ba hậu quả người soát ĐO ĐƯỢC khi
  // phản hồi đó bị vứt đi (S1/S2/S3) — cùng lớp lỗi với C9 của Task 23 ở phía `PUT .../values`.

  it('Duyệt xong bấm "Mở lại…" ngay trong cùng phiên: gửi version MỚI, không phải version lúc mở form', async () => {
    postSpy.mockResolvedValueOnce({ state: 'approved', version: 9 })
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Nút đổi theo trạng thái server VỪA XÁC NHẬN, không chờ lượt `GET` nền nào về.
    const hop = await moHop(u, 'Mở lại…')
    await u.click(within(hop).getByRole('textbox'))
    await u.keyboard('Sai số liệu cột B-8')
    await u.click(nutHop('Mở lại'))
    expect(thanPost(1)).toEqual({
      action: 'reopen',
      expected_state: 'approved',
      version: 9,
      note: 'Sai số liệu cột B-8',
    })
  })

  it('409 của transition: lần bấm sau gửi version server VỪA NÓI, không lặp lại số vừa bị từ chối', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Người khác vừa sửa báo cáo này',
        state: 'submitted',
        version: 11,
      }),
    )
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(thanPost(0).version).toBe(8)

    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))
    expect(thanPost(1).version).toBe(11)
  })

  // 409 mang CẢ `state`: nếu người khác đã duyệt trước, câu trả lời của server nói ra điều đó.
  // Không nhận lấy thì nút trên thanh dính vẫn là nút của trạng thái cũ — người duyệt bấm tiếp và
  // ăn đúng câu lỗi ấy lần nữa.
  it('409 nói trạng thái ĐÃ KHÁC: nút trên thanh dính đổi theo trạng thái server vừa nói', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Không thể "Duyệt" ở trạng thái hiện tại',
        state: 'approved',
        version: 11,
      }),
    )
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mở lại…' })).toBeTruthy()
  })

  it('sau 409 của transition, cú Lưu tiếp theo cũng dùng version server vừa nói', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Người khác vừa sửa báo cáo này',
        state: 'returned',
        version: 11,
      }),
    )
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(thanPut(0).version).toBe(11)
  })

  // fix-3 L8 (R9): 400 và 403 của transition KHÔNG mang `version` (hop-dong-loi-backend.md — chỉ
  // 409 mang). Nhận bừa một số thay thế (vd `loi.version ?? 0`) là đặt khoá lạc quan của lớp lưu
  // về một số server chưa bao giờ giữ: MỌI lượt lưu sau đó ăn 409 "người khác vừa sửa" sai sự
  // thật, và người nhập kẹt cho tới khi tải lại trang.
  it('400 của transition (không mang version) KHÔNG đụng tới version của lớp lưu', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(400, {
        detail: 'Dữ liệu không hợp lệ',
        errors: [{ indicator_code: 'B-8.1', message: 'Bắt buộc' }],
      }),
    )
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(thanPut(0).version).toBe(8)
  })

  it('duyệt xong thì chip trạng thái ở dải đầu đổi ngay, không chờ lượt làm mới nền', async () => {
    postSpy.mockResolvedValueOnce({ state: 'approved', version: 9 })
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    expect(screen.getByText('Đã nộp')).toBeTruthy()
    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Đã duyệt')).toBeTruthy()
    expect(screen.queryByText('Đã nộp')).toBeNull()
  })

  // Chiều NGƯỢC LẠI: người KHÁC vừa duyệt, lượt `GET` nền mang trạng thái mới về. Bản trong form
  // phải NHƯỜNG — nếu không, màn hình đứng mãi ở trạng thái cũ cho tới khi tải lại trang.
  it('lượt làm mới nền mang trạng thái MỚI của người khác: form đi theo nó', () => {
    useSession.getState().login('tok-test', NGUOI_DUNG, DON_VI, QUYEN_ADMIN)
    const mau = MOT_DONG()
    const r = veCay(
      <ReportForm mau={mau} chiTiet={duLieu({ state: 'submitted', version: 8, mau, values: DA_DIEN })} />,
    )
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeTruthy()

    r.rerender(
      <ReportForm mau={mau} chiTiet={duLieu({ state: 'approved', version: 9, mau, values: DA_DIEN })} />,
    )
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mở lại…' })).toBeTruthy()
  })

  // fix-3 L7 (R7): ranh giới HOÀ là chỗ DUY NHẤT `>=` khác `>`. Luật đã chọn: hai nguồn cùng nói
  // một `version` thì bản của SERVER (prop) thắng — reducer chỉ được thắng khi nó đang giữ một
  // `version` LỚN HƠN, tức nó vừa nhận phản hồi của một lệnh ghi mà lượt `GET` nền chưa thấy. Lật
  // ranh giới này là form tin bản của chính mình và mở ô nhập cho một báo cáo người khác đã nộp.
  it('hoà phiên bản thì trạng thái của prop (server) thắng, không phải của reducer', () => {
    useSession.getState().login('tok-test', NGUOI_DUNG, DON_VI, QUYEN_REPORTER)
    const mau = MOT_DONG()
    const r = veCay(
      <ReportForm mau={mau} chiTiet={duLieu({ state: 'draft', version: 8, mau, values: DA_DIEN })} />,
    )
    expect(screen.getByRole('button', { name: 'Nộp báo cáo' })).toBeTruthy()
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)

    // CÙNG version 8, trạng thái khác.
    r.rerender(
      <ReportForm mau={mau} chiTiet={duLieu({ state: 'submitted', version: 8, mau, values: DA_DIEN })} />,
    )
    expect(screen.queryByRole('button', { name: 'Nộp báo cáo' })).toBeNull()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('sau một transition thành công, cú Lưu ĐẦU TIÊN gửi version mới chứ không phải số cũ', async () => {
    postSpy.mockResolvedValueOnce({ state: 'returned', version: 9 })
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', version: 8, mau: MOT_DONG(), values: DA_DIEN })
    const hop = await moHop(u, 'Trả lại…')
    await u.click(within(hop).getByRole('textbox'))
    await u.keyboard('Thiếu số B-8.1 và B-8.2')
    await u.click(nutHop('Trả lại'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // `returned` là trạng thái SỬA ĐƯỢC: form mở ra ngay, không chờ lượt `GET` nền.
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(thanPut(0).version).toBe(9)
  })

  it('Huỷ đóng hộp thoại và KHÔNG gửi gì', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Huỷ'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('Esc đóng hộp thoại và KHÔNG gửi gì', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(postSpy).not.toHaveBeenCalled()
  })

  // task-24-carry.md C3: nút chính phải KHOÁ trong lúc request bay. Không khoá thì bấm hai lần là
  // hai `POST` — lần thứ hai chắc chắn 409 và người dùng nhìn thấy một câu lỗi cho thao tác vừa
  // thành công.
  it('đang gửi: nút chính khoá và đổi chữ "Đang gửi…"', async () => {
    postSpy.mockReturnValueOnce(new Promise(() => {})) // treo: đo đúng lúc request còn bay
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    const nut = nutHop('Đang gửi…')
    expect(nut.hasAttribute('disabled')).toBe(true)
    await u.click(nut)
    expect(postSpy).toHaveBeenCalledTimes(1)
  })

  it('chuyển trạng thái xong thì đóng hộp thoại', async () => {
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  // task-24-carry.md C1: 400 lúc nộp mang `errors[{indicator_code, message}]` — hiện DANH SÁCH,
  // không hiện một câu chung chung. `detail` của 400 chỉ là "Dữ liệu không hợp lệ".
  it('400 thiếu ô bắt buộc: đóng hộp thoại, banner liệt từng mã kèm câu của server', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(400, {
        detail: 'Dữ liệu không hợp lệ',
        errors: [
          { indicator_code: 'B-8.1', message: 'Chỉ tiêu bắt buộc' },
          { indicator_code: 'B-8.4', message: 'Chỉ tiêu bắt buộc' },
        ],
      }),
    )
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))

    const bao = await screen.findByRole('alert')
    expect(bao.textContent).toContain('Dữ liệu không hợp lệ')
    expect(bao.textContent).toContain('B-8.1: Chỉ tiêu bắt buộc')
    expect(bao.textContent).toContain('B-8.4: Chỉ tiêu bắt buộc')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Câu 409 loại "thao tác không hợp lệ ở trạng thái hiện tại" dựng ĐỘNG từ tên tiếng Việt của
  // transition trong DB (hop-dong-loi-backend.md) — hiện nguyên văn, không viết lại.
  it('409 trong hộp thoại: đóng hộp thoại, banner hiện NGUYÊN VĂN detail của server', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(409, { detail: 'Không thể "Duyệt" ở trạng thái hiện tại', state: 'draft', version: 9 }),
    )
    const u = nguoiDung()
    ve({ state: 'submitted', vai: 'admin', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Duyệt')
    await u.click(nutHop('Duyệt'))

    const bao = await screen.findByRole('alert')
    expect(bao.textContent).toContain('Không thể "Duyệt" ở trạng thái hiện tại')
    // KHÔNG mượn banner 409 của lớp lưu: transition 409 không mang `values` nên không có "ô đang
    // gõ" nào được giữ, và hai loại 409 của nó không phân biệt được để nói "phiên bản X → Y".
    expect(bao.textContent).not.toContain('phiên bản')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mất mạng lúc chuyển trạng thái: banner nói rõ chưa gửi được, không hiện JSON', async () => {
    postSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    const bao = await screen.findByRole('alert')
    expect(bao.textContent).toContain('Mất kết nối, chưa gửi được')
    // Phần "không hiện JSON" của tên ca: `String(TypeError)` và `JSON.stringify` của lỗi đều lọt
    // ra màn hình nếu ai đó đổi nhánh này thành phun lỗi thô.
    expect(bao.textContent).not.toContain('TypeError')
    expect(bao.textContent).not.toContain('Failed to fetch')
  })

  it('bấm lại lần sau xoá banner lỗi của lần trước', async () => {
    postSpy.mockRejectedValueOnce(new ApiError(403, { detail: 'Bạn không có quyền duyệt báo cáo này' }))
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG(), values: DA_DIEN })
    await moHop(u, 'Nộp báo cáo')
    await u.click(nutHop('Nộp'))
    expect(await screen.findByText(/Bạn không có quyền duyệt báo cáo này/)).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    await screen.findByRole('dialog')
    expect(screen.queryByText(/Bạn không có quyền duyệt báo cáo này/)).toBeNull()
  })

  // task-24-carry.md C-T23c: lỗi của ba ô chữ nhóm C đi bằng khoá `field_code`, KHÔNG phải
  // `indicator_code` (`services/reports.py:515`). Trước Task 24 nó không có chỗ nào hiện được.
  it('400 của lớp lưu: liệt cả dòng mang indicator_code lẫn dòng mang field_code', async () => {
    putSpy.mockRejectedValueOnce(
      new ApiError(400, {
        detail: 'Dữ liệu không hợp lệ',
        errors: [
          { indicator_code: 'B-1.1', message: 'Giá trị không được âm' },
          { field_code: 'C1', message: 'Nội dung vượt quá 2000 ký tự' },
        ],
      }),
    )
    const u = nguoiDung()
    ve({ state: 'draft', vai: 'reporter', mau: MOT_DONG() })
    await u.click(o('B-1.1', 'Tháng này'))
    await u.keyboard('12')
    await u.click(screen.getByRole('button', { name: 'Lưu' }))

    const bao = await screen.findByRole('alert')
    expect(bao.textContent).toContain('Không lưu được: Dữ liệu không hợp lệ')
    expect(bao.textContent).toContain('B-1.1: Giá trị không được âm')
    expect(bao.textContent).toContain('C1: Nội dung vượt quá 2000 ký tự')
  })
})

// ============================================================ P4 — chặn điều hướng khi còn ô bẩn
//
// final-fix-FE.md P4, Ruling 426 · final-review-R3-report.md §(A2).
//
// LỖI: gõ số → rời ô → dải đầu hiện "Chưa lưu (1 ô)", hẹn `PUT` sau 1,5 giây. Trong 1,5 giây đó
// bấm **Dashboard** ở sidebar ⇒ `ReportDetail` unmount ⇒ cleanup của `useSaveValues` gọi `huyHen()`
// — `clearTimeout` mà KHÔNG xả hàng chờ. `PUT` không bao giờ bay, số MẤT HẲN, và dòng "Chưa lưu
// (1 ô)" biến mất cùng trang nên không còn một dấu vết nào. `beforeunload` không cứu được: sidebar
// dùng `NavLink`, điều hướng SPA không bắn sự kiện đó.
//
// LẬT BẰNG CHẶN, KHÔNG BẰNG XẢ. `void saveNow()` trong cleanup là một tấm lưới chỉ đỡ ĐÔI KHI:
// bắn xong mà hỏng thì không còn ai nghe lỗi, người dùng đi tiếp và tin là đã lưu. `useBlocker`
// đổi CHẤT câu hỏi — đừng đua lưu lúc trang đang chết, đừng để trang chết khi còn ô bẩn.
//
// Ca số 4 và 5 là MẶT ÂM và chúng bắt buộc: một `useBlocker(() => true)` chặn mọi lúc cũng làm ba
// ca đầu xanh, mà nó biến mỗi cú bấm sidebar của buổi demo thành một hộp thoại vô cớ.
describe('P4 — chặn điều hướng SPA khi còn ô chưa lưu', () => {
  beforeEach(dongHoGia)

  /** Cây có ĐIỀU HƯỚNG THẬT: hai route + một `<Link>`, chạy trên data router y như app thật. Không
   *  dùng `BocQuery` (route `*` duy nhất) vì ca này cần một đích để rời ĐI và một cách đo "đã rời
   *  chưa" trên cây thật, không phải bằng spy. */
  /** Mẫu một dòng — đủ để làm bẩn một ô mà không dựng 62 dòng cho mỗi ca. */
  const MOT_DONG = () => mauNho([chiTieu({ code: 'B-1.1' })])

  function veCoLoiRa(opts: VeOpts = {}) {
    const mau = opts.mau ?? MAU_FM01
    const quyen =
      opts.vai === 'admin' ? QUYEN_ADMIN : opts.vai === 'viewer' ? QUYEN_VIEWER : QUYEN_REPORTER
    useSession.getState().login('tok-test', NGUOI_DUNG, DON_VI, quyen)

    const router = createMemoryRouter(
      [
        {
          path: '/reports/12',
          element: (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <ReportForm mau={mau} chiTiet={duLieu(opts)} />
            </>
          ),
        },
        { path: '/dashboard', element: <div>ĐÃ SANG DASHBOARD</div> },
      ],
      { initialEntries: ['/reports/12'] },
    )
    function Cay() {
      const [qc] = useState(() => new QueryClient())
      return (
        <QueryClientProvider client={qc}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )
    }
    return render(<Cay />)
  }

  const daSangDashboard = () => screen.queryByText('ĐÃ SANG DASHBOARD') !== null

  it('còn ô bẩn: bấm Dashboard KHÔNG rời trang, mà hỏi một câu rõ ràng', async () => {
    const u = nguoiDung()
    veCoLoiRa({ state: 'draft', vai: 'reporter', mau: MOT_DONG() })
    await lamBanMotO(u)
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()

    await u.click(screen.getByRole('link', { name: 'Dashboard' }))

    expect(daSangDashboard()).toBe(false)
    const hop = screen.getByRole('dialog')
    // Câu phải NÓI RA hậu quả và ĐẾM đúng số ô — "Bạn có chắc không?" là một câu câm kiểu khác.
    expect(hop.textContent).toContain('1 ô')
    expect(hop.textContent).toMatch(/chưa (được )?lưu|chưa gửi/i)
  })

  it('bấm Huỷ thì ở lại — và số VẪN được gửi khi hết 1,5 giây (đây là toàn bộ điểm của mục)', async () => {
    const u = nguoiDung()
    veCoLoiRa({ state: 'draft', vai: 'reporter', mau: MOT_DONG() })
    await lamBanMotO(u, 'B-1.1', '12')
    await u.click(screen.getByRole('link', { name: 'Dashboard' }))
    await u.click(screen.getByRole('dialog').querySelector('button')!) // nút đầu = "Huỷ"

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(daSangDashboard()).toBe(false)
    expect(screen.getByText('Chưa lưu (1 ô)')).toBeTruthy()

    // Đường thật, không phải spy: hàng chờ còn sống nên hẹn 1,5 giây vẫn nổ và số lên tới server.
    await choDebounce()
    expect(putSpy).toHaveBeenCalled()
    const than = putSpy.mock.calls[0][1] as { values: { indicator_code: string; this_period: number }[] }
    expect(than.values).toEqual([{ indicator_code: 'B-1.1', this_period: 12 }])
  })

  it('bấm nút chính thì RỜI trang — người dùng đã được nói rõ là mất số', async () => {
    const u = nguoiDung()
    veCoLoiRa({ state: 'draft', vai: 'reporter', mau: MOT_DONG() })
    await lamBanMotO(u)
    await u.click(screen.getByRole('link', { name: 'Dashboard' }))
    const nut = screen.getByRole('dialog').querySelectorAll('button')
    await u.click(nut[nut.length - 1]) // nút chính, đứng SAU "Huỷ" trong DOM (DialogXacNhan.tsx)

    await waitFor(() => expect(daSangDashboard()).toBe(true))
  })

  // MẶT ÂM 1: không có ô bẩn thì đi thẳng. Thiếu ca này, `useBlocker(() => true)` vẫn xanh ba ca
  // trên mà biến mọi cú bấm sidebar thành một hộp thoại vô cớ giữa buổi demo.
  it('mặt âm — không có ô bẩn thì bấm Dashboard đi THẲNG, không hỏi gì', async () => {
    const u = nguoiDung()
    veCoLoiRa({ state: 'draft', vai: 'reporter', mau: MOT_DONG() })
    await u.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(daSangDashboard()).toBe(true))
  })

  // MẶT ÂM 2: đã lưu xong thì thôi hỏi. Điều kiện phải đọc `dirtyCount` SỐNG chứ không phải một cờ
  // "đã từng gõ" — một cờ như thế làm trang hỏi mãi mãi sau ô đầu tiên.
  it('mặt âm — gõ rồi để hết debounce (đã lưu xong) thì bấm Dashboard đi THẲNG', async () => {
    const u = nguoiDung()
    veCoLoiRa({ state: 'draft', vai: 'reporter', mau: MOT_DONG() })
    await lamBanMotO(u)
    await choDebounce()
    expect(putSpy).toHaveBeenCalled()

    await u.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(daSangDashboard()).toBe(true))
  })
})

// ============================================================ P7 — nhóm A khi cả năm trường null
//
// final-fix-FE.md P7, Ruling 427 · final-review-R2-report.md §(A4).
//
// `report_no` · `location` · `report_date` · `reporter_name` · `reporter_position` là một VÒNG TRÒN
// CHẾT: có cột, có `ReportHeaderOut`, `FormHeader.tsx` vẽ ra màn hình thành nhóm A "THÔNG TIN
// CHUNG" có đích nhảy `#A` của mục lục — nhưng KHÔNG schema đầu vào nào của dự án nhận chúng (đã
// liệt đủ 5 lớp `*In`), **66/66 báo cáo trên DB demo đều NULL**, 0 ca test backend nêu tên. Ban
// ATCL mở báo cáo, khối ĐẦU TIÊN — đúng khối định danh của bản giấy FM01 — hiện **năm dấu gạch
// ngang**, và mục lục có một mục `A. THÔNG TIN CHUNG` nhảy tới năm dấu gạch đó.
//
// Ẩn, không suy ra giá trị: ba trong năm suy được (`location` ← tên đơn vị, `report_date` ←
// `submitted_at`, `reporter_name` ← người nộp), hai cái kia thì không — hiện ba ô có số hai ô gạch
// ngang CÒN TỆ HƠN ẩn cả khối, vì nó trông như dữ liệu bị mất.
//
// Và không mở đường ghi trước 30/09: đó là quyết định nghiệp vụ, cùng loại với câu hỏi LTI.
describe('P7 — nhóm A "THÔNG TIN CHUNG" khi cả năm trường đều null', () => {
  const RONG = {
    report_no: null,
    location: null,
    report_date: null,
    reporter_name: null,
    reporter_position: null,
  }

  it('cả năm null: KHÔNG vẽ khối năm dấu gạch ngang, và KHÔNG còn đích nhảy #A', () => {
    ve({ state: 'draft', vai: 'reporter', header: RONG })
    expect(screen.queryByText('Số báo cáo')).toBeNull()
    expect(screen.queryByText('Chức vụ')).toBeNull()
    expect(document.getElementById('A')).toBeNull()
  })

  // Dải chip của thẻ "Tiến độ nhập" chỉ liệt nhóm CÓ trong bảng, nên nó không bao giờ có `#A` —
  // "mục lục bỏ mục A" hết là câu hỏi. Thứ ca này từng bảo vệ thì còn nguyên và nay đo tổng quát
  // hơn: không neo nào trên trang trỏ vào chỗ trống. Đối chứng cũ (bản vá lọc quá tay nuốt luôn C)
  // cũng còn: chín chip B phải còn đủ.
  it('cả năm null: không neo nào trỏ vào chỗ trống, chín chip nhóm còn nguyên', () => {
    ve({ state: 'draft', vai: 'reporter', header: RONG })
    expect(neoHong()).toEqual([])
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#B-1', '#B-2', '#B-3', '#B-4', '#B-5', '#B-6', '#B-7', '#B-8', '#B-9',
    ])
  })

  // MẶT ÂM, và nó là mặt quan trọng: "còn một trường nào non-null thì hiện y như hôm nay". Thiếu
  // ca này, một bản vá ẩn nhóm A VÔ ĐIỀU KIỆN cũng xanh hai ca trên — và lúc dữ liệu thật về thì
  // khối định danh của FM01 biến mất vĩnh viễn mà không ai biết.
  it.each(['report_no', 'location', 'report_date', 'reporter_name', 'reporter_position'] as const)(
    'mặt âm — CHỈ %s có giá trị thì nhóm A vẫn hiện đủ',
    (truong) => {
      const giaTri = truong === 'report_date' ? '2026-09-30' : 'có giá trị'
      ve({ state: 'draft', vai: 'reporter', header: { ...RONG, [truong]: giaTri } })
      expect(screen.getByText('Số báo cáo')).toBeTruthy()
      expect(screen.getByText('Chức vụ')).toBeTruthy()
      expect(document.getElementById('A')).toBeTruthy()
    },
  )
})


// ============================================================ mockup 04 — ba tab, khối nhắc, tiến độ
//
// Ba khối mà lát dựng lại theo mockup 04 mang vào: `Tabs` có điều khiển, một `Alert` gộp thay hai
// banner xám, và thẻ "Tiến độ nhập" (`Progress` + dải chip) thay cột mục lục. Các ca ở trên đã
// chạm tới chúng một cách gián tiếp (mở tab để tới ô chữ C, đếm neo); khối này đo thẳng.

describe('mockup 04 — ba tab của form', () => {
  it('ba tab đúng nhãn, mặc định đứng ở Chỉ tiêu', () => {
    ve({ state: 'draft', vai: 'reporter' })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Chỉ tiêu',
      'Hoạt động nổi bật',
      'Lịch sử thao tác',
    ])
    expect(screen.getByRole('tab', { name: 'Chỉ tiêu' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('table')).toBeTruthy()
  })

  // Đây là lý do `Tabs` phải CÓ ĐIỀU KHIỂN (spec §10). Để Radix tự giữ trạng thái thì cú bấm này
  // im lặng không làm gì — neo trỏ tới một hàng đang không có trong DOM.
  it('bấm mã thiếu ở chân trang khi đang đứng ở tab khác thì kéo tab về Chỉ tiêu', async () => {
    const u = userEvent.setup()
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    await u.click(screen.getByRole('button', { name: 'Nộp báo cáo' }))
    const neo = screen.getByRole('link', { name: 'B-1.1' })

    moTabC()
    expect(screen.queryByRole('table')).toBeNull()

    await u.click(neo)
    expect(screen.getByRole('tab', { name: 'Chỉ tiêu' }).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById(neo.getAttribute('href')!.slice(1))).toBeTruthy()
  })

  it('tab Lịch sử thao tác đọc /reports/{id}/history và in việc theo tên tiếng Việt của mẫu', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue([
      { id: 1, action: 'seed_import', actor_id: null, before: null, after: { note: 'nạp từ file' }, created_at: '2026-09-01T08:00:00+07:00' },
      { id: 2, action: 'return', actor_id: 3, before: { state: 'submitted' }, after: { state: 'returned', decision_note: 'Thiếu B-2.7' }, created_at: '2026-09-04T15:20:00+07:00' },
    ])
    ve({ state: 'returned', vai: 'reporter', decision_note: 'x' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Lịch sử thao tác' }))

    const ds = await screen.findByRole('list')
    expect(getSpy).toHaveBeenCalledWith('/reports/12/history')
    // "Trả lại" lấy từ CHÍNH `mau.transitions`, cùng nguồn với chữ trên nút — hai chỗ không lệch được.
    expect(ds.textContent).toContain('Trả lại')
    expect(ds.textContent).toContain('submitted → returned')
    expect(ds.textContent).toContain('Thiếu B-2.7')
    // Dòng seed có `before = null`: KHÔNG được in một vệt trạng thái cụt đầu.
    expect(ds.textContent).toContain('Nạp từ file tổng hợp')
    expect(ds.textContent).not.toContain('→ null')
    getSpy.mockRestore()
  })
})

describe('mockup 04 — thẻ Tiến độ nhập', () => {
  it('in số ô bắt buộc đã nhập trên tổng, và thanh Progress mang cùng con số', () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1' }), chiTieu({ code: 'B-1.2', sort_order: 2 })]),
      values: [{ indicator_code: 'B-1.1', this_period: 5 }],
    })
    expect(screen.getByText('1/2 ô bắt buộc')).toBeTruthy()
    expect(screen.getByLabelText('Đã nhập 1 trên 2 ô bắt buộc')).toBeTruthy()
  })

  // Mẫu không khai ô bắt buộc nào thì một thanh rỗng kèm "0/0 ô" là trang trí gây hiểu nhầm.
  it('mẫu không có ô bắt buộc nào thì KHÔNG vẽ thanh và không in "0/0"', () => {
    ve({
      state: 'draft',
      vai: 'reporter',
      mau: mauNho([chiTieu({ code: 'B-1.1', required: false })]),
    })
    expect(screen.getByText('Tiến độ nhập')).toBeTruthy()
    expect(screen.queryByText('0/0 ô bắt buộc')).toBeNull()
    expect(screen.queryByText(/ô bắt buộc/)).toBeNull()
  })

  it('chip nhóm còn thiếu mang màu cảnh báo; điền đủ thì chip trở về viền thường', async () => {
    ve({ state: 'draft', vai: 'reporter', mau: mauNho([chiTieu({ code: 'B-1.1' })]) })
    const chip = screen.getByRole('link', { name: /^B-1 / })
    expect(resolveCascadeWinner(chip.className, 'background-color')).toBe('bg-warning-bg')

    await userEvent.type(o('B-1.1', 'Tháng này'), '5')
    expect(resolveCascadeWinner(chip.className, 'background-color')).toBe('bg-card')
  })
})

describe('mockup 04 — khối nhắc trước khi nộp/duyệt', () => {
  const LECH_CHUA_GHI = {
    mau: mauNho([chiTieu({ code: 'B-1.5', agg_type: 'counter' })]),
    values: [{ indicator_code: 'B-1.5', counter_check: { status: 'lech', expected: 9, message: 'Lệch công thức' } }],
  }

  it('một điểm thì đếm là "Một", và mốc sắp tới của người NỘP là nộp', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: ['2026-07'] })
    expect(screen.getByRole('status').textContent).toContain('Một điểm cần biết trước khi nộp')
  })

  it('hai điểm thì đếm là "Hai", và mốc sắp tới của người DUYỆT là duyệt', () => {
    ve({ state: 'submitted', vai: 'admin', missing_periods: ['2026-07'], ...LECH_CHUA_GHI })
    const khoi = screen.getByRole('status')
    expect(khoi.textContent).toContain('Hai điểm cần biết trước khi duyệt')
    expect(khoi.textContent).toContain('1 bộ đếm')
  })

  it('không điểm nào thì KHÔNG vẽ khối — không có "không có gì đáng lo" chiếm chỗ', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: [] })
    expect(document.body.textContent).not.toContain('điểm cần biết')
  })

  // Neo "Tới ô đầu" chỉ hiện khi CÓ chỗ để nhảy tới: điểm "lũy kế chưa tính" nói về một kỳ KHÁC,
  // không có ô nào trên trang này để chỉ vào.
  it('chỉ thiếu kỳ (không có bộ đếm lệch) thì không có neo "Tới ô đầu"', () => {
    ve({ state: 'draft', vai: 'reporter', missing_periods: ['2026-07'] })
    expect(screen.queryByRole('link', { name: /Tới ô đầu/ })).toBeNull()
  })

  it('neo "Tới ô đầu" trỏ đúng ô lệch đầu tiên và cũng kéo tab về Chỉ tiêu', async () => {
    const u = userEvent.setup()
    ve({ state: 'submitted', vai: 'admin', ...LECH_CHUA_GHI })
    const neo = screen.getByRole('link', { name: /Tới ô đầu/ })
    expect(neo.getAttribute('href')).toBe('#B-1-5')

    moTabC()
    await u.click(neo)
    expect(screen.getByRole('tab', { name: 'Chỉ tiêu' }).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('B-1-5')).toBeTruthy()
  })
})
