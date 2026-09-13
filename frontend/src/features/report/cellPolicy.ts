/**
 * MA TRẬN agg_type × 3 CỘT (bản sao duy nhất còn lại ở backend/app/domain/report_rules.py;
 * sửa một bên phải sửa bên kia)
 *
 *   agg_type   | Lũy kế tháng trước | Tháng này        | Cộng dồn        | lưu vào
 *   -----------+--------------------+------------------+-----------------+---------------------
 *   sum        | tự điền, chỉ đọc   | NHẬP (bắt buộc)  | client cộng, ro | this_period
 *   counter    | tự điền, chỉ đọc   | nhập (tuỳ chọn)  | NHẬP (bắt buộc) | this_period + acc_total_entered
 *   snapshot   | trống              | trống            | NHẬP (bắt buộc) | acc_total_entered
 *   computed   | tự điền, chỉ đọc   | tự điền, chỉ đọc | tự điền, chỉ đọc| không lưu
 */

/** Chế độ hiển thị/nhập của một ô: nhập được, tự tính (chỉ đọc), hoặc để trống. */
export type Mode = 'input' | 'derived' | 'empty'

/** Tên 3 cột giá trị của một chỉ tiêu, khớp tên trong cellPolicy/zodSchemaFromCatalog. */
export type Cell = 'accPrev' | 'thisPeriod' | 'accTotal'

/** 4 agg_type miền FM01 công nhận — khớp `COT_BAT_BUOC`/`COT_NHAP_DUOC` của backend. */
export type AggType = 'sum' | 'counter' | 'snapshot' | 'computed'

export interface CellPolicyResult {
  accPrev: Mode
  thisPeriod: Mode
  accTotal: Mode
  requiredCell: Cell | null
}

const CHINH_SACH: Record<AggType, CellPolicyResult> = {
  sum: { accPrev: 'derived', thisPeriod: 'input', accTotal: 'derived', requiredCell: 'thisPeriod' },
  counter: { accPrev: 'derived', thisPeriod: 'input', accTotal: 'input', requiredCell: 'accTotal' },
  snapshot: { accPrev: 'empty', thisPeriod: 'empty', accTotal: 'input', requiredCell: 'accTotal' },
  computed: { accPrev: 'derived', thisPeriod: 'derived', accTotal: 'derived', requiredCell: null },
}

/** agg_type lạ (chưa có trong `CHINH_SACH`, ví dụ chỉ tiêu giai đoạn 2 backend đã thêm mà
 * FE chưa cập nhật): khoá cả 3 cột về chỉ đọc, không bắt buộc — không vỡ trang, không cho
 * nhập nhầm vào ô không rõ quy tắc. */
const MAC_DINH_AN_TOAN: CellPolicyResult = {
  accPrev: 'derived',
  thisPeriod: 'derived',
  accTotal: 'derived',
  requiredCell: null,
}

export function cellPolicy(aggType: AggType): CellPolicyResult {
  const chinhSach = CHINH_SACH[aggType]
  if (chinhSach === undefined) {
    console.warn(`cellPolicy: agg_type lạ "${String(aggType)}", khoá ô để an toàn`)
    return MAC_DINH_AN_TOAN
  }
  return chinhSach
}
