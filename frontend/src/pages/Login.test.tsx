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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'

import { Login, duongDanNoiBo } from './Login'
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

// Tham số `Comp` chỉ để ca P1 bên dưới render được BẢN `./Login` nạp lại sau `vi.resetModules()`
// (lúc đó `BASE` mang giá trị khác mặc định); mọi ca khác gọi `renderLogin()` trần y như cũ.
function renderLogin(Comp: typeof Login = Login) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Comp />} />
        <Route path="*" element={<DichDen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('/login', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllEnvs())

  // task-28-fix-4.md P1 (A3'): bản trước khẳng định `toBe(`${BASE}/health`)` — nhưng trong môi
  // trường test không ai đặt VITE_API_BASE nên `BASE` rơi về đúng '/api/v1', tức vế phải BẰNG
  // CHÍNH chuỗi mà một bản viết cứng `fetch('/api/v1/health')` tạo ra. Khẳng định so một giá trị
  // với chính giá trị mặc định nó rơi về thì không phân biệt được "đi qua BASE" với "viết cứng
  // đúng giá trị BASE đang có" (sức phân biệt đi mượn) — đột biến viết cứng vẫn xanh 746/746.
  //
  // Đóng bằng cách ép `BASE` mang một giá trị KHÁC mặc định trong chính ca này: `vi.stubEnv` +
  // `vi.resetModules()` + `import()` động (cùng khuôn với client.test.ts — BASE tính MỘT LẦN lúc
  // module nạp, stub sau khi nạp xong không còn tác dụng). Lúc đó origin khẳng định là tuyệt đối,
  // không chuỗi viết cứng nào trùng được nữa.
  it('mở trang là gọi /health trên ĐÚNG origin của VITE_API_BASE (không phải chuỗi viết cứng)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE', 'https://api.example.com/api/v1')
    const f = vi.fn().mockResolvedValue(okJson({ status: 'ok' }))
    vi.stubGlobal('fetch', f)
    const { Login: LoginMoi } = await import('./Login')
    renderLogin(LoginMoi)
    await waitFor(() => expect(f.mock.calls[0][0]).toBe('https://api.example.com/api/v1/health'))
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

  // task-28-fix-4.md P3 (A5') — mặt ÂM của thuGoiHealth(), cặp đôi của ca ngay trên. Chú thích của
  // chính hàm đó ghi rõ hợp đồng ("kể cả 503/502 kèm THÂN HTML của gateway lúc cold-start vẫn tính
  // là 'đã có phản hồi'"), nhưng hợp đồng ấy KHÔNG có ai canh: chèn `if (!res.ok) return false` vào
  // thuGoiHealth vẫn xanh 746/746. Vòng sửa 2 vừa đặt một điều kiện ĐỌC `res.ok` vào chính hàm này
  // nên mặt âm giờ là mã load-bearing.
  //
  // Render free tier cold-start là trạng thái BẮT BUỘC đi qua ở mọi lần demo sau 15 phút không ai
  // dùng: gateway trả 502 kèm HTML trong lúc máy chủ đang lên. Lúc đó màn đăng nhập phải im lặng
  // chờ (rồi hiện "Đang đánh thức máy chủ" nếu lâu), KHÔNG được hiện "Không kết nối được máy chủ" —
  // người xem demo sẽ kết luận hệ thống chết trong lúc nó chỉ đang thức dậy.
  it('/health trả 502 kèm HTML (gateway lúc Render cold-start) VẪN tính là server đã thức', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false, status: 502,
        headers: { get: () => 'text/html' },
        json: async () => { throw new SyntaxError('Unexpected token <') },
      }),
    )
    try {
      renderLogin()
      await vi.advanceTimersByTimeAsync(10_100)
      expect(screen.queryByText(/Không kết nối được máy chủ/)).toBeNull()
      // Và dòng đánh thức cũng đã tắt: lời gọi ĐÃ XONG và kết luận "đã thức" ngay lần đầu — khác
      // hẳn một fetch treo (ca dưới), thứ cũng không hiện banner mất kết nối nhưng vì lý do khác.
      expect(screen.queryByText(/Đang đánh thức máy chủ/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // task-28-fix-6.md — đối xứng với ca P3 ngay trên, ở cạnh biên CHỮ HOA. `Application/JSON` là
  // header HỢP LỆ (media type trong HTTP không phân biệt hoa/thường, RFC 9110 §8.3.1), nên một máy
  // chủ trả 200 kèm JSON thật KHÔNG được bị coi là chết.
  //
  // Trước khi gộp vị từ, `thuGoiHealth` so trên chuỗi THÔ (bản chép thứ hai của phép so đã sửa ở
  // `client.ts` vòng 5) nên nó trả false cả ba lượt và màn đăng nhập hiện "Không kết nối được máy
  // chủ" trên một bản deploy HOÀN TOÀN LÀNH. Nhánh này nặng hơn nhánh `client.ts`: nó chạy lúc MỞ
  // TRANG, không cần ai bấm gì, và câu hiện ra là câu CHUNG — không nói tên biến nào để mà đi kiểm.
  it('/health trả 200 kèm Application/JSON (viết HOA, server LÀNH) thì KHÔNG hiện banner mất kết nối', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'Application/JSON' },
        json: async () => ({ status: 'ok' }),
      }),
    )
    try {
      renderLogin()
      await vi.advanceTimersByTimeAsync(10_100)
      expect(screen.queryByText(/Không kết nối được máy chủ/)).toBeNull()
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

  // ---- P5 (final-fix-FE.md · final-review-R3-report.md §A3) — LỚP SỐNG-SÓT COLD-START CỦA RENDER.
  //
  // Ba hằng số ở `Login.tsx:30-33` là lớp DUY NHẤT đứng giữa buổi demo và một instance Render đang
  // ngủ, và cả ba **không có một người canh nào**: đột biến `TIMEOUT_HEALTH_MS` 90 000 → 1 000,
  // `SO_LAN_THU_LAI_HEALTH` 2 → 0, `CACH_THU_LAI_MS` 5 000 → 0 đều **sống sót 750/750**.
  //
  // Người canh duy nhất còn sống ở vùng này là một ca THẨM MỸ (thời điểm hiện câu "Đang đánh thức
  // máy chủ"): bộ test canh CÂU CHỮ, không canh CƠ CHẾ làm cho câu chữ ấy có nghĩa. Ba ca dưới đây
  // canh cơ chế. Không đổi một dòng mã sản phẩm nào.
  //
  // Vì sao ca `quá 90 giây … AbortController` ngay trên KHÔNG đủ: nó tua thẳng 90 giây rồi hỏi "đã
  // huỷ chưa". Với timeout 1 giây thì tới mốc đó đã huỷ ba lần — vẫn `>= 1`, vẫn xanh. Một ngưỡng
  // chỉ được canh khi đo CẢ HAI phía của nó.

  it('P5 — cold-start 89 giây vẫn ĐANG CHỜ: /health không bị huỷ trước ngưỡng 90 giây', async () => {
    vi.useFakeTimers()
    const soLanBiHuy = [0]
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
      // playwright.config.ts ghi "Render cold start ~60 s" — 89 giây vẫn nằm TRONG ngân sách đó,
      // nên lúc này phải còn đang chờ, không được cắt.
      await vi.advanceTimersByTimeAsync(89_000)
      expect(soLanBiHuy[0]).toBe(0)
      expect(screen.queryByText(/Không kết nối được máy chủ/)).toBeNull()
      // Và ngưỡng phải CÓ THẬT, không phải "không bao giờ huỷ": qua mốc 90 giây thì cắt.
      await vi.advanceTimersByTimeAsync(1_500)
      expect(soLanBiHuy[0]).toBeGreaterThanOrEqual(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('P5 — /health hỏng mạng thì gọi ĐÚNG 3 lần (2 lượt thử lại) rồi mới báo mất kết nối', async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', f)
    try {
      renderLogin()
      // 3 lời gọi + 2 khoảng nghỉ 5 giây = ~10 giây. Tua dư để chắc chắn chuỗi đã chạy hết.
      await vi.advanceTimersByTimeAsync(20_000)
      // Đúng 3, chốt CẢ HAI phía: `SO_LAN_THU_LAI_HEALTH = 0` cho 1 lần (đột biến trong bảng),
      // `= 5` cho 6 lần (một bản vá "cho chắc" kéo màn đăng nhập đứng im 30 giây).
      expect(f.mock.calls.filter(([u]) => String(u).includes('/health'))).toHaveLength(3)
      expect(screen.getByText(/Không kết nối được máy chủ/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('P5 — hai lượt thử lại cách nhau ĐÚNG 5 giây, không dồn một nhịp', async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', f)
    const dem = () => f.mock.calls.filter(([u]) => String(u).includes('/health')).length
    try {
      renderLogin()
      await vi.advanceTimersByTimeAsync(0)
      expect(dem()).toBe(1)
      // 4,9 giây sau lần hỏng đầu: CHƯA được gọi lại. `CACH_THU_LAI_MS = 0` (đột biến trong bảng)
      // làm cả ba lượt nổ trong cùng một nhịp — ba lần đấm vào một máy chủ đang khởi động, hết
      // ngân sách thử lại trước khi nó kịp thức, rồi báo "Không kết nối được máy chủ" trên một máy
      // chủ đang lên bình thường.
      await vi.advanceTimersByTimeAsync(4_900)
      expect(dem()).toBe(1)
      await vi.advanceTimersByTimeAsync(200)
      expect(dem()).toBe(2)
      // Khoảng nghỉ thứ hai cũng thế — một bản vá chỉ nghỉ trước lượt đầu vẫn qua được nếu chỉ đo
      // một nhịp. (Mốc: lượt 2 nổ ở t=5 000, nên t=9 900 là "chưa tới" và t=10 100 là "đã qua".)
      await vi.advanceTimersByTimeAsync(4_800)
      expect(dem()).toBe(2)
      await vi.advanceTimersByTimeAsync(300)
      expect(dem()).toBe(3)
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

  // task-28-fix-3.md P1 — "người canh": ca này khẳng định CÂU HIỂN THỊ TRÊN MÀN HÌNH (không phải
  // câu trong throw), đi qua ĐÚNG ĐƯỜNG người dùng đi (bấm Đăng nhập, không gọi thẳng client.ts) —
  // nếu chỉ khẳng định ở tầng client.ts (client.test.ts) thì đó là dạng mù (b): lớp ở giữa
  // (xuLySubmit, Login.tsx:212) mới là chỗ có thể âm thầm nuốt mất thông báo trước khi nó tới màn
  // hình, và một ca chỉ nhìn client.ts sẽ không bao giờ thấy được điều đó.
  it('backend giả trả 200 kèm HTML (BASE trỏ nhầm) lúc đăng nhập thì câu hiện trên MÀN HÌNH phải nói tên VITE_API_BASE, không phải câu chung chung', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/health')) return Promise.resolve(okJson({ status: 'ok' }))
        // /auth/login: 200 kèm HTML — đúng chữ ký SPA fallback (vercel.json) khi VITE_API_BASE
        // trỏ nhầm về chính origin frontend, task-28-fix-2.md P1.
        return Promise.resolve({
          ok: true, status: 200,
          headers: { get: () => 'text/html' },
          json: async () => { throw new SyntaxError('Unexpected token <') },
        })
      }),
    )
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'u01@ptsc.local')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Demo@2026')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText(/VITE_API_BASE/)).toBeTruthy()
    // Chốt chống hồi quy: câu CHUNG CHUNG cũ (chỉ tay sai chỗ — Render vẫn chạy bình thường, cái
    // sai nằm ở Vercel) không còn được phép xuất hiện thay cho câu nói tên biến.
    expect(screen.queryByText('Không kết nối được máy chủ')).toBeNull()
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
