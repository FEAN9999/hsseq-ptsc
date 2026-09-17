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
// "tải lại trang") thì tự gọi GET /auth/me để nạp lại phiên đầy đủ, hiện trạng thái tải trong lúc
// chờ — không hiện trang trống, không đá về /login trong lúc chờ.
//
// `dangNapLai` chốt bằng useState(() => …) — tính ĐÚNG MỘT LẦN lúc mount, không đổi lại theo
// render sau (kể cả khi `login()` chạy xong khiến `user` hết null).
//
// R2 (vòng sửa 2, task-20-fix-2.md): CHỈ đăng xuất khi /auth/me trả lỗi XÁC THỰC (401/403) — MỌI
// lỗi khác (mất mạng, 5xx, parse) phải GIỮ phiên, hiện lỗi tại chỗ kèm nút "Thử lại" gọi lại
// /auth/me. Bản trước bắt MỌI lỗi rồi logout() vô điều kiện: Render free tier ngủ dậy rất hay trả
// 502/503 (client.ts:80 đã ghi rõ điều này), nên một phiên CÒN HẠN bị đăng xuất oan mỗi khi máy chủ
// vừa thức dậy — đúng lúc S1b (sống qua một lần tải lại) cần phát huy tác dụng nhất. 401 (và 403,
// cùng nhóm xác thực) thì khác: client.ts (BO_QUA_401 không có '/auth/me') đã tự logout() ngay khi
// response 401 về tới request() — nhánh 401 dưới đây vì vậy gần như không bao giờ chạy tới trong
// thực tế, nhưng vẫn viết tường minh (không gộp thành "logout mọi lỗi") để người đọc sau thấy đúng
// Ý ĐỊNH: xác thực hỏng thì đăng xuất, còn lại thì không. 403 KHÔNG được client.ts xử lý toàn cục
// (BO_QUA_401 chỉ so 401) nên nhánh này ở /auth/me trả 403 là đường đi DUY NHẤT đăng xuất — không
// phải mã chết.
//
// `lanThu` tăng lên khi bấm "Thử lại" — nằm trong mảng phụ thuộc effect để gọi lại đúng /auth/me;
// `dangNapLai` không đổi sau mount (useState(() => …) ở trên) nên không cần có mặt trong mảng phụ
// thuộc để effect chạy đúng lúc.
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useSession, type SessionOrgUnit, type SessionUser } from './session'
import { InlineError } from '../components/ui/InlineError'

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
  const [loiNapLai, setLoiNapLai] = useState(false)
  const [lanThu, setLanThu] = useState(0)

  useEffect(() => {
    if (!dangNapLai) return
    let huy = false
    api
      .get<MeResponse>('/auth/me')
      .then((me) => {
        if (huy) return
        // Đọc lại token từ store (không phải biến đóng gói lúc mount): login() cần đúng access
        // token đang dùng để gắn cùng user/orgUnit/permissions mới nạp. Guard dưới đây chặn một ca
        // đua hẹp: logout() chạy XEN GIỮA lúc /auth/me đang bay (vd. tab khác đăng xuất) — không có
        // nó, `login(null as string, …)` sẽ ghi user/orgUnit mới lên trên một token đã bị xoá.
        // R4 (vòng sửa 2, task-20-fix-2.md): CỐ Ý không có test runtime riêng cho đúng ca đua này —
        // lý do và đánh đổi ghi ở task-20-report.md mục "Vòng sửa 2" (tóm tắt: TypeScript đã chặn
        // việc xoá dòng dưới một cách im lặng — `login()` đòi `token: string`, không nhận
        // `string | null` — nên phải cố ý thêm ép kiểu mới qua được build; dựng test runtime sạch
        // cho đúng cửa sổ đua này cần promise trì hoãn + sắp lịch act() khá tinh vi cho một tình
        // huống hiếm, ngoài tay người dùng bình thường).
        const tokenHienTai = useSession.getState().token
        if (tokenHienTai === null) return
        useSession.getState().login(tokenHienTai, me.user, me.org_unit, me.permissions)
      })
      .catch((err) => {
        if (huy) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          useSession.getState().logout()
          return
        }
        setLoiNapLai(true)
      })
    return () => {
      huy = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanThu])

  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  if (dangNapLai && loiNapLai) {
    return (
      <div className="p-6">
        <InlineError
          message="Không nạp lại được phiên đăng nhập"
          onRetry={() => {
            setLoiNapLai(false)
            setLanThu((n) => n + 1)
          }}
        />
      </div>
    )
  }

  if (dangNapLai && user === null) {
    return <div className="p-6 text-sm text-muted-foreground">Đang tải…</div>
  }

  return <>{children}</>
}
