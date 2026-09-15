// frontend/src/api/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './client'
import { useSession } from '../app/session'

function tra(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400, status,
    json: async () => body,
  } as Response)
}

beforeEach(() => { useSession.getState().logout(); vi.unstubAllGlobals() })

describe('api client', () => {
  it('401 ở endpoint thường thì xoá token và về /login?next=', async () => {
    useSession.setState({ token: 'cu' })
    vi.stubGlobal('fetch', tra(401, { detail: 'Phiên đã hết hạn' }))
    const nhay = vi.fn()
    // `search: ''` (không chỉ pathname): giống một Location thật, để phép nối
    // `pathname + search` (F6) không tình cờ nối với `undefined`.
    vi.stubGlobal('location', { pathname: '/reports/12', search: '', assign: nhay } as never)
    await expect(api.get('/reports/12')).rejects.toBeInstanceOf(ApiError)
    expect(useSession.getState().token).toBeNull()
    expect(nhay).toHaveBeenCalledWith('/login?next=%2Freports%2F12')
  })

  // F6 (vòng sửa 1): next= phải giữ cả query string, không chỉ pathname — route lọc theo query
  // (vd. /status?period=2026-08) mất hết bộ lọc nếu 401 giữa chừng chỉ nhớ pathname.
  it('401 giữ nguyên query string trong next= (không chỉ pathname)', async () => {
    useSession.setState({ token: 'cu' })
    vi.stubGlobal('fetch', tra(401, { detail: 'Phiên đã hết hạn' }))
    const nhay = vi.fn()
    vi.stubGlobal('location', { pathname: '/status', search: '?period=2026-08', assign: nhay } as never)
    await expect(api.get('/status')).rejects.toBeInstanceOf(ApiError)
    expect(nhay).toHaveBeenCalledWith('/login?next=%2Fstatus%3Fperiod%3D2026-08')
  })

  // Bổ sung ngoài 4 ca của brief: "đã gọi logout" và "đã gọi assign" (test trên) đều xanh dù
  // đảo thứ tự hai lệnh đó — mutation-test đã xác nhận (task-17-report.md). Ca này đo THỨ TỰ
  // thật bằng cách để chính `location.assign` đọc lại session NGAY lúc nó chạy: điều hướng
  // (production: chuyển trang thật) không được phép xảy ra trong lúc token cũ vẫn còn sống.
  it('xoá token TRƯỚC KHI điều hướng, không phải sau', async () => {
    useSession.setState({ token: 'cu' })
    vi.stubGlobal('fetch', tra(401, { detail: 'Phiên đã hết hạn' }))
    let tokenLucDieuHuong: string | null | undefined
    vi.stubGlobal('location', {
      pathname: '/reports/12',
      search: '',
      assign: () => { tokenLucDieuHuong = useSession.getState().token },
    } as never)
    await expect(api.get('/reports/12')).rejects.toBeInstanceOf(ApiError)
    expect(tokenLucDieuHuong).toBeNull()
  })

  it('401 ở CHÍNH /auth/login thì KHÔNG redirect, để form hiện lỗi tại chỗ', async () => {
    vi.stubGlobal('fetch', tra(401, { detail: 'Sai email hoặc mật khẩu' }))
    const nhay = vi.fn()
    vi.stubGlobal('location', { pathname: '/login', assign: nhay } as never)
    await expect(api.post('/auth/login', { email: 'a', password: 'b' }))
      .rejects.toMatchObject({ status: 401, detail: 'Sai email hoặc mật khẩu' })
    expect(nhay).not.toHaveBeenCalled()
  })

  // F1 (vòng sửa 1): tên test hứa BA trường nhưng bản gốc chỉ kiểm `version` — phá `state` và
  // `values` cùng lúc vẫn xanh. Khẳng định đủ cả ba, đúng như tên test đã hứa.
  it('409 giữ nguyên state, version, values cho form vá lại', async () => {
    vi.stubGlobal('fetch', tra(409, {
      detail: 'Người khác vừa sửa báo cáo này', state: 'draft', version: 7,
      values: [{ indicator_code: 'B-2.1', this_period: 3 }],
    }))
    await expect(api.put('/reports/1/values', {}))
      .rejects.toMatchObject({
        status: 409,
        state: 'draft',
        version: 7,
        values: [{ indicator_code: 'B-2.1', this_period: 3 }],
      })
  })

  it('400 mang errors[] để form tô đúng ô', async () => {
    vi.stubGlobal('fetch', tra(400, {
      detail: 'Dữ liệu không hợp lệ',
      errors: [{ indicator_code: 'B-8.1', message: 'Ô bắt buộc, chưa có giá trị' }],
    }))
    await expect(api.put('/reports/1/values', {}))
      .rejects.toMatchObject({ errors: [{ indicator_code: 'B-8.1' }] })
  })

  // F3 (vòng sửa 1): 4 ca trên chỉ mock status >= 400 — chưa từng kiểm đường THÀNH CÔNG. Nếu
  // `request()` lỡ trả `undefined` thay vì JSON đã parse, không test nào trong bản gốc phát hiện.
  it('2xx trả đúng JSON đã parse (get/post/put)', async () => {
    vi.stubGlobal('fetch', tra(200, { id: 1, version: 3 }))
    await expect(api.get('/reports/1')).resolves.toEqual({ id: 1, version: 3 })

    vi.stubGlobal('fetch', tra(201, { id: 9 }))
    await expect(api.post('/reports', { template_id: 1 })).resolves.toEqual({ id: 9 })

    vi.stubGlobal('fetch', tra(200, { version: 4, values: [] }))
    await expect(api.put('/reports/1/values', { version: 3, values: [] }))
      .resolves.toEqual({ version: 4, values: [] })
  })

  // F4 (vòng sửa 1): chưa từng kiểm ĐÚNG NGHĨA header Authorization — chỉ mất tiền tố `Bearer `
  // là backend từ chối MỌI request (api/deps.py:48), gây vòng lặp 401 → xoá token → /login.
  it('gửi Authorization: Bearer <token> khi đã đăng nhập', async () => {
    useSession.setState({ token: 'abc.def' })
    const f = tra(200, {})
    vi.stubGlobal('fetch', f)
    await api.get('/reports/1')
    const [, init] = f.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc.def')
  })

  it('KHÔNG gửi header Authorization khi chưa đăng nhập', async () => {
    const f = tra(200, {})
    vi.stubGlobal('fetch', f)
    await api.get('/reports/1')
    const [, init] = f.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  // F7 (vòng sửa 1): Render free tier cold-start rất dễ trả 502/503 kèm thân HTML (gateway), không
  // phải JSON. res.json() lúc đó tự ném SyntaxError trần — nơi gọi viết `catch (e) { if (e
  // instanceof ApiError) ... }` sẽ không khớp nhánh nào nếu client không tự bọc lại.
  it('thân lỗi không phải JSON (502 gateway lúc cold-start) vẫn ném ApiError với status thật', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 502,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON') },
    } as unknown as Response))
    const p = api.get('/reports/1')
    await expect(p).rejects.toBeInstanceOf(ApiError)
    await expect(p).rejects.toMatchObject({ status: 502, detail: 'Có lỗi xảy ra' })
  })
})

// task-28-scope.md mục 2 — BASE là nguồn origin API DUY NHẤT: Login.tsx import lại từ đây thay vì
// tự tính (trước là hai bản chép cùng một dòng, có thể lệch nhau). BASE được tính MỘT LẦN lúc
// module nạp, nên mỗi ca dưới đây phải `vi.resetModules()` + `import('./client')` ĐỘNG rồi mới
// `vi.stubEnv(...)` — stub sau khi module đã nạp xong không còn tác dụng gì lên hằng số đã tính.
describe('BASE — nguồn origin API duy nhất (task-28-scope.md mục 2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('CÓ VITE_API_BASE thì api.* gọi đúng origin tuyệt đối đó, bất kể PROD hay hostname', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_API_BASE', 'https://api.example.com/api/v1')
    const f = tra(200, { ok: true })
    vi.stubGlobal('fetch', f)
    const { api: apiMoi } = await import('./client')
    await apiMoi.get('/reports/1')
    expect(f.mock.calls[0][0]).toBe('https://api.example.com/api/v1/reports/1')
  })

  // Vòng sửa 1 — P1/P2: ranh giới ĐÚNG là "có backend cùng origin hay không", không phải "PROD hay
  // không". `vite preview` (webServer của Playwright, hostname localhost) phục vụ CHÍNH bundle
  // production nhưng CÓ proxy (vite.config.ts) — đây là ca mà bản sửa lần 1 (chỉ xét PROD) ném
  // NHẦM, sập trắng 20/28 ca e2e (mọi ca cần trang render). Ca này khoá đúng cái vừa vỡ: PROD=true
  // + hostname CỤC BỘ + thiếu biến ⇒ vẫn phải rơi về '/api/v1' như cũ, KHÔNG được ném.
  it('PROD=true nhưng hostname cục bộ (vite preview) thì KHÔNG ném dù thiếu biến — proxy lo phần còn lại', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_API_BASE', '')
    vi.stubGlobal('location', { hostname: 'localhost' } as never)
    const f = tra(200, { ok: true })
    vi.stubGlobal('fetch', f)
    const { api: apiMoi } = await import('./client')
    await apiMoi.get('/reports/1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/reports/1')
  })

  // Đúng mạch brief cảnh báo (task-28-scope.md mục 2): thiếu biến ở production THẬT — hostname
  // KHÔNG phải cục bộ (Vercel), tức không có ai đứng ra làm proxy — KHÔNG được rơi về '/api/v1' im
  // lặng. Trên Vercel, đường dẫn tương đối đó đâm vào SPA fallback (vercel.json), trả 200 + HTML
  // thay vì 404, và res.json() sẽ ném SyntaxError trần thay vì ApiError. Phải hỏng NGAY lúc tải
  // module — trước khi kịp gọi fetch nào — và nói rõ tên biến.
  it('production THẬT (hostname không phải cục bộ) thiếu VITE_API_BASE thì hỏng ồn ào ngay lúc tải module, nói rõ tên biến', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_API_BASE', '')
    vi.stubGlobal('location', { hostname: 'meu-frontend.vercel.app' } as never)
    await expect(import('./client')).rejects.toThrow(/VITE_API_BASE/)
  })

  // `npm run dev` (PROD luôn false) thiếu biến vẫn rơi về '/api/v1' — `server.proxy` của
  // vite.config.ts lo phần còn lại. Nhánh PROD=false không bao giờ đọc `location.hostname`
  // (short-circuit `&&` trong baseApi()), nên không cần stub `location` ở ca này.
  it('KHÔNG phải production (npm run dev) thì thiếu biến vẫn rơi về /api/v1 như cũ', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_API_BASE', '')
    const f = tra(200, { ok: true })
    vi.stubGlobal('fetch', f)
    const { api: apiMoi } = await import('./client')
    await apiMoi.get('/reports/1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/reports/1')
  })
})
