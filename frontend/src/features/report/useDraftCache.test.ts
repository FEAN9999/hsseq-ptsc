// frontend/src/features/report/useDraftCache.test.ts
//
// Ca hook MỘT MÌNH (renderHook) — chỉ đo HỢP ĐỒNG lưu trữ: ghi/đọc/xoá đúng khoá sessionStorage.
// task-29-scope.md: renderHook tự gọi hook, không ai khác gọi — nên bộ ca này KHÔNG chứng minh
// được trang thật giữ số qua 401. Bằng chứng đó nằm ở `ReportForm.test.tsx`, khối "Task 29".
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useDraftCache } from './useDraftCache'

afterEach(() => {
  sessionStorage.removeItem('draft:12')
})

describe('useDraftCache', () => {
  it('gõ, hết hạn token, đăng nhập lại thì số chưa lưu vẫn còn', () => {
    const { result } = renderHook(() => useDraftCache(12))
    act(() => result.current.luu({ 'B-2.1': { thisPeriod: 7 } }))
    expect(JSON.parse(sessionStorage.getItem('draft:12')!)['B-2.1'].thisPeriod).toBe(7)

    // Mô phỏng "đăng nhập lại": một lượt renderHook MỚI, không chia sẻ gì với lượt trên ngoài
    // sessionStorage — đúng như một `ReportForm` mount lại từ đầu sau khi trang đã chết.
    const lai = renderHook(() => useDraftCache(12))
    expect(lai.result.current.doc()!['B-2.1'].thisPeriod).toBe(7)
  })

  it('lưu thành công thì xoá cache, không hồi số cũ đè số mới', () => {
    const { result } = renderHook(() => useDraftCache(12))
    act(() => {
      result.current.luu({ 'B-2.1': { thisPeriod: 7 } })
      result.current.xoa()
    })
    expect(sessionStorage.getItem('draft:12')).toBeNull()
  })
})
