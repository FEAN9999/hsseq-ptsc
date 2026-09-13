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
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { api, ApiError } from '../api/client'
import { useSession } from '../app/session'
import { InlineError } from '../components/ui/InlineError'
import { Skeleton } from '../components/ui/Skeleton'
import { ReportForm, type ChiTietBaoCao, type MauBaoCao } from '../features/report/ReportForm'
import { formatPeriod } from '../lib/format'

function KhungLoi({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">{children}</div>
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
          <Link to="/reports" className="text-soot font-medium">
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

  if (baoCao.data === undefined || mau.data === undefined) return <Skeleton rows={20} />

  return (
    <div>
      <div className="text-xs text-sec mb-1.5">
        <Link to="/reports" className="text-sec no-underline">
          {coQuyenDuyet ? 'Chờ duyệt' : 'Báo cáo của đơn vị'}
        </Link>{' '}
        ›{' '}
        <b className="font-medium text-soot">
          {baoCao.data.header.org_unit.name} · {formatPeriod(baoCao.data.header.period_key)}
        </b>
      </div>
      <ReportForm mau={mau.data} chiTiet={baoCao.data} loiLamMoi={loi !== null} />
    </div>
  )
}
