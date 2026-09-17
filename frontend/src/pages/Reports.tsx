// frontend/src/pages/Reports.tsx
//
// Landing của CẢ HAI vai (brief): người nộp thấy các kỳ của đơn vị mình (5 cột), admin (+ viewer,
// xem useReportList.ts) thấy hàng chờ duyệt (+ cột Đơn vị). AppShell/Sidebar KHÔNG render ở đây —
// bọc ở tầng route (carry C3, app/routes.tsx), giống mọi trang sau RequireAuth khác.
//
// S1a (vòng sửa 1, task-20-fix-1.md): điều hướng nội bộ ("Mở"/"Xem"/"Tạo báo cáo") dùng
// `<Link>`/`useNavigate()` của react-router, KHÔNG dùng `location.*` — dùng `location.assign` sẽ
// tải lại tài liệu đầy đủ và xoá sạch store phiên thuần bộ nhớ, tức MỌI nút trên trang này thực
// chất là một lần đăng xuất (xem S1, session.ts).
//
// Lát 6 dựng lại phần NHÌN theo mockup mục 03 (admin) và 07 (người nộp). Phần CHỮ của tiêu đề
// KHÔNG đổi: `tieuDeHangDoi` là kết luận của Ruling 198/S2 (viewer không được thấy chữ hứa hành
// động "Chờ duyệt"), có bốn ca khoá lại. Mockup ghi "Hàng chờ duyệt" — đó là chữ đẹp hơn nhưng
// nói SAI với vai viewer, nên giữ chữ cũ và chỉ thêm dòng phụ đề dưới nó.
import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useSession } from '../app/session'
import { useReportList, type ReportListItem } from '../features/reports/useReportList'
import { invalidateReportQueries } from '../api/invalidate'
import { Chip, type ChipKind } from '../components/ui/Chip'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../components/ui/empty'
import { SkeletonDong } from '../components/ui/SkeletonDong'
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
  'inline-flex items-center justify-center h-[26px] px-2.5 rounded-md border text-xs font-medium whitespace-nowrap no-underline disabled:opacity-50'
const BTN_PRIMARY = `${BTN_BASE} bg-primary border-primary text-white`
const BTN_QUIET = `${BTN_BASE} bg-card border-border text-foreground transition-colors duration-[120ms] hover:bg-muted`

// `whitespace-nowrap` trên ô dữ liệu, KHÔNG phải một bề rộng tối thiểu cho cả bảng: ở 1024 zoom
// 125% (một trong ba thiết bị đích) sáu cột không đủ chỗ, và mặc định trình duyệt là ngắt dòng
// TỪNG ô — đo được ở /reports "Tất cả": tên đơn vị và mốc Cập nhật mỗi cái xuống hai dòng ở những
// dòng khác nhau, 66 dòng cao thấp lởm chởm. Cấm ngắt thì bảng tự lấy đúng bề rộng nó cần và khung
// bọc `overflow-x-auto` cuộn ngang ĐÚNG phần thiếu — ở 1280 không cuộn một pixel nào.
const O_BANG = 'h-9 px-3 border-b border-border text-sm whitespace-nowrap'
const O_TIEU_DE =
  'h-9 px-3 border-b border-border bg-muted text-[13.5px] text-sec font-semibold text-left whitespace-nowrap'

// Cột Hành động DÍNH MÉP PHẢI — cùng khuôn cột đơn vị dính trái của features/status/StatusGrid.tsx,
// và cùng lý do: ở 1024 zoom 125% sáu cột không vừa, khung bọc cuộn ngang, và nếu để cột này trôi
// theo thì thứ duy nhất trên mỗi dòng BẤM ĐƯỢC lại là thứ đầu tiên biến mất khỏi màn hình. Ô dính
// phải TỰ MANG NỀN (nội dung cuộn qua dưới nó nếu nền trong suốt), nên hiệu ứng rê chuột của dòng
// phải nhắc lại bằng `group-hover` thay vì thừa hưởng nền của `<tr>`.
const O_DINH = 'sticky right-0 z-10 border-l border-border'

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

  // Với người nộp, kỳ đang mở CHƯA tạo báo cáo là việc DUY NHẤT trang này mời họ làm — nút chính,
  // không phải một nút xám ngang hàng với "Xem" của các kỳ đã xong (mockup mục 07).
  return (
    <button type="button" onClick={xuLy} disabled={dangTao} className={BTN_PRIMARY}>
      {dangTao ? 'Đang tạo…' : 'Tạo báo cáo'}
    </button>
  )
}

function OHanhDong({
  row,
  isAdmin,
  coQuyenDuyet,
}: {
  row: ReportListItem
  isAdmin: boolean
  coQuyenDuyet: boolean
}) {
  // S5 (vòng sửa 1, task-20-fix-1.md): dòng phòng thủ — FE suy `isAdmin` từ MÃ QUYỀN
  // (report.approve|report.view_all), còn BE đổi HÌNH DẠNG dữ liệu theo PHẠM VI
  // (pham_vi_bao_cao — deps.py). Hai thứ khớp nhau hôm nay (seed hiện có), nhưng nếu một ngày có
  // người được cấp report.view_all kèm phạm vi hẹp, BE có thể vẫn trả dòng `state === null` cho
  // một người không có report.create — kiểm `isAdmin` TRƯỚC khi rơi vào nhánh "Tạo báo cáo" để
  // không hiện nhầm nút cho người không có quyền tạo.
  if (row.state === null)
    return isAdmin ? (
      <span className="text-muted-foreground" data-testid="o-hanh-dong-rong">
        —
      </span>
    ) : (
      <NutTaoBaoCao periodKey={row.period_key} />
    )
  // Admin/viewer (report.approve|report.view_all): luôn "Mở" — vào để duyệt hoặc chỉ để xem, cả
  // hai đều là "mở báo cáo ra". Người nộp: chỉ trạng thái còn sửa được (draft/returned) mới "Mở",
  // còn lại (submitted/approved) chỉ "Xem" — is_editable theo backend/app/seed/__init__.py STATES.
  const laMo = isAdmin || row.state === 'draft' || row.state === 'returned'
  // Lát 6 — SỨC NẶNG của nút không đi theo CHỮ mà đi theo "dòng này có đang chờ CHÍNH NGƯỜI ĐANG
  // XEM làm gì không". Bản trước tô nút chính cho MỌI dòng của admin: ở chế độ "Tất cả" (66 dòng
  // trên seed thật) đó là 66 nút navy như nhau, và màu nhấn không còn nghĩa gì. Người duyệt chỉ
  // có việc với dòng `submitted`; viewer không duyệt được nên không dòng nào là việc của họ.
  const noiBat = isAdmin ? coQuyenDuyet && row.state === 'submitted' : laMo
  return (
    <Link to={`/reports/${row.id}`} className={noiBat ? BTN_PRIMARY : BTN_QUIET}>
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

function HangBaoCao({
  row,
  isAdmin,
  coQuyenDuyet,
  now,
}: {
  row: ReportListItem
  isAdmin: boolean
  coQuyenDuyet: boolean
  now: Date
}) {
  const han = hanNop(row, now)
  return (
    <tr className="group transition-colors duration-[120ms] hover:bg-muted/50">
      {isAdmin && (
        <td className={O_BANG}>
          {/* Mã TRƯỚC tên, cùng khuôn bảng đơn vị của Dashboard (Lát 4): tên seed hiện tại chỉ
              khác nhau ở hai chữ số cuối, nên ở một bảng 66 dòng cái mắt bám được là cái mã. */}
          <span className="font-mono text-xs text-muted-foreground">{row.org_unit.code}</span>
          <span className="ml-2">{row.org_unit.name}</span>
        </td>
      )}
      <td className={O_BANG} data-testid="o-ky">
        {formatPeriod(row.period_key)}
      </td>
      {/* Ô DUY NHẤT được phép xuống dòng: ghi chú Trả lại dài tới 120 ký tự, cấm ngắt ở đây là
          kéo bảng rộng ra gấp nhiều lần vì một dòng. */}
      <td className={`${O_BANG} whitespace-normal align-middle`}>
        <Chip kind={kindTrangThai(row.state, row.is_late)} outline={row.source === 'seed'} />
        {row.state === 'returned' && row.decision_note && (
          <div className="block text-xs text-destructive leading-[1.3] mt-0.5" data-testid="ghi-chu-tra-lai">
            {ghiChuTraLai(row.decision_note)}
          </div>
        )}
      </td>
      <td className={O_BANG} title={han.title} data-testid="o-han-nop">
        {han.text}
      </td>
      <td className={O_BANG} data-testid="o-cap-nhat">
        {row.updated_at ? formatDateTime(row.updated_at) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className={`${O_BANG} ${O_DINH} bg-card transition-colors duration-[120ms] group-hover:bg-muted/50`}>
        <OHanhDong row={row} isAdmin={isAdmin} coQuyenDuyet={coQuyenDuyet} />
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
//
// Con số trong ngoặc là SỐ DÒNG CỦA HÀNG ĐỢI, không phải số dòng đang hiện sau ô tìm kiếm: nó trả
// lời "còn bao nhiêu việc", một câu không được đổi nghĩa theo chuỗi người dùng vừa gõ. Kết quả lọc
// của ô tìm có con số riêng, đặt ngay cạnh chính ô đó.
function tieuDeHangDoi(opts: { coQuyenDuyet: boolean; xemTatCa: boolean; isLoading: boolean; soDong: number }): string {
  const so = opts.isLoading ? '' : ` (${formatNumber(opts.soDong, 0)})`
  if (opts.xemTatCa) return `Tất cả báo cáo${so}`
  return opts.coQuyenDuyet ? `Chờ duyệt${so}` : `Báo cáo đã nộp${so}`
}

// Bỏ dấu để ô tìm kiếm khớp cả khi gõ không dấu — cách người Việt gõ nhanh thường ngày ("dinh vu"
// phải ra "PTSC Đình Vũ"). `normalize('NFD')` tách dấu thanh/mũ ra thành ký tự tổ hợp rồi xoá,
// nhưng đ/Đ là CHỮ CÁI RIÊNG trong Unicode (không phải d + dấu) nên không tách ra được — phải thay
// tay, nếu không "dinh" vẫn trượt "đình".
function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

function NutLoc({ dangChon, onClick, children }: { dangChon: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={dangChon}
      onClick={onClick}
      className={`h-7 cursor-pointer rounded-[5px] border-0 px-3 text-sm font-medium ${
        dangChon ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

export function Reports() {
  const { items, isAdmin, xemTatCa, setXemTatCa, isLoading, isError, refetch } = useReportList()
  const orgUnit = useSession((s) => s.orgUnit)
  const coQuyenDuyet = useSession((s) => s.permissions.has('report.approve'))
  const [tim, setTim] = useState('')
  const now = new Date()

  const tieuDe = !isAdmin
    ? 'Báo cáo SKATMT'
    : tieuDeHangDoi({ coQuyenDuyet, xemTatCa, isLoading, soDong: items.length })

  // Nối phần rỗng thì BỎ HẲN, không để lại dấu chấm giữa treo lơ lửng: `orgUnit` là `null` ngay
  // sau khi đăng xuất và trong lúc `/auth/me` chưa về.
  const phuDe = (
    isAdmin
      ? ['Mẫu FM01', 'gộp mọi kỳ — không theo kỳ chọn ở thanh bên']
      : [orgUnit?.name, 'mẫu FM01', 'một kỳ mỗi tháng']
  )
    .filter(Boolean)
    .join(' · ')

  // Ô tìm CHỈ lọc trên dữ liệu ĐANG CÓ, không gọi lại API: hàng đợi lớn nhất của seed thật là 66
  // dòng và đã nằm sẵn trong bộ nhớ. Chỉ vai admin/viewer có ô này — người nộp xem đúng một đơn vị
  // của mình nên không có gì để tìm.
  const tuKhoa = boDau(tim.trim())
  const hienThi =
    tuKhoa === ''
      ? items
      : items.filter((r) => boDau(`${r.org_unit.code} ${r.org_unit.name}`).includes(tuKhoa))
  const coDong = !isLoading && !isError && items.length > 0
  const dangLoc = isAdmin && coDong && tuKhoa !== ''

  const soCot = isAdmin ? 6 : 5

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl tracking-[-0.4px] font-medium text-foreground">{tieuDe}</h1>
          {phuDe && <p className="mt-1 text-sm text-muted-foreground">{phuDe}</p>}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Lọc theo trạng thái"
              className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5"
            >
              {/* CẢ HAI là <button>, kể cả mục đang chọn: bản trước dựng mục đang chọn bằng <span>,
                  nên bàn phím không tới được nó và trình đọc màn hình không có gì để đọc trạng thái.
                  `aria-pressed` là thứ nói "đang bật", không phải màu nền. */}
              <NutLoc dangChon={!xemTatCa} onClick={() => setXemTatCa(false)}>
                Đã nộp
              </NutLoc>
              <NutLoc dangChon={xemTatCa} onClick={() => setXemTatCa(true)}>
                Tất cả
              </NutLoc>
            </div>
            {/* Ô tìm chỉ có nghĩa khi CÓ dòng để tìm: hàng đợi rỗng mà vẫn bày ô tìm là mời người
                dùng gõ vào một chỗ không bao giờ trả lời được. Bộ lọc trạng thái thì NGƯỢC LẠI —
                nó chính là lối thoát khỏi một hàng đợi rỗng, nên luôn hiện. */}
            {coDong && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={tim}
                onChange={(e) => setTim(e.target.value)}
                aria-label="Tìm đơn vị"
                placeholder="Tìm đơn vị…"
                className="h-8 w-52 rounded-md border border-border bg-card pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-ring focus:-outline-offset-2"
              />
            </div>
            )}
            {dangLoc && (
              <span className="text-xs text-muted-foreground">
                {formatNumber(hienThi.length, 0)}/{formatNumber(items.length, 0)} dòng
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <SkeletonDong rows={4} />
      ) : isError ? (
        <InlineError message="Không tải được danh sách báo cáo" onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty className="rounded-xl border border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>{isAdmin ? 'Không có báo cáo chờ duyệt' : 'Chưa có kỳ báo cáo nào đang mở'}</EmptyTitle>
            <EmptyDescription>
              {isAdmin
                ? 'Khi một đơn vị nộp báo cáo, nó hiện ở đây.'
                : 'Kỳ mới mở là dòng "Tạo báo cáo" xuất hiện ở đây.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  {isAdmin && <th className={O_TIEU_DE}>Đơn vị</th>}
                  <th className={O_TIEU_DE}>Kỳ</th>
                  <th className={O_TIEU_DE}>Trạng thái</th>
                  <th className={O_TIEU_DE}>Hạn nộp</th>
                  <th className={O_TIEU_DE}>Cập nhật</th>
                  <th className={`${O_TIEU_DE} ${O_DINH}`}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {hienThi.map((row) => (
                  <HangBaoCao
                    key={`${row.org_unit.code}-${row.period_key}`}
                    row={row}
                    isAdmin={isAdmin}
                    coQuyenDuyet={coQuyenDuyet}
                    now={now}
                  />
                ))}
                {/* Lọc không ra dòng nào là một màn hình TRỐNG có nguyên nhân rõ và có lối thoát —
                    khác hẳn hàng đợi rỗng ở trên (không có việc để làm). Hai cảnh này không được
                    dùng chung một câu. */}
                {hienThi.length === 0 && (
                  <tr>
                    <td colSpan={soCot} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Không có đơn vị nào khớp “{tim.trim()}”
                      <button
                        type="button"
                        onClick={() => setTim('')}
                        className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent text-secondary-foreground underline"
                      >
                        <X className="size-3.5" />
                        Xoá bộ lọc
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
