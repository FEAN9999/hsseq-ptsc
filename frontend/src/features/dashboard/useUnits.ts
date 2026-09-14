// frontend/src/features/dashboard/useUnits.ts
//
// GET /dashboard/units?period= (Task 13 + Task 25 carry C1: report_id thêm vào để bảng bấm được
// sang báo cáo gốc). Cùng khuôn features/reports/useReportList.ts: useQuery + queryKey mảng có
// `period` (carry C11 — thiếu period trong key thì đổi kỳ dùng lại cache kỳ cũ) + api.get<T>().
//
// `placeholderData: keepPreviousData` (TanStack v5) — đổi kỳ giữ bảng cũ trong lúc tải kỳ mới,
// không nháy skeleton (task-25-brief.md Step 1, ca "đổi kỳ giữ dữ liệu cũ").
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

export interface UnitRow {
  org_unit: { code: string; name: string }
  gio_cong: number | null
  lti: number | null
  fat: number | null
  near_miss: number | null
  hazob: number | null
  gio_an_toan_tu_lti_cuoi: number | null
  state: string | null
  report_id: number | null
}

export function useUnits(period: string) {
  const query = useQuery({
    queryKey: ['dashboard', 'units', period],
    queryFn: () => api.get<UnitRow[]>(`/dashboard/units?period=${period}`),
    placeholderData: keepPreviousData,
  })

  return {
    items: query.data ?? [],
    // Vòng sửa 2 (task-25-fix-2.md P1/B-01): `items` đã mặc định `[]` nên không đủ để Dashboard.tsx
    // phân biệt "chưa có dữ liệu" với "mảng rỗng thật" — cần `data` THÔ (chỉ `undefined` trước lần
    // tải thành công ĐẦU TIÊN; sau đó `keepPreviousData` giữ nó có giá trị mãi, kể cả khi một lượt
    // refetch nền hỏng) để ghép cùng `isError` chặn lỗi nền phá màn hình đang có dữ liệu.
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    // Vòng sửa 1 (task-25-fix-1.md A4) — cùng lý do useSummary.ts: cần đối tượng lỗi để Dashboard
    // phân biệt 403 với lỗi khác.
    error: query.error,
    refetch: query.refetch,
  }
}
