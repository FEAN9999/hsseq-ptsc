// frontend/src/pages/QuanTriToChuc.test.tsx
//
// Màn chỉ đọc, nên bộ ca này canh đúng hai thứ dễ sai NHẤT ở một cây:
//   1. ĐẾM phải đi hết cây, không chỉ đếm mảng gốc. Dữ liệu seed hôm nay PHẲNG (35 nút gốc, không
//      nút nào có `parent_id`), nên `ds.length` và một phép duyệt đệ quy cho ra CÙNG một số —
//      `35 đơn vị` xanh với cả hai. Ca dưới dựng một cây CÓ CON để hai phép đó tách nhau ra.
//   2. Câu "sơ đồ đang phẳng" chỉ được nói khi nó ĐÚNG. Nó là một khẳng định về dữ liệu, không
//      phải một dòng trang trí — in nó lên một cây có phân cấp là nói sai.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { QuanTriToChuc } from './QuanTriToChuc'
import { useSession } from '../app/session'

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
})

interface NutGia {
  id: number
  code: string
  name: string
  type?: string
  is_reporting?: boolean
  children?: NutGia[]
}

function day(n: NutGia): unknown {
  return {
    id: n.id,
    code: n.code,
    name: n.name,
    type: n.type ?? 'member_unit',
    is_reporting: n.is_reporting ?? false,
    children: (n.children ?? []).map(day),
  }
}

const PHANG: NutGia[] = [
  { id: 1, code: 'PTSC', name: 'Tổng công ty', type: 'corp' },
  { id: 2, code: 'U01', name: 'Đơn vị thành viên 01', is_reporting: true },
  { id: 3, code: 'U02', name: 'Đơn vị thành viên 02', is_reporting: true },
]

const CO_CAY: NutGia[] = [
  {
    id: 1,
    code: 'PTSC',
    name: 'Tổng công ty',
    type: 'corp',
    children: [
      { id: 2, code: 'BAN01', name: 'Ban 01', type: 'dept' },
      { id: 3, code: 'U01', name: 'Đơn vị thành viên 01', is_reporting: true },
    ],
  },
]

function moiApi(cay: NutGia[], loi?: number) {
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
            json: async () => cay.map(day),
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
    permissions: new Set(['org.manage']),
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <QuanTriToChuc />
    </QueryClientProvider>,
  )
}

describe('QuanTriToChuc', () => {
  it('đếm ĐI HẾT CÂY, không dừng ở mảng gốc', async () => {
    moiApi(CO_CAY)
    ve()
    // Mảng gốc có 1 phần tử; cả cây có 3 nút và 1 đầu mối. Một phép đếm `ds.length` sẽ ra "1 đơn vị".
    expect(await screen.findByText('3 đơn vị · 1 đầu mối báo cáo')).toBeTruthy()
  })

  it('vẽ đủ mọi nút con, không chỉ nút gốc', async () => {
    moiApi(CO_CAY)
    ve()
    for (const ma of ['PTSC', 'BAN01', 'U01']) expect(await screen.findByText(ma)).toBeTruthy()
    expect(screen.getByText('Ban 01')).toBeTruthy()
  })

  it('cây PHẲNG: nói ra là đang phẳng', async () => {
    moiApi(PHANG)
    ve()
    expect(await screen.findByText(/sơ đồ đang phẳng/)).toBeTruthy()
    expect(screen.getByText('3 đơn vị · 2 đầu mối báo cáo')).toBeTruthy()
  })

  it('cây CÓ phân cấp: KHÔNG nói câu "đang phẳng"', async () => {
    moiApi(CO_CAY)
    ve()
    await screen.findByText('BAN01')
    expect(screen.queryByText(/sơ đồ đang phẳng/)).toBeNull()
  })

  it('chỉ đơn vị is_reporting mới mang chip "Đầu mối"', async () => {
    moiApi(PHANG)
    ve()
    // U01 và U02 là đầu mối; PTSC (corp) thì không.
    expect(await screen.findAllByText('Đầu mối')).toHaveLength(2)
    expect(screen.getByText('PTSC').closest('div')!.textContent).not.toContain('Đầu mối')
  })

  it('403 hiện câu tiếng Việt thay vì khung trống', async () => {
    moiApi(PHANG, 403)
    ve()
    expect(await screen.findByText('Bạn không có quyền quản trị mục này')).toBeTruthy()
  })
})
