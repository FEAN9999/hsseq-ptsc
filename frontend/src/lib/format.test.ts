// frontend/src/lib/format.test.ts
import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDue, formatNumber, formatPeriod, formatTime } from './format'

describe('format', () => {
  it('kỳ hiện 08/2026 chứ không phải 2026-08', () => {
    expect(formatPeriod('2026-08')).toBe('08/2026')
  })

  it('thời điểm theo giờ Việt Nam', () => {
    // 2026-09-05T10:00:00Z = 17:00 giờ VN
    expect(formatDateTime('2026-09-05T10:00:00Z')).toBe('05/09/2026 17:00')
  })

  it('giờ:phút theo giờ Việt Nam, đệm 0 ở đầu', () => {
    // 2026-09-20T07:02:00Z = 14:02 giờ VN
    expect(formatTime('2026-09-20T07:02:00Z')).toBe('14:02')
    // 2026-09-20T02:05:00Z = 09:05 giờ VN — giờ một chữ số vẫn phải là "09", không phải "9"
    expect(formatTime('2026-09-20T02:05:00Z')).toBe('09:05')
  })

  // Nửa đêm giờ VN: `hour12: false` ở vài phiên bản ICU cho "24:00" thay vì "00:00". Khoá lại vì
  // ca lưu lúc 00:xx là ca người nhập gõ nốt trước hạn cuối tháng, không phải ca hiếm.
  it('nửa đêm giờ Việt Nam hiện 00:xx, không phải 24:xx', () => {
    expect(formatTime('2026-09-19T17:03:00Z')).toBe('00:03')
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

  // task-16-fix-brief.md F8: hạn là 23:59:59 giờ VN của chính hôm nay nên còn trọn ngày —
  // "còn 0 ngày" đọc như đã hết hạn. Chỉ ca soNgay===0 đổi thành "hạn hôm nay".
  it('hạn đúng hôm nay thì hiện "hạn hôm nay", không phải "còn 0 ngày"', () => {
    const r = formatDue('2026-09-09T16:59:59Z', new Date('2026-09-09T03:00:00Z'))
    expect(r.text).toBe('hạn hôm nay')
  })

  it('số theo vi-VN, dấu chấm ngăn ngàn', () => {
    expect(formatNumber(1284500, 0)).toBe('1.284.500')
    expect(formatNumber(12.5, 2)).toBe('12,50')
  })

  it('null hiện — chứ không hiện 0', () => {
    expect(formatNumber(null, 0)).toBe('—')
  })

  // task-16-fix-brief.md F7: hiệu số của dòng computed có thể ra -0 (số học hợp lệ) —
  // Intl.NumberFormat nhìn dấu bit nên .format(-0) ra "-0", sai khi hiện lên màn hình.
  it('-0 hiện "0", không hiện "-0"', () => {
    expect(formatNumber(-0, 0)).toBe('0')
  })
})
