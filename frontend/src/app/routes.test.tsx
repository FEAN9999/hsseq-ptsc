// frontend/src/app/routes.test.tsx
//
// C7 (task-19-carry.md): kiểm bảng route THẬT — dùng lại đúng `routeObjects`/`App` mà production
// dùng (qua `createMemoryRouter` để điều khiển URL ban đầu), không tự dựng một cây <Routes> song
// song rồi so khớp với chính nó. Không kiểm /status (chưa xây; /dashboard đã xây — Task 25). Bất
// biến "mọi href Sidebar dẫn tới trang thật" thuộc Task 26 (đã ghi ledger trong carry), không lặp
// một bản yếu ở đây.
//
// task-20-carry.md C5: Task 20 là task đầu tiên khai route bọc RequireAuth THẬT (/reports) — Task
// 19 chưa đo được ca "bỏ RequireAuth khỏi một route cần phiên" vì lúc đó chưa có route nào để bỏ
// (Ruling 177). Hai ca /reports dưới đây khoá đúng: chưa đăng nhập bị đá về /login (bỏ
// RequireAuth ở routes.tsx phải làm ca này ĐỎ), có đăng nhập thấy đúng khung AppShell quanh trang.
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter } from 'react-router-dom'

import { App, routeObjects } from './routes'
import { useToast } from '../components/ui/Toast'
import { useSession } from './session'

// Login.tsx tự gọi fetch('/health') lúc mount (carry C2) — stub để mọi lần dựng /login trong file
// này thấy fetch trả lời ngay, không đợi thật chuỗi thử lại 5s×2 của brief Task 19.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }))
  useSession.getState().logout()
})

function duong(initialPath: string) {
  const router = createMemoryRouter(routeObjects, { initialEntries: [initialPath] })
  return render(<App router={router} />)
}

describe('bảng route', () => {
  it('vào /login khi CHƯA có token: thấy form đăng nhập, không bị đá đi đâu khác', () => {
    duong('/login')
    expect(screen.getByText('Đăng nhập HSEQ')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('vào /: đổi sang /login', () => {
    duong('/')
    expect(screen.getByText('Đăng nhập HSEQ')).toBeTruthy()
  })

  it('vào một path bịa: thấy NotFound', () => {
    duong('/khong-co-that')
    expect(screen.getByText('Không tìm thấy trang')).toBeTruthy()
  })

  it('vào /reports khi CHƯA có token: bị đá về /login, KHÔNG thấy nội dung báo cáo (C5)', () => {
    duong('/reports')
    expect(screen.getByText('Đăng nhập HSEQ')).toBeTruthy()
    expect(screen.queryByText('Chưa có kỳ báo cáo nào đang mở')).toBeNull()
  })

  it('có token, quyền reporter: vào /reports thấy đúng khung AppShell (Sidebar) quanh trang', async () => {
    useSession
      .getState()
      .login(
        'tok-1',
        { id: 1, email: 'u01@ptsc.local', full_name: 'Người nhập U01', position: null },
        { id: 2, code: 'U01', name: 'Đơn vị thành viên 01 (tên tạm)' },
        ['report.view_own_unit'],
      )
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/reports')) return Promise.resolve({ ok: true, status: 200, json: async () => [] })
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
      }),
    )
    duong('/reports')
    expect(await screen.findByText('Chưa có kỳ báo cáo nào đang mở')).toBeTruthy()
    expect(screen.getByText('Đăng xuất')).toBeTruthy()
  })

  // Vòng sửa 1 Task 25 (task-25-fix-1.md A1, review N26 — mục 1 CẦN SỬA "NẶNG", vi phạm Ruling
  // 177): route MỚI phải có ca riêng khoá RequireAuth, đúng khuôn Task 20 (C5)/Task 22 (C6) ở
  // trên. Trước bản vá này, gỡ hẳn <RequireAuth> khỏi route /dashboard vẫn để `npx vitest run`
  // 618/618 xanh — không ca nào trong repo phát hiện được. "Dashboard SKATMT" là <h1> riêng của
  // trang, vẽ NGAY LẬP TỨC (không đợi API) ở CẢ BA nhánh tải/lỗi/có dữ liệu của Dashboard.tsx, nên
  // đủ để khẳng định "trang có mở hay không" mà không cần dựng fetch riêng cho /dashboard/*.
  it('vào /dashboard khi CHƯA có token: bị đá về /login, KHÔNG lộ số liệu 22 đơn vị (N26)', () => {
    duong('/dashboard')
    expect(screen.getByText('Đăng nhập HSEQ')).toBeTruthy()
    expect(screen.queryByText('Dashboard SKATMT')).toBeNull()
  })

  it('có token, quyền dashboard.view: vào /dashboard thấy đúng khung AppShell (Sidebar) quanh trang', async () => {
    useSession
      .getState()
      .login(
        'tok-1',
        { id: 1, email: 'admin@ptsc.local', full_name: 'Quản trị Ban ATCL', position: null },
        { id: 1, code: 'HO', name: 'Ban ATCL' },
        ['dashboard.view'],
      )
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/dashboard/summary')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              period_key: '2026-08',
              reporting_units: 22,
              approved_count: 0,
              submitted_count: 0,
              missing_units: [],
              kpis: [],
            }),
          })
        }
        if (url.includes('/dashboard/units')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] })
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
      }),
    )
    duong('/dashboard')
    expect(await screen.findByText('Dashboard SKATMT')).toBeTruthy()
    expect(screen.getByText('Đăng xuất')).toBeTruthy()
  })

  // S1 + S1a (vòng sửa 1 Task 20, task-20-fix-1.md, "Test bắt buộc cho S1" #1): trước bản vá này,
  // Login.tsx điều hướng bằng `location.assign` — tải lại TÀI LIỆU ĐẦY ĐỦ, xoá sạch store phiên
  // thuần bộ nhớ, nên RequireAuth đá ngược người vừa đăng nhập xong về /login (đăng nhập lại cũng
  // chỉ lặp đúng vòng đó). Ca này đăng nhập THẬT qua form, trên đúng `routeObjects`/`App` production
  // dùng, và khẳng định trang ĐÍCH thật sự render — không phải form đăng nhập lần nữa.
  it('đăng nhập thành công từ /login: vào thẳng /reports bằng điều hướng SPA, không phải form đăng nhập lần nữa (S1a)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: { method?: string }) => {
        if (url.includes('/health')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
        }
        if (url.includes('/auth/login')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ access_token: 'tok-e2e' }) })
        }
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: 1, email: 'u01@ptsc.local', full_name: 'Người nhập U01', position: null },
              roles: ['reporter'],
              permissions: ['report.view_own_unit'],
              org_unit: { id: 2, code: 'U01', name: 'Đơn vị thành viên 01 (tên tạm)' },
            }),
          })
        }
        if (url.includes('/reports')) return Promise.resolve({ ok: true, status: 200, json: async () => [] })
        throw new Error(`URL không lường trước: ${init?.method ?? 'GET'} ${url}`)
      }),
    )
    duong('/login')
    await userEvent.type(screen.getByLabelText('Email'), 'u01@ptsc.local')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Demo@2026')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Chưa có kỳ báo cáo nào đang mở')).toBeTruthy()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  // R5 (vòng sửa 2, task-20-fix-2.md; mục 2.5 task-20-rereview-1.md) — mã đúng (S1b từng mảnh đã
  // có test riêng ở session.test.ts và router.test.tsx), nhưng KHÔNG ca nào trong repo đi qua CẢ
  // CÂY THẬT (App → routeObjects → RequireAuth → AppShell → Reports) ở đúng trạng thái "vừa tải lại
  // trang": sessionStorage còn token, bộ nhớ trong CHỈ có token (đúng như session.ts đọc lại lúc
  // khởi tạo store) — hai lớp test kia cộng lại phủ được CƠ CHẾ, nhưng không gì khoá việc CẢ CHUỖI
  // ghép lại còn dựng được trên đúng bảng route production dùng.
  it('R5: vừa tải lại trang (sessionStorage còn token, store chỉ có token): tự nạp lại phiên rồi vào thẳng /reports', async () => {
    sessionStorage.setItem('hseq.token', 'tok-reload')
    useSession.setState({ token: 'tok-reload', user: null, orgUnit: null, permissions: new Set() })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: 1, email: 'u01@ptsc.local', full_name: 'Người nhập U01', position: null },
              permissions: ['report.view_own_unit'],
              org_unit: { id: 2, code: 'U01', name: 'Đơn vị thành viên 01 (tên tạm)' },
            }),
          })
        }
        if (url.includes('/reports')) return Promise.resolve({ ok: true, status: 200, json: async () => [] })
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
      }),
    )
    duong('/reports')
    expect(screen.getByText('Đang tải…')).toBeTruthy()
    expect(await screen.findByText('Chưa có kỳ báo cáo nào đang mở')).toBeTruthy()
    expect(screen.getByText('Đăng xuất')).toBeTruthy()
    expect(screen.queryByText('Đăng nhập HSEQ')).toBeNull()
  })

  // Task 22 (task-22-carry.md C6, cùng lý do C5 của Task 20): route MỚI phải có ca riêng khoá
  // RequireAuth. Ruling 177: một route thêm vào mà không ai đo thì gỡ mất lớp bọc cũng không test
  // nào đỏ — và /reports/:id là màn có toàn bộ số liệu của một đơn vị.
  it('vào /reports/12 khi CHƯA có token: bị đá về /login, KHÔNG lộ nội dung báo cáo', () => {
    duong('/reports/12')
    expect(screen.getByText('Đăng nhập HSEQ')).toBeTruthy()
    expect(screen.queryByText(/FM01 · 08\/2026/)).toBeNull()
  })

  it('có token: /reports/12 dựng form FM01 trong khung AppShell, kèm breadcrumb về /reports', async () => {
    useSession
      .getState()
      .login(
        'tok-1',
        { id: 1, email: 'u01@ptsc.local', full_name: 'Người nhập U01', position: null },
        { id: 2, code: 'U01', name: 'PTSC Miền Trung' },
        ['report.view_own_unit', 'report.edit', 'report.submit'],
      )
    const chiTiet = {
      id: 12,
      version: 3,
      state: 'draft',
      source: 'live',
      is_late: false,
      header: {
        org_unit: { code: 'U01', name: 'PTSC Miền Trung' },
        template_code: 'FM01',
        period_key: '2026-08',
        due_at: '2026-10-05T16:59:59Z',
        report_no: 'DV-2026-08',
        location: null,
        report_date: null,
        reporter_name: null,
        reporter_position: null,
        submitted_at: null,
        decided_at: null,
        decision_note: null,
      },
      missing_periods: [],
      values: [
        {
          indicator_code: 'B-1.1',
          this_period: null,
          acc_prev_entered: null,
          acc_total_entered: null,
          acc_prev_computed: 402100,
          acc_total_computed: null,
          diff: null,
          counter_check: null,
          note: null,
        },
      ],
      texts: { C1: null },
    }
    const mau = {
      sections: [{ code: 'B-1', name_vi: 'TỔNG GIỜ CÔNG', name_en: 'Total Man Hours' }],
      indicators: [
        {
          code: 'B-1.1',
          section_code: 'B-1',
          name_vi: 'TCT PTSC',
          name_en: 'PTSC Corp.',
          unit: 'Giờ',
          agg_type: 'sum',
          formula: null,
          decimals: 2,
          required: true,
          sort_order: 1,
        },
      ],
      text_fields: [{ code: 'C1', label_vi: 'Hoạt động nổi bật trong tháng' }],
      states: [{ code: 'draft', name_vi: 'Nháp', is_editable: true }],
      transitions: [
        {
          action_code: 'submit',
          from_state: 'draft',
          to_state: 'submitted',
          name_vi: 'Nộp báo cáo',
          required_permission: 'report.submit',
          requires_note: false,
        },
      ],
    }
    const f = vi.fn((url: string) => {
      if (url.includes('/reports/12')) return Promise.resolve({ ok: true, status: 200, json: async () => chiTiet })
      if (url.includes('/templates/FM01')) return Promise.resolve({ ok: true, status: 200, json: async () => mau })
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)

    duong('/reports/12')
    expect(await screen.findByRole('heading', { name: 'PTSC Miền Trung · FM01 · 08/2026' })).toBeTruthy()
    // Danh mục phải lấy theo template_code của CHÍNH báo cáo, không phải chuỗi "FM01" viết cứng.
    expect(f.mock.calls.some(([u]) => String(u).includes('/templates/FM01'))).toBe(true)
    expect(screen.getByLabelText('B-1.1 TCT PTSC, Lũy kế tháng trước').textContent).toBe('402.100')
    expect(screen.getByText('Đăng xuất')).toBeTruthy() // AppShell/Sidebar có mặt
    // Breadcrumb (chỉ ReportDetail mới có): "<đơn vị> · <kỳ>" — khác chuỗi của <h1> nên khớp đúng
    // một phần tử, trong khi nhãn "Báo cáo của đơn vị" bị trùng với link Sidebar.
    expect(screen.getByText('PTSC Miền Trung · 08/2026')).toBeTruthy()
  })

  it('Toast có mặt đúng MỘT lần ở cấp toàn cục', async () => {
    // Toast() tự render null khi chưa có thông điệp (components/ui/Toast.tsx) — không có cách nào
    // đếm "có mặt" qua DOM nếu không kích hoạt một thông điệp thật qua chính hook useToast().
    function KichHoatToast() {
      const hienToast = useToast()
      useEffect(() => hienToast('kiểm tra'), [hienToast])
      return null
    }
    const router = createMemoryRouter(routeObjects, { initialEntries: ['/login'] })
    render(
      <>
        <KichHoatToast />
        <App router={router} />
      </>,
    )
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(1))
  })
})
