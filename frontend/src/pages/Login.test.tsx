// frontend/src/pages/Login.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Login } from './Login'
import { useSession } from '../app/session'

describe('/login', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('mở trang là gọi /health để đánh thức Render', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
    vi.stubGlobal('fetch', f)
    render(<Login />)
    await waitFor(() => expect(f.mock.calls[0][0]).toContain('/health'))
  })

  it('sau 3 giây chưa trả lời thì hiện câu đánh thức máy chủ', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<Login />)
    await vi.advanceTimersByTimeAsync(3100)
    expect(screen.getByText(/Đang đánh thức máy chủ/)).toBeTruthy()
    vi.useRealTimers()
  })

  // Bổ sung ngoài 5 ca của brief (phát hiện lúc chuẩn bị bảng đột biến — bảng đột biến bắt buộc
  // của Task 19 liệt "bỏ AbortController timeout của /health" nhưng không ca nào ở trên thật sự
  // đợi tới 90s để chứng minh nó có tồn tại). fetch giả lắng nghe đúng AbortSignal truyền vào —
  // giống fetch thật khi bị huỷ — nên chỉ xanh nếu thuGoiHealth() gắn signal vào request VÀ có một
  // bộ đếm thật sự gọi ctrl.abort() sau TIMEOUT_HEALTH_MS.
  it('quá 90 giây chưa trả lời thì tự huỷ qua AbortController (tính là một lần lỗi)', async () => {
    vi.useFakeTimers()
    const soLanBiHuy: number[] = [0]
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_giaiQuyet, tuChoi) => {
          init?.signal?.addEventListener('abort', () => {
            soLanBiHuy[0] += 1
            tuChoi(new DOMException('huỷ', 'AbortError'))
          })
        })
      }),
    )
    try {
      render(<Login />)
      await vi.advanceTimersByTimeAsync(90_000)
      expect(soLanBiHuy[0]).toBeGreaterThanOrEqual(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('401 hiện Sai email hoặc mật khẩu tại chỗ, KHÔNG reload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ detail: 'Sai email hoặc mật khẩu' }),
    }))
    const nhay = vi.fn()
    vi.stubGlobal('location', { pathname: '/login', assign: nhay, search: '' } as never)
    render(<Login />)
    await userEvent.type(screen.getByLabelText('Email'), 'u01@ptsc.local')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'sai')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Sai email hoặc mật khẩu')).toBeTruthy()
    expect(nhay).not.toHaveBeenCalled()
  })

  it('không có link quên mật khẩu, không có đăng ký', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
    render(<Login />)
    expect(screen.queryByText(/quên mật khẩu/i)).toBeNull()
    expect(screen.queryByText(/đăng ký/i)).toBeNull()
  })

  it('đang gửi thì nút khoá và đổi chữ', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<Login />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    const nut = screen.getByRole('button', { name: 'Đang đăng nhập…' })
    expect(nut.hasAttribute('disabled')).toBe(true)
  })
})

// Dùng chung cho hai describe bên dưới: dựng đủ chuỗi HAI lời gọi thật của C1 (POST /auth/login
// rồi GET /auth/me) bằng một fetch phân biệt theo URL — KHÔNG stub thẳng useSession.login() hay
// dieuHuongSauDangNhap(), vì hai hàm đó không export: phải đi qua đúng luồng submit thật để chứng
// minh dây nối từ URL/response tới location.assign()/session hoạt động, không phải một thế giới
// giả tự khớp với chính nó.
function fetchDangNhapThanhCong(roles: string[]) {
  return vi.fn((url: string) => {
    if (url.includes('/health')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
    }
    if (url.includes('/auth/login')) {
      return Promise.resolve({
        ok: true, status: 200, json: async () => ({ access_token: 'tok-123', token_type: 'bearer' }),
      })
    }
    if (url.includes('/auth/me')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({
          user: { id: 1, email: 'u01@ptsc.local', full_name: 'Người dùng thử', position: null },
          roles,
          permissions: ['report.edit'],
          org_unit: { id: 2, code: 'U01', name: 'Đơn vị thành viên 01' },
        }),
      })
    }
    throw new Error(`URL không lường trước trong test: ${url}`)
  })
}

async function dangNhapThu() {
  await userEvent.type(screen.getByLabelText('Email'), 'u01@ptsc.local')
  await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Demo@2026')
  await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
}

// C1 (task-19-carry.md) — bổ sung lúc chuẩn bị bảng đột biến: bảng đột biến bắt buộc của Task 19
// liệt "login() truyền thiếu org_unit", nhưng không ca next= nào bên dưới đọc lại session sau khi
// đăng nhập (chỉ đọc đích location.assign) — thiếu org_unit vẫn xanh hết. Ca này đọc thẳng
// useSession.getState() sau khi submit để khoá đúng bốn tham số của login().
describe('/login — session ghi đúng hình dạng sau khi đăng nhập (C1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useSession.getState().logout()
  })

  it('đăng nhập thành công ghi đúng token, user, orgUnit, permissions vào session', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    vi.stubGlobal('location', { pathname: '/login', search: '', assign: vi.fn() } as never)
    render(<Login />)
    await dangNhapThu()
    await waitFor(() => expect(useSession.getState().token).toBe('tok-123'))
    const s = useSession.getState()
    expect(s.user).toEqual({ id: 1, email: 'u01@ptsc.local', full_name: 'Người dùng thử', position: null })
    expect(s.orgUnit).toEqual({ id: 2, code: 'U01', name: 'Đơn vị thành viên 01' })
    expect(s.permissions.has('report.edit')).toBe(true)
  })
})

// F1 (task-19-fix-brief.md, vòng sửa 1) — carry C5 gốc chỉ liệt hai ca ('//evil', 'https://evil')
// và bộ lọc cũ (`d.startsWith('/') && d[1] !== '/'`) qua được cả hai NHƯNG vẫn thủng:
// '/\evil.example', '/\/evil.example', '/\t/evil.example' đều bị bộ phân tích URL thật (WHATWG —
// chính thứ location.assign dùng) quy về 'https://evil.example/' ('\' tương đương '/' trong scheme
// http/https; TAB/CR/LF bị xoá trước khi phân tích) dù bộ lọc cũ cho qua. Bài học: liệt ký tự chỉ
// bắt được ký tự ta nghĩ ra nổi. Test bắt buộc viết dưới dạng BẤT BIẾN, không phải danh sách ca:
// bất kể next= là gì, giá trị truyền vào location.assign khi phân tích lại với một origin BẤT KỲ
// phải vẫn nằm trong chính origin đó — origin thử lại ở đây ('https://hseq.test') CỐ Ý khác
// GOC_AO nội bộ của Login.tsx ('http://x.invalid'), để không vô tình chỉ đối chiếu trùng một hằng
// số dùng chung giữa mã và test.
const HIEM = [
  '//evil.example',
  'https://evil.example',
  '/\\evil.example',
  '/\\/evil.example',
  '/\t/evil.example',
  'javascript:alert(1)',
]

describe('/login — lọc next= (chống open redirect, F1)', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it.each(HIEM)('next=%s: giá trị đưa cho location.assign không thoát khỏi origin', async (gtNext) => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    const nhay = vi.fn()
    vi.stubGlobal('location', {
      pathname: '/login', search: `?next=${encodeURIComponent(gtNext)}`, assign: nhay,
    } as never)
    render(<Login />)
    await dangNhapThu()
    await waitFor(() => expect(nhay).toHaveBeenCalled())
    expect(new URL(nhay.mock.calls[0][0] as string, 'https://hseq.test').origin).toBe('https://hseq.test')
  })

  it('next= là đường dẫn tương đối hợp lệ: nhảy đúng về đó, giữ cả query', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    const nhay = vi.fn()
    vi.stubGlobal('location', {
      pathname: '/login', search: '?next=%2Fstatus%3Fperiod%3D2026-08', assign: nhay,
    } as never)
    render(<Login />)
    await dangNhapThu()
    await waitFor(() => expect(nhay).toHaveBeenCalledWith('/status?period=2026-08'))
  })

  it('không có next=, vai trò chứa reporter: về /reports', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    const nhay = vi.fn()
    vi.stubGlobal('location', { pathname: '/login', search: '', assign: nhay } as never)
    render(<Login />)
    await dangNhapThu()
    await waitFor(() => expect(nhay).toHaveBeenCalledWith('/reports'))
  })

  it('không có next=, vai trò không chứa reporter: về /dashboard', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['admin_atcl']))
    const nhay = vi.fn()
    vi.stubGlobal('location', { pathname: '/login', search: '', assign: nhay } as never)
    render(<Login />)
    await dangNhapThu()
    await waitFor(() => expect(nhay).toHaveBeenCalledWith('/dashboard'))
  })
})
