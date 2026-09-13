import { describe, expect, it } from 'vitest'

import { resolveCascadeWinnerFromCss } from './cascade'

// Vòng sửa 3 — P4 (phát hiện nặng nhất của review): sau khi P1 sửa xong, không component nào còn
// hai utility cùng thuộc tính cùng lúc — nghĩa là mọi assert trong ui.test.tsx chỉ còn ĐÚNG MỘT
// lớp ứng viên mỗi lần gọi resolver, không có cuộc đua nào để phân xử. Đảo lõi resolver từ "đứng
// sau thắng" thành "đứng trước thắng" vẫn ra đúng kết quả cho mọi assert đó — 37/37 (nay 67/67)
// vẫn xanh — vì với đúng một ứng viên, thắng-trước hay thắng-sau đều ra cùng một lớp. Quy tắc LÕI
// của resolver chưa từng được một test nào kiểm thật. File này tự dựng CSS để CHỦ ĐỘNG tạo cuộc
// đua nhiều ứng viên, không phụ thuộc CSS thật đang build ra hôm nay (thứ tự utility trong đó do
// Tailwind tự sắp, không phải thứ ta kiểm soát được để ép ra một cuộc đua).
describe('resolveCascadeWinnerFromCss — quy tắc lõi', () => {
  it('hai utility CÙNG thuộc tính CÙNG có mặt → lớp đứng SAU trong CSS thắng (quy tắc lõi)', () => {
    // .a-first đứng trước, .a-second đứng sau trong cùng một chuỗi CSS — đây là "cuộc đua" thật.
    // Đảo chiều so sánh trong resolveCascadeWinnerFromCss (đổi > thành <) phải làm đúng ca này đỏ
    // — đó là tiêu chí nghiệm thu P4, đã tự chạy đột biến này trên file thật (xem báo cáo).
    const css = '.a-first{color:red}.a-second{color:blue}'
    expect(resolveCascadeWinnerFromCss(css, 'a-first a-second', 'color')).toBe('a-second')
  })

  it('lớp là TIỀN TỐ của lớp khác (border-warning không tồn tại, chỉ border-warningEdge có) → null', () => {
    // Xác nhận biên khớp lớp không lẫn vào một tên lớp DÀI HƠN có chứa nó làm tiền tố — đúng cặp
    // tên thật trong dự án (tailwind.config.ts có cả "warning" lẫn "warningEdge").
    const css = '.border-warningEdge{border-color:#f59e0b}'
    expect(resolveCascadeWinnerFromCss(css, 'border-warning', 'border-color')).toBeNull()
  })

  it('lớp không tồn tại trong CSS → null', () => {
    const css = '.bg-surface{background-color:#ffffff}'
    expect(resolveCascadeWinnerFromCss(css, 'khong-ton-tai', 'background-color')).toBeNull()
  })

  it('lớp tồn tại nhưng KHÔNG khai báo thuộc tính đang hỏi → null', () => {
    const css = '.border-hair{border-color:#e8e6e5}'
    expect(resolveCascadeWinnerFromCss(css, 'border-hair', 'margin-top')).toBeNull()
  })

  it('lớp có ký tự đặc biệt trong tên (mt-1.5, text-[12px]) → vẫn khớp được', () => {
    // Hồi quy cho đúng lỗi đã tự phát hiện và sửa ở vòng 2: escape CSS (chèn dấu \ thật) rồi KHÔNG
    // escape lại cho regex khiến mọi lớp có ký tự đặc biệt luôn trả null.
    const css = '.mt-1\\.5{margin-top:calc(var(--spacing) * 1.5)}.text-\\[12px\\]{font-size:12px}'
    expect(resolveCascadeWinnerFromCss(css, 'mt-1.5', 'margin-top')).toBe('mt-1.5')
    expect(resolveCascadeWinnerFromCss(css, 'text-[12px]', 'font-size')).toBe('text-[12px]')
  })

  it('lớp là rule ĐẦU TIÊN ngay sau dấu { mở khối (không qua khoảng trắng) vẫn khớp được', () => {
    // Riêng nguyên nhân 1 của P3: CSS build ra bị minify hoàn toàn, không có khoảng trắng sau dấu
    // { — @media (min-width) THƯỜNG (không tương tác) dùng để tách khỏi lý do loại-vì-tương-tác ở
    // các ca hover bên dưới, chỉ kiểm riêng phần sửa lookbehind.
    const css = '@media (min-width:768px){.p-4{padding:1rem}}'
    expect(resolveCascadeWinnerFromCss(css, 'p-4', 'padding')).toBe('p-4')
  })

  it('lớp hover: → null — CỐ Ý (P3), không phải bỏ sót', () => {
    // Resolver chỉ trả lời cho trạng thái NGHỈ. Rule của hover:bg-mutedbg nằm trong
    // @media (hover:hover) và có :hover ngay sau tên lớp trong selector — cả hai đặc điểm đều là
    // dấu hiệu "chỉ áp dụng lúc tương tác", bị loại có chủ đích, không phải regex tình cờ trượt.
    const css = '@media (hover:hover){.hover\\:bg-mutedbg:hover{background-color:#f5f5f4}}'
    expect(resolveCascadeWinnerFromCss(css, 'hover:bg-mutedbg', 'background-color')).toBeNull()
  })

  it('nút có cả nền nghỉ lẫn hover: → chỉ tính nền nghỉ, bỏ qua rule hover (kịch bản Task 18-26)', () => {
    // Đúng hình dạng nút thật trong InlineError.tsx: "bg-surface ... hover:bg-mutedbg". Nếu
    // resolver lỡ tính luôn rule hover (đứng sau trong CSS thật, offset lớn hơn), kết quả cho
    // trạng thái nghỉ sẽ sai thành bg-mutedbg dù nút chưa được hover.
    const css =
      '.bg-surface{background-color:#ffffff}@media (hover:hover){.hover\\:bg-mutedbg:hover{background-color:#f5f5f4}}'
    expect(resolveCascadeWinnerFromCss(css, 'bg-surface hover:bg-mutedbg', 'background-color')).toBe('bg-surface')
  })
})
