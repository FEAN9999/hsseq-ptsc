// frontend/src/features/reports/useReportList.ts
//
// Dữ liệu cho /reports (Task 20) — GET /reports luôn kèm `template=FM01` (carry C1: thiếu tham
// số này FastAPI trả 422, không phải danh sách rỗng — backend/app/api/reports.py:48).
//
// Hình dạng `ReportListItem` chép nguyên `backend/app/schemas/report.py:23` (carry C2/C7):
// `id`/`state`/`source`/`is_late`/`updated_at`/`decision_note` là `null` khi đây là kỳ đang mở mà
// đơn vị (reporter) chưa tạo báo cáo — dòng vẫn hiện để bấm "Tạo báo cáo", không tự tạo nháp.
// KHÔNG có trường `is_open` — carry C7 gọi đó là "trường ma": chỉ tồn tại trên
// GET /templates/{code}/periods, API này không bao giờ gửi.
//
// `isAdmin` gộp CẢ `report.approve` (admin_atcl, duyệt được) lẫn `report.view_all` (viewer, chỉ
// xem — Ruling 169/170 trong progress.md): server `pham_vi_bao_cao` trả `None` cho cả hai quyền
// này (backend/app/api/deps.py), tức CẢ HAI nhận đúng một hình dạng dữ liệu từ `liet_ke_bao_cao`
// (danh sách báo cáo ĐÃ TỒN TẠI, không có dòng "chưa tạo" tổng hợp) — khác hẳn nhánh
// `report.view_own_unit` (reporter). Không mockup nào vẽ riêng vai viewer; gộp chung "hàng đợi"
// là quyết định của task này, ghi trong task-20-report.md.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useSession } from '../../app/session'

export interface OrgUnitBrief {
  code: string
  name: string
}

export interface ReportListItem {
  id: number | null
  period_key: string
  org_unit: OrgUnitBrief
  state: string | null
  source: string | null
  is_late: boolean | null
  due_at: string
  updated_at: string | null
  decision_note: string | null
}

// Giảm dần theo period_key — chuỗi "YYYY-MM" so chuỗi cho đúng thứ tự lịch, không cần parse ngày
// (carry C7, quy tắc 2: "kỳ đang mở xếp trên kỳ cũ"). Hoà kỳ (nhiều đơn vị cùng kỳ ở hàng đợi
// admin) thì xếp theo mã đơn vị tăng dần cho bảng dễ đọc, ổn định — không mockup/carry nào định
// nghĩa thứ tự này nhưng reporter không bao giờ hoà (mỗi kỳ một dòng) nên tiêu chí phụ chỉ ảnh
// hưởng bảng admin.
function soSanh(a: ReportListItem, b: ReportListItem): number {
  if (a.period_key !== b.period_key) return a.period_key > b.period_key ? -1 : 1
  return a.org_unit.code.localeCompare(b.org_unit.code)
}

export function useReportList() {
  const permissions = useSession((s) => s.permissions)
  const isAdmin = permissions.has('report.approve') || permissions.has('report.view_all')
  const [xemTatCa, setXemTatCa] = useState(false)
  const locTheoSubmitted = isAdmin && !xemTatCa

  const query = useQuery({
    queryKey: ['reports', 'FM01', locTheoSubmitted ? 'submitted' : 'all'],
    queryFn: () => {
      const params = new URLSearchParams({ template: 'FM01' })
      if (locTheoSubmitted) params.set('state', 'submitted')
      return api.get<ReportListItem[]>(`/reports?${params.toString()}`)
    },
  })

  const items = [...(query.data ?? [])].sort(soSanh)

  return {
    items,
    isAdmin,
    xemTatCa,
    setXemTatCa,
    isLoading: query.isLoading,
    // Vòng sửa 2 Task 25 (task-25-fix-2.md P1b, task-25-rereview-1.md B-01/M-01): CÙNG LỚP LỖI đã
    // vá ở Dashboard.tsx và ReportDetail.tsx (task-23-fix-1 F1) — LỖI NỀN KHÔNG ĐƯỢC PHÁ MÀN HÌNH
    // ĐANG CÓ DỮ LIỆU (Task 20: /auth/me 503 đăng xuất một phiên còn hợp lệ; Task 23: refetch nền
    // hỏng xoá sạch reducer). `Reports.tsx` chỉ đọc `isError` (boolean) để quyết định thay cả danh
    // sách bằng `InlineError` — một lượt `refetchOnWindowFocus` hỏng khi `data` cũ còn nguyên
    // trong cache vẫn làm `query.isError = true`, xoá mất danh sách ĐANG ĐÚNG trên màn hình. Gấp
    // điều kiện `&& data === undefined` NGAY ở ĐÂY (không phải ở `Reports.tsx`) để trang giữ nguyên
    // ý nghĩa "isError" = "không có gì để hiện" — `Reports.tsx` không cần đổi dòng nào.
    isError: query.isError && query.data === undefined,
    refetch: query.refetch,
  }
}
