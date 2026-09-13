// frontend/src/api/invalidate.test.ts
//
// F8 (vòng sửa 1): bỏ một dòng invalidate vẫn 110/110 xanh — hệ quả thật là dashboard hiện số cũ
// tới 30s sau khi Duyệt/Nộp/Trả lại, đúng điều chính comment của invalidate.ts nói phải tránh.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { invalidateReportQueries } from './invalidate'

function layCacKeyDaInvalidate(qc: QueryClient) {
  const spy = vi.spyOn(qc, 'invalidateQueries')
  return spy
}

describe('invalidateReportQueries', () => {
  it('luôn invalidate dashboard, status, reports', () => {
    const qc = new QueryClient()
    const spy = layCacKeyDaInvalidate(qc)
    invalidateReportQueries(qc)
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['dashboard'])
    expect(keys).toContainEqual(['status'])
    expect(keys).toContainEqual(['reports'])
  })

  it('có reportId thì invalidate thêm đúng report đó (ép về string)', () => {
    const qc = new QueryClient()
    const spy = layCacKeyDaInvalidate(qc)
    invalidateReportQueries(qc, 42)
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['report', '42'])
  })

  it('không có reportId thì KHÔNG invalidate query report đơn lẻ nào', () => {
    const qc = new QueryClient()
    const spy = layCacKeyDaInvalidate(qc)
    invalidateReportQueries(qc)
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys.some((k) => k[0] === 'report')).toBe(false)
  })
})
