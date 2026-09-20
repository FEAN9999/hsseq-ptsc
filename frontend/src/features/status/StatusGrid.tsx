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
import { Card } from '../../components/ui/card'
import { Chip, type ChipKind } from '../../components/ui/Chip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
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

// `whitespace-normal` phải NÓI RA, khác ba bảng kia: `TableCell`/`TableHead` cấm ngắt dòng mặc
// định, nhưng bảng này là `table-fixed` + `w-[260px]` nên một tên đơn vị dài KHÔNG kéo cột rộng ra
// (rồi cuộn ngang) mà tràn đè lên cột kỳ ngay bên phải — và cột này dính trái nên vệt tràn đó nằm
// đè trên mọi thứ cuộn qua dưới nó. Giữ ngắt dòng đúng như trước lượt dựng lại primitive.
const COT_DON_VI = 'sticky left-0 z-10 border-r border-border w-[260px] whitespace-normal'
// `py-0`: nền của `TableCell` là `p-2`, mà `px-3` chỉ đè được bề ngang — để nguyên thì mỗi dòng
// cao thêm 16px, phá đúng số đo 40px mà bản vẽ chốt riêng cho lưới này (xem đầu tệp).
const O_KY = 'h-10 px-3 py-0 text-sm text-center w-[104px]'

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
    // `hover:bg-transparent` — `TableRow` sáng nền cả dòng khi rê chuột, nhưng ở lưới này nó sẽ
    // sáng LOANG LỔ: ô Đơn vị dính trái tự mang `bg-card` (bắt buộc, nếu không nội dung cuộn qua
    // dưới nó) nên phần đó KHÔNG đổi màu, còn các ô kỳ thì có. Trước lượt này lưới không có hiệu
    // ứng rê chuột nào; giữ nguyên như vậy. Muốn sáng CẢ dòng thì phải thêm `group` trên dòng và
    // `group-hover:bg-muted/50` trên ô dính (khuôn pages/Reports.tsx) — đó là một hiệu ứng MỚI,
    // không thuộc lượt dựng lại primitive.
    <TableRow className="hover:bg-transparent">
      <TableCell className={`h-10 px-3 py-0 text-sm bg-card ${COT_DON_VI}`}>{unit.name}</TableCell>
      {unit.cells.map((cell) => (
        <TableCell
          key={cell.period_key}
          className={`${O_KY} ${cell.period_key === kyDangXem ? O_KY_CHON : ''}`}
        >
          <OTrangThai code={unit.code} cell={cell} />
        </TableCell>
      ))}
    </TableRow>
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
    // Vỏ cuộn tự viết đã BỎ: `Table` tự sinh một `<div overflow-x-auto>` — giữ thêm một tầng nữa
    // là hai vùng cuộn lồng nhau. Viền/nền/bo góc chuyển ra `Card`, `py-0` vì bảng tự có đệm dọc.
    // Cột dính trái vẫn dính: tổ tiên cuộn của nó nay là container của `Table`, vẫn `overflow-x-auto`.
    <Card className="py-0">
      {/* `w-full` + `minWidth` TÍNH THEO SỐ KỲ, thay cho một bảng chỉ rộng đúng 260 + n×104.
          Dải kỳ của seed hiện có 4 kỳ ⇒ bảng cũ rộng 676px trong một vùng 976px: gần một phần ba
          bề ngang bỏ trống ngay cạnh một lưới 22 dòng. `table-fixed` vẫn giữ tỉ lệ cột như bản vẽ
          (đơn vị rộng gấp 2,5 lần một cột kỳ), chỉ kéo giãn cho vừa chỗ; còn `minWidth` giữ đúng
          sàn 260/104 của bản vẽ để khi dải kỳ dài ra thì cuộn ngang, không bóp cột. */}
      <Table className="table-fixed" style={{ minWidth: 260 + periods.length * 104 }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              className={`h-10 px-3 bg-muted text-[13.5px] text-sec font-semibold ${COT_DON_VI}`}
            >
              Đơn vị
            </TableHead>
            {periods.map((p) => (
              <TableHead
                key={p}
                className={`h-10 px-3 text-[13.5px] font-semibold text-center w-[104px] ${p === kyDangXem ? DAU_KY_CHON : DAU_KY_THUONG}`}
              >
                {formatPeriod(p)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((u) => (
            <Dong key={u.code} unit={u} kyDangXem={kyDangXem} />
          ))}
          {/* Dòng cuối — KHÔNG có viền dưới (tránh viền đôi ngay trước viền ngoài của khung bọc).
              Trước đây bất biến này được giữ bằng cách dòng này là JSX rời, tự không thêm
              `border-b`; nay `TableRow` cấp `border-b` cho MỌI dòng nên thứ giữ bất biến là
              `[&_tr:last-child]:border-0` sẵn có trong `TableBody` — cùng một cơ chế với
              UnitsTable.tsx và Reports.tsx, không còn mỗi nơi một kiểu. */}
          <TableRow className="hover:bg-transparent">
            <TableCell className={`h-10 px-3 py-0 text-sm font-medium bg-card ${COT_DON_VI}`}>
              Tổng theo kỳ
            </TableCell>
            {periods.map((p) => (
              <TableCell key={p} className={`${O_KY} ${p === kyDangXem ? O_KY_CHON : ''}`}>
                {tongTheoKy(units, p)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  )
}
