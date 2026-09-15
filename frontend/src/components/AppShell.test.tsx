// frontend/src/components/AppShell.test.tsx
//
// C1 (task-18-carry.md) — brief gốc dựng session SAI hình dạng:
//   useSession.setState({ ..., user: { email, full_name, org_unit: { name } }, ... } as never)
// `org_unit` KHÔNG lồng trong `user`. Session thật (src/app/session.ts) giữ `orgUnit` là trường
// RIÊNG cấp cao nhất, khớp đúng `GET /auth/me` trả bốn khoá ngang hàng {user, roles, permissions,
// org_unit}. Dựng lại đúng hình dạng SessionUser/SessionOrgUnit thật bên dưới, và bỏ hẳn `as never`
// — cast đó dập tắt lỗi kiểu, đúng thứ carry cảnh báo là "che mất người duy nhất có thể báo sai".
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from './AppShell'
import { resolveCascadeWinner, resolveDeclaredValue } from './ui/cascade'
import { useSession } from '../app/session'

beforeEach(() => useSession.getState().logout())

function veVoiQuyen(perms: string[]) {
  useSession.setState({
    token: 't',
    user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
    orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
    permissions: new Set(perms),
  })
  return render(
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

  it('nhóm Quản trị nền tảng mờ và có tooltip Giai đoạn 2', () => {
    veVoiQuyen(['dashboard.view', 'template.manage'])
    const m = screen.getByText('Mẫu báo cáo')
    expect(m.closest('[aria-disabled="true"]')).toBeTruthy()
    expect(m.closest('[title]')?.getAttribute('title')).toBe('Giai đoạn 2')
  })

  it('đáy sidebar có email, đơn vị và Đăng xuất một click', () => {
    veVoiQuyen(['dashboard.view'])
    expect(screen.getByText('x@ptsc.local')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(useSession.getState().token).toBeNull()
  })
})

describe('Bố cục AppShell (đo bằng cascade CSS thật, không phải toContain — carry C3)', () => {
  it('thanh bên rộng đúng 220px', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    const aside = container.querySelector('aside')
    expect(aside).toBeTruthy()
    expect(resolveCascadeWinner(aside!.className, 'width')).toBe('w-[220px]')
  })

  it('nội dung full-bleed đệm 24px', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    const main = container.querySelector('main')
    expect(main).toBeTruthy()
    expect(resolveCascadeWinner(main!.className, 'padding')).toBe('p-6')
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
  // khi `pb-[calc(...)]` biến mất, không lớp nào còn khai báo `padding-bottom` ⇒ resolver trả
  // `null` ⇒ ca này đỏ.
  it('đáy vùng nội dung chừa sẵn dải Toast (nửa AppShell của P3) — N2', () => {
    const { container } = veVoiQuyen(['dashboard.view'])
    const main = container.querySelector('main')
    expect(main).toBeTruthy()
    expect(resolveCascadeWinner(main!.className, 'padding-bottom')).toBe(
      'pb-[calc(1.5rem+var(--toast-cao))]',
    )
    // Khoá luôn GIÁ TRỊ, không chỉ tên lớp: đệm đáy phải là 24px CỘNG chiều cao dải Toast. Đổi
    // thành `pb-[var(--toast-cao)]` (lớp này CÓ THẬT trong CSS đã build, FormModeBar đang dùng)
    // vẫn giữ tên lớp "có vẻ đúng" nhưng làm mất 24px đệm gốc — chỉ so giá trị mới bắt được.
    expect(resolveDeclaredValue(main!.className, 'padding-bottom')).toBe(
      'calc(1.5rem + var(--toast-cao))',
    )
  })
})

// F2 (task-18-fix-brief.md): nhánh isActive của NavLink chưa từng chạy trong test — veVoiQuyen()
// bọc <MemoryRouter> trần không <Routes>, nên mọi mục luôn nhận className "không đang mở". Ở đây
// dựng router thật với <Routes> + initialEntries để CÓ một địa chỉ đang mở, rồi đo bằng
// resolveCascadeWinner (không phải toContain — carry C3): mục đang mở phải THẮNG cascade nền
// bg-mutedbg, mục khác thì không thắng nền nào cả (LOP_MUC không có utility nền nào để thắng).
describe('Trạng thái mục đang mở (NavLink isActive) — F2', () => {
  it('đang ở /status: "Tình trạng nộp" thắng cascade nền bg-mutedbg, "Dashboard" thì không', () => {
    useSession.setState({
      token: 't',
      user: { id: 1, email: 'x@ptsc.local', full_name: 'X', position: null },
      orgUnit: { id: 1, code: 'MC', name: 'PTSC M&C' },
      permissions: new Set(['dashboard.view', 'status.view']),
    })
    render(
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

    const dangMo = screen.getByText('Tình trạng nộp')
    const khongDangMo = screen.getByText('Dashboard')
    expect(resolveCascadeWinner(dangMo.className, 'background-color')).toBe('bg-mutedbg')
    expect(resolveCascadeWinner(khongDangMo.className, 'background-color')).toBeNull()
  })
})
