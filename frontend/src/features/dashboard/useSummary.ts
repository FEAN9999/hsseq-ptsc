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

export function useSummary(period: string) {
  const query = useQuery({
    queryKey: ['dashboard', 'summary', period],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary?period=${period}`),
    placeholderData: keepPreviousData,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
