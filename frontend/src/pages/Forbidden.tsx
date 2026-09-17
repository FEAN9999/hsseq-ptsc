// Trang 403 — tài khoản đăng nhập nhưng không đủ quyền xem route hiện tại.
//
// KHÔNG nơi nào trong `src/` điều hướng tới `/403`: mỗi màn tự xử 403 của CHÍNH nó ngay tại chỗ
// (Dashboard.tsx, ReportDetail.tsx) vì ở đó còn biết người dùng vừa định làm gì. Route này là lối
// cuối cho người gõ thẳng địa chỉ — và vì nó không nằm trong `RequireAuth`, người CHƯA đăng nhập
// cũng mở được. Nút đi tiếp phải tự tính theo phiên hiện có, không giả định là có phiên.
import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

import { NUT_PHU, TrangLoi } from '../components/TrangLoi'
import { useSession } from '../app/session'

export function Forbidden() {
  const token = useSession((s) => s.token)
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()

  // Lối thoát THỨ HAI, chỉ có ở 403 và chỉ khi đang có phiên: "không đủ quyền" rất thường là "đang
  // đăng nhập nhầm tài khoản". Không có nó thì người dùng phải tự đoán ra đường đăng xuất — mà
  // đường đó nằm ở chân sidebar, đúng thứ màn này không có.
  return (
    <TrangLoi
      ma="403"
      Icon={ShieldAlert}
      tieuDe="Không có quyền truy cập"
      moTa="Tài khoản của bạn không có quyền xem trang này."
      phu={
        token !== null && (
          <button
            type="button"
            className={NUT_PHU}
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Đổi tài khoản
          </button>
        )
      }
    />
  )
}
