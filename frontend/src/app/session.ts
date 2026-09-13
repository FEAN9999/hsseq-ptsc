// frontend/src/app/session.ts
//
// Store phiên đăng nhập (Zustand, thuần bộ nhớ — không persist qua localStorage: brief/carry
// Task 17 không yêu cầu, và test client.test.ts thao tác trực tiếp qua getState()/setState()
// với store thuần). `login()` nhận nguyên `permissions` dạng mảng (đúng hình dạng JSON của
// `GET /auth/me`, backend/app/api/auth.py) rồi tự đổi thành Set — nơi gọi (trang /login, Task 19)
// không phải tự làm việc đó; AppShell/Sidebar (Task 18) đọc quyền qua `permissions.has(code)`.
//
// `GET /auth/me` trả BỐN khoá top-level NGANG HÀNG: {user, roles, permissions, org_unit} —
// `org_unit` KHÔNG lồng trong `user` (vòng sửa 1, F5: bản trước khai lồng, sai, và comment cũ
// còn khẳng định nhầm là đã khớp — xem task-17-fix-brief.md). Ở đây tách đúng: `orgUnit` là
// trường RIÊNG trong store, `login()` nhận nó như THAM SỐ RIÊNG — nơi gọi (Task 19) truyền
// thẳng `res.user`, `res.org_unit`, `res.permissions`, không phải tự ghép lại rồi mới truyền.
// `roles` CỐ Ý không đưa vào store: không nơi nào (Task 18 Sidebar, hay bất kỳ trang nào) đọc
// vai trò trực tiếp, mọi quyết định hiển thị đều qua `permissions` — bỏ có chủ đích, không phải
// quên.
import { create } from 'zustand'

export interface SessionOrgUnit {
  id: number
  code: string
  name: string
}

export interface SessionUser {
  id: number
  email: string
  full_name: string
  position: string | null
}

interface SessionState {
  token: string | null
  user: SessionUser | null
  orgUnit: SessionOrgUnit | null
  permissions: Set<string>
  login: (token: string, user: SessionUser, orgUnit: SessionOrgUnit, permissions: string[]) => void
  logout: () => void
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  user: null,
  orgUnit: null,
  permissions: new Set(),
  login: (token, user, orgUnit, permissions) =>
    set({ token, user, orgUnit, permissions: new Set(permissions) }),
  logout: () => set({ token: null, user: null, orgUnit: null, permissions: new Set() }),
}))
