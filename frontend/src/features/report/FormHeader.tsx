// frontend/src/features/report/FormHeader.tsx
//
// Dải đầu của /reports/:id (bản vẽ approve.html `.hdr`, states.html `.hdr`): tiêu đề
// "<đơn vị> · <mẫu> · <kỳ>", dòng meta, chip trạng thái, và 5 ô phần đầu theo schema `report`
// (D7: Số báo cáo · Địa điểm · Ngày báo cáo · Người lập · Chức vụ).
//
// "Trạng thái lưu" (D23: "Đang lưu…" / "Đã lưu 14:02" / "Chưa lưu (3 ô)") đứng cạnh chip trạng
// thái, đúng vị trí thiết kế dòng 625 xếp nó. Câu chữ và màu do `ReportForm` quyết (nó cầm
// `useSaveValues`), file này chỉ nhận một dòng đã gọt sẵn — `null` thì KHÔNG vẽ gì cả, vì một
// khe trống nằm im cạnh chip đọc như "trạng thái lưu đang hỏng".
import { Chip, type ChipKind } from '../../components/ui/Chip'
import { formatDateTime, formatDue, formatPeriod } from '../../lib/format'
import type { DauBaoCao } from './ReportForm'

/** Trạng thái báo cáo → kind của Chip. Trên màn chi tiết `state` không bao giờ null (báo cáo đã
 * tồn tại mới mở được), nên không có nhánh "Chưa nộp" như bảng /reports. `is_late` chỉ đổi nhãn
 * của "Đã nộp" — đúng quy ước chip toàn app (Chip.tsx). */
function kindTrangThai(state: string, isLate: boolean): ChipKind {
  if (state === 'submitted') return isLate ? 'late' : 'submitted'
  if (state === 'approved' || state === 'returned' || state === 'draft') return state
  return 'missing'
}

/** "2026-09-30" (ngày trần của `report.report_date`) → "30/09/2026". KHÔNG dùng `formatDateTime`:
 * hàm đó nhận ISO có giờ; đưa một ngày trần vào nó, `new Date('2026-09-30')` là nửa đêm UTC, đổi
 * sang giờ VN thành 07:00 cùng ngày — đúng ngày nhưng kèm một cái giờ bịa mà ô này không có. */
function ngayVN(iso: string): string {
  const [nam, thang, ngay] = iso.slice(0, 10).split('-')
  return `${ngay}/${thang}/${nam}`
}

/** Mốc thời gian của dòng meta, theo đúng trạng thái đang đứng (bảng chế độ form D14):
 * "Đã nộp <lúc> bởi <người>" / "Trả lại <lúc>" / "Đã duyệt <lúc>". Nháp chưa có mốc nào trong
 * `ReportDetailOut` (không có `updated_at`) nên chỉ hiện tên trạng thái. */
function mocThoiGian(dau: DauBaoCao, state: string): string {
  if (state === 'submitted') {
    const luc = dau.submitted_at ? ` ${formatDateTime(dau.submitted_at)}` : ''
    const boi = dau.reporter_name ? ` bởi ${dau.reporter_name}` : ''
    return `Đã nộp${luc}${boi}`
  }
  if (state === 'returned') return `Trả lại${dau.decided_at ? ` ${formatDateTime(dau.decided_at)}` : ''}`
  if (state === 'approved') return `Đã duyệt${dau.decided_at ? ` ${formatDateTime(dau.decided_at)}` : ''}`
  return 'Nháp'
}

/** Kỳ ngay TRƯỚC `ky` ("2026-08" → "2026-07"). Kỳ FM01 là kỳ THÁNG; cả app đã đặt trên giả định
 * đó từ `formatPeriod` (lib/format.ts). */
function kyTruoc(ky: string): string {
  const [nam, thang] = ky.split('-').map(Number)
  return thang === 1 ? `${nam - 1}-12` : `${nam}-${String(thang - 1).padStart(2, '0')}`
}

/** "Lũy kế đã tính tới <kỳ>" của dòng meta. `missing_periods` (đã sắp tăng dần ở backend) là các
 * kỳ trước kỳ này CHƯA được duyệt, tức lũy kế dừng ngay trước kỳ thiếu ĐẦU TIÊN; không thiếu kỳ
 * nào thì lũy kế tính tới kỳ liền trước. Hai bản vẽ khớp cả hai nhánh: approve.html (không thiếu,
 * kỳ 08/2026 → "tới 07/2026"), states.html (thiếu 07/2026 → "tới 06/2026"). */
export function luyKeTinhToi(ky: string, kyThieu: string[]): string {
  return formatPeriod(kyTruoc(kyThieu.length > 0 ? kyThieu[0] : ky))
}

function OPhanDau({ nhan, giaTri }: { nhan: string; giaTri: string | null }) {
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-[0.02em] text-sec">{nhan}</span>
      {giaTri ?? <span className="text-sec">—</span>}
    </div>
  )
}

export function FormHeader({
  dau,
  state,
  source,
  isLate,
  kyThieu,
  now,
  trangThaiLuu,
}: {
  dau: DauBaoCao
  state: string
  source: string
  isLate: boolean
  kyThieu: string[]
  now: Date
  /** Dòng trạng thái lưu đã gọt sẵn (Task 23), `null` khi chưa có gì để nói. */
  trangThaiLuu: { chu: string; canhBao: boolean } | null
}) {
  const han = formatDue(dau.due_at, now)
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 bg-surface border border-hair rounded-tile px-5 py-3.5 mb-3">
      <div>
        <h1 className="text-pageTitle font-medium text-ink leading-[1.2] m-0">
          {dau.org_unit.name} · {dau.template_code} · {formatPeriod(dau.period_key)}
        </h1>
        <div className="text-table text-sec mt-1">
          <b className="font-medium text-ink">{mocThoiGian(dau, state)}</b>
          <span title={han.title}> · Hạn nộp {han.text}</span>
          <span> · Lũy kế đã tính tới {luyKeTinhToi(dau.period_key, kyThieu)}</span>
        </div>
      </div>
      <div className="self-center flex items-center gap-2">
        {/* `role="status"` (vùng sống lịch sự): "Đang lưu…" → "Đã lưu 14:02" là chuỗi sự kiện
            người dùng cần biết mà không rời tay khỏi bàn phím. `alert` sẽ cắt ngang họ giữa lúc
            gõ, đúng điều fix-1 S12 đã chốt cho các banner tĩnh. */}
        {trangThaiLuu !== null && (
          <span role="status" className={`text-xs ${trangThaiLuu.canhBao ? 'text-warning' : 'text-sec'}`}>
            {trangThaiLuu.chu}
          </span>
        )}
        <Chip kind={kindTrangThai(state, isLate)} outline={source === 'seed'} />
        {/* D14 chế độ 4: báo cáo nạp từ file tổng hợp phải nói ra, vì số của nó không do ai trong
            đơn vị gõ — người đọc cần biết trước khi tin vào nó. */}
        {source === 'seed' && <span className="text-xs text-sec">nạp từ file tổng hợp</span>}
      </div>
      {/* `id="A"`: nhóm A của danh mục ("THÔNG TIN CHUNG") không có chỉ tiêu nào nên không sinh
          hàng nào trong bảng — 5 ô phần đầu này CHÍNH LÀ nhóm A, và là đích nhảy `#A` của mục lục
          (fix-1 S6). `scroll-mt-20` = `scroll-margin-top:80px` như mọi đích nhảy khác. */}
      <div
        id="A"
        className="col-span-2 grid grid-cols-5 gap-x-7 gap-y-1 text-table border-t border-hair pt-2.5 mt-1 scroll-mt-20"
      >
        <OPhanDau nhan="Số báo cáo" giaTri={dau.report_no} />
        <OPhanDau nhan="Địa điểm" giaTri={dau.location} />
        <OPhanDau nhan="Ngày báo cáo" giaTri={dau.report_date ? ngayVN(dau.report_date) : null} />
        <OPhanDau nhan="Người lập" giaTri={dau.reporter_name} />
        <OPhanDau nhan="Chức vụ" giaTri={dau.reporter_position} />
      </div>
    </div>
  )
}
