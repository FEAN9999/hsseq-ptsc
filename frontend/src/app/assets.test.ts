// frontend/src/app/assets.test.ts
//
// Bốn asset logo sống trong public/ (Vite phục vụ nguyên si, không qua bundler) nên KHÔNG có import
// nào trỏ tới chúng — thiếu file thì không lỗi build, chỉ là ảnh vỡ lúc chạy. Canh sự tồn tại.
//
// Chọn bản nào ở đâu là một quyết định thiết kế, không phải sở thích: ở 26px, dòng
// "A member of PETROVIETNAM" trong logo đầy đủ chỉ cao ~5px → thành vệt mờ. Nên sidebar dùng bản
// `wordmark` (đã cắt tagline), chỗ rộng mới dùng `logo`.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../public')

describe('asset logo PTSC', () => {
  it.each([
    ['ptsc-logo.png', 'header bản in, chỗ rộng'],
    ['ptsc-mark.png', 'bản trắng — nửa tối màn đăng nhập'],
    ['ptsc-wordmark.png', 'sidebar 26px — đã cắt tagline'],
    ['ptsc-wordmark-white.png', 'bản trắng của wordmark, nền tối chỗ hẹp'],
  ])('%s có mặt (%s)', (ten) => {
    expect(existsSync(join(PUBLIC, ten))).toBe(true)
  })
})
