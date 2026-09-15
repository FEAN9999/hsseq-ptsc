// frontend/src/pages/Login.test.tsx
//
// S1a (vòng sửa 1, task-20-fix-1.md): Login.tsx giờ gọi useNavigate() (hook) nên MỌI render ở
// đây phải bọc <MemoryRouter> — kể cả ca không đăng nhập thành công (hook không được gọi có điều
// kiện). renderLogin() dựng đúng CÂY THẬT tối thiểu: route /login render <Login/>, mọi route khác
// (đích điều hướng) render <DichDen/> hiện lại path+search hiện tại để khẳng định TRÊN CÂY THẬT,
// không suy luận qua spy `location.assign` (đã bỏ hẳn — Login.tsx không còn gọi nó cho điều hướng
// nội bộ). Đọc `next=` vẫn qua `location.search` THÔ (không qua router) nên vẫn stub `location`
// toàn cục như cũ cho các ca cần kiểm next=.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'

import { Login, duongDanNoiBo } from './Login'
import { BASE } from '../api/client'
import { useSession } from '../app/session'

// task-28-fix-2.md P1: cả thuGoiHealth() lẫn docJsonHopLe() (client.ts) giờ đọc
// `res.headers.get('content-type')` ở nhánh `res.ok` — mọi mock "thành công" phải có `headers`,
// nếu không `.get` ném TypeError trên `undefined`. Helper dùng chung cho các ca không tự ý kiểm
// content-type (giá trị mặc định 'application/json' — hành vi cũ, không thay đổi).
function okJson(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body }
}

function DichDen() {
  const { pathname, search } = useLocation()
  return <div data-testid="dich-den">{pathname}{search}</div>
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<DichDen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('/login', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('mở trang là gọi /health để đánh thức Render', async () => {
    const f = vi.fn().mockResolvedValue(okJson({ status: 'ok' }))
    vi.stubGlobal('fetch', f)
    renderLogin()
    // P2/A3 (task-28-fix-2.md): `toContain('/health')` cũ cũng khớp '/api/v1/health' — một đột
    // biến hardcode `fetch('/api/v1/health')` (bỏ qua BASE) vẫn xanh. Khẳng định ĐÍCH ĐẾN đầy đủ.
    await waitFor(() => expect(f.mock.calls[0][0]).toBe(`${BASE}/health`))
  })

  // task-28-fix-2.md P1: đúng "kịch bản hỏng của A3" mà thuGoiHealth() trước P1 mắc phải — response
  // 200 nhưng KHÔNG phải JSON (chữ ký của SPA fallback trả index.html khi BASE trỏ nhầm) KHÔNG
  // được tính là "server đã thức", phải rơi vào nhánh "Không kết nối được máy chủ" sau khi thử lại
  // đủ SO_LAN_THU_LAI_HEALTH lần. Timer giả như ca "quá 90 giây" ở trên — 2 lần thử lại ×
  // CACH_THU_LAI_MS (5s) = tối đa 10s trước khi báo mất kết nối.
  it('/health trả 200 kèm HTML (SPA fallback, BASE trỏ nhầm) thì KHÔNG tính là server đã thức', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'text/html' },
        json: async () => { throw new SyntaxError('Unexpected token <') },
      }),
    )
    try {
      renderLogin()
      await vi.advanceTimersByTimeAsync(10_100)
      expect(screen.getByText(/Không kết nối được máy chủ/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sau 3 giây chưa trả lời thì hiện câu đánh thức máy chủ', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderLogin()
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
      renderLogin()
      await vi.advanceTimersByTimeAsync(90_000)
      expect(soLanBiHuy[0]).toBeGreaterThanOrEqual(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('401 hiện Sai email hoặc mật khẩu tại chỗ, KHÔNG điều hướng đi đâu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ detail: 'Sai email hoặc mật khẩu' }),
    }))
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'u01@ptsc.local')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'sai')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Sai email hoặc mật khẩu')).toBeTruthy()
    expect(screen.queryByTestId('dich-den')).toBeNull()
  })

  it('không có link quên mật khẩu, không có đăng ký', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({})))
    renderLogin()
    expect(screen.queryByText(/quên mật khẩu/i)).toBeNull()
    expect(screen.queryByText(/đăng ký/i)).toBeNull()
  })

  it('đang gửi thì nút khoá và đổi chữ', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderLogin()
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
// minh dây nối từ URL/response tới navigate()/session hoạt động, không phải một thế giới giả tự
// khớp với chính nó.
function fetchDangNhapThanhCong(roles: string[]) {
  return vi.fn((url: string) => {
    if (url.includes('/health')) {
      return Promise.resolve(okJson({ status: 'ok' }))
    }
    if (url.includes('/auth/login')) {
      return Promise.resolve(okJson({ access_token: 'tok-123', token_type: 'bearer' }))
    }
    if (url.includes('/auth/me')) {
      return Promise.resolve(
        okJson({
          user: { id: 1, email: 'u01@ptsc.local', full_name: 'Người dùng thử', position: null },
          roles,
          permissions: ['report.edit'],
          org_unit: { id: 2, code: 'U01', name: 'Đơn vị thành viên 01' },
        }),
      )
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
// đăng nhập (chỉ đọc đích điều hướng) — thiếu org_unit vẫn xanh hết. Ca này đọc thẳng
// useSession.getState() sau khi submit để khoá đúng bốn tham số của login().
describe('/login — session ghi đúng hình dạng sau khi đăng nhập (C1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useSession.getState().logout()
  })

  it('đăng nhập thành công ghi đúng token, user, orgUnit, permissions vào session', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    vi.stubGlobal('location', { search: '' } as never)
    renderLogin()
    await dangNhapThu()
    await waitFor(() => expect(useSession.getState().token).toBe('tok-123'))
    const s = useSession.getState()
    expect(s.user).toEqual({ id: 1, email: 'u01@ptsc.local', full_name: 'Người dùng thử', position: null })
    expect(s.orgUnit).toEqual({ id: 2, code: 'U01', name: 'Đơn vị thành viên 01' })
    expect(s.permissions.has('report.edit')).toBe(true)
  })
})

// R3 (vòng sửa 2, task-20-fix-2.md) — dieuHuongSauDangNhap() gọi navigate(…, { replace: true }) ở
// CẢ HAI nhánh (next= hợp lệ, và mặc định theo vai trò) nhưng chưa ca nào khoá CỜ này, chỉ khoá
// ĐÍCH đến. Thiếu { replace: true }: /login còn nằm trong lịch sử, bấm Back sau khi đăng nhập quay
// lại đúng form đã nộp xong. `MemoryRouter` (renderLogin() ở trên) không lộ lịch sử ra để đọc lại —
// phải tự dựng bằng createMemoryRouter()/RouterProvider để đọc router.state.historyAction sau khi
// điều hướng xong ('REPLACE' nếu có cờ, 'PUSH' nếu không).
describe('/login — điều hướng sau đăng nhập THAY THẾ lịch sử, không PUSH thêm (R3)', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('đăng nhập thành công: historyAction là REPLACE, không phải PUSH (Back không quay lại form đã nộp)', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    vi.stubGlobal('location', { search: '' } as never)
    const router = createMemoryRouter(
      [
        { path: '/login', element: <Login /> },
        { path: '*', element: <DichDen /> },
      ],
      { initialEntries: ['/login'] },
    )
    render(<RouterProvider router={router} />)
    await dangNhapThu()
    await waitFor(() => expect(router.state.location.pathname).toBe('/reports'))
    expect(router.state.historyAction).toBe('REPLACE')
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
// F3 (task-19-fix-brief-2.md, vòng sửa 2) — thêm 2 giá trị: '//x.invalid//evil.example' là chính
// lỗ F3 vá (HIEM cũ không có nó nên 158 test vòng sửa 1 xanh trong khi lỗ nằm ngay trong hàm đang
// test); 'http://[' là lý do M15 (vòng sửa 1) ra xanh — new URL('http://[', base) CÓ ném
// TypeError thật, try/catch là mã sống nhưng trước đó chưa đầu vào nào chạm tới.
const HIEM = [
  '//evil.example',
  'https://evil.example',
  '/\\evil.example',
  '/\\/evil.example',
  '/\t/evil.example',
  'javascript:alert(1)',
  '//x.invalid//evil.example',
  'http://[',
]

// S1a (vòng sửa 1, task-20-fix-1.md): trước đây ca này đọc lại đối số của SPY `location.assign`
// và tự kiểm tính an toàn (re-parse origin) — giờ Login.tsx điều hướng bằng navigate() (SPA,
// không phải location.assign thật), nên không còn "đối số gửi cho trình duyệt" để soi. Đổi sang
// so khớp với chính duongDanNoiBo() (hàm đã được kiểm bất biến riêng ở F4 bên dưới, gọi trực
// tiếp) làm "trọng tài": khẳng định dieuHuongSauDangNhap() vẫn LUÔN đi qua nó (không dùng next=
// thô) — độ an toàn khỏi mọi giá trị next= cụ thể vẫn do F4 khoá, không lặp lại ở đây.
describe('/login — lọc next= (chống open redirect, F1+F3)', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it.each(HIEM)('next=%s: điều hướng cuối cùng vẫn qua duongDanNoiBo, không dùng next thô', async (gtNext) => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    vi.stubGlobal('location', { search: `?next=${encodeURIComponent(gtNext)}` } as never)
    renderLogin()
    await dangNhapThu()
    const kyVong = duongDanNoiBo(gtNext) ?? '/reports'
    expect((await screen.findByTestId('dich-den')).textContent).toBe(kyVong)
  })

  it('next= là đường dẫn tương đối hợp lệ: nhảy đúng về đó, giữ cả query', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    vi.stubGlobal('location', { search: '?next=%2Fstatus%3Fperiod%3D2026-08' } as never)
    renderLogin()
    await dangNhapThu()
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/status?period=2026-08')
  })

  it('không có next=, vai trò chứa reporter: về /reports', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['reporter']))
    vi.stubGlobal('location', { search: '' } as never)
    renderLogin()
    await dangNhapThu()
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/reports')
  })

  it('không có next=, vai trò không chứa reporter: về /dashboard', async () => {
    vi.stubGlobal('fetch', fetchDangNhapThanhCong(['admin_atcl']))
    vi.stubGlobal('location', { search: '' } as never)
    renderLogin()
    await dangNhapThu()
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/dashboard')
  })
})

// F4 (task-19-fix-brief-2.md, vòng sửa 2) — HIEM dù dài tới đâu vẫn chỉ bắt được thứ ta nghĩ ra
// nổi (đó là lý do lỗ '//x.invalid//evil.example' lọt hai vòng sửa). Ca này gọi thẳng
// duongDanNoiBo() (không qua submit form) trên ~7.4 nghìn chuỗi sinh từ tổ hợp token, đòi MỌI
// chuỗi không bị chặn (khác null) phải vẫn ở đúng origin khi phân tích lại — đây phải ĐỎ trên mã
// TRƯỚC F3 (chỉ so `u.origin`, không so lại chuỗi trả ra) và XANH sau F3. Không đụng bởi S1a: hàm
// này không đổi, chỉ NƠI GỌI nó (dieuHuongSauDangNhap) đổi cách điều hướng.
describe('/login — duongDanNoiBo là điểm bất động, không chỉ liệt ca (F4)', () => {
  it('bất kể next= là gì, chuỗi đem đi điều hướng không bao giờ thoát origin', () => {
    const TOKEN = ['/', '//', '\\', ':', '.', 'a', '\t', 'x.invalid', 'evil.example']
    const APP = 'https://hseq.test'
    const thu: string[] = []
    const sinh = (s: string, con: number) => {
      thu.push(s)
      if (con) for (const t of TOKEN) sinh(s + t, con - 1)
    }
    for (const t of TOKEN) sinh(t, 3) // ~7.4 nghìn chuỗi, chạy dưới một giây

    for (const d of thu) {
      const ra = duongDanNoiBo(d)
      if (ra === null) continue
      expect(new URL(ra, APP).origin, `next=${JSON.stringify(d)}`).toBe(APP)
    }
  })
})
