// frontend/src/components/ui/DialogXacNhan.test.tsx
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
// 3. HỘP THOẠI PHẢI TỰ ĐƯA FOCUS VÀO TRONG. Không phải để cho đẹp hồ sơ a11y: `DialogXacNhan` bắt Esc
//    bằng `keydown` của chính nó (jsdom 29.1.1 không có `showModal`/`cancel` — xem đầu DialogXacNhan.tsx),
//    nên focus còn nằm ngoài là Esc không bao giờ tới nơi.
//
// PHẢI `npm run build` trước khi chạy file này: ca "nút chính bên phải" đọc CSS THẬT đã build
// (`resolveCascadeWinner`, task-20-carry.md C4) chứ không hỏi `className.includes`.
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DialogXacNhan, TOI_THIEU_GHI_CHU } from './DialogXacNhan'
import { resolveCascadeWinner, resolveDeclaredValue } from './cascade'

function ve(p: Partial<React.ComponentProps<typeof DialogXacNhan>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const r = render(
    <DialogXacNhan
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

describe('DialogXacNhan — câu chữ và nút', () => {
  it('dialog Nộp nêu đúng hậu quả, và không có ô lý do nào', () => {
    ve({
      title: 'Nộp báo cáo 08/2026 của PTSC Đình Vũ?',
      body: 'Sau khi nộp bạn không sửa được cho tới khi Ban ATCL trả lại.',
      confirmLabel: 'Nộp',
    })
    expect(screen.getByText(/không sửa được cho tới khi Ban ATCL trả lại/)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
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

  // Đột biến M11: thứ tự DOM một mình KHÔNG chốt được "nút chính bên phải" — `flex-row-…reverse`
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

// `DialogXacNhan` cố ý KHÔNG gọi `showModal()` (lý do ở đầu DialogXacNhan.tsx), nên ba thứ dưới đây là TẤT CẢ
// những gì thay cho top-layer của trình duyệt. Bỏ bất kỳ cái nào thì hộp thoại rơi xuống cuối
// trang dưới 53 dòng bảng, hoặc chui xuống dưới header cột dính (`z-20`) — bấm "Nộp báo cáo" xong
// màn hình không đổi gì. Đo trên CSS THẬT đã build, không hỏi `className.includes`.
describe('DialogXacNhan — lớp phủ thay cho top-layer', () => {
  function lopPhu(): HTMLElement {
    return screen.getByRole('dialog').parentElement!
  }

  it('lớp phủ bám khung nhìn (position: fixed), không trôi theo dòng chảy trang', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(resolveCascadeWinner(lopPhu().className, 'position')).toBe('fixed')
  })

  it('lớp phủ phủ KÍN bốn cạnh (inset: 0), không chỉ là một khối giữa trang', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(resolveDeclaredValue(lopPhu().className, 'inset')).toBe('0')
  })

  it('z-index của lớp phủ là 50 — cao hơn 20 của header cột dính trong form', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    // So GIÁ TRỊ chứ không so tên lớp: `z-20` của `features/report/ReportForm.tsx` được đọc ra từ
    // cùng file CSS này, nên phép so dưới đây là phép so hai con số thật.
    const cuaPhu = Number(resolveDeclaredValue(lopPhu().className, 'z-index'))
    const cuaHeaderBang = Number(resolveDeclaredValue('z-20', 'z-index'))
    expect(cuaPhu).toBe(50)
    expect(cuaPhu).toBeGreaterThan(cuaHeaderBang)
  })

  // fix-3 L10 (R12): `-1` chứ không phải `0`. Hộp thoại phải nhận được focus BẰNG MÃ (nhánh
  // `pending` và nhánh `ds.length === 0` của bẫy Tab đều gọi `hopRef.current.focus()`), nhưng
  // không được tự chen vào thứ tự Tab như một điểm dừng mà người dùng bàn phím phải đi qua.
  it('chính hộp thoại nhận focus bằng mã, KHÔNG phải một điểm dừng Tab (tabindex = -1)', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(screen.getByRole('dialog').getAttribute('tabindex')).toBe('-1')
  })

  it('hộp thoại tự khai là hộp CHẶN (aria-modal), không phải một khối chữ giữa trang', () => {
    ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })
})

describe('DialogXacNhan — ghi chú bắt buộc', () => {
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
          {mo && (
            <DialogXacNhan
              title="Trả lại báo cáo"
              confirmLabel="Trả lại"
              requireNote
              onConfirm={vi.fn()}
              onCancel={() => setMo(false)}
            />
          )}
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

describe('DialogXacNhan — đang gửi', () => {
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

  // Một request đã bay không rút lại được. Nút "Huỷ" bấm được ở đây là lời hứa sai: người dùng bấm
  // Huỷ, hộp thoại đóng, rồi vẫn thấy toast "Đã nộp báo cáo 08/2026".
  it('đang gửi: bấm Huỷ KHÔNG đóng hộp thoại', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt', pending: true })
    await u.click(nutChinh('Huỷ'))
    expect(t.onCancel).not.toHaveBeenCalled()
  })

  it('đang gửi: Esc cũng KHÔNG đóng hộp thoại', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt', pending: true })
    await u.keyboard('{Escape}')
    expect(t.onCancel).not.toHaveBeenCalled()
  })

  // Lúc này CẢ HAI nút đều khoá nên không còn phần tử nào nhận focus — không giữ lại thì Tab đi
  // thẳng ra bảng 53 dòng phía sau, đúng lúc người dùng đang chờ một câu trả lời.
  it('đang gửi: Tab vẫn không thoát ra ngoài hộp thoại', async () => {
    const u = userEvent.setup()
    // Đi đúng đường thật: mở ra lúc chưa gửi (focus vào "Huỷ"), bấm nút chính, `pending` bật lên
    // và khoá cả hai nút. Dựng sẵn `pending` là dựng một cảnh app không bao giờ tới.
    function Khung() {
      const [dangGui, setDangGui] = useState(false)
      return (
        <>
          <button type="button">Nút ngoài</button>
          <DialogXacNhan
            title="Duyệt báo cáo này?"
            confirmLabel="Duyệt"
            pending={dangGui}
            onConfirm={() => setDangGui(true)}
            onCancel={vi.fn()}
          />
        </>
      )
    }
    render(<Khung />)
    await u.click(nutChinh('Duyệt'))
    expect(nutChinh('Đang gửi…').hasAttribute('disabled')).toBe(true)
    await u.tab()
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Nút ngoài' }))
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })
})

describe('DialogXacNhan — bàn phím và focus', () => {
  it('Esc đóng dialog', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'x', confirmLabel: 'ok' })
    await u.keyboard('{Escape}')
    expect(t.onCancel).toHaveBeenCalled()
  })

  // Esc phải CHẶN hành vi mặc định của trình duyệt, không chỉ gọi `onCancel`: Firefox từng gắn
  // "dừng tải trang" vào phím này, bấm Esc giữa một lượt lưu đang bay là huỷ chính request đó.
  it('Esc chặn luôn hành vi mặc định của trình duyệt', async () => {
    const u = userEvent.setup()
    let daChan: boolean | null = null
    function nghe(e: KeyboardEvent) {
      if (e.key === 'Escape') daChan = e.defaultPrevented
    }
    document.addEventListener('keydown', nghe)
    try {
      ve({ title: 'x', confirmLabel: 'ok' })
      await u.keyboard('{Escape}')
    } finally {
      document.removeEventListener('keydown', nghe)
    }
    expect(daChan).toBe(true)
  })

  // Đo được: một cú bấm vào NỀN MỜ từng đẩy focus về `<body>`, và vì Esc bắt bằng `keydown` CỦA
  // hộp thoại nên Esc chết theo — người dùng bàn phím còn đúng một đường thoát là rê chuột tới
  // nút "Huỷ". Bấm nền KHÔNG đóng (đây là câu hỏi "có chắc không"), nhưng cũng không được cướp
  // mất focus.
  it('bấm nền mờ rồi bấm Esc: hộp thoại VẪN đóng được', async () => {
    const u = userEvent.setup()
    const t = ve({ title: 'Duyệt báo cáo này?', confirmLabel: 'Duyệt' })
    await u.click(screen.getByRole('dialog').parentElement!)
    expect(t.onCancel).not.toHaveBeenCalled()
    await u.keyboard('{Escape}')
    expect(t.onCancel).toHaveBeenCalledTimes(1)
  })

  it('mở ra thì focus nằm SẴN trong hộp thoại', () => {
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
        <DialogXacNhan title="Duyệt báo cáo này?" confirmLabel="Duyệt" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>,
    )
    const ngoai = screen.getByRole('button', { name: 'Nút ngoài' })
    await u.tab()
    await u.tab()
    await u.tab()
    expect(document.activeElement).not.toBe(ngoai)
  })

  // Bẫy focus ở cấu hình CÓ ô lý do: lúc chưa đủ 10 ký tự, nút chính đang `disabled`. Nếu bộ chọn
  // phần tử nhận focus không loại `[disabled]` thì nút khoá đó thành "mốc cuối" mà Tab không bao
  // giờ đứng lên được — bẫy hở đúng ở hai hộp thoại "Trả lại"/"Mở lại".
  it('có ô lý do (nút chính đang khoá): Tab vẫn quay vòng trong hộp thoại', async () => {
    const u = userEvent.setup()
    render(
      <>
        <button type="button">Nút ngoài</button>
        <DialogXacNhan
          title="Trả lại báo cáo"
          confirmLabel="Trả lại"
          requireNote
          noteLabel="Lý do trả lại (người nộp sẽ thấy nguyên văn)"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    )
    const ngoai = screen.getByRole('button', { name: 'Nút ngoài' })
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    await u.tab()
    expect(document.activeElement).toBe(nutChinh('Huỷ'))
    await u.tab()
    expect(document.activeElement).not.toBe(ngoai)
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  // Hiệu ứng đưa focus vào chỉ được chạy MỘT LẦN lúc mở (mảng phụ thuộc rỗng). Cho nó chạy lại
  // mỗi lần render thì mỗi phím gõ vào ô lý do, mỗi lần `pending` lật, focus lại bị giật về phần
  // tử đầu — người dùng bàn phím không đứng yên được ở đâu.
  it('render lại KHÔNG giật focus về phần tử đầu', async () => {
    const u = userEvent.setup()
    const chung = {
      title: 'Trả lại báo cáo',
      confirmLabel: 'Trả lại',
      requireNote: true,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }
    const { rerender } = render(<DialogXacNhan {...chung} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    await u.tab()
    expect(document.activeElement).toBe(nutChinh('Huỷ'))
    rerender(<DialogXacNhan {...chung} />)
    expect(document.activeElement).toBe(nutChinh('Huỷ'))
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
          {mo && (
            <DialogXacNhan
              title="Trả lại báo cáo"
              confirmLabel="Trả lại"
              onConfirm={vi.fn()}
              onCancel={() => setMo(false)}
            />
          )}
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
