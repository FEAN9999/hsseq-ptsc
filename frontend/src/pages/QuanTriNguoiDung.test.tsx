// frontend/src/pages/QuanTriNguoiDung.test.tsx
//
// Bảng này là BẢN ĐỒ PHÂN QUYỀN, nên ca ở đây canh đúng những chỗ mà một dòng đọc SAI sẽ dẫn tới
// một quyết định sai về quyền:
//   · Phạm vi của VAI (`user_role.scope_org_unit_id`) khác đơn vị ghi trên tài khoản
//     (`app_user.org_unit_id`) — hai cột CÓ THỂ lệch nhau (backend/app/api/deps.py). Trộn hai cột
//     là nói sai "người này duyệt được báo cáo của ai".
//   · Tài khoản bị khoá phải THẤY ĐƯỢC: đó là câu trả lời cho "vì sao tôi đăng nhập không được".
//   · "Chưa gán vai" ≠ "0 quyền hiển thị mờ": không vai nghĩa là mọi trang đều 403.
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { QuanTriNguoiDung } from './QuanTriNguoiDung'
import { useSession } from '../app/session'

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
})

const DS = [
  {
    id: 1,
    email: 'admin@ptsc.local',
    full_name: 'Admin Ban ATCL',
    position: 'Chuyên viên tổng hợp Ban ATCL',
    active: true,
    org_unit: { code: 'PTSC', name: 'Tổng công ty' },
    roles: [{ code: 'admin_atcl', name: 'Admin Ban ATCL', scope: null }],
    permission_count: 14,
  },
  {
    // Ca LỆCH CỘT: tài khoản ghi ở U01 nhưng vai reporter được cấp phạm vi U09. Cột Đơn vị phải
    // nói U01, huy hiệu vai phải nói U09 — trộn hai cột là ca này đỏ.
    id: 2,
    email: 'u01@ptsc.local',
    full_name: 'Người nhập U01',
    position: 'Đại diện SKATMT',
    active: true,
    org_unit: { code: 'U01', name: 'Đơn vị thành viên 01' },
    roles: [{ code: 'reporter', name: 'Người nhập', scope: { code: 'U09', name: 'Đơn vị thành viên 09' } }],
    permission_count: 4,
  },
  {
    id: 3,
    email: 'cu@ptsc.local',
    full_name: 'Người đã chuyển công tác',
    position: null,
    active: false,
    org_unit: { code: 'U02', name: 'Đơn vị thành viên 02' },
    roles: [],
    permission_count: 0,
  },
]

function moiApi(ds: unknown = DS, loi?: number) {
  const f = vi.fn(() =>
    Promise.resolve(
      loi
        ? {
            ok: false,
            status: loi,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ detail: 'Bạn không có quyền thực hiện thao tác này' }),
          }
        : {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ds,
          },
    ),
  )
  vi.stubGlobal('fetch', f)
  return f
}

function ve() {
  useSession.setState({
    token: 't',
    user: { id: 1, email: 'admin@ptsc.local', full_name: 'Admin', position: null },
    orgUnit: { id: 1, code: 'PTSC', name: 'PTSC' },
    permissions: new Set(['user.manage']),
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <QuanTriNguoiDung />
    </QueryClientProvider>,
  )
}

async function hang(email: string): Promise<HTMLElement> {
  return (await screen.findByText(email)).closest('tr')!
}

describe('QuanTriNguoiDung', () => {
  it('phụ đề đếm tài khoản, đếm vai KHÁC NHAU, và nói rõ màn này chỉ để xem', async () => {
    moiApi()
    ve()
    // 3 tài khoản, 2 mã vai khác nhau (admin_atcl, reporter — dòng thứ ba chưa gán vai nào),
    // 1 tài khoản đã khoá.
    const phuDe = await screen.findByText(/3 tài khoản/)
    expect(phuDe.textContent).toContain('2 vai')
    expect(phuDe.textContent).toContain('1 đã khoá')
    expect(phuDe.textContent).toContain('chỉ để xem')
  })

  it('cột Đơn vị nói đơn vị của TÀI KHOẢN, huy hiệu vai nói PHẠM VI của vai — không trộn', async () => {
    moiApi()
    ve()
    const dong = within(await hang('u01@ptsc.local'))
    expect(dong.getByText('U01')).toBeTruthy()
    expect(dong.getByText('U09')).toBeTruthy()
    // Và phạm vi phải nằm TRONG huy hiệu vai, không đứng lẻ ở một cột khác.
    expect(dong.getByText('Người nhập').textContent).toContain('U09')
  })

  it('vai phạm vi toàn TCT (scope null) KHÔNG in thêm mã đơn vị nào vào huy hiệu', async () => {
    moiApi()
    ve()
    const huyHieu = within(await hang('admin@ptsc.local')).getByText('Admin Ban ATCL', {
      selector: 'span.inline-flex',
    })
    expect(huyHieu.textContent).toBe('Admin Ban ATCL')
  })

  it('tài khoản đã khoá vẫn hiện, kèm nhãn "Đã khoá"', async () => {
    moiApi()
    ve()
    expect(within(await hang('cu@ptsc.local')).getByText('Đã khoá')).toBeTruthy()
  })

  it('không vai nào thì nói "Chưa gán vai", không để ô trống', async () => {
    moiApi()
    ve()
    expect(within(await hang('cu@ptsc.local')).getByText('Chưa gán vai')).toBeTruthy()
  })

  it('số quyền lấy từ API, không tự đếm lại từ danh sách vai', async () => {
    moiApi()
    ve()
    expect(within(await hang('admin@ptsc.local')).getByText('14')).toBeTruthy()
    expect(within(await hang('u01@ptsc.local')).getByText('4')).toBeTruthy()
  })

  it('403 hiện câu tiếng Việt thay vì bảng trống', async () => {
    moiApi(DS, 403)
    ve()
    expect(await screen.findByText('Bạn không có quyền quản trị mục này')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
