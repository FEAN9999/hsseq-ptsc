// frontend/src/app/routes.tsx
//
// C7 (task-19-carry.md): bảng route của toàn ứng dụng — không task nào trong plan dựng nó, không
// task nào sửa main.tsx sau Task 15. Chỉ khai đúng những trang ĐÃ CÓ THẬT lúc này, đừng khai
// trước trang chưa xây (mã đầu cơ, trái CLAUDE.md #2):
//   /login    → <Login/>   — KHÔNG bọc RequireAuth, KHÔNG bọc AppShell
//   /403      → <Forbidden/>
//   /reports  → <Reports/>, bọc <RequireAuth><AppShell>…</AppShell></RequireAuth> (Task 20, C3)
//   /reports/:id → <ReportDetail/>, bọc y hệt (Task 22, task-22-carry.md C6)
//   /dashboard → <Dashboard/>, bọc y hệt (Task 25, task-25-carry.md C6)
//   /status   → <Status/>, bọc y hệt (Task 26, task-26-carry.md C4/C11) — trang cuối cùng của kế
//              hoạch gốc.
//   /admin/templates|org|users → ba màn quản trị (Lát 8), bọc y hệt. Chúng KHÔNG có lớp gác quyền
//              riêng ở đây: mục nav ẩn theo quyền (Sidebar.tsx) còn gõ thẳng địa chỉ thì vào được
//              và API trả 403 — `features/admin/khung.tsx` biến 403 đó thành một câu tiếng Việt.
//              Thêm một lớp gác ở tầng route sẽ là NGUỒN THỨ HAI cho cùng một quyết định, mà backend
//              vẫn là nguồn duy nhất đáng tin (RequireAuth cũng chỉ gác PHIÊN, không gác quyền).
//   /         → LỐI VÀO: đưa người dùng tới trang họ mở được (chưa đăng nhập thì về /login)
//   *         → <NotFound/>
//
// `App` xuất ra component gộp — nhận `router` làm prop thay vì tự tạo `createBrowserRouter` bên
// trong — để routes.test.tsx dựng lại bằng `createMemoryRouter` (kiểm được route ở một URL ban
// đầu tuỳ ý) mà vẫn chạy ĐÚNG cây thật (QueryClientProvider, Toast) chứ không phải một bản dựng
// tay song song: `<Toast/>` xoá khỏi App thì test "có mặt đúng một lần" đỏ thật, không phải một
// khẳng định chép lại mã.
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

import { queryClient } from './queryClient'
import { Toast } from '../components/ui/Toast'
import { RequireAuth } from './router'
import { useSession } from './session'
import { AppShell } from '../components/AppShell'
import { Login } from '../pages/Login'
import { Forbidden } from '../pages/Forbidden'
import { NotFound } from '../pages/NotFound'
import { Reports } from '../pages/Reports'
import { ReportDetail } from '../pages/ReportDetail'
import { Dashboard } from '../pages/Dashboard'
import { Status } from '../pages/Status'
import { QuanTriMau } from '../pages/QuanTriMau'
import { QuanTriToChuc } from '../pages/QuanTriToChuc'
import { QuanTriNguoiDung } from '../pages/QuanTriNguoiDung'

// `/` là LỐI VÀO của ứng dụng, không phải một bí danh của `/login`.
//
// Trước Lát 2 nó là `<Navigate to="/login" replace/>` thẳng. Với người CHƯA đăng nhập thì đúng;
// với người ĐANG đăng nhập thì `/` dẫn thẳng vào form đăng nhập — `Login.tsx` không kiểm token sẵn
// có, nó chỉ dựng form. Hai màn lỗi 403/404 (ngoài AppShell, không sidebar) trỏ nút thoát duy nhất
// của mình vào đúng đường đó, nên lối thoát của một ngõ cụt lại là một ngõ cụt khác.
//
// Vì sao quyết định phải nằm SAU `RequireAuth`, không tự đọc store: `session.ts` chỉ khôi phục
// `token` qua một lần tải trang, KHÔNG khôi phục `permissions` (đó là dữ liệu phía server, phải
// hỏi lại `/auth/me`). Một lần mở `/` bằng cách gõ địa chỉ LUÔN LUÔN rơi vào cảnh "có token, chưa
// có quyền", nên bất kỳ phép chọn đích nào đọc `permissions` trước `RequireAuth` cũng chỉ thấy tập
// rỗng. `RequireAuth` đã lo đúng việc đó rồi (nạp lại phiên, hoặc đá về `/login?next=` khi không có
// token) — dùng lại, không chép.
function LoiVao() {
  const quyen = useSession((s) => s.permissions)
  // Quyết theo QUYỀN, cùng nguồn với mục nav Sidebar. `dashboard.view` là thứ phân biệt vai xem
  // tổng hợp với vai chỉ nộp; ai không có nó thì `/reports` là trang họ làm việc.
  return <Navigate to={quyen.has('dashboard.view') ? '/dashboard' : '/reports'} replace />
}

export const routeObjects: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/403', element: <Forbidden /> },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <AppShell>
          <Dashboard />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/reports',
    element: (
      <RequireAuth>
        <AppShell>
          <Reports />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/reports/:id',
    element: (
      <RequireAuth>
        <AppShell>
          <ReportDetail />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/status',
    element: (
      <RequireAuth>
        <AppShell>
          <Status />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/admin/templates',
    element: (
      <RequireAuth>
        <AppShell>
          <QuanTriMau />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/admin/org',
    element: (
      <RequireAuth>
        <AppShell>
          <QuanTriToChuc />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/admin/users',
    element: (
      <RequireAuth>
        <AppShell>
          <QuanTriNguoiDung />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <LoiVao />
      </RequireAuth>
    ),
  },
  { path: '*', element: <NotFound /> },
]

export const router = createBrowserRouter(routeObjects)

export function App({ router: routerDeDung }: { router: ReturnType<typeof createBrowserRouter> }) {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={routerDeDung} />
      </QueryClientProvider>
      <Toast />
    </>
  )
}
