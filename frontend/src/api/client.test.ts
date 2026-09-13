// frontend/src/api/client.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
