// frontend/src/app/router.tsx
//
// Gác đăng nhập cho route cần phiên. Chưa có token: về /login kèm `next=` (đường dẫn + query
// hiện tại) để sau khi đăng nhập quay lại đúng chỗ — cùng quy ước `next=` với client.ts (Task 17
// carry C4 chỉ soi mutation phía client.ts, nhưng đây là chỗ dùng LẠI cùng quy ước nên đổi một
// bên phải soi lại bên kia). Gác PHÂN QUYỀN theo trang (permission code) không phải việc của
// component này — đó là Sidebar (Task 18) ẩn mục không có quyền, và từng trang tự quyết định
// hiện `<Forbidden/>` khi cần; ở đây chỉ có MỘT việc: có đăng nhập hay chưa.
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from './session'

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useSession((s) => s.token)
  const location = useLocation()

  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return <>{children}</>
}
