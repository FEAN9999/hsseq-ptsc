// frontend/src/pages/Status.tsx
//
// Trang /status — "Tình trạng nộp", trang CUỐI CÙNG của ứng dụng (task-26-brief.md). Lưới đơn vị ×
// kỳ (Task 13, GET /status) + nút sao chép danh sách chưa nộp. AppShell/Sidebar KHÔNG render ở đây
// — bọc ở tầng route (app/routes.tsx), giống mọi trang sau RequireAuth khác.
//
// HAI lượt gọi NỐI TIẾP (khuôn ReportDetail.tsx — hai query phụ thuộc nhau trong CHÍNH trang, không
// phải khuôn SONG SONG useSummary.ts/useUnits.ts của Dashboard.tsx, vì ở đây query thứ hai cần kết
// quả của query thứ nhất mới gọi được, đúng hình dạng baoCao→mau của ReportDetail):
// GET /status cần BA tham số bắt buộc `template`/`from`/`to`, không giá trị mặc định (carry C6) —
// `from`/`to` không được khoá cứng (carry C7, brief: "phụ thuộc DỮ LIỆU"), phải suy từ
// GET /templates/FM01/periods (đã sắp theo start_date): kỳ đầu = phần tử đầu; "kỳ đang mở" = phần
// tử CUỐI CÙNG có is_open=true — KHÔNG phải phần tử ĐẦU TIÊN có is_open=true, vì seed hiện có HAI
// kỳ cùng is_open=true (08 và 09/2026) và "kỳ đang mở" theo brief phải là kỳ MỚI NHẤT (09/2026),
// không phải kỳ open sớm nhất.
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { api, ApiError } from '../api/client'
import { InlineError } from '../components/ui/InlineError'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusGrid, type StatusUnit } from '../features/status/StatusGrid'
import { useCopyMissing } from '../features/status/useCopyMissing'
import { formatPeriod } from '../lib/format'

// carry C9: `template=FM01` khoá cứng CÓ CHỦ Ý ở FE, theo đúng tiền lệ useReportList.ts (Task 20)
// — gỡ khoá cứng là thay đổi TOÀN CỤC, ngoài phạm vi Task 26.
const TEMPLATE = 'FM01'

interface PeriodInfo {
  period_key: string
  is_open: boolean
}

interface StatusOut {
  periods: string[]
  units: StatusUnit[]
}

// "Kỳ đang mở" = phần tử CUỐI CÙNG (không phải đầu tiên) có is_open=true — xem bình luận đầu file.
function kyDangMo(periods: PeriodInfo[]): string | undefined {
  return periods.filter((p) => p.is_open).at(-1)?.period_key
}

function TieuDe({ children }: { children: React.ReactNode }) {
  return <h1 className="text-pageTitle font-medium text-ink">{children}</h1>
}

export function Status() {
  const ky = useQuery({
    queryKey: ['templates', TEMPLATE, 'periods'],
    queryFn: () => api.get<PeriodInfo[]>(`/templates/${TEMPLATE}/periods`),
  })

  const tu = ky.data?.[0]?.period_key
  const den = ky.data ? kyDangMo(ky.data) : undefined

  const tk = useQuery({
    queryKey: ['status', TEMPLATE, tu, den],
    queryFn: () => api.get<StatusOut>(`/status?template=${TEMPLATE}&from=${tu}&to=${den}`),
    enabled: tu !== undefined && den !== undefined,
  })

  const saoChep = useCopyMissing()

  // Vòng lỗi 403 (thiếu status.view — reporter gõ thẳng URL vẫn tới được route, khuôn
  // Dashboard.tsx/ReportDetail.tsx): thay CẢ TRANG, đây là kết luận chứ không phải trục trặc tạm.
  const loi = ky.error ?? tk.error
  if (loi instanceof ApiError && loi.status === 403) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <div className="mt-4 border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">
          Bạn không có quyền xem tình trạng nộp này
          <div className="mt-2.5">
            <Link to="/reports" className="text-soot font-medium">
              Về báo cáo của đơn vị
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Lỗi NỀN không được phá màn đang có dữ liệu (C13 mục 2, khuôn ReportDetail.tsx/Dashboard.tsx):
  // `&& chưa có dữ liệu` bắt buộc — refetchOnWindowFocus bật toàn cục, một lượt làm mới nền hỏng
  // khi `data` cũ còn nguyên trong cache KHÔNG được xoá màn hình đang đúng.
  if (loi && (ky.data === undefined || tk.data === undefined)) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <InlineError
          message="Không tải được dữ liệu"
          onRetry={() => {
            ky.refetch()
            tk.refetch()
          }}
        />
      </div>
    )
  }

  if (ky.data === undefined || tk.data === undefined) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <div data-testid="skeleton" className="mt-4">
          <Skeleton rows={10} />
        </div>
      </div>
    )
  }

  const data = tk.data
  const kyCuoi = data.periods.at(-1) ?? ''
  const donViChuaNop = data.units.filter(
    (u) => u.cells.find((c) => c.period_key === kyCuoi)?.state === null,
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        {donViChuaNop.length > 0 && (
          <button
            type="button"
            onClick={() => saoChep(donViChuaNop.map((u) => u.name))}
            className="inline-flex items-center justify-center h-8 px-3.5 rounded-input border border-hair bg-surface text-table font-medium text-ink transition-colors duration-[120ms] hover:bg-mutedbg"
          >
            Sao chép danh sách chưa nộp ({formatPeriod(kyCuoi)})
          </button>
        )}
      </div>
      <p className="text-sec text-table mb-5">
        Từ {formatPeriod(data.periods[0])} (kỳ đầu có dữ liệu) đến {formatPeriod(kyCuoi)} (kỳ đang mở)
      </p>
      <StatusGrid periods={data.periods} units={data.units} />
    </div>
  )
}
