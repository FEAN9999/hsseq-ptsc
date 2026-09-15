import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Chip } from './Chip'
import { Tile } from './Tile'
import { Toast, useToast } from './Toast'
// Vòng sửa 2: mọi assert nói về giá trị THIẾT KẾ HIỂN THỊ (màu nền/viền/chữ, margin) phải hỏi
// resolver "lớp nào thắng cascade trong CSS thật đã build", không hỏi className có chứa chuỗi gì —
// xem giải thích đầy đủ trong cascade.ts.
import { resolveCascadeWinner, resolveDeclaredValue } from './cascade'

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

  // Vòng sửa 3 — P1: LỖI SẢN PHẨM THẬT sống qua cả vòng 1 lẫn vòng 2 — đúng lỗi S1, chỉ khác
  // background-color thay vì border-color. outline CỘNG THÊM bg-transparent cạnh bg-* của kind
  // thay vì THAY THẾ, nên kind nào có nền đứng SAU bg-transparent trong CSS thật (submitted/late:
  // bg-warningBg) vẫn thắng cascade — chip outline hiện nền vàng thay vì trong suốt. Test
  // "source=seed" phía trên chỉ dựng kind="approved" — đúng ca DUY NHẤT tình cờ không lỗi (nền
  // approved đứng TRƯỚC bg-transparent trong CSS) nên không bắt được submitted/late. Test này phủ
  // đủ cả 6 kind để không còn ca nào "may mắn" che lỗi.
  it.each(['approved', 'submitted', 'late', 'returned', 'draft', 'missing'] as const)(
    'outline=true kind=%s → nền PHẢI trong suốt cho mọi kind, không riêng approved (P1)',
    (kind) => {
      const { container } = render(<Chip kind={kind} outline />)
      const cls = container.firstElementChild?.className ?? ''
      expect(resolveCascadeWinner(cls, 'background-color')).toBe('bg-transparent')
    },
  )

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

  // Vòng sửa 3 — P2: vòng 2 bỏ hẳn assert ĐẾM SỐ LƯỢNG của vòng 1 để thay bằng assert KẾT QUẢ qua
  // resolver ở trên. Hai câu hỏi này BỔ SUNG cho nhau, không thay thế được nhau: "kết quả" xác
  // nhận cascade thắng đúng cho những gì ĐANG có; "đếm" xác nhận không có gì THỪA cùng thuộc tính
  // để tạo cuộc đua từ đầu. Tự thêm một utility border-color dư (vd. border-current dư cạnh
  // border-hair của kind=missing) có thể vẫn ra "kết quả" đúng may rủi nếu utility dư tình cờ
  // thua cascade — nhưng SỐ LƯỢNG luôn lộ ra ngay. Regex ở đây phải MỞ (border-<bất kỳ>), không
  // liệt kê sẵn ba tên màu như vòng 1 — danh sách đóng chính là lỗ hổng đã bị bắt ở vòng 2 (mutation
  // thêm màu thứ tư không có trong danh sách đóng vẫn đếm ra 1, sai).
  it.each([
    ['approved', false],
    ['submitted', false],
    ['late', false],
    ['returned', false],
    ['draft', false],
    ['missing', false],
    ['approved', true],
    ['submitted', true],
    ['late', true],
    ['returned', true],
    ['draft', true],
    ['missing', true],
  ])('kind=%s outline=%s → đúng MỘT utility border-<màu>, không utility nào dư (đếm mở, P2)', (kind, outline) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    expect(cls.match(/\bborder-\S+/g)?.length ?? 0).toBe(1)
  })

  // Vòng sửa 3 — P2 (mở rộng sang background-color): đây chính xác là chỗ P1 đã lọt lưới — vòng 2
  // không có assert đếm nào cho background-color nên chip outline cộng dồn 2 utility bg-* (kind
  // của chip + bg-transparent) không bị bắt cho tới khi reviewer tự đo CSS.
  it.each([
    ['approved', false],
    ['submitted', false],
    ['late', false],
    ['returned', false],
    ['draft', false],
    ['missing', false],
    ['approved', true],
    ['submitted', true],
    ['late', true],
    ['returned', true],
    ['draft', true],
    ['missing', true],
  ])('kind=%s outline=%s → đúng MỘT utility bg-<màu>, không utility nào dư (đếm mở, P2)', (kind, outline) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    expect(cls.match(/\bbg-\S+/g)?.length ?? 0).toBe(1)
  })

  // ---- P6 (final-fix-FE.md · final-review-R3-report.md §A4) — MẶT THỨ BA của đúng cái lỗ đã ship
  // HAI lỗi thật.
  //
  // Mặt (1) *nền* và mặt (2) *viền* đã có người canh ở ngay trên, và dự án đã trả giá cho cả hai ở
  // hai vòng liên tiếp (S1: viền; P1: nền). Mặt (3) *màu chữ* vẫn mở: cộng thêm `text-ink` cạnh
  // `KIND_TEXT[kind]` ở `Chip.tsx:78` ⇒ **750/750 XANH**. Trên bundle thật, hai utility cùng khai
  // `color` có cùng độ đặc hiệu, cái đứng SAU trong CSS thắng ⇒ chip "Đã duyệt" mất màu xanh,
  // "Trả lại" mất màu đỏ, **cả sáu kind tụt về một màu**. Màu chip là NGÔN NGỮ CHÍNH của `/status`
  // (lưới 22 × N ô) và `/reports` — mất nó là mất thông tin, không phải mất thẩm mỹ.
  //
  // Làm y hai mặt kia: một cặp assert KẾT QUẢ + ĐẾM. Hai câu hỏi này bổ sung nhau, không thay thế
  // nhau — "kết quả" xác nhận cascade thắng đúng cho những gì ĐANG có; "đếm" xác nhận không có gì
  // THỪA cùng thuộc tính để tạo cuộc đua từ đầu.
  it.each([
    ['approved', false, 'text-success'],
    ['submitted', false, 'text-warning'],
    ['late', false, 'text-warning'],
    ['returned', false, 'text-danger'],
    ['draft', false, 'text-draft'],
    ['missing', false, 'text-sec'],
    ['approved', true, 'text-success'],
    ['submitted', true, 'text-warning'],
    ['late', true, 'text-warning'],
    ['returned', true, 'text-danger'],
    ['draft', true, 'text-draft'],
    ['missing', true, 'text-sec'],
  ])('kind=%s outline=%s → cascade cho color phải thắng đúng %s (P6, mặt thứ ba)', (kind, outline, mauChu) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'color')).toBe(mauChu)
  })

  // ĐẾM — và đếm bằng CHÍNH CSS ĐÃ BUILD, không bằng regex trên tên lớp.
  //
  // `/\btext-\S+/` là cái bẫy mà báo cáo nêu đích danh: `text-xs` (font-size) cũng khớp, nên một
  // phép đếm thô luôn ra 2 và phải chốt `toBe(2)` — lúc đó thêm `text-ink` thành 3 thì bắt được,
  // nhưng thêm một utility màu KHÔNG mang tiền tố `text-` thì không. Đúng dạng "danh sách đóng" mà
  // vòng 2 của mặt *viền* đã bị bắt.
  //
  // Hỏi thẳng CSS: lớp nào trong className thật sự khai `color` ở trạng thái nghỉ. `text-xs` khai
  // `font-size`/`line-height` nên tự rụng; `border-current` khai `border-color` nên cũng rụng. Đếm
  // này không có danh sách nào để lách qua.
  it.each([
    ['approved', false],
    ['submitted', false],
    ['late', false],
    ['returned', false],
    ['draft', false],
    ['missing', false],
    ['approved', true],
    ['submitted', true],
    ['late', true],
    ['returned', true],
    ['draft', true],
    ['missing', true],
  ])('kind=%s outline=%s → đúng MỘT utility khai `color`, không utility nào dư (đếm mở, P6)', (kind, outline) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    const khaiColor = cls
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => resolveDeclaredValue(c, 'color') !== null)
    expect(khaiColor).toHaveLength(1)
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

// ---- P3 (final-fix-FE.md, Ruling 425 · final-review-R3-report.md §A1) ----
//
// Người canh CHÍNH của mục này là khẳng định HÌNH HỌC ở e2e (`C-T24/2c`: giao hộp Toast với hộp mọi
// <button> đang hiện = ∅) — jsdom không có layout nên không đo nổi phép giao đó.
//
// Hai ca dưới đây canh nửa CƠ CHẾ mà jsdom đo được, và chúng rẻ hơn e2e ~100 lần: Toast có thật sự
// CÔNG BỐ dải nó chiếm không, và có TRẢ LẠI khi tắt không. Vế thứ hai quan trọng ngang vế thứ nhất:
// một biến không được dọn để lại dải chừa vĩnh viễn trên MỌI trang về sau, mà không ai biết vì sao
// thiếu mất bấy nhiêu pixel.
describe('Toast — dải chừa (P3)', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--toast-cao')
    vi.useRealTimers()
  })

  function Bam({ chu }: { chu: string }) {
    const hien = useToast()
    return (
      <button type="button" onClick={() => hien(chu)}>
        bật
      </button>
    )
  }

  const bien = () => document.documentElement.style.getPropertyValue('--toast-cao')

  it('Toast đang hiện thì CÔNG BỐ dải nó chiếm qua --toast-cao', async () => {
    render(
      <>
        <Bam chu="Đã duyệt" />
        <Toast />
      </>,
    )
    expect(bien()).toBe('') // chưa có Toast: không chừa gì, bố cục không đổi một pixel
    await act(async () => {
      screen.getByRole('button', { name: 'bật' }).click()
    })
    expect(screen.getByRole('status').textContent).toContain('Đã duyệt')
    // jsdom trả `getBoundingClientRect()` toàn số 0 nên con số ở đây không mang nghĩa hình học —
    // nó bằng đúng `window.innerHeight`. Chốt DƯƠNG chứ không chỉ "là một độ dài px hợp lệ": một
    // bản vá công bố `0px` vẫn đặt biến, vẫn khớp `/\d+px/`, mà lại chừa đúng 0 pixel — tức không
    // sửa gì. Giới hạn đã biết: một bản vá đo bằng `offsetHeight` (bỏ mất khoảng hở dưới) cho 0
    // trong jsdom nên cũng đỏ ở đây; hình học THẬT đo ở e2e `C-T24/2c`.
    const px = bien()
    expect(px).toMatch(/^\d+px$/)
    expect(Number.parseFloat(px)).toBeGreaterThan(0)
  })

  it('Toast tắt sau 4 giây thì TRẢ LẠI dải — không để lại chỗ chừa vĩnh viễn', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <>
        <Bam chu="Đã duyệt" />
        <Toast />
      </>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'bật' }).click()
    })
    expect(bien()).not.toBe('')
    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(bien()).toBe('')
  })
})
