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
// task-28-fix-2.md P1 — vòng sửa 1 rồi vòng sửa 2 đã đi qua BA miếng vá liên tiếp trên CÙNG một
// câu hỏi sai ("tôi đang đứng ở đâu?"): (1) chỉ xét `import.meta.env.PROD` — sập ở `vite preview`
// vì preview CŨNG phục vụ chính bundle production; (2) thêm danh sách hostname cục bộ — sập ở
// `vite preview --host` qua IP LAN (192.168.x.x), dù CHÍNH origin đó đang proxy `/api/v1` y hệt
// localhost; cửa thứ ba đã nhìn thấy trước khi vá: tên mDNS (`http://may-cua-toi.local:5173`, cách
// rất thường để mở web từ điện thoại) không nằm trong dải IP nào cả, và dù có nới danh sách cũng
// không kiểm được TÍNH ĐÚNG — đặt `VITE_API_BASE=/api/v1` (chính giá trị mặc định, nhưng sai vì
// Render không cùng origin với Vercel) lọt qua mọi danh sách vì guard chỉ hỏi "có đặt biến không",
// không hỏi "biến đó có trỏ đúng chỗ không" (B4).
//
// Danh sách hostname về nguyên tắc không đóng được lớp này vì nó hỏi sai câu. Câu hỏi ĐÚNG không
// phải "tôi đang đứng ở đâu?" (không danh sách nào trả lời đúng cho MỌI hostname tương lai) mà là
// "tôi vừa xin JSON của API và nhận về cái gì?" (đóng CẢ BA cửa trên cùng lúc, không cần biết
// trước hostname sẽ là gì): `vite dev`/`preview` — mọi hostname, kể cả IP LAN hay `.local` — đều có
// proxy `/api/v1` → backend cục bộ (vite.config.ts) nên luôn nhận JSON thật; Vercel thiếu biến
// (hoặc đặt sai hình dạng) khiến đường dẫn tương đối đâm vào SPA fallback (vercel.json rewrite mọi
// path về index.html) — 200 kèm THÂN HTML, bắt được ngay bởi `docJsonHopLe()` bên dưới, KHÔNG cần
// biết hostname là gì.
//
// BASE không còn ném lúc TẢI MODULE — không còn gì để đoán trước lúc đó. Lỗi giờ nổ lúc REQUEST
// THẬT (docJsonHopLe), đúng chỗ có đủ thông tin để biết chắc; trang vẫn dựng được (React vẫn
// render) nên thông báo có CHỮ HIỆN RA thay vì màn trắng trước khi kịp vẽ gì (Ruling 405: màn
// trắng vẫn hợp lệ nếu thiết kế chọn thế, nhưng thiết kế ở đây chọn hiện chữ).
function baseApi(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined) || '/api/v1'
}

export const BASE = baseApi()

/** Ném lỗi nói rõ tên biến khi response `res.ok` nhưng KHÔNG phải JSON — dấu hiệu BASE đang trỏ
 *  nhầm về chính origin frontend (SPA fallback trả 200 kèm HTML cho mọi đường dẫn) thay vì backend
 *  thật. Chỉ ném NGAY khi có tín hiệu DƯƠNG TÍNH rõ ràng (Content-Type khai hẳn một loại khác
 *  JSON, đủ để bắt SPA fallback — trình duyệt thật LUÔN có header này); Content-Type vắng/không
 *  đọc được (mock test trần không set `headers`, hoặc server thật không khai) thì rơi xuống
 *  `res.json()` — SyntaxError của chính nó là lưới an toàn thứ hai cho trường hợp đó.
 *
 *  task-28-fix-5.md P1: so trên bản `toLowerCase()` vì media type trong HTTP KHÔNG phân biệt
 *  hoa/thường (RFC 9110 §8.3.1) và `Headers.get()` trả NGUYÊN VĂN giá trị server gửi — chỉ TÊN
 *  header mới được chuẩn hoá. So trên chuỗi thô là đọc sai giao thức: `Application/JSON` (header
 *  hoàn toàn hợp lệ) bị coi là "không phải JSON" và câu lỗi đi buộc tội `VITE_API_BASE` trên một
 *  bản deploy LÀNH — cùng họ "thông báo chỉ tay sai chỗ" với bẫy `charset=utf-8`, chỉ khác lối vào.
 *  THÔNG BÁO vẫn in `loaiNoiDung` THÔ (không phải bản đã hạ chữ): người đọc cần thấy đúng thứ
 *  server gửi, không phải bản đã bị mã này chế biến.
 *
 *  task-28-fix-3.md P1: ném `ApiError` (không phải `Error` trần) — `Login.tsx:212`
 *  (`err instanceof ApiError ? err.detail : 'Không kết nối được máy chủ'`) chỉ hiện `detail` cho
 *  `ApiError`; một `Error` trần rơi vào nhánh câu chung, làm mất đúng câu nói tên biến ngay tại nơi
 *  người dùng nhìn thấy — "hỏng ồn ào" mà không ai đọc được thì cũng như câm, chỉ khác lớp áo. Đã
 *  grep cả 12 chỗ `instanceof ApiError` trong `src/` (không tính comment) để xác nhận không tác
 *  dụng phụ: hai chỗ hiện `detail` (đúng thứ muốn); bốn chỗ lọc theo `status` (401/403/404) —
 *  response ở đây luôn 2xx nên không khớp nhánh nào, hành vi y hệt trước (khi còn là `Error` trần,
 *  `instanceof` đã sai ngay từ đầu — cùng kết quả "bỏ qua nhánh"); hai hook
 *  `useChuyenTrangThai`/`useSaveValues` và `queryClient` (retry 4xx) đổi hành vi kỹ thuật nhưng
 *  KHÔNG chạm được trong kịch bản BASE sai (build hỏng khiến mọi request đều hỏng như nhau, người
 *  dùng kẹt ở màn đăng nhập, không bao giờ tới các trang dùng ba chỗ đó — Reports/ReportDetail). */
async function docJsonHopLe<T>(res: Response): Promise<T> {
  const loaiNoiDung = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : null
  if (loaiNoiDung && !loaiNoiDung.toLowerCase().includes('application/json')) {
    throw new ApiError(res.status, {
      detail:
        `API trả về "${loaiNoiDung}" thay vì JSON — kiểm tra biến môi trường VITE_API_BASE (hiện ` +
        `là "${BASE}"), rất có thể đang trỏ nhầm về chính origin frontend thay vì backend thật ` +
        '(SPA fallback trả trang HTML cho mọi đường dẫn).',
    })
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(res.status, {
      detail:
        'API không trả về JSON hợp lệ — kiểm tra biến môi trường VITE_API_BASE ' +
        `(hiện là "${BASE}"), rất có thể đang trỏ nhầm về chính origin frontend thay vì backend thật.`,
    })
  }
}

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

  return docJsonHopLe<T>(res)
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
}
