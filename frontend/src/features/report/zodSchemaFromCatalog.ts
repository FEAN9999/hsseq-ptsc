/**
 * Sinh schema Zod để kiểm form nhập liệu FM01 ngay ở client, từ danh mục chỉ tiêu
 * (`fm01-catalog.json` hoặc tương đương). Logic thuần — không React, không gọi API.
 *
 * Object theo mã (mỗi key là một `code`, value là 3 cột `thisPeriod`/`accPrev`/`accTotal`)
 * là cấu trúc NỘI BỘ tiện cho việc validate ở client — không tuyên bố khớp hình dạng JSON
 * thật của bất kỳ request nào (payload thật của PUT /reports/{id}/values là một LIST, không
 * lồng theo mã, và không có `accPrev` — cột đó không `agg_type` nào cho nhập, xem
 * `cellPolicy`). Việc chuyển đổi giữa hai hình dạng là việc của nơi gọi (form/adapter).
 *
 * Mọi luật giá trị dưới đây COPY LẠI từ `validate_values` phía backend
 * (`backend/app/domain/report_rules.py`) — đó là chân lý. Chỉ kiểm những mã CÓ mặt trong
 * object đưa vào `safeParse`; mã vắng mặt không sinh lỗi "bắt buộc" (mã không có trong
 * payload nghĩa là ô không đổi, không phải ô thiếu — đúng ngữ nghĩa `validate_values`, xem
 * docstring hàm đó). Muốn kiểm "thiếu ô bắt buộc lúc nộp" thì nơi gọi phải tự đưa đủ toàn bộ
 * ô đang lưu vào object trước khi đưa cho `safeParse`, giống hệt phía backend.
 */
import { z } from 'zod'
import { cellPolicy, type AggType, type Mode } from './cellPolicy'

export interface IndicatorCatalogItem {
  code: string
  agg_type: string
  decimals: number
  required: boolean
  formula: string | null
}

export interface Catalog {
  indicators: IndicatorCatalogItem[]
}

/** `report_rules.py:71`: Postgres (`Numeric(18,2)`) từ chối |giá trị| >= 10^16 bằng một lỗi
 * 500 trần. Chặn ở đây với cùng ngưỡng và cùng câu để người dán nhầm ô Excel dạng mũ thấy
 * lỗi ngay khi gõ, không phải sau khi bấm nộp. */
const GIOI_HAN_DO_LON = 10 ** 16

/** Số chữ số thập phân THỰC SỰ của `v`. Đếm từ biểu diễn CHUỖI của `v`, không nhân với luỹ
 * thừa 10 (task-16-carry.md C3): `8.29 * 100 = 828.9999999999999` vì sai số dấu phẩy động.
 *
 * `Number.prototype.toString()` tự chuyển sang ký hiệu mũ ở cả hai đầu phổ — số rất nhỏ
 * (`String(1e-7) === '1e-7'`, task-16-fix-brief.md F5) lẫn số rất lớn (`String(1e21) ===
 * '1e+21'`) — nên phải tách mantissa/số mũ rồi cộng/trừ số mũ vào số thập phân của mantissa,
 * không thể chỉ tìm dấu `.` một lần trên toàn chuỗi. */
function chuSoThapPhan(v: number): number {
  const s = v.toString()
  const iE = s.indexOf('e')
  if (iE === -1) {
    const i = s.indexOf('.')
    return i === -1 ? 0 : s.length - i - 1
  }
  const mantissa = s.slice(0, iE)
  const soMu = Number(s.slice(iE + 1))
  const iDot = mantissa.indexOf('.')
  const thapPhanMantissa = iDot === -1 ? 0 : mantissa.length - iDot - 1
  return Math.max(0, thapPhanMantissa - soMu)
}

/** Cột KHÔNG nằm trong `editable_columns(agg_type)` phía backend (`report_rules.py:129,134`):
 * chỉ chấp nhận `null`/vắng mặt; có bất kỳ số nào cũng là lỗi "Dòng tự tính, không nhận giá
 * trị gửi lên" — đúng câu, không kiểm thêm luật nào khác (khớp `break` của backend). */
function giaTriChiDoc() {
  return z
    .number()
    .nullable()
    .optional()
    .refine((v) => v === null || v === undefined, 'Dòng tự tính, không nhận giá trị gửi lên')
}

/** Cột CÓ trong `editable_columns(agg_type)`: không âm, không quá 10^16, đúng số thập phân
 * khai báo. `null`/vắng mặt hợp lệ ở tầng này — bắt buộc hay không do `oSchema` quyết định. */
function giaTriNhapDuoc(decimals: number) {
  return z
    .number()
    .refine((v) => v >= 0, 'Số không được âm')
    .refine((v) => Math.abs(v) < GIOI_HAN_DO_LON, 'Số quá lớn, tối đa 16 chữ số phần nguyên')
    .refine((v) => chuSoThapPhan(v) <= decimals, `Chỉ nhận tối đa ${decimals} chữ số thập phân`)
    .nullable()
    .optional()
}

function giaTriTheoMode(mode: Mode, decimals: number) {
  return mode === 'input' ? giaTriNhapDuoc(decimals) : giaTriChiDoc()
}

/** Schema 3 cột của một chỉ tiêu — mỗi cột dùng đúng schema theo `Mode` của nó (không phải
 * cùng một schema cho cả 3 như trước), cộng thêm kiểm "bắt buộc" cho đúng cột `requiredCell`.
 * Dùng lại `cellPolicy` (không chép lại ma trận lần thứ hai) để hai nơi không lệch nhau. */
function oSchema(chiTieu: IndicatorCatalogItem) {
  const chinhSach = cellPolicy(chiTieu.agg_type as AggType)
  const { requiredCell } = chinhSach
  return z
    .object({
      thisPeriod: giaTriTheoMode(chinhSach.thisPeriod, chiTieu.decimals),
      accPrev: giaTriTheoMode(chinhSach.accPrev, chiTieu.decimals),
      accTotal: giaTriTheoMode(chinhSach.accTotal, chiTieu.decimals),
    })
    .superRefine((o, ctx) => {
      const conThieu = requiredCell !== null && (o[requiredCell] === null || o[requiredCell] === undefined)
      if (chiTieu.required && conThieu) {
        ctx.addIssue({ code: 'custom', path: [requiredCell as string], message: 'Ô bắt buộc, chưa có giá trị' })
      }
    })
}

/** Mỗi mã chỉ tiêu là một key TUỲ CHỌN — mã nào không có mặt trong object đưa vào thì không
 * kiểm gì (xem docstring đầu file). Mã có mặt nhưng KHÔNG có trong danh mục (`report_rules.py`:
 * `spec is None`) sinh lỗi đúng câu backend, không bị `.partial()` âm thầm loại bỏ — vì vậy
 * cần `.passthrough()` để mã lạ còn sống sót tới `superRefine` mà bắt, thay vì bị strip trước. */
export function zodSchemaFromCatalog(catalog: Catalog) {
  const shape: Record<string, ReturnType<typeof oSchema>> = {}
  for (const chiTieu of catalog.indicators) {
    shape[chiTieu.code] = oSchema(chiTieu)
  }
  const maHopLe = new Set(Object.keys(shape))
  return z
    .object(shape)
    .partial()
    .passthrough()
    .superRefine((obj, ctx) => {
      for (const ma of Object.keys(obj)) {
        if (!maHopLe.has(ma)) {
          ctx.addIssue({ code: 'custom', path: [ma], message: 'Chỉ tiêu không có trong mẫu báo cáo' })
        }
      }
    })
}
