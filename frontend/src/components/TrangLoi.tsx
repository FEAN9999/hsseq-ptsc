// frontend/src/components/TrangLoi.tsx
//
// Khung dùng chung cho hai màn lỗi đứng-một-mình: 403 và 404. Hai trang đó KHÔNG nằm trong
// `AppShell` (xem app/routes.tsx) nên không có sidebar, không có breadcrumb — tức không có một lối
// đi nào ngoài chính cái nút trang này dựng ra. Đó là lý do phần "đi đâu tiếp" ở đây được tính chứ
// không viết cứng.
//
// Bản trước Lát 2 viết cứng `<a href="/">Về trang chủ`. HAI chỗ sai:
//   1. `/` là `<Navigate to="/login">` (routes.tsx), nên một người ĐANG ĐĂNG NHẬP bấm "Về trang
//      chủ" rơi vào FORM ĐĂNG NHẬP — `Login.tsx` không kiểm token sẵn có, nó chỉ dựng form. Lối
//      thoát duy nhất của màn lỗi dẫn thẳng vào một ngõ cụt khác.
//   2. `<a href>` là một lượt tải TÀI LIỆU đầy đủ (chớp trắng, dựng lại toàn bộ store, gọi lại
//      `/auth/me`) cho một đường đi NỘI BỘ — đúng lớp lỗi S1 mà `pages/Reports.tsx` đã bỏ.
//      (Phiên không mất: `session.ts` giữ token trong `sessionStorage`. Nhưng đó là lý do để đường
//      này không đau, không phải lý do để nó đúng.)
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useSession } from '../app/session'
import { Button } from './ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from './ui/empty'

/** Nút đi tiếp: ĐÍCH và NHÃN.
 *
 *  Trang này KHÔNG tự chọn giữa `/dashboard` và `/reports`. Nó không thể: `session.ts` chỉ khôi
 *  phục `token` qua một lần tải trang, `permissions` phải hỏi lại `/auth/me` — mà cả hai màn lỗi
 *  đều nằm NGOÀI `RequireAuth`, tức nơi duy nhất hỏi lại. Một màn lỗi gần như luôn được mở bằng
 *  một lần TẢI TRANG (gõ địa chỉ, hoặc theo một liên kết hỏng), nên đọc `permissions` ở đây thì
 *  gần như luôn thấy tập RỖNG. Bản đầu của Lát 2 làm đúng lỗi đó: nút ghi "Đăng nhập" ngay cạnh
 *  nút "Đổi tài khoản" trên màn của một người đang đăng nhập — đo được trên ảnh chụp thật.
 *
 *  Nên nút chỉ trỏ vào `/` và để LỐI VÀO (app/routes.tsx) quyết định — nó nằm sau `RequireAuth`
 *  nên tới lượt nó thì phiên đã được nạp lại. `token` thì NGƯỢC LẠI: nó sống qua tải trang, nên
 *  vẫn đủ tin để chọn CHỮ trên nút. */
function loiVao(token: string | null): { to: string; nhan: string } {
  return token === null ? { to: '/login', nhan: 'Đăng nhập' } : { to: '/', nhan: 'Về trang chủ' }
}

export function TrangLoi({
  ma,
  tieuDe,
  moTa,
  Icon,
  phu,
}: {
  ma: string
  tieuDe: string
  moTa: string
  Icon: React.ComponentType<{ className?: string }>
  /** Hành động phụ tuỳ trang — chỉ 403 có (đổi tài khoản). */
  phu?: ReactNode
}) {
  const token = useSession((s) => s.token)
  const dich = loiVao(token)

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      {/* `border-0`: `Empty` của shadcn mang sẵn `border-dashed` cho ô trống TRONG một trang. Ở đây
          nó LÀ cả trang, không phải một ô rỗng giữa nội dung khác — một khung đứt nét quanh toàn
          màn hình chỉ làm màn lỗi trông như đang tải dở. */}
      <Empty className="max-w-md border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="size-4" />
          </EmptyMedia>
          {/* Mã lỗi để NHỎ và phụ: nó là thứ người dùng đọc cho người hỗ trợ nghe, không phải thứ
              họ cần đọc trước. Câu tiếng Việt mới là thứ trả lời "chuyện gì đang xảy ra". */}
          <div className="font-mono text-xs tracking-[0.1em] text-muted-foreground">{ma}</div>
          {/* `<h1>` THẬT, không dùng `EmptyTitle`: component đó của shadcn dựng ra một `<div>`
              (`React.ComponentProps<"div">`, không có `asChild`). Ở `pages/Reports.tsx` điều đó
              đúng — ô trống nằm TRONG một trang đã có `<h1>` riêng. Ở đây thì ngược lại: đây LÀ cả
              trang, và bỏ `<h1>` là bỏ luôn danh tính của trang với trình đọc màn hình. Lớp lấy
              theo `<h1>` của các trang khác (Dashboard/Status/Reports), không theo `EmptyTitle`
              (`font-heading text-sm`) — hai màn này là trang đầy đủ, không phải một ô trống. */}
          <h1 className="text-2xl font-medium tracking-[-0.4px] text-foreground">{tieuDe}</h1>
          <EmptyDescription>{moTa}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link to={dich.to}>{dich.nhan}</Link>
          </Button>
          {phu}
        </EmptyContent>
      </Empty>
    </div>
  )
}
