// frontend/src/components/ui/Dialog.tsx
//
// Hộp thoại xác nhận dùng chung cho bốn chuyển trạng thái (thiết kế D24, spec dòng 682):
// Nộp / Duyệt nêu hậu quả rồi hỏi lại; Trả lại / Mở lại bắt nhập lý do.
//
// BỐN ĐIỀU ĐỊNH HÌNH FILE NÀY:
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
//    không phải trang trí a11y, nó là thứ làm Esc chạy được.
//
// 3. FOCUS: mở thì đưa vào phần tử nhận focus ĐẦU TIÊN (có ô lý do thì chính là ô đó — người dùng
//    gõ được ngay; không có thì là nút "Huỷ", đứng trước nút chính trong DOM nên Enter lỡ tay
//    không gửi đi thứ gì). Đóng thì trả focus về đúng chỗ vừa rời — hộp thoại bị tháo khỏi cây,
//    không trả thì focus rơi về `<body>` và người dùng bàn phím mất chỗ đứng.
//
// 4. NGƯỠNG 10 KÝ TỰ LÀ LUẬT PHÍA CLIENT (spec dòng 682, cho CẢ "Trả lại" LẪN "Mở lại"). Backend
//    KHÔNG có ngưỡng nào: `services/workflow.py:224` chỉ kiểm `requires_note and not (note or
//    "").strip()`, tức chỉ cần khác rỗng. Cố ý lệch, đừng "sửa" server cho khớp.
import { useEffect, useId, useRef, useState } from 'react'

/** Độ dài tối thiểu của lý do bắt buộc — spec dòng 682. Đếm trên chuỗi ĐÃ cắt khoảng trắng hai
 * đầu: mười dấu cách không phải một lý do. */
export const TOI_THIEU_GHI_CHU = 10

/** Phần tử nhận được focus bên trong hộp thoại. Danh sách hẹp đúng bằng những gì hộp thoại này
 * dựng ra (hai nút + một textarea) — `body` là một CHUỖI nên không có link hay ô nhập nào lọt vào
 * từ ngoài, và một bộ chọn "đủ mọi thứ" viết sẵn cho nội dung không tồn tại là mã đầu cơ. */
const NHAN_FOCUS = 'button:not([disabled]), textarea:not([disabled])'

const NUT =
  'inline-flex items-center justify-center h-8 px-3.5 rounded-input border text-table font-medium whitespace-nowrap disabled:opacity-50'
const NUT_HUY = `${NUT} bg-surface border-hair text-ink transition-colors duration-[120ms] hover:bg-mutedbg`
const NUT_CHINH = `${NUT} bg-cyan border-cyanEdge text-white`
const NUT_NGUY = `${NUT} bg-danger border-danger text-white`

export interface DialogProps {
  open: boolean
  title: string
  /** Câu hậu quả dưới tiêu đề. Không có thì không dựng khe trống nào. */
  body?: string
  confirmLabel: string
  /** Nút chính tô đỏ — thao tác phá đi thứ người khác vừa làm (Trả lại). */
  danger?: boolean
  /** Bắt nhập lý do ≥ 10 ký tự; nút chính khoá tới khi đủ. */
  requireNote?: boolean
  /** Nhãn của ô lý do. Nơi gọi luôn truyền câu của đúng thao tác (features/report/
   * useChuyenTrangThai.ts); mặc định dưới đây chỉ để ô không bao giờ thiếu tên cho trình đọc
   * màn hình. */
  noteLabel?: string
  /** Đang chờ server: nút chính khoá lại và đổi chữ thành "Đang gửi…". */
  pending?: boolean
  onConfirm: (ghiChu: string) => void
  onCancel: () => void
}

/** Đóng là THÁO, không phải ẩn: mọi state của hộp thoại (chữ trong ô lý do) chết theo, nên lượt
 * hỏi sau luôn bắt đầu từ ô trống mà không cần một effect nào đi dọn. Đây cũng là lý do phần thân
 * tách thành component riêng — `return null` giữa thân `Dialog` chỉ ngừng VẼ, instance và state
 * của nó vẫn sống. */
export function Dialog({ open, ...p }: DialogProps) {
  if (!open) return null
  return <ThanHopThoai {...p} />
}

function ThanHopThoai({
  title,
  body,
  confirmLabel,
  danger = false,
  requireNote = false,
  noteLabel = 'Lý do (người nộp sẽ thấy nguyên văn)',
  pending = false,
  onConfirm,
  onCancel,
}: Omit<DialogProps, 'open'>) {
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

  const thieuGhiChu = requireNote && ghiChu.trim().length < TOI_THIEU_GHI_CHU
  const khoaNutChinh = pending || thieuGhiChu

  function batPhim(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    // Bẫy focus: Tab ở phần tử cuối quay về đầu, Shift+Tab ở đầu nhảy xuống cuối. Không có bẫy
    // này thì Tab đi thẳng ra bảng 53 dòng phía sau — hộp thoại mất nghĩa "chặn lại để hỏi".
    const ds = Array.from(hopRef.current?.querySelectorAll<HTMLElement>(NHAN_FOCUS) ?? [])
    if (ds.length === 0) return
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-soot/30 p-4">
      <dialog
        open
        ref={hopRef}
        aria-modal="true"
        aria-labelledby={idTieuDe}
        onKeyDown={batPhim}
        className="relative m-0 w-[480px] max-w-full p-0 border border-hair rounded-tile bg-surface text-ink shadow-[0_4px_16px_rgba(0,0,0,0.05)]"
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id={idTieuDe} className="m-0 text-[15px] leading-[1.3] font-semibold text-ink">
            {title}
          </h2>
          {body && <p className="mt-2 mb-0 text-table text-soot">{body}</p>}
          {requireNote && (
            <div className="mt-3">
              <label htmlFor={idGhiChu} className="block text-xs font-medium text-soot mb-1">
                {noteLabel}
              </label>
              <textarea
                id={idGhiChu}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                className="block w-full min-h-20 border border-hair rounded-input px-2.5 py-2 bg-surface text-table text-soot focus:outline-2 focus:outline-cyan focus:-outline-offset-2"
              />
              {/* Chỉ nói khi còn thiếu: nút đang khoá mà không có câu nào giải thích là chỗ người
                  dùng bấm mãi không được rồi bỏ cuộc. Đủ chữ thì câu biến mất, không đứng lại như
                  một lời nhắc thừa. */}
              {thieuGhiChu && (
                <div className="text-[11px] text-sec mt-0.5">Cần ít nhất {TOI_THIEU_GHI_CHU} ký tự</div>
              )}
            </div>
          )}
        </div>
        {/* Nút chính BÊN PHẢI (spec dòng 682) và đứng SAU "Huỷ" trong DOM — thứ tự đọc của trình
            đọc màn hình đi cùng thứ tự nhìn thấy. */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-hair bg-mutedbg">
          <button type="button" onClick={onCancel} className={NUT_HUY}>
            Huỷ
          </button>
          <button
            type="button"
            disabled={khoaNutChinh}
            onClick={() => onConfirm(ghiChu)}
            className={danger ? NUT_NGUY : NUT_CHINH}
          >
            {pending ? 'Đang gửi…' : confirmLabel}
          </button>
        </div>
      </dialog>
    </div>
  )
}
