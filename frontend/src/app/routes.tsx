// frontend/src/app/routes.tsx
//
// C7 (task-19-carry.md): bảng route của toàn ứng dụng — không task nào trong plan dựng nó, không
// task nào sửa main.tsx sau Task 15. Chỉ khai đúng những trang ĐÃ CÓ THẬT lúc này, đừng khai
// trước trang chưa xây (mã đầu cơ, trái CLAUDE.md #2):
//   /login    → <Login/>   — KHÔNG bọc RequireAuth, KHÔNG bọc AppShell
//   /403      → <Forbidden/>
//   /reports  → <Reports/>, bọc <RequireAuth><AppShell>…</AppShell></RequireAuth> (Task 20, C3)
//   /reports/:id → <ReportDetail/>, bọc y hệt (Task 22, task-22-carry.md C6)
//   /         → điều hướng về /login
//   *         → <NotFound/>
// Task sau (thêm /dashboard, /status) sẽ nối tiếp vào CHÍNH mảng `routeObjects`
// này, mỗi trang bọc <RequireAuth><AppShell>…</AppShell></RequireAuth> (xem RequireAuth ở
// ./router).
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
import { AppShell } from '../components/AppShell'
import { Login } from '../pages/Login'
import { Forbidden } from '../pages/Forbidden'
import { NotFound } from '../pages/NotFound'
import { Reports } from '../pages/Reports'
import { ReportDetail } from '../pages/ReportDetail'
import { Dashboard } from '../pages/Dashboard'

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
  { path: '/', element: <Navigate to="/login" replace /> },
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
