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
import { useEffect, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { api, ApiError, BASE } from '../api/client'
import { useSession, type SessionOrgUnit, type SessionUser } from '../app/session'
import { Wordmark } from '../components/ui/Wordmark'

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

// Trả true nếu server có phản hồi (bất kể mã trạng thái — /health chỉ cần "đánh thức" Render,
// không cần đăng nhập nên không quan tâm 200/401/503), false nếu fetch tự ném (mất mạng, hoặc
// AbortController huỷ sau TIMEOUT_HEALTH_MS).
async function thuGoiHealth(): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_HEALTH_MS)
  try {
    await fetch(`${BASE}/health`, { signal: ctrl.signal })
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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-[360px]">
        <div className="mb-5">
          <Wordmark />
        </div>
        <h2 className="text-[20px] font-medium text-ink mb-5">Đăng nhập HSEQ</h2>
        <form onSubmit={xuLySubmit}>
          <div className="mb-3.5">
            <label htmlFor="dn-email" className="block text-[12px] font-medium text-soot mb-1">
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
              className="block w-full h-9 border border-hair rounded-input px-2.5 bg-surface text-ink"
            />
          </div>
          <div className="mb-3.5">
            <label htmlFor="dn-mat-khau" className="block text-[12px] font-medium text-soot mb-1">
              Mật khẩu
            </label>
            <input
              id="dn-mat-khau"
              type="password"
              autoComplete="current-password"
              required
              value={matKhau}
              onChange={(e) => setMatKhau(e.target.value)}
              className="block w-full h-9 border border-hair rounded-input px-2.5 bg-surface text-ink"
            />
          </div>
          <button
            type="submit"
            disabled={dangGui}
            className="w-full h-9 mt-1.5 rounded-input bg-cyan border border-cyanEdge text-white text-[13px] font-medium disabled:opacity-50"
          >
            {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          {dangDanhThuc && (
            <p className="text-[13px] mt-2.5 text-sec">Đang đánh thức máy chủ… (thường mất dưới 1 phút)</p>
          )}
          {loiKetNoi && (
            <p className="text-[13px] mt-2.5 text-danger">
              Không kết nối được máy chủ ·{' '}
              <button
                type="button"
                onClick={() => {
                  setLoiKetNoi(false)
                  setLanThuLaiHealth((n) => n + 1)
                }}
                className="underline font-medium bg-transparent border-0 p-0 cursor-pointer text-danger"
              >
                Thử lại
              </button>
            </p>
          )}
          {loiDangNhap && <p className="text-[13px] mt-2.5 text-danger">{loiDangNhap}</p>}
        </form>
      </div>
    </div>
  )
}
