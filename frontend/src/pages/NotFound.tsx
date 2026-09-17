// Trang 404 — route không khớp bất kỳ path nào. Ngoài `AppShell` (app/routes.tsx) và ngoài
// `RequireAuth`, nên cũng phải chạy được cho người chưa đăng nhập: xem `TrangLoi.tsx`.
import { FileQuestion } from 'lucide-react'

import { TrangLoi } from '../components/TrangLoi'

export function NotFound() {
  return (
    <TrangLoi
      ma="404"
      Icon={FileQuestion}
      tieuDe="Không tìm thấy trang"
      moTa="Đường dẫn này không tồn tại hoặc đã bị xoá."
    />
  )
}
