import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Không dùng `globals: true` (test file import describe/it/expect tường minh từ 'vitest'),
// nên testing-library không tự đăng ký afterEach cleanup — phải khai báo tay ở đây.
// Thiếu dòng này: DOM của test trước còn sót lại khi test sau render, screen.getByLabelText/getByText
// có thể khớp nhầm sang phần tử của lần render trước đó (đã kiểm chứng bằng mutation-test M6).
afterEach(() => {
  cleanup()
})

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
