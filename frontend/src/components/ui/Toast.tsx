import { useEffect, useLayoutEffect, useRef } from 'react'
import { create } from 'zustand'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastPayload {
  message: string
  action?: ToastAction
}

interface ToastStore {
  toast: ToastPayload | null
  show: (message: string, action?: ToastAction) => void
  hide: () => void
}

// Store toàn cục (zustand — đã là dependency bắt buộc của app) để useToast() gọi được từ bất kỳ
// đâu mà không cần bọc <ToastProvider>; <Toast/> chỉ cần mount một lần gần root.
const useToastStore = create<ToastStore>()((set) => ({
  toast: null,
  show: (message, action) => set({ toast: { message, action } }),
  hide: () => set({ toast: null }),
}))

export function useToast() {
  return useToastStore((s) => s.show)
}

const TOAST_MS = 4000 // "Toast 4 giây góc dưới phải" — ghi chú bản vẽ states.html

/** P3 (final-fix-FE.md, Ruling 425 · final-review-R3-report.md §A1) — tên biến CSS mà Toast công
 *  bố chiều cao dải của mình qua đó. Giá trị mặc định `0px` khai trong `index.css`. */
const BIEN_CAO = '--toast-cao'

export function Toast() {
  const toast = useToastStore((s) => s.toast)
  const hide = useToastStore((s) => s.hide)
  const hop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(hide, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast, hide])

  // P3 — Toast DÀNH SẴN CHỖ thay vì nổi đè.
  //
  // Trước bản vá, Toast (`fixed right-6 bottom-6`) chồng thẳng lên cụm nút bên phải của thanh dính
  // (`FormModeBar`, `sticky bottom-0 justify-between`): bấm Duyệt xong, nút tiếp theo KHÔNG ăn suốt
  // 4 giây. Chính bộ e2e đã đo được điều đó và đi VÒNG qua nó (mở hộp thoại bằng bàn phím) thay vì
  // tố nó.
  //
  // Vá toạ độ (`bottom-24`) chỉ dời cửa sang một thanh dính cao hơn hoặc một viewport thấp hơn —
  // 1024×640 đã đo được đúng lỗi này. Câu hỏi đúng là "Toast có được phép nằm đè lên vùng bấm được
  // không" — KHÔNG. Nên Toast tự đo dải nó chiếm rồi CÔNG BỐ, và vùng nội dung của app (`AppShell`)
  // cùng mọi thanh dính đáy (`FormModeBar`) lùi lên đúng bấy nhiêu.
  //
  // Đo `innerHeight - rect.top` chứ không đo `offsetHeight`: dải cần chừa gồm CẢ khoảng hở dưới
  // (`bottom-6`), và một phép đo lấy thẳng từ hình học thì không có hằng số ma thuật nào để trôi
  // khỏi CSS. `useLayoutEffect` để biến có giá trị TRƯỚC lượt vẽ đầu tiên — với `useEffect`, thanh
  // dính nhảy lên sau khi người dùng đã thấy nó ở chỗ cũ.
  useLayoutEffect(() => {
    const goc = document.documentElement
    if (hop.current === null) {
      goc.style.removeProperty(BIEN_CAO)
      return
    }
    goc.style.setProperty(BIEN_CAO, `${Math.ceil(window.innerHeight - hop.current.getBoundingClientRect().top)}px`)
    // Dọn khi Toast tắt HOẶC khi `<Toast/>` unmount — để lại một dải chừa vĩnh viễn thì mọi trang
    // về sau thiếu mất bấy nhiêu pixel mà không ai biết vì sao.
    return () => {
      goc.style.removeProperty(BIEN_CAO)
    }
  }, [toast])

  if (!toast) return null

  return (
    // fixed, KHÔNG phải absolute như .toast trong tokens.css: trong mockup toast được đặt bên
    // trong .frame (một khung demo có position:relative) nên absolute là đủ; app thật không có
    // khung bao ngoài đó, toast phải nổi trên toàn viewport bất kể cuộn trang → cần fixed. Khác
    // token có chủ đích, đừng "sửa lại cho đúng token".
    <div
      ref={hop}
      role="status"
      className="fixed right-6 bottom-6 bg-soot text-white py-2.5 px-3.5 rounded-input text-table shadow-[0_4px_16px_rgba(0,0,0,0.05)]"
    >
      {toast.message}
      {toast.action && (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            toast.action?.onClick()
          }}
          className="text-sky no-underline font-medium ml-2"
        >
          {toast.action.label}
        </a>
      )}
    </div>
  )
}
