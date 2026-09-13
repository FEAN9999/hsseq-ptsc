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
    vi.stubGlobal('location', { pathname: '/reports/12', assign: nhay } as never)
    await expect(api.get('/reports/12')).rejects.toBeInstanceOf(ApiError)
    expect(useSession.getState().token).toBeNull()
    expect(nhay).toHaveBeenCalledWith('/login?next=%2Freports%2F12')
  })

  it('401 ở CHÍNH /auth/login thì KHÔNG redirect, để form hiện lỗi tại chỗ', async () => {
    vi.stubGlobal('fetch', tra(401, { detail: 'Sai email hoặc mật khẩu' }))
    const nhay = vi.fn()
    vi.stubGlobal('location', { pathname: '/login', assign: nhay } as never)
    await expect(api.post('/auth/login', { email: 'a', password: 'b' }))
      .rejects.toMatchObject({ status: 401, detail: 'Sai email hoặc mật khẩu' })
    expect(nhay).not.toHaveBeenCalled()
  })

  it('409 giữ nguyên state, version, values cho form vá lại', async () => {
    vi.stubGlobal('fetch', tra(409, {
      detail: 'Người khác vừa sửa báo cáo này', state: 'draft', version: 7,
      values: [{ indicator_code: 'B-2.1', this_period: 3 }],
    }))
    await expect(api.put('/reports/1/values', {}))
      .rejects.toMatchObject({ status: 409, version: 7 })
  })

  it('400 mang errors[] để form tô đúng ô', async () => {
    vi.stubGlobal('fetch', tra(400, {
      detail: 'Dữ liệu không hợp lệ',
      errors: [{ indicator_code: 'B-8.1', message: 'Ô bắt buộc, chưa có giá trị' }],
    }))
    await expect(api.put('/reports/1/values', {}))
      .rejects.toMatchObject({ errors: [{ indicator_code: 'B-8.1' }] })
  })
})
