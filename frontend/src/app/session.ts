// frontend/src/app/session.ts
//
// Store phiên đăng nhập (Zustand, thuần bộ nhớ — không persist qua localStorage: brief/carry
// Task 17 không yêu cầu, và test client.test.ts thao tác trực tiếp qua getState()/setState()
// với store thuần). `login()` nhận nguyên `permissions` dạng mảng (đúng hình dạng JSON của
// `GET /auth/me`, backend/app/api/auth.py) rồi tự đổi thành Set — nơi gọi (trang /login, Task 19)
// không phải tự làm việc đó; AppShell/Sidebar (Task 18) đọc quyền qua `permissions.has(code)`.
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
  org_unit: SessionOrgUnit
}

interface SessionState {
  token: string | null
  user: SessionUser | null
  permissions: Set<string>
  login: (token: string, user: SessionUser, permissions: string[]) => void
  logout: () => void
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  user: null,
  permissions: new Set(),
  login: (token, user, permissions) => set({ token, user, permissions: new Set(permissions) }),
  logout: () => set({ token: null, user: null, permissions: new Set() }),
}))
