// frontend/src/features/dashboard/useSummary.ts
//
// GET /dashboard/summary?period= (Task 13). Cùng khuôn features/reports/useReportList.ts +
// carry C11 (queryKey mảng có `period`, keepPreviousData) — xem useUnits.ts cho phần bình luận đầy
// đủ, không lặp lại ở đây.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

export interface KpiItem {
  code: string
  label: string
  value: number | null
  unit: string
}

export interface MissingUnit {
  code: string
  name: string
}

export interface DashboardSummary {
  period_key: string
  reporting_units: number
  approved_count: number
  submitted_count: number
  missing_units: MissingUnit[]
  kpis: KpiItem[]
}

/** `batDau` (mặc định `true`) và `staleTime` là hai lựa chọn của TỪNG NƠI QUAN SÁT, không đổi hành
 *  vi của nơi khác: TanStack Query v5 tính `staleTime` theo observer, nên Sidebar (Lát 5) đọc cùng
 *  khoá này với `staleTime` dài để không bắn thêm request mỗi lần đổi trang, mà Dashboard vẫn giữ
 *  nguyên nếp làm mới của nó. `batDau: false` cho người KHÔNG có `dashboard.view` — không có nó,
 *  Sidebar sẽ bắn một lượt 403 cho mọi người nộp, mỗi lần mở bất kỳ trang nào. */
export function useSummary(period: string, { batDau = true, staleTime }: { batDau?: boolean; staleTime?: number } = {}) {
  const query = useQuery({
    queryKey: ['dashboard', 'summary', period],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary?period=${period}`),
    placeholderData: keepPreviousData,
    enabled: batDau,
    // `staleTime` CHỈ được đặt khi nơi gọi THẬT SỰ truyền. Một khoá `staleTime: undefined` nằm sẵn
    // trong object vẫn GHI ĐÈ mặc định 30s của app/queryClient.ts — TanStack trải options lên
    // defaultOptions, nên `undefined` là một GIÁ TRỊ, không phải "không có" — và query rơi về
    // stale-ngay, làm mọi lần mount lại Dashboard bắn thêm một lượt `/dashboard/summary`.
    // Đo được, không suy đoán: e2e `Q1 — duyệt xong, dashboard đổi 21→22` đỏ ở CẢ HAI khung nhìn
    // ngay khi tham số này ra đời, vì tiền đề "cache còn tươi qua một vòng điều hướng" của nó gãy.
    ...(staleTime === undefined ? {} : { staleTime }),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    // Vòng sửa 1 (task-25-fix-1.md A4): Dashboard.tsx cần phân biệt 403 (thiếu dashboard.view)
    // với lỗi khác — `isError` (boolean) không đủ, phải có chính đối tượng lỗi để đọc `.status`.
    error: query.error,
    refetch: query.refetch,
  }
}
