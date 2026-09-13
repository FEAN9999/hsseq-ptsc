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
import { render, screen } from '@testing-library/react'
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

  // Khác ca 401 ở trên: lỗi MẠNG (fetch tự reject, không có response) không đi qua nhánh 401 của
  // client.ts (không có `res.status` để so — client.ts không tự logout() trong trường hợp này).
  // RequireAuth phải tự lo lấy, nếu không sẽ kẹt mãi ở "Đang tải…" với một token không dùng được.
  it('S1b: /auth/me lỗi mạng (không phải 401) cũng đăng xuất và đá về /login, không kẹt ở "Đang tải…"', async () => {
    useSession.setState({ token: 'tok-mat-mang' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    duong('/reports/12')
    expect(await screen.findByText(/Trang đăng nhập giả/)).toBeTruthy()
    expect(useSession.getState().token).toBeNull()
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
