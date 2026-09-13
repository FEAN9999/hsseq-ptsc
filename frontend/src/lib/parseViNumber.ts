/**
 * Phân tích chuỗi người dùng gõ/dán vào ô số FM01 (định dạng vi-VN: dấu chấm ngăn hàng nghìn,
 * dấu phẩy ngăn thập phân) thành `number | null` — logic thuần, không React.
 *
 * task-21-carry.md C1: ba luật giá trị (âm, số chữ số thập phân, giới hạn độ lớn) DÙNG LẠI đúng
 * hằng/hàm đã cài ở `zodSchemaFromCatalog` (Task 16), không chép lại lần hai — hai nơi chép cùng
 * một luật mà lệch nhau nghĩa là người dùng gõ được số mà form nhận rồi backend từ chối.
 *
 * task-21-carry.md C5: câu lỗi dùng NGUYÊN VĂN đã chốt ở `zodSchemaFromCatalog`/backend, cộng
 * 'Chỉ nhập số' cho ký tự lạ (thiết kế dòng 671) — không viết câu mới.
 */
import { GIOI_HAN_DO_LON, chuSoThapPhan } from '../features/report/zodSchemaFromCatalog'

export function parseViNumber(raw: string, decimals: number): { value: number | null; error: string | null } {
  const khongKhoangTrang = raw.replace(/\s/g, '')
  if (khongKhoangTrang === '') return { value: null, error: null }

  // fix-1 S1: '.' chỉ được bỏ khi nó THẬT SỰ là dấu ngăn hàng nghìn hợp lệ (mỗi nhóm sau dấu
  // chấm đủ 3 chữ số) — trước đây bỏ MỌI dấu chấm vô điều kiện nên '1284500.00' (dấu chấm thập
  // phân kiểu en-US/Excel) âm thầm hoá thành 128450000 (nhân 100), '0.5' thành 5, và '.' đơn độc
  // thành 0 — sai số hợp lệ mọi mặt khác (< 10^16, đúng số thập phân) nên lọt cả zod lẫn backend,
  // chỉ lộ ra khi có người đối chiếu Excel. Không khớp nhóm hàng nghìn thì báo lỗi, không đoán.
  if (khongKhoangTrang.includes('.') && !/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(khongKhoangTrang)) {
    return { value: null, error: 'Chỉ nhập số' }
  }

  // '.' luôn là dấu ngăn hàng nghìn (bỏ hẳn, đã kiểm hợp lệ ở trên), ',' luôn là dấu thập phân
  // (đổi thành '.' cho Number) — đúng quy ước vi-VN, không đoán theo ngữ cảnh.
  const khongChamNgan = khongKhoangTrang.replace(/\./g, '')
  const so = Number(khongChamNgan.replace(',', '.'))

  if (!Number.isFinite(so)) return { value: null, error: 'Chỉ nhập số' }
  if (so < 0) return { value: null, error: 'Số không được âm' }
  if (Math.abs(so) >= GIOI_HAN_DO_LON) return { value: null, error: 'Số quá lớn, tối đa 16 chữ số phần nguyên' }
  if (chuSoThapPhan(so) > decimals) return { value: null, error: `Chỉ nhận tối đa ${decimals} chữ số thập phân` }

  // fix-2 T9: `-?` ở cổng kiểm nhóm hàng nghìn (trên) cho lọt đúng một họ vô hại về giá trị —
  // '-0.000' dạng: `so < 0` là false với -0 (IEEE754, -0 không nhỏ hơn 0) nên rơi tới đây thành
  // công với `so` là -0. Chuẩn hoá về 0 thường để tránh trả một giá trị "âm" nhìn giống dương.
  return { value: so === 0 ? 0 : so, error: null }
}
