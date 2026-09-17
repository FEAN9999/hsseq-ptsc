// frontend/src/features/status/StatusGrid.tsx
//
// Lưới đơn vị × kỳ (mockup status.html `.tbl table`) — cột Đơn vị sticky trái, dòng 40px
// (task-26-brief.md Step 2 — số đo RIÊNG cho lưới này, khác cỡ 36px (h-9) các bảng khác trong app
// đang dùng — quyết định CÓ CHỦ Ý của bản vẽ, không phải lệch chuẩn). Cả bảng cuộn ngang trong
// khung của chính nó (overflow-x-auto), không cuộn cả trang — cùng khuôn Reports.tsx/UnitsTable.tsx.
//
// 260px/104px là SÀN, không phải bề rộng chốt (Lát 5 sửa): `table-fixed` + `w-full` giữ đúng TỈ LỆ
// của bản vẽ (cột đơn vị gấp 2,5 lần một cột kỳ) và kéo giãn cho vừa chỗ, còn `minWidth` tính theo
// số kỳ mới là chỗ giữ sàn — vượt sàn thì cuộn ngang, không bóp cột. Bản trước chốt cứng 260 +
// n×104: với dải 4 kỳ của seed, bảng rộng 676px nằm trong vùng 976px, bỏ trống gần một phần ba bề
// ngang ngay cạnh một lưới 22 dòng.
//
// carry C8: `report_id` mới có từ Task 26 (StatusCellOut trước đó thiếu). Nguồn chân lý cho "ô này
// bấm được" là `report_id !== null` (khuôn UnitsTable.tsx carry C1), KHÔNG phải `state !== null` —
// hai thứ trùng nhau ở dữ liệu hiện có nhưng report_id mới là thứ link thật sự cần.
//
// carry C12 mục 3: thứ tự dòng do BACKEND quyết theo mã đơn vị (status.py:114, có
// test_status_thu_tu_don_vi_theo_ma canh phía BE) — component này KHÔNG tự sort lại `units`, chỉ
// render đúng thứ tự mảng nhận được.
import { Link } from 'react-router-dom'
import { Chip, type ChipKind } from '../../components/ui/Chip'
import { formatPeriod } from '../../lib/format'

export interface StatusCell {
  period_key: string
  state: string | null
  source: string | null
  is_late: boolean | null
  report_id: number | null
}

export interface StatusUnit {
  code: string
  name: string
  cells: StatusCell[]
}

// Trùng logic với `kindTrangThai` KHÔNG export trong pages/Reports.tsx (state+is_late -> ChipKind)
// — chép lại thay vì import chéo trang↔feature: gộp chung hai bản là việc ngoài phạm vi phẫu thuật
// của Task 26 (Reports.tsx không thuộc brief này). Xem task-26-report.md mục "mã chết/đáng ngờ".
function kindTrangThai(state: string | null, isLate: boolean | null): ChipKind {
  if (state === null) return 'missing'
  if (state === 'submitted') return isLate ? 'late' : 'submitted'
  if (state === 'draft' || state === 'approved' || state === 'returned') return state
  return 'missing'
}

const COT_DON_VI = 'sticky left-0 z-10 border-r border-border w-[260px]'
const O_KY = 'h-10 px-3 text-sm text-center whitespace-nowrap w-[104px]'

// Cột của kỳ ĐANG CHỌN (`?period=` trên URL) được tô nhạt. Lý do: trang này vẽ CẢ DẢI kỳ cùng lúc,
// nên trước Lát 5 bộ chọn kỳ trên sidebar — và huy hiệu `x/22` sinh ra từ chính kỳ đó — không trỏ
// vào đâu trên màn này cả; người xem không có cách nào biết con số ở thanh bên đọc cột nào.
// Tô NỀN Ô, không đụng vào chip: màu chip là thứ ca test đọc để canh trạng thái, và cũng là thứ
// duy nhất mang nghĩa "đã nộp/chưa nộp" — thêm một màu nữa lên đó là trộn hai chiều thông tin.
const O_KY_CHON = 'bg-primary/5'
const DAU_KY_CHON = 'bg-primary/10 text-foreground'
const DAU_KY_THUONG = 'bg-muted text-sec'

function OTrangThai({ code, cell }: { code: string; cell: StatusCell }) {
  const testId = `o-${code}-${cell.period_key}`
  // Chưa nộp (không có report_id): KHÔNG bọc <a> — ô không bấm được, đúng hợp đồng D4 (khuôn
  // UnitsTable.tsx carry C1: report_id, không phải state, là nguồn chân lý "có báo cáo để mở").
  if (cell.report_id === null) {
    return <Chip kind="missing" testId={testId} ariaDisabled />
  }
  return (
    <Link to={`/reports/${cell.report_id}`} className="no-underline">
      <Chip kind={kindTrangThai(cell.state, cell.is_late)} outline={cell.source === 'seed'} testId={testId} />
    </Link>
  )
}

function Dong({ unit, kyDangXem }: { unit: StatusUnit; kyDangXem: string }) {
  return (
    <tr>
      <td className={`h-10 px-3 border-b border-border text-sm bg-card ${COT_DON_VI}`}>{unit.name}</td>
      {unit.cells.map((cell) => (
        <td
          key={cell.period_key}
          className={`${O_KY} border-b border-border ${cell.period_key === kyDangXem ? O_KY_CHON : ''}`}
        >
          <OTrangThai code={unit.code} cell={cell} />
        </td>
      ))}
    </tr>
  )
}

// Nhãn ngắn cho dòng "Tổng theo kỳ" (mockup: "22/22 duyệt" · "21 duyệt · 1 nháp" · "1 nộp · 21
// chưa") — nhóm CHÍNH XÁC theo `state` (is_late không tách nhóm: đó là màu riêng cho TỪNG Ô, tổng
// theo dõi trạng thái). Thứ tự cố định theo mockup: duyệt, nộp, nháp, trả lại, chưa.
const NHOM_TONG: { state: string | null; nhan: string }[] = [
  { state: 'approved', nhan: 'duyệt' },
  { state: 'submitted', nhan: 'nộp' },
  { state: 'draft', nhan: 'nháp' },
  { state: 'returned', nhan: 'trả lại' },
  { state: null, nhan: 'chưa' },
]

function tongTheoKy(units: StatusUnit[], periodKey: string): string {
  const dem = new Map<string | null, number>()
  for (const u of units) {
    const state = u.cells.find((c) => c.period_key === periodKey)?.state ?? null
    dem.set(state, (dem.get(state) ?? 0) + 1)
  }
  return NHOM_TONG.filter((n) => (dem.get(n.state) ?? 0) > 0)
    .map((n) => `${dem.get(n.state)} ${n.nhan}`)
    .join(' · ')
}

export function StatusGrid({
  periods,
  units,
  kyDangXem,
}: {
  periods: string[]
  units: StatusUnit[]
  kyDangXem: string
}) {
  return (
    <div className="overflow-x-auto border border-border bg-card rounded-xl">
      {/* `w-full` + `minWidth` TÍNH THEO SỐ KỲ, thay cho một bảng chỉ rộng đúng 260 + n×104.
          Dải kỳ của seed hiện có 4 kỳ ⇒ bảng cũ rộng 676px trong một vùng 976px: gần một phần ba
          bề ngang bỏ trống ngay cạnh một lưới 22 dòng. `table-fixed` vẫn giữ tỉ lệ cột như bản vẽ
          (đơn vị rộng gấp 2,5 lần một cột kỳ), chỉ kéo giãn cho vừa chỗ; còn `minWidth` giữ đúng
          sàn 260/104 của bản vẽ để khi dải kỳ dài ra thì cuộn ngang, không bóp cột. */}
      <table
        className="w-full border-collapse table-fixed"
        style={{ minWidth: 260 + periods.length * 104 }}
      >
        <thead>
          <tr>
            <th
              className={`h-10 px-3 border-b border-border bg-muted text-[13.5px] text-sec font-semibold text-left ${COT_DON_VI}`}
            >
              Đơn vị
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className={`h-10 px-3 border-b border-border text-[13.5px] font-semibold text-center whitespace-nowrap w-[104px] ${p === kyDangXem ? DAU_KY_CHON : DAU_KY_THUONG}`}
              >
                {formatPeriod(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <Dong key={u.code} unit={u} kyDangXem={kyDangXem} />
          ))}
          {/* Dòng cuối — KHÔNG border-b (tránh viền đôi ngay trước viền ngoài của khung bọc, cùng
              lý do UnitsTable.tsx dùng [&_tbody_tr:last-child_td]:border-b-0; ở đây đơn giản hơn:
              dòng này là JSX rời, không đi qua Dong/O_KY dùng chung nên chỉ cần không thêm
              border-b từ đầu, không cần lớp ghi đè). */}
          <tr>
            <td className={`h-10 px-3 text-sm font-medium bg-card ${COT_DON_VI}`}>Tổng theo kỳ</td>
            {periods.map((p) => (
              <td key={p} className={`${O_KY} ${p === kyDangXem ? O_KY_CHON : ''}`}>
                {tongTheoKy(units, p)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
