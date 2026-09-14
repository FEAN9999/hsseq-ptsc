// frontend/src/app/routes.test.tsx
//
// C7 (task-19-carry.md): kiểm bảng route THẬT — dùng lại đúng `routeObjects`/`App` mà production
// dùng (qua `createMemoryRouter` để điều khiển URL ban đầu), không tự dựng một cây <Routes> song
// song rồi so khớp với chính nó. /dashboard xây ở Task 25, /status xây ở Task 26 — cả hai nay đều
// có ca khoá RequireAuth riêng dưới đây (không còn route nào "chưa xây" để loại trừ). Bất biến
// "mọi đích điều hướng dẫn tới trang thật" (C3/C5, task-26-carry.md — bốn nguồn: href Sidebar,
// landing sau đăng nhập, RequireAuth→/login, điều hướng trong trang) có khối ca RIÊNG ở cuối file
// — không lặp một bản yếu ở đây.
//
// task-20-carry.md C5: Task 20 là task đầu tiên khai route bọc RequireAuth THẬT (/reports) — Task
// 19 chưa đo được ca "bỏ RequireAuth khỏi một route cần phiên" vì lúc đó chưa có route nào để bỏ
// (Ruling 177). Hai ca /reports dưới đây khoá đúng: chưa đăng nhập bị đá về /login (bỏ
// RequireAuth ở routes.tsx phải làm ca này ĐỎ), có đăng nhập thấy đúng khung AppShell quanh trang.
import { useEffect } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, MemoryRouter } from 'react-router-dom'

import { App, routeObjects } from './routes'
import { queryClient } from './queryClient'
import { duongDanDieuHuongTrongTrang } from './routeScan'
import { useToast } from '../components/ui/Toast'
import { useSession } from './session'
import { Sidebar } from '../components/Sidebar'

// Login.tsx tự gọi fetch('/health') lúc mount (carry C2) — stub để mọi lần dựng /login trong file
// này thấy fetch trả lời ngay, không đợi thật chuỗi thử lại 5s×2 của brief Task 19.
//
// Vòng sửa 2 (task-25-fix-2.md P4/C2, task-25-rereview-1.md mục 8 [NHẸ]): `App` (routes.tsx:78)
// bọc bằng ĐÚNG singleton `queryClient` sản xuất (không phải QueryClient riêng của từng test như
// Dashboard.test.tsx) — CỐ Ý (bình luận đầu file: "chạy ĐÚNG cây thật"), nhưng thiếu dòng `.clear()`
// này thì cache SỐNG SÓT giữa các `it()` trong CHÍNH file này (cùng module, `staleTime: 30_000`)
// — một ca sau có thể xanh nhờ dữ liệu CACHE của ca trước, dù fetch của chính nó không hề chạy.
// Không dựng lại kiến trúc test của file (vẫn dùng đúng singleton) — chỉ đảm bảo mỗi ca bắt đầu
// từ cache RỖNG.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }))
  useSession.getState().logout()
  queryClient.clear()
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
    const f = vi.fn((url: string) => {
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
    })
    vi.stubGlobal('fetch', f)
    duong('/dashboard')
    expect(await screen.findByText('Dashboard SKATMT')).toBeTruthy()
    expect(screen.getByText('Đăng xuất')).toBeTruthy()
    // Vòng sửa 2 (task-25-fix-2.md P4/C2, task-25-rereview-1.md mục 8 [NHẸ]): tự vệ ĐỘC LẬP với
    // `queryClient.clear()` ở `beforeEach` trên — "Dashboard SKATMT" tự vẽ ngay cả khi CHƯA có dữ
    // liệu (carry ghi ở ca N26 trên), nên riêng khẳng định <h1> không buộc fetch của CHÍNH ca này
    // phải thực sự chạy (một cache cũ sống sót vẫn đủ cho hai dòng expect ở trên). Khoá thêm CHÍNH
    // request đã bay lên, để nếu ai lỡ xoá dòng `.clear()` kia thì ca này tự đỏ thay vì xanh giả.
    expect(f.mock.calls.some(([u]) => String(u).includes('/dashboard/summary'))).toBe(true)
  })

  // Task 26 (task-26-carry.md C11, cùng lý do C5 Task 20/C6 Task 22/N26 Task 25 ở trên): route MỚI
  // /status phải có ca RIÊNG khoá RequireAuth — gỡ hẳn <RequireAuth> khỏi route /status ở
  // routes.tsx phải làm ca dưới đây ĐỎ (đã tự kiểm hai chiều: gỡ → đỏ, khôi phục qua snapshot file
  // → xanh lại). "Tình trạng nộp · FM01" là <h1> riêng của trang (TieuDe trong Status.tsx), vẽ
  // NGAY LẬP TỨC ở cả bốn nhánh (403/lỗi nền/tải/có dữ liệu) — đủ để khẳng định "trang có mở hay
  // không" mà không cần dựng fetch riêng cho /status.
  it('vào /status khi CHƯA có token: bị đá về /login, KHÔNG lộ lưới tình trạng nộp', () => {
    duong('/status')
    expect(screen.getByText('Đăng nhập HSEQ')).toBeTruthy()
    expect(screen.queryByText('Tình trạng nộp · FM01')).toBeNull()
  })

  it('có token, quyền status.view: vào /status thấy đúng khung AppShell (Sidebar) quanh trang', async () => {
    useSession
      .getState()
      .login(
        'tok-1',
        { id: 1, email: 'admin@ptsc.local', full_name: 'Quản trị Ban ATCL', position: null },
        { id: 1, code: 'HO', name: 'Ban ATCL' },
        ['status.view'],
      )
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] })
      }
      if (url.includes('/status?')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ periods: [], units: [] }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
    })
    vi.stubGlobal('fetch', f)
    duong('/status')
    expect(await screen.findByText('Tình trạng nộp · FM01')).toBeTruthy()
    expect(screen.getByText('Đăng xuất')).toBeTruthy()
    expect(f.mock.calls.some(([u]) => String(u).includes('/templates/FM01/periods'))).toBe(true)
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

// C3 + C5 (task-26-carry.md): bất biến "mọi đích điều hướng dẫn tới trang thật, không bao giờ ra
// NotFound" — BỐN nguồn liệt trong carry:
//   1. href Sidebar (Task 18) — mọi mục KHÔNG bị khoá (không phải <span> Giai đoạn 2).
//   2. landing sau đăng nhập (Login.tsx dieuHuongSauDangNhap) — hai nhánh if/else theo vai.
//   3. RequireAuth → /login khi chưa có token — đã phủ TRANSITIVE bởi mọi ca "khi CHƯA có token"
//      trong describe('bảng route') trên: mỗi ca đó tự đi qua ĐÚNG RequireAuth thật, không lặp
//      thêm một ca yếu ở đây.
//   4. navigate()/<Link to=> TĨNH trong src/pages + src/features — quét TỰ ĐỘNG qua routeScan.ts
//      (Task 18 cascade.ts cùng kỹ thuật đọc file thật), không chép tay một danh sách sẽ tự cũ
//      ngay khi có trang sau thêm một điều hướng mới.
describe('C3 + C5 (task-26-carry.md): mọi đích điều hướng dẫn tới trang thật', () => {
  // Khớp route là việc THUẦN PATH-MATCHING của react-router, chạy TRƯỚC bất kỳ component nào
  // (kể cả RequireAuth) render — nên không cần phiên đăng nhập: một đường dẫn "có route thật"
  // luôn dựng ra một cây khác NotFound, dù kết quả cụ thể là chính trang đó, hay bị RequireAuth
  // đá về /login (redirect vẫn là MỘT route khớp, không phải "không tìm thấy trang").
  function khongPhaiNotFound(duongDan: string) {
    const router = createMemoryRouter(routeObjects, { initialEntries: [duongDan] })
    render(<App router={router} />)
    expect(screen.queryByText('Không tìm thấy trang')).toBeNull()
  }

  // Nguồn 1: mọi href THẬT Sidebar render ra — đăng nhập với đủ quyền để cả ba mục (Dashboard,
  // Báo cáo của đơn vị, Tình trạng nộp) cùng hiện; ba mục "Quản trị nền tảng" là <span> khoá
  // (Sidebar.tsx, MucKhoa), không phải <a>, nên không lọt vào querySelectorAll('a') — đúng ý,
  // đó không phải "đích điều hướng" thật. Đăng xuất TRƯỚC vòng lặp khẳng định: việc ĐANG kiểm
  // là khớp ROUTE (không cần phiên) — giữ phiên qua vòng lặp sẽ khiến các trang sau RequireAuth
  // (Dashboard.tsx…) thật sự cố gọi fetch dữ liệu trên stub chung `{status:'ok'}` của beforeEach,
  // không khớp hình dạng response từng trang cần, vỡ giữa chừng vì lý do KHÔNG liên quan tới
  // đúng bất biến đang đo ở đây.
  it('nguồn 1: mọi href Sidebar dẫn tới trang thật, không NotFound', () => {
    useSession
      .getState()
      .login(
        'tok-1',
        { id: 1, email: 'admin@ptsc.local', full_name: 'Quản trị Ban ATCL', position: null },
        { id: 1, code: 'HO', name: 'Ban ATCL' },
        ['dashboard.view', 'status.view', 'report.view_own_unit'],
      )
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(0)
    cleanup()
    useSession.getState().logout()
    for (const href of hrefs) {
      khongPhaiNotFound(href)
      cleanup()
    }
  })

  // Nguồn 2: landing sau đăng nhập (Login.tsx dieuHuongSauDangNhap) — CHỈ hai đích tĩnh khả dĩ,
  // chọn theo if/else trên `roles`: có 'reporter' → /reports (ca S1a phía trên, đăng nhập THẬT
  // qua form, đã khẳng định tới đúng /reports); KHÔNG có 'reporter' → /dashboard, ca dưới đây bù
  // đúng nhánh còn lại — cũng đăng nhập THẬT qua form, không chỉ khẳng định routeObjects có khai
  // '/dashboard' (điều đó không chứng minh Login.tsx thật sự điều hướng tới đó).
  it('nguồn 2: đăng nhập vai KHÔNG có reporter → vào thẳng /dashboard (nhánh còn lại của Login.tsx)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: { method?: string }) => {
        if (url.includes('/health')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
        }
        if (url.includes('/auth/login')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ access_token: 'tok-admin' }) })
        }
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: 1, email: 'admin@ptsc.local', full_name: 'Quản trị Ban ATCL', position: null },
              roles: ['admin'],
              permissions: ['dashboard.view'],
              org_unit: { id: 1, code: 'HO', name: 'Ban ATCL' },
            }),
          })
        }
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
        if (url.includes('/dashboard/units')) return Promise.resolve({ ok: true, status: 200, json: async () => [] })
        throw new Error(`URL không lường trước: ${init?.method ?? 'GET'} ${url}`)
      }),
    )
    duong('/login')
    await userEvent.type(screen.getByLabelText('Email'), 'admin@ptsc.local')
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Demo@2026')
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Dashboard SKATMT')).toBeTruthy()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  // Nguồn 4: quét TỰ ĐỘNG mọi đích navigate()/<Link to=> TĨNH trong src/pages + src/features
  // (routeScan.ts) — hoisted MODULE SCOPE (không gọi trong thân `it`) để `it.each` nhận được đúng
  // mảng lúc KHAI ca; hàm chính nó chỉ đọc file qua node:fs, không phụ thuộc DOM/React nên gọi
  // ngoài `it`/`beforeEach` an toàn (cùng khuôn HIEM ở Login.test.tsx).
  const DUONG_DAN_TRONG_TRANG = duongDanDieuHuongTrongTrang()

  // Tự vệ: mảng rỗng (vd. lỡ đổi regex/đường dẫn quét trong routeScan.ts làm nó không khớp gì)
  // sẽ làm `it.each` dưới đây có 0 ca — 0 ca "xanh" trông giống một bất biến ĐÃ kiểm nhưng thật
  // ra chưa hề chạy. Ca riêng này đảm bảo im lặng kiểu đó tự đỏ.
  it('nguồn 4: routeScan.ts thật sự quét được ít nhất một đích', () => {
    expect(DUONG_DAN_TRONG_TRANG.length).toBeGreaterThan(0)
  })

  // Khoá đúng TẬP đích đã quét được (không chỉ "khác rỗng") — biến lần kiểm tay MỘT LẦN (thủ công,
  // ngoài Vitest, lúc viết routeScan.ts) thành một ca TỰ ĐỘNG sống lâu dài: nếu regex trong
  // routeScan.ts lỡ hẹp lại (bỏ sót một kiểu trích dẫn/cú pháp thật đang dùng) mà TẬP kết quả vẫn
  // toàn đích hợp lệ, ca it.each dưới vẫn xanh dù đã bỏ sót — chỉ so khớp CHÍNH XÁC tập này mới lộ
  // ra thiếu sót đó. `/reports/${cell.report_id}` (StatusGrid.tsx) và `/reports` (Status.tsx, lối
  // thoát 403) là hai đích MỚI Task 26 thêm — cả hai chuẩn hoá trùng vào hai phần tử đã có sẵn từ
  // trước (không sinh phần tử mới).
  // task-26-fix-1.md Q3: `/dashboard` là phần tử MỚI kể từ khi routeScan.ts quét thêm file `.ts`
  // (trước đây chỉ `.tsx`) — `useChuyenTrangThai.ts:190` có `navigate('/dashboard')` THẬT, từng bị
  // bỏ sót hoàn toàn. Trước bản vá này, ca này khoá đúng LỖ THỦNG (thiếu `/dashboard`) chứ không
  // khoá hành vi đúng — nới rộng bộ quét ra đúng mà ca lại đỏ, tự chặn chính bản vá của nó. Tập kỳ
  // vọng dưới đây cập nhật CÙNG LÚC với bản vá routeScan.ts, không tách rời.
  it('nguồn 4: routeScan.ts quét đúng TẬP đích hiện có (khoá tránh regex hẹp lại mà không ai biết)', () => {
    expect(new Set(DUONG_DAN_TRONG_TRANG)).toEqual(
      new Set(['/reports', '/reports/1', '/reports/1?from=dashboard&period=1#1', '/dashboard']),
    )
  })

  it.each(DUONG_DAN_TRONG_TRANG)(
    'nguồn 4: điều hướng trong trang tới "%s" dẫn tới trang thật, không NotFound',
    (duongDan) => {
      khongPhaiNotFound(duongDan)
    },
  )
})
