// frontend/src/app/routes.test.tsx
//
// C7 (task-19-carry.md): kiểm bảng route THẬT — dùng lại đúng `routeObjects`/`App` mà production
// dùng (qua `createMemoryRouter` để điều khiển URL ban đầu), không tự dựng một cây <Routes> song
// song rồi so khớp với chính nó. Không kiểm /dashboard, /status (chưa xây). Bất biến "mọi href
// Sidebar dẫn tới trang thật" thuộc Task 26 (đã ghi ledger trong carry), không lặp một bản yếu ở
// đây.
//
// task-20-carry.md C5: Task 20 là task đầu tiên khai route bọc RequireAuth THẬT (/reports) — Task
// 19 chưa đo được ca "bỏ RequireAuth khỏi một route cần phiên" vì lúc đó chưa có route nào để bỏ
// (Ruling 177). Hai ca /reports dưới đây khoá đúng: chưa đăng nhập bị đá về /login (bỏ
// RequireAuth ở routes.tsx phải làm ca này ĐỎ), có đăng nhập thấy đúng khung AppShell quanh trang.
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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
