// frontend/src/pages/Reports.tsx
//
// Landing của CẢ HAI vai (brief): người nộp thấy các kỳ của đơn vị mình (5 cột), admin (+ viewer,
// xem useReportList.ts) thấy hàng chờ duyệt (+ cột Đơn vị). AppShell/Sidebar KHÔNG render ở đây —
// bọc ở tầng route (carry C3, app/routes.tsx), giống mọi trang sau RequireAuth khác.
//
// S1a (vòng sửa 1, task-20-fix-1.md): điều hướng nội bộ ("Mở"/"Xem"/"Tạo báo cáo") dùng
// `<Link>`/`useNavigate()` của react-router, KHÔNG dùng `location.*` — TRƯỚC ĐÂY (carry C4,
// task-19) dùng `<a href>`/`location.assign` chỉ để giữ test render <Reports/> trần không bọc
// router; đó là nguyên nhân khiến MỌI nút trên trang này thực chất là một lần đăng xuất
// (location.assign tải lại tài liệu đầy đủ, xoá sạch store phiên thuần bộ nhớ — xem S1,
// session.ts). Đích `/reports/:id` vẫn CHƯA tồn tại (Task 22 mới dựng) — bấm "Mở"/"Xem"/"Tạo báo
// cáo" nay chuyển tới `<NotFound/>` bằng điều hướng SPA thay vì đăng xuất; đó là hành vi ĐÚNG cho
// tới khi Task 22 xong, không thêm route giữ chỗ (mã đầu cơ, trái CLAUDE.md #2).
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [dangTao, setDangTao] = useState(false)

  async function xuLy() {
    setDangTao(true)
    try {
      const { id } = await api.post<{ id: number }>('/reports', {
        template: 'FM01',
        period_key: periodKey,
      })
      invalidateReportQueries(queryClient, id)
      // S6/S8 (vòng sửa 1): toast "Đã tạo báo cáo <kỳ>" theo bảng trạng thái thiết kế — trước đây
      // không hiện được vì location.assign xoá cả trang ngay sau đó (S1); nay điều hướng SPA nên
      // toast (store toàn cục, không unmount theo route) hiện được cùng lúc.
      hienToast(`Đã tạo báo cáo ${formatPeriod(periodKey)}`)
      navigate(`/reports/${id}`)
    } catch (err) {
      setDangTao(false)
      // 409 "đã tồn tại" kèm existing_id (client.ts) — đơn vị khác/tab khác vừa tạo trong lúc
      // đang chờ: đi thẳng tới báo cáo đã có thay vì báo lỗi suông. Không phải một lần TẠO thành
      // công nên KHÔNG kèm toast "Đã tạo báo cáo".
      if (err instanceof ApiError && err.existing_id !== undefined) {
        navigate(`/reports/${err.existing_id}`)
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
  // S5 (vòng sửa 1, task-20-fix-1.md): dòng phòng thủ — FE suy `isAdmin` từ MÃ QUYỀN
  // (report.approve|report.view_all), còn BE đổi HÌNH DẠNG dữ liệu theo PHẠM VI
  // (pham_vi_bao_cao — deps.py). Hai thứ khớp nhau hôm nay (seed hiện có), nhưng nếu một ngày có
  // người được cấp report.view_all kèm phạm vi hẹp, BE có thể vẫn trả dòng `state === null` cho
  // một người không có report.create — kiểm `isAdmin` TRƯỚC khi rơi vào nhánh "Tạo báo cáo" để
  // không hiện nhầm nút cho người không có quyền tạo.
  if (row.state === null) return isAdmin ? <span className="text-sec">—</span> : <NutTaoBaoCao periodKey={row.period_key} />
  // Admin/viewer (report.approve|report.view_all): luôn "Mở" — vào để duyệt hoặc chỉ để xem, cả
  // hai đều là "mở báo cáo ra". Người nộp: chỉ trạng thái còn sửa được (draft/returned) mới "Mở",
  // còn lại (submitted/approved) chỉ "Xem" — is_editable theo backend/app/seed/__init__.py STATES.
  const laMo = isAdmin || row.state === 'draft' || row.state === 'returned'
  return (
    <Link to={`/reports/${row.id}`} className={laMo ? BTN_PRIMARY : BTN_GHOST}>
      {laMo ? 'Mở' : 'Xem'}
    </Link>
  )
}

// S3 (vòng sửa 1, task-20-fix-1.md): dòng đã KHOÁ (submitted/approved — is_editable=False,
// backend/app/seed/__init__.py STATES) không còn hành động nào để thúc — đếm ngược ("quá hạn N
// ngày") lúc đó chỉ đưa tin sai (vd. một kỳ đã duyệt xong từ lâu vẫn hiện đỏ "quá hạn 39 ngày"
// cạnh chip "Đã duyệt", ngay trên màn mở đầu của admin). Đổi sang NGÀY TUYỆT ĐỐI cho hai trạng
// thái này; dòng còn mở (null/draft/returned) giữ formatDue (đếm ngược) như cũ.
function hanNop(row: ReportListItem, now: Date): { text: string; title: string } {
  if (row.state === 'submitted' || row.state === 'approved') {
    const tuyetDoi = formatDateTime(row.due_at)
    return { text: tuyetDoi, title: `Hạn nộp: ${tuyetDoi}` }
  }
  return formatDue(row.due_at, now)
}

function HangBaoCao({ row, isAdmin, now }: { row: ReportListItem; isAdmin: boolean; now: Date }) {
  const han = hanNop(row, now)
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
      <td className="h-9 px-3 border-b border-hair text-table" data-testid="o-cap-nhat">
        {row.updated_at ? formatDateTime(row.updated_at) : <span className="text-sec">—</span>}
      </td>
      <td className="h-9 px-3 border-b border-hair text-table">
        <OHanhDong row={row} isAdmin={isAdmin} />
      </td>
    </tr>
  )
}

// S2 (vòng sửa 1, task-20-fix-1.md, gộp Ruling 198): tiêu đề phụ thuộc HAI thứ — `xemTatCa` VÀ
// `coQuyenDuyet` (report.approve) — không phải `isAdmin` (report.approve HOẶC report.view_all,
// đúng cho PHẦN DỮ LIỆU nhưng sai cho PHẦN CHỮ). "Chờ duyệt" hứa một HÀNH ĐỘNG (duyệt); viewer
// (report.view_all, không có report.approve — vd. viewer@ptsc.local) không làm được hành động đó
// nên KHÔNG được thấy chữ này, ở CẢ HAI chế độ lọc. Admin lọc "Tất cả" cũng vậy: n lúc đó là TỔNG
// SỐ báo cáo đang hiện (bỏ lọc submitted, useReportList.ts), không phải số CHỜ duyệt — tiêu đề
// phải đổi nghĩa theo, không chỉ đổi số. "số theo vi-VN" (ràng buộc toàn cục) áp dụng cho con số
// đếm này — dùng formatNumber (Task 16), không nối chuỗi thô.
function tieuDeHangDoi(opts: { coQuyenDuyet: boolean; xemTatCa: boolean; isLoading: boolean; soDong: number }): string {
  const so = opts.isLoading ? '' : ` (${formatNumber(opts.soDong, 0)})`
  if (opts.xemTatCa) return `Tất cả báo cáo${so}`
  return opts.coQuyenDuyet ? `Chờ duyệt${so}` : `Báo cáo đã nộp${so}`
}

export function Reports() {
  const { items, isAdmin, xemTatCa, setXemTatCa, isLoading, isError, refetch } = useReportList()
  const orgUnit = useSession((s) => s.orgUnit)
  const coQuyenDuyet = useSession((s) => s.permissions.has('report.approve'))
  const now = new Date()

  const tieuDe = !isAdmin
    ? `Báo cáo SKATMT · ${orgUnit?.name ?? ''}`
    : tieuDeHangDoi({ coQuyenDuyet, xemTatCa, isLoading, soDong: items.length })

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
