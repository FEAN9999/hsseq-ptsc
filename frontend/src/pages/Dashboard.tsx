// frontend/src/pages/Dashboard.tsx
//
// Dashboard SKATMT, dựng lại ở Lát 4 theo mockup `Redesign shadcn.dc.html` mục 02.
// AppShell/Sidebar KHÔNG render ở đây — bọc ở tầng route (app/routes.tsx).
//
// Kỳ đọc từ `?period=` trên URL, do bộ chọn kỳ trên sidebar (components/Sidebar.tsx) lái. Trang
// này KHÔNG có bộ chọn kỳ riêng: bản đầu của Lát 4 giữ lại `PeriodNav` trên đầu trang, thành ra
// hai bộ điều khiển cùng một giá trị nằm cách nhau 20cm trên cùng màn hình. Biên của dải kỳ (P2,
// Ruling 424) đi theo bộ chọn về sidebar.
//
// Sáu KPI của `/dashboard/summary` được CHIA làm hai, không lọc theo danh sách mã cố định ở từng
// component: ba chỉ tiêu có MỤC TIÊU BẰNG 0 lên panel tối (số càng nhỏ càng tốt), phần CÒN LẠI
// xuống ba thẻ khối lượng. Thứ tự trong mỗi nhóm giữ nguyên thứ tự mảng API (carry C2), và một chỉ
// tiêu mới do backend thêm vào tự rơi vào nhóm khối lượng thay vì biến mất.
//
// Bốn nhánh thoát sớm giữ nguyên từ bản trước vì chúng là hành vi đã đo, không phải trang trí:
//   403        → nói thẳng thiếu quyền + lối về báo cáo đơn vị
//   ngoài dải  → kỳ không có trong hệ thống, kèm lối về kỳ mới nhất có thật
//   lỗi tải    → InlineError có nút thử lại
//   đang tải   → khung xương
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { api, ApiError } from '../api/client'
import { Card, CardContent } from '../components/ui/card'
import { InlineError } from '../components/ui/InlineError'
import { SkeletonDong } from '../components/ui/SkeletonDong'
import { BangChiSo } from '../features/dashboard/BangChiSo'
import { BaoPhuKy } from '../features/dashboard/BaoPhuKy'
import { Coverage } from '../features/dashboard/Coverage'
import { TheSoLieu } from '../features/dashboard/TheSoLieu'
import { UnitsTable } from '../features/dashboard/UnitsTable'
import { useSummary } from '../features/dashboard/useSummary'
import { useUnits } from '../features/dashboard/useUnits'
import { KY_MAC_DINH, formatPeriod } from '../lib/format'

const TEMPLATE = 'FM01'

/** Ba chỉ tiêu mà "tốt" nghĩa là BẰNG 0 — tách lên panel tối. Đây là phân loại NGỮ NGHĨA của chỉ
 *  tiêu, không phải thứ tự hiển thị, nên khoá theo mã là đúng chỗ. */
const MA_MUC_TIEU_KHONG = new Set(['B-2.2', 'B-2.1', 'DON_VI_CO_LTI'])

interface PeriodInfo {
  period_key: string
}

const DANG_KHOA_KY = /^[0-9]{4}-(0[1-9]|1[0-2])$/

function nhanKy(period: string): string {
  return DANG_KHOA_KY.test(period) ? formatPeriod(period) : period
}

const LOP_H1 = 'text-2xl font-medium leading-[1.2] tracking-[-0.4px] text-foreground'

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = searchParams.get('period') ?? KY_MAC_DINH
  const doiKy = (p: string) => setSearchParams({ period: p }, { replace: true })

  const summary = useSummary(period)
  const units = useUnits(period)

  const ky = useQuery({
    queryKey: ['templates', TEMPLATE, 'periods'],
    queryFn: () => api.get<PeriodInfo[]>(`/templates/${TEMPLATE}/periods`),
  })
  const dsKy =
    ky.data !== undefined && ky.data.length > 0 ? ky.data.map((p) => p.period_key) : undefined
  const kyCuoi = dsKy?.at(-1)
  const ngoaiDai = dsKy !== undefined && !dsKy.includes(period)

  const loi403 =
    summary.error instanceof ApiError && summary.error.status === 403
      ? summary.error
      : units.error instanceof ApiError && units.error.status === 403
        ? units.error
        : null

  if (loi403) {
    return (
      <div>
        <h1 className={`mb-4 ${LOP_H1}`}>Dashboard SKATMT</h1>
        <Card>
          <CardContent className="py-4 text-center text-sm text-secondary-foreground">
            Bạn không có quyền xem dashboard này
            <div className="mt-2.5">
              <Link to="/reports" className="font-medium text-secondary-foreground">
                Về báo cáo của đơn vị
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (ngoaiDai) {
    return (
      <div>
        {/* Biên của bộ chọn kỳ trên sidebar chỉ khoá đúng MỘT bước quanh dải, còn kỳ ở đây có
            thể cách dải bao xa tuỳ ý (gõ tay `?period=`, hoặc không phải kỳ hợp lệ). Lối về nằm
            ngay dưới. */}
        <h1 className={`mb-4 ${LOP_H1}`}>Dashboard SKATMT</h1>
        <Card>
          <CardContent className="py-4 text-center text-sm text-secondary-foreground">
            Kỳ {nhanKy(period)} chưa có trong hệ thống
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => doiKy(kyCuoi!)}
                className="cursor-pointer border-0 bg-transparent font-medium text-secondary-foreground underline"
              >
                Về kỳ {nhanKy(kyCuoi!)}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (
    (summary.isError || units.isError) &&
    (summary.data === undefined || units.data === undefined)
  ) {
    return (
      <div>
        <h1 className={`mb-4 ${LOP_H1}`}>Dashboard SKATMT</h1>
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

  if (summary.isLoading || units.isLoading || ky.isLoading || summary.data === undefined) {
    return (
      <div>
        <h1 className={`mb-4 ${LOP_H1}`}>Dashboard SKATMT</h1>
        <div data-testid="skeleton">
          <SkeletonDong rows={10} />
        </div>
      </div>
    )
  }

  const data = summary.data
  // Chưa có báo cáo nào được duyệt thì mọi số tổng đều VÔ NGHĨA, không phải bằng 0 — giữ nguyên
  // quy ước của bản trước: đẩy `null` xuống, để chỗ hiển thị vẽ dấu "—".
  const kpis = data.approved_count === 0 ? data.kpis.map((k) => ({ ...k, value: null })) : data.kpis
  const kpiAnToan = kpis.filter((k) => MA_MUC_TIEU_KHONG.has(k.code))
  const kpiKhoiLuong = kpis.filter((k) => !MA_MUC_TIEU_KHONG.has(k.code))
  // Mã các đơn vị thực sự có LTI trong kỳ — đọc từ bảng đơn vị, không bịa.
  const maCoLti = units.items.filter((u) => (u.lti ?? 0) > 0).map((u) => u.org_unit.code)

  return (
    <div>
      <h1 className={`mb-4 ${LOP_H1}`}>Dashboard SKATMT</h1>
      <Coverage
        periodKey={data.period_key}
        reportingUnits={data.reporting_units}
        approvedCount={data.approved_count}
        submittedCount={data.submitted_count}
        missingUnits={data.missing_units}
      />
      <BangChiSo kpis={kpiAnToan} maCoLti={maCoLti} />
      <BaoPhuKy units={units.items} period={period} />
      <TheSoLieu kpis={kpiKhoiLuong} />
      <UnitsTable rows={units.items} period={period} />
    </div>
  )
}
