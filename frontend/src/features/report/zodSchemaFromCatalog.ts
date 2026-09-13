/**
 * Sinh schema Zod để kiểm form nhập liệu FM01 ngay ở client, từ danh mục chỉ tiêu
 * (`fm01-catalog.json` hoặc tương đương). Logic thuần — không React, không gọi API.
 *
 * Chỉ kiểm những mã CÓ mặt trong object đưa vào `safeParse` — mã vắng mặt không sinh lỗi
 * "bắt buộc". Đây là cách hiểu khớp với `validate_values` phía backend
 * (`backend/app/domain/report_rules.py`): cả vòng kiểm giá trị lẫn vòng kiểm "bắt buộc" ở
 * đó đều chỉ lặp qua `values.items()` — mã không có trong payload không bao giờ bị họ báo
 * thiếu; muốn kiểm "thiếu ô bắt buộc lúc nộp" thì nơi gọi phải tự đưa đủ toàn bộ ô đang lưu
 * vào object trước khi đưa cho `safeParse`.
 */
import { z } from 'zod'
import { cellPolicy, type AggType } from './cellPolicy'

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

/** Số chữ số thập phân THỰC SỰ của `v`, đếm từ biểu diễn CHUỖI — không nhân với luỹ thừa
 * 10 (task-16-carry.md C3): `8.29 * 100 = 828.9999999999999` vì sai số dấu phẩy động,
 * trong khi `String(8.29)` luôn là "8.29", đếm ra đúng 2 chữ số thập phân. */
function chuSoThapPhan(v: number): number {
  const s = String(v)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}

/** Schema một ô giá trị: số không âm, đúng số chữ số thập phân khai báo; `null`/vắng mặt
 * đều hợp lệ ở tầng này — ô có bắt buộc hay không do `superRefine` ở `oSchema` quyết định. */
function giaTriOSchema(decimals: number) {
  return z
    .number()
    .refine((v) => v >= 0, 'Số không được âm')
    .refine((v) => chuSoThapPhan(v) <= decimals, `Chỉ nhận tối đa ${decimals} chữ số thập phân`)
    .nullable()
    .optional()
}

/** Schema 3 cột của một chỉ tiêu, cộng thêm kiểm "bắt buộc" cho đúng cột `requiredCell` của
 * `cellPolicy` — dùng lại `cellPolicy` để hai nơi không lệch nhau khi ma trận agg_type đổi. */
function oSchema(chiTieu: IndicatorCatalogItem) {
  const { requiredCell } = cellPolicy(chiTieu.agg_type as AggType)
  const giaTri = giaTriOSchema(chiTieu.decimals)
  return z
    .object({ thisPeriod: giaTri, accPrev: giaTri, accTotal: giaTri })
    .superRefine((o, ctx) => {
      const conThieu = requiredCell !== null && (o[requiredCell] === null || o[requiredCell] === undefined)
      if (chiTieu.required && conThieu) {
        ctx.addIssue({ code: 'custom', path: [requiredCell as string], message: 'Ô bắt buộc, chưa có giá trị' })
      }
    })
}

/** Mỗi mã chỉ tiêu là một key TUỲ CHỌN ở object gốc — khớp payload một phần của
 * PUT /reports/{id}/values (spec D23), và khớp cách zodSchemaFromCatalog.test.ts gọi. */
export function zodSchemaFromCatalog(catalog: Catalog) {
  const shape: Record<string, ReturnType<typeof oSchema>> = {}
  for (const chiTieu of catalog.indicators) {
    shape[chiTieu.code] = oSchema(chiTieu)
  }
  return z.object(shape).partial()
}
