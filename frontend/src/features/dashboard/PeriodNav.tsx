// frontend/src/features/dashboard/PeriodNav.tsx
//
// Điều hướng kỳ `‹ 07/2026 · 08/2026 · 09/2026 ›` (mockup dashboard.html `.pnav`). Không có
// endpoint liệt kê "kỳ có báo cáo hoặc đang mở" nên đơn giản hoá: luôn cho phép lùi/tiến đúng một
// tháng lịch từ kỳ hiện tại — Dashboard.tsx nêu rõ đây là lựa chọn đơn giản hơn so với mockup
// (xem task-25-report.md mục "khác brief").
import { formatPeriod } from '../../lib/format'

// Cộng/trừ đúng `delta` tháng lịch cho khoá "YYYY-MM" — Date.UTC thuần số (không qua timezone) vì
// khoá kỳ chỉ là nhãn tháng, không mang giờ.
function congThang(period: string, delta: number): string {
  const [nam, thang] = period.split('-').map(Number)
  const d = new Date(Date.UTC(nam, thang - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function PeriodNav({ period, onChange }: { period: string; onChange: (period: string) => void }) {
  const truoc = congThang(period, -1)
  const sau = congThang(period, 1)

  return (
    <div className="inline-flex items-center gap-2 text-table">
      <button type="button" onClick={() => onChange(truoc)} className="text-soot bg-transparent border-0 px-1.5 py-1 cursor-pointer">
        ‹ {formatPeriod(truoc)}
      </button>
      <span className="font-medium border border-hair bg-surface rounded-input px-2.5 py-1">
        {formatPeriod(period)}
      </span>
      <button type="button" onClick={() => onChange(sau)} className="text-soot bg-transparent border-0 px-1.5 py-1 cursor-pointer">
        {formatPeriod(sau)} ›
      </button>
    </div>
  )
}
