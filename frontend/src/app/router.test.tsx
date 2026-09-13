// frontend/src/app/router.test.tsx
//
// F2 (vòng sửa 1 Task 17): RequireAuth là cổng gác duy nhất của toàn ứng dụng nhưng chưa từng có
// test — đảo `if (!token)` thành `if (token)` vẫn 110/110 xanh. Test cả hai chiều bằng router
// thật (MemoryRouter + Routes), không chỉ gọi hàm: khẳng định ĐÚNG NỘI DUNG hiện ra, không phải
// chỉ "có render" — nếu gác cổng chạy ngược, trang /login sẽ hiện thay vì nội dung được bảo vệ
// (và ngược lại), test phải phân biệt được hai khả năng đó.
//
// S1b (vòng sửa 1 Task 20, task-20-fix-1.md): session.ts khôi phục lại `token` từ sessionStorage
// lúc khởi tạo store (sống qua một lần tải lại trang) nhưng KHÔNG khôi phục user/orgUnit/
// permissions — RequireAuth phải tự nạp lại qua GET /auth/me đúng MỘT LẦN khi gặp "có token,
// chưa có user". Các ca dưới đây mô phỏng đúng trạng thái đó bằng `useSession.setState(...)`
// (không resetModules() + import lại: session.ts/client.ts kéo theo React, dựng lại module trong
// cùng file test dễ vỡ "invalid hook call" do lẫn hai bản React — cơ chế session.ts thật sự ĐỌC
// sessionStorage lúc khởi tạo được khoá riêng, hẹp, ở session.test.ts).
//
// R2 (vòng sửa 2, task-20-fix-2.md): /auth/me lỗi KHÔNG phải xác thực (mất mạng, 5xx — đúng kiểu
// Render free tier ngủ dậy) không còn tự logout() nữa — phải GIỮ phiên, hiện lỗi tại chỗ kèm nút
// Thử lại. Chỉ 401/403 mới logout().
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RequireAuth } from './router'
import { useSession } from './session'

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
})

const NGUOI_DUNG_GIA = { id: 1, email: 'u01@ptsc.local', full_name: 'Người dùng giả', position: null }
const DON_VI_GIA = { id: 2, code: 'U01', name: 'Đơn vị thành viên 01 (tên tạm)' }

function TrangDangNhapGia() {
  const { search } = useLocation()
  return <div>Trang đăng nhập giả{search}</div>
}

function duong(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<TrangDangNhapGia />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <div>Nội dung được bảo vệ</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('chưa có token: điều hướng /login kèm next=, KHÔNG render children', () => {
    duong('/reports/12')
    expect(screen.getByText(/Trang đăng nhập giả/)).toBeTruthy()
    expect(screen.queryByText('Nội dung được bảo vệ')).toBeNull()
  })

  it('chưa có token: next= giữ cả query string hiện tại', () => {
    duong('/status?period=2026-08')
    expect(screen.getByText('Trang đăng nhập giả?next=%2Fstatus%3Fperiod%3D2026-08')).toBeTruthy()
  })

  it('có phiên đầy đủ (token + user): render children ngay, KHÔNG điều hướng, KHÔNG gọi /auth/me', () => {
    useSession.getState().login('t', NGUOI_DUNG_GIA, DON_VI_GIA, ['report.view_own_unit'])
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    duong('/reports/12')
    expect(screen.getByText('Nội dung được bảo vệ')).toBeTruthy()
    expect(screen.queryByText(/Trang đăng nhập giả/)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('S1b: có token nhưng CHƯA có user (vừa "tải lại trang"): hiện trạng thái tải, gọi /auth/me đúng một lần rồi render children', async () => {
    useSession.setState({ token: 'tok-cu' })
    const f = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: NGUOI_DUNG_GIA, permissions: ['report.view_own_unit'], org_unit: DON_VI_GIA }),
    })
    vi.stubGlobal('fetch', f)
    duong('/reports/12')
    // Trạng thái tải hiện TRƯỚC khi /auth/me trả lời — không hiện trang trống, không đá /login.
    expect(screen.getByText('Đang tải…')).toBeTruthy()
    expect(await screen.findByText('Nội dung được bảo vệ')).toBeTruthy()
    expect(f.mock.calls.filter(([url]) => String(url).includes('/auth/me'))).toHaveLength(1)
    expect(useSession.getState().user).toEqual(NGUOI_DUNG_GIA)
    expect(useSession.getState().token).toBe('tok-cu')
  })

  it('S1b: /auth/me thất bại (401) thì đăng xuất và đá về /login', async () => {
    useSession.setState({ token: 'tok-het-han' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ detail: 'Phiên đã hết hạn' }),
    }))
    vi.stubGlobal('location', { pathname: '/reports/12', search: '', assign: vi.fn() } as never)
    duong('/reports/12')
    expect(await screen.findByText(/Trang đăng nhập giả/)).toBeTruthy()
    expect(useSession.getState().token).toBeNull()
  })

  // R2 (vòng sửa 2, task-20-fix-2.md) — LỖI THẬT của bản trước: bắt MỌI lỗi rồi logout() vô điều
  // kiện, kể cả lỗi KHÔNG liên quan xác thực. Render free tier ngủ dậy rất hay trả 502/503
  // (client.ts:80 đã ghi rõ) với thân không phải JSON — res.json() bên trong client.ts tự rơi về
  // `{}`, ApiError vẫn dựng được với status=503 thật. Một phiên CÒN HẠN không được đăng xuất chỉ vì
  // máy chủ vừa thức dậy — đúng lúc S1b (sống qua một lần tải lại) cần phát huy tác dụng nhất.
  it('R2: /auth/me trả 503 (Render ngủ dậy) thì GIỮ phiên (token + sessionStorage còn nguyên), hiện lỗi kèm nút Thử lại — KHÔNG đăng xuất', async () => {
    useSession.getState().login('tok-con-han', NGUOI_DUNG_GIA, DON_VI_GIA, ['report.view_own_unit'])
    // Mô phỏng đúng trạng thái "vừa tải lại trang": bộ nhớ trong chỉ còn token.
    useSession.setState({ user: null, orgUnit: null, permissions: new Set() })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
    duong('/reports/12')
    expect(await screen.findByText('Không nạp lại được phiên đăng nhập')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy()
    expect(useSession.getState().token).toBe('tok-con-han')
    expect(sessionStorage.getItem('hseq.token')).toBe('tok-con-han')
    expect(screen.queryByText(/Trang đăng nhập giả/)).toBeNull()
  })

  // Khác ca 503 ở trên: lỗi MẠNG (fetch tự reject, không có response — không đi qua nhánh 401 của
  // client.ts, vì không có `res.status` để so) cũng phải được xếp cùng nhóm "không phải xác thực".
  // Trước R2, ca này (dưới tên cũ "lỗi mạng cũng đăng xuất") từng là hành vi ĐÚNG lúc đó — R2 đổi
  // hẳn kỳ vọng: giữ phiên thay vì đăng xuất, không còn kẹt vô hạn ở "Đang tải…" (đã có lối thoát
  // là nút Thử lại) mà cũng không mất phiên oan.
  it('R2: /auth/me lỗi mạng (không phải response, không phải 401/403) cũng GIỮ phiên, hiện lỗi kèm nút Thử lại', async () => {
    useSession.getState().login('tok-mat-mang', NGUOI_DUNG_GIA, DON_VI_GIA, ['report.view_own_unit'])
    useSession.setState({ user: null, orgUnit: null, permissions: new Set() })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    duong('/reports/12')
    expect(await screen.findByText('Không nạp lại được phiên đăng nhập')).toBeTruthy()
    expect(useSession.getState().token).toBe('tok-mat-mang')
    expect(screen.queryByText(/Trang đăng nhập giả/)).toBeNull()
  })

  it('R2: bấm Thử lại sau lỗi gọi lại /auth/me', async () => {
    useSession.getState().login('tok-con-han', NGUOI_DUNG_GIA, DON_VI_GIA, ['report.view_own_unit'])
    useSession.setState({ user: null, orgUnit: null, permissions: new Set() })
    const f = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    vi.stubGlobal('fetch', f)
    duong('/reports/12')
    await screen.findByText('Không nạp lại được phiên đăng nhập')
    const soLanTruoc = f.mock.calls.filter(([url]) => String(url).includes('/auth/me')).length
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => {
      const soLanSau = f.mock.calls.filter(([url]) => String(url).includes('/auth/me')).length
      expect(soLanSau).toBeGreaterThan(soLanTruoc)
    })
  })

  // 403 KHÔNG nằm trong nhóm client.ts tự xử lý toàn cục (client.ts chỉ so `res.status === 401`) —
  // nên đây là ca DUY NHẤT chứng minh nhánh "401 || 403" của RequireAuth còn sống thật (không phải
  // mã chết): nếu bỏ hẳn nhánh này, ca 401 ở trên vẫn xanh (client.ts đã lo trước), nhưng ca 403
  // này sẽ đỏ vì không còn ai đăng xuất nữa.
  it('R2: /auth/me trả 403 thì vẫn đăng xuất (cùng nhóm xác thực với 401) — đường đi DUY NHẤT xử lý 403, client.ts không xử toàn cục', async () => {
    useSession.getState().login('tok-403', NGUOI_DUNG_GIA, DON_VI_GIA, ['report.view_own_unit'])
    useSession.setState({ user: null, orgUnit: null, permissions: new Set() })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: 'Không đủ quyền' }) }),
    )
    duong('/reports/12')
    expect(await screen.findByText(/Trang đăng nhập giả/)).toBeTruthy()
    expect(useSession.getState().token).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  // Chốt chặn vòng lặp tải lại (coordinator, task-20-fix-1.md): /auth/me 401 → client.ts tự
  // logout() → nếu logout() KHÔNG xoá sessionStorage, một lần tải lại trang THẬT sẽ đọc lại đúng
  // token cũ, qua RequireAuth, gọi /auth/me, 401, lặp lại vô hạn. Khoá cả hai vế: sessionStorage
  // sạch sau cùng, VÀ /auth/me chỉ được gọi đúng một lần (không tự lặp trong một lần mount).
  it('S1b: chặn vòng lặp tải lại — 401 ở /auth/me xoá sạch sessionStorage và KHÔNG gọi /auth/me lần hai', async () => {
    useSession.getState().login('tok-cu', NGUOI_DUNG_GIA, DON_VI_GIA, ['report.view_own_unit'])
    // Mô phỏng đúng trạng thái sau một lần "tải lại trang": bộ nhớ trong chỉ còn token (như
    // session.ts đọc lại từ sessionStorage lúc khởi tạo store) — nhưng sessionStorage (ghi bởi
    // login() ở trên) vẫn còn nguyên token cũ.
    useSession.setState({ user: null, orgUnit: null, permissions: new Set() })
    expect(sessionStorage.length).toBeGreaterThan(0)

    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Phiên đã hết hạn' }) })
    vi.stubGlobal('fetch', f)
    vi.stubGlobal('location', { pathname: '/reports/12', search: '', assign: vi.fn() } as never)

    duong('/reports/12')
    await screen.findByText(/Trang đăng nhập giả/)

    expect(sessionStorage.length).toBe(0)
    expect(f.mock.calls.filter(([url]) => String(url).includes('/auth/me'))).toHaveLength(1)
  })
})
