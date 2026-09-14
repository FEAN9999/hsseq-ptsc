// frontend/src/features/report/ReportForm.tsx
//
// Form FM01: dải đầu + 3 banner + bảng 53 dòng + mục lục + nhóm C dưới bảng + thanh dính dưới.
//
// BỐN ĐIỀU ĐỊNH HÌNH FILE NÀY:
//
// 1. TRẠNG THÁI FORM TÁCH KHỎI CACHE TanStack Query (thiết kế D14). Số đang gõ, ghi chú, chữ
//    nhóm C sống trong `useReducer` dưới đây. 409 (`xungDot`) chỉ VÁ cột chỉ đọc + `version` vào
//    chính state đó — không `setQueryData` đè cả form, vì đè là xoá mất thứ người dùng đang gõ.
//
// 2. CHẾ ĐỘ ĐI THEO QUYỀN, KHÔNG THEO VAI (task-22-carry.md C1). Store phiên không giữ `roles`;
//    mọi quyết định hiển thị đọc `permissions`. `is_editable` của trạng thái và danh sách nút đều
//    lấy từ `GET /templates/{code}` chứ không viết cứng "draft"/"submitted" ở đây.
//
// 3. BA CHẾ ĐỘ Ô LÀ BA THỨ KHÁC NHAU (task-22-carry.md C9). `cellPolicy` trả `input | derived |
//    empty`. `derived` = ô CÓ tồn tại, chỉ đọc, hiện số tính ra (thiếu số thì "—"). `empty` = ô
//    KHÔNG tồn tại với loại chỉ tiêu này (chỉ `snapshot`) — để TRẮNG HOÀN TOÀN, đến "—" cũng
//    không được hiện, vì "—" nghĩa là "có ô này, chưa có số".
//
// 4. Ô CHỈ ĐỌC LÀ `<td>` CHỮ THƯỜNG, không phải `<input disabled>` (a11y, Pass 6) — và nhờ đó
//    thứ tự Tab mặc định của trình duyệt đã tự bỏ qua chúng (xem useKeyboardNav.tsx).
import { useEffect, useMemo, useReducer, useRef } from 'react'

import { Banner } from '../../components/ui/Banner'
import { Dialog } from '../../components/ui/Dialog'
import { useSession } from '../../app/session'
import type { ApiErrorItem } from '../../api/client'
import { parseViNumber } from '../../lib/parseViNumber'
import { formatDateTime, formatPeriod } from '../../lib/format'
import { cellPolicy, type AggType, type Cell, type Mode } from './cellPolicy'
import { NumberCell, dinhDangSoBang, type NumberCellProps } from './NumberCell'
import { FormHeader } from './FormHeader'
import { FormModeBar, maNeo } from './FormModeBar'
import { GroupHeader, type NhomMau } from './GroupHeader'
import { useKeyboardNav } from './useKeyboardNav'
import { useSaveValues, type KetQuaLuu, type ODoi } from './useSaveValues'
import { noiDungDialog, useChuyenTrangThai, type LoiChuyen } from './useChuyenTrangThai'

// ---------------------------------------------------------------- hợp đồng API
// Hình dạng chép từ backend: `ReportDetailOut` (app/schemas/report.py:80) và
// `GET /templates/{code}` (app/api/templates.py:80). Không thêm/bớt trường.

export interface DonViTom {
  code: string
  name: string
}

export interface BoDemKiemTra {
  status: string
  expected: number | null
  message: string
}

export interface GiaTriBaoCao {
  indicator_code: string
  this_period: number | null
  acc_prev_entered: number | null
  acc_total_entered: number | null
  acc_prev_computed: number | null
  acc_total_computed: number | null
  diff: number | null
  counter_check: BoDemKiemTra | null
  note: string | null
}

export interface DauBaoCao {
  org_unit: DonViTom
  template_code: string
  period_key: string
  due_at: string
  report_no: string | null
  location: string | null
  report_date: string | null
  reporter_name: string | null
  reporter_position: string | null
  submitted_at: string | null
  decided_at: string | null
  decision_note: string | null
}

export interface ChiTietBaoCao {
  id: number
  version: number
  state: string
  source: string
  is_late: boolean
  header: DauBaoCao
  missing_periods: string[]
  values: GiaTriBaoCao[]
  texts: Record<string, string | null>
}

export interface ChiTieuMau {
  code: string
  section_code: string
  name_vi: string
  name_en: string
  unit: string | null
  agg_type: string
  formula: string | null
  decimals: number
  required: boolean
  sort_order: number
}

export interface TrangThaiMau {
  code: string
  name_vi: string
  is_editable: boolean
}

export interface ChuyenTrangThai {
  action_code: string
  from_state: string
  to_state: string
  name_vi: string
  required_permission: string
  requires_note: boolean
}

export interface MauBaoCao {
  sections: NhomMau[]
  indicators: ChiTieuMau[]
  text_fields: { code: string; label_vi: string }[]
  states: TrangThaiMau[]
  transitions: ChuyenTrangThai[]
}

/** Thân lỗi 409 của `PUT /reports/{id}/values` (backend/app/services/reports.py:414) đã bóc sẵn
 * bởi `ApiError` (api/client.ts). Task 23 bắt lỗi rồi đẩy xuống đây. */
export interface LoiXungDot {
  detail: string
  version: number
  values: GiaTriBaoCao[]
}

// ---------------------------------------------------------------- trạng thái form

interface ONhap {
  thisPeriod: number | null
  accTotal: number | null
}

interface TrangThaiForm {
  version: number
  /** Chỉ hai cột NHẬP ĐƯỢC. Cột "Lũy kế tháng trước" không agg_type nào cho nhập (cellPolicy). */
  nhap: Record<string, ONhap>
  ghiChu: Record<string, string>
  chu: Record<string, string>
  /** Các cột CHỈ ĐỌC do server tính (lũy kế, dòng computed, lệch, kiểm tra bộ đếm). Đây là thứ
   * DUY NHẤT mà 409 được phép vá. */
  server: Record<string, GiaTriBaoCao>
  daBamNop: boolean
  /** Mã các dòng bị BỎ QUA ở lần dán cột gần nhất (fix-1 S1). Dán im lặng nuốt dòng là cách
   * chắc chắn nhất để người nhập tưởng hệ thống hỏng: họ dán một cột Excel bản en-US
   * ("402100.00") và KHÔNG có gì xảy ra. */
  boQuaKhiDan: string[]
  /** Số dòng của lần dán gần nhất TRÀN khỏi cuối lưới (fix-2 F1). Đếm riêng, KHÔNG gộp vào
   * `boQuaKhiDan`: hai nguyên nhân khác hẳn nhau, và dòng tràn không có mã chỉ tiêu nào để nêu
   * tên — chỉ đếm được. Dán 60 dòng bắt đầu từ B-8.1 thì phần thừa cũng bị nuốt im lặng y như
   * dòng không đọc được, đúng lớp lỗi S1 sinh ra để diệt. */
  tranKhiDan: number
  xungDot: { detail: string; tuPhienBan: number; denPhienBan: number } | null
  /** Lỗi của lượt chuyển trạng thái gần nhất (Task 24). KHÔNG gộp vào `xungDot`: 409 của
   * `POST .../transition` mang `{state, version}` mà KHÔNG mang `values`, và hai loại 409 của nó
   * không phân biệt được từ thân lỗi (hop-dong-loi-backend.md) — nên nó không có quyền nói câu
   * "phiên bản X → Y. Ô đang gõ được giữ" như banner 409 của lớp lưu. Chỉ hiện `detail` nguyên
   * văn, kèm từng dòng `errors` của 400 "thiếu ô bắt buộc lúc nộp". */
  loiChuyen: LoiChuyen | null
}

type HanhDongForm =
  | { type: 'nhap-o'; ma: string; cot: Cell; value: number | null }
  | { type: 'dan-xong'; boQua: string[]; tran: number }
  | { type: 'ghi-chu'; ma: string; noiDung: string }
  | { type: 'chu'; ma: string; noiDung: string }
  | { type: 'bam-nop' }
  | { type: 'loi-chuyen'; loi: LoiChuyen | null }
  | { type: 'xung-dot'; loi: LoiXungDot }
  | { type: 'gia-tri-server'; phienBan: number; values: GiaTriBaoCao[] }

function khoiTao(chiTiet: ChiTietBaoCao): TrangThaiForm {
  const nhap: Record<string, ONhap> = {}
  const ghiChu: Record<string, string> = {}
  const server: Record<string, GiaTriBaoCao> = {}
  for (const v of chiTiet.values) {
    nhap[v.indicator_code] = { thisPeriod: v.this_period, accTotal: v.acc_total_entered }
    ghiChu[v.indicator_code] = v.note ?? ''
    server[v.indicator_code] = v
  }
  const chu: Record<string, string> = {}
  for (const [ma, noiDung] of Object.entries(chiTiet.texts)) chu[ma] = noiDung ?? ''
  return {
    version: chiTiet.version,
    nhap,
    ghiChu,
    chu,
    server,
    daBamNop: false,
    boQuaKhiDan: [],
    tranKhiDan: 0,
    xungDot: null,
    loiChuyen: null,
  }
}

function rutGon(s: TrangThaiForm, h: HanhDongForm): TrangThaiForm {
  switch (h.type) {
    case 'nhap-o': {
      // `accPrev` không bao giờ tới đây: không agg_type nào cho nhập cột đó, nên nó không có ô
      // nhập nào để bắn hành động này ra.
      const cu = s.nhap[h.ma] ?? { thisPeriod: null, accTotal: null }
      // `boQuaKhiDan: []`: gõ tay là thao tác MỚI, kết quả lần dán trước thôi là chuyện đang xảy
      // ra. `danCot` bắn hết `nhap-o` RỒI mới bắn `dan-xong`, nên dòng này không xoá mất thông
      // điệp của chính lần dán đó.
      return {
        ...s,
        boQuaKhiDan: [],
        tranKhiDan: 0,
        nhap: { ...s.nhap, [h.ma]: { ...cu, [h.cot]: h.value } },
      }
    }
    case 'dan-xong':
      return { ...s, boQuaKhiDan: h.boQua, tranKhiDan: h.tran }
    case 'ghi-chu':
      return { ...s, ghiChu: { ...s.ghiChu, [h.ma]: h.noiDung } }
    case 'chu':
      return { ...s, chu: { ...s.chu, [h.ma]: h.noiDung } }
    case 'bam-nop':
      return { ...s, daBamNop: true }
    case 'loi-chuyen':
      return { ...s, loiChuyen: h.loi }
    case 'gia-tri-server': {
      // task-23-carry.md C9: phản hồi của `PUT /reports/{id}/values` mang `values` đã TÍNH LẠI
      // (dòng computed, lũy kế, cột Lệch, kiểm tra bộ đếm) — cùng đường tính với GET. Đây là con
      // đường DUY NHẤT để dòng "Tổng giờ công" đổi số, vì không có bản sao `evaluate_computed`
      // nào phía TypeScript. Vá ĐÚNG cột chỉ đọc + `version`, y như nhánh 409 ngay dưới: `nhap`/
      // `ghiChu`/`chu` là thứ người dùng đang gõ, server không có quyền đè lên.
      const server = { ...s.server }
      for (const v of h.values) server[v.indicator_code] = v
      return { ...s, version: h.phienBan, server }
    }
    case 'xung-dot': {
      // CHỈ cột chỉ đọc + version. `nhap`/`ghiChu`/`chu` giữ nguyên: người khác vừa ghi đè bản
      // trên server không có nghĩa là số đang nằm dưới tay người này bị vứt đi.
      const server = { ...s.server }
      for (const v of h.loi.values) server[v.indicator_code] = v
      return {
        ...s,
        version: h.loi.version,
        server,
        xungDot: { detail: h.loi.detail, tuPhienBan: s.version, denPhienBan: h.loi.version },
      }
    }
  }
}

// ---------------------------------------------------------------- quy tắc hiển thị một dòng

const RONG: GiaTriBaoCao = {
  indicator_code: '',
  this_period: null,
  acc_prev_entered: null,
  acc_total_entered: null,
  acc_prev_computed: null,
  acc_total_computed: null,
  diff: null,
  counter_check: null,
  note: null,
}

/** Cộng dồn của dòng `sum`, tính NGAY TRÊN CLIENT theo từng phím (storyboard 1). `acc_prev` null
 * tính như 0 (kỳ đầu chưa có lũy kế), nhưng CẢ HAI null thì kết quả là null chứ không phải 0 —
 * ràng buộc toàn cục: ô trống và ô nhập 0 là hai chuyện khác nhau. */
function congDon(accPrev: number | null, thisPeriod: number | null): number | null {
  if (accPrev === null && thisPeriod === null) return null
  return (accPrev ?? 0) + (thisPeriod ?? 0)
}

/** Giá trị hiển thị của ba cột trên một dòng.
 *
 * Cột "Lũy kế tháng trước" đọc từ hai trường KHÁC NHAU tuỳ loại chỉ tiêu, đúng như backend dựng
 * (app/services/reports.py:200-215): `counter` lấy `acc_prev_entered` (backend gán bằng tổng của
 * kỳ duyệt gần nhất, không phải số ai nhập), các loại còn lại lấy `acc_prev_computed` (view
 * `v_report_value_computed` chỉ phủ `sum`, rồi `computed` cộng lại từ đó). Gộp hai trường bằng
 * `??` sẽ đúng hôm nay và sai âm thầm ngày báo cáo seed có ghi sẵn `acc_prev_entered` cho dòng
 * `sum`. */
function giaTriDong(ct: ChiTieuMau, sv: GiaTriBaoCao, nhap: ONhap) {
  const cs = cellPolicy(ct.agg_type as AggType)
  const accPrev = ct.agg_type === 'counter' ? sv.acc_prev_entered : sv.acc_prev_computed
  const thisPeriod = cs.thisPeriod === 'input' ? nhap.thisPeriod : sv.this_period
  const accTotal =
    cs.accTotal === 'input'
      ? nhap.accTotal
      : ct.agg_type === 'sum'
        ? congDon(accPrev, thisPeriod)
        : sv.acc_total_computed
  return { cs, accPrev, thisPeriod, accTotal }
}

/** Giá trị của ô mà `cellPolicy` chấm là bắt buộc. `requiredCell` chỉ có thể là một trong HAI cột
 * nhập được (cellPolicy.ts: `sum`→thisPeriod, `counter`/`snapshot`→accTotal); kiểu `Cell` rộng hơn
 * thực tế nên không viết nhánh thứ ba cho `accPrev` — nhánh đó không bao giờ chạy được, và mã cho
 * tình huống không thể xảy ra là thứ CLAUDE.md #2 cấm (fix-1 S9). */
function giaTriBatBuoc(o: ONhap, cot: Cell): number | null {
  return cot === 'thisPeriod' ? o.thisPeriod : o.accTotal
}

/** Ô đã đổi của lớp lưu, theo TÊN CỘT. Không có nhánh `accPrev` vì cùng lý do với `giaTriBatBuoc`:
 * không agg_type nào cho nhập cột đó nên không ô nào bắn ra được. */
function oDoi(cot: Cell, value: number | null): ODoi {
  return cot === 'thisPeriod' ? { thisPeriod: value } : { accTotal: value }
}

/** Dòng trạng thái lưu ở dải đầu (thiết kế dòng 681). `null` = chưa có gì để nói (chưa đụng vào
 * form) — không hiện một khe trống.
 *
 * Thứ tự các nhánh là thứ tự ĐỘ KHẨN, không phải thứ tự của `status`: còn ô chưa lưu thì câu đó
 * thắng "Đã lưu 14:02" cũ, và `error` cũng hiện "Chưa lưu (n ô)" chứ không hiện một câu lỗi
 * riêng — thiết kế nói "lưu thất bại mạng → giữ 'Chưa lưu' + banner offline", lỗi nói ở banner.
 *
 * `loiLamMoi` (fix-1 F1) xếp SAU hai câu nói về nguy cơ mất số và TRƯỚC "Đã lưu": lượt làm mới
 * nền hỏng không mất gì của người dùng, nhưng nó là tin mới hơn lần lưu vừa xong, và để yên
 * "Đã lưu 14:02" một mình là giấu mất chuyện màn hình có thể đang cũ. */
function dongTrangThaiLuu(l: KetQuaLuu, loiLamMoi: boolean): { chu: string; canhBao: boolean } | null {
  if (l.status === 'saving') return { chu: 'Đang lưu…', canhBao: false }
  if (l.dirtyCount > 0) return { chu: `Chưa lưu (${l.dirtyCount} ô)`, canhBao: true }
  if (loiLamMoi) return { chu: 'Không làm mới được số liệu', canhBao: true }
  if (l.savedAt !== null) return { chu: `Đã lưu ${l.savedAt}`, canhBao: false }
  return null
}

// ---------------------------------------------------------------- ô của bảng

const TD = 'h-9 px-3 border-b border-hair align-middle'

/** Ô CHỈ ĐỌC: `<td>` chữ thường. `aria-label` trên chính `<td>` (không phải trên một `<span>` bên
 * trong) để trình đọc màn hình và test gọi ô bằng đúng một cái tên với ô nhập cùng cột.
 *
 * `mo` = số này do MÁY tính ra (lũy kế, dòng tự tính, cột Lệch) — bản vẽ cho nó màu chữ phụ
 * (`.num.sec`) để tách khỏi số do người nhập gõ, vốn giữ màu mực chính kể cả khi form đã khoá. */
function ODoc({ nhan, value, decimals, mo }: { nhan: string; value: number | null; decimals: number; mo: boolean }) {
  return (
    <td aria-label={nhan} className={`${TD} text-right tnum ${mo ? 'text-sec' : 'text-ink'}`}>
      {dinhDangSoBang(value, decimals)}
    </td>
  )
}

function OGiaTri({
  mode,
  suaDuoc,
  nhan,
  value,
  decimals,
  cot,
  loiNgoai,
  onChange,
  onCommit,
  onPasteColumn,
}: {
  mode: Mode
  suaDuoc: boolean
  nhan: string
  value: number | null
  decimals: number
  cot: Cell
  loiNgoai: string | null
  /** Không bắt buộc: cột "Lũy kế tháng trước" không agg_type nào cho nhập, nên nó gọi component
   * này mà không có dây nào cả (fix-1 S9). */
  onChange?: (value: number | null) => void
  /** Rời ô CÓ SỬA — nơi lớp lưu (Task 23) bám vào. Khác `onChange` (mỗi phím gõ, để cột "Cộng
   * dồn" cộng tức thì): một PUT mỗi phím là thứ debounce sinh ra để tránh. */
  onCommit?: NumberCellProps['onCommit']
  onPasteColumn?: (dong: string[]) => void
}) {
  // C9: `empty` khác `derived`. Ô này KHÔNG tồn tại với loại chỉ tiêu đang xét, nên không nhãn,
  // không "—", không gì cả — mọi dấu vết đều đọc thành "có ô, chưa điền".
  if (mode === 'empty') return <td className={TD} />
  // Form khoá (D14 chế độ 3/4/5): ô lẽ ra nhập được thành chữ thường, nhưng vẫn là số NGƯỜI nhập
  // nên không làm mờ như ô máy tính.
  if (mode === 'derived' || !suaDuoc) {
    return <ODoc nhan={nhan} value={value} decimals={decimals} mo={mode === 'derived'} />
  }
  return (
    <td data-cot={cot} className={`${TD} py-0.5`}>
      <NumberCell
        value={value}
        decimals={decimals}
        ariaLabel={nhan}
        loiNgoai={loiNgoai}
        onChange={(kq) => onChange?.(kq.value)}
        onCommit={onCommit}
        onPasteColumn={onPasteColumn}
      />
    </td>
  )
}

// ---------------------------------------------------------------- form

export interface ReportFormProps {
  mau: MauBaoCao
  chiTiet: ChiTietBaoCao
  /** Một lượt làm mới NỀN của trang (`GET /reports/{id}` sau mỗi lần lưu) vừa hỏng. Không phá màn
   * hình: số trên bảng vẫn là số đọc được lần cuối, đã vá bằng phản hồi PUT (C9) — chỉ nói ra ở
   * dải đầu để người nhập biết màn hình có thể đang cũ (fix-1 F1). */
  loiLamMoi?: boolean
  /** Thay hành động "Lưu" của Ctrl+S và nút Lưu. Từ Task 23 lớp lưu nằm ngay trong form nên app
   * thật KHÔNG truyền prop này; nó ở lại vì Ctrl+S bấm trong lúc CON TRỎ CÒN TRONG Ô không sinh
   * ra `PUT` nào (`NumberCell` chỉ chốt ô lúc rời ô), nên đó là seam DUY NHẤT đo được phần phím
   * tắt: chặn hộp "Lưu trang", Cmd+S, CapsLock, gỡ listener lúc unmount, closure mới nhất. */
  onLuu?: () => void
}

export function ReportForm({ mau, chiTiet, loiLamMoi = false, onLuu }: ReportFormProps) {
  const [s, dispatch] = useReducer(rutGon, chiTiet, khoiTao)
  const quyen = useSession((st) => st.permissions)
  const formRef = useRef<HTMLDivElement>(null)
  const luuGiaTri = useSaveValues(chiTiet.id, chiTiet.version)
  const chuyen = useChuyenTrangThai(chiTiet.id, chiTiet.header, {
    onLoi: (loi) => dispatch({ type: 'loi-chuyen', loi }),
  })

  const luu = onLuu ?? (() => void luuGiaTri.saveNow())
  // Gắn ở GỐC form chứ không ở riêng khung bảng: Ctrl+S phải chạy cả khi người dùng đang đứng
  // trong textarea nhóm C — vừa gõ xong phần nhận xét là lúc người ta bấm lưu nhiều nhất.
  useKeyboardNav(formRef, luu)

  // 409 của lớp lưu. Theo dõi bằng DANH TÍNH object — mỗi lần xung đột là một object mới, nên
  // effect chạy đúng một lần cho mỗi lần xung đột.
  const xungDotHienTai = luuGiaTri.xungDot
  useEffect(() => {
    if (xungDotHienTai) dispatch({ type: 'xung-dot', loi: xungDotHienTai })
  }, [xungDotHienTai])

  // C9: mỗi lần lưu thành công, server trả về giá trị đã tính lại — vá vào cột chỉ đọc.
  const giaTriMoi = luuGiaTri.giaTriMoi
  useEffect(() => {
    if (giaTriMoi) dispatch({ type: 'gia-tri-server', phienBan: giaTriMoi.version, values: giaTriMoi.values })
  }, [giaTriMoi])

  const trangThai = mau.states.find((t) => t.code === chiTiet.state)
  const suaDuoc = (trangThai?.is_editable ?? false) && quyen.has('report.edit')
  const coCotLech = quyen.has('report.approve')
  const chuyenDuoc = mau.transitions.filter(
    (c) => c.from_state === chiTiet.state && quyen.has(c.required_permission),
  )

  const nhomCoDong = useMemo(
    () =>
      mau.sections
        .map((nhom) => ({ nhom, ds: mau.indicators.filter((ct) => ct.section_code === nhom.code) }))
        .filter((g) => g.ds.length > 0),
    [mau],
  )

  const thieuBatBuoc = useMemo(() => {
    if (!s.daBamNop) return []
    return mau.indicators
      .filter((ct) => {
        const { requiredCell } = cellPolicy(ct.agg_type as AggType)
        if (!ct.required || requiredCell === null) return false
        const o = s.nhap[ct.code] ?? { thisPeriod: null, accTotal: null }
        return giaTriBatBuoc(o, requiredCell) === null
      })
      .map((ct) => ct.code)
  }, [s.daBamNop, s.nhap, mau.indicators])

  // D25: bộ đếm lệch công thức mà dòng đó chưa có ghi chú — không chặn nộp, chỉ nói ra.
  const soDemLech = mau.indicators.filter(
    (ct) => s.server[ct.code]?.counter_check?.status === 'lech' && (s.ghiChu[ct.code] ?? '') === '',
  ).length

  /** Dán một cột từ Excel (task-22-carry.md C10): `NumberCell` trả CHUỖI THÔ, nơi phân tích là
   * đây — mỗi dòng đích phân tích bằng `decimals` CỦA CHÍNH NÓ. Phân tích bằng `decimals` của ô
   * khởi điểm sẽ nuốt số ở dòng khai nhiều thập phân hơn (B-2.1 là 0, B-1.1 là 2). */
  function danCot(maBatDau: string, cot: Cell, dong: string[]) {
    const dsNhap = mau.indicators.filter((ct) => cellPolicy(ct.agg_type as AggType)[cot] === 'input')
    const bd = dsNhap.findIndex((ct) => ct.code === maBatDau)
    const boQua: string[] = []
    let tran = 0
    dong.forEach((chuoi, i) => {
      const ct = dsNhap[bd + i]
      // Dán dài hơn số dòng còn lại: phần thừa không có ô nào để vào — đếm rồi nói ra (fix-2 F1).
      if (ct === undefined) {
        tran += 1
        return
      }
      const { value, error } = parseViNumber(chuoi, ct.decimals)
      // Dòng không đọc được thì GIỮ NGUYÊN ô đích. Ghi `null` đè lên số cũ là xoá dữ liệu vì một
      // ô rác trong vùng copy — dòng TRỐNG thì khác, `parseViNumber('')` trả null không lỗi và
      // đúng nghĩa "ô này để trống" (NumberCell fix-1 S5).
      if (error === null) {
        dispatch({ type: 'nhap-o', ma: ct.code, cot, value })
        // Dán cột PHẢI tự đánh dấu chưa lưu: `NumberCell` chỉ bắn `onCommit` cho đúng ô đang đứng
        // (và cũng chỉ khi chữ trong ô đó đổi), nên 54 ô còn lại của một cột vừa dán sẽ không bao
        // giờ được gửi đi nếu chỉ trông vào blur — đúng lớp lỗi "dán rồi mất số" của fix-1 S1.
        luuGiaTri.markDirty(ct.code, oDoi(cot, value))
      } else boQua.push(ct.code)
    })
    // Bắn CẢ KHI lần dán này trọn vẹn: đó là cách xoá thông điệp của lần dán trước.
    dispatch({ type: 'dan-xong', boQua, tran })
  }

  async function bamChuyenTrangThai(c: ChuyenTrangThai) {
    // Lượt hỏi mới xoá câu lỗi của lượt trước: để nguyên banner cũ bên cạnh hộp thoại vừa mở là
    // bảo người dùng lượt này cũng đã hỏng trước cả khi họ bấm.
    dispatch({ type: 'loi-chuyen', loi: null })
    if (c.action_code === 'submit') {
      dispatch({ type: 'bam-nop' })
      const conThieu = mau.indicators.some((ct) => {
        const { requiredCell } = cellPolicy(ct.agg_type as AggType)
        if (!ct.required || requiredCell === null) return false
        const o = s.nhap[ct.code] ?? { thisPeriod: null, accTotal: null }
        return giaTriBatBuoc(o, requiredCell) === null
      })
      // Backend từ chối nộp thiếu ô bắt buộc bằng 400 (services/workflow.py:229). Chặn tại chỗ
      // để người nộp thấy ĐÚNG Ô nào thiếu thay vì một câu lỗi sau một vòng mạng.
      if (conThieu) return
    }
    // D23: "Nộp luôn lưu trước rồi mới transition". Lưu hỏng thì DỪNG: chuyển trạng thái bằng số
    // chưa lên tới server là nộp thiếu đúng những ô vừa gõ, và khoá `version` của lượt transition
    // cũng đã cũ. Câu vì sao đã nằm ở banner/dải đầu do lượt lưu vừa rồi dựng lên.
    if (!(await luuGiaTri.saveNow())) return
    chuyen.hoi(c)
  }

  const soCot = coCotLech ? 7 : 6
  const dangHoi = chuyen.dangHoi

  return (
    <div ref={formRef}>
      <FormHeader
        dau={chiTiet.header}
        state={chiTiet.state}
        source={chiTiet.source}
        isLate={chiTiet.is_late}
        kyThieu={chiTiet.missing_periods}
        now={new Date()}
        trangThaiLuu={dongTrangThaiLuu(luuGiaTri, loiLamMoi)}
      />

      {/* Điều kiện `state === 'returned'` KHÔNG thừa: `workflow.py:247` chỉ ghi `decision_note` ở
          approve/return/reopen — `submit` KHÔNG xoá nó, nên một báo cáo đã nộp lại vẫn mang nguyên
          ghi chú của lượt trả lại trước (fix-1 S4).
          `role="status"` chứ không phải `alert`: banner này có mặt ngay lúc tải trang, không phải
          một sự kiện — `alert` sẽ cắt ngang trình đọc màn hình trước cả tiêu đề trang (fix-1 S12). */}
      {chiTiet.state === 'returned' && chiTiet.header.decision_note && (
        <Banner kind="danger">
          <span role="status">
            <b className="font-medium">
              Ban ATCL trả lại{chiTiet.header.decided_at ? ` ${formatDateTime(chiTiet.header.decided_at)}` : ''}:
            </b>{' '}
            {chiTiet.header.decision_note}
          </span>
        </Banner>
      )}

      {/* D23: "lưu thất bại mạng → giữ 'Chưa lưu' + banner offline, thử lại khi online". Số không
          mất: ô vẫn nằm trong hàng chờ của `useSaveValues` và tự gửi lại khi trình duyệt báo có
          mạng — câu dưới đây phải nói đúng điều đó, nếu không người dùng sẽ gõ lại từ đầu. */}
      {luuGiaTri.offline && (
        <Banner kind="warning">
          <span role="alert">Mất kết nối. Ô chưa lưu vẫn được giữ và sẽ tự gửi lại khi có mạng.</span>
        </Banner>
      )}

      {/* Lỗi server KHÔNG phải xung đột phiên bản (400 sai luật, 403 trạng thái không cho sửa,
          409 loại "thao tác không hợp lệ"). Hiện `detail` NGUYÊN VĂN: câu của 409 loại này dựng
          động từ tên transition trong DB, viết cứng ở đây là hiện sai câu (C2). */}
      {luuGiaTri.loiLuu !== null && (
        <Banner kind="danger">
          <span role="alert">
            Không lưu được: {luuGiaTri.loiLuu}
            <DongLoi ds={luuGiaTri.loiLuuChiTiet} />
          </span>
        </Banner>
      )}

      {s.xungDot && (
        <Banner kind="warning">
          <span role="alert">
            {s.xungDot.detail} (phiên bản {s.xungDot.tuPhienBan} → {s.xungDot.denPhienBan}). Ô đang gõ được giữ.
          </span>
        </Banner>
      )}

      {/* Lỗi của lượt chuyển trạng thái (Task 24): 400 thiếu ô bắt buộc lúc nộp, 403, và CẢ HAI
          loại 409. Hiện `detail` NGUYÊN VĂN — câu 409 loại "thao tác không hợp lệ ở trạng thái
          hiện tại" dựng ĐỘNG từ tên tiếng Việt của transition trong DB, viết cứng ở đây là hiện
          sai câu (task-24-carry.md C1). */}
      {s.loiChuyen !== null && (
        <Banner kind="danger">
          <span role="alert">
            Không chuyển trạng thái được: {s.loiChuyen.detail}
            <DongLoi ds={s.loiChuyen.errors} />
          </span>
        </Banner>
      )}

      {/* `role="status"` cùng lý do với banner trả lại (fix-1 S12) — banner 409 ở trên mới là
          sự kiện thật, nó giữ `role="alert"`. */}
      {chiTiet.missing_periods.length > 0 && (
        <Banner kind="gray">
          <span role="status">
            Lũy kế chưa tính kỳ {chiTiet.missing_periods.map(formatPeriod).join(', ')} (chưa duyệt). Cột "Lũy kế
            tháng trước" sẽ đổi khi kỳ đó được duyệt.
          </span>
        </Banner>
      )}

      <div className="grid grid-cols-[1fr_160px] gap-4 items-start">
        <div
          // Khung cuộn RIÊNG của bảng, cuộn cả hai chiều: header cột `sticky top-0` chỉ dính được
          // bên trong một khung CÓ cuộn dọc. `overflow-x-auto` trần (như bản vẽ tĩnh viết) biến
          // khung thành vùng cuộn nhưng cao bằng nội dung, nên không có gì để dính vào và header
          // trôi mất theo trang. Cao tối đa = màn hình trừ dải đầu + thanh dưới.
          className="min-w-0 max-h-[calc(100vh-13rem)] overflow-auto border border-hair bg-surface rounded-input"
        >
          <table className="w-full border-collapse text-table">
            <thead>
              <tr>
                <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-left w-[400px] min-w-[400px] whitespace-normal">
                  Chỉ tiêu
                </th>
                <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-left w-16 whitespace-nowrap">
                  ĐVT
                </th>
                <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-right w-32 whitespace-nowrap">
                  Lũy kế tháng trước
                </th>
                <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-right w-32 whitespace-nowrap">
                  Tháng này
                </th>
                <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-right w-32 whitespace-nowrap">
                  Cộng dồn
                </th>
                {coCotLech && (
                  <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-right w-24 whitespace-nowrap">
                    Lệch
                  </th>
                )}
                <th className="sticky top-0 z-20 h-9 px-3 bg-mutedbg border-b border-hair text-tableHead font-semibold text-left min-w-[240px]">
                  Ghi chú
                </th>
              </tr>
            </thead>
            <tbody>
              {nhomCoDong.map(({ nhom, ds }) => (
                <Nhom
                  key={nhom.code}
                  nhom={nhom}
                  ds={ds}
                  soCot={soCot}
                  s={s}
                  suaDuoc={suaDuoc}
                  coCotLech={coCotLech}
                  thieuBatBuoc={thieuBatBuoc}
                  dispatch={dispatch}
                  danCot={danCot}
                  markDirty={luuGiaTri.markDirty}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mục lục liệt ĐỦ `mau.sections`, kể cả A (5 ô phần đầu) và C (3 ô văn bản dưới bảng) —
            hai nhóm đó không sinh hàng nào trong bảng nhưng vẫn là hai đích nhảy mà approve.html
            vẽ rõ; nhóm C nằm dưới 53 dòng nên mất mục lục là mất đúng cú nhảy một phát (fix-1 S6).
            Lọc `nhomCoDong` chỉ đúng cho HÀNG TIÊU ĐỀ trong bảng, không đúng cho điều hướng trang. */}
        <nav className="sticky top-4 bg-surface border border-hair rounded-tile py-2.5 text-xs">
          {mau.sections.map((nhom) => (
            <a key={nhom.code} href={`#${nhom.code}`} className="block px-3 py-1.5 text-soot no-underline hover:bg-mutedbg">
              {nhom.code}. {nhom.name_vi}
            </a>
          ))}
        </nav>
      </div>

      <div id="C" className="mt-4 grid gap-3 scroll-mt-20">
        {mau.text_fields.map((tf) => (
          <OChu
            key={tf.code}
            ma={tf.code}
            nhan={tf.label_vi}
            noiDung={s.chu[tf.code] ?? ''}
            suaDuoc={suaDuoc}
            onDoi={(noiDung) => dispatch({ type: 'chu', ma: tf.code, noiDung })}
          />
        ))}
      </div>

      <FormModeBar
        chuyenDuoc={chuyenDuoc}
        suaDuoc={suaDuoc}
        thieuBatBuoc={thieuBatBuoc}
        boQuaKhiDan={s.boQuaKhiDan}
        tranKhiDan={s.tranKhiDan}
        soDemLech={soDemLech}
        onLuu={luu}
        onChuyenTrangThai={bamChuyenTrangThai}
      />

      {/* `dangHoi` gán ra một `const` TRƯỚC khi dựng hộp thoại: TypeScript chỉ giữ được phép thu
          hẹp "khác null" bên trong closure `onConfirm` khi nó nhìn vào một binding không đổi. */}
      {dangHoi !== null && (
        <Dialog
          open={chuyen.dialogMo}
          {...noiDungDialog(dangHoi, chiTiet.header)}
          pending={chuyen.pending}
          // `s.version` chứ không phải `chiTiet.version`: mỗi lần lưu server trả về số mới và
          // reducer vá vào đây. Gửi số của lần tải trang là cầm chắc 409 với chính mình ngay sau
          // cú "Nộp luôn lưu trước" ở trên.
          onConfirm={(ghiChu) => void chuyen.xacNhan(dangHoi, chiTiet.state, s.version, ghiChu)}
          onCancel={chuyen.huy}
        />
      )}
    </div>
  )
}

/** Từng dòng `errors[]` của một lỗi 400. `detail` của 400 luôn chỉ là "Dữ liệu không hợp lệ" —
 * một mình nó không nói được ô nào sai (task-24-carry.md C1: "Hiện danh sách, không hiện một câu
 * chung chung").
 *
 * Mã đọc từ `indicator_code` HOẶC `field_code`: backend có HAI hình dạng `errors` khác nhau, ba ô
 * chữ nhóm C đi bằng khoá thứ hai (`services/reports.py:515`). Không có link neo tới ô: mã chỉ
 * tiêu thì neo được (`maNeo`), mã ô chữ thì không có neo nào mang đúng tên đó — một danh sách nửa
 * bấm được nửa không còn khó hiểu hơn là không bấm được. */
function DongLoi({ ds }: { ds: ApiErrorItem[] | null }) {
  if (ds === null || ds.length === 0) return null
  return (
    <ul className="mt-1 mb-0 pl-5 list-disc">
      {ds.map((it) => (
        <li key={it.indicator_code ?? it.field_code}>
          {it.indicator_code ?? it.field_code}: {it.message}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- nhóm + dòng

function Nhom({
  nhom,
  ds,
  soCot,
  s,
  suaDuoc,
  coCotLech,
  thieuBatBuoc,
  dispatch,
  danCot,
  markDirty,
}: {
  nhom: NhomMau
  ds: ChiTieuMau[]
  soCot: number
  s: TrangThaiForm
  suaDuoc: boolean
  coCotLech: boolean
  thieuBatBuoc: string[]
  dispatch: (h: HanhDongForm) => void
  danCot: (maBatDau: string, cot: Cell, dong: string[]) => void
  markDirty: (ma: string, o: ODoi) => void
}) {
  return (
    <>
      <GroupHeader nhom={nhom} soCot={soCot} />
      {ds.map((ct) => (
        <Dong
          key={ct.code}
          ct={ct}
          sv={s.server[ct.code] ?? RONG}
          nhap={s.nhap[ct.code] ?? { thisPeriod: null, accTotal: null }}
          ghiChu={s.ghiChu[ct.code] ?? ''}
          suaDuoc={suaDuoc}
          coCotLech={coCotLech}
          thieu={thieuBatBuoc.includes(ct.code)}
          dispatch={dispatch}
          danCot={danCot}
          markDirty={markDirty}
        />
      ))}
    </>
  )
}

function Dong({
  ct,
  sv,
  nhap,
  ghiChu,
  suaDuoc,
  coCotLech,
  thieu,
  dispatch,
  danCot,
  markDirty,
}: {
  ct: ChiTieuMau
  sv: GiaTriBaoCao
  nhap: ONhap
  ghiChu: string
  suaDuoc: boolean
  coCotLech: boolean
  thieu: boolean
  dispatch: (h: HanhDongForm) => void
  danCot: (maBatDau: string, cot: Cell, dong: string[]) => void
  markDirty: (ma: string, o: ODoi) => void
}) {
  const { cs, accPrev, thisPeriod, accTotal } = giaTriDong(ct, sv, nhap)
  const ten = `${ct.code} ${ct.name_vi}`
  const lech = sv.counter_check?.status === 'lech' ? sv.counter_check.message : null
  const { requiredCell } = cellPolicy(ct.agg_type as AggType)
  // "Bắt buộc" chỉ treo lên ĐÚNG ô mà `cellPolicy` chấm là bắt buộc, không treo lên cả dòng.
  const loiNgoai = (cot: Cell) => (thieu && requiredCell === cot ? 'Bắt buộc' : null)
  /** Rời ô có sửa → xếp ô đó vào hàng chờ lưu. `NumberCell` đã tự lọc "chỉ Tab ngang qua" (fix-1
   * S6) nên ở đây chỉ còn phải lọc ô ĐANG LỖI: giá trị của nó là `null` do phân tích hỏng, gửi
   * lên là xoá đúng con số cũ mà người dùng chưa hề xoá. */
  const roiO =
    (cot: Cell): NonNullable<NumberCellProps['onCommit']> =>
    (kq) => {
      if (kq.error === null) markDirty(ct.code, oDoi(cot, kq.value))
    }
  return (
    <tr id={maNeo(ct.code)} className="scroll-mt-20 focus-within:bg-canvas">
      <td className={`${TD} whitespace-normal text-ink`} title={ct.name_en}>
        {ten}
        {ct.formula && (
          // D9: dòng tự tính nói bằng icon khoá + title công thức, KHÔNG bằng một dòng chữ giải
          // thích dưới dòng (ghi chú wireframe lọt thành footer là một hard rejection).
          <span className="ml-1 text-[11px] text-sec" title={`Tự tính = ${ct.formula.split(',').join(' + ')}`}>
            🔒 tự tính
          </span>
        )}
        {lech && <span className="block text-[11px] leading-[1.3] text-warning whitespace-normal">{lech}</span>}
      </td>
      <td className={`${TD} text-sec whitespace-nowrap`}>{ct.unit ?? ''}</td>
      <OGiaTri
        mode={cs.accPrev}
        suaDuoc={suaDuoc}
        nhan={`${ten}, Lũy kế tháng trước`}
        value={accPrev}
        decimals={ct.decimals}
        cot="accPrev"
        loiNgoai={null}
      />
      <OGiaTri
        mode={cs.thisPeriod}
        suaDuoc={suaDuoc}
        nhan={`${ten}, Tháng này`}
        value={thisPeriod}
        decimals={ct.decimals}
        cot="thisPeriod"
        loiNgoai={loiNgoai('thisPeriod')}
        onChange={(value) => dispatch({ type: 'nhap-o', ma: ct.code, cot: 'thisPeriod', value })}
        onCommit={roiO('thisPeriod')}
        onPasteColumn={(dong) => danCot(ct.code, 'thisPeriod', dong)}
      />
      <OGiaTri
        mode={cs.accTotal}
        suaDuoc={suaDuoc}
        nhan={`${ten}, Cộng dồn`}
        value={accTotal}
        decimals={ct.decimals}
        cot="accTotal"
        loiNgoai={loiNgoai('accTotal')}
        onChange={(value) => dispatch({ type: 'nhap-o', ma: ct.code, cot: 'accTotal', value })}
        onCommit={roiO('accTotal')}
        onPasteColumn={(dong) => danCot(ct.code, 'accTotal', dong)}
      />
      {coCotLech && <ODoc nhan={`${ten}, Lệch`} value={sv.diff} decimals={ct.decimals} mo />}
      {suaDuoc ? (
        <td data-cot="note" className={`${TD} py-0.5`}>
          <input
            type="text"
            aria-label={`${ten}, Ghi chú`}
            value={ghiChu}
            onChange={(e) => dispatch({ type: 'ghi-chu', ma: ct.code, noiDung: e.target.value })}
            // Ghi chú cũng là một Ô của `PUT .../values` (`ValueIn.note`), và là chỗ D25 bảo người
            // nhập giải thích bộ đếm lệch — không lưu nó là mất đúng câu giải thích đó. So với
            // `sv.note` (bản server đang giữ, đã được vá lại sau mỗi lần lưu) chứ không so với một
            // mốc lúc focus: Tab ngang qua ô ghi chú không được sinh ra PUT nào.
            onBlur={() => {
              if (ghiChu !== (sv.note ?? '')) markDirty(ct.code, { note: ghiChu })
            }}
            className="block w-full h-7 border border-hair rounded-input px-2 bg-surface text-ink focus:outline-2 focus:outline-cyan focus:-outline-offset-2"
          />
        </td>
      ) : (
        <td className={`${TD} text-soot whitespace-normal`}>{ghiChu}</td>
      )}
    </tr>
  )
}

// ---------------------------------------------------------------- nhóm C (ô văn bản)

const TOI_DA_CHU = 2000

function OChu({
  ma,
  nhan,
  noiDung,
  suaDuoc,
  onDoi,
}: {
  ma: string
  nhan: string
  noiDung: string
  suaDuoc: boolean
  onDoi: (noiDung: string) => void
}) {
  return (
    <div>
      {suaDuoc ? (
        <>
          <label htmlFor={`chu-${ma}`} className="block text-xs font-medium text-soot mb-1">
            {ma}. {nhan}
          </label>
          <textarea
            id={`chu-${ma}`}
            value={noiDung}
            maxLength={TOI_DA_CHU}
            onChange={(e) => {
              // "textarea tự giãn": cao theo nội dung, không có thanh cuộn trong ô.
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
              onDoi(e.target.value)
            }}
            className="block w-full min-h-24 border border-hair rounded-input px-2.5 py-2 bg-surface text-table text-soot focus:outline-2 focus:outline-cyan focus:-outline-offset-2"
          />
          <div className="text-[11px] text-sec text-right mt-0.5">
            {noiDung.length}/{TOI_DA_CHU}
          </div>
        </>
      ) : (
        <>
          <div className="block text-xs font-medium text-soot mb-1">
            {ma}. {nhan}
          </div>
          <div className="min-h-24 border border-hair rounded-input px-2.5 py-2 bg-surface text-table text-soot whitespace-pre-wrap">
            {noiDung}
          </div>
        </>
      )}
    </div>
  )
}
