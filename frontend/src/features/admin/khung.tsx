// frontend/src/features/admin/khung.tsx
//
// Phần dùng chung của BA màn quản trị (Mẫu báo cáo · Tổ chức · Người dùng, Lát 8). Ba màn có cùng
// hình dạng: một tiêu đề kèm phụ đề đếm số, rồi một khối dữ liệu tải từ MỘT endpoint. Gom ở đây vì
// vế "khối dữ liệu" mang theo một LUẬT đã phải học ba lần trong dự án này (Ruling 34x/Lát 4/Lát 5,
// xem Status.tsx): **một lỗi Ở NỀN không được xoá màn hình đang có dữ liệu đúng**. Viết lại luật ấy
// ở ba trang là ba cơ hội để quên nó ở một trang.
//
// KHÔNG gom phần bảng: ba màn có ba bảng khác hẳn nhau (kỳ có nút bấm, tổ chức là cây, người dùng có
// avatar + huy hiệu vai). Gom chúng sẽ đẻ ra một component nhận mười prop để rồi mỗi nơi dùng một
// nửa — đúng thứ CLAUDE.md #2 cấm.
import type { ReactNode } from 'react'

import { ApiError } from '../../api/client'
import { Card, CardContent } from '../../components/ui/card'
import { InlineError } from '../../components/ui/InlineError'
import { SkeletonDong } from '../../components/ui/SkeletonDong'

/** Lớp ô của bảng quản trị — chỉ còn phần `TableCell`/`TableHead` (components/ui/table.tsx) KHÔNG
 *  tự có: cỡ ô của kho (`h-9 px-3 py-0`, thay `h-10 px-2`/`p-2` mặc định) và màu/cỡ chữ đầu cột.
 *  `cn` là tailwind-merge nên lớp truyền vào thắng lớp nền của primitive.
 *
 *  `py-0` phải NÓI RA, không thừa: `TableCell` nền là `p-2`, mà tailwind-merge chỉ gỡ `p-2` khi
 *  gặp lại đúng `p-*` — `px-3` chỉ đè được bề NGANG, nên 8px đệm trên/dưới của `p-2` lọt vào một
 *  ô vốn chỉ cao theo `h-9`. Đo trên trình duyệt thật: dòng có chip/hai dòng chữ cao thêm tới
 *  16px. Ô nào thật sự cần đệm dọc vẫn tự thêm (`py-2` ở ô Tài khoản của QuanTriNguoiDung.tsx).
 *
 *  Hai thứ đã BỎ, không phải quên:
 *  · `whitespace-nowrap` — `TableCell`/`TableHead` đã cấp sẵn. Lý do cũ còn nguyên giá trị: cả ba
 *    bảng đều có cột mã/ngày không được xuống dòng ở 1024 zoom 125% (bài học Lát 6: hàng hai dòng
 *    so le đọc như dữ liệu hỏng). Ô nào cần xuống dòng vẫn tự thêm `whitespace-normal` tại chỗ.
 *  · `border-b border-border` — viền hàng chuyển từ Ô sang DÒNG: `TableRow` mang `border-b`, còn
 *    `TableBody` mang `[&_tr:last-child]:border-0` nên dòng cuối tự hết viền. Giữ cả hai chỗ là
 *    viền đôi. `text-left`/`font-medium` của đầu cột cũng do `TableHead` lo. */
export const O_BANG = 'h-9 px-3 py-0 text-sm'
export const O_TIEU_DE = 'h-9 px-3 bg-muted text-[13.5px] text-sec font-semibold'

export function TieuDeQuanTri({
  tieuDe,
  phuDe,
}: {
  tieuDe: string
  /** Câu đếm/giải thích dưới tiêu đề. `null` trong lúc chưa có số — KHÔNG in "0 ..." khi chưa
   *  biết, vì một con số sai còn tệ hơn một dòng trống. */
  phuDe?: string | null
}) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-medium tracking-[-0.4px] text-foreground">{tieuDe}</h1>
      {phuDe && <p className="mt-1 text-sm text-muted-foreground">{phuDe}</p>}
    </div>
  )
}

/** Hình dạng TỐI THIỂU của một `useQuery` mà vùng này cần — nhận kiểu cấu trúc thay vì
 *  `UseQueryResult<T>` để không phải kéo generic qua mọi nơi gọi. */
export interface KetQuaTai {
  data: unknown
  error: unknown
  isLoading: boolean
  refetch: () => unknown
}

export function VungDuLieu({
  q,
  soDong = 8,
  children,
}: {
  q: KetQuaTai
  soDong?: number
  children: ReactNode
}) {
  // 403 được thay VÔ ĐIỀU KIỆN, kể cả khi đã có dữ liệu: nó là KẾT LUẬN, không phải trục trặc tạm
  // (cùng luật với pages/Status.tsx). Ba màn này nằm sau `RequireAuth` nhưng KHÔNG sau một lớp gác
  // quyền nào — mục nav ẩn theo quyền, còn gõ thẳng địa chỉ thì vào được, và câu trả lời phải là
  // một câu tiếng Việt chứ không phải một khung trống.
  if (q.error instanceof ApiError && q.error.status === 403) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-sm text-secondary-foreground">
          Bạn không có quyền quản trị mục này
        </CardContent>
      </Card>
    )
  }
  // `q.data === undefined` bắt buộc: `refetchOnWindowFocus` bật toàn cục, nên một lượt làm mới nền
  // hỏng KHÔNG được xoá bảng đang hiển thị đúng.
  if (q.error && q.data === undefined) {
    return <InlineError message="Không tải được dữ liệu" onRetry={() => q.refetch()} />
  }
  if (q.isLoading) {
    return (
      <div data-testid="skeleton">
        <SkeletonDong rows={soDong} />
      </div>
    )
  }
  return <>{children}</>
}
