// frontend/src/lib/format.test.ts
import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDue, formatNumber, formatPeriod } from './format'

describe('format', () => {
  it('kỳ hiện 08/2026 chứ không phải 2026-08', () => {
    expect(formatPeriod('2026-08')).toBe('08/2026')
  })

  it('thời điểm theo giờ Việt Nam', () => {
    // 2026-09-05T10:00:00Z = 17:00 giờ VN
    expect(formatDateTime('2026-09-05T10:00:00Z')).toBe('05/09/2026 17:00')
  })

  it('hạn nộp còn hạn thì đếm ngược, title là ngày tuyệt đối', () => {
    const r = formatDue('2026-09-12T16:59:59Z', new Date('2026-09-09T03:00:00Z'))
    expect(r.text).toBe('còn 3 ngày')
    expect(r.title).toContain('12/09/2026')
  })

  it('quá hạn thì đếm xuôi', () => {
    const r = formatDue('2026-09-07T16:59:59Z', new Date('2026-09-09T03:00:00Z'))
    expect(r.text).toBe('quá hạn 2 ngày')
  })

  it('số theo vi-VN, dấu chấm ngăn ngàn', () => {
    expect(formatNumber(1284500, 0)).toBe('1.284.500')
    expect(formatNumber(12.5, 2)).toBe('12,50')
  })

  it('null hiện — chứ không hiện 0', () => {
    expect(formatNumber(null, 0)).toBe('—')
  })
})
