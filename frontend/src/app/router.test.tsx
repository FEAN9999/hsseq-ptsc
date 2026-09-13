// frontend/src/app/router.test.tsx
//
// F2 (vòng sửa 1): RequireAuth là cổng gác duy nhất của toàn ứng dụng nhưng chưa từng có test —
// đảo `if (!token)` thành `if (token)` vẫn 110/110 xanh. Test cả hai chiều bằng router thật
// (MemoryRouter + Routes), không chỉ gọi hàm: khẳng định ĐÚNG NỘI DUNG hiện ra, không phải chỉ
// "có render" — nếu gác cổng chạy ngược, trang /login sẽ hiện thay vì nội dung được bảo vệ (và
// ngược lại), test phải phân biệt được hai khả năng đó.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RequireAuth } from './router'
import { useSession } from './session'

beforeEach(() => useSession.getState().logout())

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

  it('có token: render children, KHÔNG điều hướng', () => {
    useSession.setState({ token: 't' })
    duong('/reports/12')
    expect(screen.getByText('Nội dung được bảo vệ')).toBeTruthy()
    expect(screen.queryByText(/Trang đăng nhập giả/)).toBeNull()
  })
})
