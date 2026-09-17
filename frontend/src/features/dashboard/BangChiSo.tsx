// frontend/src/features/dashboard/BangChiSo.tsx
//
// Panel "Chỉ số an toàn" nền tối — khối nổi bật nhất của /dashboard, theo mockup
// `Redesign shadcn.dc.html` mục 02.
//
// Panel này KHÔNG chọn chỉ tiêu theo mã: nó nhận thẳng mảng KPI đã lọc từ Dashboard và vẽ theo
// ĐÚNG thứ tự mảng (carry C2 — FE không sắp lại lưới, không khoá cứng nhãn). Mockup vẽ bốn ô; ở
// đây là ba, vì ô thứ tư của mockup là "Giờ công an toàn không LTI" (chỉ tiêu B-1.5) mà
// `/dashboard/summary` KHÔNG trả — bộ `_KPI` của backend chỉ có sáu mã. Cộng dồn cột
// `gio_an_toan_tu_lti_cuoi` của từng đơn vị không ra được con số đó (mỗi đơn vị đếm từ mốc LTI
// riêng). Ba ô thật hơn bốn ô có một ô bịa.
import { ShieldCheck, Check } from 'lucide-react'

import { formatNumber } from '../../lib/format'
import { useNhaySo } from './useNhaySo'
import type { KpiItem } from './useSummary'

/** Chỉ tiêu DUY NHẤT được liệt mã đơn vị ở dòng phụ: `DON_VI_CO_LTI` — giá trị của nó CHÍNH LÀ số
 *  phần tử trong danh sách đó, nên danh sách là phần diễn giải của chính con số. Ô "LTI trong kỳ"
 *  từng liệt cùng danh sách ấy và in ra y hệt ô bên cạnh — một thông tin, hai chỗ, không chỗ nào
 *  đúng hơn chỗ nào. "Đơn vị nào có LTI" hỏi tiếp ở lưới Bao phủ kỳ và cột LTI của bảng. */
const MA_KEM_DON_VI = 'DON_VI_CO_LTI'

function O({
  nhan,
  gia,
  donVi,
  canhBao,
  maDonVi,
}: {
  nhan: string
  gia: number | null
  donVi: string
  canhBao: boolean
  maDonVi: string[]
}) {
  // Nháy 600 ms khi con số đổi (D18). `.flash-toi` chứ không phải `.flash`: bản sáng kết ở nền
  // trắng, trên panel tối nó sẽ nháy NGƯỢC — xem useNhaySo.ts.
  const nhay = useNhaySo(gia)

  return (
    <div
      className={`flex-1 border-l border-white/10 px-5 py-4 first:border-l-0${nhay ? ' flash-toi' : ''}`}
    >
      <div className="text-[12px] font-medium uppercase tracking-[0.02em] text-on-dark">{nhan}</div>
      {gia === null ? (
        <div
          className="mt-1.5 font-mono text-[40px] leading-none tnum text-on-dark"
          aria-label="chưa có dữ liệu"
        >
          —
        </div>
      ) : (
        <div className="mt-1.5 flex items-baseline gap-1.5">
          {/* `text-danger-on-dark` chứ KHÔNG phải `text-destructive`: --destructive trên
              --dark-panel đo ra 1,74:1 — gần như vô hình. Token này cho 5,40:1 (index.css). */}
          <span
            className={`font-mono text-[40px] leading-none tnum ${
              canhBao ? 'text-danger-on-dark' : 'text-white'
            }`}
          >
            {formatNumber(gia, 0)}
          </span>
          <span className="text-[11px] text-on-dark">{donVi}</span>
        </div>
      )}
      <div className="mt-2 text-xs">
        {gia === 0 ? (
          <span className="flex items-center gap-1 text-on-dark">
            <Check className="size-3.5" /> Đang ở mức 0
          </span>
        ) : maDonVi.length > 0 ? (
          <span className="text-on-dark">{maDonVi.join(' · ')}</span>
        ) : null}
      </div>
    </div>
  )
}

export function BangChiSo({ kpis, maCoLti }: { kpis: KpiItem[]; maCoLti: string[] }) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl bg-dark-panel text-white">
      <div className="px-5 pt-4 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4" />
          Chỉ số an toàn
        </h2>
        <p className="mt-0.5 text-xs text-on-dark">Ba chỉ số có mục tiêu bằng 0</p>
      </div>
      <div className="flex flex-wrap border-t border-white/10">
        {kpis.map((k) => (
          <O
            key={k.code}
            nhan={k.label}
            gia={k.value}
            donVi={k.unit.toLowerCase()}
            canhBao={(k.value ?? 0) > 0}
            maDonVi={k.code === MA_KEM_DON_VI && (k.value ?? 0) > 0 ? maCoLti : []}
          />
        ))}
      </div>
    </section>
  )
}
