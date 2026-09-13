// frontend/src/app/router.tsx
//
// Gác đăng nhập cho route cần phiên. Chưa có token: về /login kèm `next=` (đường dẫn + query
// hiện tại) để sau khi đăng nhập quay lại đúng chỗ — cùng quy ước `next=` với client.ts (Task 17
// carry C4 chỉ soi mutation phía client.ts, nhưng đây là chỗ dùng LẠI cùng quy ước nên đổi một
// bên phải soi lại bên kia). Gác PHÂN QUYỀN theo trang (permission code) không phải việc của
// component này — đó là Sidebar (Task 18) ẩn mục không có quyền, và từng trang tự quyết định
// hiện `<Forbidden/>` khi cần.
//
// S1b (vòng sửa 1, task-20-fix-1.md): session.ts giờ khôi phục lại `token` từ sessionStorage lúc
// khởi tạo store (sống qua một lần tải lại trang), nhưng CHỈ token — `user`/`orgUnit`/
// `permissions` luôn null/rỗng cho tới khi nạp lại thật từ server. Component này vì vậy có HAI
// việc thay vì một: (1) có đăng nhập hay chưa (như cũ), và (2) nếu có token mà CHƯA có user (vừa
// "tải lại trang") thì tự gọi GET /auth/me đúng MỘT LẦN để nạp lại phiên đầy đủ, hiện trạng thái
// tải trong lúc chờ — không hiện trang trống, không đá về /login trong lúc chờ.
//
// `dangNapLai` chốt bằng useState(() => …) — tính ĐÚNG MỘT LẦN lúc mount, không đổi lại theo
// render sau (kể cả khi `login()` chạy xong khiến `user` hết null) — effect bên dưới vì vậy chỉ
// chạy đúng một lần (mảng phụ thuộc rỗng), không phụ thuộc giá trị nào đổi theo thời gian.
//
// /auth/me lỗi 401: client.ts (BO_QUA_401 không có '/auth/me') đã tự `logout()` — token trong
// store về null ngay, nhánh `if (!token)` render lại rơi xuống đó, không cần tự điều hướng lần
// hai (tự điều hướng thêm ở đây sẽ ĐUA với `location.assign` của client.ts, không giúp gì thêm).
// Lỗi KHÁC 401 (mất mạng, 500…) thì client.ts không tự logout() — phải tự làm ở đây, nếu không
// sẽ kẹt mãi ở trạng thái "Đang tải…" với một token không dùng được.
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useSession, type SessionOrgUnit, type SessionUser } from './session'

interface MeResponse {
  user: SessionUser
  permissions: string[]
  org_unit: SessionOrgUnit
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useSession((s) => s.token)
  const user = useSession((s) => s.user)
  const location = useLocation()
  const [dangNapLai] = useState(() => token !== null && user === null)

  useEffect(() => {
    if (!dangNapLai) return
    let huy = false
    api
      .get<MeResponse>('/auth/me')
      .then((me) => {
        if (huy) return
        // Đọc lại token từ store (không phải biến đóng gói lúc mount): login() cần đúng access
        // token đang dùng để gắn cùng user/orgUnit/permissions mới nạp.
        const tokenHienTai = useSession.getState().token
        if (tokenHienTai === null) return
        useSession.getState().login(tokenHienTai, me.user, me.org_unit, me.permissions)
      })
      .catch(() => {
        if (!huy) useSession.getState().logout()
      })
    return () => {
      huy = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  if (dangNapLai && user === null) {
    return <div className="p-6 text-table text-sec">Đang tải…</div>
  }

  return <>{children}</>
}
