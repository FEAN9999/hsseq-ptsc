import { useEffect } from 'react'
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

export function Toast() {
  const toast = useToastStore((s) => s.toast)
  const hide = useToastStore((s) => s.hide)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(hide, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast, hide])

  if (!toast) return null

  return (
    <div
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
