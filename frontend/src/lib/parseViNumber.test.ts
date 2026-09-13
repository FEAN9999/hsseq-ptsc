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

  // task-21-fix-1.md S1 — LỖI NẶNG NHẤT của vòng nộp trước: bỏ MỌI dấu chấm vô điều kiện nên
  // dấu chấm THẬP PHÂN kiểu en-US/Excel (không phải dấu ngăn hàng nghìn) bị nuốt luôn, nhân số
  // lên âm thầm ×10/×100, và '.' đơn độc hoá thành 0 (phá thẳng ràng buộc "không bao giờ hiện
  // 0"). Bốn giá trị này là "Test bắt buộc" nêu đích danh trong fix-1.md.
  it.each([
    ['1284500.00', 2],
    ['0.5', 2],
    ['1.23', 2],
    ['.', 0],
  ])('10. "%s" không khớp nhóm hàng nghìn vi-VN hợp lệ → lỗi, KHÔNG âm thầm nhân 10/100 (fix-1 S1)', (raw, decimals) => {
    const r = parseViNumber(raw, decimals)
    expect(r.value).toBeNull()
    expect(r.error).toBe('Chỉ nhập số')
  })

  // Không thuộc "Test bắt buộc" của S1 nhưng cùng lỗ hổng: dấu chấm đứng riêng không có chữ số
  // đứng trước ('.5') cũng phải lỗi, không được hiểu ngầm là "0.5".
  it('10b. ".5" (chấm đứng đầu, không có chữ số phần nguyên) cũng báo lỗi (fix-1 S1)', () => {
    const r = parseViNumber('.5', 1)
    expect(r.value).toBeNull()
    expect(r.error).toBe('Chỉ nhập số')
  })

  // Số ÂM viết bằng nhóm hàng nghìn hợp lệ vẫn phải báo ĐÚNG lỗi "âm" (không lệch sang "Chỉ nhập
  // số") — S1 thêm dấu `-?` tuỳ chọn vào đầu mẫu so với nguyên văn regex nêu trong fix-1.md (chỉ
  // `/^\d{1,3}(\.\d{3})+(,\d+)?$/`, không có dấu trừ) để tránh việc chặn nhầm số âm hợp lệ về mặt
  // ngữ pháp thành đúng lỗi mà brief test 6 đã khẳng định phải là 'Số không được âm'. Ghi rõ trong
  // report mục 4 (Vòng sửa 1) — đây là chỗ tôi tự nới thêm so với văn bản gốc.
  it('10c. số âm viết bằng nhóm hàng nghìn hợp lệ báo ĐÚNG lỗi "âm", không lẫn sang "Chỉ nhập số" (quyết định tự đưa ra khi vá S1)', () => {
    const r = parseViNumber('-1.284.500', 0)
    expect(r.value).toBeNull()
    expect(r.error).toBe('Số không được âm')
  })

  // task-21-review.md N8 — reviewer đo mutation ".replace(',', '.')" → ".replace(/,/g, '.')"
  // "sống" vì không ca nào có ≥2 dấu phẩy. Thêm ca này cho HÀNH VI thật (nhiều dấu phẩy phải lỗi,
  // không được âm thầm ghép nhầm số) — nhưng đã CHỨNG MINH bằng thực nghiệm (xem task-21-report.md
  // mục "Vòng sửa 1"): với ≥2 dấu phẩy, "chỉ đổi dấu đầu" và "đổi mọi dấu" luôn cho CÙNG kết quả
  // (dấu phẩy thừa sót lại hoặc ≥2 dấu chấm đều làm Number() ra NaN như nhau) — nên ca này không
  // thể phân biệt hai cách viết đó; N8 là một dead mutant thật, không phải lỗ hổng bị bỏ sót.
  it('11. nhiều hơn một dấu phẩy trong chuỗi báo lỗi, không âm thầm ghép nhầm số (task-21-review.md N8)', () => {
    const r = parseViNumber('12,34,56', 2)
    expect(r.value).toBeNull()
    expect(r.error).toBe('Chỉ nhập số')
  })
})
