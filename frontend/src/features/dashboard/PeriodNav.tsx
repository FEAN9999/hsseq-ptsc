// frontend/src/features/dashboard/PeriodNav.tsx
//
// Điều hướng kỳ `‹ 07/2026 · 08/2026 · 09/2026 ›` (mockup dashboard.html `.pnav`).
//
// P2 (final-fix-FE.md, Ruling 424 · final-review-R2-report.md §A3): trước bản vá, hai nút này KHÔNG
// có biên — `congThang` luôn cho ra một kỳ mới, nên ở kỳ cuối dải một cú bấm `›` đẩy người trình bày
// sang một kỳ KHÔNG TỒN TẠI, nơi `/dashboard/*` trả 200 kèm toàn số 0 (đọc y hệt "mất sạch dữ
// liệu"). Nay `kyDau`/`kyCuoi` — suy từ GET /templates/{code}/periods, nguồn chân lý đã có sẵn và
// Status.tsx đã dùng — khoá đúng hai đầu dải.
//
// CẢ HAI đều optional và KHÔNG khoá gì khi `undefined`: dải kỳ là một lượt gọi mạng nữa, và nó hỏng
// (Render 502) thì đường đi bình thường phải còn nguyên. Khoá "phòng xa" lúc chưa biết dải chính là
// chặn đường đi đúng.
import { formatPeriod } from '../../lib/format'

// Cộng/trừ đúng `delta` tháng lịch cho khoá "YYYY-MM" — Date.UTC thuần số (không qua timezone) vì
// khoá kỳ chỉ là nhãn tháng, không mang giờ.
function congThang(period: string, delta: number): string {
  const [nam, thang] = period.split('-').map(Number)
  const d = new Date(Date.UTC(nam, thang - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const NUT = 'text-soot bg-transparent border-0 px-1.5 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

export function PeriodNav({
  period,
  onChange,
  kyDau,
  kyCuoi,
}: {
  period: string
  onChange: (period: string) => void
  kyDau?: string
  kyCuoi?: string
}) {
  const truoc = congThang(period, -1)
  const sau = congThang(period, 1)
  // "YYYY-MM" có tháng đệm 0 nên so sánh CHUỖI cho đúng thứ tự thời gian — không cần parse lại.
  const khoaTruoc = kyDau !== undefined && truoc < kyDau
  const khoaSau = kyCuoi !== undefined && sau > kyCuoi

  return (
    <div className="inline-flex items-center gap-2 text-table">
      <button type="button" disabled={khoaTruoc} onClick={() => onChange(truoc)} className={NUT}>
        ‹ {formatPeriod(truoc)}
      </button>
      <span className="font-medium border border-hair bg-surface rounded-input px-2.5 py-1">
        {formatPeriod(period)}
      </span>
      <button type="button" disabled={khoaSau} onClick={() => onChange(sau)} className={NUT}>
        {formatPeriod(sau)} ›
      </button>
    </div>
  )
}
