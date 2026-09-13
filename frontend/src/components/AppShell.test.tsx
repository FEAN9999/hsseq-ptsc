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
import { MemoryRouter } from 'react-router-dom'

import { AppShell } from './AppShell'
import { resolveCascadeWinner } from './ui/cascade'
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

  it('admin_atcl thật (seed: TOÀN BỘ quyền, gồm cả report.approve LẪN report.view_own_unit) → chỉ "Duyệt báo cáo", không lặp "Báo cáo của đơn vị"', () => {
    // 5 test gốc không có ca nào cấp report.approve CÙNG LÚC với report.edit/submit/
    // view_own_unit — nhưng backend/app/seed/__init__.py cho vai admin_atcl NGUYÊN VẸN danh sách
    // PERMISSIONS (gồm cả report.view_own_unit), nên đây là ca THẬT, không phải suy diễn.
    veVoiQuyen(['report.approve', 'report.edit', 'report.submit', 'report.view_own_unit'])
    expect(screen.getByText('Duyệt báo cáo')).toBeTruthy()
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
})
