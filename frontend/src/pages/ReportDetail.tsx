// frontend/src/pages/ReportDetail.tsx
//
// Trang /reports/:id — chỉ lo TẢI dữ liệu và ba trạng thái tải (skeleton / lỗi / có dữ liệu).
// Toàn bộ form nằm ở `features/report/ReportForm`. AppShell/Sidebar bọc ở tầng route
// (app/routes.tsx), giống mọi trang sau RequireAuth khác.
//
// HAI lượt gọi, nối tiếp chứ không song song: danh mục chỉ tiêu lấy theo `header.template_code`
// của chính báo cáo, nên phải có báo cáo trước. Đây cũng là cách duy nhất giữ được ràng buộc
// "không hardcode FM01" (CONTEXT.md) — mẫu thứ hai chạy được mà không sửa dòng nào ở đây.
//
// `queryKey: ['report', String(id)]` khớp đúng khoá mà `invalidateReportQueries` (api/invalidate.ts)
// làm mới sau mọi mutation — lệch khoá thì duyệt xong trang vẫn hiện số cũ.
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { api, ApiError } from '../api/client'
import { useSession } from '../app/session'
import { Card, CardContent } from '../components/ui/card'
import { InlineError } from '../components/ui/InlineError'
import { SkeletonDong } from '../components/ui/SkeletonDong'
import { ReportForm, type ChiTietBaoCao, type MauBaoCao } from '../features/report/ReportForm'

function KhungLoi({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-4 text-center text-sm text-secondary-foreground">{children}</CardContent>
    </Card>
  )
}

export function ReportDetail() {
  const { id } = useParams()
  const coQuyenDuyet = useSession((s) => s.permissions.has('report.approve'))

  const baoCao = useQuery({
    queryKey: ['report', String(id)],
    queryFn: () => api.get<ChiTietBaoCao>(`/reports/${id}`),
    retry: false,
  })
  const mau = useQuery({
    queryKey: ['template', baoCao.data?.header.template_code],
    queryFn: () => api.get<MauBaoCao>(`/templates/${baoCao.data?.header.template_code}`),
    enabled: baoCao.data !== undefined,
    retry: false,
  })

  const loi = baoCao.error ?? mau.error
  if (loi instanceof ApiError && loi.status === 403) {
    return (
      <KhungLoi>
        Bạn không có quyền xem báo cáo này
        <div className="mt-2.5">
          <Link to="/reports" className="text-secondary-foreground font-medium">
            Về báo cáo của đơn vị
          </Link>
        </div>
      </KhungLoi>
    )
  }
  if (loi instanceof ApiError && loi.status === 404) return <KhungLoi>Không tìm thấy báo cáo</KhungLoi>
  // `&& chưa có dữ liệu` KHÔNG thừa (task-23-fix-1 F1): từ Task 23, trang này refetch sau mỗi lần
  // lưu (`invalidateReportQueries`). TanStack Query giữ `error` khi một lượt refetch NỀN hỏng mà
  // `data` cũ vẫn còn nguyên trong cache — kiểm `error` trước `data` sẽ thay cả form bằng
  // `InlineError` vì một cú 502 của Render free, unmount `ReportForm` và xoá sạch reducer, hàng
  // chờ lưu lẫn hẹn debounce. Người đang nhập dở mất hết. Cùng lớp lỗi với Task 20 (`/auth/me`
  // trả 503 lúc Render ngủ dậy làm đăng xuất một phiên còn hợp lệ): LỖI NỀN KHÔNG ĐƯỢC PHÁ MÀN
  // HÌNH ĐANG CÓ DỮ LIỆU. 403/404 ở trên vẫn thay cả trang — chúng là kết luận, không phải trục
  // trặc tạm thời.
  if (loi && (baoCao.data === undefined || mau.data === undefined)) {
    return (
      <InlineError
        message="Không tải được báo cáo"
        onRetry={() => {
          baoCao.refetch()
          mau.refetch()
        }}
      />
    )
  }

  if (baoCao.data === undefined || mau.data === undefined) return <SkeletonDong rows={20} />

  return (
    // `min-h-full` + cột flex: xem chú thích ở `ReportForm` — đây là mắt đầu của chuỗi đẩy thanh
    // thao tác xuống đáy khung nhìn khi tab đang mở có ít nội dung.
    <div className="flex min-h-full flex-col">
      {/* NÚT QUAY LẠI, không phải một vệt breadcrumb thứ hai. Thanh đầu trang của AppShell (Lát 1)
          đã có breadcrumb; vế sau của vệt cũ ("<đơn vị> · <kỳ>") lặp đúng chữ của <h1> ngay dưới
          nó, nên bỏ đi không mất thông tin nào. Chữ của nút vẫn đi theo QUYỀN — người duyệt tới
          đây từ hàng đợi, người nộp tới từ danh sách đơn vị, và nút phải trả họ về đúng chỗ. */}
      <Link
        to="/reports"
        className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        <span>{coQuyenDuyet ? 'Chờ duyệt' : 'Báo cáo của đơn vị'}</span>
      </Link>
      <ReportForm mau={mau.data} chiTiet={baoCao.data} loiLamMoi={loi !== null} />
    </div>
  )
}
