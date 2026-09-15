// frontend/src/pages/Dashboard.tsx
//
// Trang /dashboard?period= — trang đầu tiên Trưởng/Phó Ban ATCL nhìn thấy (task-25-brief.md).
// AppShell/Sidebar KHÔNG render ở đây — bọc ở tầng route (app/routes.tsx), giống mọi trang sau
// RequireAuth khác (carry C6).
//
// Thứ tự khối đúng mockup (~/.gstack/.../design-review-20260909/dashboard.html, task-25-brief.md
// Step 2): tiêu đề + điều hướng kỳ → thanh coverage (nói "ai chưa nộp" một lần duy nhất) → 6 KPI
// lưới 3×2 → bảng 22 đơn vị 8 cột.
//
// Không có endpoint "kỳ gần nhất có báo cáo" (chỉ có /dashboard/summary, /dashboard/units — cả hai
// đòi `period` bắt buộc, carry C2) nên khi URL chưa có `?period=` thì dùng hằng số KY_MAC_DINH —
// đơn giản hơn hẳn so với gọi thêm API chỉ để suy ra kỳ mặc định (xem task-25-report.md mục "khác
// brief").
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { InlineError } from '../components/ui/InlineError'
import { Skeleton } from '../components/ui/Skeleton'
import { Coverage } from '../features/dashboard/Coverage'
import { KpiTile } from '../features/dashboard/KpiTile'
import { PeriodNav } from '../features/dashboard/PeriodNav'
import { UnitsTable } from '../features/dashboard/UnitsTable'
import { useSummary } from '../features/dashboard/useSummary'
import { useUnits } from '../features/dashboard/useUnits'
import { formatPeriod } from '../lib/format'

const KY_MAC_DINH = '2026-08'

// P2 (final-fix-FE.md, Ruling 424 · final-review-R2-report.md §A3) — xem bình luận dài trong
// `Dashboard()` bên dưới. `TEMPLATE` khoá cứng CÓ CHỦ Ý, đúng tiền lệ Status.tsx:30 và
// useReportList.ts.
const TEMPLATE = 'FM01'

interface PeriodInfo {
  period_key: string
}

// Khoá kỳ đúng dạng — CÙNG khái niệm với KY_PATTERN của backend (`api/status.py`). Chỉ dùng để
// biết có in được nhãn "MM/YYYY" hay không: `formatPeriod('xyz')` cho "undefined/xyz", nên chuỗi
// rác phải hiện NGUYÊN VĂN thay vì đi qua bộ định dạng.
const DANG_KHOA_KY = /^[0-9]{4}-(0[1-9]|1[0-2])$/

function nhanKy(period: string): string {
  return DANG_KHOA_KY.test(period) ? formatPeriod(period) : period
}

function TieuDe({
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
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <h1 className="text-pageTitle font-medium text-ink">Dashboard SKATMT</h1>
      <PeriodNav period={period} onChange={onChange} kyDau={kyDau} kyCuoi={kyCuoi} />
    </div>
  )
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = searchParams.get('period') ?? KY_MAC_DINH
  const doiKy = (p: string) => setSearchParams({ period: p }, { replace: true })

  const summary = useSummary(period)
  const units = useUnits(period)

  // P2 (final-fix-FE.md, Ruling 424 · final-review-R2-report.md §A3) — BA cửa, MỘT nguồn.
  //
  // `/dashboard/summary?period=…` nhận MỌI chuỗi và trả 200 kèm sáu KPI bằng 0 + "22 đơn vị chưa
  // nộp" (docstring `api/dashboard.py` khai đánh đổi này để giữ ngân sách 2 query). Trước bản vá,
  // trang tin thẳng vào đó, nên ba đường khác nhau cùng dẫn tới MỘT màn hình đọc y hệt "toàn bộ số
  // liệu vừa biến mất": (1) bấm `›` ở kỳ cuối dải — `PeriodNav` không có biên; (2) URL gõ tay
  // `?period=2026-10` — ĐÚNG định dạng, chỉ là không tồn tại; (3) `?period=xyz` — kéo theo
  // "undefined/xyz" trên thanh coverage và "NaN/NaN" trên PeriodNav.
  //
  // Siết `pattern` phía backend đóng được (3) và "2026-13" nhưng KHÔNG đóng được (2). Chặn biên
  // trong PeriodNav đóng được (1) nhưng không đóng được URL gõ tay. Câu hỏi đổi CHẤT — "kỳ này có
  // thật không?" — và nó ĐÃ có câu trả lời sẵn: GET /templates/{code}/periods, đúng endpoint
  // Status.tsx:53 đang dùng. CÙNG `queryKey` nên hai trang dùng chung một lượt tải, không gọi đôi.
  const ky = useQuery({
    queryKey: ['templates', TEMPLATE, 'periods'],
    queryFn: () => api.get<PeriodInfo[]>(`/templates/${TEMPLATE}/periods`),
  })

  // `dsKy === undefined` (đang tải / lỗi) và danh sách RỖNG đều có nghĩa "chưa biết dải" — không
  // khoá nút nào, không kết tội kỳ nào. Dải kỳ là một lượt gọi mạng nữa và Render free ngủ dậy trả
  // 502; một nguồn chân lý hỏng KHÔNG được biến kỳ THẬT thành "chưa có trong hệ thống" (cùng luật
  // "lỗi nền không phá màn hình đang có dữ liệu" ở nhánh dưới).
  const dsKy = ky.data !== undefined && ky.data.length > 0 ? ky.data.map((p) => p.period_key) : undefined
  const kyDau = dsKy?.[0]
  const kyCuoi = dsKy?.at(-1)
  const ngoaiDai = dsKy !== undefined && !dsKy.includes(period)

  // Vòng sửa 1 (task-25-fix-1.md A4, review mục 3/12): vai `reporter` không có `dashboard.view`
  // (seed/__init__.py:70) nên đây là đường đi tới được thật — gõ thẳng /dashboard nhận một câu
  // sai nguyên nhân ("Không tải được dữ liệu" + Thử lại lặp vô ích mãi mãi) nếu không tách riêng.
  // Khuôn giống hệt ReportDetail.tsx:46 (403 → câu "không có quyền" + lối thoát), không phát minh
  // khuôn thứ hai.
  const loi403 =
    summary.error instanceof ApiError && summary.error.status === 403
      ? summary.error
      : units.error instanceof ApiError && units.error.status === 403
        ? units.error
        : null
  if (loi403) {
    return (
      <div>
        <TieuDe period={period} onChange={doiKy} kyDau={kyDau} kyCuoi={kyCuoi} />
        <div className="border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">
          Bạn không có quyền xem dashboard này
          <div className="mt-2.5">
            <Link to="/reports" className="text-soot font-medium">
              Về báo cáo của đơn vị
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Kỳ ngoài dải: KHÔNG vẽ PeriodNav lẫn Coverage ở nhánh này — cả hai đều chạy chuỗi `period` qua
  // `formatPeriod`/`congThang`, và với "xyz" chúng in ra "undefined/xyz" và "NaN/NaN". Bỏ chúng đi
  // đóng luôn cửa (3) mà không phải vá hai bộ định dạng. Đổi lại người dùng mất đường điều hướng,
  // nên nút "Về kỳ …" là BẮT BUỘC — kỳ hiện tại không có thật thì "kỳ liền trước" cũng không có
  // nghĩa, lối thoát phải trỏ về một kỳ CÓ THẬT.
  if (ngoaiDai) {
    return (
      <div>
        <h1 className="text-pageTitle font-medium text-ink mb-4">Dashboard SKATMT</h1>
        <div className="border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">
          Kỳ {nhanKy(period)} chưa có trong hệ thống
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => doiKy(kyCuoi!)}
              className="text-soot font-medium bg-transparent border-0 cursor-pointer underline"
            >
              Về kỳ {nhanKy(kyCuoi!)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Vòng sửa 2 (task-25-fix-2.md P1/B-01, task-25-rereview-1.md B-01 [NẶNG] — LẦN THỨ BA của cùng
  // lớp lỗi: Task 20 (/auth/me 503 đăng xuất một phiên còn hợp lệ), Task 23 (refetch nền hỏng xoá
  // sạch reducer, task-23-fix-1 F1). `&& chưa có dữ liệu` KHÔNG thừa: `refetchOnWindowFocus` đang
  // BẬT toàn cục (app/queryClient.ts), nên một lượt làm mới NỀN hỏng khi `data` cũ còn nguyên
  // trong cache vẫn làm `isError = true`. Kiểm `isError` TRƯỚC `data` sẽ thay cả bảng 22 đơn vị,
  // 6 ô KPI và dòng bao phủ ĐANG ĐÚNG bằng `InlineError` vì một cú 502 của Render free — người
  // đang đọc số mất hết chỉ vì rời tab rồi quay lại. LỖI NỀN KHÔNG ĐƯỢC PHÁ MÀN HÌNH ĐANG CÓ DỮ
  // LIỆU. 403 ở trên vẫn thay cả trang vì đó là kết luận, không phải trục trặc tạm thời — khuôn
  // chép nguyên `ReportDetail.tsx:67`.
  if ((summary.isError || units.isError) && (summary.data === undefined || units.data === undefined)) {
    return (
      <div>
        <TieuDe period={period} onChange={doiKy} kyDau={kyDau} kyCuoi={kyCuoi} />
        <InlineError
          message="Không tải được dữ liệu"
          onRetry={() => {
            summary.refetch()
            units.refetch()
          }}
        />
      </div>
    )
  }

  // `ky.isLoading` nằm trong điều kiện skeleton CÓ CHỦ Ý: thiếu nó, một kỳ ngoài dải hiện màn
  // "0 đã duyệt / 22 chưa nộp" trong đúng khoảnh khắc dải kỳ chưa về rồi mới đổi sang câu tử tế —
  // tức vẫn chiếu đúng cái màn hình mục này đi xoá, chỉ ngắn hơn. Query đã lỗi thì `isLoading` là
  // false, nên nhánh này không giữ trang lại khi nguồn chân lý hỏng.
  if (summary.isLoading || units.isLoading || ky.isLoading || summary.data === undefined) {
    return (
      <div>
        <TieuDe period={period} onChange={doiKy} kyDau={kyDau} kyCuoi={kyCuoi} />
        <div data-testid="skeleton">
          <Skeleton rows={10} />
        </div>
      </div>
    )
  }

  const data = summary.data
  return (
    <div>
      <TieuDe period={period} onChange={doiKy} kyDau={kyDau} kyCuoi={kyCuoi} />
      <Coverage
        periodKey={data.period_key}
        reportingUnits={data.reporting_units}
        approvedCount={data.approved_count}
        submittedCount={data.submitted_count}
        missingUnits={data.missing_units}
      />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {data.kpis.map((k) => (
          <KpiTile
            key={k.code}
            code={k.code}
            label={k.label}
            unit={k.unit}
            value={data.approved_count === 0 ? null : k.value}
          />
        ))}
      </div>
      <UnitsTable rows={units.items} period={period} />
    </div>
  )
}
