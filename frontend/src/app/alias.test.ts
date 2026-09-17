// frontend/src/app/alias.test.ts
//
// Alias `@/*` là điều kiện bắt buộc của shadcn CLI, và mọi component sinh ra đều import qua nó
// (`@/lib/utils`, `@/components/ui/skeleton`). Hai mặt phải canh riêng:
//   1. Alias GIẢI ĐƯỢC lúc chạy — đúng cả trong bundle Vite lẫn trong Vitest.
//   2. KHÔNG có `baseUrl` — TypeScript 6 báo TS5101 và `tsc -b` thoát khác 0, nhưng lỗi đó chỉ lộ
//      ra khi chạy build, không lộ ra khi chạy vitest trần. Đo thẳng vào file cấu hình.
//      README của gói thiết kế bảo thêm `baseUrl`; làm theo thì gãy. Khoá lại để không ai "sửa
//      giúp" nó về.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { formatPeriod } from '@/lib/format'

const GOC = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('alias @/*', () => {
  it('giải được lúc chạy — import qua @/ trả đúng hàm thật', () => {
    expect(formatPeriod('2026-08')).toBe('08/2026')
  })

  // Đo thẳng vào chuỗi cấu hình (như ca baseUrl dưới), không qua JSON.parse: tsconfig.app.json có
  // comment khối `/* ... */`, còn "@/*" tự nó chứa chuỗi con "/*" — bóc comment bằng regex ngây thơ
  // sẽ ăn nhầm vào trong chuỗi đó và làm hỏng JSON.
  it.each(['tsconfig.json', 'tsconfig.app.json'])('%s khai paths @/* → ./src/*', (ten) => {
    const raw = readFileSync(join(GOC, ten), 'utf-8')
    expect(raw).toMatch(/"paths"\s*:\s*\{\s*"@\/\*"\s*:\s*\[\s*"\.\/src\/\*"\s*\]\s*\}/)
  })

  it.each(['tsconfig.json', 'tsconfig.app.json'])('%s KHÔNG có baseUrl (TS5101)', (ten) => {
    expect(readFileSync(join(GOC, ten), 'utf-8')).not.toMatch(/"baseUrl"/)
  })
})
