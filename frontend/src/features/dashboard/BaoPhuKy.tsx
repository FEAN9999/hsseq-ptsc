// frontend/src/features/dashboard/BaoPhuKy.tsx
//
// Lưới "Bao phủ kỳ" — một ô vuông cho mỗi đầu mối, màu theo trạng thái báo cáo của kỳ đang xem.
// Theo mockup `Redesign shadcn.dc.html` mục 02.
//
// KHÔNG lặp lại các con số đã có trên dòng Coverage ngay phía trên (D9: "ai chưa nộp" nói đúng MỘT
// lần trên trang). Lưới này trả lời câu khác: ĐƠN VỊ NÀO đang ở trạng thái nào, đọc được trong một
// cái liếc.
//
// Màu lấy từ token ngữ nghĩa, không phải màu tự chế: đã duyệt = success, chờ duyệt/nộp muộn =
// warning, trả lại = destructive, chưa nộp = viền trơn. Chữ trên nền warning là MỰC
// (`--secondary-foreground`) chứ không phải trắng — trắng trên nền đó chỉ 3,77:1, trượt AA
// (spec §4 mục 2).
import { LayoutGrid, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { UnitRow } from './useUnits'

/** Trạng thái báo cáo → lớp nền/chữ của ô vuông. */
function lopO(state: string | null): string {
  switch (state) {
    case 'approved':
      return 'bg-success text-white border-transparent'
    case 'submitted':
    case 'late':
      return 'bg-warning text-secondary-foreground border-transparent'
    case 'returned':
      return 'bg-destructive text-white border-transparent'
    case 'draft':
      return 'bg-muted text-sec border-border'
    default:
      // Chưa nộp: ô rỗng có viền — cố ý KHÔNG tô màu, để mắt bắt ngay chỗ trống trong dải.
      return 'bg-card text-sec border-border'
  }
}

export function BaoPhuKy({ units, period }: { units: UnitRow[]; period: string }) {
  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LayoutGrid className="size-4" />
          Bao phủ kỳ
        </h2>
        <Link
          to={`/status?period=${period}`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] font-medium text-secondary-foreground hover:bg-muted"
        >
          Tình trạng nộp
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {units.map((u) => (
          <li key={u.org_unit.code}>
            <span
              // `title` mang tên đầy đủ: ô vuông chỉ đủ chỗ cho mã đơn vị.
              title={`${u.org_unit.code} — ${u.org_unit.name}`}
              className={`flex h-7 min-w-11 items-center justify-center rounded-md border px-1.5 font-mono text-[11px] tnum ${lopO(u.state)}`}
            >
              {u.org_unit.code}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
