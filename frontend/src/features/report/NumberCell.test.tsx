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

  // ============ Vòng sửa 1 (task-21-fix-1.md) ============

  // S2: đúng luồng dán cột của C4 — Task 22 sẽ nạp `value` mới cho hàng loạt ô sau một cú dán.
  // Trước đây `error`/`aria-invalid` treo lại trên một ô vừa được ghi đè giá trị hợp lệ.
  it('lỗi cũ bị gỡ khi value đổi từ ngoài — dán cột đè lên ô đang lỗi thì hết đỏ (fix-1 S2)', async () => {
    const { rerender } = render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    await userEvent.type(o, 'abc')
    await userEvent.tab()
    expect(o.getAttribute('aria-invalid')).toBe('true')
    rerender(<NumberCell value={777} decimals={0} ariaLabel="x" />)
    expect(o.getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText('Chỉ nhập số')).toBeNull()
    expect(o.value).toBe('777')
  })

  // S3: focus lại một ô đang lỗi KHÔNG được âm thầm thay chữ sai bằng `value` cũ — nếu không,
  // câu lỗi/aria-invalid vẫn treo trên màn hình trong khi chữ đã đổi, và gõ tiếp sẽ nối đuôi vào
  // một số cũ không ai còn thấy (repro gốc: value=42, gõ 'abc', blur, focus lại → hiện '42' dù lỗi
  // vẫn còn; gõ '7' → '427').
  it('focus lại ô đang lỗi thì giữ nguyên chữ đã gõ, không bị nuốt về giá trị cũ (fix-1 S3)', async () => {
    render(<NumberCell value={42} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    await userEvent.click(o)
    await userEvent.clear(o)
    await userEvent.type(o, 'abc')
    await userEvent.tab()
    expect(o.value).toBe('abc')
    await userEvent.click(o)
    expect(o.value).toBe('abc')
  })

  // S4 (5 khẳng định vá 5 mutation N2–N7 của review — bullet 1 gộp N3+N4):

  // N3 + đúng lúc: onCommit trước đây có ĐỘ PHỦ BẰNG 0 — xoá hẳn dòng gọi vẫn 15/15 xanh.
  it('onCommit bắn đúng payload khi giá trị thật sự đổi (fix-1 S4/N3)', async () => {
    const onCommit = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onCommit={onCommit} />)
    const o = screen.getByLabelText('x')
    await userEvent.type(o, '500')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith({ value: 500, error: null })
  })

  // N4 + đúng lúc: onChange cũng có ĐỘ PHỦ BẰNG 0 trước đó.
  it('onChange bắn mỗi lần gõ, với kết quả phân tích dở dang của lần gõ đó (fix-1 S4/N4)', async () => {
    const onChange = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onChange={onChange} />)
    const o = screen.getByLabelText('x')
    await userEvent.type(o, '5')
    expect(onChange).toHaveBeenCalledWith({ value: 5, error: null })
  })

  // N5: `formatNumber(value, decimals)` → `formatNumber(value ?? 0, decimals)` phá thẳng ràng
  // buộc toàn cục "null hiện —, không bao giờ hiện 0".
  it('value=null hiện — lúc nghỉ và rỗng lúc focus, không bao giờ hiện 0 (fix-1 S4/N5)', async () => {
    render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    expect(o.value).toBe('—')
    await userEvent.click(o)
    expect(o.value).toBe('')
  })

  // N6: `aria-describedby={loiId}` không điều kiện — không bao giờ gỡ dù đã hết lỗi.
  it('sửa xong lỗi rồi blur thì gỡ hẳn aria-invalid và aria-describedby (fix-1 S4/N6)', async () => {
    render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x')
    await userEvent.type(o, 'abc')
    await userEvent.tab()
    expect(o.getAttribute('aria-invalid')).toBe('true')
    await userEvent.click(o) // S3: focus giữ nguyên 'abc' vì đang lỗi
    await userEvent.clear(o)
    await userEvent.type(o, '5')
    await userEvent.tab()
    expect(o.getAttribute('aria-invalid')).toBeNull()
    expect(o.getAttribute('aria-describedby')).toBeNull()
  })

  // N7: `soThoDeSua` → `String(value)` làm mất dấu phẩy thập phân lúc focus — vòng focus→blur
  // của một ô decimals=2 (đúng các dòng "Giờ công" B-1.x của FM01) chưa từng chạy trọn trong test
  // nào trước vòng sửa này (ca focus/blur duy nhất của round 1 dùng decimals=0).
  it('vòng focus→blur ở ô decimals=2 giữ đúng dấu phẩy thập phân (fix-1 S4/N7)', async () => {
    render(<NumberCell value={12.35} decimals={2} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    expect(o.value).toBe('12,35')
    await userEvent.click(o)
    expect(o.value).toBe('12,35')
    await userEvent.tab()
    expect(o.value).toBe('12,35')
  })

  // N2: bỏ `.trim()` khi tách dòng dán — khoảng trắng hai đầu mỗi dòng (C4 đòi cắt) lọt nguyên ra
  // ngoài, mà chính `.trim()` cũng là thứ cứu `\r` thừa của Excel Windows.
  it('.trim() khi tách dòng dán loại bỏ khoảng trắng hai đầu mỗi dòng (fix-1 S4/N2)', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.paste(' 10 \n 20 ')
    expect(onPasteColumn).toHaveBeenCalledWith(['10', '20'])
  })

  // S6 (nhánh KHÔNG bắn — bổ sung cho ca "bắn đúng payload" ở trên): Tab ngang qua không sửa gì
  // KHÔNG được tạo một lần "commit" giả — Task 23 (lưu-khi-rời-ô) sẽ đẻ một PUT rác cho mỗi ô đi
  // qua nếu không có chốt này.
  it('onCommit KHÔNG bắn khi blur mà không sửa gì (chỉ Tab ngang qua) (fix-1 S6)', async () => {
    const onCommit = vi.fn()
    render(<NumberCell value={5} decimals={0} ariaLabel="x" onCommit={onCommit} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.tab()
    expect(onCommit).not.toHaveBeenCalled()
  })

  // S6 (biến thể nặng hơn từ review): ô có nhiều chữ số thập phân hơn `decimals` — đi ngang qua
  // (không sửa) trước đây vẫn bắn `onCommit` với giá trị ĐÃ BỊ LÀM TRÒN theo hiển thị.
  it('onCommit KHÔNG bắn khi đi ngang một ô có nhiều thập phân hơn decimals mà không sửa (fix-1 S6)', async () => {
    const onCommit = vi.fn()
    render(<NumberCell value={12.345} decimals={2} ariaLabel="x" onCommit={onCommit} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.tab()
    expect(onCommit).not.toHaveBeenCalled()
  })

  // S7: trước đây chỉ dò '\n' nên chuỗi dán phân cách bằng '\r' đơn (không kèm '\n') dính ba số
  // thành một, im lặng.
  it('dán cột phân cách bằng \\r đơn (không kèm \\n) vẫn được nhận là dán cột (fix-1 S7)', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.paste('10\r20\r30')
    expect(onPasteColumn).toHaveBeenCalledWith(['10', '20', '30'])
  })

  // S5a: dòng trắng THỪA Ở CUỐI (Excel luôn kết thúc vùng copy bằng xuống dòng) phải bị cắt —
  // trước đây lọt ra thành '""', Task 22 sẽ phân tích thành null và xoá trắng dòng đích kế tiếp
  // dù người dùng không hề chạm tới.
  it('dòng trắng THỪA Ở CUỐI chuỗi dán bị cắt bỏ, không lọt ra thành "" (fix-1 S5)', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.paste('10\r\n20\r\n30\r\n')
    expect(onPasteColumn).toHaveBeenCalledWith(['10', '20', '30'])
  })

  // S5b: dòng trắng Ở GIỮA có nghĩa khác hẳn đuôi thừa của phép tách ("ô này để trống") — PHẢI
  // giữ nguyên, không được cắt theo cùng luật với S5a.
  it('dòng trắng Ở GIỮA chuỗi dán vẫn giữ nguyên — khác đuôi thừa của phép tách (fix-1 S5)', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.paste('10\n\n20')
    expect(onPasteColumn).toHaveBeenCalledWith(['10', '', '20'])
  })

  // S10: KHÔNG truyền onPasteColumn (chính hai test của brief render không có prop này) mà vẫn
  // preventDefault() thì cú dán nhiều dòng bị nuốt im lặng, ô không nhận được gì và không có lời
  // giải thích nào cho người dùng.
  it('dán nhiều dòng khi KHÔNG có onPasteColumn thì không nuốt im lặng (fix-1 S10)', async () => {
    render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    await userEvent.click(o)
    await userEvent.paste('10\n20')
    expect(o.value).not.toBe('')
  })

  // N1: bỏ guard `if (!dangFocus.current)` trong effect đồng bộ khiến nó ghi đè chữ người dùng
  // ĐANG GÕ DỞ ngay khi `value` đổi từ ngoài trong lúc còn đang focus — ca "value đổi từ ngoài"
  // hiện có không lộ ra vì nó không hề focus ô trước khi rerender.
  it('đang gõ dở mà value đổi từ ngoài (còn focus) thì KHÔNG bị đè chữ đang gõ (fix-1 N1)', async () => {
    const { rerender } = render(<NumberCell value={100} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    await userEvent.click(o)
    await userEvent.clear(o)
    await userEvent.type(o, '55')
    rerender(<NumberCell value={999} decimals={0} ariaLabel="x" />)
    expect(o.value).toBe('55')
  })

  // ============ Vòng sửa 2 (task-21-fix-2.md) ============

  // fix-2 T4 (rereview §4b mutation T11 + T12) — `decimals` truyền vào `parseViNumber` ở CẢ
  // `xuLyChange` lẫn `xuLyBlur` chưa từng được khẳng định với decimals > 0: ca decimals=2 duy
  // nhất trước đây (N7) chỉ nhìn `.value` hiển thị, không nhìn payload callback nào. Ép cứng
  // decimals=0 ở một trong hai chỗ đó sẽ làm ô B-1.x (Giờ công, decimals=2) báo lỗi sai và bật
  // aria-invalid trên một giá trị hợp lệ — mà không ca nào từng đỏ.
  it('decimals=2 được truyền đúng vào parseViNumber ở CẢ onChange lẫn onCommit, không bị ép về 0 (fix-2 T4)', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<NumberCell value={null} decimals={2} ariaLabel="x" onChange={onChange} onCommit={onCommit} />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    await userEvent.click(o)
    await userEvent.type(o, '12,35')
    expect(onChange).toHaveBeenLastCalledWith({ value: 12.35, error: null })
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith({ value: 12.35, error: null })
    expect(o.getAttribute('aria-invalid')).toBeNull()
  })

  // fix-2 T6 (rereview §4b mutation T5) — nhánh LỖI của `xuLyFocus` (S3) phải cập nhật
  // `textLucFocus.current` bằng CHÍNH `text` hiện tại (không phải hằng số/rỗng) — nếu không,
  // Tab ngang qua một ô ĐANG LỖI lần thứ hai (không sửa gì thêm) vẫn bị coi là "có sửa" và bắn
  // `onCommit` một cách sai, đúng thứ S6 sinh ra để chặn.
  it('Tab ngang qua một ô ĐANG LỖI (không sửa thêm gì) cũng KHÔNG bắn onCommit lần hai (fix-2 T6)', async () => {
    const onCommit = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onCommit={onCommit} />)
    const o = screen.getByLabelText('x')
    await userEvent.type(o, 'abc')
    await userEvent.tab()
    expect(o.getAttribute('aria-invalid')).toBe('true')
    onCommit.mockClear()
    await userEvent.click(o)
    await userEvent.tab()
    expect(onCommit).not.toHaveBeenCalled()
  })

  // fix-2 T7 (rereview §4b mutation T7) — ca S5 cũ chỉ có ĐÚNG MỘT dòng trắng thừa ở cuối, nên
  // không phân biệt được `while` (cắt hết) với `if` (chỉ cắt một lần). Hai dòng trắng liền nhau
  // ở cuối mới lộ ra khác biệt.
  it('nhiều dòng trắng liền nhau ở cuối đều bị cắt hết, không chỉ cắt một lần (fix-2 T7)', async () => {
    const onPasteColumn = vi.fn()
    render(<NumberCell value={null} decimals={0} ariaLabel="x" onPasteColumn={onPasteColumn} />)
    const o = screen.getByLabelText('x')
    await userEvent.click(o)
    await userEvent.paste('10\n20\n\n')
    expect(onPasteColumn).toHaveBeenCalledWith(['10', '20'])
  })

  // fix-2 T8 (rereview §4b mutation T13) — canh `!dangFocus.current` bọc `setError(null)` (mã S2)
  // chưa từng được khẳng định trong đúng tổ hợp "đang focus VÀ đang lỗi": nếu canh bị bỏ, cha đổi
  // `value` trong lúc người dùng đang gõ dở trên một ô lỗi sẽ bị xoá trắng aria-invalid ngay dưới
  // tay họ dù chữ sai vẫn còn nguyên trên màn hình.
  it('đang focus VÀ đang lỗi mà value đổi từ ngoài thì vẫn giữ lỗi, không bị xoá trắng (fix-2 T8)', async () => {
    const { rerender } = render(<NumberCell value={null} decimals={0} ariaLabel="x" />)
    const o = screen.getByLabelText('x') as HTMLInputElement
    await userEvent.type(o, 'abc')
    await userEvent.tab()
    expect(o.getAttribute('aria-invalid')).toBe('true')
    await userEvent.click(o)
    rerender(<NumberCell value={999} decimals={0} ariaLabel="x" />)
    expect(o.getAttribute('aria-invalid')).toBe('true')
    expect(o.value).toBe('abc')
  })
})
