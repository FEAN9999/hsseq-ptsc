// frontend/src/lib/parseViNumber.test.ts
import { describe, expect, it } from 'vitest'
import { parseViNumber } from './parseViNumber'

describe('parseViNumber', () => {
  it('1. bỏ dấu chấm ngăn ngàn', () => {
    expect(parseViNumber('1.284.500', 0).value).toBe(1284500)
  })

  it('2. bỏ khoảng trắng người dùng dán từ Excel', () => {
    expect(parseViNumber(' 1 284 500 ', 0).value).toBe(1284500)
  })

  it('3. dấu phẩy là thập phân khi decimals > 0', () => {
    expect(parseViNumber('12,35', 2).value).toBe(12.35)
  })

  it('4. dấu phẩy KHÔNG phải thập phân khi decimals = 0', () => {
    const r = parseViNumber('12,35', 0)
    expect(r.value).toBeNull()
    expect(r.error).toContain('thập phân')
  })

  it('5. ký tự lạ báo Chỉ nhập số', () => {
    expect(parseViNumber('abc', 0).error).toBe('Chỉ nhập số')
  })

  it('6. số âm báo lỗi tại ô, khớp với 400 của server', () => {
    expect(parseViNumber('-5', 0).error).toContain('âm')
  })

  it('7. quá số chữ số thập phân báo lỗi', () => {
    expect(parseViNumber('12,345', 2).error).toContain('thập phân')
  })

  it('8. chuỗi rỗng là null chứ không phải 0', () => {
    expect(parseViNumber('', 0)).toEqual({ value: null, error: null })
  })

  // Thêm ngoài 8 test bắt buộc của brief — task-21-carry.md C1 chốt thêm một luật mà brief không
  // test: giới hạn độ lớn 10**16 (GIOI_HAN_DO_LON, Ruling 130, report_rules.py:71). Không ca nào
  // trong 8 ca trên chạm nhánh này; bảng đột biến bắt buộc của task liệt đích danh "bỏ giới hạn
  // 10 ** 16" nên phải có một khẳng định bắt được nó — thiếu nó là đúng lỗ hổng "test xanh nhưng
  // mù trước chính thứ nó khai đang kiểm tra" mà phiên này bị cấm để lọt.
  it('9. số lớn hơn hoặc bằng 10^16 báo lỗi quá lớn (carry C1)', () => {
    const r = parseViNumber('10000000000000000', 0)
    expect(r.value).toBeNull()
    expect(r.error).toBe('Số quá lớn, tối đa 16 chữ số phần nguyên')
  })
})
