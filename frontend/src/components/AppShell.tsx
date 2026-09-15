// frontend/src/components/AppShell.tsx
//
// Khung ứng dụng: sidebar cố định bên trái + nội dung full-bleed bên phải, padding 24 (mockup
// dashboard.html v.v. `.main{padding:24px}`). Chỉ lo BỐ CỤC — mục nào hiện trong sidebar là việc
// của Sidebar.tsx (theo quyền), trang nào được vào là việc của RequireAuth (src/app/router.tsx).
// "HSEQ" chỉ ở <title> (index.html) — không lặp lại chữ đó ở đây (brief bước 2).
//
// Bề rộng 220px đặt TRỰC TIẾP trên chính <aside> (Sidebar.tsx, utility w-[220px]) thay vì qua
// grid-template-columns của khung ngoài — để một khẳng định qua resolveCascadeWinner(cls,'width')
// đọc đúng ngay trên phần tử sidebar, không phải suy luận gián tiếp qua CSS của phần tử cha
// (carry C3: mọi khẳng định về bề rộng phải đo được, không suy luận).
//
// Chưa làm phần thu gọn 56px icon dưới 1024px hữu dụng (D21, docs/designs/hseq-platform-mvp-fm01.md)
// — xem task-18-report.md mục "Mối lo": đó là phạm vi TD8 riêng (đụng index.css + Playwright, chưa
// có trong repo), không nằm trong 3 file brief liệt kê cho Task 18, và jsdom/cascade.ts không có
// cách đo thật một tuyên bố phụ thuộc viewport — thêm mà không đo được là đúng thứ carry cấm.
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-canvas">
      <Sidebar />
      {/* P3 (Ruling 425): `pb-[var(--toast-cao)]` chừa sẵn dải Toast ở ĐÁY VÙNG NỘI DUNG, không chỉ
          cho thanh dính. Một trang dài cuộn xuống có thể đặt BẤT KỲ nút nào vào góc dưới phải, nên
          luật "Toast không nằm đè lên vùng bấm được" phải đặt ở tầng khung, không phải từng thanh.
          Biến mặc định `0px` (index.css) nên khi không có Toast, bố cục không đổi một pixel nào. */}
      <main className="flex-1 min-w-0 p-6 pb-[calc(1.5rem+var(--toast-cao))]">{children}</main>
    </div>
  )
}
