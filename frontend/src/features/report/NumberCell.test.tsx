// frontend/src/features/report/NumberCell.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumberCell } from './NumberCell'

describe('NumberCell', () => {
  it('focus hiện số thô, blur hiện định dạng vi-VN', async () => {
    render(<NumberCell value={1284500} decimals={0} ariaLabel="B-1.1 Giờ TCT, Tháng này" />)
    const o = screen.getByLabelText('B-1.1 Giờ TCT, Tháng này') as HTMLInputElement
    expect(o.value).toBe('1.284.500')
    await userEvent.click(o)
    expect(o.value).toBe('1284500')
    await userEvent.tab()
    expect(o.value).toBe('1.284.500')
  })

  it('là input type=text inputMode=decimal, KHÔNG type=number', () => {
    render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x')
    expect(o.getAttribute('type')).toBe('text')
    expect(o.getAttribute('inputMode')).toBe('decimal')
  })

  it('dán cột nhiều dòng từ Excel điền xuống các ô nhập kế tiếp', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x')
    o.focus()
    await userEvent.paste('10\n20\n30')
    // task-21-carry.md C4 (sửa test của brief): trả RA CHUỖI THÔ, không tự phân tích thành số —
    // mỗi dòng của cùng một cột FM01 có thể khai `decimals` khác nhau (B-1.1 decimals=2, B-2.1
    // decimals=0), mà ô đang được dán vào chỉ biết `decimals` của chính nó nên không được tự ý
    // phân tích hộ cả cột (tự phân tích sẽ làm mất dữ liệu âm thầm ở dòng đích có nhiều thập phân
    // hơn dòng đang dán).
    expect(onPasteColumn).toHaveBeenCalledWith(['10', '20', '30'])
  })

  it('lỗi ô gắn aria-invalid và aria-describedby', async () => {
    render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x')
    await userEvent.type(o, 'abc')
    await userEvent.tab()
    expect(o.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Chỉ nhập số').id).toBe(o.getAttribute('aria-describedby'))
  })

  // Thêm ngoài 4 test của brief — phát hiện lúc viết mã, không phải lúc chạy đột biến (đúng thứ
  // task này yêu cầu: đừng đợi mutation mới vá). Ca "dán nhiều dòng" ở trên gọi paste với chuỗi
  // CÓ '\n' nên không chạm nhánh else của điều kiện phát hiện nhiều dòng — nếu bỏ hẳn điều kiện
  // đó (coi MỌI lần dán là dán cột), dán một số đơn lẻ ('500', copy 1 ô Excel — thao tác paste
  // thường gặp nhất) sẽ bị preventDefault chặn mất, ô không nhận được gì, mà không ca nào trong 4
  // ca gốc phát hiện ra.
  it('dán MỘT dòng (không xuống dòng) thì cập nhật ô như gõ thường, không gọi onPasteColumn', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    // await userEvent.click (không dùng o.focus() thô như ca "dán cột" ở trên) — ca đó không cần
    // đợi text đổi từ '—' về '' trước khi dán vì assertion chỉ nhìn onPasteColumn; ca này CẦN thấy
    // đúng giá trị sau dán nên phải đợi React flush xong state focus trước khi paste.
    await userEvent.click(o)
    await userEvent.paste('500')
    expect(onPasteColumn).not.toHaveBeenCalled()
    expect(o.value).toBe('500')
  })

  // Thêm ngoài 4 test của brief — cũng phát hiện lúc viết mã: `useEffect` đồng bộ `text` theo
  // `value`/`decimals` khi KHÔNG focus chỉ chạy MỘT LẦN lúc mount trong ca "focus/blur" ở trên
  // (giá trị mount trùng luôn với state khởi tạo nên không lộ ra nếu bỏ hẳn effect). Bỏ nó đi thì
  // ô không cập nhật khi cha đổi `value` từ ngoài (derived tính lại, hàng bị dán đè) — hiện số cũ.
  it('value đổi từ ngoài lúc KHÔNG focus thì cập nhật lại số hiển thị', () => {
    const { rerender } = render(<NumberCell value={100} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    expect(o.value).toBe('100')
    rerender(<NumberCell value={200} decimals={0} ariaLabel="x" />)
    expect(o.value).toBe('200')
  })
})
