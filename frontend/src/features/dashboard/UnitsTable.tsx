// frontend/src/features/dashboard/UnitsTable.tsx
//
// Bảng 22 đơn vị, 8 cột (mockup dashboard.html `.tbl table`): Đơn vị · Giờ công · LTI · FAT ·
// Near miss · HAZOB · Giờ AT kể từ LTI cuối · Trạng thái.
//
// Chỉ cột LTI bấm được — mở đúng báo cáo tại neo chỉ tiêu LTI thật (xem MA_CHI_TIEU_LTI dưới, và
// task-25-report.md mục "khác brief" cho lý do #B-2-2 thay vì #B-2-1 của brief).
//
// carry C1: nguồn chân lý cho "dòng này có báo cáo để mở" là `report_id !== null`, KHÔNG phải
// `state !== null` — hai thứ trùng ở dữ liệu hiện có (có Report thì có state_id) nhưng thứ cái
// link CẦN là id, không phải state.
import { useNavigate } from 'react-router-dom'
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
import { formatNumber } from '../../lib/format'
import { maNeo } from '../report/FormModeBar'
import type { UnitRow } from './useUnits'

// B-2.2 = "Thương tật mất thời gian" / LTI (Lost Time Injury) — app/seed/catalog_fm01.py:78,
// khớp cách backend/app/api/dashboard.py map "lti" (Indicator.code == "B-2.2"). KHÔNG phải B-2.1
// (đó là FAT/"Chết người", catalog_fm01.py:77).
const MA_CHI_TIEU_LTI = 'B-2.2'

// Chỉ còn phần `TableCell` (components/ui/table.tsx) KHÔNG tự có: cỡ ô của kho (`h-9 px-3 py-0`
// thay `p-2`; `py-0` vì `px-3` chỉ đè được bề ngang của `p-2` — xem `features/admin/khung.tsx`).
// `border-b border-border` đã chuyển sang `TableRow`, và dòng cuối do `TableBody`
// (`[&_tr:last-child]:border-0`) lo — giữ cả hai chỗ là viền đôi.
const O_CHUNG = 'h-9 px-3 py-0 text-sm'
const O_SO = `${O_CHUNG} text-right tnum`
// Vòng sửa 1 (task-25-fix-1.md A5-c, review mục 11 "c"): bản vẽ làm MỜ CẢ DÒNG "Chưa nộp"
// (class="sec" trên mọi ô) — tín hiệu thị giác "dòng này không bấm được" (D4).
const MO = ' text-muted-foreground'

// 6 cột số — dùng CHUNG danh sách này cho cả tiêu đề (canh phải, A5-a) lẫn không phải tính lại.
const TEN_COT_SO = new Set(['Giờ công', 'LTI', 'FAT', 'Near miss', 'HAZOB', 'Giờ AT kể từ LTI cuối'])

function trangThai(state: string | null): ChipKind {
  return state === null ? 'missing' : (state as ChipKind)
}

function Dong({ row, period }: { row: UnitRow; period: string }) {
  const navigate = useNavigate()
  const coBaoCao = row.report_id !== null
  const coLti = (row.lti ?? 0) > 0
  const mo = coBaoCao ? '' : MO

  return (
    // `hover:bg-transparent` chỉ trên dòng CHƯA NỘP: `TableRow` sáng nền mọi dòng khi rê chuột,
    // mà dòng này vừa `aria-disabled` vừa bị làm mờ cả dòng để nói "không bấm được" (D4) — cho nó
    // phản ứng theo chuột là nói ngược lại chính hai tín hiệu đó. Dòng CÓ báo cáo giữ hiệu ứng:
    // số LTI trên đó bấm được, và đây là bảng 8 cột nên vệt sáng giúp dò đúng hàng.
    <TableRow
      aria-disabled={coBaoCao ? undefined : 'true'}
      className={coBaoCao ? undefined : 'hover:bg-transparent'}
    >
      <TableCell className={O_CHUNG + mo}>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {row.org_unit.code}
          </span>
          <span className="font-medium">{row.org_unit.name}</span>
        </span>
      </TableCell>
      <TableCell className={O_SO + mo}>{formatNumber(row.gio_cong, 0)}</TableCell>
      <TableCell className={O_SO + mo}>
        {coBaoCao ? (
          <button
            type="button"
            data-testid={`lti-${row.org_unit.code}`}
            onClick={() =>
              navigate(`/reports/${row.report_id}?from=dashboard&period=${period}#${maNeo(MA_CHI_TIEU_LTI)}`)
            }
            className={`bg-transparent border-0 p-0 cursor-pointer tnum underline ${
              coLti ? 'text-destructive font-medium' : 'text-foreground'
            }`}
          >
            {formatNumber(row.lti, 0)}
          </button>
        ) : (
          // Vòng sửa 1 (task-25-fix-1.md A3, review N8): KHÔNG data-testid ở đây — dòng chưa nộp
          // không bấm được, không mã/test nào cần định vị riêng phần tử này bằng testid.
          <span className={coLti ? 'text-destructive font-medium' : undefined}>
            {formatNumber(row.lti, 0)}
          </span>
        )}
      </TableCell>
      <TableCell className={O_SO + mo}>{formatNumber(row.fat, 0)}</TableCell>
      <TableCell className={O_SO + mo}>{formatNumber(row.near_miss, 0)}</TableCell>
      <TableCell className={O_SO + mo}>{formatNumber(row.hazob, 0)}</TableCell>
      <TableCell className={O_SO + mo}>{formatNumber(row.gio_an_toan_tu_lti_cuoi, 0)}</TableCell>
      <TableCell className={O_CHUNG + mo}>
        <Chip kind={trangThai(row.state)} />
      </TableCell>
    </TableRow>
  )
}

const TIEU_DE_COT = [
  'Đơn vị',
  'Giờ công',
  'LTI',
  'FAT',
  'Near miss',
  'HAZOB',
  'Giờ AT kể từ LTI cuối',
  'Trạng thái',
]

export function UnitsTable({ rows, period }: { rows: UnitRow[]; period: string }) {
  // Dòng có LTI lên ĐẦU (mockup mục 02). `sort` của JS ổn định theo chuẩn nên trong mỗi nhóm thứ
  // tự server trả được giữ nguyên — không cần khoá phụ.
  const dsSapXep = [...rows].sort((a, b) => Number((b.lti ?? 0) > 0) - Number((a.lti ?? 0) > 0))
  return (
    // `gap-0 py-0`: Card mặc định là `flex flex-col gap-(--card-spacing)` + đệm dọc — cả hai đều
    // thừa ở đây vì bảng tự có đệm và khối tiêu đề phải SÁT bảng như bản cũ. Viền ngăn giữa hai
    // phần chuyển từ `border-t` của vỏ cuộn (nay là container của `Table`, không nhận className)
    // sang `border-b` của chính khối tiêu đề — cùng một đường 1px, khác chỗ khai.
    <Card className="gap-0 py-0">
      {/* KHÔNG lặp lại số đầu mối ở đây: dòng Coverage phía trên đã nói, và `rows.length` với
          `reporting_units` là hai con số khác nguồn — in cả hai là mời người đọc so lệch. */}
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Số liệu theo đơn vị</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Bấm số LTI để mở đúng chỉ tiêu trong báo cáo của đơn vị
        </p>
      </div>
      {/* Vòng sửa 1 (task-25-fix-1.md A5-h, review mục 11 "h"): dòng CUỐI trong tbody không được
          có viền dưới — cùng khung bo/viền ngoài thì viền đó thành viền đôi ngay trước mép khung.
          Bất biến GIỮ NGUYÊN, chỗ thực thi đổi: `[&_tbody_tr:last-child_td]:border-b-0` tự viết
          nay là `[&_tr:last-child]:border-0` sẵn có trong `TableBody` (components/ui/table.tsx),
          vì viền hàng đã chuyển từ Ô sang DÒNG (`TableRow` mang `border-b`). */}
      <Table>
        <TableHeader>
          <TableRow>
            {TIEU_DE_COT.map((ten) => (
              <TableHead
                key={ten}
                className={`h-9 px-3 bg-muted text-[13.5px] text-sec font-semibold ${
                  TEN_COT_SO.has(ten) ? 'text-right' : 'text-left'
                }`}
              >
                {ten}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dsSapXep.map((row) => (
            <Dong key={row.org_unit.code} row={row} period={period} />
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
