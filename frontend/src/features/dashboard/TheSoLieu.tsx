// frontend/src/features/dashboard/TheSoLieu.tsx
//
// Ba thẻ chỉ số khối lượng dưới panel tối: Tổng giờ công · Near miss · HAZOB card.
// Theo mockup `Redesign shadcn.dc.html` mục 02.
//
// Nhận PHẦN CÒN LẠI của mảng KPI (Dashboard lọc ra, không lọc ở đây) và vẽ theo đúng thứ tự mảng.
// Nhờ vậy một chỉ tiêu MỚI do backend thêm vào vẫn hiện ra ở đây thay vì biến mất — nếu chọn theo
// danh sách mã khoá cứng thì nó lặng lẽ không được vẽ ở đâu cả.
//
// Icon tra theo mã, khớp thì dùng, không khớp thì không vẽ icon — icon là trang trí, không được
// quyết định chỉ tiêu nào hiện.
import { Clock, Radar, ClipboardList } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { formatNumber } from '../../lib/format'
import { useNhaySo } from './useNhaySo'
import type { KpiItem } from './useSummary'

const ICON: Record<string, LucideIcon> = {
  'B-1.4': Clock,
  'B-2.10': Radar,
  'B-2.11': ClipboardList,
}

// Một thẻ = một component vì cái nháy cần hook, và hook không gọi được trong thân `.map()`.
function The({ kpi }: { kpi: KpiItem }) {
  const Icon = ICON[kpi.code]
  // Nháy 600 ms khi con số đổi (D18). Thẻ nền trắng nên dùng bản sáng `.flash` — xem useNhaySo.ts.
  const nhay = useNhaySo(kpi.value)

  return (
    // .flash phải nằm trên phần tử mang NỀN thật (D18/spec §10) — nay là chính Card, không còn
    // <section> tay. mt-1.5 cũ của hai div giá trị bỏ: gap Header→Content đã do Card lo.
    <Card className={nhay ? 'flash' : undefined}>
      <CardHeader>
        <CardTitle>
          <h3 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.02em] text-muted-foreground">
            {Icon && <Icon className="size-4" />}
            {kpi.label}
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {kpi.value === null ? (
          <div
            className="font-mono text-[28px] leading-none tnum text-muted-foreground"
            aria-label="chưa có dữ liệu"
          >
            —
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[28px] leading-none tnum text-foreground">
              {formatNumber(kpi.value, 0)}
            </span>
            <span className="text-[11px] text-muted-foreground">{kpi.unit.toLowerCase()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function TheSoLieu({ kpis }: { kpis: KpiItem[] }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {kpis.map((k) => (
        <The key={k.code} kpi={k} />
      ))}
    </div>
  )
}
