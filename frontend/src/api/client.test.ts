// frontend/src/api/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './client'
import { useSession } from '../app/session'

// task-28-fix-2.md P1: docJsonHopLe() đọc `res.headers.get('content-type')` trên NHÁNH THÀNH CÔNG
// — mặc định 'application/json' để mọi ca sẵn có (viết trước P1, không quan tâm content-type) vẫn
// xanh nguyên như cũ; ca nào cần mô phỏng SPA fallback (200 kèm HTML) tự truyền `loaiNoiDung` khác.
function tra(status: number, body: unknown, loaiNoiDung = 'application/json') {
  return vi.fn().mockResolvedValue({
    ok: status < 400, status,
    headers: { get: (ten: string) => (ten.toLowerCase() === 'content-type' ? loaiNoiDung : null) },
    json: async () => body,
  } as unknown as Response)
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
//
// task-28-fix-2.md P1: BASE giờ chỉ có ĐÚNG hai trường hợp — có biến (dùng biến) hay không (rơi về
// '/api/v1') — không còn nhánh thứ ba ném lúc tải module theo PROD/hostname. Bộ 4 ca cũ ở vòng sửa
// 1 (PROD=true/false × hostname cục bộ/không) đã bị XOÁ vì chính CƠ CHẾ chúng canh không còn tồn
// tại — thay bằng ca dưới đây khoá rằng module KHÔNG BAO GIỜ ném nữa dù ở điều kiện "xấu nhất" của
// cơ chế cũ (PROD=true + hostname domain thật), và bộ `docJsonHopLe` bên dưới khoá cơ chế MỚI.
describe('BASE — nguồn origin API duy nhất (task-28-scope.md mục 2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('CÓ VITE_API_BASE thì api.* gọi đúng origin tuyệt đối đó', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE', 'https://api.example.com/api/v1')
    const f = tra(200, { ok: true })
    vi.stubGlobal('fetch', f)
    const { api: apiMoi } = await import('./client')
    await apiMoi.get('/reports/1')
    expect(f.mock.calls[0][0]).toBe('https://api.example.com/api/v1/reports/1')
  })

  it('KHÔNG đặt VITE_API_BASE thì rơi về /api/v1 tương đối — không ném lúc tải module dù PROD=true và hostname là domain thật', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE', '')
    vi.stubEnv('PROD', true)
    vi.stubGlobal('location', { hostname: 'meu-frontend.vercel.app' } as never)
    const f = tra(200, { ok: true })
    vi.stubGlobal('fetch', f)
    const { api: apiMoi } = await import('./client')
    await apiMoi.get('/reports/1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/reports/1')
  })
})

// task-28-fix-2.md P1 — "tôi vừa xin JSON của API và nhận về cái gì?" thay cho "tôi đang đứng ở
// đâu?": response `res.ok` nhưng KHÔNG phải JSON là dấu hiệu BASE trỏ nhầm về chính origin frontend
// (SPA fallback trả index.html cho mọi path — vercel.json) bất kể hostname/PROD là gì, và bất kể
// trỏ nhầm vì THIẾU biến hay vì đặt SAI HÌNH DẠNG (B4: `VITE_API_BASE=/api/v1`, đúng chính giá trị
// mặc định, sai vì Render không cùng origin với Vercel) — cùng một triệu chứng, cùng một phép bắt.
describe('docJsonHopLe — content-type thay cho hostname (task-28-fix-2.md P1)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('res.ok nhưng Content-Type text/html (SPA fallback) thì ném lỗi nói rõ tên VITE_API_BASE', async () => {
    vi.stubGlobal('fetch', tra(200, '<!doctype html><body>index.html</body>', 'text/html'))
    await expect(api.get('/reports/1')).rejects.toThrow(/VITE_API_BASE/)
  })

  // task-28-fix-3.md P1: PHẢI là ApiError, không phải Error trần — Login.tsx:212
  // (err instanceof ApiError ? err.detail : 'Không kết nối được máy chủ') chỉ hiện `detail` cho
  // đúng loại này. Một Error trần vẫn khớp `.rejects.toThrow(/VITE_API_BASE/)` ở ca trên (vì
  // `.message` cũng chứa chuỗi đó) nhưng bị NUỐT MẤT ở màn hình thật — ca `toThrow` không phân biệt
  // được hai loại lỗi, phải khẳng định riêng bằng `toBeInstanceOf`.
  it('lỗi content-type-sai PHẢI là ApiError (không phải Error trần) — nếu không, Login.tsx nuốt mất câu nói tên biến', async () => {
    vi.stubGlobal('fetch', tra(200, '<!doctype html><body>index.html</body>', 'text/html'))
    await expect(api.get('/reports/1')).rejects.toBeInstanceOf(ApiError)
  })

  it('res.ok kèm Content-Type application/json thì vẫn trả JSON như cũ, không ném', async () => {
    vi.stubGlobal('fetch', tra(200, { id: 1 }, 'application/json'))
    await expect(api.get('/reports/1')).resolves.toEqual({ id: 1 })
  })

  // task-28-fix-4.md P2 (A4') — MẶT ÂM: `docJsonHopLe` phải KHÔNG ném khi server ĐÃ trả JSON.
  // Nghĩa vụ mặt dương (phải ném khi nhận HTML) được canh dày, mặt âm thì trước vòng này chỉ có
  // đúng MỘT người canh (content-type vắng hẳn — ca `tra()` không truyền loại, và đột biến bỏ
  // khoan dung đó làm đỏ 139 ca), nên siết `.includes('application/json')` thành
  // `=== 'application/json'` vẫn xanh 746/746.
  //
  // `application/json; charset=utf-8` là header HOÀN TOÀN HỢP LỆ và là dạng mà bất kỳ proxy/CDN
  // nào đứng trước Render cũng có thể chuẩn hoá ra (FastAPI hôm nay trả `application/json` trần,
  // nên local không bao giờ chạm cạnh biên này). Với bản `===`, MỌI lời gọi API trên một bản deploy
  // ĐÚNG đều bị ném kèm câu buộc tội `VITE_API_BASE` — cơ chế sinh ra để chỉ đúng chỗ quay sang chỉ
  // sai chỗ, ở đúng trường hợp mọi thứ đều ổn. Đây là bài học K2 (Task 26: 5/7 đột biến sống sót
  // nằm ở mặt âm) lặp lại trên cơ chế mới.
  it('Content-Type application/json KÈM tham số (charset=utf-8 — proxy/CDN rất hay thêm) thì KHÔNG ném', async () => {
    vi.stubGlobal('fetch', tra(200, { id: 1 }, 'application/json; charset=utf-8'))
    await expect(api.get('/reports/1')).resolves.toEqual({ id: 1 })
  })

  // task-28-fix-5.md P1 — vẫn là mặt ÂM, lối vào thứ hai. Media type trong HTTP KHÔNG phân biệt
  // hoa/thường (RFC 9110 §8.3.1), còn `Headers.get()` trả NGUYÊN VĂN giá trị server gửi — chỉ TÊN
  // header mới được chuẩn hoá, giá trị thì không. Nên so `.includes('application/json')` trên chuỗi
  // THÔ là đang đọc sai giao thức: `Application/JSON` — một header hoàn toàn hợp lệ — bị coi là
  // "không phải JSON" và ném kèm câu buộc tội `VITE_API_BASE` trên một bản deploy HOÀN TOÀN LÀNH.
  // Cùng họ lỗi "thông báo chỉ tay sai chỗ" với ca charset ngay trên, chỉ khác lối vào.
  //
  // Một ca phủ cả hai chỗ có thể viết hoa (tên media type và tên tham số) vì cùng một phép so xử lý
  // cả chuỗi — không tách thành hai ca cho cùng một nhánh.
  it('Content-Type viết HOA (Application/JSON — media type không phân biệt hoa thường) thì KHÔNG ném', async () => {
    vi.stubGlobal('fetch', tra(200, { id: 1 }, 'Application/JSON; Charset=UTF-8'))
    await expect(api.get('/reports/1')).resolves.toEqual({ id: 1 })
  })

  // B4: đặt biến SAI HÌNH DẠNG (thiếu origin tuyệt đối, chỉ có phần đường dẫn) lọt qua MỌI danh
  // sách hostname vì bản thân biến đã được "đặt" — chỉ phép kiểm NỘI DUNG response mới bắt được.
  it('B4 — VITE_API_BASE bị đặt sai hình dạng ("/api/v1", thiếu origin) vẫn hỏng ồn ào y hệt lúc thiếu biến', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE', '/api/v1')
    vi.stubGlobal('fetch', tra(200, '<!doctype html><body>index.html</body>', 'text/html'))
    const { api: apiMoi } = await import('./client')
    await expect(apiMoi.get('/reports/1')).rejects.toThrow(/VITE_API_BASE/)
  })

  it('Content-Type JSON nhưng thân không parse được thì vẫn ném lỗi nói rõ tên VITE_API_BASE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
      } as unknown as Response),
    )
    await expect(api.get('/reports/1')).rejects.toThrow(/VITE_API_BASE/)
  })

  // Cùng lý do như ca dòng ~199: `.toThrow` không phân biệt được ApiError với Error trần vì cả hai
  // đều có `.message` chứa chuỗi VITE_API_BASE. `docJsonHopLe` sửa CẢ HAI nhánh throw sang ApiError
  // (task-28-fix-3.md P1) — nhánh content-type-sai đã có `toBeInstanceOf` riêng, nhánh
  // JSON-parse-failure này cũng cần, nếu không đây là đúng gap "mù dạng (b)" fix-3.md cảnh báo,
  // chỉ khác là ở nhánh còn lại của cùng hàm.
  it('lỗi JSON-không-parse-được CŨNG PHẢI là ApiError (không phải Error trần), cùng lý do như nhánh content-type-sai ở trên', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
      } as unknown as Response),
    )
    await expect(api.get('/reports/1')).rejects.toBeInstanceOf(ApiError)
  })
})
