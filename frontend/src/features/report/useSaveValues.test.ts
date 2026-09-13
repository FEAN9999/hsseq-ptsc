// frontend/src/features/report/useSaveValues.test.ts
//
// Hook lưu của form FM01. Ba điều định hình bộ test này:
//
// 1. THÂN REQUEST LÀ `{version, values[]}` (task-23-carry.md C5). Mọi ca có khẳng định về
//    `values` khẳng định luôn `version` trong CÙNG thân — một hook quên hẳn `version` vẫn xanh
//    đủ 8 ca của brief rồi server 409 ở MỌI lần lưu.
// 2. `version` PHẢI lấy từ PHẢN HỒI lần trước (C4). Phản hồi mặc định dưới đây trả 9 (từ 8) nên
//    `phienBan += 1` cũng xanh — vì vậy có riêng một ca trả về 20 để giết đúng đột biến đó.
// 3. 409 CÓ HAI NGHĨA (C2/C6), phân biệt bằng SỰ CÓ MẶT của `values` trong thân lỗi, không bằng
//    chuỗi `detail` (câu đó dựng động từ DB ở backend).
import { createElement, useState, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../../api/client'
import { invalidateReportQueries } from '../../api/invalidate'
import { useSaveValues } from './useSaveValues'
import type { GiaTriBaoCao } from './ReportForm'

// `invalidateReportQueries` là hàm module (không phải phương thức của object) nên không
// `vi.spyOn` được: namespace của ES module đóng băng. Nó đã có bộ test riêng khoá đúng 4 khoá
// cache (api/invalidate.test.ts, Task 17); ở đây chỉ cần khẳng định hook GỌI nó đúng chỗ.
vi.mock('../../api/invalidate', () => ({ invalidateReportQueries: vi.fn() }))
const invalidateSpy = vi.mocked(invalidateReportQueries)

const putSpy = vi.spyOn(api, 'put')

function Boc({ children }: { children: ReactNode }) {
  // Một QueryClient RIÊNG mỗi cây render — `useQueryClient()` trong hook ném lỗi nếu thiếu
  // provider, và dùng chung một client giữa các ca là đường cho trạng thái rò từ ca này sang ca kia.
  const [qc] = useState(() => new QueryClient())
  return createElement(QueryClientProvider, { client: qc }, children)
}

function ren(phienBanDau = 8) {
  const { result, unmount } = renderHook(() => useSaveValues(12, phienBanDau), { wrapper: Boc })
  // `result` của RTL bị niêm phong nên không gắn thêm `unmount` vào được; getter giữ nguyên lối
  // đọc `h.current` (luôn là bản render mới nhất) mà vẫn mang theo `unmount`.
  return {
    get current() {
      return result.current
    },
    unmount,
  }
}

interface ThanPut {
  version: number
  values: Record<string, unknown>[]
}

/** Thân của lần `api.put` thứ `lan` — `mock.calls[lan]` là `[path, body]`. */
function than(lan: number): ThanPut {
  return putSpy.mock.calls[lan][1] as ThanPut
}

/** Đẩy đồng hồ giả rồi vét sạch microtask, TRONG `act` — trạng thái React đổi từ callback của
 * `setTimeout` và từ `.then` của promise, cả hai đều nằm ngoài `act` nếu không bọc. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Promise treo để đo trạng thái GIỮA CHỪNG một request (status 'saving', beforeunload lúc đang bay). */
function treo<T>() {
  let xong!: (v: T) => void
  const p = new Promise<T>((r) => {
    xong = r
  })
  return { p, xong }
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

beforeEach(() => {
  vi.useFakeTimers()
  putSpy.mockReset()
  putSpy.mockResolvedValue({ version: 9, values: [] })
  invalidateSpy.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSaveValues — gửi gì, khi nào', () => {
  it('chỉ gửi ô đã đổi từ lần lưu trước, không gửi cả 55 ô', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 3 })
    })
    await tick(1600)
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy.mock.calls[0][0]).toBe('/reports/12/values')
    expect(than(0)).toEqual({ version: 8, values: [{ indicator_code: 'B-2.1', this_period: 3 }] })
  })

  // C7: ca của brief chỉ đánh dấu MỘT ô rồi kiểm mảng một phần tử — xanh cả khi hook gửi "mọi ô
  // đã từng đổi". Ca này mới đo đúng chữ "từ lần lưu TRƯỚC".
  it('lần lưu thứ hai chỉ mang ô đổi SAU lần lưu thứ nhất, không gửi lại ô cũ', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 3 })
    })
    await tick(1600)
    act(() => {
      h.current.markDirty('B-2.2', { thisPeriod: 4 })
    })
    await tick(1600)
    expect(putSpy).toHaveBeenCalledTimes(2)
    expect(than(1).values).toEqual([{ indicator_code: 'B-2.2', this_period: 4 }])
  })

  it('debounce 1,5 giây gộp nhiều ô đổi thành một request', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(500)
    expect(putSpy).not.toHaveBeenCalled()
    act(() => {
      h.current.markDirty('B-2.2', { thisPeriod: 2 })
    })
    await tick(1600)
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(than(0)).toEqual({
      version: 8,
      values: [
        { indicator_code: 'B-2.1', this_period: 1 },
        { indicator_code: 'B-2.2', this_period: 2 },
      ],
    })
  })

  it('chưa đủ 1,5 giây thì chưa gửi', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1499)
    expect(putSpy).not.toHaveBeenCalled()
    await tick(2)
    expect(putSpy).toHaveBeenCalledTimes(1)
  })

  it('không autosave theo đồng hồ khi không có ô nào đổi', async () => {
    ren()
    await tick(30_000)
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('Ctrl+S lưu ngay, không chờ debounce', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    await act(async () => {
      await h.current.saveNow()
    })
    expect(putSpy).toHaveBeenCalledTimes(1)
    // Hẹn giờ cũ phải bị huỷ: còn sót thì 1,5 s sau có thêm một PUT rỗng bơm `version` lên một nấc.
    await tick(3000)
    expect(putSpy).toHaveBeenCalledTimes(1)
  })

  // Mỗi lần đánh dấu là một mốc debounce MỚI, kể cả khi vừa có một lượt Ctrl+S xen vào giữa.
  it('sau Ctrl+S, ô gõ tiếp vẫn được chờ đủ 1,5 giây', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(100)
    await act(async () => {
      await h.current.saveNow()
    })
    expect(putSpy).toHaveBeenCalledTimes(1)
    act(() => {
      h.current.markDirty('B-2.2', { thisPeriod: 2 })
    })
    // Mốc 1,5 s của lần đánh dấu ĐẦU đã trôi qua; mốc của lần thứ hai thì chưa.
    await tick(1450)
    expect(putSpy).toHaveBeenCalledTimes(1)
    await tick(100)
    expect(putSpy).toHaveBeenCalledTimes(2)
  })

  // Backend tăng `version` cho MỌI lần ghi, kể cả payload rỗng (services/reports.py:507) — một
  // PUT "cho chắc" lúc không có gì đổi làm mọi tab khác đang mở cùng báo cáo tự dính 409.
  it('saveNow khi không có ô nào đổi thì không gửi request nào', async () => {
    const h = ren()
    await act(async () => {
      await h.current.saveNow()
    })
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('đánh dấu cùng một ô hai lần thì chỉ gửi giá trị cuối', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
      h.current.markDirty('B-2.1', { thisPeriod: 7 })
    })
    await tick(1600)
    expect(than(0).values).toEqual([{ indicator_code: 'B-2.1', this_period: 7 }])
  })

  it('hai cột của cùng một dòng gộp vào MỘT mục values, đếm là 2 ô', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-3.1', { thisPeriod: 2 })
      h.current.markDirty('B-3.1', { accTotal: 9 })
    })
    expect(h.current.dirtyCount).toBe(2)
    await tick(1600)
    expect(than(0).values).toEqual([{ indicator_code: 'B-3.1', this_period: 2, acc_total_entered: 9 }])
  })

  it('ghi chú đổi thì gửi trường note, không gửi kèm cột số nào', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { note: 'Bộ đếm lệch do chuyển ca' })
    })
    await tick(1600)
    expect(than(0).values).toEqual([{ indicator_code: 'B-2.1', note: 'Bộ đếm lệch do chuyển ca' }])
  })

  // Xoá trắng một ô là thao tác có thật; khoá `this_period` phải CÓ MẶT với giá trị null, nếu
  // không thì không phân biệt được "ô này vừa bị xoá" với "ô này không đổi".
  it('xoá trắng ô vẫn gửi khoá this_period với giá trị null', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: null })
    })
    await tick(1600)
    expect(than(0).values).toEqual([{ indicator_code: 'B-2.1', this_period: null }])
  })

  it('rời màn hình (unmount) thì huỷ hẹn, không gửi request nữa', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    h.unmount()
    await tick(3000)
    expect(putSpy).not.toHaveBeenCalled()
  })
})

describe('useSaveValues — version (khoá lạc quan)', () => {
  it('version của lần lưu kế tiếp lấy từ PHẢN HỒI, không phải tự cộng 1', async () => {
    putSpy.mockResolvedValueOnce({ version: 20, values: [] })
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    act(() => {
      h.current.markDirty('B-2.2', { thisPeriod: 2 })
    })
    await tick(1600)
    expect(than(1).version).toBe(20)
  })

  it('hai lần đánh dấu chồng lên một request đang bay: không gửi chồng, lượt sau dùng version mới', async () => {
    const cho = treo<{ version: number; values: GiaTriBaoCao[] }>()
    putSpy.mockReturnValueOnce(cho.p)
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(putSpy).toHaveBeenCalledTimes(1)

    // Gõ tiếp trong lúc request đầu còn treo: KHÔNG được gửi lượt hai với version cũ (chắc chắn 409).
    act(() => {
      h.current.markDirty('B-2.2', { thisPeriod: 2 })
    })
    await tick(1600)
    expect(putSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      cho.xong({ version: 31, values: [] })
    })
    await tick(1600)
    expect(putSpy).toHaveBeenCalledTimes(2)
    expect(than(1)).toEqual({ version: 31, values: [{ indicator_code: 'B-2.2', this_period: 2 }] })
  })
})

describe('useSaveValues — trạng thái và mốc giờ', () => {
  it('lưu xong đặt status saved và giờ dạng 14:02', async () => {
    vi.setSystemTime(new Date('2026-09-20T07:02:00Z')) // 14:02 giờ VN
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    await tick(1600)
    expect(h.current.status).toBe('saved')
    expect(h.current.savedAt).toBe('14:02')
    expect(h.current.dirtyCount).toBe(0)
  })

  it('chưa làm gì thì status idle và chưa có mốc giờ', () => {
    const h = ren()
    expect(h.current.status).toBe('idle')
    expect(h.current.savedAt).toBeNull()
    expect(h.current.dirtyCount).toBe(0)
  })

  it('đánh dấu xong mà chưa hết debounce thì status dirty', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    expect(h.current.status).toBe('dirty')
    expect(h.current.dirtyCount).toBe(1)
    await tick(500)
    expect(h.current.status).toBe('dirty')
  })

  it('trong lúc request đang bay thì status saving', async () => {
    const cho = treo<{ version: number; values: GiaTriBaoCao[] }>()
    putSpy.mockReturnValueOnce(cho.p)
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    await tick(1600)
    expect(h.current.status).toBe('saving')
    await act(async () => {
      cho.xong({ version: 9, values: [] })
    })
    expect(h.current.status).toBe('saved')
  })

  it('gõ tiếp trong lúc đang bay: lưu xong vẫn là dirty, không phải saved', async () => {
    const cho = treo<{ version: number; values: GiaTriBaoCao[] }>()
    putSpy.mockReturnValueOnce(cho.p)
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    await tick(1600)
    act(() => {
      h.current.markDirty('B-2.2', { thisPeriod: 6 })
    })
    await act(async () => {
      cho.xong({ version: 9, values: [] })
    })
    expect(h.current.status).toBe('dirty')
    expect(h.current.dirtyCount).toBe(1)
  })
})

describe('useSaveValues — phản hồi PUT ghi ngược lại form (C9)', () => {
  // Task 22 cố ý KHÔNG chép `evaluate_computed` sang TypeScript, nên hook này là con đường DUY
  // NHẤT để dòng "Tổng giờ công" (B-1.4 = B-1.1 + B-1.2 + B-1.3) đổi số trên màn hình.
  it('đẩy values của phản hồi lên nơi gọi, không chỉ lấy version', async () => {
    const values = [giaTri({ indicator_code: 'B-1.4', this_period: 402_100, acc_total_computed: 800_000 })]
    putSpy.mockResolvedValueOnce({ version: 9, values })
    const h = ren()
    act(() => {
      h.current.markDirty('B-1.1', { thisPeriod: 402_100 })
    })
    await tick(1600)
    expect(h.current.giaTriMoi?.values).toEqual(values)
    expect(h.current.giaTriMoi?.version).toBe(9)
  })

  it('mỗi lần lưu đẩy ra một object MỚI để nơi gọi nhận theo danh tính', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-1.1', { thisPeriod: 1 })
    })
    await tick(1600)
    const lan1 = h.current.giaTriMoi
    act(() => {
      h.current.markDirty('B-1.1', { thisPeriod: 2 })
    })
    await tick(1600)
    expect(h.current.giaTriMoi).not.toBe(lan1)
  })

  it('lưu thành công thì gọi invalidateReportQueries', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    await tick(1600)
    expect(invalidateSpy).toHaveBeenCalledWith(expect.anything(), 12)
  })

  it('lưu hỏng thì KHÔNG gọi invalidateReportQueries', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 5 })
    })
    await tick(1600)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useSaveValues — đường lỗi', () => {
  it('mạng lỗi thì giữ dirty, bật cờ offline, và gửi lại khi có mạng trở lại', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(h.current.status).toBe('error')
    expect(h.current.dirtyCount).toBe(1)
    expect(h.current.offline).toBe(true)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(putSpy).toHaveBeenCalledTimes(2)
    expect(than(1)).toEqual({ version: 8, values: [{ indicator_code: 'B-2.1', this_period: 1 }] })
    expect(h.current.offline).toBe(false)
    expect(h.current.status).toBe('saved')
  })

  it('có mạng trở lại mà không còn ô nào chưa lưu thì không gửi gì', async () => {
    ren()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('ô gõ trong lúc mất mạng không bị lượt gửi lại nuốt mất giá trị mới', async () => {
    putSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 9 })
    })
    await tick(1600)
    expect(than(1).values).toEqual([{ indicator_code: 'B-2.1', this_period: 9 }])
  })

  // M8: ô gõ ĐÈ trong lúc request còn bay rồi request đó hỏng — lượt trả hàng chờ phải giữ bản
  // MỚI. Trả nguyên si bản cũ về là xoá đúng con số người dùng vừa gõ dưới tay họ.
  it('gửi hỏng không đè bản cũ lên ô người dùng vừa gõ trong lúc request bay', async () => {
    const cho = treo<{ version: number; values: GiaTriBaoCao[] }>()
    putSpy.mockReturnValueOnce(cho.p)
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 9 })
    })
    await act(async () => {
      cho.xong(Promise.reject(new TypeError('Failed to fetch')) as never)
    })
    await tick(1600)
    expect(than(1).values).toEqual([{ indicator_code: 'B-2.1', this_period: 9 }])
  })

  // C1/C2: 409 "người khác vừa sửa" mang sẵn `values` hiện tại của server — vẽ lại bảng thẳng từ
  // thân lỗi, KHÔNG gọi lại GET.
  it('409 kèm values: giữ ô đang gõ, cập nhật version, đẩy tín hiệu xung đột ra ngoài', async () => {
    putSpy.mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Người khác vừa sửa báo cáo này',
        state: 'draft',
        version: 11,
        values: [giaTri({ indicator_code: 'B-1.4', this_period: 7 })],
      }),
    )
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)

    expect(h.current.xungDot?.detail).toBe('Người khác vừa sửa báo cáo này')
    expect(h.current.xungDot?.version).toBe(11)
    expect(h.current.xungDot?.values).toEqual([giaTri({ indicator_code: 'B-1.4', this_period: 7 })])
    // Ô người dùng đang gõ KHÔNG bị vứt: vẫn nằm trong hàng chờ và gửi lại được.
    expect(h.current.dirtyCount).toBe(1)
    expect(putSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      await h.current.saveNow()
    })
    expect(than(1)).toEqual({ version: 11, values: [{ indicator_code: 'B-2.1', this_period: 1 }] })
  })

  // C2: 409 thứ hai (thao tác không hợp lệ ở trạng thái hiện tại) KHÔNG mang `values` — không có
  // gì để vẽ lại bảng. Phân biệt bằng sự CÓ MẶT của `values`, không bằng chuỗi `detail`.
  it('409 không kèm values: không đẩy tín hiệu vẽ lại bảng, chỉ hiện detail nguyên văn', async () => {
    putSpy.mockRejectedValueOnce(
      new ApiError(409, { detail: 'Không thể "Nộp báo cáo" ở trạng thái hiện tại', state: 'submitted', version: 11 }),
    )
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(h.current.xungDot).toBeNull()
    expect(h.current.loiLuu).toBe('Không thể "Nộp báo cáo" ở trạng thái hiện tại')
    expect(h.current.status).toBe('error')
    expect(h.current.dirtyCount).toBe(1)
    expect(h.current.offline).toBe(false)
  })

  // C3: sai luật nghiệp vụ là 400, KHÔNG phải 422.
  it('400 giữ ô chưa lưu và hiện detail nguyên văn của server', async () => {
    putSpy.mockRejectedValueOnce(
      new ApiError(400, {
        detail: 'Dữ liệu không hợp lệ',
        errors: [{ indicator_code: 'B-2.1', message: 'Số không được âm' }],
      }),
    )
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: -1 })
    })
    await tick(1600)
    expect(h.current.loiLuu).toBe('Dữ liệu không hợp lệ')
    expect(h.current.offline).toBe(false)
    expect(h.current.dirtyCount).toBe(1)
  })

  it('403 (trạng thái không cho sửa) hiện nguyên văn detail, không nói "mất kết nối"', async () => {
    putSpy.mockRejectedValueOnce(new ApiError(403, { detail: 'Báo cáo ở trạng thái không cho sửa' }))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(h.current.loiLuu).toBe('Báo cáo ở trạng thái không cho sửa')
    expect(h.current.offline).toBe(false)
  })

  it('lưu lại thành công thì xoá câu lỗi cũ', async () => {
    putSpy.mockRejectedValueOnce(new ApiError(400, { detail: 'Dữ liệu không hợp lệ' }))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(h.current.loiLuu).toBe('Dữ liệu không hợp lệ')
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 2 })
    })
    await tick(1600)
    expect(h.current.loiLuu).toBeNull()
    expect(h.current.status).toBe('saved')
  })

  // `saveNow` huỷ hẹn đang chờ. Không huỷ thì cái hẹn còn sót biến một lượt lưu HỎNG thành một
  // lượt tự gửi lại âm thầm 1,5 giây sau — thiết kế chỉ cho gửi lại khi CÓ MẠNG TRỞ LẠI hoặc khi
  // người dùng tự lưu tiếp, chứ không phải cứ đều đều nện vào một server đang từ chối.
  it('lưu hỏng rồi thì KHÔNG tự gửi lại theo đồng hồ', async () => {
    putSpy.mockRejectedValueOnce(new ApiError(403, { detail: 'Báo cáo ở trạng thái không cho sửa' }))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(100)
    await act(async () => {
      await h.current.saveNow()
    })
    expect(putSpy).toHaveBeenCalledTimes(1)
    await tick(5000)
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(h.current.dirtyCount).toBe(1)
  })

  it('saveNow trả false khi lưu hỏng và true khi lưu được', async () => {
    putSpy.mockRejectedValueOnce(new ApiError(400, { detail: 'Dữ liệu không hợp lệ' }))
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    let ket: boolean | undefined
    await act(async () => {
      ket = await h.current.saveNow()
    })
    expect(ket).toBe(false)
    await act(async () => {
      ket = await h.current.saveNow()
    })
    expect(ket).toBe(true)
  })
})

describe('useSaveValues — beforeunload', () => {
  function banBeforeUnload(): boolean {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('còn ô chưa lưu thì beforeunload chặn đóng tab', () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    expect(banBeforeUnload()).toBe(true)
  })

  // Chặn phải đi qua `preventDefault` — đó là cách CHUẨN hiện nay (Chrome bỏ `returnValue` dạng
  // chuỗi từ lâu). jsdom cũng dựng cờ khi gán `returnValue`, nên chỉ đo `defaultPrevented` thì
  // một bản chỉ gán `returnValue` vẫn xanh mà trình duyệt thật thì thả tab đi mất.
  it('chặn bằng chính preventDefault, không chỉ bằng returnValue', () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    const e = new Event('beforeunload', { cancelable: true })
    const chan = vi.spyOn(e, 'preventDefault')
    window.dispatchEvent(e)
    expect(chan).toHaveBeenCalled()
  })

  it('chưa đổi ô nào thì beforeunload KHÔNG chặn', () => {
    ren()
    expect(banBeforeUnload()).toBe(false)
  })

  it('lưu xong hết thì beforeunload thôi chặn', async () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(banBeforeUnload()).toBe(false)
  })

  it('đang gửi dở (chưa biết kết quả) vẫn chặn đóng tab', async () => {
    const cho = treo<{ version: number; values: GiaTriBaoCao[] }>()
    putSpy.mockReturnValueOnce(cho.p)
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    await tick(1600)
    expect(h.current.dirtyCount).toBe(0) // đã rời hàng chờ, nhưng chưa có xác nhận nào từ server
    expect(banBeforeUnload()).toBe(true)
  })

  it('rời màn hình rồi thì beforeunload không còn chặn (gỡ listener)', () => {
    const h = ren()
    act(() => {
      h.current.markDirty('B-2.1', { thisPeriod: 1 })
    })
    h.unmount()
    expect(banBeforeUnload()).toBe(false)
  })
})
