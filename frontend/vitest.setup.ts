import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { toast } from 'sonner'

// Không dùng `globals: true` (test file import describe/it/expect tường minh từ 'vitest'),
// nên testing-library không tự đăng ký afterEach cleanup — phải khai báo tay ở đây.
// Thiếu dòng này: DOM của test trước còn sót lại khi test sau render, screen.getByLabelText/getByText
// có thể khớp nhầm sang phần tử của lần render trước đó (đã kiểm chứng bằng mutation-test M6).
//
// Lát 5 (Toast → sonner): `cleanup()` KHÔNG đủ nữa. Hàng đợi toast của sonner là một biến toàn cục
// ở tầng module, sống ngoài cây React, và `ToastState.subscribe` PHÁT LẠI mọi toast còn "đang sống"
// cho người nghe mới (dist dòng 138-146 — chủ ý, để một `toast()` gọi trước lúc `<Toaster>` kịp
// mount không rơi mất). Hệ quả trong test: một toast chưa hết 4 giây khi ca kết thúc sẽ MOUNT LẠI
// cùng toast đó vào `<Toaster>` của ca sau, và `getByRole('status')` ở ca sau đổ vì thấy hai phần
// tử. `toast.dismiss()` không tham số đánh dấu mọi toast đang sống là đã tắt, tức dọn đúng hàng đợi
// chứ không chỉ dọn DOM.
afterEach(() => {
  cleanup()
  toast.dismiss()
})

// jsdom KHÔNG hiện thực Pointer Capture API. sonner gọi `setPointerCapture` ngay trong
// `onPointerDown` của mỗi toast (dist dòng 750) để giữ được cử chỉ vuốt-tắt khi con trỏ đi ra
// ngoài hộp. Thiếu nó, mỗi lần một ca bấm vào thứ gì bên trong toast (`useChuyenTrangThai.test`
// bấm link "Xem dashboard") là một `TypeError` không ai bắt — vitest tính nó là "Unhandled Error"
// và trả mã thoát 1 dù 919/919 ca đều xanh. Không có tiền lệ nào bảo đây là lỗi sản phẩm: trên
// trình duyệt thật hai hàm này có sẵn, e2e không hề vấp.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false
}

// jsdom KHÔNG hiện thực `window.matchMedia`. `components/ui/sidebar.tsx` của shadcn dùng nó qua
// `hooks/use-mobile.ts` để chọn giữa sidebar cố định và sidebar dạng Sheet, nên thiếu nó thì MỌI
// test render AppShell đều ném ngay trong effect. Trả khuôn tối thiểu mà `use-mobile` cần, mặc định
// `matches: false` = màn rộng (desktop) — đúng bối cảnh app này nhắm (1280+, laptop 1024 zoom 125%).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
