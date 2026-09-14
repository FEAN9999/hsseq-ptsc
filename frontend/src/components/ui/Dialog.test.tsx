// frontend/src/components/ui/Dialog.test.tsx
//
// BA ĐIỀU ĐỊNH HÌNH BỘ TEST NÀY:
//
// 1. NGƯỠNG 10 KÝ TỰ PHẢI ĐƯỢC CHỐT BẰNG CA BIÊN (task-24-carry.md C7). Ca của brief gõ 8 ký tự
//    rồi nhảy thẳng lên 14 — ngưỡng 9, 11 hay 12 đều xanh. Dưới đây có ca 9 ký tự (còn khoá) và
//    ca ĐÚNG 10 (mở), tức chỉ đúng một con số duy nhất sống sót.
//
// 2. ĐO `disabled` THẬT, KHÔNG ĐO SỰ TỒN TẠI CỦA NÚT (task-24-carry.md C3). Task 17 và Task 18
//    đều có đột biến ra xanh vì test chỉ khẳng định nút có mặt. Mọi ca "khoá" ở đây bấm thử nút
//    rồi khẳng định `onConfirm` KHÔNG chạy, chứ không chỉ đọc thuộc tính.
//
// 3. HỘP THOẠI PHẢI TỰ ĐƯA FOCUS VÀO TRONG. Không phải để cho đẹp hồ sơ a11y: `Dialog` bắt Esc
//    bằng `keydown` của chính nó (jsdom 29.1.1 không có `showModal`/`cancel` — xem đầu Dialog.tsx),
//    nên focus còn nằm ngoài là Esc không bao giờ tới nơi.
//
// PHẢI `npm run build` trước khi chạy file này: ca "nút chính bên phải" đọc CSS THẬT đã build
// (`resolveCascadeWinner`, task-20-carry.md C4) chứ không hỏi `className.includes`.
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Dialog, TOI_THIEU_GHI_CHU } from './Dialog'
import { resolveCascadeWinner } from './cascade'

function ve(p: Partial<React.ComponentProps<typeof Dialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const r = render(
    <Dialog
      open
      title="Trả lại báo cáo"
      confirmLabel="Trả lại"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...p}
    />,
  )
  return { ...r, onConfirm, onCancel }
}

function nutChinh(ten: string): HTMLElement {
  return screen.getByRole('button', { name: ten })
}

describe('Dialog — câu chữ và nút', () => {
  it('dialog Nộp nêu đúng hậu quả, và không có ô lý do nào', () => {
    ve({
      title: 'Nộp báo cáo 08/2026 của PTSC Đình Vũ?',
      body: 'Sau khi nộp bạn không sửa được cho tới khi Ban ATCL trả lại.',
      confirmLabel: 'Nộp',
    })
    expect(screen.getByText(/không sửa được cho tới khi Ban ATCL trả lại/)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('open=false thì không vẽ gì ra DOM', () => {
    ve({ open: false, body: 'Sau khi nộp bạn không sửa được.' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/Sau khi nộp/)).toBeNull()
  })

  it('không truyền body thì không dựng khe trống nào', () => {
    const { container } = ve({ title: 'Trả lại báo cáo' })
    expect(container.querySelector('p')).toBeNull()
  })

  it('tiêu đề là tên của chính hộp thoại (aria-labelledby), không phải một dòng chữ rời', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(screen.getByRole('dialog', { name: 'Duyệt báo cáo này?' })).toBeTruthy()
  })

  it('bấm nút chính gọi onConfirm; bấm Huỷ gọi onCancel', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    await u.click(nutChinh('Duyệt'))
    expect(t.onConfirm).toHaveBeenCalledTimes(1)
    expect(t.onCancel).not.toHaveBeenCalled()

    await u.click(nutChinh('Huỷ'))
    expect(t.onCancel).toHaveBeenCalledTimes(1)
    expect(t.onConfirm).toHaveBeenCalledTimes(1)
  })

  // Đột biến M11: thứ tự DOM một mình KHÔNG chốt được "nút chính bên phải" — `flex-row-reverse`
  // giữ nguyên thứ tự đọc mà lật hẳn thứ tự nhìn thấy. Nên ca này hỏi CSS thật đã build thêm hai
  // câu: hàng nút không đảo chiều, và dồn về cuối hàng.
  it('nút chính đứng SAU nút Huỷ trong DOM VÀ nằm bên phải trên màn hình', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    const ds = screen.getAllByRole('button').map((b) => b.textContent)
    expect(ds).toEqual(['Huỷ', 'Duyệt'])

    const hangNut = nutChinh('Huỷ').parentElement!
    expect(resolveCascadeWinner(hangNut.className, 'flex-direction')).toBeNull()
    expect(resolveCascadeWinner(hangNut.className, 'justify-content')).toBe('justify-end')
  })
})

describe('Dialog — ghi chú bắt buộc', () => {
  it('nút danger khoá tới khi ghi chú đủ 10 ký tự', async () => {
    const u = userEvent.setup()
    const t = ve({ requireNote: true, danger: true })
    const nut = nutChinh('Trả lại')
    expect(nut.hasAttribute('disabled')).toBe(true)
    await u.type(screen.getByRole('textbox'), 'Thiếu số') // 8 ký tự
    expect(nut.hasAttribute('disabled')).toBe(true)
    await u.type(screen.getByRole('textbox'), ' B-8.1') // đủ
    expect(nut.hasAttribute('disabled')).toBe(false)
    await u.click(nut)
    expect(t.onConfirm).toHaveBeenCalledWith('Thiếu số B-8.1')
  })

  // C7: ĐÚNG ranh giới. 9 ký tự còn khoá, 10 ký tự mở — không con số nào khác cùng lúc thoả cả hai.
  it.each([
    [9, 'Thiếu số1', true],
    [TOI_THIEU_GHI_CHU, 'Thiếu số12', false],
  ])('%i ký tự → nút khoá = %s', async (_n, chu, khoa) => {
    const u = userEvent.setup()
    ve({ requireNote: true })
    await u.type(screen.getByRole('textbox'), chu as string)
    expect((chu as string).length).toBe(_n)
    expect(nutChinh('Trả lại').hasAttribute('disabled')).toBe(khoa)
  })

  it('khoảng trắng không tính là lý do: 12 dấu cách vẫn khoá', async () => {
    const u = userEvent.setup()
    const t = ve({ requireNote: true })
    await u.type(screen.getByRole('textbox'), '            ')
    expect(nutChinh('Trả lại').hasAttribute('disabled')).toBe(true)
    await u.click(nutChinh('Trả lại'))
    expect(t.onConfirm).not.toHaveBeenCalled()
  })

  it('đang khoá vì thiếu chữ thì có câu nói vì sao, đủ chữ thì câu đó biến mất', async () => {
    const u = userEvent.setup()
    ve({ requireNote: true })
    expect(screen.getByText(`Cần ít nhất ${TOI_THIEU_GHI_CHU} ký tự`)).toBeTruthy()
    await u.type(screen.getByRole('textbox'), 'Thiếu số B-8.1')
    expect(screen.queryByText(`Cần ít nhất ${TOI_THIEU_GHI_CHU} ký tự`)).toBeNull()
  })

  it('ô lý do có nhãn riêng, không dùng chung nhãn với tiêu đề', () => {
    ve({ requireNote: true, noteLabel: 'Lý do trả lại (người nộp sẽ thấy nguyên văn)' })
    expect(screen.getByLabelText('Lý do trả lại (người nộp sẽ thấy nguyên văn)')).toBeTruthy()
  })

  it('lý do gửi NGUYÊN VĂN, không tự cắt khoảng trắng hai đầu', async () => {
    const u = userEvent.setup()
    const t = ve({ requireNote: true })
    await u.type(screen.getByRole('textbox'), '  Thiếu số B-8.1  ')
    await u.click(nutChinh('Trả lại'))
    expect(t.onConfirm).toHaveBeenCalledWith('  Thiếu số B-8.1  ')
  })

  it('KHÔNG đòi ghi chú thì nút chính mở sẵn, onConfirm nhận chuỗi rỗng', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(nutChinh('Duyệt').hasAttribute('disabled')).toBe(false)
    await u.click(nutChinh('Duyệt'))
    expect(t.onConfirm).toHaveBeenCalledWith('')
  })

  // Lý do của lượt trả lại TRƯỚC không được nằm sẵn trong ô của lượt sau — người duyệt bấm Trả lại
  // lần hai sẽ gửi đi đúng câu của lần một mà không nhìn lại.
  it('đóng rồi mở lại: ô lý do trống trở lại', async () => {
    const u = userEvent.setup()
    function Khung() {
      const [mo, setMo] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setMo(true)}>
            mở lại
          </button>
          <Dialog
            open={mo}
            title="Trả lại báo cáo"
            confirmLabel="Trả lại"
            requireNote
            onConfirm={vi.fn()}
            onCancel={() => setMo(false)}
          />
        </>
      )
    }
    render(<Khung />)
    await u.type(screen.getByRole('textbox'), 'Thiếu số B-8.1')
    await u.click(nutChinh('Huỷ'))
    await u.click(nutChinh('mở lại'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('Dialog — đang gửi', () => {
  it('đang gửi thì khoá nút và đổi chữ Đang gửi…', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt', pending: true })
    const nut = nutChinh('Đang gửi…')
    expect(nut.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull()
  })

  it('bấm nút đang khoá KHÔNG gửi lần thứ hai', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt', pending: true })
    await u.click(nutChinh('Đang gửi…'))
    expect(t.onConfirm).not.toHaveBeenCalled()
  })

  // `pending` khoá vì ĐANG BAY, không phải vì thiếu chữ: một hộp thoại có ghi chú đã đủ 10 ký tự
  // vẫn phải khoá trong lúc chờ.
  it('ghi chú đã đủ nhưng đang gửi thì nút vẫn khoá', async () => {
    const u = userEvent.setup()
    const t = ve({ requireNote: true, pending: true })
    await u.type(screen.getByRole('textbox'), 'Thiếu số B-8.1')
    await u.click(nutChinh('Đang gửi…'))
    expect(t.onConfirm).not.toHaveBeenCalled()
  })
})

describe('Dialog — bàn phím và focus', () => {
  it('Esc đóng dialog', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'x', confirmLabel: 'ok' })
    await u.keyboard('{Escape}')
    expect(t.onCancel).toHaveBeenCalled()
  })

  it('mở ra thì focus nằm SẴN trong hộp thoại — điều kiện để Esc tới được nơi', () => {
    const { container } = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    const hop = container.querySelector('dialog')!
    expect(hop.contains(document.activeElement)).toBe(true)
  })

  it('có ô lý do thì focus vào chính ô đó — gõ được ngay, không phải Tab tới', () => {
    ve({ requireNote: true })
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('không có ô lý do thì focus vào Huỷ, không vào nút chính', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(document.activeElement).toBe(nutChinh('Huỷ'))
  })

  it('Tab ở phần tử cuối quay về đầu, Shift+Tab ở đầu nhảy xuống cuối (bẫy focus)', async () => {
    const u = userEvent.setup()
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(document.activeElement).toBe(nutChinh('Huỷ'))
    await u.tab()
    expect(document.activeElement).toBe(nutChinh('Duyệt'))
    await u.tab()
    expect(document.activeElement).toBe(nutChinh('Huỷ'))
    await u.tab({ shift: true })
    expect(document.activeElement).toBe(nutChinh('Duyệt'))
  })

  it('focus KHÔNG thoát ra nút nằm ngoài hộp thoại', async () => {
    const u = userEvent.setup()
    render(
      <>
        <button type="button">Nút ngoài</button>
        <Dialog open title="Duyệt báo cáo này?" confirmLabel="Duyệt" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>,
    )
    const ngoai = screen.getByRole('button', { name: 'Nút ngoài' })
    await u.tab()
    await u.tab()
    await u.tab()
    expect(document.activeElement).not.toBe(ngoai)
  })

  it('đóng lại thì trả focus về đúng chỗ vừa rời', async () => {
    const u = userEvent.setup()
    function Khung() {
      const [mo, setMo] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setMo(true)}>
            Trả lại…
          </button>
          <Dialog
            open={mo}
            title="Trả lại báo cáo"
            confirmLabel="Trả lại"
            onConfirm={vi.fn()}
            onCancel={() => setMo(false)}
          />
        </>
      )
    }
    render(<Khung />)
    const nutMo = screen.getByRole('button', { name: 'Trả lại…' })
    await u.click(nutMo)
    expect(document.activeElement).not.toBe(nutMo)
    await u.click(nutChinh('Huỷ'))
    expect(document.activeElement).toBe(nutMo)
  })
})
