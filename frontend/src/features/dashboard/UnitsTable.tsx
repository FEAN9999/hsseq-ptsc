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

const O_CHUNG = 'h-9 px-3 border-b border-hair text-table'
const O_SO = `${O_CHUNG} text-right tnum`

function trangThai(state: string | null): ChipKind {
  return state === null ? 'missing' : (state as ChipKind)
}

function Dong({ row, period }: { row: UnitRow; period: string }) {
  const navigate = useNavigate()
  const coBaoCao = row.report_id !== null

  return (
    <tr aria-disabled={coBaoCao ? undefined : 'true'}>
      <td className={O_CHUNG}>{row.org_unit.name}</td>
      <td className={O_SO}>{formatNumber(row.gio_cong, 0)}</td>
      <td className={O_SO}>
        {coBaoCao ? (
          <button
            type="button"
            data-testid={`lti-${row.org_unit.code}`}
            onClick={() =>
              navigate(`/reports/${row.report_id}?from=dashboard&period=${period}#${maNeo(MA_CHI_TIEU_LTI)}`)
            }
            className="bg-transparent border-0 p-0 cursor-pointer tnum text-ink"
          >
            {formatNumber(row.lti, 0)}
          </button>
        ) : (
          <span data-testid={`lti-${row.org_unit.code}`}>{formatNumber(row.lti, 0)}</span>
        )}
      </td>
      <td className={O_SO}>{formatNumber(row.fat, 0)}</td>
      <td className={O_SO}>{formatNumber(row.near_miss, 0)}</td>
      <td className={O_SO}>{formatNumber(row.hazob, 0)}</td>
      <td className={O_SO}>{formatNumber(row.gio_an_toan_tu_lti_cuoi, 0)}</td>
      <td className={O_CHUNG}>
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
  return (
    <div className="overflow-x-auto border border-hair bg-surface rounded-input">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {TIEU_DE_COT.map((ten) => (
              <th
                key={ten}
                className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap"
              >
                {ten}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Dong key={row.org_unit.code} row={row} period={period} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
