// frontend/src/components/Sidebar.tsx
//
// Mục sidebar hiện theo quyền của người đăng nhập, đọc thẳng `useSession` (không nhận props —
// mọi nơi dùng đọc chung một phiên toàn cục). Gác PHÂN QUYỀN theo trang không phải việc của
// `RequireAuth` (xem comment trong src/app/router.tsx) — đây chính là chỗ đó xảy ra: ẩn hẳn mục
// không có quyền, không hiện rồi mới chặn.
//
// Đọc `orgUnit` — TRƯỜNG RIÊNG cấp cao nhất của session, KHÔNG lồng trong `user` (carry Task 18,
// C1; khớp `GET /auth/me` trả bốn khoá ngang hàng {user, roles, permissions, org_unit}, xem
// session.ts). Sai chỗ này thì đúng test giả (session dựng sai hình dạng) nhưng sai thật lúc
// Task 19 đăng nhập.
//
// "Quản trị nền tảng" (Mẫu báo cáo / Tổ chức / Người dùng): trang CHƯA XÂY (Giai đoạn 2 — xem
// TODOS.md, docs/designs mục "NOT in scope"). Mỗi mục vẫn gác ĐÚNG quyền riêng của nó
// (template.manage / org.manage / user.manage) như mọi mục khác — chỉ khác ở chỗ luôn hiện mờ,
// khoá, kèm tooltip, không dẫn tới trang trắng (đúng mockup dashboard.html/status.html/approve.html
// — cả ba đều hiện đủ 3 mục mờ này, vì tài khoản demo duy nhất có các quyền này (admin_atcl,
// backend/app/seed/__init__.py) nắm TOÀN BỘ danh mục quyền, kể cả 3 quyền Giai đoạn 2).
import { NavLink } from 'react-router-dom'
import { Wordmark } from './ui/Wordmark'
import { useSession } from '../app/session'

// text-[Npx] (không dùng text-xs/text-table): mockup (tokens.css `.nav a`/`.grp`/`.user`) chỉ đặt
// font-size, để line-height 1.45 của body chảy xuống — đúng bài học Tile (ui.test.tsx, vòng sửa 1
// S2): text-xs/text-table của Tailwind tự mang line-height riêng, ép sai nếu dùng nhầm ở đây.
const LOP_MUC = 'block py-2 px-2.5 rounded-input text-[13px] text-soot'
const LOP_MUC_DANG_MO = `${LOP_MUC} bg-mutedbg font-medium`
// #a8a29e: đúng màu `.nav a.dim` trong tokens.css — CỐ Ý không phải token `sec` (#78716c, tailwind
// .config.ts ghi rõ "KHÔNG dùng #a8a29e cho chữ NỘI DUNG"); đây là chữ mục điều hướng bị khoá,
// không phải nội dung, và #a8a29e là màu DUY NHẤT mockup dùng cho đúng trạng thái này.
const LOP_MUC_KHOA = 'block py-2 px-2.5 rounded-input text-[13px] text-[#a8a29e]'

function MucNav({ to, children }: { to: string; children: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? LOP_MUC_DANG_MO : LOP_MUC)}>
      {children}
    </NavLink>
  )
}

// Mục Giai đoạn 2: không phải <a href>, vì không có trang thật để dẫn tới — <span> + aria-disabled
// + title, không bao giờ điều hướng được (khác href="#" của mockup tĩnh).
function MucKhoa({ children }: { children: string }) {
  return (
    <span className={LOP_MUC_KHOA} aria-disabled="true" title="Giai đoạn 2">
      {children}
    </span>
  )
}

const MUC_QUAN_TRI = [
  { quyen: 'template.manage', nhan: 'Mẫu báo cáo' },
  { quyen: 'org.manage', nhan: 'Tổ chức' },
  { quyen: 'user.manage', nhan: 'Người dùng' },
] as const

export function Sidebar() {
  const permissions = useSession((s) => s.permissions)
  const user = useSession((s) => s.user)
  const orgUnit = useSession((s) => s.orgUnit)
  const logout = useSession((s) => s.logout)

  const co = (ma: string) => permissions.has(ma)

  // Một slot "báo cáo" duy nhất trong sidebar: report.approve THẮNG report.edit/submit/
  // view_own_unit. Bắt buộc phải có nhánh loại trừ này — vai admin_atcl thật (seed) nắm TOÀN BỘ
  // danh mục quyền, tức có report.approve LẪN report.view_own_unit cùng lúc; thiếu nhánh này sẽ
  // hiện cả "Duyệt báo cáo" lẫn "Báo cáo của đơn vị" một lúc, sai mọi mockup (chỉ "Duyệt báo cáo").
  const coDuyet = co('report.approve')
  const coBaoCaoDonVi = !coDuyet && (co('report.edit') || co('report.submit') || co('report.view_own_unit'))

  const mucQuanTriDuocPhep = MUC_QUAN_TRI.filter((m) => co(m.quyen))

  return (
    <aside className="w-[220px] shrink-0 bg-surface border-r border-hair py-5 px-4 flex flex-col gap-[18px]">
      <Wordmark />
      <nav>
        {co('dashboard.view') && <MucNav to="/dashboard">Dashboard</MucNav>}
        {coDuyet && <MucNav to="/reports">Duyệt báo cáo</MucNav>}
        {coBaoCaoDonVi && <MucNav to="/reports">Báo cáo của đơn vị</MucNav>}
        {co('status.view') && <MucNav to="/status">Tình trạng nộp</MucNav>}
        {mucQuanTriDuocPhep.length > 0 && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-sec pt-2.5 px-2.5 pb-1">
              Quản trị nền tảng
            </div>
            {mucQuanTriDuocPhep.map((m) => (
              <MucKhoa key={m.quyen}>{m.nhan}</MucKhoa>
            ))}
          </>
        )}
      </nav>
      {/* div, KHÔNG phải <footer>: "không màn nào có footer giải thích" (D18/D22) — đáy sidebar là
          thông tin phiên đăng nhập, không phải chú giải màn hình. */}
      <div className="mt-auto text-[12px] text-sec border-t border-hair pt-3">
        <div>
          {/* span riêng: getByText('x@ptsc.local') cần MỘT phần tử có textContent đúng khớp,
              không lẫn " · <đơn vị>" hay nút Đăng xuất phía dưới vào cùng khối văn bản. */}
          <span>{user?.email}</span>
          {orgUnit && <> · {orgUnit.name}</>}
        </div>
        <button
          type="button"
          onClick={logout}
          className="block mt-1 text-[13px] font-medium text-soot bg-transparent border-0 p-0 text-left cursor-pointer"
        >
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}
