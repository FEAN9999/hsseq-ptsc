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
})
