// frontend/src/api/client.ts
//
// Một chỗ duy nhất gọi fetch tới backend + bắt lỗi thống nhất. Thân lỗi backend LUÔN phẳng
// {"detail": <chuỗi>, **extra} (AppError.body(), backend/app/core/errors.py) — không có JSON
// lồng nào để đào sâu hơn một cấp. Các `extra` khác nhau tuỳ nơi ném (đối chiếu tại đúng dòng,
// xem task-17-carry.md phần C1):
//   409 khoá lạc quan (chuyển trạng thái)  services/workflow.py:198        {state, version}
//   409 khoá lạc quan (PUT .../values)     services/reports.py:414-417     {state, version, values}
//   409 báo cáo đã tồn tại                 api/reports.py:94               {existing_id}
//   400 thiếu ô bắt buộc lúc chuyển trạng   services/workflow.py:229        {errors:[{indicator_code,message}]}
//   400 mã lặp / sai luật giá trị           services/reports.py:427,465     {errors:[{indicator_code,message}]}
// CHÚ Ý: lỗi sai luật nghiệp vụ (ValidationError) là 400, KHÔNG phải 422 — 422 ở dự án này chỉ
// xảy ra khi payload sai schema Pydantic (lỗi lập trình FE), không phải khi sai luật nghiệp vụ.
import { useSession } from '../app/session'

export interface ApiErrorItem {
  indicator_code: string
  message: string
}

/** Mọi field ngoài status/detail là optional: form ở nơi gọi tự đọc field mình cần, field lạ
 * (endpoint khác không gửi) cứ để `undefined`, không phải lỗi. */
export class ApiError extends Error {
  status: number
  detail: string
  errors?: ApiErrorItem[]
  state?: string
  version?: number
  values?: unknown
  existing_id?: number

  constructor(status: number, body: Record<string, unknown>) {
    const detail = typeof body.detail === 'string' ? body.detail : 'Có lỗi xảy ra'
    super(detail)
    this.status = status
    this.detail = detail
    this.errors = body.errors as ApiErrorItem[] | undefined
    this.state = body.state as string | undefined
    this.version = body.version as number | undefined
    this.values = body.values
    this.existing_id = body.existing_id as number | undefined
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

// Endpoint tự xử lý 401 của chính nó (form đăng nhập hiện lỗi tại chỗ, không văng người dùng
// đi đâu cả) — đối chiếu theo ĐƯỜNG DẪN REQUEST (path truyền vào api.get/post/put), không phải
// `location.pathname`: hai thứ là hai khái niệm khác nhau, request có thể được gọi ra từ bất kỳ
// trang nào chứ không riêng gì lúc đang đứng ở /login.
const BO_QUA_401 = ['/auth/login']

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useSession.getState().token
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  // Thứ tự bắt buộc: xoá token TRƯỚC rồi mới điều hướng. Điều hướng gọi location.assign — ở
  // production đó là chuyển trang thật (unmount toàn bộ state hiện tại); nếu lỡ điều hướng rồi
  // mới xoá token thì có khung hình (hoặc route SPA nào bắt kịp trước khi trang thật đổi) nhìn
  // thấy token cũ còn tồn tại dù đã biết phiên hết hạn.
  if (res.status === 401 && !BO_QUA_401.some((p) => path.startsWith(p))) {
    useSession.getState().logout()
    location.assign(`/login?next=${encodeURIComponent(location.pathname)}`)
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.json())
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
}
