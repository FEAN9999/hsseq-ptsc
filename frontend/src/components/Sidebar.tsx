// frontend/src/components/Sidebar.tsx
//
// Dựng lại ở Lát 1 trên bộ `components/ui/sidebar.tsx` của shadcn, theo mockup
// `ShadcnSidebar.dc.html` trong gói handoff. Số đo lấy nguyên từ mockup: khung 16rem, mục cao 32px
// bo 8px, nhãn nhóm 12px ở `--sidebar-foreground/70`, chân trang 48px.
//
// PHÂN QUYỀN GIỮ NGUYÊN từ bản trước — đây vẫn là chỗ gác quyền theo trang (không phải RequireAuth):
// ẩn hẳn mục không có quyền, không hiện rồi mới chặn. Ba nhánh nhãn "báo cáo" BẮT BUỘC là if/else
// theo thứ tự, không phải ba boolean độc lập: vai admin_atcl thật (seed) nắm TOÀN BỘ danh mục quyền
// nên trúng cả ba nhánh cùng lúc.
//
// Đọc `orgUnit` — TRƯỜNG RIÊNG cấp cao nhất của session, KHÔNG lồng trong `user` (khớp
// `GET /auth/me` trả bốn khoá ngang hàng {user, roles, permissions, org_unit}, xem session.ts).
//
// KỲ BÁO CÁO lên sidebar thành bối cảnh toàn app (đổi UX của Lát 1, spec §7). Nguồn sự thật vẫn là
// tham số URL `?period=` mà Dashboard đang đọc — KHÔNG đẻ thêm state toàn cục song song, vì hai
// nguồn cho cùng một giá trị là đúng thứ đã làm hỏng token ở Lát 0.
import { ChevronLeft, ChevronRight, Calendar, ChevronsUpDown, LayoutDashboard, FileCheck2, Table2, LogOut } from 'lucide-react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'

import {
  Sidebar as SidebarKhung,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { useQuery } from '@tanstack/react-query'

import { api } from '../api/client'
import { congThang, formatPeriod, KY_MAC_DINH } from '../lib/format'
import { useSession } from '../app/session'
import { useSummary } from '../features/dashboard/useSummary'
import { nhanTrangBaoCao } from '../features/reports/nhanTrang'
// Lát 8: ba mục quản trị (quyền → đường → nhãn → icon) ở `features/admin/muc.ts` — breadcrumb của
// AppShell đọc CÙNG danh sách đó, nên hai chỗ không thể gọi một trang bằng hai tên.
import { MUC_QUAN_TRI } from '../features/admin/muc'

/** Bộ chọn kỳ: ‹ | 08/2026 | › — lái thẳng `?period=` trên URL.
 *
 *  Đây là bộ chọn kỳ DUY NHẤT của app. Dashboard từng có thêm một bộ nữa trên đầu trang; hai bộ
 *  điều khiển cùng một `?period=` đứng cách nhau 20cm trên cùng màn hình chỉ làm người dùng phải
 *  chọn xem bấm cái nào, nên bản trên đầu trang đã bỏ.
 *
 *  Kèm theo đó là BIÊN của dải kỳ (P2, Ruling 424 — trước đây nằm ở `PeriodNav` của Dashboard):
 *  không khoá hai đầu thì ở kỳ cuối dải một cú bấm `›` đẩy người trình bày sang một kỳ KHÔNG TỒN
 *  TẠI. Dashboard có màn "kỳ chưa có trong hệ thống" đỡ ở dưới, nhưng đẩy người ta vào ngõ cụt rồi
 *  mới xin lỗi thì tệ hơn là không cho bấm. */
function ChonKy() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = searchParams.get('period') ?? KY_MAC_DINH

  // CÙNG khoá truy vấn với Dashboard/Status/QuanTriMau nên trên ba màn đó đây không phải lượt gọi
  // thứ hai — TanStack trả thẳng từ cache. Truy vấn nằm TRONG `ChonKy` nên người không có
  // `dashboard.view` lẫn `status.view` (bộ chọn không vẽ) cũng không hỏi gì cả.
  const dai = useQuery({
    queryKey: ['templates', 'FM01', 'periods'],
    queryFn: () => api.get<{ period_key: string }[]>('/templates/FM01/periods'),
  })
  const dsKy = dai.data !== undefined && dai.data.length > 0 ? dai.data : undefined

  const truoc = congThang(period, -1)
  const sau = congThang(period, 1)
  // KHÔNG khoá gì khi chưa biết dải: dải kỳ là một lượt gọi mạng nữa, và nó hỏng (Render 502) thì
  // đường đi bình thường phải còn nguyên. "YYYY-MM" có tháng đệm 0 nên so sánh CHUỖI là đúng thứ
  // tự thời gian.
  const khoaTruoc = dsKy !== undefined && truoc < dsKy[0].period_key
  const khoaSau = dsKy !== undefined && sau > dsKy.at(-1)!.period_key

  const doi = (ky: string) => {
    const moi = new URLSearchParams(searchParams)
    moi.set('period', ky)
    setSearchParams(moi, { replace: true })
  }

  const NUT =
    'flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-transparent text-secondary-foreground hover:bg-sidebar-accent disabled:opacity-40'

  return (
    <div className="px-2 pb-2">
      <div className="mx-2 mb-2 h-px bg-border" />
      <div className="flex h-8 items-center px-2 text-xs font-medium text-sidebar-foreground/70">
        Kỳ báo cáo
      </div>
      <div className="flex items-center gap-1 px-2">
        <button
          type="button"
          aria-label="Kỳ trước"
          disabled={khoaTruoc}
          className={NUT}
          onClick={() => doi(truoc)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-medium tabular-nums">
          <Calendar className="size-3.5 text-muted-foreground" />
          {formatPeriod(period)}
        </span>
        <button
          type="button"
          aria-label="Kỳ sau"
          disabled={khoaSau}
          className={NUT}
          onClick={() => doi(sau)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const [searchParams] = useSearchParams()
  const permissions = useSession((s) => s.permissions)
  const user = useSession((s) => s.user)
  const orgUnit = useSession((s) => s.orgUnit)
  const logout = useSession((s) => s.logout)

  const co = (ma: string) => permissions.has(ma)

  // Một slot "báo cáo" duy nhất. Ba nhánh chọn tên nay ở `features/reports/nhanTrang.ts` — vệt
  // breadcrumb của AppShell đọc CÙNG hàm đó, nên hai chỗ không thể nói hai tên khác nhau nữa.
  const nhanBaoCao = nhanTrangBaoCao(permissions)

  const mucQuanTriDuocPhep = MUC_QUAN_TRI.filter((m) => co(m.quyen))
  const vietTat = (user?.email ?? '??').slice(0, 2).toUpperCase()

  // Hai huy hiệu, MỘT lượt gọi: `/dashboard/summary` của kỳ đang xem trả cả `submitted_count`
  // (số đang chờ duyệt) lẫn `missing_units`/`reporting_units` (đã nộp trên tổng đầu mối).
  //
  // `staleTime` 5 phút vì đây là lựa chọn của RIÊNG nơi quan sát này (v5 tính staleTime theo
  // observer): đi qua lại giữa các trang không bắn thêm lượt nào, mà Dashboard vẫn giữ nguyên nếp
  // làm mới của nó. Sau mọi lượt duyệt/nộp, `invalidateReportQueries` vô hiệu khoá `['dashboard']`
  // nên hai con số này vẫn đổi NGAY — staleTime không che được một lượt invalidate.
  //
  // Chỉ bật cho người có `dashboard.view`; không có nó thì mỗi người nộp sẽ kéo theo một lượt 403
  // mỗi lần mở bất kỳ trang nào. Hỏng thì KHÔNG hiện huy hiệu và KHÔNG báo gì — thanh điều hướng
  // không được hỏng vì một con số trang trí.
  //
  // Đọc từng trường qua một phép kiểm KIỂU, không chỉ `?? null`: một thân trả về méo (proxy lỗi trả
  // JSON khác, endpoint đổi hình dạng) sẽ làm `missing_units.length` ném ngay trong lúc dựng —
  // và vì Sidebar nằm trong khung của MỌI trang, một cú ném ở đây là màn trắng toàn app. Không
  // đáng đánh đổi thế cho một con số trang trí.
  const kyDangXem = searchParams.get('period') ?? KY_MAC_DINH
  const tong = useSummary(kyDangXem, { batDau: co('dashboard.view'), staleTime: 5 * 60_000 })
  const laSo = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  const soChoDuyet = laSo(tong.data?.submitted_count) ? tong.data.submitted_count : null
  const tongDauMoi = laSo(tong.data?.reporting_units) ? tong.data.reporting_units : null
  const soThieu = Array.isArray(tong.data?.missing_units) ? tong.data.missing_units.length : null
  const daNop = tongDauMoi !== null && soThieu !== null ? tongDauMoi - soThieu : null

  return (
    <SidebarKhung>
      <SidebarHeader className="gap-2">
        <div className="flex flex-col gap-2.5 px-2 pt-2 pb-1">
          <img src="/ptsc-wordmark.png" alt="PTSC" className="block h-[26px] w-auto shrink-0 self-start" />
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[15px] font-bold tracking-[0.02em] text-primary">HSSEQ</span>
            <span className="h-[13px] w-px shrink-0 bg-border" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              Ban An toàn Chất lượng
            </span>
          </span>
        </div>
        {/* Người nộp chỉ làm việc trên kỳ của chính báo cáo họ mở — không cần bộ chọn kỳ toàn app. */}
        {(co('dashboard.view') || co('status.view')) && <ChonKy />}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Nghiệp vụ</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {co('dashboard.view') && (
                <MucNav to="/dashboard" nhan="Dashboard" Icon={LayoutDashboard} />
              )}
              {nhanBaoCao && (
                <MucNav
                  to="/reports"
                  nhan={nhanBaoCao}
                  Icon={FileCheck2}
                  // Số CHỜ DUYỆT chỉ có nghĩa với người duyệt được. Vai "Báo cáo"/"Báo cáo của đơn
                  // vị" nhìn cùng con số sẽ đọc nó thành "việc của tôi", mà không phải.
                  dau={co('report.approve') && soChoDuyet ? String(soChoDuyet) : undefined}
                  canhBao
                />
              )}
              {co('status.view') && (
                <MucNav
                  to="/status"
                  nhan="Tình trạng nộp"
                  Icon={Table2}
                  dau={daNop === null ? undefined : `${daNop}/${tongDauMoi}`}
                  // KHÔNG tô hổ phách: "21/22" là một phép đo, không phải một việc phải làm.
                  // Hổ phách ở đây sẽ tranh chú ý với con số chờ duyệt ngay trên nó.
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {mucQuanTriDuocPhep.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Quản trị nền tảng</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mucQuanTriDuocPhep.map(({ quyen, to, nhan, Icon }) => (
                  <MucNav key={quyen} to={to} nhan={nhan} Icon={Icon} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-[11px] font-medium tabular-nums">
                    {vietTat}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    {/* span riêng: getByText('x@ptsc.local') cần MỘT phần tử có textContent đúng
                        khớp, không lẫn tên đơn vị vào cùng khối văn bản. */}
                    <span className="truncate text-sm font-medium">{user?.email}</span>
                    {orgUnit && (
                      <span className="truncate text-xs text-muted-foreground">{orgUnit.name}</span>
                    )}
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width]">
                <DropdownMenuItem onClick={logout}>
                  <LogOut />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarKhung>
  )
}

function MucNav({
  to,
  nhan,
  Icon,
  dau,
  canhBao,
}: {
  to: string
  nhan: string
  Icon: typeof LayoutDashboard
  /** Số hiển thị bên phải mục. Chưa nối dữ liệu thật — Lát 5 và Lát 6 sẽ nối. */
  dau?: string
  canhBao?: boolean
}) {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const dangMo = pathname === to || pathname.startsWith(`${to}/`)

  // Mang `?period=` theo khi đổi trang: kỳ báo cáo là bối cảnh toàn app (spec §7, đổi UX của Lát 1),
  // mà nguồn sự thật của nó là URL — không mang theo thì đổi trang là mất kỳ đang xem.
  const ky = searchParams.get('period')
  const dich = ky ? { pathname: to, search: `?period=${ky}` } : to

  return (
    <SidebarMenuItem>
      {/* `asChild` để href nằm TRÊN CHÍNH phần tử mang style của nút — không bọc <a> ra ngoài rồi
          style một <span> bên trong, vì khi đó vùng bấm và vùng nhìn là hai phần tử khác nhau. */}
      <SidebarMenuButton asChild isActive={dangMo}>
        <NavLink to={dich}>
          <Icon />
          <span className="flex-1 truncate">{nhan}</span>
        </NavLink>
      </SidebarMenuButton>
      {dau && (
        <SidebarMenuBadge
          // Chữ MỰC trên nền hổ phách, không phải chữ trắng: trắng trên `--warning` chỉ 3,77:1,
          // trượt AA (spec §4 mục 2). `--secondary-foreground` trên nền đó là 4,64:1.
          // Badge số trơn rơi lên `bg-sidebar-accent` khi mục đang mở nên phải là `text-sec`
          // (7,14:1), KHÔNG phải `text-muted-foreground` (4,41:1 — spec §4 mục 1).
          className={
            canhBao ? 'bg-warning text-secondary-foreground' : 'bg-transparent text-sec'
          }
        >
          {dau}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
