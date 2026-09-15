// frontend/src/api/client.ts
//
// Một chỗ duy nhất gọi fetch tới backend + bắt lỗi thống nhất. Thân lỗi backend LUÔN phẳng
// {"detail": <chuỗi>, **extra} (AppError.body(), backend/app/core/errors.py) — không có JSON
// lồng nào để đào sâu hơn một cấp. Các `extra` khác nhau tuỳ nơi ném (đối chiếu tại đúng dòng,
// bản CHUẨN — quét bằng AST, đủ 8 điểm — xem hop-dong-loi-backend.md; task-17-carry.md phần C1
// đã LỖI THỜI, tự nhận thiếu 2 ca vì quét bằng grep theo dòng):
//   409 khoá lạc quan (chuyển trạng thái)  services/workflow.py:198,218    {state, version}
//   409 khoá lạc quan (PUT .../values)     services/reports.py:438-442     {state, version, values}
//   409 báo cáo đã tồn tại                 api/reports.py:94               {existing_id}
//   400 thiếu ô bắt buộc lúc chuyển trạng   services/workflow.py:229        {errors:[{indicator_code,message}]}
//   400 mã lặp / sai luật giá trị           services/reports.py:451,489     {errors:[{indicator_code,message}]}
//   400 trường chữ nhóm C (Task 23b)       services/reports.py:515         {errors:[{field_code,message}]}
// HAI hình dạng `errors` khác nhau: bốn điểm dùng khoá `indicator_code`, MỘT điểm (ba ô chữ
// nhóm C) dùng `field_code` — C1..C3 không phải mã chỉ tiêu. Task 24 nới `ApiErrorItem` cho cả
// hai (cả hai đều optional, mỗi điểm ném chỉ gửi MỘT trong hai) vì từ Task 24 lỗi đã có chỗ hiện:
// banner "Không lưu được" và banner "Không chuyển trạng thái được" của form đều liệt từng dòng.
// CHÚ Ý: lỗi sai luật nghiệp vụ (ValidationError) là 400, KHÔNG phải 422 — 422 ở dự án này chỉ
// xảy ra khi payload sai schema Pydantic (lỗi lập trình FE), không phải khi sai luật nghiệp vụ.
// 409 có HAI nghĩa khác hẳn nhau (xung đột phiên bản cần nạp lại `values`/`version`, hay thao
// tác không hợp lệ ở trạng thái hiện tại — chỉ hiện `detail`), phân biệt bằng `detail`, KHÔNG
// phải bằng mã: đừng rẽ nhánh theo `detail`, hiển thị nguyên văn cho cả hai trường hợp.
import { useSession } from '../app/session'

export interface ApiErrorItem {
  /** Mã chỉ tiêu — bốn trong năm điểm ném 400 dùng khoá này. */
  indicator_code?: string
  /** Mã ô chữ nhóm C (`services/reports.py:515`) — C1..C3 không phải mã chỉ tiêu, nên chúng đi
   * bằng khoá RIÊNG chứ không mượn `indicator_code`. */
  field_code?: string
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

// task-28-scope.md mục 2: nguồn DUY NHẤT của origin API — Login.tsx (gọi /health trần, không qua
// `api`) import lại BASE từ đây thay vì tự tính, để không còn hai chỗ có thể lệch nhau.
//
// Ranh giới ĐÚNG không phải "đây có phải bản build production hay không" — mà là "có backend cùng
// origin hay không" (proxy `/api/v1` → localhost:8000 khai ở vite.config.ts, cả `server.proxy` lẫn
// `preview.proxy`). Vòng sửa 1: bản đầu chỉ xét `import.meta.env.PROD` và ĐÃ SAI, vì `vite preview`
// phục vụ CHÍNH bản build production đã build sẵn (không build lại) — `PROD` là `true` y hệt bundle
// sẽ lên Vercel. Vite nội tuyến cả `VITE_API_BASE` (undefined) lẫn `PROD` (true) lúc `vite build`,
// trình tối ưu gập luôn `if` chết, xoá hẳn nhánh `/api/v1` — bundle phục vụ bởi `npm run preview`
// (dùng bởi webServer của Playwright) ném VÔ ĐIỀU KIỆN, sập trắng trước khi React kịp render. Bằng
// chứng đo được: 20/28 ca e2e hỏng, đúng bằng số ca cần trang render (8 ca sống sót là logic thuần,
// không cần trang hiện lên).
//
// Vì vậy chặn thêm điều kiện hostname: CHỈ ném khi PROD **và** origin hiện tại KHÔNG phải máy cục
// bộ (không có ai đứng ra làm proxy). `npm run dev`/`npm run preview` đều chạy ở localhost —
// hostname cục bộ, có proxy, an toàn rơi về '/api/v1'. Vercel chạy ở domain thật — không có proxy,
// phải hỏng ồn ào. Không import `laCucBo` từ `e2e/moi-truong.ts` dù cùng ý tưởng: hai gói tách biệt
// hoàn toàn về runtime (kia là Node đọc `new URL(...).hostname`, đây là trình duyệt đọc
// `location.hostname`), và gói `frontend/` không có lý do phụ thuộc ngược vào gói `e2e/`.
//
// Vì sao vẫn phải hỏng ồn ào ở production thật (không phải preview): trên Vercel
// (frontend/vercel.json rewrite mọi path về index.html), đường dẫn tương đối '/api/v1' đâm vào
// chính origin Vercel — không có backend ở đó — và SPA fallback trả 200 kèm THÂN HTML thay vì 404.
// `res.ok` ở dưới thấy đúng, nhảy xuống `res.json()`, và JSON.parse một tài liệu HTML ném
// SyntaxError TRẦN chứ không phải ApiError — mọi nơi bắt `instanceof ApiError` đều trượt.
function laHostnameCucBo(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return true
  }
  // `*.localhost` được RFC 6761 dành riêng cho loopback, trình duyệt phân giải thẳng về 127.0.0.1.
  return hostname.endsWith('.localhost')
}

function baseApi(): string {
  const v = import.meta.env.VITE_API_BASE as string | undefined
  if (v) return v
  if (import.meta.env.PROD && !laHostnameCucBo(location.hostname)) {
    throw new Error(
      'Thiếu biến môi trường VITE_API_BASE — bắt buộc phải đặt (bảng điều khiển Vercel) trước khi ' +
        'build production, nếu không mọi lời gọi API sẽ âm thầm rơi về chính origin frontend.',
    )
  }
  return '/api/v1'
}

export const BASE = baseApi()

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
    // pathname + search (không chỉ pathname): route lọc theo query string (vd. /status?period=…)
    // mất hết bộ lọc nếu next= không giữ query — cùng quy ước với RequireAuth (app/router.tsx).
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
  }

  if (!res.ok) {
    // Render free tier ngủ rồi thức dậy rất dễ trả 502/503 với thân HTML (gateway), không phải
    // JSON — res.json() lúc đó tự ném SyntaxError trần, làm mất luôn instanceof ApiError ở nơi
    // gọi. Không parse được thì coi như thân rỗng: constructor đã tự rơi về câu tiếng Việt mặc
    // định ('Có lỗi xảy ra') khi thiếu `detail`, status vẫn là status thật từ response.
    const than = await res.json().catch(() => ({}))
    throw new ApiError(res.status, than)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
}
