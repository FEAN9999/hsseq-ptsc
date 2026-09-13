// frontend/src/pages/Reports.tsx
//
// Landing của CẢ HAI vai (brief): người nộp thấy các kỳ của đơn vị mình (5 cột), admin (+ viewer,
// xem useReportList.ts) thấy hàng chờ duyệt (+ cột Đơn vị). AppShell/Sidebar KHÔNG render ở đây —
// bọc ở tầng route (carry C3, app/routes.tsx), giống mọi trang sau RequireAuth khác.
//
// Không dùng hook/`<Link>` của react-router (giống Login.tsx, carry C4 task-19): "Mở"/"Xem" là
// thẻ <a href> thường — điều hướng đầy đủ trang là chấp nhận được vì đích /reports/:id còn chưa
// tồn tại (Task 22), và giữ component test được bằng render(<Reports/>) trần, không cần bọc
// MemoryRouter. "Tạo báo cáo" điều hướng bằng location.assign sau khi POST xong, cùng quy ước.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useSession } from '../app/session'
import { useReportList, type ReportListItem } from '../features/reports/useReportList'
import { invalidateReportQueries } from '../api/invalidate'
import { Chip, type ChipKind } from '../components/ui/Chip'
import { Skeleton } from '../components/ui/Skeleton'
import { InlineError } from '../components/ui/InlineError'
import { useToast } from '../components/ui/Toast'
import { formatDue, formatDateTime, formatNumber, formatPeriod } from '../lib/format'

const DO_DAI_GHI_CHU = 120

// 120 ký tự đầu của ghi chú Trả lại + dấu … khi bị cắt (carry C7 dòng "báo cáo Trả lại hiện 120
// ký tự đầu ghi chú dưới chip") — độ dài chuỗi kết quả cho ghi chú >120 ký tự là 121 (120 + 1 dấu
// …, MỘT ký tự UTF-16 chứ không phải ba dấu chấm).
function ghiChuTraLai(note: string): string {
  return note.length > DO_DAI_GHI_CHU ? `${note.slice(0, DO_DAI_GHI_CHU)}…` : note
}

function kindTrangThai(state: string | null, isLate: boolean | null): ChipKind {
  if (state === null) return 'missing'
  if (state === 'submitted') return isLate ? 'late' : 'submitted'
  if (state === 'draft' || state === 'approved' || state === 'returned') return state
  return 'missing'
}

const BTN_BASE =
  'inline-flex items-center justify-center h-[26px] px-2.5 rounded-input border text-xs font-medium whitespace-nowrap no-underline disabled:opacity-50'
const BTN_PLAIN = `${BTN_BASE} bg-surface border-hair text-ink transition-colors duration-[120ms] hover:bg-mutedbg`
const BTN_PRIMARY = `${BTN_BASE} bg-cyan border-cyanEdge text-white`
const BTN_GHOST = `${BTN_BASE} bg-transparent border-hair text-ink transition-colors duration-[120ms] hover:bg-mutedbg`

function NutTaoBaoCao({ periodKey }: { periodKey: string }) {
  const queryClient = useQueryClient()
  const hienToast = useToast()
  const [dangTao, setDangTao] = useState(false)

  async function xuLy() {
    setDangTao(true)
    try {
      const { id } = await api.post<{ id: number }>('/reports', {
        template: 'FM01',
        period_key: periodKey,
      })
      invalidateReportQueries(queryClient, id)
      location.assign(`/reports/${id}`)
    } catch (err) {
      setDangTao(false)
      // 409 "đã tồn tại" kèm existing_id (client.ts) — đơn vị khác/tab khác vừa tạo trong lúc
      // đang chờ: đi thẳng tới báo cáo đã có thay vì báo lỗi suông.
      if (err instanceof ApiError && err.existing_id !== undefined) {
        location.assign(`/reports/${err.existing_id}`)
        return
      }
      hienToast(err instanceof ApiError ? err.detail : 'Không tạo được báo cáo')
    }
  }

  return (
    <button type="button" onClick={xuLy} disabled={dangTao} className={BTN_PLAIN}>
      {dangTao ? 'Đang tạo…' : 'Tạo báo cáo'}
    </button>
  )
}

function OHanhDong({ row, isAdmin }: { row: ReportListItem; isAdmin: boolean }) {
  if (row.state === null) return <NutTaoBaoCao periodKey={row.period_key} />
  // Admin/viewer (report.approve|report.view_all): luôn "Mở" — vào để duyệt hoặc chỉ để xem, cả
  // hai đều là "mở báo cáo ra". Người nộp: chỉ trạng thái còn sửa được (draft/returned) mới "Mở",
  // còn lại (submitted/approved) chỉ "Xem" — is_editable theo backend/app/seed/__init__.py STATES.
  const laMo = isAdmin || row.state === 'draft' || row.state === 'returned'
  return (
    <a href={`/reports/${row.id}`} className={laMo ? BTN_PRIMARY : BTN_GHOST}>
      {laMo ? 'Mở' : 'Xem'}
    </a>
  )
}

function HangBaoCao({ row, isAdmin, now }: { row: ReportListItem; isAdmin: boolean; now: Date }) {
  const han = formatDue(row.due_at, now)
  return (
    <tr>
      {isAdmin && <td className="h-9 px-3 border-b border-hair text-table">{row.org_unit.name}</td>}
      <td className="h-9 px-3 border-b border-hair text-table" data-testid="o-ky">
        {formatPeriod(row.period_key)}
      </td>
      <td className="h-9 px-3 border-b border-hair text-table align-middle">
        <Chip kind={kindTrangThai(row.state, row.is_late)} outline={row.source === 'seed'} />
        {row.state === 'returned' && row.decision_note && (
          <div className="block text-xs text-danger leading-[1.3] mt-0.5" data-testid="ghi-chu-tra-lai">
            {ghiChuTraLai(row.decision_note)}
          </div>
        )}
      </td>
      <td
        className="h-9 px-3 border-b border-hair text-table whitespace-nowrap"
        title={han.title}
        data-testid="o-han-nop"
      >
        {han.text}
      </td>
      <td className="h-9 px-3 border-b border-hair text-table">
        {row.updated_at ? formatDateTime(row.updated_at) : <span className="text-sec">—</span>}
      </td>
      <td className="h-9 px-3 border-b border-hair text-table">
        <OHanhDong row={row} isAdmin={isAdmin} />
      </td>
    </tr>
  )
}

export function Reports() {
  const { items, isAdmin, xemTatCa, setXemTatCa, isLoading, isError, refetch } = useReportList()
  const orgUnit = useSession((s) => s.orgUnit)
  const now = new Date()

  // "số theo vi-VN" (ràng buộc toàn cục) áp dụng cả cho con số đếm này, không riêng số liệu báo
  // cáo — dùng lại formatNumber (Task 16) thay vì nối chuỗi thô.
  const tieuDe = isAdmin
    ? isLoading
      ? 'Chờ duyệt'
      : `Chờ duyệt (${formatNumber(items.length, 0)})`
    : `Báo cáo SKATMT · ${orgUnit?.name ?? ''}`

  const rongThongBao = isAdmin ? 'Không có báo cáo chờ duyệt' : 'Chưa có kỳ báo cáo nào đang mở'

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-5">
        <h1 className="text-pageTitle font-medium text-ink">{tieuDe}</h1>
        {isAdmin && (
          <div className="flex items-center gap-2 text-table">
            <span className="text-sec">Lọc:</span>
            {xemTatCa ? (
              <button type="button" onClick={() => setXemTatCa(false)} className="bg-transparent border-0 p-0 cursor-pointer text-soot">
                Đã nộp
              </button>
            ) : (
              <span className="font-medium border border-hair bg-surface rounded-input px-2.5 py-1">Đã nộp</span>
            )}
            {xemTatCa ? (
              <span className="font-medium border border-hair bg-surface rounded-input px-2.5 py-1">Tất cả</span>
            ) : (
              <button type="button" onClick={() => setXemTatCa(true)} className="bg-transparent border-0 p-0 cursor-pointer text-soot">
                Tất cả
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton rows={4} />
      ) : isError ? (
        <InlineError message="Không tải được danh sách báo cáo" onRetry={refetch} />
      ) : items.length === 0 ? (
        <p className="text-table text-sec">{rongThongBao}</p>
      ) : (
        <div className="overflow-x-auto border border-hair bg-surface rounded-input">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {isAdmin && (
                  <th className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap">
                    Đơn vị
                  </th>
                )}
                <th className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap">Kỳ</th>
                <th className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap">
                  Trạng thái
                </th>
                <th className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap">
                  Hạn nộp
                </th>
                <th className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap">
                  Cập nhật
                </th>
                <th className="h-9 px-3 border-b border-hair bg-mutedbg text-tableHead font-semibold text-left whitespace-nowrap">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <HangBaoCao key={`${row.org_unit.code}-${row.period_key}`} row={row} isAdmin={isAdmin} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
