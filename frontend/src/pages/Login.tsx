// frontend/src/pages/Login.tsx
//
// C4 (task-19-carry.md): component này KHÔNG được dùng hook nào của react-router — cả 5 test
// brief render <Login/> trần, không bọc <MemoryRouter>. Điều hướng bằng location.assign, đọc
// query bằng new URLSearchParams(location.search).
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
import { api, ApiError } from '../api/client'
import { useSession, type SessionOrgUnit, type SessionUser } from '../app/session'
import { Wordmark } from '../components/ui/Wordmark'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'
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

// C5: '?next=' là dữ liệu người lạ điều khiển được — chỉ chấp nhận đường dẫn bắt đầu bằng ĐÚNG
// một '/' (ký tự thứ hai không phải '/', vì '//evil.example' là URL tuyệt đối theo giao thức
// hiện tại). Mọi giá trị khác (URL tuyệt đối như 'https://evil.example', hoặc rỗng) coi như
// không có next.
function laDuongDanAnToan(duongDan: string): boolean {
  return duongDan.startsWith('/') && duongDan[1] !== '/'
}

// Mã vai trò đúng là chuỗi 'reporter' (backend/app/seed/__init__.py). roles chỉ đọc tại chỗ để
// quyết định landing, KHÔNG đưa vào store (session.ts cố ý không giữ roles).
function dieuHuongSauDangNhap(roles: string[]): void {
  const next = new URLSearchParams(location.search).get('next')
  if (next !== null && laDuongDanAnToan(next)) {
    location.assign(next)
    return
  }
  location.assign(roles.includes('reporter') ? '/reports' : '/dashboard')
}

export function Login() {
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
      dieuHuongSauDangNhap(roles)
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
            <p className="text-[13px] mt-2.5 text-sec">Đang đánh thức máy chủ… (tối đa 1 phút)</p>
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
