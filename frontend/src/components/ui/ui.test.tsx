import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Chip } from './Chip'
import { Tile } from './Tile'
// Vòng sửa 2: mọi assert nói về giá trị THIẾT KẾ HIỂN THỊ (màu nền/viền/chữ, margin) phải hỏi
// resolver "lớp nào thắng cascade trong CSS thật đã build", không hỏi className có chứa chuỗi gì —
// xem giải thích đầy đủ trong cascade.ts.
import { resolveCascadeWinner } from './cascade'

describe('Chip', () => {
  it.each([
    ['approved', 'Đã duyệt'],
    ['submitted', 'Đã nộp'],
    ['late', 'Đã nộp (muộn)'],
    ['returned', 'Trả lại'],
    ['draft', 'Nháp'],
    ['missing', 'Chưa nộp'],
  ])('chip %s luôn có chữ, không chỉ có màu', (kind, chu) => {
    render(<Chip kind={kind as never} />)
    expect(screen.getByText(chu)).toBeTruthy()
  })

  it('source=seed thì viền rỗng, nền trong suốt', () => {
    const { container } = render(<Chip kind="approved" outline />)
    expect(container.firstElementChild?.className).toContain('bg-transparent')
  })

  // Thêm ngoài brief: mutation-test M3 phát hiện lỗ hổng — bộ test gốc chỉ khẳng định CHỮ của
  // chip, đổi lộn màu nền giữa các kind (vd. "returned" tô nhầm màu success) vẫn xanh. CONTEXT.md
  // bắt buộc vá khi mutation còn xanh.
  // Vòng sửa 2: chuyển sang resolver — trước đây `toContain(bgClass)` vẫn xanh dù một bg-* khác
  // đứng sau trong CSS đè mất màu này trên màn hình.
  it.each([
    ['approved', 'bg-successBg'],
    ['submitted', 'bg-warningBg'],
    ['late', 'bg-warningBg'],
    ['returned', 'bg-dangerBg'],
    ['draft', 'bg-mutedbg'],
  ])('chip %s tô đúng màu nền theo kind, không lẫn sang kind khác', (kind, bgClass) => {
    const { container } = render(<Chip kind={kind as never} />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'background-color')).toBe(bgClass)
  })

  // Vòng sửa 1 — S1: utility border-color cùng độ đặc hiệu, cái đứng SAU trong CSS build ra thắng
  // bất kể thứ tự viết trong JSX. Chuỗi className "chứa" border-hair/border-current vẫn ĐÚNG dù
  // border-transparent đứng sau đã đè mất viền trên màn hình — test theo substring không bắt được.
  //
  // Vòng sửa 2: bản đếm "đúng 1 utility border-(transparent|current|hair)" của vòng 1 dùng danh
  // sách ĐÓNG — mutation thêm hẳn một màu thứ tư (vd. border-danger) khiến đếm ra 2, phải đỏ, xong
  // KHÔNG NẰM TRONG danh sách đóng của regex nên không đếm được, vẫn xanh trong khi màn hình sai.
  // Sửa triệt để: không đếm số lượng khớp theo tên đã biết trước — hỏi thẳng resolver "border-color
  // thắng cascade là lớp nào" rồi so với đúng MỘT lớp mong đợi theo kind/outline. Không danh sách
  // đóng nào để mutation lách qua.
  it.each([
    ['approved', false, 'border-transparent'],
    ['submitted', false, 'border-transparent'],
    ['late', false, 'border-transparent'],
    ['returned', false, 'border-transparent'],
    ['draft', false, 'border-transparent'],
    ['missing', false, 'border-hair'],
    ['approved', true, 'border-current'],
    ['submitted', true, 'border-current'],
    ['late', true, 'border-current'],
    ['returned', true, 'border-current'],
    ['draft', true, 'border-current'],
    ['missing', true, 'border-current'],
  ])('kind=%s outline=%s → cascade cho border-color phải thắng đúng %s, không lẫn cascade khác', (kind, outline, expectedBorder) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'border-color')).toBe(expectedBorder)
  })

  it('missing (Chưa nộp) có viền hairline thật #e8e6e5, không phải transparent bị cascade đè', () => {
    const { container } = render(<Chip kind="missing" />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'border-color')).toBe('border-hair')
  })

  it('outline luôn hiện viền border-current — biến thể c-seed (D6) không được chết vì cascade', () => {
    const { container } = render(<Chip kind="approved" outline />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'border-color')).toBe('border-current')
  })
})

describe('Tile', () => {
  it('LTI > 0 thì nền danger', () => {
    const { container } = render(<Tile label="LTI trong kỳ" value={2} unit="vụ" danger />)
    expect(container.firstElementChild?.className).toContain('bg-dangerBg')
  })

  it('value null thì hiện — kèm aria-label chưa có dữ liệu', () => {
    render(<Tile label="LTI trong kỳ" value={null} unit="vụ" />)
    expect(screen.getByLabelText('chưa có dữ liệu').textContent).toBe('—')
  })

  it('ô chỉ có nhãn + số + đơn vị, không dòng phụ', () => {
    const { container } = render(<Tile label="LTI trong kỳ" value={0} unit="vụ" />)
    expect(container.querySelectorAll('div, span').length).toBeLessThanOrEqual(4)
  })

  // Thêm ngoài brief: mutation-test M4 phát hiện lỗ hổng — nếu code coi value=0 như "chưa có dữ
  // liệu" (lỗi kinh điển `!value` thay vì `=== null`), test đếm phần tử ở trên vẫn xanh vì cả hai
  // nhánh đều ra ≤4 phần tử. Test này khẳng định GIÁ TRỊ hiển thị, không chỉ đếm.
  it('value=0 hiện số 0 thật, KHÔNG bị coi như chưa có dữ liệu', () => {
    render(<Tile label="LTI trong kỳ" value={0} unit="vụ" />)
    expect(screen.queryByLabelText('chưa có dữ liệu')).toBeNull()
    expect(screen.getByText('0')).toBeTruthy()
  })

  // Vòng sửa 1 — S2: nhãn dùng nhầm text-tableHead (token của <th> bảng, ép line-height 1.2) và
  // thiếu 2 margin-top của mockup (.tile .val{margin-top:6px}, .tile .unit{margin-top:2px}) khiến
  // ô KPI thấp hơn mockup ~9-11px. Khoá khoảng cách bằng đúng lớp utility tương ứng pixel, không
  // khoá tên lớp chung chung.
  it('nhãn KHÔNG dùng text-tableHead (token của <th> bảng, không phải nhãn ô KPI)', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" />)
    expect(screen.getByText('LTI trong kỳ').className).not.toContain('text-tableHead')
  })

  // Vòng sửa 2: chuyển 3 test margin sang resolver — `toContain('mt-1.5')` vẫn xanh dù một
  // mt-* khác (vd. mt-2 nếu lỡ gõ thêm) đứng sau trong CSS đè mất margin-top thật, làm sai khoảng
  // cách trên màn hình mà test không biết.
  it('số cách nhãn margin-top 6px (mt-1.5), đúng mockup .tile .val', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" />)
    const cls = screen.getByText('2').className
    expect(resolveCascadeWinner(cls, 'margin-top')).toBe('mt-1.5')
  })

  it('đơn vị cách số margin-top 2px (mt-0.5), đúng mockup .tile .unit', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" />)
    const cls = screen.getByText('vụ').className
    expect(resolveCascadeWinner(cls, 'margin-top')).toBe('mt-0.5')
  })

  it('value=null: số "—" cũng cách nhãn margin-top 6px như khi có số thật', () => {
    render(<Tile label="LTI trong kỳ" value={null} unit="vụ" />)
    const cls = screen.getByLabelText('chưa có dữ liệu').className
    expect(resolveCascadeWinner(cls, 'margin-top')).toBe('mt-1.5')
  })

  // Vòng sửa 1 — S3: reviewer mutate bỏ guard !isMissing trong isDanger, không test nào đỏ — tổ
  // hợp value=null + danger không được khoá, và màu chữ nhãn/đơn vị khi danger cũng không được
  // khoá (test cũ chỉ nhìn nền của div gốc).
  it('value=null + danger: KHÔNG tô nền đỏ — chưa có dữ liệu thì không có gì để báo động', () => {
    const { container } = render(<Tile label="LTI trong kỳ" value={null} unit="vụ" danger />)
    expect(container.firstElementChild?.className).not.toContain('bg-dangerBg')
  })

  // Vòng sửa 2: chuyển 2 test màu chữ danger sang resolver — cùng lý do các test màu/viền khác:
  // `toContain('text-danger')` vẫn xanh dù text-sec đứng sau trong CSS đè lại thành chữ xám.
  it('danger=true: nhãn tô màu danger, không chỉ nền div gốc', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" danger />)
    const cls = screen.getByText('LTI trong kỳ').className
    expect(resolveCascadeWinner(cls, 'color')).toBe('text-danger')
  })

  it('danger=true: đơn vị cũng tô màu danger', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" danger />)
    const cls = screen.getByText('vụ').className
    expect(resolveCascadeWinner(cls, 'color')).toBe('text-danger')
  })
})
