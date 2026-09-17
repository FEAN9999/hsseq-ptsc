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
import { Chip, type ChipKind } from '../../components/ui/Chip'
import { formatNumber } from '../../lib/format'
import { maNeo } from '../report/FormModeBar'
import type { UnitRow } from './useUnits'

// B-2.2 = "Thương tật mất thời gian" / LTI (Lost Time Injury) — app/seed/catalog_fm01.py:78,
// khớp cách backend/app/api/dashboard.py map "lti" (Indicator.code == "B-2.2"). KHÔNG phải B-2.1
// (đó là FAT/"Chết người", catalog_fm01.py:77).
const MA_CHI_TIEU_LTI = 'B-2.2'

const O_CHUNG = 'h-9 px-3 border-b border-border text-sm'
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
    <tr aria-disabled={coBaoCao ? undefined : 'true'}>
      <td className={O_CHUNG + mo}>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {row.org_unit.code}
          </span>
          <span className="font-medium">{row.org_unit.name}</span>
        </span>
      </td>
      <td className={O_SO + mo}>{formatNumber(row.gio_cong, 0)}</td>
      <td className={O_SO + mo}>
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
      </td>
      <td className={O_SO + mo}>{formatNumber(row.fat, 0)}</td>
      <td className={O_SO + mo}>{formatNumber(row.near_miss, 0)}</td>
      <td className={O_SO + mo}>{formatNumber(row.hazob, 0)}</td>
      <td className={O_SO + mo}>{formatNumber(row.gio_an_toan_tu_lti_cuoi, 0)}</td>
      <td className={O_CHUNG + mo}>
        <Chip kind={trangThai(row.state)} />
      </td>
    </tr>
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
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {/* KHÔNG lặp lại số đầu mối ở đây: dòng Coverage phía trên đã nói, và `rows.length` với
          `reporting_units` là hai con số khác nguồn — in cả hai là mời người đọc so lệch. */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Số liệu theo đơn vị</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Bấm số LTI để mở đúng chỉ tiêu trong báo cáo của đơn vị
        </p>
      </div>
      <div className="overflow-x-auto border-t border-border">
      {/* Vòng sửa 1 (task-25-fix-1.md A5-h, review mục 11 "h"): bỏ viền dưới của dòng CUỐI trong
          tbody — cùng khung bo/viền ngoài của chính div này thì viền dưới đó thành viền đôi ngay
          trước mép khung.
          Vòng sửa 2 (task-25-fix-2.md P6-P10/M-02+M-25, task-25-rereview-1.md mục 6 [NHẸ]): SỬA
          LẠI câu trên — nó nói SAI lý do dòng tiêu đề không bị ăn viền. Selector kết ở `_td`, còn
          `<thead>` dùng `<th>` (không phải `<td>`), nên chính hậu tố `_td` đó — KHÔNG PHẢI scope
          `tbody` — mới là thứ chặn dòng tiêu đề: bỏ scope `tbody` đi, còn trần `tr:last-child`,
          vẫn khớp CẢ dòng tiêu đề (last-child của chính `<thead>`) lẫn dòng cuối `tbody`, nhưng
          dòng tiêu đề không có `<td>` nào để `_td` bắt nên không mất viền. Giữ nguyên scope
          `tbody` vì nó tự nói đúng Ý ĐỊNH ("dòng cuối PHẦN THÂN bảng") mà không cần suy luận qua
          thẻ HTML — không phải vì thiếu nó sẽ sai. */}
      <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
        <thead>
          <tr>
            {TIEU_DE_COT.map((ten) => (
              <th
                key={ten}
                className={`h-9 px-3 border-b border-border bg-muted text-[13.5px] text-sec font-semibold whitespace-nowrap ${
                  TEN_COT_SO.has(ten) ? 'text-right' : 'text-left'
                }`}
              >
                {ten}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dsSapXep.map((row) => (
            <Dong key={row.org_unit.code} row={row} period={period} />
          ))}
        </tbody>
      </table>
      </div>
    </section>
  )
}
