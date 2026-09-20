import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toast as sonnerToast } from 'sonner'

import { Chip } from './Chip'
import { Toast } from './Toast'
import { O_BANG } from '../../features/admin/khung'
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
    ['approved', 'bg-success-bg'],
    ['submitted', 'bg-warning-bg'],
    ['late', 'bg-warning-bg'],
    ['returned', 'bg-destructive-bg'],
    ['draft', 'bg-muted'],
  ])('chip %s tô đúng màu nền theo kind, không lẫn sang kind khác', (kind, bgClass) => {
    const { container } = render(<Chip kind={kind as never} />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'background-color')).toBe(bgClass)
  })

  // Vòng sửa 3 — P1: LỖI SẢN PHẨM THẬT sống qua cả vòng 1 lẫn vòng 2 — đúng lỗi S1, chỉ khác
  // background-color thay vì border-color. outline CỘNG THÊM bg-transparent cạnh bg-* của kind
  // thay vì THAY THẾ, nên kind nào có nền đứng SAU bg-transparent trong CSS thật (submitted/late:
  // bg-warning-bg) vẫn thắng cascade — chip outline hiện nền vàng thay vì trong suốt. Test
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
  // bất kể thứ tự viết trong JSX. Chuỗi className "chứa" border-border/border-current vẫn ĐÚNG dù
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
    // Từ vòng chốt hiện trạng: `draft` CÓ viền, lệch khỏi mockup status.html một cách có chủ ý —
    // `bg-muted` của nó chênh nền cột kỳ đang chọn (`bg-primary/5`) đúng 1% độ sáng nên chip "Nháp"
    // đọc như chữ trần trên lưới /status. Lý do đầy đủ ở KIND_BORDER trong Chip.tsx.
    ['draft', false, 'border-border'],
    ['missing', false, 'border-border'],
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
  // border-border của kind=missing) có thể vẫn ra "kết quả" đúng may rủi nếu utility dư tình cờ
  // thua cascade — nhưng SỐ LƯỢNG luôn lộ ra ngay. Regex ở đây phải MỞ (border-<bất kỳ>), không
  // liệt kê sẵn ba tên màu như vòng 1 — danh sách đóng chính là lỗ hổng đã bị bắt ở vòng 2 (mutation
  // thêm màu thứ tư không có trong danh sách đóng vẫn đếm ra 1, sai).
  //
  // Lát "dựng lại primitive": phép đếm đổi từ regex `/\bborder-\S+/` sang HỎI CHÍNH CSS ĐÃ BUILD
  // (`resolveDeclaredValue`), đúng kỹ thuật P6 bên dưới đã dùng cho `color`. Lý do: từ khi Chip
  // dựng trên `ui/badge.tsx`, chuỗi className mang thêm `focus-visible:border-ring` và
  // `aria-invalid:border-destructive` — hai utility CÓ ĐIỀU KIỆN, chỉ áp dụng lúc focus/invalid,
  // không bao giờ đua với border-color lúc nghỉ. Regex đếm cả chúng thành 3; cái regex đếm được
  // lại không phải cái gây ra cuộc đua. Câu hỏi cần giữ vẫn nguyên vẹn — "có utility nào DƯ cùng
  // thuộc tính ở TRẠNG THÁI NGHỈ không" — và hỏi thẳng CSS thì không danh sách đóng nào để lách,
  // đúng tinh thần vòng 2 đã chốt.
  //
  // NHƯNG phải nói thẳng: từ lát này, phép đếm CANH MỘT THỨ KHÁC so với lúc nó ra đời. `Badge` gộp
  // lớp bằng `cn` (clsx + tailwind-merge), mà tailwind-merge GỠ HẲN lớp bị ghi đè khỏi chuỗi — nên
  // hai utility cùng nhóm không còn cách nào cùng tới DOM, tức cuộc đua S1/P1 không tự tái diễn
  // trong Chip được nữa (đã kiểm bằng mutation: nhét `bg-primary/5 border-border` dư vào className
  // làm ĐỎ 24 ca KẾT QUẢ ở trên, nhưng KHÔNG ca đếm nào — `cn` nuốt mất lớp dư trước khi đếm).
  // Thứ phép đếm canh bây giờ là bất biến ĐỠ ĐẦU cho tất cả những ca kia: "`cn` phải còn là
  // tailwind-merge". Thay `cn` bằng một hàm nối chuỗi thuần ⇒ border-color đếm ra 3, color đếm ra 2
  // ⇒ đỏ ngay. Đó là lý do giữ nguyên cả 24 ca chứ không gộp bớt.
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
  ])('kind=%s outline=%s → đúng MỘT utility khai `border-color`, không utility nào dư (đếm mở, P2)', (kind, outline) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    const khaiBorder = cls
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => resolveDeclaredValue(c, 'border-color') !== null)
    expect(khaiBorder).toHaveLength(1)
  })

  // Vòng sửa 3 — P2 (mở rộng sang background-color): đây chính xác là chỗ P1 đã lọt lưới — vòng 2
  // không có assert đếm nào cho background-color nên chip outline cộng dồn 2 utility bg-* (kind
  // của chip + bg-transparent) không bị bắt cho tới khi reviewer tự đo CSS.
  //
  // Lát "dựng lại primitive": đổi sang `resolveDeclaredValue` cùng lý do đã ghi ở phép đếm
  // border-color ngay trên — `ui/badge.tsx` mang theo `[a]:hover:bg-muted` (biên dịch ra
  // `:is(a):hover`, chip là <span> nên không bao giờ khớp), regex đếm nó thành một đối thủ không
  // có thật.
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
  ])('kind=%s outline=%s → đúng MỘT utility khai `background-color`, không utility nào dư (đếm mở, P2)', (kind, outline) => {
    const { container } = render(<Chip kind={kind as never} outline={outline as boolean} />)
    const cls = container.firstElementChild?.className ?? ''
    const khaiBg = cls
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => resolveDeclaredValue(c, 'background-color') !== null)
    expect(khaiBg).toHaveLength(1)
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
    ['approved', false, 'text-success-foreground'],
    ['submitted', false, 'text-warning-foreground'],
    ['late', false, 'text-warning-foreground'],
    ['returned', false, 'text-destructive'],
    ['draft', false, 'text-secondary-foreground'],
    ['missing', false, 'text-muted-foreground'],
    ['approved', true, 'text-success-foreground'],
    ['submitted', true, 'text-warning-foreground'],
    ['late', true, 'text-warning-foreground'],
    ['returned', true, 'text-destructive'],
    ['draft', true, 'text-secondary-foreground'],
    ['missing', true, 'text-muted-foreground'],
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
    expect(resolveCascadeWinner(cls, 'border-color')).toBe('border-border')
  })

  it('outline luôn hiện viền border-current — biến thể c-seed (D6) không được chết vì cascade', () => {
    const { container } = render(<Chip kind="approved" outline />)
    const cls = container.firstElementChild?.className ?? ''
    expect(resolveCascadeWinner(cls, 'border-color')).toBe('border-current')
  })

  // Thêm ở lát "dựng lại primitive": README gói bàn giao mục 12 in ĐẬM "`rounded-md`, KHÔNG phải
  // pill" cho huy hiệu. `ui/badge.tsx` mặc định `rounded-4xl` (pill), nên yêu cầu này sống hay chết
  // hoàn toàn nhờ một lớp ghi đè trong `Chip.tsx` — thứ dễ rơi nhất trong một lần dọn class. Hỏi
  // cascade thay vì `toContain('rounded-md')`: chuỗi vẫn "chứa" rounded-md kể cả khi một lớp bo góc
  // khác đứng sau trong CSS đã đè mất nó, đúng loại lỗi S1/P1 đã trả giá hai lần.
  it.each(['approved', 'missing'] as const)(
    'kind=%s → bo góc thắng cascade là rounded-md, KHÔNG phải pill (README mục 12)',
    (kind) => {
      const { container } = render(<Chip kind={kind} />)
      const cls = container.firstElementChild?.className ?? ''
      expect(resolveCascadeWinner(cls, 'border-radius')).toBe('rounded-md')
    },
  )
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
    return (
      <button type="button" onClick={() => sonnerToast(chu)}>
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
    screen.getByRole('button', { name: 'bật' }).click()
    // Lát 5: `findBy…` chứ không `act(() => click())`. sonner đẩy toast qua `setTimeout(…, 0)` +
    // `flushSync` (dist ~dòng 1032) rồi `Toast.tsx` gắn `role="status"` trong một `MutationObserver`
    // — hai chặng NGOÀI hàng đợi vi tác vụ mà `act` rút cạn, nên một khẳng định đồng bộ ngay sau
    // cú bấm sẽ đọc DOM lúc chưa có gì.
    expect((await screen.findByRole('status')).textContent).toContain('Đã duyệt')
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
    screen.getByRole('button', { name: 'bật' }).click()
    await screen.findByRole('status')
    expect(bien()).not.toBe('')
    // 4000ms là tuổi thọ toast (`TOAST_LIFETIME` của sonner, trùng đúng `TOAST_MS` của bản tự vẽ).
    // 200ms thêm vào là `TIME_BEFORE_UNMOUNT`: sonner đánh dấu toast `data-removed` để nó trượt ra
    // rồi mới GỠ khỏi cây sau bấy nhiêu — dải chỉ được trả lại ở mốc gỡ, không phải mốc hết giờ.
    await act(async () => {
      vi.advanceTimersByTime(4000 + 200)
    })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(bien()).toBe('')
  })
})

// Lát 4 (dựng bảng trên `ui/table.tsx`): `TableCell` của shadcn khai `p-2` — đệm VIẾT TẮT, bốn
// chiều. Các hằng cỡ ô của kho chỉ truyền `px-3`, không chạm chiều dọc, nên 8px trên + 8px dưới
// của primitive lọt vào và dòng cao thêm 13px (đo thật: Reports 36→49px, StatusGrid 41→57px —
// riêng bảng /reports là +858px cho một trang 66 dòng). `py-0` là thứ trung hoà nó.
//
// Ca này tồn tại vì `py-0` TRÔNG NHƯ một lớp thừa — đúng hình dạng thứ bị "dọn dẹp" trong một lần
// đọc lại, và trước ca này thì xoá nó đi KHÔNG gì đỏ. Cùng một cái bẫy đã sinh ra ca A5-h ở
// Dashboard.test.tsx.
//
// Giới hạn phải nói rõ: resolver KHÔNG hiểu thuộc tính rút gọn (cascade.ts — P5), nên nó chứng
// minh được "`py-0` có mặt và khai padding-block: 0", không chứng minh được "nó thắng `p-2`".
// Vế sau đo tay trên CSS đã build: `.p-2` ở offset 27231, `.py-0` ở 27942 — đứng sau, nên thắng.
describe('ô bảng — đệm dọc của primitive bị trung hoà (lát 4)', () => {
  it('`TableCell` thật sự khai đệm viết tắt, nên cần trung hoà', () => {
    expect(resolveDeclaredValue('p-2', 'padding')).not.toBeNull()
  })

  // Ba hằng anh em cùng luật, cùng lý do, nhưng không xuất ra nên không khoá được từ đây:
  // `pages/Reports.tsx` O_BANG · `features/dashboard/UnitsTable.tsx` O_CHUNG ·
  // `features/status/StatusGrid.tsx` O_KY. Sửa một chỗ thì soát cả bốn.
  it('O_BANG trung hoà đệm dọc về 0', () => {
    expect(resolveDeclaredValue(O_BANG, 'padding-block')).toBe('0')
  })
})
