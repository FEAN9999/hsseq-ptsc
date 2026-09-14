// frontend/src/pages/Dashboard.tsx
//
// Trang /dashboard?period= — trang đầu tiên Trưởng/Phó Ban ATCL nhìn thấy (task-25-brief.md).
// AppShell/Sidebar KHÔNG render ở đây — bọc ở tầng route (app/routes.tsx), giống mọi trang sau
// RequireAuth khác (carry C6).
//
// Thứ tự khối đúng mockup (~/.gstack/.../design-review-20260909/dashboard.html, task-25-brief.md
// Step 2): tiêu đề + điều hướng kỳ → thanh coverage (nói "ai chưa nộp" một lần duy nhất) → 6 KPI
// lưới 3×2 → bảng 22 đơn vị 8 cột.
//
// Không có endpoint "kỳ gần nhất có báo cáo" (chỉ có /dashboard/summary, /dashboard/units — cả hai
// đòi `period` bắt buộc, carry C2) nên khi URL chưa có `?period=` thì dùng hằng số KY_MAC_DINH —
// đơn giản hơn hẳn so với gọi thêm API chỉ để suy ra kỳ mặc định (xem task-25-report.md mục "khác
// brief").
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { InlineError } from '../components/ui/InlineError'
import { Skeleton } from '../components/ui/Skeleton'
import { Coverage } from '../features/dashboard/Coverage'
import { KpiTile } from '../features/dashboard/KpiTile'
import { PeriodNav } from '../features/dashboard/PeriodNav'
import { UnitsTable } from '../features/dashboard/UnitsTable'
import { useSummary } from '../features/dashboard/useSummary'
import { useUnits } from '../features/dashboard/useUnits'

const KY_MAC_DINH = '2026-08'

function TieuDe({ period, onChange }: { period: string; onChange: (period: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <h1 className="text-pageTitle font-medium text-ink">Dashboard SKATMT</h1>
      <PeriodNav period={period} onChange={onChange} />
    </div>
  )
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = searchParams.get('period') ?? KY_MAC_DINH
  const doiKy = (p: string) => setSearchParams({ period: p }, { replace: true })

  const summary = useSummary(period)
  const units = useUnits(period)

  // Vòng sửa 1 (task-25-fix-1.md A4, review mục 3/12): vai `reporter` không có `dashboard.view`
  // (seed/__init__.py:70) nên đây là đường đi tới được thật — gõ thẳng /dashboard nhận một câu
  // sai nguyên nhân ("Không tải được dữ liệu" + Thử lại lặp vô ích mãi mãi) nếu không tách riêng.
  // Khuôn giống hệt ReportDetail.tsx:46 (403 → câu "không có quyền" + lối thoát), không phát minh
  // khuôn thứ hai.
  const loi403 =
    summary.error instanceof ApiError && summary.error.status === 403
      ? summary.error
      : units.error instanceof ApiError && units.error.status === 403
        ? units.error
        : null
  if (loi403) {
    return (
      <div>
        <TieuDe period={period} onChange={doiKy} />
        <div className="border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">
          Bạn không có quyền xem dashboard này
          <div className="mt-2.5">
            <Link to="/reports" className="text-soot font-medium">
              Về báo cáo của đơn vị
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (summary.isError || units.isError) {
    return (
      <div>
        <TieuDe period={period} onChange={doiKy} />
        <InlineError
          message="Không tải được dữ liệu"
          onRetry={() => {
            summary.refetch()
            units.refetch()
          }}
        />
      </div>
    )
  }

  if (summary.isLoading || units.isLoading || summary.data === undefined) {
    return (
      <div>
        <TieuDe period={period} onChange={doiKy} />
        <div data-testid="skeleton">
          <Skeleton rows={10} />
        </div>
      </div>
    )
  }

  const data = summary.data
  return (
    <div>
      <TieuDe period={period} onChange={doiKy} />
      <Coverage
        periodKey={data.period_key}
        reportingUnits={data.reporting_units}
        approvedCount={data.approved_count}
        submittedCount={data.submitted_count}
        missingUnits={data.missing_units}
      />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {data.kpis.map((k) => (
          <KpiTile
            key={k.code}
            code={k.code}
            label={k.label}
            unit={k.unit}
            value={data.approved_count === 0 ? null : k.value}
          />
        ))}
      </div>
      <UnitsTable rows={units.items} period={period} />
    </div>
  )
}
