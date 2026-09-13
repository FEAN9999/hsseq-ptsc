/**
 * Định dạng hiển thị tiếng Việt cho FM01 — logic thuần, không React, không gọi API.
 */

/** IANA timezone Việt Nam — cố định UTC+7, không có giờ mùa hè (DST). */
const MUI_GIO_VN = 'Asia/Ho_Chi_Minh'

/** "2026-08" (YYYY-MM) -> "08/2026" (MM/YYYY). */
export function formatPeriod(period: string): string {
  const [nam, thang] = period.split('-')
  return `${thang}/${nam}`
}

/** ISO UTC -> "DD/MM/YYYY HH:mm" theo giờ Việt Nam.
 *
 * Dùng `Intl.DateTimeFormat` với `timeZone` tường minh (không dựa vào giờ hệ thống của
 * máy chạy code — máy CI có thể ở múi giờ khác) và ráp chuỗi từ `formatToParts` (không
 * dùng chuỗi mặc định của locale) để định dạng luôn cố định, không phụ thuộc dấu phẩy/
 * thứ tự mà `vi-VN` có thể đổi giữa các phiên bản ICU.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: MUI_GIO_VN,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const lay = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${lay('day')}/${lay('month')}/${lay('year')} ${lay('hour')}:${lay('minute')}`
}

/** Chỉ số ngày lịch (theo giờ VN) của một thời điểm — dùng để trừ ra số NGÀY LỊCH,
 * không trừ mili-giây (hai thời điểm cách nhau dưới 24h vẫn có thể khác ngày lịch VN,
 * và ngược lại cách nhau hơn 24h vẫn có thể cùng say số ngày chênh lệch mong đợi). */
function chiSoNgayVN(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MUI_GIO_VN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const lay = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(lay('year'), lay('month') - 1, lay('day')) / 86_400_000
}

/** Hạn nộp: đếm theo NGÀY LỊCH giờ Việt Nam, không đếm mili-giây (xem task-16-carry.md C2).
 * `text` là câu đếm ngược/đếm xuôi để hiện trực tiếp; `title` là mốc tuyệt đối để hiện khi hover. */
export function formatDue(iso: string, now: Date): { text: string; title: string } {
  const due = new Date(iso)
  const soNgay = chiSoNgayVN(due) - chiSoNgayVN(now)
  const text = soNgay >= 0 ? `còn ${soNgay} ngày` : `quá hạn ${-soNgay} ngày`
  return { text, title: `Hạn nộp: ${formatDateTime(iso)}` }
}

/** Số theo vi-VN: dấu chấm ngăn ngàn, dấu phẩy ngăn thập phân. `null` hiện dấu gạch —
 * không hiện "0", vì ô trống và ô nhập 0 mang ý nghĩa khác nhau trong báo cáo HSEQ. */
export function formatNumber(n: number | null, decimals: number): string {
  if (n === null) return '—'
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}
