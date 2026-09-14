// frontend/src/features/report/useChuyenTrangThai.test.tsx
//
// BA ĐIỀU ĐỊNH HÌNH BỘ TEST NÀY:
//
// 1. TOAST ĐO TRÊN MÀN HÌNH THẬT, KHÔNG ĐO SPY. Cây test dựng luôn `<Toast/>` và một bảng route
//    có `/dashboard`, nên "toast có link Xem dashboard" được khẳng định bằng chính cái link người
//    dùng bấm và bằng trang mà cú bấm đó tới — không phải bằng hình dạng tham số của một hàm giả.
//    Ca test của brief (`toastSpy` nhận `{text, linkLabel}`) SAI so với `useToast` thật
//    (`show(message, action?)`, components/ui/Toast.tsx:16,28) — task-24-carry.md C4.
//
// 2. CÂU TOAST DỰNG TỪ `name_vi` CỦA DỮ LIỆU. Có ca dùng một `name_vi` KHÔNG nằm trong seed để
//    một bảng chuỗi viết cứng không sống nổi.
//
// 3. `dialogMo` PHẢI ĐƯỢC THẤY LÚC NÓ BẬT. Ca "409 đóng hộp thoại" của brief chỉ khẳng định
//    `dialogMo === false` sau lỗi — mà nó chưa từng `true` lần nào, nên khẳng định đó không nhìn
//    thấy thứ nó đang canh. Mọi ca dưới đây mở hộp thoại trước rồi mới đo.
import { useState, type ReactNode } from 'react'
import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { invalidateReportQueries } from '../../api/invalidate'
import { Toast } from '../../components/ui/Toast'
import { noiDungDialog, useChuyenTrangThai } from './useChuyenTrangThai'
import type { ChuyenTrangThai, DauBaoCao } from './ReportForm'

// `invalidateReportQueries` là hàm module (namespace ES module đóng băng) nên không `vi.spyOn`
// được. Nó đã có bộ test riêng khoá đúng 4 khoá cache (api/invalidate.test.ts, Task 17); ở đây chỉ
// cần khẳng định hook GỌI nó, đúng chỗ và đúng tham số.
vi.mock('../../api/invalidate', () => ({ invalidateReportQueries: vi.fn() }))
const invalidateSpy = vi.mocked(invalidateReportQueries)

const postSpy = vi.spyOn(api, 'post')

// Chép nguyên văn seed `backend/app/seed/__init__.py` TRANSITIONS.
const NOP: ChuyenTrangThai = {
  action_code: 'submit', from_state: 'draft', to_state: 'submitted',
  name_vi: 'Nộp báo cáo', required_permission: 'report.submit', requires_note: false,
}
const DUYET: ChuyenTrangThai = {
  action_code: 'approve', from_state: 'submitted', to_state: 'approved',
  name_vi: 'Duyệt', required_permission: 'report.approve', requires_note: false,
}
const TRA_LAI: ChuyenTrangThai = {
  action_code: 'return', from_state: 'submitted', to_state: 'returned',
  name_vi: 'Trả lại', required_permission: 'report.return', requires_note: true,
}
const MO_LAI: ChuyenTrangThai = {
  action_code: 'reopen', from_state: 'approved', to_state: 'returned',
  name_vi: 'Mở lại', required_permission: 'report.return', requires_note: true,
}

const DAU: DauBaoCao = {
  org_unit: { code: 'U01', name: 'PTSC Đình Vũ' },
  template_code: 'FM01',
  period_key: '2026-08',
  due_at: '2026-10-05T16:59:59Z',
  report_no: null, location: null, report_date: null,
  reporter_name: null, reporter_position: null,
  submitted_at: null, decided_at: null, decision_note: null,
}

/** Cây thật: `QueryClientProvider` (invalidate) + router (link "Xem dashboard") + `<Toast/>` mount
 * một lần gần root, đúng như app/routes.tsx dựng. */
function Boc({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/reports/12']}>
        {children}
        <Toast />
        <Routes>
          <Route path="/reports/:id" element={<span>đang ở trang báo cáo</span>} />
          <Route path="/dashboard" element={<span>đang ở dashboard</span>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function ren(opts: Parameters<typeof useChuyenTrangThai>[2] = {}) {
  return renderHook(() => useChuyenTrangThai(12, DAU, opts), { wrapper: Boc })
}

beforeEach(() => {
  postSpy.mockReset()
  postSpy.mockResolvedValue({ state: 'approved', version: 9 })
  invalidateSpy.mockReset()
})

describe('useChuyenTrangThai — mở và đóng hộp thoại', () => {
  it('chưa hỏi gì thì dialogMo là false và dangHoi là null', () => {
    const { result } = ren()
    expect(result.current.dialogMo).toBe(false)
    expect(result.current.dangHoi).toBeNull()
  })

  it('hoi() bật dialogMo và giữ đúng chuyển trạng thái được hỏi', () => {
    const { result } = ren()
    act(() => result.current.hoi(TRA_LAI))
    expect(result.current.dialogMo).toBe(true)
    expect(result.current.dangHoi).toEqual(TRA_LAI)
  })

  it('huy() đóng lại và KHÔNG gửi gì', () => {
    const { result } = ren()
    act(() => result.current.hoi(DUYET))
    act(() => result.current.huy())
    expect(result.current.dialogMo).toBe(false)
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('gửi xong thì đóng hộp thoại', async () => {
    const { result } = ren()
    act(() => result.current.hoi(DUYET))
    expect(result.current.dialogMo).toBe(true)
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(result.current.dialogMo).toBe(false)
  })

  // task-24-carry.md C5 + spec dòng 682: "409 trong dialog → đóng dialog, banner 409 của form".
  it('409 cũng đóng hộp thoại, và đẩy detail nguyên văn lên nơi gọi', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(409, { detail: 'Không thể "Duyệt" ở trạng thái hiện tại', state: 'draft', version: 9 }),
    )
    const onLoi = vi.fn()
    const { result } = ren({ onLoi })
    act(() => result.current.hoi(DUYET))
    expect(result.current.dialogMo).toBe(true)
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    // `state`/`version` đi kèm: CẢ HAI loại 409 của transition đều mang chúng
    // (`services/workflow.py:198,218`) và đó là số MỚI NHẤT server đang giữ. Vứt đi thì lần bấm
    // sau gửi lại đúng con số vừa bị từ chối.
    expect(onLoi).toHaveBeenCalledWith({
      detail: 'Không thể "Duyệt" ở trạng thái hiện tại',
      errors: null,
      state: 'draft',
      version: 9,
    })
    expect(result.current.dialogMo).toBe(false)
  })

  it('pending bật trong lúc request bay rồi tắt khi xong', async () => {
    let xong!: (v: unknown) => void
    postSpy.mockReturnValueOnce(new Promise((r) => (xong = r)))
    const { result } = ren()
    let p!: Promise<void>
    act(() => {
      p = result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      xong({ state: 'approved', version: 9 })
      await p
    })
    expect(result.current.pending).toBe(false)
  })

  it('pending tắt cả khi request hỏng — không khoá vĩnh viễn nút của hộp thoại sau', async () => {
    postSpy.mockRejectedValueOnce(new ApiError(403, { detail: 'Bạn không có quyền' }))
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(result.current.pending).toBe(false)
  })
})

describe('useChuyenTrangThai — thân request', () => {
  it('gửi đúng URL và đúng bốn trường của TransitionIn', async () => {
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(TRA_LAI, 'submitted', 8, 'Thiếu số B-8.1')
    })
    expect(postSpy.mock.calls[0][0]).toBe('/reports/12/transition')
    expect(postSpy.mock.calls[0][1]).toEqual({
      action: 'return',
      expected_state: 'submitted',
      version: 8,
      note: 'Thiếu số B-8.1',
    })
  })

  // `TransitionIn.note` mặc định `None`. Gửi thừa một chuỗi rỗng cho thao tác không đòi lý do là
  // ghi đè `decision_note` của lượt trả lại trước bằng khoảng trắng (workflow.py:247).
  it('thao tác KHÔNG đòi lý do thì thân request không có khoá note', async () => {
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, 'chữ thừa')
    })
    expect(postSpy.mock.calls[0][1]).toEqual({ action: 'approve', expected_state: 'submitted', version: 8 })
  })

  it('gửi đúng expected_state và version được truyền vào, không phải số viết cứng', async () => {
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(NOP, 'returned', 20, '')
    })
    expect(postSpy.mock.calls[0][1]).toEqual({ action: 'submit', expected_state: 'returned', version: 20 })
  })
})

describe('useChuyenTrangThai — sau khi thành công', () => {
  it('làm mới cache của ĐÚNG báo cáo đó', async () => {
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
    expect(invalidateSpy.mock.calls[0][1]).toBe(12)
  })

  it('gửi hỏng thì KHÔNG làm mới cache — số cũ trên dashboard vẫn là số đúng', async () => {
    postSpy.mockRejectedValueOnce(new ApiError(409, { detail: 'Người khác vừa sửa báo cáo này', version: 9 }))
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('duyệt xong: toast "Đã duyệt" kèm link "Xem dashboard" bấm được tới đúng /dashboard', async () => {
    const u = userEvent.setup()
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(screen.getByRole('status').textContent).toContain('Đã duyệt')
    expect(screen.getByText('đang ở trang báo cáo')).toBeTruthy()

    await u.click(screen.getByRole('link', { name: 'Xem dashboard' }))
    expect(screen.getByText('đang ở dashboard')).toBeTruthy()
  })

  it('nộp xong: toast nêu KỲ vừa nộp, và KHÔNG có link nào', async () => {
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(NOP, 'draft', 8, '')
    })
    expect(screen.getByRole('status').textContent).toBe('Đã nộp báo cáo 08/2026')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('trả lại / mở lại: toast nói đúng việc vừa làm, không có link', async () => {
    const { result, unmount } = ren()
    await act(async () => {
      await result.current.xacNhan(TRA_LAI, 'submitted', 8, 'Thiếu số B-8.1')
    })
    expect(screen.getByRole('status').textContent).toBe('Đã trả lại')
    expect(screen.queryByRole('link')).toBeNull()
    unmount()

    const t2 = ren()
    await act(async () => {
      await t2.result.current.xacNhan(MO_LAI, 'approved', 8, 'Sai số giờ công')
    })
    expect(screen.getByRole('status').textContent).toBe('Đã mở lại')
    expect(screen.queryByRole('link')).toBeNull()
  })

  // Câu toast dựng từ `name_vi` của DỮ LIỆU, không tra bảng chuỗi viết cứng: mẫu báo cáo thứ hai
  // đặt tên khác thì toast phải đi theo tên đó.
  it('câu toast đi theo name_vi của mẫu, và chỉ hạ chữ cái ĐẦU (giữ nguyên tên riêng)', async () => {
    const { result } = ren()
    await act(async () => {
      await result.current.xacNhan(
        { ...DUYET, action_code: 'ack', name_vi: 'Gửi Ban ATCL' },
        'submitted', 8, '',
      )
    })
    expect(screen.getByRole('status').textContent).toBe('Đã gửi Ban ATCL')
  })

  // Đo "trước và sau" chứ không đo `queryByRole('status')` là null: store toast của Task 15 là
  // store TOÀN CỤC (components/ui/Toast.tsx) và chỉ tự tắt sau 4 giây, nên toast của ca test
  // trước còn nguyên trong store khi ca này chạy. So hai mốc là cách duy nhất khẳng định đúng
  // điều cần khẳng định: lượt hỏng này không đẻ thêm câu báo thành công nào.
  it('gửi hỏng thì KHÔNG đẻ thêm toast nào — không báo thành công cho việc chưa xong', async () => {
    postSpy.mockRejectedValueOnce(new ApiError(403, { detail: 'Bạn không có quyền' }))
    const { result } = ren()
    const truoc = screen.queryByRole('status')?.textContent ?? null
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(screen.queryByRole('status')?.textContent ?? null).toBe(truoc)
  })
})

describe('useChuyenTrangThai — hình dạng lỗi đẩy lên form', () => {
  it('400 mang danh sách errors nguyên vẹn, không nuốt thành một câu', async () => {
    postSpy.mockRejectedValueOnce(
      new ApiError(400, {
        detail: 'Dữ liệu không hợp lệ',
        errors: [{ indicator_code: 'B-8.1', message: 'Chỉ tiêu bắt buộc' }],
      }),
    )
    const onLoi = vi.fn()
    const { result } = ren({ onLoi })
    await act(async () => {
      await result.current.xacNhan(NOP, 'draft', 8, '')
    })
    // 400 KHÔNG mang `state`/`version` (`services/workflow.py:229`) — hai trường đó phải là `null`
    // chứ không phải một số đoán ra, nếu không form sẽ vá `version` bằng thứ server chưa từng nói.
    expect(onLoi).toHaveBeenCalledWith({
      detail: 'Dữ liệu không hợp lệ',
      errors: [{ indicator_code: 'B-8.1', message: 'Chỉ tiêu bắt buộc' }],
      state: null,
      version: null,
    })
  })

  it('lỗi KHÔNG phải ApiError (mất mạng) nói rõ chưa gửi được, không lộ TypeError', async () => {
    postSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onLoi = vi.fn()
    const { result } = ren({ onLoi })
    await act(async () => {
      await result.current.xacNhan(NOP, 'draft', 8, '')
    })
    expect(onLoi).toHaveBeenCalledWith({
      detail: 'Mất kết nối, chưa gửi được. Thử lại khi có mạng.',
      errors: null,
      state: null,
      version: null,
    })
  })
})

// `TransitionOut` (backend/app/api/reports.py:164) trả `{state, version}` — dữ liệu MỚI NHẤT đang
// có sau một lệnh ghi. Người soát đo được ba hậu quả khi nó bị vứt (S1/S2/S3): nút kế tiếp gửi
// `version` cũ, lượt bấm lại sau 409 lặp đúng số vừa bị từ chối, và cú Lưu đầu tiên sau transition
// dựng một banner 409 sai sự thật.
describe('useChuyenTrangThai — phản hồi của lệnh ghi', () => {
  it('thành công: đẩy NGUYÊN {state, version} của phản hồi lên nơi gọi', async () => {
    postSpy.mockResolvedValueOnce({ state: 'approved', version: 9 })
    const onXong = vi.fn()
    const { result } = ren({ onXong })
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(onXong).toHaveBeenCalledWith({ state: 'approved', version: 9 })
  })

  it('đẩy phản hồi lên TRƯỚC khi dọn cache — lượt GET của invalidate còn phải đi hết một vòng mạng', async () => {
    const onXong = vi.fn()
    const { result } = ren({ onXong })
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(onXong.mock.invocationCallOrder[0]).toBeLessThan(invalidateSpy.mock.invocationCallOrder[0])
  })

  it('gửi hỏng thì KHÔNG gọi onXong — chưa có lệnh ghi nào thành công để mà nhận số mới', async () => {
    postSpy.mockRejectedValueOnce(new ApiError(409, { detail: 'Người khác vừa sửa báo cáo này', state: 'submitted', version: 11 }))
    const onXong = vi.fn()
    const { result } = ren({ onXong })
    await act(async () => {
      await result.current.xacNhan(DUYET, 'submitted', 8, '')
    })
    expect(onXong).not.toHaveBeenCalled()
  })
})

describe('noiDungDialog — câu chữ bốn hộp thoại (spec dòng 682)', () => {
  it('Nộp: nêu kỳ và đơn vị của CHÍNH báo cáo này', () => {
    expect(noiDungDialog(NOP, DAU)).toEqual({
      title: 'Nộp báo cáo 08/2026 của PTSC Đình Vũ?',
      body: 'Sau khi nộp bạn không sửa được cho tới khi Ban ATCL trả lại.',
      confirmLabel: 'Nộp',
      danger: false,
      requireNote: false,
      noteLabel: 'Lý do (người nộp sẽ thấy nguyên văn)',
    })
  })

  it('Duyệt: nêu hậu quả vào tổng toàn Tổng công ty', () => {
    const n = noiDungDialog(DUYET, DAU)
    expect(n.title).toBe('Duyệt báo cáo này?')
    expect(n.body).toBe('Số liệu sẽ vào tổng toàn Tổng công ty.')
    expect(n.confirmLabel).toBe('Duyệt')
    expect(n.danger).toBe(false)
  })

  it('Trả lại: nút danger, nhãn ô lý do đúng nguyên văn', () => {
    const n = noiDungDialog(TRA_LAI, DAU)
    expect(n.danger).toBe(true)
    expect(n.requireNote).toBe(true)
    expect(n.noteLabel).toBe('Lý do trả lại (người nộp sẽ thấy nguyên văn)')
    expect(n.confirmLabel).toBe('Trả lại')
  })

  it('Mở lại: cũng bắt nhập lý do, và nêu hậu quả rời khỏi tổng', () => {
    const n = noiDungDialog(MO_LAI, DAU)
    expect(n.requireNote).toBe(true)
    expect(n.body).toBe('Số liệu sẽ rời khỏi tổng cho tới khi duyệt lại')
    expect(n.confirmLabel).toBe('Mở lại')
  })

  // `requireNote` đọc từ DỮ LIỆU (`requires_note` của GET /templates/{code}), không từ bảng câu
  // chữ: seed đổi cờ đó thì hộp thoại phải đổi theo, không cần ai nhớ sửa thêm một danh sách nữa.
  it('requireNote đi theo requires_note của dữ liệu, không theo action_code', () => {
    expect(noiDungDialog({ ...DUYET, requires_note: true }, DAU).requireNote).toBe(true)
    expect(noiDungDialog({ ...TRA_LAI, requires_note: false }, DAU).requireNote).toBe(false)
  })

  // CONTEXT.md: mẫu báo cáo thứ hai phải chạy được mà không sửa code.
  it('mã hành động lạ rơi về name_vi, không nổ và không hiện chuỗi rỗng', () => {
    const la: ChuyenTrangThai = {
      action_code: 'escalate', from_state: 'submitted', to_state: 'escalated',
      name_vi: 'Chuyển Ban Tổng giám đốc', required_permission: 'report.approve', requires_note: false,
    }
    expect(noiDungDialog(la, DAU)).toEqual({
      title: 'Chuyển Ban Tổng giám đốc?',
      body: undefined,
      confirmLabel: 'Chuyển Ban Tổng giám đốc',
      danger: false,
      requireNote: false,
      noteLabel: 'Lý do (người nộp sẽ thấy nguyên văn)',
    })
  })

  it('kỳ và tên đơn vị lấy từ chính header truyền vào, không phải chuỗi viết cứng', () => {
    const dau2 = { ...DAU, period_key: '2026-09', org_unit: { code: 'P05', name: 'Ban dự án Lô B' } }
    expect(noiDungDialog(NOP, dau2).title).toBe('Nộp báo cáo 09/2026 của Ban dự án Lô B?')
  })
})
