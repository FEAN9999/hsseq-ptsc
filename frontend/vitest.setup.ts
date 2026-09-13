import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Không dùng `globals: true` (test file import describe/it/expect tường minh từ 'vitest'),
// nên testing-library không tự đăng ký afterEach cleanup — phải khai báo tay ở đây.
// Thiếu dòng này: DOM của test trước còn sót lại khi test sau render, screen.getByLabelText/getByText
// có thể khớp nhầm sang phần tử của lần render trước đó (đã kiểm chứng bằng mutation-test M6).
afterEach(() => {
  cleanup()
})
