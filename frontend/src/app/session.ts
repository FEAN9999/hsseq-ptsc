// frontend/src/app/session.ts
//
// Store phiên đăng nhập (Zustand). S1b (vòng sửa 1, task-20-fix-1.md): TOKEN sống qua một lần
// TẢI LẠI trang, ghi/đọc qua `sessionStorage` — giới hạn trong MỘT tab, chết khi đóng tab, hẹp
// hơn hẳn `localStorage` (sống qua khởi động lại máy, chia sẻ mọi tab). Đây là điểm cân bằng giữa
// lý do an ninh gốc của Ruling 143 (Task 17, "KHÔNG persist phiên") và sự thật vận hành: Ruling
// 143 từ chối persist với lý do "F5 là tai nạn hiếm", nhưng `Login.tsx` điều hướng sau đăng nhập
// (trước S1a) luôn là MỘT LẦN TẢI LẠI TÀI LIỆU ĐẦY ĐỦ — biến "tai nạn hiếm" thành đường đi bắt
// buộc của 100% lượt đăng nhập, xoá sạch store thuần bộ nhớ ngay sau khi vừa đăng nhập xong (S1).
//
// CHỈ `token` được khôi phục lúc khởi tạo store — KHÔNG khôi phục `user`/`orgUnit`/`permissions`:
// ba thứ đó phải nạp lại từ `GET /auth/me` (RequireAuth, app/router.tsx) vì quyền có thể đã đổi
// phía server giữa hai lần tải trang. `login()` ghi token vào sessionStorage; `logout()` xoá —
// XOÁ TRƯỚC KHI ĐIỀU HƯỚNG là bất biến chung với client.ts (401): logout() không tự điều hướng gì
// (đó là việc của nơi gọi), nhưng phải luôn đưa sessionStorage về sạch, kể cả khi gọi nhiều lần —
// đây cũng là chốt chặn vòng lặp tải lại (task-20-fix-1.md): nếu logout() không xoá sessionStorage,
// một lần 401 ở /auth/me sẽ tải lại trang với TOKEN CŨ vẫn còn trong storage, RequireAuth lại cho
// qua, lại gọi /auth/me, lại 401 — lặp vô hạn.
//
// `login()` nhận nguyên `permissions` dạng mảng (đúng hình dạng JSON của `GET /auth/me`,
// backend/app/api/auth.py) rồi tự đổi thành Set — nơi gọi (trang /login, Task 19) không phải tự
// làm việc đó; AppShell/Sidebar (Task 18) đọc quyền qua `permissions.has(code)`.
//
// `GET /auth/me` trả BỐN khoá top-level NGANG HÀNG: {user, roles, permissions, org_unit} —
// `org_unit` KHÔNG lồng trong `user` (vòng sửa 1 Task 17, F5: bản trước khai lồng, sai, và comment
// cũ còn khẳng định nhầm là đã khớp — xem task-17-fix-brief.md). Ở đây tách đúng: `orgUnit` là
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

const KHOA_TOKEN = 'hseq.token'

export const useSession = create<SessionState>((set) => ({
  token: sessionStorage.getItem(KHOA_TOKEN),
  user: null,
  orgUnit: null,
  permissions: new Set(),
  login: (token, user, orgUnit, permissions) => {
    sessionStorage.setItem(KHOA_TOKEN, token)
    set({ token, user, orgUnit, permissions: new Set(permissions) })
  },
  logout: () => {
    sessionStorage.removeItem(KHOA_TOKEN)
    set({ token: null, user: null, orgUnit: null, permissions: new Set() })
  },
}))
