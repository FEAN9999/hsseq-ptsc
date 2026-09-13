import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Chip } from './Chip'
import { Tile } from './Tile'

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
  it.each([
    ['approved', 'bg-successBg'],
    ['submitted', 'bg-warningBg'],
    ['late', 'bg-warningBg'],
    ['returned', 'bg-dangerBg'],
    ['draft', 'bg-mutedbg'],
  ])('chip %s tô đúng màu nền theo kind, không lẫn sang kind khác', (kind, bgClass) => {
    const { container } = render(<Chip kind={kind as never} />)
    expect(container.firstElementChild?.className).toContain(bgClass)
  })

  // Vòng sửa 1 — S1: utility border-color cùng độ đặc hiệu, cái đứng SAU trong CSS build ra thắng
  // bất kể thứ tự viết trong JSX. Chuỗi className "chứa" border-hair/border-current vẫn ĐÚNG dù
  // border-transparent đứng sau đã đè mất viền trên màn hình — test theo substring không bắt được.
  // Bất biến thật: mỗi chip phải có ĐÚNG MỘT utility border-<màu>, không được hai cái cùng lúc.
  it.each([
    ['approved', false], ['submitted', false], ['late', false],
    ['returned', false], ['draft', false], ['missing', false],
    ['approved', true], ['submitted', true], ['late', true],
    ['returned', true], ['draft', true], ['missing', true],
  ])('kind=%s outline=%s → đúng 1 utility border màu, không để cascade quyết định', (kind, outline) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    const borderColorUtils = cls.match(/\bborder-(transparent|current|hair)\b/g) ?? []
    expect(borderColorUtils.length).toBe(1)
  })

  it('missing (Chưa nộp) có viền hairline thật #e8e6e5, không phải transparent bị cascade đè', () => {
    const { container } = render(<Chip kind="missing" />)
    expect(container.firstElementChild?.className).toMatch(/\bborder-hair\b/)
  })

  it('outline luôn hiện viền border-current — biến thể c-seed (D6) không được chết vì cascade', () => {
    const { container } = render(<Chip kind="approved" outline />)
    expect(container.firstElementChild?.className).toMatch(/\bborder-current\b/)
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

  it('số cách nhãn margin-top 6px (mt-1.5), đúng mockup .tile .val', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" />)
    expect(screen.getByText('2').className).toContain('mt-1.5')
  })

  it('đơn vị cách số margin-top 2px (mt-0.5), đúng mockup .tile .unit', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" />)
    expect(screen.getByText('vụ').className).toContain('mt-0.5')
  })

  it('value=null: số "—" cũng cách nhãn margin-top 6px như khi có số thật', () => {
    render(<Tile label="LTI trong kỳ" value={null} unit="vụ" />)
    expect(screen.getByLabelText('chưa có dữ liệu').className).toContain('mt-1.5')
  })

  // Vòng sửa 1 — S3: reviewer mutate bỏ guard !isMissing trong isDanger, không test nào đỏ — tổ
  // hợp value=null + danger không được khoá, và màu chữ nhãn/đơn vị khi danger cũng không được
  // khoá (test cũ chỉ nhìn nền của div gốc).
  it('value=null + danger: KHÔNG tô nền đỏ — chưa có dữ liệu thì không có gì để báo động', () => {
    const { container } = render(<Tile label="LTI trong kỳ" value={null} unit="vụ" danger />)
    expect(container.firstElementChild?.className).not.toContain('bg-dangerBg')
  })

  it('danger=true: nhãn tô màu danger, không chỉ nền div gốc', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" danger />)
    expect(screen.getByText('LTI trong kỳ').className).toContain('text-danger')
  })

  it('danger=true: đơn vị cũng tô màu danger', () => {
    render(<Tile label="LTI trong kỳ" value={2} unit="vụ" danger />)
    expect(screen.getByText('vụ').className).toContain('text-danger')
  })
})
