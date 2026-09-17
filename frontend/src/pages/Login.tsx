// frontend/src/pages/Login.tsx
//
// S1a (vòng sửa 1, task-20-fix-1.md): điều hướng NỘI BỘ dùng `useNavigate()` — route đích đã
// đăng ký trong app/routes.tsx nên hook dùng được ở đây (khác carry C4/task-19 cũ, dùng
// `location.assign` chỉ để giữ test render <Login/> trần không bọc router). Đó chính là nguyên
// nhân che giấu S1: `location.assign` là điều hướng TÀI LIỆU ĐẦY ĐỦ, tải lại toàn bộ trang xoá
// sạch store phiên thuần bộ nhớ — đăng nhập xong bị RequireAuth đá ngược về /login. Test giờ bọc
// lại <MemoryRouter> cho khớp cây thật thay vì bẻ mã sản phẩm cho vừa test.
//
// Đọc `next=` vẫn qua `location.search` THÔ (KHÔNG đổi sang `useLocation()`) — quy ước dùng
// chung với client.ts (401) và router.tsx (RequireAuth), cả hai đọc trực tiếp
// `location.pathname`/`location.search` của trình duyệt, không qua state của router.
//
// C2: cú gọi GET /health dùng fetch TRẦN, không qua `api` (frontend/src/api/client.ts) — hai lý
// do: (1) cần AbortController timeout riêng (90s) mà `api` không có; (2) '/health' không nằm
// trong BO_QUA_401 của client.ts, nên nếu backend/máy giả trả 401 cho MỌI request (ca test 401
// bên dưới), đi qua `api` sẽ tự logout()+điều hướng ngay lúc mount, sai trước khi người dùng kịp
// bấm nút.
//
// C1: đăng nhập là HAI lời gọi HTTP nối tiếp — POST /auth/login chỉ trả access_token, thông tin
// phiên (user, roles, permissions, org_unit) nằm ở GET /auth/me. Phải gắn token vào store TRƯỚC
// khi gọi /auth/me (api.get đọc token từ store để gắn header Authorization).
import { Check, Loader2, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { api, ApiError, BASE, noiLaJson } from '../api/client'
import { useSession, type SessionOrgUnit, type SessionUser } from '../app/session'
import { Wordmark } from '../components/ui/Wordmark'

const O_NHAP =
  'block h-10 w-full rounded-md border border-border bg-card px-3 text-foreground focus:outline-2 focus:outline-ring focus:-outline-offset-2'
/** Khe thông báo dưới nút — cùng hình dạng cho cả ba trạng thái, chỉ khác màu và icon. */
const KHE_BAO = 'mt-3 flex items-start gap-2 rounded-md border px-3 py-2.5 text-[13px]'

const TIMEOUT_HEALTH_MS = 90_000
const CHAM_HIEN_DANH_THUC_MS = 3_000 // sau 3s /health chưa xong thì hiện dòng đánh thức
const CACH_THU_LAI_MS = 5_000 // khoảng cách giữa các lần thử lại khi /health lỗi mạng
const SO_LAN_THU_LAI_HEALTH = 2 // 2 lần thử lại (tổng 3 lần gọi) trước khi báo mất kết nối

interface MeResponse {
  user: SessionUser
  roles: string[]
  permissions: string[]
  org_unit: SessionOrgUnit
}

function cho(ms: number): Promise<void> {
  return new Promise((giaiQuyet) => setTimeout(giaiQuyet, ms))
}

// Trả true nếu server THẬT có phản hồi (bất kể mã trạng thái — /health chỉ cần "đánh thức" Render,
// không cần đăng nhập nên không quan tâm 200/401/503 — kể cả 503/502 kèm THÂN HTML của gateway lúc
// cold-start vẫn tính là "đã có phản hồi"), false nếu fetch tự ném (mất mạng, hoặc AbortController
// huỷ sau TIMEOUT_HEALTH_MS).
//
// task-28-fix-2.md P1: NGOẠI LỆ duy nhất là res.ok (200) nhưng thân KHÔNG phải JSON — đó không
// phải "server đã thức", mà là SPA fallback (vercel.json) trả index.html cho mọi path vì BASE
// đang trỏ nhầm về chính origin frontend (client.ts: docJsonHopLe() bắt cùng triệu chứng này ở
// nhánh gọi API thật). Trước P1 hàm này trả `true` vô điều kiện cho MỌI phản hồi — cùng lỗ hổng
// A3 mà Login.test.tsx từng bỏ sót: người dùng thấy "đã kết nối" trong khi BASE sai, rồi mới vỡ
// lúc bấm đăng nhập thật.
async function thuGoiHealth(): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_HEALTH_MS)
  try {
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal })
    // task-28-fix-6.md: phép so content-type dùng CHUNG vị từ `noiLaJson` với client.ts, không còn
    // bản chép riêng ở đây — trước vòng này hai bản chép đã lệch nhau thật (bản kia có
    // `.toLowerCase()`, bản này không), nên một `Application/JSON` hợp lệ làm hàm này trả false và
    // màn đăng nhập báo mất kết nối trên một máy chủ lành. `res.ok` thì GIỮ RIÊNG ở đây: đó là
    // phần khác nhau giữa hai nơi gọi, và là chỗ hợp đồng "502/503 vẫn tính là đã thức" nằm.
    const loaiNoiDung = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : null
    if (res.ok && !noiLaJson(loaiNoiDung)) {
      return false
    }
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// C1: chuỗi gọi API "đã chốt" — set token vào store trước để api.get('/auth/me') gắn được header
// Authorization; /auth/me lỗi thì logout() rồi ném lại, KHÔNG để store kẹt ở trạng thái nửa vời
// (có token nhưng không có user).
async function dangNhap(email: string, matKhau: string): Promise<string[]> {
  const { access_token } = await api.post<{ access_token: string }>('/auth/login', {
    email,
    password: matKhau,
  })
  useSession.setState({ token: access_token })
  try {
    const me = await api.get<MeResponse>('/auth/me')
    useSession.getState().login(access_token, me.user, me.org_unit, me.permissions)
    return me.roles
  } catch (loi) {
    useSession.getState().logout()
    throw loi
  }
}

// F1 (task-19-fix-brief.md) — vòng sửa 1: bản trước (`d.startsWith('/') && d[1] !== '/'`) đoán
// ký tự xấu, và đoán thiếu — '/\\evil.example', '/\\/evil.example', '/\t/evil.example' đều qua
// được bộ lọc cũ nhưng bộ phân tích URL thật (WHATWG — chính thứ `location.assign` dùng) lại quy
// chúng về 'https://evil.example/' (trong scheme http/https, '\' tương đương '/'; TAB/CR/LF bị
// xoá trước khi phân tích). Sửa đúng: hỏi CHÍNH bộ phân tích đó thay vì liệt thêm ký tự.
//
// Base giả cố định, KHÔNG đọc `location.origin`: test stub `location` bằng object trần (không có
// `origin`), và hành vi phân tích của `new URL` giống hệt nhau với mọi origin hợp lệ.
const GOC_AO = 'http://x.invalid'

// F3 (task-19-fix-brief-2.md) — vòng sửa 2: F1 hỏi bộ phân tích cho ĐẦU VÀO (`duongDan`) nhưng
// quên hỏi lại cho chính chuỗi TRẢ RA (`ra`) — 'next=//x.invalid//evil.example' có origin đúng
// GOC_AO ở lần phân tích đầu (host khớp), nhưng `ra` trích ra ('//evil.example') lại tự nó là một
// tham chiếu tương đối theo giao thức — location.assign sẽ phân tích `ra` thêm đúng một lần nữa,
// và lần đó mới quy ra 'https://evil.example/'.
//
// `ra` phải là ĐIỂM BẤT ĐỘNG thật: phân tích lại nó phải cho ra CHÍNH XÁC lại `ra` — không chỉ
// "cùng origin". Hai điều đó KHÁC NHAU: 'next=/.//x.invalid' cho `ra = '//x.invalid'`; phân tích
// lại '//x.invalid' với GOC_AO vẫn ra origin GOC_AO (vì host trùng NGẪU NHIÊN với host của chính
// GOC_AO) nhưng lại ra pathname '/' — KHÁC `ra`. Không hằng số nội bộ nào (dù đổi tên) tránh được
// kiểu tự-trùng này, vì mọi hằng số đều lộ trong bundle đã build và tấn công luôn dựng lại được
// đúng pathname đó qua chuẩn hoá đoạn '.'. Đây KHÔNG phải kiểm ký tự — không đoán '//' hay bất kỳ
// ký tự nào, chỉ hỏi lại bộ phân tích và so sánh CHUỖI nó trả về. Đã đo vét cạn theo bảng token
// của ca tính chất (Login.test.tsx): 0/66429 lọt ở độ sâu 4 token (brief chỉ đòi độ sâu 3).
//
// Export CHỈ để ca tính chất ở Login.test.tsx gọi trực tiếp (không đi vòng qua submit form) — lý
// do chính đáng duy nhất để export hàm nội bộ này.
export function duongDanNoiBo(duongDan: string): string | null {
  try {
    const u = new URL(duongDan, GOC_AO)
    if (u.origin !== GOC_AO) return null
    const ra = u.pathname + u.search + u.hash
    const laiLan2 = new URL(ra, GOC_AO)
    if (laiLan2.origin !== GOC_AO) return null
    if (laiLan2.pathname + laiLan2.search + laiLan2.hash !== ra) return null
    return ra
  } catch {
    return null
  }
}

// Mã vai trò đúng là chuỗi 'reporter' (backend/app/seed/__init__.py). roles chỉ đọc tại chỗ để
// quyết định landing, KHÔNG đưa vào store (session.ts cố ý không giữ roles). `navigate` truyền
// vào từ component (useNavigate() là hook, không gọi được ở một hàm đứng ngoài) — { replace:
// true }: trang đăng nhập không được nằm lại trong lịch sử, bấm Back sau khi vào app không được
// quay lại form đăng nhập đã nộp xong (cùng hành vi trước đây location.assign vốn có, vì tài liệu
// cũ /login cũng biến mất khỏi lịch sử duyệt sau một lần điều hướng tài liệu đầy đủ).
function dieuHuongSauDangNhap(navigate: NavigateFunction, roles: string[]): void {
  const next = new URLSearchParams(location.search).get('next')
  const noiBo = next === null ? null : duongDanNoiBo(next)
  if (noiBo !== null) {
    // Điều hướng tới chuỗi ĐÃ CHUẨN HOÁ (noiBo), không phải `next` thô — giữ đúng nguyên tắc cũ
    // dù navigate() của react-router không tự phân tích lại thành URL tuyệt đối như
    // location.assign: không tạo thêm một nguồn sự thật thứ hai cho "đích điều hướng an toàn".
    navigate(noiBo, { replace: true })
    return
  }
  navigate(roles.includes('reporter') ? '/reports' : '/dashboard', { replace: true })
}

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [matKhau, setMatKhau] = useState('')
  const [dangGui, setDangGui] = useState(false)
  const [loiDangNhap, setLoiDangNhap] = useState<string | null>(null)

  const [dangDanhThuc, setDangDanhThuc] = useState(false)
  const [loiKetNoi, setLoiKetNoi] = useState(false)
  const [lanThuLaiHealth, setLanThuLaiHealth] = useState(0)

  // Đánh thức Render lúc mở trang. Bộ đếm 3s hiện dòng "đang đánh thức" chạy SONG SONG với lời
  // gọi /health (không phải nối tiếp sau khi await) — /health có thể treo rất lâu (cold start),
  // bộ đếm phải tự chạy độc lập để còn kịp hiện dòng chữ trong lúc đó.
  useEffect(() => {
    let huy = false
    // (KHÔNG setLoiKetNoi(false) đồng bộ ở đây — oxlint react/set-state-in-effect: cascading
    // render không cần thiết. Mount lần đầu state đã sẵn false; lúc bấm lại "Thử lại" nút tự reset
    // trước khi tăng lanThuLaiHealth, đúng gợi ý "update it from the event that caused the change".)
    // flushSync: cả callback này lẫn phần cuối chay() chạy từ một continuation NGOÀI vòng render
    // gốc (timer callback / sau await) — không flushSync, React 19 xếp lịch cập nhật qua
    // MessageChannel (macrotask thật), thứ mà vi.advanceTimersByTimeAsync (chỉ tua timer giả +
    // microtask) không đợi tới, nên DOM không kịp đổi trước dòng expect ngay sau đó (ca test 2).
    const hienDanhThuc = setTimeout(() => {
      if (!huy) flushSync(() => setDangDanhThuc(true))
    }, CHAM_HIEN_DANH_THUC_MS)

    async function chay() {
      let thanhCong = false
      for (let lan = 0; lan <= SO_LAN_THU_LAI_HEALTH; lan++) {
        thanhCong = await thuGoiHealth()
        if (huy) return
        if (thanhCong) break
        if (lan < SO_LAN_THU_LAI_HEALTH) await cho(CACH_THU_LAI_MS)
      }
      if (huy) return
      clearTimeout(hienDanhThuc)
      flushSync(() => {
        setDangDanhThuc(false)
        setLoiKetNoi(!thanhCong)
      })
    }
    chay()

    return () => {
      huy = true
      clearTimeout(hienDanhThuc)
    }
  }, [lanThuLaiHealth])

  async function xuLySubmit(e: FormEvent) {
    e.preventDefault()
    setDangGui(true)
    setLoiDangNhap(null)
    try {
      const roles = await dangNhap(email, matKhau)
      dieuHuongSauDangNhap(navigate, roles)
    } catch (err) {
      setDangGui(false)
      setLoiDangNhap(err instanceof ApiError ? err.detail : 'Không kết nối được máy chủ')
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Nửa trái nền tối (mockup `Redesign shadcn.dc.html` mục 01). Ẩn dưới `lg`: dưới bề rộng
          đó nó chỉ còn là một dải trang trí đẩy form xuống dưới nếp gấp.

          Mockup có một bộ đếm "giờ công an toàn" lớn ở đây. KHÔNG dựng: trước khi đăng nhập,
          trang này không có quyền đọc bất kỳ số liệu nào — chỉ `/health` là gọi được, và nó chỉ
          trả trạng thái máy chủ. Một con số bịa ở màn đầu tiên của một hệ thống AN TOÀN là thứ
          tệ nhất có thể đặt ở đây. Muốn có nó thì phải thêm một endpoint công khai. */}
      <aside className="relative hidden flex-col justify-between bg-dark-panel p-10 text-white lg:flex">
        <img src="/ptsc-wordmark-white.png" alt="PTSC" className="h-8 w-auto self-start" />
        <div className="max-w-[420px]">
          <h1 className="text-[32px] font-medium leading-[1.15] tracking-[-0.6px]">
            Hệ thống báo cáo SKATMT
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-on-dark">
            An toàn · Sức khoẻ · Môi trường · Chất lượng. Biểu mẫu FM01, nộp theo kỳ tháng, tổng hợp
            toàn Tổng công ty.
          </p>
          <ul className="mt-6 grid gap-2.5 text-sm text-on-dark">
            {['53 chỉ tiêu trên một trang, cuộn liền', 'Lũy kế tự cộng theo kỳ đã duyệt', 'Đơn vị nộp — Ban ATCL duyệt'].map(
              (y) => (
                <li key={y} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0" />
                  {y}
                </li>
              ),
            )}
          </ul>
        </div>
        <p className="text-xs text-on-dark">
          Tổng công ty CP Dịch vụ Kỹ thuật Dầu khí Việt Nam
        </p>
      </aside>

      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[360px]">
          {/* Chỉ hiện khi nửa trái bị ẩn — không để màn hẹp mất sạch dấu hiệu đây là hệ của ai. */}
          <div className="mb-6 lg:hidden">
            <Wordmark />
          </div>
          <h2 className="text-[22px] font-medium leading-[1.2] tracking-[-0.3px] text-foreground">
            Đăng nhập HSEQ
          </h2>
          <p className="mt-1 mb-6 text-[13px] text-muted-foreground">
            Dùng tài khoản nội bộ do Ban An toàn Chất lượng cấp.
          </p>
          <form onSubmit={xuLySubmit}>
            <div className="mb-3.5">
              <label htmlFor="dn-email" className="mb-1 block text-[12px] font-medium text-secondary-foreground">
                Email
              </label>
              <input
                id="dn-email"
                type="email"
                autoFocus
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={O_NHAP}
              />
            </div>
            <div className="mb-3.5">
              <label htmlFor="dn-mat-khau" className="mb-1 block text-[12px] font-medium text-secondary-foreground">
                Mật khẩu
              </label>
              <input
                id="dn-mat-khau"
                type="password"
                autoComplete="current-password"
                required
                value={matKhau}
                onChange={(e) => setMatKhau(e.target.value)}
                className={O_NHAP}
              />
            </div>
            <button
              type="submit"
              disabled={dangGui}
              className="mt-1.5 h-10 w-full rounded-md border border-primary bg-primary text-[13px] font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>

            {/* Ba trạng thái của cùng MỘT khe thông báo dưới nút — hộp có viền, không còn là dòng
                chữ trần: chúng nói về máy chủ chứ không phải về ô vừa gõ, và ở màn đầu tiên của
                buổi demo (Render ngủ dậy) đây là thứ người trình bày phải đọc được từ xa. */}
            {dangDanhThuc && (
              <p className={`${KHE_BAO} border-border bg-muted text-secondary-foreground`}>
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                Đang đánh thức máy chủ… (thường mất dưới 1 phút)
              </p>
            )}
            {loiKetNoi && (
              <p className={`${KHE_BAO} border-destructive/30 bg-destructive-bg text-destructive`}>
                <WifiOff className="mt-0.5 size-4 shrink-0" />
                <span>
                  Không kết nối được máy chủ ·{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLoiKetNoi(false)
                      setLanThuLaiHealth((n) => n + 1)
                    }}
                    className="cursor-pointer border-0 bg-transparent p-0 font-medium text-destructive underline"
                  >
                    Thử lại
                  </button>
                </span>
              </p>
            )}
            {loiDangNhap && (
              <p className={`${KHE_BAO} border-destructive/30 bg-destructive-bg text-destructive`}>
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {loiDangNhap}
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
