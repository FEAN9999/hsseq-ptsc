// frontend/src/components/AppShell.test.tsx
//
// C1 (task-18-carry.md) — brief gốc dựng session SAI hình dạng:
//   useSession.setState({ ..., user: { email, full_name, org_unit: { name } }, ... } as never)
// `org_unit` KHÔNG lồng trong `user`. Session thật (src/app/session.ts) giữ `orgUnit` là trường
// RIÊNG cấp cao nhất, khớp đúng `GET /auth/me` trả bốn khoá ngang hàng {user, roles, permissions,
// org_unit}. Dựng lại đúng hình dạng SessionUser/SessionOrgUnit thật bên dưới, và bỏ hẳn `as never`
// — cast đó dập tắt lỗi kiểu, đúng thứ carry cảnh báo là "che mất người duy nhất có thể báo sai".
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AppShell } from './AppShell'
import { resolveCascadeWinner, resolveDeclaredValue } from './ui/cascade'
import { useSession } from '../app/session'

beforeEach(() => useSession.getState().logout())

/** Từ Lát 5, Sidebar đọc `/dashboard/summary` để hiện hai huy hiệu đếm, nên nó CẦN một
 *  QueryClient. `retry: false` + không stub `fetch`: lượt gọi hỏng ngay, `tong.data` là `undefined`,
 *  không huy hiệu nào được vẽ — đúng nhánh "hỏng thì im lặng" mà Sidebar.tsx hứa, và không ca nào
 *  dưới đây phụ thuộc vào con số. */
function veQuery(cay: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{cay}</QueryClientProvider>)
}

function veVoiQuyen(perms: string[]) {
  useSession.setState({
    token: 't',
    user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
    orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
    permissions: new Set(perms),
  })
  return veQuery(
    <MemoryRouter>
      <AppShell>
        <div />
      </AppShell>
    </MemoryRouter>,
  )
}

describe('Sidebar theo quyền', () => {
  it('người nộp chỉ thấy Báo cáo của đơn vị', () => {
    veVoiQuyen(['report.edit', 'report.submit', 'report.view_own_unit'])
    expect(screen.getByText('Báo cáo của đơn vị')).toBeTruthy()
    expect(screen.queryByText('Tình trạng nộp')).toBeNull()
    expect(screen.queryByText('Dashboard')).toBeNull()
  })

  it('admin thấy Dashboard, Duyệt báo cáo, Tình trạng nộp', () => {
    veVoiQuyen(['dashboard.view', 'report.approve', 'status.view'])
    for (const m of ['Dashboard', 'Duyệt báo cáo', 'Tình trạng nộp'])
      expect(screen.getByText(m)).toBeTruthy()
  })

  // Lát 8 — ba mục quản trị hết khoá: trang đã xây, nên chúng phải là LIÊN KẾT THẬT. Trước Lát 8
  // chúng là `aria-disabled` kèm title "Giai đoạn 2"; ca này thay thế đúng ca đó, và khoá chiều
  // ngược lại (còn sót `aria-disabled` là một mục nhìn thì bấm được mà không đi đâu).
  it('ba mục quản trị là liên kết thật, mỗi mục gác đúng quyền RIÊNG của nó', () => {
    const doiTuong = [
      ['template.manage', 'Mẫu báo cáo', '/admin/templates'],
      ['org.manage', 'Tổ chức', '/admin/org'],
      ['user.manage', 'Người dùng', '/admin/users'],
    ] as const
    for (const [quyen, nhan, duong] of doiTuong) {
      veVoiQuyen(['dashboard.view', quyen])
      const muc = screen.getByText(nhan).closest('a')
      expect(muc?.getAttribute('href')).toBe(duong)
      expect(screen.getByText(nhan).closest('[aria-disabled="true"]')).toBeNull()
      // Chỉ quyền của CHÍNH nó mở mục đó ra — không có một cờ "là quản trị" gộp cả ba.
      for (const [, nhanKhac] of doiTuong.filter(([q]) => q !== quyen)) {
        expect(screen.queryByText(nhanKhac)).toBeNull()
      }
      cleanup()
    }
  })

  it('breadcrumb của ba màn quản trị nói đúng nhóm và đúng tên mục nav', () => {
    for (const [duong, nhan] of [
      ['/admin/templates', 'Mẫu báo cáo'],
      ['/admin/org', 'Tổ chức'],
      ['/admin/users', 'Người dùng'],
    ] as const) {
      useSession.setState({
        token: 't',
        user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
        orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
        permissions: new Set(['template.manage', 'org.manage', 'user.manage']),
      })
      const { container } = veQuery(
        <MemoryRouter initialEntries={[duong]}>
          <AppShell>
            <div />
          </AppShell>
        </MemoryRouter>,
      )
      const vet = container.querySelector('header')!.textContent
      expect(vet).toContain('Quản trị nền tảng')
      expect(vet).toContain(nhan)
      // Nhóm "Nghiệp vụ" là nhãn của MỌI trang khác — lọt lại đây nghĩa là nhánh mới không chạy.
      expect(vet).not.toContain('Nghiệp vụ')
      cleanup()
    }
  })

  // Lát 1: Đăng xuất chuyển vào menu của hàng người dùng (mockup ShadcnSidebar.dc.html vẽ
  // `chevrons-up-down` ở hàng này — đó là affordance của một menu, không phải nút phẳng). Nên
  // khẳng định đổi từ "có nút" thành "mở menu ra thì có mục" — vẫn là hai thao tác đo được.
  it('đáy sidebar có email, đơn vị, và Đăng xuất trong menu người dùng', () => {
    veVoiQuyen(['dashboard.view'])
    expect(screen.getByText('x@ptsc.local')).toBeTruthy()
    // Radix mở menu bằng `pointerdown`, không phải `click` — fireEvent.click một mình không mở.
    fireEvent.pointerDown(
      screen.getByRole('button', { name: /x@ptsc\.local/ }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeTruthy()
  })

  it('không màn nào có footer giải thích', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    expect(container.querySelector('footer')).toBeNull()
  })

  // Mọi test trên đều dùng bộ quyền TỔNG HỢP TAY, không khớp vai thật nào trong seed. Bốn test
  // dưới đây thêm ngoài brief — mỗi test vá một khoảng trống mà 5 test gốc không chạm tới, phát
  // hiện qua tự đột biến (bảng chi tiết trong task-18-report.md).

  it('admin_atcl thật (seed: TOÀN BỘ quyền, gồm cả report.view_all) → chỉ "Duyệt báo cáo", không lặp hai nhãn kia — F1', () => {
    // 5 test gốc không có ca nào cấp report.approve CÙNG LÚC với report.view_all/edit/submit/
    // view_own_unit — nhưng backend/app/seed/__init__.py cho vai admin_atcl NGUYÊN VẸN danh sách
    // PERMISSIONS, nên đây là ca THẬT, không phải suy diễn. Dùng ĐÚNG danh sách PERMISSIONS của
    // seed (không bịa bớt) — đúng yêu cầu task-18-fix-brief.md F1: "phiên admin (toàn bộ quyền,
    // kể cả report.view_all) → vẫn CHỈ thấy Duyệt báo cáo, không thấy hai nhãn kia".
    veVoiQuyen([
      'report.create', 'report.edit', 'report.submit', 'report.return', 'report.approve',
      'report.view_own_unit', 'report.view_all', 'dashboard.view', 'status.view',
      'template.manage', 'workflow.manage', 'org.manage', 'user.manage', 'audit.view',
    ])
    expect(screen.getByText('Duyệt báo cáo')).toBeTruthy()
    expect(screen.queryByText('Báo cáo của đơn vị')).toBeNull()
    expect(screen.queryByText('Báo cáo')).toBeNull()
  })

  it('viewer thật (seed: report.view_all + dashboard.view + status.view) thấy "Báo cáo" — F1, lỗ hổng thật đã vá', () => {
    // F1 (task-18-fix-brief.md): report.view_all trước đây không nằm nhánh nào của slot báo cáo —
    // viewer@ptsc.local đăng nhập chỉ thấy Dashboard + Tình trạng nộp, không có lối nào tới báo
    // cáo, dù quyền này cho xem toàn bộ thật (backend/app/api/deps.py:157). Dùng ĐÚNG bộ quyền
    // seed của vai viewer (backend/app/seed/__init__.py:71), không bịa bộ quyền cho vừa test.
    veVoiQuyen(['report.view_all', 'dashboard.view', 'status.view'])
    expect(screen.getByText('Báo cáo')).toBeTruthy()
    expect(screen.queryByText('Duyệt báo cáo')).toBeNull()
    expect(screen.queryByText('Báo cáo của đơn vị')).toBeNull()
  })

  it('mỗi mục Quản trị nền tảng gác đúng quyền RIÊNG của nó, không ăn theo quyền khác trong nhóm', () => {
    veVoiQuyen(['org.manage'])
    expect(screen.getByText('Tổ chức')).toBeTruthy()
    expect(screen.queryByText('Mẫu báo cáo')).toBeNull()
    expect(screen.queryByText('Người dùng')).toBeNull()
  })

  it('không có quyền Giai đoạn 2 nào thì ẩn hẳn nhóm "Quản trị nền tảng", không hiện tiêu đề nhóm trơ trọi', () => {
    veVoiQuyen(['dashboard.view'])
    expect(screen.queryByText('Quản trị nền tảng')).toBeNull()
  })

  it('đáy sidebar hiện đúng tên đơn vị từ orgUnit — không phải user.org_unit (khoá lại đúng điều carry C1 cảnh báo)', () => {
    // 5 test gốc chỉ kiểm email + nút Đăng xuất, không kiểm chữ đơn vị — một bản Sidebar lỡ đọc
    // (user as any)?.org_unit?.name (đúng lỗi hình dạng carry C1 mô tả) vẫn qua được cả 5 test đó.
    veVoiQuyen(['dashboard.view'])
    expect(screen.getByText(/PTSC M&C/)).toBeTruthy()
  })

  it('bấm Đăng xuất gọi logout() thật — xoá token, không chỉ có mặt nút', () => {
    // Test gốc chỉ khẳng định NÚT TỒN TẠI (getByRole), không khẳng định bấm vào có tác dụng — một
    // onClick rỗng vẫn qua được test đó. Khẳng định hệ quả thật (đúng bài học carry C3/Task 17 M3).
    veVoiQuyen(['dashboard.view'])
    fireEvent.pointerDown(
      screen.getByRole('button', { name: /x@ptsc\.local/ }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }))
    expect(useSession.getState().token).toBeNull()
  })
})

describe('Bố cục AppShell (đo bằng cascade CSS thật, không phải toContain — carry C3)', () => {
  // Lát 1: bề rộng không còn là utility trên chính phần tử mà là biến `--sidebar-width` của
  // `SidebarProvider` (shadcn), nên đo bằng cascade trên className là sai chỗ — đo thẳng biến.
  // 16rem = 256px, đúng số mockup ShadcnSidebar.dc.html khai ở khung ngoài cùng.
  it('thanh bên rộng đúng 16rem theo biến --sidebar-width', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    const wrapper = container.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement | null
    expect(wrapper).toBeTruthy()
    expect(wrapper!.style.getPropertyValue('--sidebar-width')).toBe('16rem')
  })

  it('nội dung full-bleed đệm 24px', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    // `SidebarInset` của shadcn ĐÃ là <main>, nên `querySelector('main')` bắt nhầm phần tử ngoài.
    // Đo đúng vùng nội dung qua móc `data-slot` mà AppShell đặt riêng cho việc này.
    const noiDung = container.querySelector('[data-slot="noi-dung"]')
    expect(noiDung).toBeTruthy()
    expect(resolveCascadeWinner(noiDung!.className, 'padding')).toBe('p-6')
  })

  // N2 (final-rereview-report.md): nửa `AppShell` của bản vá P3 KHÔNG có một người canh nào — xoá
  // `pb-[calc(1.5rem+var(--toast-cao))]` khỏi AppShell.tsx thì 803/803 vẫn xanh. Ca e2e hình học
  // của P3 canh nửa `FormModeBar`, không canh nửa này, mà chính comment tại chỗ tuyên bố ĐÂY mới
  // là tầng mang luật chung ("luật ... phải đặt ở tầng khung, không phải từng thanh"). Lỗi nó chặn
  // — Toast che nút suốt 4 giây — là lỗi CHẠM TỚI ĐƯỢC trong demo, vừa sửa xong; để hở nghĩa là nó
  // quay lại lặng lẽ trong một lượt dọn Tailwind mà không dòng nào đỏ.
  //
  // Hỏi `padding-bottom` (không phải `padding`) là hỏi ĐÚNG utility này: `p-6` sinh ra shorthand
  // `padding:`, mà resolver CỐ Ý không hiểu shorthand (giới hạn P5 ghi ngay trong cascade.ts). Nên
  // khi lớp đệm-đáy dạng calc() ở khẳng định ngay dưới đây biến mất, không lớp nào còn khai báo
  // `padding-bottom` ⇒ resolver trả `null` ⇒ ca này đỏ.
  it('đáy vùng nội dung chừa sẵn dải Toast (nửa AppShell của P3) — N2', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    const noiDung = container.querySelector('[data-slot="noi-dung"]')
    expect(noiDung).toBeTruthy()
    expect(resolveCascadeWinner(noiDung!.className, 'padding-bottom')).toBe(
      'pb-[calc(1.5rem+var(--toast-cao))]',
    )
    // Khoá luôn GIÁ TRỊ, không chỉ tên lớp: đệm đáy phải là 24px CỘNG chiều cao dải Toast. Một
    // mutant hợp lý vẫn giữ tiền tố `pb-` nhưng bớt đi phần `1.5rem +` trong ngoặc — tên lớp "có vẻ
    // đúng" nhưng mất 24px đệm gốc; chỉ so giá trị mới bắt được. (`FormModeBar.tsx` lùi lên bằng
    // tiền tố khác hẳn — `bottom-[var(--toast-cao)]` — không phải `pb-`.)
    expect(resolveDeclaredValue(noiDung!.className, 'padding-bottom')).toBe(
      'calc(1.5rem + var(--toast-cao))',
    )
  })
})

// F2 (task-18-fix-brief.md): nhánh isActive của NavLink chưa từng chạy trong test — veVoiQuyen()
// bọc <MemoryRouter> trần không <Routes>, nên mọi mục luôn nhận className "không đang mở". Ở đây
// dựng router thật với <Routes> + initialEntries để CÓ một địa chỉ đang mở, rồi đo bằng
// resolveCascadeWinner (không phải toContain — carry C3): mục đang mở phải THẮNG cascade nền
// bg-muted, mục khác thì không thắng nền nào cả (LOP_MUC không có utility nền nào để thắng).
describe('Trạng thái mục đang mở (NavLink isActive) — F2', () => {
  it('đang ở /status: mục "Tình trạng nộp" mang data-active, "Dashboard" thì không', () => {
    useSession.setState({
      token: 't',
      user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
      orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
      permissions: new Set(['dashboard.view', 'status.view']),
    })
    const { container } = veQuery(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <AppShell>
                <div />
              </AppShell>
            }
          />
          <Route
            path="/status"
            element={
              <AppShell>
                <div />
              </AppShell>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    // Khoanh trong SIDEBAR: từ Lát 1, breadcrumb ở thanh đầu trang cũng hiện đúng chữ
    // "Tình trạng nộp", nên `screen.getByText` bắt được hai phần tử.
    const sb = within(container.querySelector('[data-slot="sidebar"]') as HTMLElement)
    const dangMo = sb.getByRole('link', { name: 'Tình trạng nộp' })
    const khongDangMo = sb.getByRole('link', { name: 'Dashboard' })
    // Trạng thái đang mở nay do `data-active` của SidebarMenuButton mang, và CSS nền gắn vào
    // biến thể `data-[active=true]:` — đo thẳng vào cơ chế thật thay vì đoán tên lớp thắng cascade.
    expect(dangMo.getAttribute('data-active')).toBe('true')
    expect(khongDangMo.getAttribute('data-active')).not.toBe('true')
  })
})

// ============================================================ huy hiệu đếm trên sidebar (Lát 5)
//
// Hai con số lấy từ MỘT lượt `/dashboard/summary` của kỳ đang xem. Chúng là thứ duy nhất trong
// khung ứng dụng phụ thuộc dữ liệu, nên mỗi khẳng định dưới đây khoá một quyết định đã cân nhắc,
// không phải "có hiện số không".
describe('Huy hiệu đếm trên sidebar — Lát 5', () => {
  const TONG = {
    period_key: '2026-08',
    reporting_units: 22,
    approved_count: 18,
    submitted_count: 3,
    missing_units: [{ code: 'U22', name: 'PTSC Đình Vũ' }],
    kpis: [],
  }

  /** Trả về chính mock `fetch` để ca kiểm ĐƯỢC hay KHÔNG có lượt gọi nào bay lên. */
  function ve(perms: string[], than: unknown = TONG) {
    const f = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => than }))
    vi.stubGlobal('fetch', f)
    useSession.setState({
      token: 't',
      user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
      orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
      permissions: new Set(perms),
    })
    const r = veQuery(
      <MemoryRouter initialEntries={['/dashboard?period=2026-08']}>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    )
    return { ...r, f }
  }

  /** Huy hiệu đi KÈM một mục — đọc trong chính `<li>` của mục đó, không phải "có số đâu đó". */
  function huyHieu(nhan: string): string | null {
    const muc = screen.getByRole('link', { name: new RegExp(nhan) }).closest('li')!
    return within(muc).queryByText(/^[0-9]+(\/[0-9]+)?$/)?.textContent ?? null
  }

  it('người duyệt: "Duyệt báo cáo" mang số CHỜ DUYỆT, "Tình trạng nộp" mang đã-nộp/tổng', async () => {
    ve(['dashboard.view', 'report.approve', 'status.view'])
    // 22 đầu mối − 1 chưa nộp = 21 đã nộp. Ba con số của thân trả về PHÂN BIỆT nhau (18/3/22) nên
    // một lần gán nhầm trường là lộ ngay.
    expect(await screen.findByText('21/22')).toBeTruthy()
    expect(huyHieu('Duyệt báo cáo')).toBe('3')
    expect(huyHieu('Tình trạng nộp')).toBe('21/22')
  })

  it('vai CHỈ XEM (report.view_all, không duyệt được): mục báo cáo KHÔNG mang số chờ duyệt', async () => {
    ve(['dashboard.view', 'report.view_all', 'status.view'])
    // Đợi lượt gọi xong rồi mới khẳng định vắng mặt — nếu không, ca xanh chỉ vì dữ liệu chưa về.
    expect(await screen.findByText('21/22')).toBeTruthy()
    expect(huyHieu('Báo cáo')).toBeNull()
  })

  it('không có dashboard.view: KHÔNG bắn lượt gọi nào, và không huy hiệu nào', async () => {
    const { f } = ve(['report.edit', 'report.submit', 'report.view_own_unit'])
    await Promise.resolve()
    expect(f).not.toHaveBeenCalled()
    expect(huyHieu('Báo cáo của đơn vị')).toBeNull()
  })

  it('thân trả về MÉO: không sập khung, không vẽ huy hiệu nào', async () => {
    ve(['dashboard.view', 'report.approve', 'status.view'], { status: 'ok' })
    // Khung vẫn dựng — đây mới là điều đáng giá: Sidebar nằm trong MỌI trang, một cú ném ở đây là
    // màn trắng toàn app.
    expect(await screen.findByText('Ban An toàn Chất lượng')).toBeTruthy()
    expect(huyHieu('Duyệt báo cáo')).toBeNull()
    expect(huyHieu('Tình trạng nộp')).toBeNull()
  })

  it('không có ai chờ duyệt (0): KHÔNG vẽ huy hiệu rỗng cạnh "Duyệt báo cáo"', async () => {
    ve(['dashboard.view', 'report.approve', 'status.view'], { ...TONG, submitted_count: 0 })
    expect(await screen.findByText('21/22')).toBeTruthy()
    // Số 0 ở đây là "không có việc gì phải làm" — một huy hiệu hổ phách ghi "0" là báo động giả.
    expect(huyHieu('Duyệt báo cáo')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------
// Lát 6 — VỆT BREADCRUMB CỦA `/reports` PHẢI ĐI THEO QUYỀN.
//
// Trước Lát 6 nó ghi cứng "Duyệt báo cáo". Một người chỉ có quyền nộp mở `/reports` thấy mục nav
// bên trái ghi "Báo cáo của đơn vị" còn vệt ngay trên đầu ghi "Duyệt báo cáo" — hai cái tên cho
// cùng một trang, và cái sai lại hứa một quyền họ không có.
//
// Đo trên CÂY THẬT của AppShell (không gọi thẳng hàm không export), và khoanh trong `<header>` để
// không bắt nhầm chính mục nav cùng chữ trong Sidebar.
// ---------------------------------------------------------------------------------------------
describe('Breadcrumb của /reports đi theo quyền — Lát 6', () => {
  function veTaiReports(perms: string[]) {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })))
    useSession.setState({
      token: 't',
      user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
      orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
      permissions: new Set(perms),
    })
    const { container } = veQuery(
      <MemoryRouter initialEntries={['/reports']}>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    )
    return container.querySelector('header')!
  }

  it.each([
    ['report.approve', 'Duyệt báo cáo'],
    ['report.view_all', 'Báo cáo'],
    ['report.view_own_unit', 'Báo cáo của đơn vị'],
  ])('quyền %s ⇒ vệt ghi "%s"', (quyen, nhan) => {
    const header = veTaiReports([quyen])
    expect(within(header).getByText(nhan)).toBeTruthy()
  })

  // Mặt ÂM: chỉ "có chữ đúng" là chưa đủ — lỗi cũ là chữ SAI cùng có mặt. Người nộp không được
  // thấy chữ "Duyệt báo cáo" ở BẤT KỲ đâu trên khung, kể cả mục nav.
  it('người chỉ nộp KHÔNG thấy chữ "Duyệt báo cáo" ở bất kỳ đâu trên khung', () => {
    veTaiReports(['report.view_own_unit'])
    expect(screen.queryByText('Duyệt báo cáo')).toBeNull()
  })
})

// ---- Bộ chọn kỳ trên sidebar ----
//
// Từ Lát 1 kỳ báo cáo là bối cảnh TOÀN APP, và từ bản dọn sau Lát 8 thì bộ chọn trên sidebar là bộ
// chọn DUY NHẤT — Dashboard không còn `PeriodNav` trên đầu trang nữa. Ba ca "cửa 1" của P2
// (Ruling 424) theo bộ chọn về đây: chúng đo BIÊN của dải kỳ, và biên nằm ở đâu thì ca nằm ở đó.
//
// Vì sao biên vẫn cần dù Dashboard đã có màn "kỳ chưa có trong hệ thống": màn đó là lưới đỡ SAU
// khi người dùng đã rơi. Nút khoá là không cho rơi. Và sidebar còn đứng trên `/status`, nơi kỳ
// ngoài dải chỉ lặng lẽ không tô cột nào.

const DAI_KY = ['2026-06', '2026-07', '2026-08', '2026-09'].map((period_key) => ({ period_key }))

function moiApiKy(dsKy: unknown = DAI_KY, hongDaiKy = false) {
  const f = vi.fn((url: string) => {
    if (String(url).includes('/periods')) {
      return hongDaiKy
        ? Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
        : Promise.resolve({ ok: true, status: 200, json: async () => dsKy })
    }
    // Huy hiệu đếm của sidebar (Lát 5) — không ca nào dưới đây phụ thuộc con số, cho hỏng luôn.
    return Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'x' }) })
  })
  vi.stubGlobal('fetch', f)
  return f
}

function ViTri() {
  const { search } = useLocation()
  return <div data-testid="vi-tri">{search}</div>
}

function LuiLai() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Lùi
    </button>
  )
}

function veChonKy(duong = '/dashboard') {
  useSession.setState({
    token: 't',
    user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
    orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
    permissions: new Set(['dashboard.view']),
  })
  return veQuery(
    <MemoryRouter initialEntries={[duong]}>
      <LuiLai />
      <ViTri />
      <AppShell>
        <div />
      </AppShell>
    </MemoryRouter>,
  )
}

const nutTruoc = () => screen.getByRole('button', { name: 'Kỳ trước' })
const nutSau = () => screen.getByRole('button', { name: 'Kỳ sau' })
const viTri = () => screen.getByTestId('vi-tri').textContent

describe('Bộ chọn kỳ trên sidebar', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('ô kỳ hiện ĐÚNG kỳ đang xem, không phải kỳ liền trước', async () => {
    moiApiKy()
    veChonKy('/dashboard?period=2026-07')
    expect(await screen.findByText('07/2026')).toBeTruthy()
  })

  it('không có ?period= thì hiện kỳ mặc định, không hiện chuỗi hỏng', () => {
    moiApiKy()
    veChonKy()
    expect(screen.getByText('08/2026')).toBeTruthy()
  })

  // congThang dùng Date.UTC nên tự tràn năm đúng (JS chuẩn hoá tháng âm/>11) — không test qua ranh
  // giới năm thì mutation "lấy `nam` gốc thay vì d.getUTCFullYear()" (đúng với MỌI kỳ giữa năm)
  // sống sót, chỉ lộ sai ở kỳ đầu/cuối năm. Dải riêng để 2026-01 không đụng chuyện biên.
  it('congThang qua ranh giới năm: ở 01/2026 bấm ‹ ra đúng 12/2025', async () => {
    moiApiKy(['2025-11', '2025-12', '2026-01', '2026-02'].map((period_key) => ({ period_key })))
    veChonKy('/dashboard?period=2026-01')
    await screen.findByText('01/2026')
    fireEvent.click(nutTruoc())
    expect(viTri()).toBe('?period=2025-12')
  })

  // B12 (N16): đổi kỳ phải dùng {replace:true} — nếu không, bấm đổi kỳ rồi bấm Back một lần sẽ
  // quay lại kỳ TRƯỚC đó thay vì không đi đâu cả (mỗi lần đổi kỳ chỉ THAY chỗ đứng hiện tại,
  // không đẩy thêm một mục lịch sử mới).
  it('đổi kỳ dùng {replace:true}: Back một lần sau khi đổi 1 lần KHÔNG quay lại kỳ cũ', async () => {
    moiApiKy()
    veChonKy('/dashboard?period=2026-07')
    await screen.findByText('07/2026')
    fireEvent.click(nutSau())
    expect(viTri()).toBe('?period=2026-08')
    fireEvent.click(screen.getByRole('button', { name: 'Lùi' }))
    expect(viTri()).toBe('?period=2026-08')
  })

  // Cửa 1 của P2, kịch bản demo nguyên văn: người trình bày đang ở kỳ CUỐI dải bấm `›` đúng một
  // lần. Trước bản vá, màn hình nhảy sang một kỳ không có thật và hiện "0 đã duyệt / 22 chưa nộp"
  // — không phân biệt được với mất sạch dữ liệu.
  it('cửa 1 — ở kỳ CUỐI dải thì nút › bị khoá, bấm KHÔNG đẩy sang kỳ không có thật', async () => {
    moiApiKy()
    veChonKy('/dashboard?period=2026-09')
    // `waitFor` chứ không `findByText`: ô kỳ hiện NGAY từ URL, còn cái khoá chỉ có sau khi dải kỳ
    // về. Đo sớm một nhịp thì ca này xanh cả khi biên không được cài bao giờ.
    await waitFor(() => expect(nutSau().hasAttribute('disabled')).toBe(true))
    fireEvent.click(nutSau())
    // Khoá bằng CẢ HAI mặt: URL không đổi, VÀ ô kỳ vẫn là 09/2026. Chỉ đo một mặt thì một nút
    // render ra rồi bị chặn ở tầng khác vẫn qua được.
    expect(viTri()).toBe('?period=2026-09')
    expect(screen.getByText('09/2026')).toBeTruthy()
  })

  // Nửa ÂM của cùng vị ngữ (bài học K2 — lỗi trốn ở mặt âm): khoá biên mà khoá quá tay thì nút `›`
  // chết ở GIỮA dải, và đó là đường đi bình thường của buổi demo. Không có ca này thì
  // `disabled={true}` cứng cũng xanh.
  it('cửa 1 (mặt âm) — ở GIỮA dải thì CẢ HAI nút còn bấm được', async () => {
    moiApiKy()
    // Vào từ kỳ CUỐI và đợi cái khoá hiện ra trước, rồi mới lùi vào giữa dải: bước đó chứng minh
    // dải kỳ ĐÃ về. Đo thẳng ở giữa dải thì "chưa khoá vì chưa biết dải" và "không khoá vì đang ở
    // giữa dải" nhìn giống hệt nhau, và ca thành xanh giả.
    veChonKy('/dashboard?period=2026-09')
    await waitFor(() => expect(nutSau().hasAttribute('disabled')).toBe(true))
    fireEvent.click(nutTruoc())
    expect(screen.getByText('08/2026')).toBeTruthy()
    expect(nutTruoc().hasAttribute('disabled')).toBe(false)
    expect(nutSau().hasAttribute('disabled')).toBe(false)
  })

  it('cửa 1 — ở kỳ ĐẦU dải thì nút ‹ bị khoá', async () => {
    moiApiKy()
    veChonKy('/dashboard?period=2026-06')
    await waitFor(() => expect(nutTruoc().hasAttribute('disabled')).toBe(true))
  })

  // Lưới an toàn của chính bản vá: /templates/FM01/periods là một lượt gọi mạng NỮA, và Render
  // free ngủ dậy trả 502. Nguồn chân lý hỏng KHÔNG được khoá đường đi bình thường — khoá "phòng
  // xa" lúc chưa biết dải chính là chặn đường đi đúng.
  it('dải kỳ tải HỎNG thì KHÔNG khoá nút nào — đường đi bình thường còn nguyên', async () => {
    moiApiKy(DAI_KY, true)
    veChonKy('/dashboard?period=2026-09')
    await screen.findByText('09/2026')
    // Đo bằng một việc LÀM ĐƯỢC, không bằng một thuộc tính vắng mặt: ở kỳ cuối dải (nơi biên SẼ
    // khoá nếu dải về bình thường) mà dải hỏng thì cú bấm vẫn phải đi tới nơi.
    fireEvent.click(nutSau())
    await waitFor(() => expect(viTri()).toBe('?period=2026-10'))
  })

  // Bộ chọn kỳ chỉ vẽ cho người có `dashboard.view` hoặc `status.view` — người nộp không có kỳ nào
  // để chọn, nên cũng KHÔNG được hỏi dải kỳ.
  it('người nộp không thấy bộ chọn kỳ và KHÔNG gọi /periods', () => {
    const f = moiApiKy()
    useSession.setState({
      token: 't',
      user: { id: 1, email: 'u01@ptsc.local', full_name: 'U', position: null },
      orgUnit: { id: 1, code: 'U01', name: 'Đơn vị U01' },
      permissions: new Set(['report.view_own_unit']),
    })
    veQuery(
      <MemoryRouter initialEntries={['/reports']}>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Kỳ sau' })).toBeNull()
    expect(f.mock.calls.map(([u]) => String(u)).some((u) => u.includes('/periods'))).toBe(false)
  })
})
