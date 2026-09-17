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

/** ISO UTC -> "HH:mm" theo giờ Việt Nam — dải đầu form nói "Đã lưu 14:02" (thiết kế dòng 681).
 *
 * Cùng `MUI_GIO_VN` và cùng cách ráp `formatToParts` với `formatDateTime` ngay trên: tự chế múi
 * giờ lần thứ hai là chỗ để hai dòng giờ trong cùng một trang lệch nhau khi máy chạy ở múi khác.
 */
export function formatTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: MUI_GIO_VN,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const lay = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${lay('hour')}:${lay('minute')}`
}

/** Chỉ số ngày lịch (theo giờ VN) của một thời điểm — dùng để trừ ra số NGÀY LỊCH,
 * không trừ mili-giây: khoảng cách tính bằng mili-giây và khoảng cách tính bằng ngày lịch là
 * hai đại lượng khác nhau (23:59 và 00:01 hôm sau chỉ cách nhau 2 phút nhưng khác ngày lịch;
 * ngược lại 00:01 và 23:59 CÙNG một ngày cách nhau gần 24h nhưng lệch 0 ngày lịch). */
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
 * `text` là câu đếm ngược/đếm xuôi để hiện trực tiếp; `title` là mốc tuyệt đối để hiện khi hover.
 *
 * task-16-fix-brief.md F8: hạn là 23:59:59 giờ VN của CHÍNH ngày đó nên khi `soNgay === 0`
 * người dùng còn trọn ngày — "còn 0 ngày" đọc như đã hết hạn trong khi thật ra chưa, và đây
 * lại đúng là chuỗi được đọc dưới áp lực nhất. Chỉ ca này đổi thành "hạn hôm nay"; "còn 1 ngày"
 * trở lên đọc bình thường, không đổi. */
export function formatDue(iso: string, now: Date): { text: string; title: string } {
  const due = new Date(iso)
  const soNgay = chiSoNgayVN(due) - chiSoNgayVN(now)
  const text = soNgay === 0 ? 'hạn hôm nay' : soNgay > 0 ? `còn ${soNgay} ngày` : `quá hạn ${-soNgay} ngày`
  return { text, title: `Hạn nộp: ${formatDateTime(iso)}` }
}

/** Số theo vi-VN: dấu chấm ngăn ngàn, dấu phẩy ngăn thập phân. `null` hiện dấu gạch —
 * không hiện "0", vì ô trống và ô nhập 0 mang ý nghĩa khác nhau trong báo cáo HSEQ.
 *
 * task-16-fix-brief.md F7: hiệu số của dòng computed có thể ra `-0` (số học hợp lệ, `-0 === 0`
 * là `true`) — nhưng `Intl.NumberFormat` nhìn vào DẤU BIT của số chứ không phải giá trị so
 * sánh, nên `.format(-0)` ra `"-0"`. Ép về `0` (literal, luôn là +0) trước khi format. */
export function formatNumber(n: number | null, decimals: number): string {
  if (n === null) return '—'
  const nSach = n === 0 ? 0 : n
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(nSach)
}

/** Kỳ mặc định khi URL chưa có `?period=`. MỘT nguồn duy nhất — Dashboard, PeriodNav và bộ chọn kỳ
 *  trên sidebar đều đọc hằng này, không ai tự khai lại. */
export const KY_MAC_DINH = '2026-08'

/** Lùi/tiến `delta` tháng trên chuỗi "YYYY-MM". Tính bằng UTC để không lệch theo múi giờ máy chạy. */
export function congThang(period: string, delta: number): string {
  const [nam, thang] = period.split('-').map(Number)
  const d = new Date(Date.UTC(nam, thang - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
