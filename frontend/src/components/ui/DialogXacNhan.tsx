// frontend/src/components/ui/DialogXacNhan.tsx
//
// Đổi tên từ `Dialog.tsx` ở Lát 0 redesign. Hai lý do, lý do thứ hai là lý do bắt buộc:
//   1. Nó KHÔNG phải dialog chung — là hộp xác nhận có `requireNote`/`danger`/`pending`. Tên mới
//      mô tả đúng việc nó làm.
//   2. shadcn sinh `ui/dialog.tsx`; trên macOS `Dialog.tsx` và `dialog.tsx` LÀ CÙNG MỘT FILE, nên
//      `shadcn add dialog` ghi đè mất file này (đã đo thật). Xem src/app/casingScan.test.ts.
//
// Hộp thoại xác nhận dùng chung cho bốn chuyển trạng thái (thiết kế D24, spec dòng 682):
// Nộp / Duyệt nêu hậu quả rồi hỏi lại; Trả lại / Mở lại bắt nhập lý do.
//
// NĂM ĐIỀU ĐỊNH HÌNH FILE NÀY:
//
// 1. DÙNG THẺ `<dialog>` NHƯNG KHÔNG GỌI `showModal()`, CÓ CHỦ Ý. Đã đo trên đúng jsdom của repo
//    (29.1.1): `HTMLDialogElement` ở đó chỉ có MỖI thuộc tính `open` — không `showModal`, không
//    `close`, không sự kiện `cancel`. Và trong trình duyệt thật hai đường loại trừ nhau: gọi
//    `showModal()` trên thẻ ĐÃ có thuộc tính `open` ném `InvalidStateError`. Chọn một đường duy
//    nhất chạy giống hệt nhau ở cả hai nơi: React đặt `open`, còn nền mờ, bẫy focus và Esc do file
//    này tự làm. Đổi lại thì mất top-layer của trình duyệt — nên lớp bọc dưới đây phải `z-50`,
//    cao hơn `z-20` của header bảng và thanh dính (features/report/ReportForm.tsx).
//
// 2. ESC BẮT BẰNG `keydown` CỦA CHÍNH HỘP THOẠI, không trông vào sự kiện `cancel`. Điều kiện để
//    phím tới được đây là focus đang nằm TRONG hộp thoại — nên hiệu ứng "đưa focus vào" ở điểm 3
//    không phải trang trí a11y, nó là thứ làm Esc chạy được. Hệ quả đã ĐO ĐƯỢC và đã vá: một cú
//    bấm vào nền mờ từng đẩy focus về `<body>` và giết Esc; nay `mousedown` trên nền bị chặn mặc
//    định nên focus không rời hộp thoại.
//
// 3. FOCUS: mở thì đưa vào phần tử nhận focus ĐẦU TIÊN (có ô lý do thì chính là ô đó — người dùng
//    gõ được ngay; không có thì là nút "Huỷ", đứng trước nút chính trong DOM nên Enter lỡ tay
//    không gửi đi thứ gì). Đóng thì trả focus về đúng chỗ vừa rời — hộp thoại bị tháo khỏi cây,
//    không trả thì focus rơi về `<body>` và người dùng bàn phím mất chỗ đứng. Và lúc ĐANG GỬI thì
//    đưa focus lên chính hộp thoại: hai nút khoá lại, mà phần tử `disabled` không giữ được focus.
//
// 4. ĐANG GỬI THÌ KHOÁ CẢ HAI ĐƯỜNG THOÁT (Huỷ và Esc), không riêng nút chính. Một request đã
//    bay không rút lại được: để "Huỷ" bấm được ở đó là hứa điều không làm được — người dùng bấm
//    Huỷ rồi vẫn thấy toast "Đã nộp báo cáo 08/2026".
//
// 5. NGƯỠNG 10 KÝ TỰ LÀ LUẬT PHÍA CLIENT (spec dòng 682, cho CẢ "Trả lại" LẪN "Mở lại"). Backend
//    KHÔNG có ngưỡng nào: `services/workflow.py:224` chỉ kiểm `requires_note and not (note or
//    "").strip()`, tức chỉ cần khác rỗng. Cố ý lệch, đừng "sửa" server cho khớp.
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from './button'

/** Độ dài tối thiểu của lý do bắt buộc — spec dòng 682. Đếm trên chuỗi ĐÃ cắt khoảng trắng hai
 * đầu: mười dấu cách không phải một lý do. */
export const TOI_THIEU_GHI_CHU = 10

/** Phần tử nhận được focus bên trong hộp thoại. Danh sách hẹp đúng bằng những gì hộp thoại này
 * dựng ra (hai nút + một textarea) — `body` là một CHUỖI nên không có link hay ô nhập nào lọt vào
 * từ ngoài, và một bộ chọn "đủ mọi thứ" viết sẵn cho nội dung không tồn tại là mã đầu cơ. */
const NHAN_FOCUS = 'button:not([disabled]), textarea:not([disabled])'


export interface DialogXacNhanProps {
  title: string
  /** Câu hậu quả dưới tiêu đề. Không có thì không dựng khe trống nào. */
  body?: string
  confirmLabel: string
  /** Nút chính tô đỏ — thao tác phá đi thứ người khác vừa làm (Trả lại). */
  danger?: boolean
  /** Bắt nhập lý do ≥ 10 ký tự; nút chính khoá tới khi đủ. */
  requireNote?: boolean
  /** Nhãn của ô lý do. BẮT BUỘC khi `requireNote` — không có bản mặc định ở đây: `noiDungDialog`
   * (features/report/useChuyenTrangThai.ts) luôn truyền câu của đúng thao tác, nên một mặc định
   * thứ hai chỉ là chuỗi không đường nào trong app đi tới. */
  noteLabel?: string
  /** Đang chờ server: nút chính khoá lại và đổi chữ thành "Đang gửi…". */
  pending?: boolean
  onConfirm: (ghiChu: string) => void
  onCancel: () => void
}

/** KHÔNG có prop `open`: nơi gọi dựng component này khi muốn hỏi và thôi dựng khi hết hỏi
 * (`features/report/ReportForm.tsx`). Hai lớp cổng — một cái quyết định có dựng không, một cái
 * `open` quyết định có vẽ không — thì cái thứ hai không bao giờ `false` trong app thật.
 *
 * Nhờ "đóng là THÁO" mà mọi state của hộp thoại (chữ trong ô lý do) chết theo, nên lượt hỏi sau
 * luôn bắt đầu từ ô trống mà không cần một effect nào đi dọn. */
export function DialogXacNhan({
  title,
  body,
  confirmLabel,
  danger = false,
  requireNote = false,
  noteLabel,
  pending = false,
  onConfirm,
  onCancel,
}: DialogXacNhanProps) {
  const [ghiChu, setGhiChu] = useState('')
  const hopRef = useRef<HTMLDialogElement>(null)
  const focusCu = useRef<HTMLElement | null>(null)
  const idTieuDe = useId()
  const idGhiChu = useId()

  useEffect(() => {
    focusCu.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    hopRef.current?.querySelector<HTMLElement>(NHAN_FOCUS)?.focus()
    // Trả focus lúc đóng (hoặc lúc cả form bị tháo). Đọc qua ref chứ không đóng băng biến ngoài:
    // hàm dọn dẹp chạy ở lần render khác với lần nó được tạo ra.
    return () => focusCu.current?.focus()
  }, [])

  useEffect(() => {
    // ĐO ĐƯỢC: lúc `pending` bật, cả hai nút khoá lại — và một phần tử đang `disabled` thì KHÔNG
    // giữ được focus (trình duyệt thật thả focus về `<body>`; `user-event` mô phỏng đúng chuyện
    // đó qua `getActiveElement`). Focus rơi ra ngoài là Esc lẫn bẫy Tab chết theo, vì cả hai bắt
    // bằng `keydown` CỦA hộp thoại. Đưa focus lên chính hộp thoại (`tabIndex={-1}`) để nó ở lại
    // trong tầm cho tới khi server trả lời.
    if (pending) hopRef.current?.focus()
  }, [pending])

  const thieuGhiChu = requireNote && ghiChu.trim().length < TOI_THIEU_GHI_CHU
  const khoaNutChinh = pending || thieuGhiChu

  function batPhim(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === 'Escape') {
      // Chặn mặc định KỂ CẢ lúc đang gửi: nếu không, Esc rơi xuống trình duyệt (Firefox từng gắn
      // "dừng tải trang" vào phím này) ngay giữa một request đang bay.
      e.preventDefault()
      if (!pending) onCancel()
      return
    }
    if (e.key !== 'Tab') return
    // Bẫy focus: Tab ở phần tử cuối quay về đầu, Shift+Tab ở đầu nhảy xuống cuối. Không có bẫy
    // này thì Tab đi thẳng ra bảng 53 dòng phía sau — hộp thoại mất nghĩa "chặn lại để hỏi".
    const ds = Array.from(hopRef.current?.querySelectorAll<HTMLElement>(NHAN_FOCUS) ?? [])
    if (ds.length === 0) {
      // Đang gửi mà hộp thoại không có ô lý do: cả hai nút đều khoá, không còn gì nhận focus.
      // Giữ focus trên CHÍNH hộp thoại (`tabIndex={-1}`) thay vì thả Tab ra bảng phía sau.
      e.preventDefault()
      hopRef.current?.focus()
      return
    }
    const dau = ds[0]
    const cuoi = ds[ds.length - 1]
    const dang = document.activeElement
    if (e.shiftKey && dang === dau) {
      e.preventDefault()
      cuoi.focus()
    } else if (!e.shiftKey && dang === cuoi) {
      e.preventDefault()
      dau.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-panel/30 p-4"
      // Bấm vào NỀN MỜ không đóng hộp thoại (đây là câu hỏi "có chắc không", đóng vì một cú bấm
      // trượt là mất luôn câu hỏi) — nhưng nếu để yên thì cú bấm đó đẩy focus về `<body>` và Esc
      // chết theo, vì Esc bắt bằng `keydown` CỦA hộp thoại. Chặn mặc định của `mousedown` là cách
      // giữ focus nguyên chỗ cũ. Chỉ chặn khi bấm ĐÚNG vào nền: bấm vào trong hộp thoại vẫn phải
      // đặt được con trỏ vào ô lý do.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <dialog
        open
        ref={hopRef}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={idTieuDe}
        onKeyDown={batPhim}
        className="relative m-0 w-[480px] max-w-full p-0 border border-border rounded-xl bg-card text-foreground shadow-[0_4px_16px_rgba(0,0,0,0.05)]"
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id={idTieuDe} className="m-0 text-[15px] leading-[1.3] font-semibold text-foreground">
            {title}
          </h2>
          {body && <p className="mt-2 mb-0 text-sm text-secondary-foreground">{body}</p>}
          {requireNote && (
            <div className="mt-3">
              <label htmlFor={idGhiChu} className="block text-xs font-medium text-secondary-foreground mb-1">
                {noteLabel}
              </label>
              <textarea
                id={idGhiChu}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                className="block w-full min-h-20 border border-border rounded-md px-2.5 py-2 bg-card text-sm text-secondary-foreground focus:outline-2 focus:outline-ring focus:-outline-offset-2"
              />
              {/* Chỉ nói khi còn thiếu: nút đang khoá mà không có câu nào giải thích là chỗ người
                  dùng bấm mãi không được rồi bỏ cuộc. Đủ chữ thì câu biến mất, không đứng lại như
                  một lời nhắc thừa. */}
              {thieuGhiChu && (
                <div className="text-[11px] text-muted-foreground mt-0.5">Cần ít nhất {TOI_THIEU_GHI_CHU} ký tự</div>
              )}
            </div>
          )}
        </div>
        {/* Nút chính BÊN PHẢI (spec dòng 682) và đứng SAU "Huỷ" trong DOM — thứ tự đọc của trình
            đọc màn hình đi cùng thứ tự nhìn thấy. */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted">
          {/* "Huỷ" KHOÁ lúc đang gửi: request đã bay không rút lại được, nên một nút Huỷ bấm
              được ở đây là lời hứa sai — người dùng bấm nó rồi vẫn thấy toast "Đã nộp báo cáo
              08/2026". Nút chính đang hiện "Đang gửi…" là đủ để biết máy chưa treo. */}
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            disabled={khoaNutChinh}
            onClick={() => onConfirm(ghiChu)}
          >
            {pending ? 'Đang gửi…' : confirmLabel}
          </Button>
        </div>
      </dialog>
    </div>
  )
}
