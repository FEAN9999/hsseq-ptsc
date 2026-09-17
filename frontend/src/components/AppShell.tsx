// frontend/src/components/AppShell.tsx
//
// Khung ứng dụng, dựng lại ở Lát 1 trên `SidebarProvider` + `SidebarInset` của shadcn theo mockup
// `Redesign shadcn.dc.html`. Chỉ lo BỐ CỤC — mục nào hiện trong sidebar là việc của Sidebar.tsx
// (theo quyền), trang nào được vào là việc của RequireAuth (src/app/routes.tsx).
// "HSEQ" chỉ ở <title> (index.html) — không lặp lại chữ đó ở đây.
//
// Thanh đầu trang: nút thu/mở sidebar + breadcrumb. Breadcrumb suy từ đường dẫn, KHÔNG nhận props —
// AppShell bọc ở tầng route nên nó chỉ có `children`, và bắt mọi trang tự truyền breadcrumb là
// thêm một chỗ để quên. Nhãn hành động riêng của từng trang (Xuất PDF, Trình bày…) thuộc về lát
// dựng trang đó, chưa đưa vào đây.
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { useSession } from '../app/session'
import { nhanTrangBaoCao } from '../features/reports/nhanTrang'
import { MUC_QUAN_TRI } from '../features/admin/muc'
import { Sidebar } from './Sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb'
import { Separator } from './ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from './ui/sidebar'

/** Đường dẫn → hai cấp breadcrumb. Cấp 1 là NHÓM trong sidebar, khớp mockup. */
function duongDanBreadcrumb(pathname: string, nhanBaoCao: string | null): [string, string] {
  if (pathname.startsWith('/dashboard')) return ['Nghiệp vụ', 'Dashboard']
  if (pathname.startsWith('/status')) return ['Nghiệp vụ', 'Tình trạng nộp']
  // /reports/:id (một báo cáo cụ thể) nằm DƯỚI trang danh sách, không ngang hàng. Cấp 1 là NHÓM
  // (như mọi dòng khác), KHÔNG phải "Duyệt báo cáo": nhãn của trang danh sách đổi theo quyền
  // (Sidebar.tsx), nên viết cứng một nhãn ở đây là nói sai với người chỉ có quyền nộp. Lối về
  // đúng-theo-quyền nằm ở nút quay lại của chính trang (pages/ReportDetail.tsx).
  if (/^\/reports\/[^/]+/.test(pathname)) return ['Nghiệp vụ', 'Báo cáo đơn vị']
  // Nhãn trang danh sách đổi theo QUYỀN, đúng cùng một hàm mà mục nav Sidebar dùng — viết cứng
  // "Duyệt báo cáo" ở đây (bản trước Lát 6) là hứa một quyền mà người chỉ-nộp không có, ngay trên
  // màn hình họ mở nhiều nhất. `null` (không quyền nào chạm tới trang) không xảy ra sau
  // RequireAuth, nhưng vẫn phải có nhãn để breadcrumb không rỗng.
  if (pathname.startsWith('/reports')) return ['Nghiệp vụ', nhanBaoCao ?? 'Báo cáo']
  // Lát 8 — nhóm THỨ HAI của sidebar. Nhãn lấy đúng chữ trên mục nav (Sidebar.tsx MUC_QUAN_TRI):
  // breadcrumb nói tên khác mục nav vừa bấm là đúng lớp lỗi Lát 6 đã sửa ở `/reports`.
  const mucQuanTri = MUC_QUAN_TRI.find((m) => pathname.startsWith(m.to))
  if (mucQuanTri) return ['Quản trị nền tảng', mucQuanTri.nhan]
  return ['Nghiệp vụ', '']
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const permissions = useSession((s) => s.permissions)
  const [nhom, trang] = duongDanBreadcrumb(pathname, nhanTrangBaoCao(permissions))

  return (
    <SidebarProvider>
      <Sidebar />
      {/* `min-w-0` — KHÔNG phải trang trí. `SidebarInset` của shadcn là `<main class="flex w-full
          flex-1 …">` nằm trong một khung flex NGANG, và mặc định `min-width:auto` của flex item
          khiến nó KHÔNG co xuống dưới bề rộng nội dung. Hệ quả đo được ở 1024 zoom 125% (một trong
          ba thiết bị đích): một bảng rộng không làm khung bọc `overflow-x-auto` của chính nó cuộn,
          mà đẩy CẢ TRANG rộng ra — `documentElement.scrollWidth` 1118 trên `clientWidth` 1024, kéo
          theo cả sidebar lẫn thanh đầu trang trượt khỏi màn hình. Vùng nội dung bên trong đã có
          `min-w-0` từ Lát 1; thiếu đúng một mắt xích ở tầng trên làm nó vô hiệu. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <span className="text-muted-foreground">{nhom}</span>
              </BreadcrumbItem>
              {trang && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{trang}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        {/* `pb-[calc(1.5rem+var(--toast-cao))]` chừa sẵn dải Toast ở ĐÁY VÙNG NỘI DUNG, không chỉ
            cho thanh dính. Một trang dài cuộn xuống có thể đặt BẤT KỲ nút nào vào góc dưới phải, nên
            luật "Toast không nằm đè lên vùng bấm được" phải đặt ở tầng khung, không phải từng thanh.
            Biến mặc định `0px` (index.css) nên khi không có Toast, bố cục không đổi một pixel nào. */}
        {/* <div>, KHÔNG phải <main>: `SidebarInset` của shadcn ĐÃ là <main>, lồng thêm một cái nữa
            là HTML sai (mỗi tài liệu chỉ có một <main>) và làm mọi phép đo `querySelector('main')`
            bắt nhầm phần tử ngoài. `data-slot` là móc ổn định để test đo đúng vùng nội dung. */}
        <div
          data-slot="noi-dung"
          className="min-w-0 flex-1 p-6 pb-[calc(1.5rem+var(--toast-cao))]"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
