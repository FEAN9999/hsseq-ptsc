// frontend/src/components/TrangLoi.test.tsx
//
// Hai màn lỗi (403/404) trước Lát 2 KHÔNG có một ca test nào — chúng chỉ được `routes.test.tsx`
// chạm tới gián tiếp ("path bịa thì thấy NotFound"). Đó là lý do một lối thoát HỎNG sống được lâu:
// nút duy nhất của cả hai màn là `<a href="/">Về trang chủ`, mà `/` là `<Navigate to="/login">`,
// nên người ĐANG ĐĂNG NHẬP bấm vào sẽ rơi vào form đăng nhập — một ngõ cụt dẫn sang ngõ cụt khác.
//
// Vì hai màn này đứng NGOÀI `AppShell` (không sidebar, không breadcrumb), cái nút đó là đường đi
// duy nhất trên màn hình. Ca ở đây đo đúng một câu: nó dẫn tới chỗ người dùng MỞ ĐƯỢC, và dẫn bằng
// điều hướng SPA chứ không phải một lượt tải tài liệu.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { useSession } from '../app/session'
import { Forbidden } from '../pages/Forbidden'
import { NotFound } from '../pages/NotFound'

/** Hiện lại pathname hiện tại — đọc đích trên CÂY THẬT thay vì spy, cùng khuôn `DichDen` của
 *  `pages/Reports.test.tsx`. */
function DichDen() {
  const { pathname } = useLocation()
  return <div data-testid="dich-den">{pathname}</div>
}

function ve(trang: 'forbidden' | 'notfound') {
  return render(
    <MemoryRouter initialEntries={['/x']}>
      <Routes>
        <Route path="/x" element={trang === 'forbidden' ? <Forbidden /> : <NotFound />} />
        <Route path="*" element={<DichDen />} />
      </Routes>
    </MemoryRouter>,
  )
}

function dangNhapVoi(quyen: string[]) {
  useSession.setState({
    token: 't',
    user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
    orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
    permissions: new Set(quyen),
  })
}

/** Nút đi tiếp CHÍNH — nút duy nhất là `<a>` trên màn (nút phụ của 403 là `<button>`). */
function nutChinh(): HTMLAnchorElement {
  return screen.getByRole('link') as HTMLAnchorElement
}

beforeEach(() => {
  useSession.getState().logout()
})

describe('Màn lỗi 403/404 — lối thoát phải dẫn tới chỗ MỞ ĐƯỢC (Lát 2)', () => {
  it.each(['forbidden', 'notfound'] as const)('%s: chưa đăng nhập thì lối thoát là /login', (trang) => {
    ve(trang)
    expect(nutChinh().getAttribute('href')).toBe('/login')
    expect(nutChinh().textContent).toBe('Đăng nhập')
  })

  // Đây là chính cái lỗi Lát 2 sửa: trước bản vá nút trỏ `<a href="/">`, mà `/` khi đó là
  // `<Navigate to="/login">`, nên người ĐANG đăng nhập bị đẩy vào form đăng nhập.
  // `/` giờ là LỐI VÀO thật (app/routes.tsx) — `routes.test.tsx` khoá vế "nó dẫn tới đâu".
  it.each(['forbidden', 'notfound'] as const)('%s: đang có phiên thì lối thoát là /, KHÔNG phải /login', (trang) => {
    dangNhapVoi(['dashboard.view', 'report.approve'])
    ve(trang)
    expect(nutChinh().getAttribute('href')).toBe('/')
    expect(nutChinh().textContent).toBe('Về trang chủ')
  })

  // Vế QUYẾT ĐỊNH của bản vá thứ hai: một màn lỗi gần như luôn mở bằng một lần TẢI TRANG, và lúc đó
  // `session.ts` mới chỉ khôi phục `token` — `permissions` còn RỖNG cho tới khi `RequireAuth` hỏi
  // lại `/auth/me`, mà hai màn này nằm ngoài `RequireAuth`. Bản đầu Lát 2 đọc `permissions` ở đây
  // nên vẽ ra nút "Đăng nhập" ngay cạnh nút "Đổi tài khoản" cho một người đang đăng nhập.
  it('có token nhưng quyền CHƯA nạp lại (cảnh tải trang thật): vẫn là "Về trang chủ"', () => {
    useSession.setState({ token: 't', user: null, orgUnit: null, permissions: new Set() })
    ve('forbidden')
    expect(nutChinh().getAttribute('href')).toBe('/')
    expect(nutChinh().textContent).toBe('Về trang chủ')
  })

  // `<Link>` chứ không phải `<a href>`: bấm phải đổi route TRONG ứng dụng. Một `<a href>` trong
  // MemoryRouter không đổi được route nên `DichDen` sẽ không bao giờ hiện — đó chính là phép phân
  // biệt (cùng kỹ thuật R1 của `pages/Reports.test.tsx`).
  it('bấm nút đi tiếp là điều hướng SPA thật, không phải tải lại tài liệu', async () => {
    dangNhapVoi(['dashboard.view'])
    ve('notfound')
    await userEvent.click(nutChinh())
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/')
  })
})

describe('403 — lối thoát thứ hai: đổi tài khoản (Lát 2)', () => {
  it('đang có phiên: bấm "Đổi tài khoản" xoá phiên rồi đưa về /login', async () => {
    dangNhapVoi(['report.view_own_unit'])
    ve('forbidden')
    await userEvent.click(screen.getByRole('button', { name: 'Đổi tài khoản' }))
    expect(useSession.getState().token).toBeNull()
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/login')
  })

  it('chưa đăng nhập: KHÔNG có nút "Đổi tài khoản" (không có tài khoản nào để đổi)', () => {
    ve('forbidden')
    expect(screen.queryByRole('button', { name: 'Đổi tài khoản' })).toBeNull()
  })

  // 404 không có lối thoát thứ hai: đường dẫn sai không liên quan gì tới tài khoản đang dùng.
  it('404 KHÔNG mượn nút "Đổi tài khoản" của 403', () => {
    dangNhapVoi(['report.view_own_unit'])
    ve('notfound')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
