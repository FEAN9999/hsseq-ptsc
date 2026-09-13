// frontend/src/api/invalidate.ts
import type { QueryClient } from '@tanstack/react-query'

/** Gọi sau MỌI mutation thành công: PUT values, submit, return, approve, reopen, POST /reports.
 *  staleTime 30 s là đủ cho đọc, nhưng lúc demo số phải đổi ngay khi bấm Duyệt. */
export function invalidateReportQueries(qc: QueryClient, reportId?: number | string) {
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['status'] })
  qc.invalidateQueries({ queryKey: ['reports'] })
  if (reportId !== undefined) qc.invalidateQueries({ queryKey: ['report', String(reportId)] })
}
