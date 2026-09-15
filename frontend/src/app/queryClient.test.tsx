// frontend/src/app/queryClient.test.tsx
//
// P5 (final-fix-FE.md · final-review-R3-report.md §A3) — NỬA ÂM CỦA `retry`.
//
// `app/queryClient.ts:26` là một vị từ HAI MẶT:
//   · mặt DƯƠNG — 4xx là KẾT LUẬN của máy chủ, không thử lại. Mặt này CÓ người canh chắc: hai ca
//     "403 hiện NGAY với QueryClient cấu hình như bản thật" (Dashboard.test.tsx, Status.test.tsx),
//     và đột biến ngược (`if (false) return false`) làm chúng đỏ.
//   · mặt ÂM — 5xx/lỗi mạng là trục trặc TẠM THỜI, VẪN thử lại. Mặt này **không ai canh**: đột
//     biến `return soLanDaThu < 3` → `return false` (không thử lại GÌ) sống sót 750/750.
//
// Đúng bài học K2: lỗi trốn ở mặt âm. Hệ quả thật của việc mất mặt âm: `/dashboard` gặp 502 lúc
// Render ngủ dậy; hôm nay nó tự khỏi sau vài request và khán giả không thấy gì. Gỡ lớp đó thì màn
// hình hiện "Không tải được" và người trình bày phải bấm "Thử lại" trước Ban ATCL — không một ca
// nào đỏ để báo.
//
// Ba ca dưới đây chạy trên ĐÚNG `getDefaultOptions()` của singleton thật (không chép tay lại logic
// retry — chép là tạo một bản thứ hai để trôi), nhưng dựng `QueryClient` MỚI để không đụng cache
// singleton. Không đổi một dòng mã sản phẩm nào.
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { queryClient } from './queryClient'

/** Một màn tối thiểu đi qua ĐÚNG đường thật: `api.get` → `ApiError` → vị từ `retry` của singleton. */
function Man() {
  const q = useQuery({ queryKey: ['p5-retry'], queryFn: () => api.get<{ ok: boolean }>('/thu') })
  if (q.isPending) return <div>đang tải</div>
  if (q.isError) return <div>hỏng</div>
  return <div>xong</div>
}

function ve() {
  const qc = new QueryClient({ defaultOptions: queryClient.getDefaultOptions() })
  return render(
    <QueryClientProvider client={qc}>
      <Man />
    </QueryClientProvider>,
  )
}

/** Tua qua toàn bộ backoff mặc định của TanStack (1s + 2s + 4s = 7s) với lề rộng. */
async function tuaHetBackoff() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
}

function json(status: number, body: unknown) {
  return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body }
}

describe('queryClient — nửa ÂM của retry (P5)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('502 hai lượt rồi 200: query TỰ KHỎI, màn hình không bao giờ hiện "hỏng"', async () => {
    let lan = 0
    const f = vi.fn(() => {
      lan += 1
      return Promise.resolve(lan <= 2 ? json(502, { detail: 'Bad gateway' }) : json(200, { ok: true }))
    })
    vi.stubGlobal('fetch', f)

    ve()
    await tuaHetBackoff()

    expect(screen.getByText('xong')).toBeTruthy()
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('lỗi MẠNG (fetch tự ném) cũng được thử lại — không chỉ 5xx có thân JSON', async () => {
    let lan = 0
    const f = vi.fn(() => {
      lan += 1
      return lan <= 2 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(json(200, { ok: true }))
    })
    vi.stubGlobal('fetch', f)

    ve()
    await tuaHetBackoff()

    expect(screen.getByText('xong')).toBeTruthy()
    expect(f).toHaveBeenCalledTimes(3)
  })

  // Ngân sách phải CÓ ĐÁY: `soLanDaThu < 3` = tổng 4 lời gọi. Không chốt con số này thì một bản vá
  // `soLanDaThu < 50` cũng xanh hai ca trên, và một máy chủ chết thật sẽ giữ màn hình quay vòng
  // hàng phút trước Ban ATCL thay vì nói ra là hỏng.
  it('502 mãi: dừng sau ĐÚNG 4 lời gọi (1 + 3 lượt thử lại) rồi mới báo hỏng', async () => {
    const f = vi.fn(() => Promise.resolve(json(502, { detail: 'Bad gateway' })))
    vi.stubGlobal('fetch', f)

    ve()
    await tuaHetBackoff()

    expect(screen.getByText('hỏng')).toBeTruthy()
    expect(f).toHaveBeenCalledTimes(4)
  })
})
