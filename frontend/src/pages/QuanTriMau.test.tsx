// frontend/src/pages/QuanTriMau.test.tsx
//
// Màn quản trị DUY NHẤT có thao tác ghi, nên bộ ca này xoay quanh đúng một câu hỏi: **lượt PATCH có
// bay đúng lúc và đúng thân không**. Ba cửa đã biết trước:
//   1. mở kỳ (thêm quyền cho đơn vị) KHÔNG hỏi lại; đóng kỳ (lấy đi lối vào của 22 đầu mối) PHẢI hỏi
//      — bất đối xứng CÓ Ý, và một bản vá "cho đồng bộ" sẽ lặng lẽ xoá mất hàng rào;
//   2. bấm "Đóng kỳ" mà chưa xác nhận thì KHÔNG được gửi gì — hộp thoại mở ra rồi vẫn gửi là hàng
//      rào giả;
//   3. cột "Đã nộp" đếm `submitted|approved`, KHÔNG đếm `draft` — bản nháp tồn tại nhưng chưa ai
//      nộp, mà đó chính là con số quyết định "có nên đóng kỳ này không".
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { QuanTriMau } from './QuanTriMau'
import { Toast } from '../components/ui/Toast'
import { useSession } from '../app/session'

beforeEach(() => {
  vi.unstubAllGlobals()
  useSession.getState().logout()
})

const MAU = [
  {
    code: 'FM01',
    name_vi: 'BÁO CÁO THÁNG CÔNG TÁC SKATMT DỰ ÁN',
    name_en: 'MONTHLY PROJECT HSE REPORT',
    period_type: 'month',
    active: true,
  },
]

interface KyGia {
  period_key: string
  is_open: boolean
}

function kyDayDu(k: KyGia) {
  return {
    period_key: k.period_key,
    start_date: `${k.period_key}-01`,
    end_date: `${k.period_key}-28`,
    due_at: '2026-10-05T16:59:59Z',
    is_open: k.is_open,
  }
}

const KY_MAC_DINH: KyGia[] = [
  { period_key: '2026-07', is_open: false },
  { period_key: '2026-08', is_open: true },
]

/** Lưới `/status` rút gọn: bốn đơn vị ở kỳ 2026-08 với bốn trạng thái KHÁC NHAU — hai trạng thái
 *  tính là "đã nộp" (submitted, approved) và hai không (draft, null). Một lưới toàn `approved` sẽ
 *  không phân biệt được `filter` đúng với `units.length`. */
const LUOI = {
  periods: ['2026-07', '2026-08'],
  units: [
    { code: 'U01', cells: [{ period_key: '2026-07', state: 'approved' }, { period_key: '2026-08', state: 'approved' }] },
    { code: 'U02', cells: [{ period_key: '2026-07', state: 'approved' }, { period_key: '2026-08', state: 'submitted' }] },
    { code: 'U03', cells: [{ period_key: '2026-07', state: 'approved' }, { period_key: '2026-08', state: 'draft' }] },
    { code: 'U04', cells: [{ period_key: '2026-07', state: 'approved' }, { period_key: '2026-08', state: null }] },
  ],
}

interface TuyChon {
  ky?: KyGia[]
  /** Mã lỗi cho MỌI lượt GET — dựng cảnh 403/500. */
  loiGet?: number
  /** Mã lỗi cho lượt PATCH. */
  loiPatch?: number
}

function moiApi(t: TuyChon = {}) {
  const ky = (t.ky ?? KY_MAC_DINH).map(kyDayDu)
  const f = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      if (t.loiPatch) {
        return Promise.resolve({
          ok: false,
          status: t.loiPatch,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'Không đổi được kỳ' }),
        })
      }
      const than = JSON.parse(init?.body ?? '{}')
      const maKy = url.split('/').at(-1)!
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => kyDayDu({ period_key: maKy, is_open: than.is_open }),
      })
    }
    if (t.loiGet) {
      return Promise.resolve({
        ok: false,
        status: t.loiGet,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'Bạn không có quyền thực hiện thao tác này' }),
      })
    }
    const than = url.includes('/periods')
      ? ky
      : url.includes('/status')
        ? LUOI
        : url.includes('/templates')
          ? MAU
          : null
    if (than === null) throw new Error(`URL không lường trước trong test: ${method} ${url}`)
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => than,
    })
  })
  vi.stubGlobal('fetch', f)
  return f
}

function ve(quyen: string[] = ['template.manage', 'status.view']) {
  useSession.setState({
    token: 't',
    user: { id: 1, email: 'admin@ptsc.local', full_name: 'Admin', position: null },
    orgUnit: { id: 1, code: 'PTSC', name: 'PTSC' },
    permissions: new Set(quyen),
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <QuanTriMau />
        <Toast />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Hàng của một kỳ, tìm theo nhãn kỳ đã định dạng ("08/2026"). */
async function hangKy(nhan: string): Promise<HTMLElement> {
  return (await screen.findByText(nhan)).closest('tr')!
}

/** Mọi lượt PATCH đã bay, kèm thân đã giải mã. */
function cacLuotPatch(f: ReturnType<typeof moiApi>) {
  return f.mock.calls
    .filter(([, init]) => (init as { method?: string } | undefined)?.method === 'PATCH')
    .map(([url, init]) => ({
      url: url as string,
      than: JSON.parse((init as { body?: string }).body ?? '{}'),
    }))
}

describe('QuanTriMau — bảng kỳ', () => {
  it('nút đi theo trạng thái kỳ: kỳ mở thì "Đóng kỳ", kỳ đóng thì "Mở kỳ"', async () => {
    moiApi()
    ve()
    expect(within(await hangKy('08/2026')).getByRole('button').textContent).toBe('Đóng kỳ')
    expect(within(await hangKy('07/2026')).getByRole('button').textContent).toBe('Mở kỳ')
    expect(within(await hangKy('08/2026')).getByText('Đang mở')).toBeTruthy()
    expect(within(await hangKy('07/2026')).getByText('Đã đóng')).toBeTruthy()
  })

  it('cột "Đã nộp" đếm submitted + approved, KHÔNG đếm nháp hay ô trống', async () => {
    moiApi()
    ve()
    // `waitFor` chứ không `findByTestId`: ô tồn tại NGAY (với "—") trong lúc `/status` còn bay,
    // nên `findBy…` về ngay và ca sẽ đo đúng cái dấu gạch tạm thời chứ không đo phép đếm.
    // 2026-08: approved + submitted = 2 trên 4 đầu mối (draft và ô trống không tính).
    await waitFor(() => expect(screen.getByTestId('da-nop-2026-08').textContent).toBe('2/4'))
    // 2026-07: cả bốn đều approved.
    expect(screen.getByTestId('da-nop-2026-07').textContent).toBe('4/4')
  })

  it('KHÔNG có status.view: cột "Đã nộp" là "—" và KHÔNG có lượt gọi /status nào', async () => {
    const f = moiApi()
    ve(['template.manage'])
    // Đợi ĐÚNG mốc mà lượt `/status` sẽ bay nếu nó được phép: bảng kỳ về rồi, tức `tu`/`den` đã
    // có. Thiếu mốc này thì "chưa gọi /status" đúng một cách vô nghĩa — chưa gọi vì chưa tới lúc.
    await screen.findByText('08/2026')
    await new Promise((r) => setTimeout(r, 0))
    expect(f.mock.calls.filter(([u]) => (u as string).includes('/status'))).toHaveLength(0)
    expect(screen.getByTestId('da-nop-2026-08').textContent).toBe('—')
  })
})

describe('QuanTriMau — mở/đóng kỳ', () => {
  it('bấm "Mở kỳ" gửi PATCH is_open=true NGAY, không hỏi lại', async () => {
    const f = moiApi()
    ve()
    await userEvent.click(within(await hangKy('07/2026')).getByRole('button'))
    await waitFor(() => expect(cacLuotPatch(f)).toHaveLength(1))
    expect(cacLuotPatch(f)[0].url).toContain('/templates/FM01/periods/2026-07')
    expect(cacLuotPatch(f)[0].than).toEqual({ is_open: true })
    // Không có hộp thoại nào chen vào giữa.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('bấm "Đóng kỳ" CHỈ mở hộp thoại — chưa gửi gì cả', async () => {
    const f = moiApi()
    ve()
    await userEvent.click(within(await hangKy('08/2026')).getByRole('button'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Đóng kỳ 08/2026?')).toBeTruthy()
    expect(cacLuotPatch(f)).toHaveLength(0)
  })

  it('xác nhận trong hộp thoại mới gửi PATCH is_open=false', async () => {
    const f = moiApi()
    ve()
    await userEvent.click(within(await hangKy('08/2026')).getByRole('button'))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đóng kỳ' }))
    await waitFor(() => expect(cacLuotPatch(f)).toHaveLength(1))
    expect(cacLuotPatch(f)[0].url).toContain('/templates/FM01/periods/2026-08')
    expect(cacLuotPatch(f)[0].than).toEqual({ is_open: false })
    expect(await screen.findByText('Đã đóng kỳ 08/2026')).toBeTruthy()
  })

  it('bấm Huỷ trong hộp thoại: không gửi gì, hộp thoại đóng', async () => {
    const f = moiApi()
    ve()
    await userEvent.click(within(await hangKy('08/2026')).getByRole('button'))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Huỷ' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(cacLuotPatch(f)).toHaveLength(0)
  })

  it('PATCH hỏng: hiện nguyên văn câu lỗi của backend, KHÔNG im lặng', async () => {
    moiApi({ loiPatch: 409 })
    ve()
    await userEvent.click(within(await hangKy('07/2026')).getByRole('button'))
    expect(await screen.findByText('Không đổi được kỳ')).toBeTruthy()
  })
})

describe('QuanTriMau — không đủ quyền', () => {
  it('403 hiện câu tiếng Việt, không phải khung trống hay "Thử lại"', async () => {
    moiApi({ loiGet: 403 })
    ve()
    expect(await screen.findAllByText('Bạn không có quyền quản trị mục này')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })

  it('lỗi KHÁC 403 thì có nút Thử lại (còn cứu được bằng gọi lại)', async () => {
    moiApi({ loiGet: 502 })
    ve()
    expect((await screen.findAllByRole('button', { name: 'Thử lại' })).length).toBeGreaterThan(0)
  })
})
