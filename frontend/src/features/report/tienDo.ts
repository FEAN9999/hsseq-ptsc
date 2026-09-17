// frontend/src/features/report/tienDo.ts
//
// Phép đếm "đã nhập bao nhiêu ô" của thẻ Tiến độ nhập (mockup 04: "51/53 ô" + dải chip theo nhóm).
//
// MẪU SỐ là các chỉ tiêu BẮT BUỘC có ô nhập được — đúng tập hợp mà `thieuBatBuoc` của
// `ReportForm` đang đếm để in "Thiếu N ô bắt buộc" ở chân trang. Hai con số đó phải luôn cộng lại
// bằng nhau (51 + 2 = 53 trong bản vẽ); viết hai phép đếm riêng là cách để một hôm nào đó thanh
// tiến độ nói "đủ" trong khi chân trang vẫn chặn nộp. Nên vị ngữ "ô này đã có số chưa" chỉ khai ở
// ĐÂY, và `ReportForm` gọi lại chính nó.
//
// Chỉ tiêu `computed` (tự tính) không có ô nhập nào nên không vào mẫu số — đếm chúng là hứa với
// người nhập một việc họ không làm được.
import { cellPolicy, type AggType } from './cellPolicy'

export interface ONhapTienDo {
  thisPeriod: number | null
  accTotal: number | null
}

export interface ChiTieuTienDo {
  code: string
  section_code: string
  agg_type: string
  required: boolean
}

export interface DemNhom {
  code: string
  daNhap: number
  tong: number
}

export interface TienDo {
  daNhap: number
  tong: number
  /** Theo ĐÚNG thứ tự `sections` truyền vào — không tự sắp lại. */
  nhom: DemNhom[]
  /** Mã các chỉ tiêu bắt buộc còn trống, thứ tự như `indicators`. */
  conThieu: string[]
}

/** Chỉ tiêu này có ô bắt buộc phải điền không. `false` = tự tính, hoặc không bắt buộc. */
export function coODemDuoc(ct: ChiTieuTienDo): boolean {
  return ct.required && cellPolicy(ct.agg_type as AggType).requiredCell !== null
}

/** Ô bắt buộc của chỉ tiêu này đã có số chưa. Gọi được cả khi `coODemDuoc(ct)` là `false` —
 *  lúc đó trả `true` (không có gì để đòi), nên nơi gọi không phải viết hai điều kiện lồng nhau. */
export function daDienO(ct: ChiTieuTienDo, o: ONhapTienDo | undefined): boolean {
  const cot = cellPolicy(ct.agg_type as AggType).requiredCell
  if (cot === null || !ct.required) return true
  const gia = cot === 'thisPeriod' ? o?.thisPeriod : o?.accTotal
  return gia !== null && gia !== undefined
}

export function tinhTienDo(
  sections: readonly { code: string }[],
  indicators: readonly ChiTieuTienDo[],
  nhap: Record<string, ONhapTienDo | undefined>,
): TienDo {
  const dem = new Map<string, DemNhom>()
  for (const nhom of sections) dem.set(nhom.code, { code: nhom.code, daNhap: 0, tong: 0 })

  let daNhap = 0
  let tong = 0
  const conThieu: string[] = []

  for (const ct of indicators) {
    if (!coODemDuoc(ct)) continue
    tong += 1
    const xong = daDienO(ct, nhap[ct.code])
    if (xong) daNhap += 1
    else conThieu.push(ct.code)
    // Nhóm LẠ (chỉ tiêu mang `section_code` không có trong `sections`) vẫn vào tổng, chỉ không có
    // chip riêng — mất một con số trong tổng còn tệ hơn thiếu một cái chip.
    const n = dem.get(ct.section_code)
    if (n !== undefined) {
      n.tong += 1
      if (xong) n.daNhap += 1
    }
  }

  return { daNhap, tong, nhom: [...dem.values()], conThieu }
}
