// frontend/src/pages/Status.test.tsx
//
// task-26-brief.md Step 1 liệt 6 ca (trích) — file này viết lại đủ 6 ca đó, với HAI thay đổi
// NGUYÊN VĂN theo task-26-carry.md:
//   C2: hai khẳng định ở ca "chip viền rỗng/đặc" chỉ đọc chuỗi className (mù trước cascade) — thay
//       bằng resolveCascadeWinner(className, 'background-color') (components/ui/cascade.ts).
//   C8: StatusCellOut trước đây thiếu report_id nên "ô Chưa nộp không click được" (khẳng định
//       o.closest('a') === null) chỉ có nghĩa nếu ô ĐÃ NỘP là <a> thật — backend đã vá (carry C8),
//       StatusGrid.tsx dùng report_id (không phải state) làm nguồn chân lý "bấm được".
//
// Cộng thêm: các ca tự viết cho carry C6/C7 (periods suy từ GET /templates/FM01/periods, không
// khoá cứng from/to), C12 (đọc theo tiêu đề không theo chỉ số, FE không tự sort), C13 (hai nguồn
// dữ liệu — ca bất đối xứng cho từng nguồn; lỗi nền không phá màn đang có dữ liệu), và ba số đo
// pixel brief cho NGUYÊN VĂN (260px/104px/40px).
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { Status } from './Status'
import type { StatusUnit } from '../features/status/StatusGrid'
import { Toast } from '../components/ui/Toast'
import { resolveCascadeWinner } from '../components/ui/cascade'
import { queryClient as queryClientSanXuat } from '../app/queryClient'

beforeEach(() => {
  vi.unstubAllGlobals()
})

// ---- Fixture: 4 kỳ (06..09/2026, is_open ĐÚNG như seed thật — 08 VÀ 09 cùng true, "kỳ đang mở"
// phải là kỳ CUỐI trong số đó — carry C7), 5 đơn vị. U22 "PTSC Đình Vũ" + U23 "PTSC Quảng Ngãi"
// chưa nộp ở kỳ đang mở (2026-09) — đúng NGUYÊN VĂN hai tên brief đòi trong ca sao chép clipboard.
// U05 có is_late=true ở 2026-08 cho ca "Đã nộp (muộn)". P05 "Ban dự án Lô B" (task-26-fix-1.md Q6)
// mang draft (06-08) và returned (09) — hai trạng thái trước đây CHƯA TỪNG render trong ca nào. ----

const PERIODS = [
  { period_key: '2026-06', is_open: false },
  { period_key: '2026-07', is_open: false },
  { period_key: '2026-08', is_open: true },
  { period_key: '2026-09', is_open: true },
]

function o(
  period_key: string,
  state: string | null,
  source: string | null,
  is_late: boolean | null,
  report_id: number | null,
) {
  return { period_key, state, source, is_late, report_id }
}

const DEFAULT_UNITS: StatusUnit[] = [
  {
    code: 'U01',
    name: 'PTSC Miền Trung',
    cells: [
      o('2026-06', 'approved', 'seed', false, 601),
      o('2026-07', 'approved', 'seed', false, 701),
      o('2026-08', 'approved', 'seed', false, 801),
      o('2026-09', 'approved', 'live', false, 901),
    ],
  },
  {
    code: 'U05',
    name: 'PTSC Thanh Hoá',
    cells: [
      o('2026-06', 'approved', 'seed', false, 602),
      o('2026-07', 'approved', 'seed', false, 702),
      o('2026-08', 'submitted', 'live', true, 802),
      o('2026-09', 'submitted', 'live', false, 902),
    ],
  },
  {
    code: 'U22',
    name: 'PTSC Đình Vũ',
    cells: [
      o('2026-06', 'approved', 'seed', false, 622),
      o('2026-07', 'approved', 'seed', false, 722),
      o('2026-08', 'approved', 'live', false, 822), // outline=false: nộp SỐNG (o-U22-2026-08)
      o('2026-09', null, null, null, null), // chưa nộp ở kỳ đang mở
    ],
  },
  {
    code: 'U23',
    name: 'PTSC Quảng Ngãi',
    cells: [
      o('2026-06', 'approved', 'seed', false, 623),
      o('2026-07', 'approved', 'seed', false, 723),
      o('2026-08', 'approved', 'seed', false, 823),
      o('2026-09', null, null, null, null), // chưa nộp ở kỳ đang mở
    ],
  },
  // task-26-fix-1.md Q6: `returned` (Trả lại) CHƯA TỪNG được render trong bất kỳ ca nào của lưới
  // trước bản vá này — DEFAULT_UNITS chỉ có approved/submitted/null. "Trả lại" nằm ngay trong kịch
  // bản cổng ra Phase 2 của chính brief này (admin trả lại -> sửa -> nộp lại -> duyệt), và /status
  // là màn DUY NHẤT hiển thị trạng thái đó theo chiều ngang thời gian. Thêm ở ĐÚNG cột "kỳ đang mở"
  // (2026-09) — "đúng cột người xem demo nhìn nhiều nhất" theo lời người soát — cùng `draft` ở ba kỳ
  // trước để mẫu không chỉ có MỘT trạng thái mới. `report_id` khác null ở MỌI kỳ (kể cả draft/trả
  // lại): cả hai đều là báo cáo CÓ THẬT (đã tạo/đã nộp rồi bị trả lại), khác "chưa nộp" — không lẫn
  // vào danh sách nút Sao chép hay ô "không bấm được".
  {
    code: 'P05',
    name: 'Ban dự án Lô B',
    cells: [
      o('2026-06', 'draft', 'live', false, 610),
      o('2026-07', 'draft', 'live', false, 710),
      o('2026-08', 'draft', 'live', false, 810),
      o('2026-09', 'returned', 'live', false, 910), // kỳ đang mở — cột người xem demo nhìn nhiều nhất
    ],
  },
]

const DEFAULT_STATUS = { periods: PERIODS.map((p) => p.period_key), units: DEFAULT_UNITS }

function moiApi(
  overrides: { periods?: typeof PERIODS; trangThai?: typeof DEFAULT_STATUS } = {},
) {
  const periods = overrides.periods ?? PERIODS
  const trangThai = overrides.trangThai ?? DEFAULT_STATUS
  const f = vi.fn((url: string) => {
    if (url.includes('/templates/FM01/periods')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => periods })
    }
    if (url.includes('/status?')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => trangThai })
    }
    throw new Error(`URL không lường trước trong test: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}

// Đích điều hướng nội bộ (khuôn "dich-den" — Dashboard.test.tsx/carry C12 task-25) — hiện lại
// path+search+hash trên CÂY THẬT thay vì spy.
function DichDen() {
  const { pathname, search, hash } = useLocation()
  return (
    <div data-testid="dich-den">
      {pathname}
      {search}
      {hash}
    </div>
  )
}

// Toast là store TOÀN CỤC (Task 15) — mount cạnh <Status/> giống production (routes.tsx: <Toast/>
// đứng cạnh <RouterProvider>, không lồng trong trang) để ca "Đã sao chép n đơn vị" tìm được chữ
// trên màn hình qua chính useToast() thật, không phải một cơ chế toast riêng của trang.
function renderStatus(
  initialPath = '/status',
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/status" element={<Status />} />
            <Route path="*" element={<DichDen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
      <Toast />
    </>,
  )
}

// task-26-fix-4.md — "Dùng đúng chính sách `retry` sản xuất, không chỉ `retry:false`". `renderStatus`
// ở trên tắt hẳn retry, nên mọi ca dựng-cảnh-lỗi-nền của nó đo một đường KHÁC đường người dùng thật
// đi: dưới bản sản xuất, một lỗi 5xx còn kéo theo BA lượt thử lại nữa trước khi query sang `error`,
// và chỉ sau lượt cuối cùng mới có trạng thái CUỐI để đọc. Hai override dưới đây KHÔNG đụng vào
// chính sách retry (hàm `retry` lấy NGUYÊN từ app/queryClient.ts):
//   staleTime: 0 — bản sản xuất đặt 30_000, mà cảnh cần dựng BẮT ĐẦU bằng một lượt làm mới ở NỀN
//     (refetchOnWindowFocus). Để nguyên 30s thì lượt làm mới đó không bao giờ chạy trong test và
//     cảnh không dựng được (ở sản xuất nó vẫn chạy — chỉ là sau 30 giây).
//   retryDelay: 0 — bản sản xuất dùng backoff mặc định 1s/2s/4s ⇒ ~7 giây chờ THẬT mỗi ca. SỐ LƯỢT
//     thử và điều kiện dừng (4xx dừng ngay, 5xx thử 3 lần) giữ nguyên — chỉ bỏ thời gian chờ.
function renderStatusRetrySanXuat(initialPath = '/status') {
  const macDinh = queryClientSanXuat.getDefaultOptions().queries
  return renderStatus(
    initialPath,
    new QueryClient({ defaultOptions: { queries: { ...macDinh, staleTime: 0, retryDelay: 0 } } }),
  )
}

// task-26-rereview-3.md [T2]: `waitFor(<đã gọi lần đầu>)` KHÔNG phải mốc đúng — nó thoả ngay ở lần
// thử ĐẦU, lúc query mới còn `pending` và `placeholderData` vẫn đang giữ lưới cũ, nên ca đọc một
// KHOẢNH KHẮC chứ không bao giờ thấy trạng thái CUỐI. Mốc đúng: lặp cho tới khi không còn lượt gọi
// MỚI nào trong một nhịp — tự động chờ hết cả ba lượt thử lại của chính sách sản xuất mà không phải
// khoá cứng con số 4 (số lượt là chi tiết của queryClient.ts, không phải của ca này).
async function choLang(demLuotGoi: () => number) {
  let truoc = -1
  while (truoc !== demLuotGoi()) {
    truoc = demLuotGoi()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })
  }
}

// task-26-fix-5.md U1 — cảnh dùng chung cho hai ca U1 (và là cảnh R1 vòng 2): đã có lưới trên màn,
// rồi `/periods` làm mới Ở NỀN và quản trị đã ĐÓNG HẾT KỲ. Sau cảnh này `den === undefined` ⇒
// `enabled:false` ⇒ `tk` ở `pending` MÃI ⇒ `keepPreviousData` áp không ngừng ⇒ `tk.data` vẫn CÓ, và
// không `error` nào ⇒ `loi === null`. Tức đây đúng là nhánh mà mọi tín hiệu "hỏng" đều im.
async function dungCanhDongHetKy() {
  let goiThu = 0
  const f = vi.fn((url: string) => {
    goiThu++
    const laLanDau = goiThu <= 2
    if (url.includes('/templates/FM01/periods')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (laLanDau ? PERIODS : PERIODS.map((k) => ({ ...k, is_open: false }))),
      })
    }
    if (url.includes('/status?')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
    }
    throw new Error(`URL không lường trước: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  renderStatus()
  expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
  await act(async () => {
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await waitFor(() => expect(goiThu).toBeGreaterThan(2))
  await choLang(() => goiThu)
  return f
}

// task-26-fix-5.md U3 — cảnh dùng chung cho cụm ca băng: đang xem lưới, rời tab rồi quay lại và
// lượt làm mới Ở NỀN hỏng với CÙNG `queryKey` (502). Đây là cảnh PHỔ BIẾN NHẤT của cả lớp lỗi, và
// là cảnh mà hai đột biến N-16/N-18 làm băng biến mất mà không ca nào đỏ.
async function dungCanhLoiNenCungKy() {
  let goiThu = 0
  const f = vi.fn((url: string) => {
    goiThu++
    const laLanDau = goiThu <= 2
    if (url.includes('/templates/FM01/periods')) {
      return laLanDau
        ? Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
        : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
    }
    if (url.includes('/status?')) {
      return laLanDau
        ? Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
        : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
    }
    throw new Error(`URL không lường trước: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  renderStatus()
  expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
  await act(async () => {
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await waitFor(() => expect(goiThu).toBeGreaterThan(2))
  await choLang(() => goiThu)
  return { dem: (u: string) => f.mock.calls.filter(([url]) => String(url).includes(u)).length }
}

// task-26-fix-6.md W3 — "NGƯỜI DÙNG CÓ THẤY KHÔNG", hỏi cho TỪNG phần tử chứ không chỉ cho khối
// ngoài. Mù kiểu (b) tái diễn SÂU HƠN MỘT TẦNG: ca vòng 5 đọc `className` của **riêng** thẻ bọc, nên
// V-17 (ẩn đúng `<span>` chữ, giữ nguyên khối) đi lọt — người dùng thấy một cái NÚT TRƠ không lời
// giải thích, mà `getByTestId` vẫn xanh. Và nó chỉ hỏi MỘT cách ẩn (`display`), trong khi có ít nhất
// bốn cách ẩn một phần tử mà DOM vẫn còn nguyên.
//
// Vì sao không dùng `getComputedStyle`: jsdom không có bộ máy CSS, `.hidden` của Tailwind là một
// class trong file CSS đã build chứ không phải style inline — `getComputedStyle` trả về rỗng. Nên
// hỏi bốn nguồn ẩn ĐỘC LẬP với nhau:
//   1. thuộc tính `hidden` của HTML · 2. `aria-hidden="true"` (ẩn với người đọc màn hình) ·
//   3. style INLINE `display:none`/`visibility:hidden` · 4. token class ẩn của Tailwind
//   (`hidden`/`invisible`/`sr-only`) — đọc THẲNG token, không qua CSS build, vì đã đo được là
//   Tailwind CHỈ emit utility đang được dùng nên `.hidden` **không có trong CSS build** và
//   `resolveCascadeWinner` trả `null` chứ không trả `'none'`.
// Lưới an toàn thứ năm: `resolveCascadeWinner(...) === 'none'` bắt một class TỰ ĐẶT ánh xạ sang
// `display:none` trong CSS thật.
//
// Khác bản vòng 5 một điểm CÓ CHỦ Ý: `null` (className không mang utility `display` nào) KHÔNG còn
// bị coi là ẩn. Bản cũ bắn đỏ oan vào một bản vá hợp lệ bỏ `flex` đi (V-13) — đó là mù kiểu (d),
// phạt người vá đúng. Điều ca này thật sự phải canh là "có bị ẩn không", không phải "có đúng utility
// tôi quen mắt không".
function biAnDi(el: Element): boolean {
  if (el instanceof HTMLElement) {
    if (el.hidden) return true
    if (el.style.display === 'none' || el.style.visibility === 'hidden') return true
  }
  if (el.getAttribute('aria-hidden') === 'true') return true
  const lop = typeof el.className === 'string' ? el.className : ''
  if (lop.split(/\s+/).some((c) => c === 'hidden' || c === 'invisible' || c === 'sr-only')) return true
  return resolveCascadeWinner(lop, 'display') === 'none'
}

/** Tên thẻ + đoạn chữ đầu — để khi ca đỏ, thông báo chỉ thẳng phần tử nào bị ẩn thay vì chỉ `false`. */
function moTa(el: Element): string {
  return `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 40)}"`
}

// task-26-fix-6.md W3 — hai mặt của CHỮ trên băng, dùng chung cho mọi cảnh có băng (hai câu khác
// nhau: cảnh lỗi tải, và cảnh không-còn-kỳ-mở của [V-1b]).
// Mặt DƯƠNG (đã có từ vòng 5): phải nói số liệu đang cũ.
// Mặt ÂM (vòng 6 thêm): **không được nói ngược**. V-10 cho thấy mặt dương một mình là bằng chứng
// rỗng — "Số liệu cũ đã được cập nhật" chứa chữ "cũ" nên khớp mẫu dương, mà nghĩa thì NGƯỢC HẲN:
// nó trấn an người dùng rằng số đang mới, đúng lúc số đang cũ. Mù kiểu (a) tái diễn: tên ca hứa
// "nói số liệu đang CŨ", khẳng định chỉ đòi "có chứa chữ cũ".
// Vẫn khoá bằng MẪU chứ không bằng nguyên văn, để một bản sau đổi lời mà vẫn nói đúng thì đi qua
// được (một câu cộc lốc kiểu "Số liệu cũ" — V-09 — là thật, và được phép).
function kiemChuBang(bang: HTMLElement) {
  const chu = within(bang).getByText(/cũ|lần tải gần nhất|chưa cập nhật|không còn kỳ nào đang mở/i)
  const noiDung = chu.textContent?.trim() ?? ''
  expect(noiDung).not.toBe('')
  expect(noiDung).not.toMatch(/đã (được )?(làm mới|cập nhật)|mới nhất|thành công|đang là bản mới/i)
}

// task-26-fix-6.md W1 — cảnh thứ hai của U1: `/periods` làm mới ở NỀN và trả `[]` (mất hết kỳ).
// Khác `dungCanhDongHetKy`: ở đây `tu` VÀ `den` cùng mất, nên URL `/status` mà `tk.refetch()` dựng
// ra là `…&from=undefined&to=undefined`.
async function dungCanhPeriodsRong() {
  let goiThu = 0
  const f = vi.fn((url: string) => {
    goiThu++
    const laLanDau = goiThu <= 2
    if (url.includes('/templates/FM01/periods')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => (laLanDau ? PERIODS : []) })
    }
    if (url.includes('/status?')) {
      // Mô phỏng ĐÚNG backend TRƯỚC bản vá W1b: `from`/`to` là `str` không validate và bộ lọc so
      // sánh CHUỖI, nên `from=undefined` cho ra **200 với THÂN RỖNG** (đo thật trên CSDL:
      // `'2026-09' >= 'undefined'` là FALSE). Giữ hành vi cũ ở đây CÓ CHỦ Ý: bản vá phía FE phải
      // đứng được MỘT MÌNH, không dựa vào việc backend vừa được siết — một máy chủ cũ, một proxy,
      // hay một bản triển khai khác vẫn có thể trả đúng như vậy.
      if (url.includes('from=undefined')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ periods: [], units: [] }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
    }
    throw new Error(`URL không lường trước: ${url}`)
  })
  vi.stubGlobal('fetch', f)
  renderStatus()
  expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
  await act(async () => {
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await waitFor(() => expect(goiThu).toBeGreaterThan(2))
  await choLang(() => goiThu)
  return f
}

describe('/status', () => {
  it('nút sao chép đưa đúng danh sách tên đơn vị chưa nộp vào clipboard', async () => {
    moiApi()
    const viet = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: viet } })
    renderStatus()
    await userEvent.click(await screen.findByRole('button', { name: /Sao chép danh sách chưa nộp/ }))
    expect(viet).toHaveBeenCalledWith('PTSC Đình Vũ\nPTSC Quảng Ngãi')
    expect(await screen.findByText('Đã sao chép 2 đơn vị')).toBeTruthy()
  })

  // task-26-fix-1.md Q7 [NHẸ]: `writeText` reject (mất focus tài liệu, ngữ cảnh không bảo mật,
  // người dùng chặn quyền — chế độ hỏng CÓ TÀI LIỆU, không phải tình huống bịa) trước bản vá này im
  // lặng hoàn toàn: không toast, không báo lỗi, một unhandled rejection quan sát được ngay trong
  // Vitest (`useCopyMissing.ts` đã `await` nhưng nơi gọi `onClick={() => saoChep(...)}` vứt bỏ
  // Promise). Ca này khoá: người dùng phải thấy MỘT toast báo lỗi, không im lặng.
  it('Q7: clipboard bị từ chối — hiện toast báo lỗi, không im lặng và không unhandled rejection', async () => {
    moiApi()
    const viet = vi.fn().mockRejectedValue(new Error('không có quyền clipboard'))
    vi.stubGlobal('navigator', { clipboard: { writeText: viet } })
    renderStatus()
    await userEvent.click(await screen.findByRole('button', { name: /Sao chép danh sách chưa nộp/ }))
    expect(await screen.findByText('Không sao chép được, thử lại')).toBeTruthy()
  })

  // C2 (task-26-carry.md): thay hai khẳng định className-mù của brief bằng resolveCascadeWinner.
  it('chip viền rỗng = nạp từ file, chip đặc = nộp sống', async () => {
    moiApi()
    renderStatus()
    const o1 = await screen.findByTestId('o-U01-2026-06') // approved + seed -> outline
    expect(resolveCascadeWinner(o1.className, 'background-color')).toBe('bg-transparent')
    const o2 = screen.getByTestId('o-U22-2026-08') // approved + live -> KHÔNG outline
    expect(resolveCascadeWinner(o2.className, 'background-color')).not.toBe('bg-transparent')
  })

  // task-26-fix-1.md Q5 (Phần D2 báo cáo soát, đối chiếu NGUYÊN VĂN với status.html gốc — dòng
  // 12: `<span class="chip c-ok c-seed">Đã duyệt</span> viền rỗng = nạp từ file tổng hợp ·
  // <span class="chip c-ok">Đã duyệt</span> đặc = nộp trên hệ thống · …`): nửa ĐẦU dòng "Chú giải"
  // mockup là chìa khoá DUY NHẤT trên toàn màn cho ký hiệu viền rỗng/đặc — bỏ nó là mất thông tin
  // thật (KIND_BG.missing của Chip.tsx cũng bg-transparent, nên có HAI loại chip nền trong suốt
  // trên màn, chỉ khác màu viền, không gì giải thích nếu thiếu dòng này). Khẳng định giữ ĐÚNG chữ
  // "viền rỗng"/"đặc" (không chỉ dấu "="): đây là TÊN của ký hiệu, thiếu tên thì người xem còn phải
  // tự đoán "=" đang nói về thuộc tính nào. Nửa sau (liệt màu trạng thái) vẫn ĐÚNG là bỏ — không ca
  // nào đòi lại nó.
  it('Q5: hiện lại câu giải thích viền rỗng = nạp từ file, đặc = nộp trên hệ thống', async () => {
    moiApi()
    renderStatus()
    expect(await screen.findByText(/viền rỗng = nạp từ file tổng hợp/)).toBeTruthy()
    expect(screen.getByText(/đặc = nộp trên hệ thống/)).toBeTruthy()
  })

  // task-26-fix-2.md R2: Q5 (trên) chỉ đọc CHỮ — người soát đảo/bỏ/đổi kind hai chip chú giải mà
  // 697/697 vẫn xanh, vì không ca nào đọc CHÍNH CÁI CHIP. Khoá bằng cách đo `className` (qua
  // resolveCascadeWinner, cùng kỹ thuật người soát dùng ở Phần C-2 báo cáo soát) của hai chip chú
  // giải trùng khít chip tương ứng thật trong lưới, trên cả hai thuộc tính cascade quyết định
  // outline (background-color VÀ border-color — thiếu border-color thì đổi outline↔đặc mà giữ
  // nguyên nền trong suốt vẫn lọt). `within(chuGiai)` khoanh đúng phạm vi, tách khỏi chip "Đã duyệt"
  // trùng chữ trong lưới.
  it('R2: chip chú giải KHÔNG vẽ sai ký hiệu — className trùng khít chip tương ứng trong lưới', async () => {
    moiApi()
    renderStatus()
    await screen.findByText('PTSC Đình Vũ')
    const chuGiai = screen.getByTestId('chu-giai')
    const [chipRong, chipDac] = within(chuGiai).getAllByText('Đã duyệt')
    const oRong = screen.getByTestId('o-U01-2026-06') // approved + seed -> outline
    const oDac = screen.getByTestId('o-U22-2026-08') // approved + live -> đặc
    expect(resolveCascadeWinner(chipRong.className, 'background-color')).toBe(
      resolveCascadeWinner(oRong.className, 'background-color'),
    )
    expect(resolveCascadeWinner(chipRong.className, 'border-color')).toBe(
      resolveCascadeWinner(oRong.className, 'border-color'),
    )
    expect(resolveCascadeWinner(chipDac.className, 'background-color')).toBe(
      resolveCascadeWinner(oDac.className, 'background-color'),
    )
    expect(resolveCascadeWinner(chipDac.className, 'border-color')).toBe(
      resolveCascadeWinner(oDac.className, 'border-color'),
    )
  })

  // task-26-fix-4.md T4 [M-43]: hoán CHỮ hai vế của dòng chú giải ("viền rỗng" ↔ "đặc") mà giữ
  // nguyên hai chip → 718/718 vẫn xanh. Dòng này là chìa khoá DUY NHẤT trên toàn màn cho ký hiệu
  // outline/đặc, nên nó có thể dạy NGƯỢC hoàn toàn mà bộ test im lặng: ca Q5 chỉ đọc CHỮ, ca R2 và
  // ca tuyệt đối cũ chỉ đọc CHIP — không ca nào đọc QUAN HỆ chip ↔ chữ đứng ngay cạnh nó, mà chính
  // quan hệ đó mới là thứ dòng chú giải sinh ra để nói. Ca này đọc đúng quan hệ: với TỪNG chip, chữ
  // đứng NGAY SAU nó (nextSibling) phải là vế nói về đúng ký hiệu của chính chip đó.
  it('T4/[M-43]: chú giải nối ĐÚNG chip với chữ đứng cạnh — chip viền rỗng trước chữ "viền rỗng", chip đặc trước chữ "đặc"', async () => {
    moiApi()
    renderStatus()
    await screen.findByText('PTSC Đình Vũ')
    const chuGiai = screen.getByTestId('chu-giai')
    const [chipTruoc, chipSau] = within(chuGiai).getAllByText('Đã duyệt')
    expect(resolveCascadeWinner(chipTruoc.className, 'background-color')).toBe('bg-transparent')
    expect(chipTruoc.nextSibling?.textContent).toMatch(/^\s*viền rỗng/)
    expect(resolveCascadeWinner(chipSau.className, 'background-color')).not.toBe('bg-transparent')
    expect(chipSau.nextSibling?.textContent).toMatch(/^\s*đặc/)
  })

  it('is_late hiện Đã nộp (muộn)', async () => {
    moiApi()
    renderStatus()
    expect(await screen.findByText('Đã nộp (muộn)')).toBeTruthy()
  })

  // C8 (task-26-carry.md): report_id nay có ở backend — ô ĐÃ nộp là <a> thật (khoá ở ca điều
  // hướng bên dưới), nên "closest('a') === null" ở đây khẳng định thật, không mù.
  it('ô Chưa nộp không click được', async () => {
    moiApi()
    renderStatus()
    const o = await screen.findByTestId('o-U22-2026-09')
    expect(o.getAttribute('aria-disabled')).toBe('true')
    expect(o.closest('a')).toBeNull()
  })

  // Tự phát hiện qua mutation-test (khuôn M-51, Dashboard.test.tsx/task-25 — carry C1 cùng họ bug
  // với carry C8 ở đây): tự mutate `cell.report_id === null` (StatusGrid.tsx) thành
  // `cell.state === null` rồi chạy lại CẢ FILE này — 24/24 ca cũ vẫn xanh, vì mọi cell trong
  // DEFAULT_UNITS có report_id/state LUÔN cùng null hoặc cùng khác null (đúng thật với dữ liệu
  // backend hiện tại — hai cột cùng ra từ một hàng Report outer-join), nên không ca nào phân biệt
  // được nếu OTrangThai lỡ đổi sang đọc `state`. Dựng MỘT ô lệch cố ý (state khác null, report_id
  // null — không thể xảy ra thật từ backend hiện tại, nhưng đúng NGUỒN CHÂN LÝ carry C8 đòi) để
  // khoá quyết định đó — lỗ phủ test thuần tuý, mã sản phẩm (đã viết theo report_id) vốn đã đúng.
  it('carry C8: state khác null nhưng report_id null thì Ô VẪN không bấm được', async () => {
    const donViLa: StatusUnit[] = [
      {
        code: 'U99',
        name: 'Đơn vị lạ',
        cells: [o('2026-06', 'approved', 'seed', false, null)],
      },
    ]
    moiApi({
      periods: [{ period_key: '2026-06', is_open: true }],
      trangThai: { periods: ['2026-06'], units: donViLa },
    })
    renderStatus()
    const o1 = await screen.findByTestId('o-U99-2026-06')
    expect(o1.getAttribute('aria-disabled')).toBe('true')
    expect(o1.closest('a')).toBeNull()
  })

  // task-26-fix-1.md Q4: HAI nguồn chân lý "chưa nộp" trên CÙNG một trang trước bản vá này —
  // StatusGrid.tsx dùng report_id (carry C8, ca ngay trên), donViChuaNop (Status.tsx) lại dùng
  // state. Hai vị từ luôn trùng ở dữ liệu THẬT (cùng ra từ một hàng Report outer-join) nên không ca
  // cũ nào phân biệt được — dựng lại đúng cảnh lệch cố ý của ca C8 trên (state khác null, report_id
  // null) nhưng ở kỳ ĐANG MỞ: trước bản vá, `state==='approved'` khiến donViChuaNop LOẠI đơn vị
  // này, nút Sao chép còn không hiện (donViChuaNop.length === 0). Sau bản vá, report_id null khiến
  // nó VẪN nằm trong danh sách — cùng nguồn chân lý report_id với lưới, khớp đúng những gì lưới hiện
  // ("Chưa nộp, không bấm được").
  it('Q4: report_id null nhưng state khác null ở kỳ đang mở — đơn vị VẪN nằm trong danh sách Sao chép (cùng nguồn chân lý report_id với lưới)', async () => {
    const donViLa: StatusUnit[] = [
      {
        code: 'U99',
        name: 'Đơn vị lạ',
        cells: [o('2026-06', 'approved', 'seed', false, null)],
      },
    ]
    const viet = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: viet } })
    moiApi({
      periods: [{ period_key: '2026-06', is_open: true }],
      trangThai: { periods: ['2026-06'], units: donViLa },
    })
    renderStatus()
    await userEvent.click(await screen.findByRole('button', { name: /Sao chép danh sách chưa nộp/ }))
    expect(viet).toHaveBeenCalledWith('Đơn vị lạ')
  })

  it('KHÔNG có cột Nộp muộn và KHÔNG có nút xuất file', async () => {
    moiApi()
    renderStatus()
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.queryByText(/Nộp muộn/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Xuất|Excel|CSV/ })).toBeNull()
  })

  it('dòng cuối là Tổng theo kỳ', async () => {
    moiApi()
    renderStatus()
    const dong = await screen.findAllByRole('row')
    expect(dong[dong.length - 1].textContent).toContain('Tổng theo kỳ')
  })

  // Tự phát hiện qua mutation-test: tự mutate tongTheoKy (StatusGrid.tsx) bỏ hẳn
  // `.filter((n) => (dem.get(n.state) ?? 0) > 0)` — ca "dòng cuối là Tổng theo kỳ" trên chỉ kiểm
  // .textContent CÓ CHỨA "Tổng theo kỳ" (tên dòng), không kiểm NỘI DUNG con số từng ô, nên 25/25 ca
  // cũ vẫn xanh dù ô kỳ này sẽ hiện đủ "4 duyệt · 0 nộp · 1 nháp · 0 trả lại · 0 chưa" thay vì đúng
  // "4 duyệt · 1 nháp" NGẮN GỌN (mockup: "22/22 duyệt" — không liệt nhóm rỗng). Đọc theo ÁNH XẠ tiêu
  // đề kỳ (carry C12 mục 2, không theo chỉ số cột cứng).
  // task-26-fix-2.md R6: tên + đoạn trên từng khẳng định kỳ 2026-06 "toàn đã duyệt" / kết quả ĐÚNG
  // DUY NHẤT là "4 duyệt" — SAI kể từ khi P05 (draft ở 2026-06, task-26-fix-1.md Q6) vào
  // DEFAULT_UNITS: U01/U05/U22/U23 approved (4) + P05 draft (1), nên nhóm khác 0 ở kỳ này là HAI,
  // không phải một — tên/chú thích nói dối so với khẳng định thật `'4 duyệt · 1 nháp'` bên dưới. Sửa
  // lại cho khớp; giá trị của ca (khoá đúng chỉ-liệt-nhóm-khác-0, không phải chỉ-một-nhóm) không đổi
  // — "0 nộp"/"0 trả lại"/"0 chưa" vẫn đúng là ba nhóm phải VẮNG MẶT ở kỳ này.
  it('dòng Tổng theo kỳ chỉ liệt nhóm khác 0 — kỳ 06/2026 (4 duyệt + 1 nháp/P05) không kèm "0 nộp"/"0 trả lại"/"0 chưa"', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dongTong = screen.getByText('Tổng theo kỳ').closest('tr')!
    const oCells = within(dongTong).getAllByRole('cell').map((c) => c.textContent)
    expect(oCells[tieuDe.indexOf('06/2026')]).toBe('4 duyệt · 1 nháp')
  })

  // Tự phát hiện qua mutation-test: tự mutate thứ tự khai NHOM_TONG (StatusGrid.tsx, đổi chỗ
  // 'submitted' lên trước 'approved') — ca trên (kỳ 06/2026, CHỈ một nhóm 'approved') không phân
  // biệt được thứ tự nối chuỗi khi chỉ có MỘT nhóm khác 0. Kỳ 2026-08 trong DEFAULT_UNITS có HAI
  // nhóm cùng khác 0 (U01/U22/U23 'approved', U05 'submitted') — đúng ca cần để khoá thứ tự nối
  // "duyệt" TRƯỚC "nộp" (khớp mockup: duyệt, nộp, nháp, trả lại, chưa).
  it('dòng Tổng theo kỳ nối ĐÚNG thứ tự "duyệt" trước "nộp" khi một kỳ có cả hai nhóm', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dongTong = screen.getByText('Tổng theo kỳ').closest('tr')!
    const oCells = within(dongTong).getAllByRole('cell').map((c) => c.textContent)
    // U01 duyệt(seed), U05 nộp(live,muộn), U22 duyệt(live), U23 duyệt(seed), P05 nháp -> 3 duyệt ·
    // 1 nộp · 1 nháp
    expect(oCells[tieuDe.indexOf('08/2026')]).toBe('3 duyệt · 1 nộp · 1 nháp')
  })

  // task-26-fix-1.md Q6: KHÔNG ca nào trước bản vá này đọc cột "kỳ đang mở" (09/2026) của dòng Tổng
  // — đúng cột người xem demo nhìn nhiều nhất. Đột biến Đ10 (đổi nhãn nhóm 'chưa' thành rác) SỐNG vì
  // lẽ đó: 06/2026 và 08/2026 (hai cột duy nhất có ca trước đây) không đơn vị nào null ở đó, nên
  // nhóm 'chưa' chưa từng xuất hiện trong bất kỳ khẳng định nào. Ca này khoá đúng cột đó — CHỈ BỐN
  // nhóm khác 0 ở cột 09/2026 (P05 'trả lại' mới thêm đứng vào đúng vị trí thứ tư theo NHOM_TONG;
  // 'draft'/nháp KHÔNG xuất hiện ở cột này, DEFAULT_UNITS không có đơn vị nào 'draft' ở 09/2026) —
  // task-26-fix-2.md R5: bản trước ghi nhầm "ĐỦ NĂM nhóm", đã sửa; ca ĐỦ NĂM nhóm thật (khoá cả thứ
  // tự draft ↔ returned, chưa ai khoá trước bản vá này) nằm riêng ngay dưới, dữ liệu tự dựng cô lập.
  it('Q6: dòng Tổng theo kỳ ở CỘT KỲ ĐANG MỞ (09/2026) — đủ cả "trả lại" và "chưa", đúng thứ tự NHOM_TONG', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dongTong = screen.getByText('Tổng theo kỳ').closest('tr')!
    const oCells = within(dongTong).getAllByRole('cell').map((c) => c.textContent)
    // U01 duyệt, U05 nộp, U22 chưa, U23 chưa, P05 trả lại -> 1 duyệt · 1 nộp · 1 trả lại · 2 chưa
    expect(oCells[tieuDe.indexOf('09/2026')]).toBe('1 duyệt · 1 nộp · 1 trả lại · 2 chưa')
  })

  // task-26-fix-2.md R5: ca Q6 (trên) chỉ có BỐN nhóm khác 0 ở cột nó khoá — 'draft' vắng mặt, nên
  // thứ tự draft ↔ returned trong NHOM_TONG (StatusGrid.tsx) CHƯA từng bị bất kỳ ca nào kiểm. Ca này
  // tự dựng MỘT kỳ với ĐỦ NĂM nhóm cùng khác 0 (dữ liệu cô lập — không đụng DEFAULT_UNITS, tránh vỡ
  // các ca khác đang dựa vào đúng 5 đơn vị/vị trí hàng của nó), khoá ĐÚNG thứ tự NHOM_TONG trọn vẹn.
  it('R5: dòng Tổng theo kỳ — ĐỦ NĂM nhóm cùng khác 0, đúng thứ tự NHOM_TONG trọn vẹn (kể cả draft ↔ returned)', async () => {
    const unitsNamNhom: StatusUnit[] = [
      { code: 'X1', name: 'X1', cells: [o('2026-06', 'approved', 'seed', false, 91)] },
      { code: 'X2', name: 'X2', cells: [o('2026-06', 'submitted', 'live', false, 92)] },
      { code: 'X3', name: 'X3', cells: [o('2026-06', 'draft', 'live', false, 93)] },
      { code: 'X4', name: 'X4', cells: [o('2026-06', 'returned', 'live', false, 94)] },
      { code: 'X5', name: 'X5', cells: [o('2026-06', null, null, null, null)] },
    ]
    moiApi({
      periods: [{ period_key: '2026-06', is_open: true }],
      trangThai: { periods: ['2026-06'], units: unitsNamNhom },
    })
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dongTong = screen.getByText('Tổng theo kỳ').closest('tr')!
    const oCells = within(dongTong).getAllByRole('cell').map((c) => c.textContent)
    expect(oCells[tieuDe.indexOf('06/2026')]).toBe('1 duyệt · 1 nộp · 1 nháp · 1 trả lại · 1 chưa')
  })

  // ---- Ngoài brief — carry C6/C7: from/to suy từ GET /templates/FM01/periods, không khoá cứng.

  it('dòng phạm vi hiện đúng kỳ đầu/kỳ đang mở theo dữ liệu (carry C7)', async () => {
    moiApi()
    renderStatus()
    expect(
      await screen.findByText('Từ 06/2026 (kỳ đầu có dữ liệu) đến 09/2026 (kỳ đang mở)'),
    ).toBeTruthy()
  })

  it('dòng phạm vi KHÔNG khoá cứng 06/2026-09/2026 — đổi dữ liệu thì đổi theo (carry C7)', async () => {
    const periodsKhac = [
      { period_key: '2026-01', is_open: false },
      { period_key: '2026-02', is_open: true },
    ]
    moiApi({ periods: periodsKhac, trangThai: { periods: periodsKhac.map((p) => p.period_key), units: [] } })
    renderStatus()
    expect(
      await screen.findByText('Từ 01/2026 (kỳ đầu có dữ liệu) đến 02/2026 (kỳ đang mở)'),
    ).toBeTruthy()
  })

  it('GET /status nhận from/to suy từ GET /templates/FM01/periods — "kỳ đang mở" là kỳ CUỐI có is_open=true, không phải kỳ ĐẦU (carry C7)', async () => {
    const f = moiApi() // PERIODS: 08 VÀ 09 cùng is_open=true — phải chọn 09, không phải 08
    renderStatus()
    await waitFor(() => {
      expect(
        f.mock.calls.some(([u]) => String(u).includes('/status?template=FM01&from=2026-06&to=2026-09')),
      ).toBe(true)
    })
  })

  it('gọi đúng GET /templates/FM01/periods (không khoá mã mẫu khác)', async () => {
    const f = moiApi()
    renderStatus()
    await waitFor(() => {
      expect(f.mock.calls.some(([u]) => String(u).includes('/templates/FM01/periods'))).toBe(true)
    })
  })

  // ---- carry C12 mục 3: FE không tự sắp lại — giữ ĐÚNG thứ tự backend trả về.

  it('bảng giữ ĐÚNG thứ tự backend trả về, FE không tự sort lại theo mã đơn vị (carry C12 mục 3)', async () => {
    const unitsLech: StatusUnit[] = [
      { code: 'U22', name: 'PTSC Đình Vũ', cells: DEFAULT_UNITS[2].cells },
      { code: 'U01', name: 'PTSC Miền Trung', cells: DEFAULT_UNITS[0].cells },
    ]
    moiApi({ trangThai: { periods: DEFAULT_STATUS.periods, units: unitsLech } })
    renderStatus()
    const dong = await screen.findAllByRole('row')
    // dong[0] = tiêu đề, dong[1] = U22 (mã LỚN hơn nhưng đứng TRƯỚC vì backend trả trước)
    expect(within(dong[1]).getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(within(dong[2]).getByText('PTSC Miền Trung')).toBeTruthy()
  })

  // ---- carry C12 mục 2: đọc theo ÁNH XẠ tiêu đề kỳ, không theo chỉ số cột cứng.

  it('đọc đúng theo tiêu đề kỳ (ánh xạ), không theo chỉ số cột cứng — chặn hoán vị cột kỳ (carry C12 mục 2)', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dong = screen.getByText('PTSC Thanh Hoá').closest('tr')!
    const oCells = within(dong).getAllByRole('cell').map((c) => c.textContent)
    const theo = (ky: string) => oCells[tieuDe.indexOf(ky)]
    // U05: 06,07 = Đã duyệt; 08 = Đã nộp (muộn); 09 = Đã nộp (không muộn)
    expect(theo('06/2026')).toBe('Đã duyệt')
    expect(theo('07/2026')).toBe('Đã duyệt')
    expect(theo('08/2026')).toBe('Đã nộp (muộn)')
    expect(theo('09/2026')).toBe('Đã nộp')
  })

  // task-26-fix-1.md Q6: đột biến Đ9 (bỏ 'returned' khỏi kindTrangThai — StatusGrid.tsx) SỐNG vì
  // không ca nào trước bản vá này render một ô 'returned': hậu quả thật của Đ9 là ô hiện SAI chip
  // "Chưa nộp" trong khi VẪN bấm được (report_id khác null — hai cơ chế độc lập, kindTrangThai chỉ
  // quyết định NHÃN, report_id quyết định CLICK được hay không). Ca này khoá cả hai cùng lúc trên
  // ĐÚNG một ô: nhãn phải là "Trả lại" (không phải "Chưa nộp") VÀ ô đó phải là <a> thật.
  it('Q6: ô "Trả lại" hiện đúng nhãn (không lẫn "Chưa nộp") và VẪN bấm được', async () => {
    moiApi()
    renderStatus()
    const tieuDe = (await screen.findAllByRole('columnheader')).map((h) => h.textContent)
    const dong = screen.getByText('Ban dự án Lô B').closest('tr')!
    const oCells = within(dong).getAllByRole('cell').map((c) => c.textContent)
    const theo = (ky: string) => oCells[tieuDe.indexOf(ky)]
    expect(theo('06/2026')).toBe('Nháp')
    expect(theo('07/2026')).toBe('Nháp')
    expect(theo('08/2026')).toBe('Nháp')
    expect(theo('09/2026')).toBe('Trả lại')
    const oTraLai = screen.getByTestId('o-P05-2026-09')
    expect(oTraLai.closest('a')).not.toBeNull()
    expect(oTraLai.getAttribute('aria-disabled')).not.toBe('true')
  })

  // ---- Ba ca "số đo" brief Step 2 — task-26-fix-1.md Q8/[B-8]: TÊN CŨ ("rộng đúng 260px", "cao
  // đúng 40px") tự xưng là số đo BỐ CỤC, nhưng jsdom KHÔNG có layout engine — ba ca này chỉ đọc
  // được CHUỖI `className` có chứa đúng utility hay không (`w-[260px]`/`h-10`/…), không đọc được
  // pixel THẬT trên màn hình (getBoundingClientRect trong jsdom luôn trả 0). Khác tình huống C2 của
  // Chip (outline+kind cộng dồn hai utility CÙNG thuộc tính, className.toContain hoá mù vì utility
  // thắng cuối mới là cái thật thắng) — ở đây mỗi phần tử chỉ có ĐÚNG MỘT utility mỗi thuộc tính
  // width/height nên đọc chuỗi không mù theo kiểu đó, nhưng vẫn KHÔNG PHẢI đo bố cục thật. Đổi tên
  // đúng thứ ba ca này THẬT SỰ khẳng định, để không ai đọc tên rồi tưởng bố cục đã có người canh —
  // Task 27 (Playwright) sở hữu việc đo pixel thật, không sửa thành ca thật ở vòng này.

  it('className cột Đơn vị chứa w-[260px]/sticky/left-0 (brief Step 2 — CHỈ đọc chuỗi class, KHÔNG đo bố cục thật, xem Task 27)', async () => {
    moiApi()
    renderStatus()
    const th = await screen.findByRole('columnheader', { name: 'Đơn vị' })
    expect(th.className).toContain('w-[260px]')
    expect(th.className).toContain('sticky')
    expect(th.className).toContain('left-0')
  })

  it('className mỗi cột kỳ chứa w-[104px] (brief Step 2 — CHỈ đọc chuỗi class, KHÔNG đo bố cục thật, xem Task 27)', async () => {
    moiApi()
    renderStatus()
    const th = await screen.findByRole('columnheader', { name: '06/2026' })
    expect(th.className).toContain('w-[104px]')
  })

  it('className dòng lưới chứa h-10 (brief Step 2 — CHỈ đọc chuỗi class, KHÔNG đo bố cục thật, xem Task 27)', async () => {
    moiApi()
    renderStatus()
    const dong = (await screen.findByText('PTSC Miền Trung')).closest('tr')!
    expect(within(dong).getAllByRole('cell')[0].className).toContain('h-10')
  })

  // ---- Điều hướng: ô ĐÃ nộp phải là <a> thật, dẫn đúng /reports/:id (bù cho carry C8).

  it('bấm ô đã có báo cáo điều hướng SPA thật tới /reports/:id đúng report_id', async () => {
    moiApi()
    renderStatus()
    await userEvent.click(await screen.findByTestId('o-U01-2026-06'))
    expect((await screen.findByTestId('dich-den')).textContent).toBe('/reports/601')
  })

  // ---- Nút sao chép ẩn khi không có gì để sao chép (quyết định riêng, không có test brief).

  it('không có đơn vị nào chưa nộp ở kỳ đang mở: KHÔNG hiện nút sao chép', async () => {
    const unitsDuNop: StatusUnit[] = DEFAULT_UNITS.map((u) => ({
      ...u,
      cells: u.cells.map((c) =>
        c.period_key === '2026-09' ? o('2026-09', 'approved', 'live', false, 9999) : c,
      ),
    }))
    moiApi({ trangThai: { periods: DEFAULT_STATUS.periods, units: unitsDuNop } })
    renderStatus()
    await screen.findByText('PTSC Đình Vũ')
    expect(screen.queryByRole('button', { name: /Sao chép danh sách chưa nộp/ })).toBeNull()
  })

  // task-26-fix-1.md Q2 — `is_open` là cột boolean quản trị đặt tay (`templates.py:113`), "không
  // kỳ nào đang mở" là một trạng thái CSDL BÌNH THƯỜNG (giữa hai kỳ, hoặc mẫu vừa seed chưa mở kỳ
  // nào) chứ không phải tình huống bịa. `kyDangMo` trả `undefined` -> `den` `undefined` -> `enabled`
  // của `tk` là `false` -> `/status` KHÔNG BAO GIỜ được gọi -> `tk.data` mãi `undefined` -> nhánh
  // skeleton quay MÃI, không một chữ giải thích. Phải hiện câu tiếng Việt nói đúng chuyện gì xảy ra.
  it('không kỳ nào đang mở: hiện câu giải thích, KHÔNG quay skeleton vĩnh viễn (Q2/[B-2])', async () => {
    const periodsChuaMo = [
      { period_key: '2026-06', is_open: false },
      { period_key: '2026-07', is_open: false },
    ]
    const f = moiApi({ periods: periodsChuaMo })
    renderStatus()
    expect(await screen.findByText('Chưa có kỳ nào đang mở để hiển thị tình trạng nộp')).toBeTruthy()
    expect(screen.queryByTestId('skeleton')).toBeNull()
    // task-26-fix-3.md S4/[N-11]: khoá THẬT câu chú thích trên "`/status` KHÔNG BAO GIỜ được gọi"
    // — trước bản vá này không có khẳng định nào cho câu đó, nên ca vẫn xanh dù `enabled` mất vế
    // `den !== undefined` (query VẪN bắn `/status?...to=undefined`; "chưa có kỳ mở" khi đó chỉ
    // NHẤP NHÁY rồi bị lưới đè lên ngay sau — `findByText` bắt được trạng thái TRUNG GIAN đó, không
    // phân biệt được với trạng thái CUỐI). Đếm số lần gọi mới khoá đúng: `tk` phải chưa từng bắn.
    expect(f.mock.calls.some(([u]) => String(u).includes('/status?'))).toBe(false)
  })

  // ---- Tải/lỗi: khuôn ReportDetail.tsx/Dashboard.tsx, carry C13.

  // task-26-fix-4.md T5 [M-39]: bỏ vế `den === undefined` khỏi nhánh "không kỳ mở" → 718/718 vẫn
  // xanh. Hậu quả thật: giữa lúc `/periods` đã về mà `/status` còn bay (mạng chậm), màn hiện "Chưa
  // có kỳ nào đang mở để hiển thị tình trạng nộp" trong khi kỳ 09/2026 đang mở hẳn hoi — một câu nói
  // dối chớp trên màn, và ở cảnh cửa-thứ-bảy thì nó ở lại luôn. Ca `Q2/[B-2]` không bắt vì ở đó
  // `den` THẬT SỰ `undefined`; ca "lần tải đầu tiên CÓ hiện skeleton" không bắt vì nó chặn CẢ HAI
  // endpoint (nên `ky.data` cũng `undefined`). Thiếu đúng một cảnh, chính là cảnh này.
  it('T5/[M-39]: /periods về TRƯỚC, /status còn treo — hiện SKELETON, không phải "Chưa có kỳ nào đang mở"', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      if (url.includes('/status?')) {
        return new Promise<never>(() => {})
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    // Mốc: `/status` ĐÃ được bắn ⇒ `ky.data` đã về và `den` đã suy ra được (09/2026 đang mở).
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('/status?'))).toBe(true))
    expect(await screen.findByTestId('skeleton')).toBeTruthy()
    expect(screen.queryByText('Chưa có kỳ nào đang mở để hiển thị tình trạng nộp')).toBeNull()
  })

  // task-26-fix-4.md T7 [C-1b]: `/status` trả `{periods: [], units: []}` với mã 200 — BE trục trặc,
  // hoặc mẫu chưa có kỳ nào — làm `data.periods[0]` là `undefined`, `formatPeriod` gọi `.split` trên
  // `undefined` và NỔ TypeError. Không có ErrorBoundary nào trong `src/` nên đó là TRẮNG MÀN: kiểu
  // hỏng tệ nhất trong danh sách, đo được ở CẢ vòng 2 lẫn vòng 3 mà hai lần đều xếp "không chặn".
  // Mốc đọc là `chu-giai` — nó CHỈ có ở thân render chính, nên tới được nó nghĩa là thân render đã
  // chạy trọn vẹn, không ném (nếu còn lỗi thì ca đỏ ngay tại đây).
  it('T7/[C-1b]: /status trả 200 với periods RỖNG — trang vẫn vẽ được, không nổ trắng màn (ẩn dòng phạm vi)', async () => {
    moiApi({ trangThai: { periods: [], units: [] } })
    renderStatus()
    expect(await screen.findByTestId('chu-giai')).toBeTruthy()
    expect(screen.queryByText(/kỳ đầu có dữ liệu/)).toBeNull()
  })

  // task-26-fix-6.md W4 [V-40] — MẶT ÂM của cảnh periods-rỗng. Ca T7 ngay trên chỉ hỏi "có vẽ được
  // không"; nó không hỏi **màn hình rỗng ấy có được miễn luật báo-dữ-liệu-cũ không**. Câu trả lời là
  // KHÔNG: một bảng trống mà im lặng là màn hình mơ hồ nhất trong cả trang — người dùng không phân
  // biệt được "kỳ này chưa ai nộp" với "vừa có thứ hỏng". Cảnh: `/status` trả 200 THÂN RỖNG ngay từ
  // đầu (nên `duLieuCuoi.current` không bao giờ được gán — đúng theo bản vá W1), rồi `/periods` hỏng
  // ở NỀN ⇒ `loi` khác null ⇒ băng PHẢI hiện. Ca này cũng là tấm chắn cho chính bản vá W1: một bản
  // sau "gọn gàng hoá" bằng `if (data.periods.length === 0) return <skeleton/>` sẽ đỏ ngay tại đây.
  it('W4/[V-40]: periods RỖNG + lỗi nền — bảng trống KHÔNG được im lặng, băng vẫn phải hiện', async () => {
    let luotKy = 0
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        luotKy++
        return luotKy === 1
          ? Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      if (url.includes('/status?')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ periods: [], units: [] }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByTestId('chu-giai')).toBeTruthy()
    expect(screen.queryByTestId('bang-du-lieu-cu')).toBeNull() // chưa hỏng gì thì chưa được báo

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(luotKy).toBeGreaterThan(1))
    await choLang(() => f.mock.calls.length)

    expect(screen.getByTestId('chu-giai')).toBeTruthy() // vẫn là trang, không bị màn thay thế nuốt
    kiemChuBang(screen.getByTestId('bang-du-lieu-cu'))
  })

  it('lần tải đầu tiên CÓ hiện skeleton trước khi dữ liệu về', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
    renderStatus()
    expect(await screen.findByTestId('skeleton')).toBeTruthy()
  })

  // C13 mục 1 — nguồn 1 (periods) hỏng: /status KHÔNG BAO GIỜ được gọi (enabled phụ thuộc periods).
  it('CHỈ /templates/FM01/periods hỏng: hiện InlineError, /status chưa từng được gọi (C13 mục 1)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
    expect(f.mock.calls.some(([u]) => String(u).includes('/status?'))).toBe(false)
  })

  // C13 mục 1 — nguồn 2 (status) hỏng, periods lành.
  it('CHỈ GET /status hỏng (periods lành): vẫn hiện InlineError (C13 mục 1)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      if (url.includes('/status?')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
  })

  it('lỗi tải hiện InlineError kèm nút Thử lại; bấm Thử lại gọi lại CẢ HAI endpoint', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Không tải được dữ liệu')).toBeTruthy()
    const dem = (u: string) => f.mock.calls.filter(([url]) => String(url).includes(u)).length
    const truocKy = dem('/templates/FM01/periods')
    const truocTrangThai = dem('/status?')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => {
      expect(dem('/templates/FM01/periods')).toBeGreaterThan(truocKy)
      expect(dem('/status?')).toBeGreaterThan(truocTrangThai)
    })
  })

  // C13 mục 2 — lỗi NỀN không được phá màn đang có dữ liệu (lớp lỗi đã cắn dự án BA lần).
  it('đang xem lưới, rời tab rồi quay lại gặp 502: TRANG VẪN CÒN, không bị thay bằng InlineError (C13 mục 2)', async () => {
    let goiThu = 0
    const f = vi.fn((url: string) => {
      goiThu++
      const laLanDau = goiThu <= 2
      if (url.includes('/templates/FM01/periods')) {
        return laLanDau
          ? Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      if (url.includes('/status?')) {
        return laLanDau
          ? Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
          : Promise.resolve({ ok: false, status: 502, json: async () => ({ detail: 'Bad gateway' }) })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(goiThu).toBeGreaterThan(2))
    // task-26-fix-5.md U2: cùng lý do với ca `S1/[H-1]` — vết đóng băng này có TỪ TRƯỚC vòng 4 ở
    // chính ca này, và vòng 4 nhân nó lên ca thứ hai. Khẳng định về HẬU QUẢ: lưới có mặt, không màn
    // hình THAY THẾ nào; không cấm nguyên văn một chuỗi có thể hợp lệ khi đứng CẠNH lưới.
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  // task-26-fix-3.md S1 + task-26-fix-4.md T1/T2 — cửa THỨ BẢY của "lỗi nền phá màn đang có dữ
  // liệu". Cảnh: đã có lưới trên màn, RỒI `/periods` đổi ở NỀN sang kỳ MỚI (quản trị mở kỳ mới —
  // việc hằng tháng) làm `queryKey` của `tk` đổi, RỒI query của queryKey MỚI đó lỗi TRƯỚC KHI kịp
  // thành công một lần. TanStack v5 chỉ áp `placeholderData`/`keepPreviousData` lúc query `pending`;
  // sang `error` thì `tk.data` rơi về `undefined` dù `keepPreviousData` vừa hiện đúng lưới cũ một
  // khoảnh khắc trước.
  //
  // BẢN TRƯỚC CỦA CA NÀY LÀ BẰNG CHỨNG RỖNG (task-26-rereview-3.md [T2], mù kiểu (a)+(b)): nó chờ
  // `goiThuPeriods > 1` — mốc chỉ chứng minh `/periods` đã về lượt hai, KHÔNG chứng minh query
  // `/status` của kỳ MỚI đã chạy xong — nên `waitFor` thoả ngay ở lần thử ĐẦU, lúc `tk` còn `pending`
  // và `placeholderData` vẫn đang giữ lưới cũ; trạng thái CUỐI không bao giờ được đọc. Khẳng định âm
  // lại chỉ canh `InlineError`, trong khi trạng thái CUỐI hồi đó là **skeleton**. Người soát chèn một
  // dòng chờ lắng 50ms là ca ĐỎ ngay trên HEAD, mã sản phẩm không đụng gì.
  // Ba thứ sửa ở ca này, và cả ba đều cần: (1) chờ đúng mốc — lượt gọi `/status` CỦA KỲ MỚI, rồi chờ
  // LẮNG cho hết cả ba lượt thử lại; (2) canh CẢ HAI màn hình thay thế (`skeleton` LẪN `InlineError`)
  // — cửa này có hai lối thoát, ca cũ chỉ bịt một; (3) chạy dưới ĐÚNG chính sách `retry` sản xuất.
  it('S1/[H-1]: /periods đổi ở NỀN sang kỳ MỚI rồi /status của kỳ MỚI lỗi — trạng thái CUỐI vẫn là LƯỚI (không skeleton, không InlineError) kèm băng báo dữ liệu cũ', async () => {
    let goiThuPeriods = 0
    let goiStatusKyMoi = 0
    const PERIODS_MOI = [...PERIODS, { period_key: '2026-10', is_open: true }]
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        goiThuPeriods++
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (goiThuPeriods === 1 ? PERIODS : PERIODS_MOI),
        })
      }
      if (url.includes('/status?')) {
        if (url.includes('to=2026-10')) {
          goiStatusKyMoi++
          return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatusRetrySanXuat()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    // Mốc ĐÚNG: `/status` của kỳ MỚI (to=2026-10) đã bắn, rồi chờ LẮNG hết cả ba lượt thử lại 5xx.
    await waitFor(() => expect(goiStatusKyMoi).toBeGreaterThan(0))
    await choLang(() => goiStatusKyMoi)

    // Trạng thái CUỐI (không phải khoảnh khắc): lưới CÒN, và không có màn hình THAY THẾ nào.
    // task-26-fix-5.md U2 — khẳng định về HẬU QUẢ, không phải phép cấm NGUYÊN VĂN một chuỗi. Bản
    // trước cấm hẳn chữ 'Không tải được dữ liệu' xuất hiện; người soát viết đúng một bản vá TỐT HƠN
    // (hiện `InlineError` ĐỨNG CẠNH lưới — lưới còn, nút Thử lại còn, người dùng được giải thích rõ
    // hơn) và ca này ĐỎ oan, cùng với ca 'C13 mục 2'. Đó là mù kiểu (d): khẳng định sống nhưng chỉ
    // bắn vào người vá đúng. Thứ ca này thật sự phải canh là "lưới có bị THAY không", nên khoá đúng
    // hai vế đó: lưới có mặt + không màn hình thay thế nào (skeleton). Mọi cách hiện lỗi mà VẪN giữ
    // lưới đều được phép đi qua.
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByTestId('skeleton')).toBeNull()
    // Giữ lưới mà IM LẶNG là một lỗi khác (người dùng đọc số cũ tưởng số mới): phải có băng nói dữ
    // liệu đang cũ + một đường thử lại. Khoá bằng testid + sự CÓ MẶT của nút, không khoá nguyên văn
    // câu chữ — để một bản vá sau đổi lời mà không bị ca này phạt (mù kiểu (d)).
    const bang = screen.getByTestId('bang-du-lieu-cu')
    expect(bang.textContent).not.toBe('')
    expect(within(bang).getByRole('button', { name: 'Thử lại' })).toBeTruthy()
    // task-26-fix-6.md W2 — vế "xa hơn" của U1(b), khoá ngay tại cảnh sinh ra nó: bản đang vẽ là dữ
    // liệu của kỳ 09, trong khi kỳ ĐANG MỞ là 10 (`/periods` vừa đổi ở nền). Dòng phạm vi tuyệt đối
    // không được gắn nhãn "(kỳ đang mở)" cho 09 — đó là nói dối đúng lúc người dùng cần biết mình
    // đang nhìn số của kỳ nào. Đột biến V-07 (`den !== undefined ? '(kỳ đang mở)' : …`) chết ở đây.
    // (`/kỳ đang mở/` KHÔNG khớp "…kỳ nào đang mở" của hai câu kia — chữ "nào" chen giữa.)
    expect(screen.queryByText(/kỳ đang mở/)).toBeNull()
  })

  // task-26-fix-1.md Q1 [CHẶN] — lớp lỗi "lỗi nền phá màn đang có dữ liệu" (carry C13 mục 2) lần
  // thứ TƯ, qua một cửa MỚI: `tu`/`den` suy từ `ky.data` rồi nhét vào `queryKey` của `tk`. Khi
  // `/templates/FM01/periods` làm mới Ở NỀN và danh sách kỳ ĐỔI (quản trị mở kỳ mới — việc hằng
  // tháng), `den` đổi -> `queryKey` của `tk` đổi -> đó là MỘT QUERY MỚI, `tk.data` thành `undefined`
  // -> rơi thẳng vào nhánh skeleton, nuốt mất lưới người dùng đang đọc. Khác C13 mục 2 (đường lỗi,
  // đã có tấm chắn `loi && chưa có dữ liệu`): đây là đường TẢI LẠI, không đi qua `loi` một chút nào.
  it('quản trị mở kỳ mới ở NỀN trong lúc người dùng đang xem: LƯỚI VẪN CÒN, không bị skeleton nuốt (Q1/[B-1])', async () => {
    let goiThu = 0
    const PERIODS_MOI = [...PERIODS, { period_key: '2026-10', is_open: true }] // kỳ mới vừa mở
    const f = vi.fn((url: string) => {
      goiThu++
      const laLanDau = goiThu <= 2
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (laLanDau ? PERIODS : PERIODS_MOI),
        })
      }
      if (url.includes('/status?')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(goiThu).toBeGreaterThan(2))
    // `den` vừa đổi 09 -> 10 (queryKey của `tk` đổi thật) — lưới PHẢI còn nguyên, không phải
    // skeleton, dù query thứ hai kỹ thuật là MỘT QUERY MỚI với cache rỗng.
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  // task-26-fix-2.md R1 [LỖI HÀNH VI] — nhánh Q2 (vòng sửa 1) là cửa THỨ NĂM của cùng lớp lỗi trên:
  // nhánh đó không hỏi `tk.data`, nên khi `/templates/FM01/periods` làm mới Ở NỀN và trả về "không
  // kỳ nào is_open", cả lưới người dùng đang đọc bị thay bằng một dòng chữ, dù `tk.data` (nhờ
  // `keepPreviousData` của Q1) vẫn còn nguyên và vẫn ĐÚNG — đó là lịch sử đã duyệt, không tự sai đi
  // chỉ vì hiện giờ không kỳ nào đang mở.
  // task-26-fix-3.md S4 điểm 1/[N-10]: bản TRƯỚC hứa HAI cảnh trong chú thích ("quản trị đóng hết kỳ
  // … HOẶC một lượt 200 thân rỗng — trục trặc BE") nhưng chỉ khoá MỘT — mở lại cửa CHỈ cho cảnh
  // "thân rỗng" vẫn 706/706 xanh. `it.each` dưới đây khoá CẢ HAI cảnh riêng biệt, không chỉ một.
  // S4 điểm 4/[N-23]: bản TRƯỚC còn khẳng định thêm "câu giải thích PHẢI VẮNG MẶT" — khẳng định ĐÓ
  // phạt NHẦM một bản vá TỐT HƠN giả định (giữ lưới VÀ hiện thêm một băng thông báo, không thay hẳn
  // cả màn) — đây đúng dạng mù kiểu (d) đã bắt ở Q3 vòng 1 (đóng băng hiện trạng, phạt người vá).
  // Bỏ khẳng định đó; chỉ khoá đúng HÀNH VI thật cần: lưới phải CÒN — không khoá CÁCH nó còn.
  it.each<[string, unknown]>([
    ['quản trị đóng hết kỳ (mọi is_open -> false)', PERIODS.map((p) => ({ ...p, is_open: false }))],
    ['một lượt 200 thân rỗng (trục trặc BE)', []],
  ])(
    'R1/[H-1]: đang xem lưới, /periods đổi ở NỀN thành "không kỳ nào mở" (%s): LƯỚI VẪN CÒN',
    async (_ten, periodsMoi) => {
      let goiThu = 0
      const f = vi.fn((url: string) => {
        goiThu++
        const laLanDau = goiThu <= 2
        if (url.includes('/templates/FM01/periods')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => (laLanDau ? PERIODS : periodsMoi),
          })
        }
        if (url.includes('/status?')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
        }
        throw new Error(`URL không lường trước: ${url}`)
      })
      vi.stubGlobal('fetch', f)
      renderStatus()
      expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

      await act(async () => {
        window.dispatchEvent(new Event('visibilitychange'))
      })
      await waitFor(() => expect(goiThu).toBeGreaterThan(2))
      expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    },
  )

  // task-26-fix-5.md U1 [LỖI HÀNH VI] — nhánh CÂM của chính luật vòng 4 vừa tự đặt ra
  // (`Status.tsx`: "giữ được lưới rồi mà IM LẶNG là một lỗi KHÁC… Lưới còn → phải nói ra là số liệu
  // đang cũ"). Ba cảnh đo được cho lưới cũ im lặng VĨNH VIỄN trong một lần mount (`enabled:false`
  // nên không lượt gọi nào tự khỏi — chỉ đổi route hoặc F5 mới thoát): quản trị đóng hết kỳ ·
  // `/periods` trả `[]` · `/periods` rỗng kèm `/status` lỗi. Ca này khoá mặt DƯƠNG của băng ở đúng
  // nhánh đó. Ca R1/[H-1] ngay trên chỉ khoá "lưới CÒN" — nó không nói gì về việc màn hình có báo
  // hay không, nên nhánh này câm suốt hai vòng mà không ca nào đỏ.
  it('U1 mặt DƯƠNG: /periods đóng hết kỳ ở NỀN — lưới CÒN nhưng KHÔNG được câm, băng PHẢI hiện', async () => {
    await dungCanhDongHetKy()
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.getByTestId('bang-du-lieu-cu')).toBeTruthy()
  })

  // task-26-fix-5.md U1, vế thứ hai: ở cảnh trên màn hình không chỉ IM — nó còn PHÁT BIỂU SAI. Dòng
  // phạm vi vẫn ghi "đến 09/2026 (kỳ đang mở)" trong khi 09/2026 vừa bị đóng, và `ky.data` là dữ
  // liệu TƯƠI (lượt `/periods` vừa về 200) nên đây không phải "cả màn đều là bản cũ" — trang đang
  // khẳng định điều mà nó VỪA BIẾT là sai. Nhãn "(kỳ đang mở)" chỉ đúng khi kỳ cuối của BẢN ĐANG VẼ
  // đúng là kỳ đang mở hiện giờ. Mặt ÂM của cùng nghĩa vụ (lượt xem bình thường VẪN phải ghi "kỳ
  // đang mở") do ca 'dòng phạm vi hiện đúng kỳ đầu/kỳ đang mở theo dữ liệu (carry C7)' giữ.
  it('U1: /periods đóng hết kỳ ở NỀN — dòng phạm vi THÔI khẳng định "kỳ đang mở"', async () => {
    await dungCanhDongHetKy()
    expect(screen.queryByText(/kỳ đang mở/)).toBeNull()
    expect(screen.getByText(/Từ 06\/2026 .* đến 09\/2026/)).toBeTruthy()
  })

  // task-26-fix-6.md W1 [CHẶN — LỖI HÀNH VI] — chuỗi "bản vá đẻ ra cửa kế tiếp" QUAY LẠI, và quay
  // lại theo đúng khuôn U3 vừa được viết ra để chống. U1 (vòng 5) không thêm một UI mới; nó làm một
  // UI CŨ — băng, kèm nút Thử lại — **với tới được ở một CẢNH MỚI** (`den === undefined`). Và không
  // ai hỏi nút đó LÀM GÌ ở cảnh mới. Hai ca U1 chỉ khẳng định băng CÓ MẶT và dòng phạm vi nói gì;
  // ca U3 bấm-nút chỉ chạy ở cảnh cả hai query đều `error` và `den` còn.
  //
  // Luật bổ sung cho luật hai-mặt: **khi một bản vá làm một UI CŨ với tới được ở một CẢNH MỚI, cảnh
  // mới đó thừa hưởng ĐỦ BỐN câu hỏi — kể cả "nút của nó làm gì".** Bốn ca dưới đây trả nợ đúng câu
  // hỏi đó cho hai cảnh U1 tạo ra.
  //
  // Cơ chế hỏng: `tk.refetch()` VẪN CHẠY dù `enabled:false` (TanStack v5), và `${den}` trong chuỗi
  // mẫu cho ra chuỗi `"undefined"` NGUYÊN VĂN trong URL.
  it('W1: bấm Thử lại ở cảnh đóng-hết-kỳ — CHỈ gọi lại /periods, KHÔNG bắn /status?…to=undefined', async () => {
    const f = await dungCanhDongHetKy()
    const dem = (u: string) => f.mock.calls.filter(([url]) => String(url).includes(u)).length
    const truocKy = dem('/templates/FM01/periods')
    const truocTrangThai = dem('/status?')
    await userEvent.click(
      within(screen.getByTestId('bang-du-lieu-cu')).getByRole('button', { name: 'Thử lại' }),
    )
    // Nút KHÔNG vô tác dụng: `/periods` PHẢI được gọi lại — đó chính là thứ có thể đổi (quản trị
    // vừa mở kỳ mới), và là lý do nút vẫn đáng có ở cảnh này.
    await waitFor(() => expect(dem('/templates/FM01/periods')).toBeGreaterThan(truocKy))
    await choLang(() => f.mock.calls.length)
    // …nhưng KHÔNG được bắn thêm một lượt `/status` nào: tham số chưa đủ để gọi.
    expect(dem('/status?')).toBe(truocTrangThai)
    expect(f.mock.calls.some(([u]) => String(u).includes('undefined'))).toBe(false)
  })

  it('W1: /periods trả [] ở NỀN rồi bấm Thử lại trên băng — LƯỚI VẪN CÒN (không bị xoá bằng MỘT cú bấm)', async () => {
    const f = await dungCanhPeriodsRong()
    // Tiền đề của cảnh: TRƯỚC khi bấm, lưới đang còn và băng đang mời bấm.
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    await userEvent.click(
      within(screen.getByTestId('bang-du-lieu-cu')).getByRole('button', { name: 'Thử lại' }),
    )
    await choLang(() => f.mock.calls.length)
    // Đường thoát DUY NHẤT màn hình mời người dùng bấm không được lấy mất chính thứ nó đang bảo vệ.
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(f.mock.calls.some(([u]) => String(u).includes('from=undefined'))).toBe(false)
  })

  // task-26-fix-6.md W1 phần 2 — chặn ĐẦU ĐỘC ref ([L-1b] vòng 4). `duLieuCuoi.current` là "bản
  // dữ liệu TỐT cuối cùng"; một thân rỗng hợp lệ (`200 {periods:[],units:[]}`) KHÔNG phải bản tốt,
  // nhưng nó `!== undefined` nên trước bản vá ref nuốt luôn, và **bản tốt không bao giờ quay lại**.
  // Cảnh ba bước dưới đây là cách DUY NHẤT quan sát được vế này (ở cùng một `queryKey`, `tk.data`
  // giữ nguyên giá trị thành công gần nhất nên không có lúc nào rơi về ref):
  //   1. lưới tốt (kỳ mở 09) · 2. nền: kỳ 10 mở, `/status` kỳ 10 trả 200 THÂN RỖNG (ref bị đầu độc
  //   nếu không chặn) · 3. nền: kỳ 11 mở, `/status` kỳ 11 LỖI ⇒ `queryKey` đổi, `tk.data` về
  //   `undefined` ⇒ rơi về ref. Phải rơi về LƯỚI TỐT, không về bản rỗng.
  it('W1: thân RỖNG 200 không được đầu độc bản-tốt-cuối-cùng — lỗi sau đó vẫn rơi về LƯỚI, không về bảng trống', async () => {
    const P10 = [...PERIODS, { period_key: '2026-10', is_open: true }]
    const P11 = [...P10, { period_key: '2026-11', is_open: true }]
    let luotPeriods = 0
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        luotPeriods++
        const than = luotPeriods === 1 ? PERIODS : luotPeriods === 2 ? P10 : P11
        return Promise.resolve({ ok: true, status: 200, json: async () => than })
      }
      if (url.includes('/status?')) {
        if (url.includes('to=2026-11')) {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Lỗi máy chủ' }) })
        }
        if (url.includes('to=2026-10')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ periods: [], units: [] }) })
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(luotPeriods).toBeGreaterThan(1))
    await choLang(() => f.mock.calls.length)

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(luotPeriods).toBeGreaterThan(2))
    await choLang(() => f.mock.calls.length)

    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
  })

  // task-26-fix-6.md W1/[V-1b] — băng nói SAI NGUYÊN NHÂN ở cảnh U1: "Không tải được số liệu mới"
  // trong khi `/periods` vừa về 200 và nói rõ KHÔNG CÒN KỲ NÀO ĐANG MỞ. Không có gì hỏng cả — đó là
  // một SỰ THẬT MỚI. Đổ cho lỗi tải là dạy người dùng đi tìm sai chỗ (mạng? máy chủ?) trong khi thứ
  // họ cần biết là kỳ đã đóng. Mặt ÂM của cùng nghĩa vụ: ở cảnh CÓ lỗi thật, băng vẫn phải nói lỗi
  // tải — ca `'U3: chữ của băng…'` giữ vế đó (nó chạy ở `dungCanhLoiNenCungKy`).
  it('W1/[V-1b]: ở cảnh không-còn-kỳ-mở, băng nói ĐÚNG nguyên nhân — không đổ cho "không tải được"', async () => {
    await dungCanhDongHetKy()
    const bang = screen.getByTestId('bang-du-lieu-cu')
    expect(within(bang).getByText(/không còn kỳ nào đang mở/i)).toBeTruthy()
    expect(within(bang).queryByText(/không tải được/i)).toBeNull()
    // Câu MỚI này cũng phải qua đủ hai mặt như câu cũ — một cảnh mới không được miễn luật W3.
    kiemChuBang(bang)
  })

  // task-26-fix-2.md R3: Q1/[B-1] (trên) mock `/status` trả CÙNG một body bất kể `to=`, nên chỉ
  // khoá được NỬA bất biến — "giữ dữ liệu cũ TRONG LÚC TẢI" — mù với vế còn lại: "đóng băng dữ liệu
  // cũ VĨNH VIỄN" (bỏ hẳn `den` khỏi queryKey của `tk` cũng làm ca Q1/[B-1] xanh — xem
  // task-26-rereview-1.md R3). Ca này cho kỳ MỚI (`to=2026-10`) một body THẬT SỰ khác (đơn vị khác
  // tên hẳn, không lẫn với DEFAULT_STATUS) và GIỮ LẠI (deferred) đúng lượt gọi đó, để đọc được CẢ
  // HAI pha: Pha 1 — lưới CŨ còn nguyên trong lúc kỳ MỚI đang tải; Pha 2 — sau khi tải xong, lưới
  // PHẢI đổi sang dữ liệu kỳ MỚI, không kẹt lại ở dữ liệu cũ.
  it('R3: đổi kỳ ở NỀN — trong lúc tải giữ lưới CŨ, tải xong đổi sang dữ liệu kỳ MỚI (không đóng băng vĩnh viễn)', async () => {
    const PERIODS_MOI = [...PERIODS, { period_key: '2026-10', is_open: true }]
    const STATUS_MOI = {
      periods: PERIODS_MOI.map((p) => p.period_key),
      units: [
        {
          code: 'U99',
          name: 'PTSC Kỳ Mới',
          cells: [
            o('2026-06', 'approved', 'seed', false, 699),
            o('2026-07', 'approved', 'seed', false, 799),
            o('2026-08', 'approved', 'seed', false, 899),
            o('2026-09', 'approved', 'seed', false, 999),
            o('2026-10', null, null, null, null),
          ],
        },
      ],
    }
    let goiThuPeriods = 0
    let daGoiStatusMoi = false
    let moKhoaStatusMoi: (() => void) | undefined
    const cho = new Promise<void>((resolve) => {
      moKhoaStatusMoi = resolve
    })
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        goiThuPeriods++
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (goiThuPeriods === 1 ? PERIODS : PERIODS_MOI),
        })
      }
      if (url.includes('/status?')) {
        if (url.includes('to=2026-10')) {
          daGoiStatusMoi = true
          return cho.then(() => ({ ok: true, status: 200, json: async () => STATUS_MOI }))
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    // Pha 1: query kỳ MỚI đã BẮT ĐẦU (đang treo, chưa mở khoá) — lưới CŨ phải còn nguyên, không
    // skeleton, chưa thấy dữ liệu kỳ mới.
    await waitFor(() => expect(daGoiStatusMoi).toBe(true))
    expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
    expect(screen.queryByText('PTSC Kỳ Mới')).toBeNull()
    expect(screen.queryByTestId('skeleton')).toBeNull()

    // Pha 2: mở khoá — lưới PHẢI đổi sang dữ liệu kỳ MỚI, không kẹt lại ở dữ liệu cũ.
    await act(async () => {
      moKhoaStatusMoi?.()
    })
    await waitFor(() => expect(screen.getByText('PTSC Kỳ Mới')).toBeTruthy())
    expect(screen.queryByText('PTSC Đình Vũ')).toBeNull()
  })

  // ---- 403 (thiếu status.view — vd. reporter gõ thẳng URL /status).

  // task-26-fix-3.md S2 [NẶNG]: luật ở đầu cụm nhánh sớm (Status.tsx) viết "CHỈ 403/404 được thay
  // VÔ ĐIỀU KIỆN" — nhưng NGOẠI LỆ duy nhất đó chưa ca nào giữ trước vòng này. Người soát áp luật
  // MÁY MÓC (thêm `&& tk.data === undefined` — hay nay `&& !tkTungCoDuLieu.current` — vào chính
  // nhánh 403) và 706/706 vẫn xanh, vì ca 403 duy nhất trong suite là 403 ở LẦN TẢI ĐẦU (`tk.data`
  // vốn đã `undefined`), nên nó thoả cả hai bản. Ca này dựng đúng cảnh S1 đòi: đã có lưới trên màn,
  // RỒI 403 tới Ở NỀN (queryKey của `tk` KHÔNG đổi — refetchOnWindowFocus, không phải chuyển kỳ) —
  // PHẢI thay cả trang, vì 403 là KẾT LUẬN (quyền không tự khỏi bằng tải lại), không phải trạng thái
  // tạm như lỗi mạng/5xx. Nếu ai đó áp luật "hỏi dữ liệu trước" cho cả 403 (rất dễ vì luật không nói
  // *làm sao* biết nhánh nào được miễn) thì ca này phải ĐỎ: dữ liệu không được phép xem sẽ vẫn còn
  // nguyên trên màn sau khi quyền đã bị rút.
  it('S2: 403 tới Ở NỀN sau khi đã có lưới (queryKey KHÔNG đổi) — vẫn thay CẢ TRANG, không MIỄN nhầm theo luật "hỏi dữ liệu trước" (403 là ngoại lệ DUY NHẤT)', async () => {
    let laLanDau = true
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      if (url.includes('/status?')) {
        if (laLanDau) {
          laLanDau = false
          return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
        }
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ detail: 'Không có quyền status.view' }),
        })
      }
      throw new Error(`URL không lường trước: ${url}`)
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.queryByText('PTSC Đình Vũ')).toBeNull())
    expect(screen.getByText('Bạn không có quyền xem tình trạng nộp này')).toBeTruthy()
  })

  it('403 (thiếu status.view) hiện đúng câu "không có quyền" kèm lối thoát, không phải InlineError chung', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      return Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Không có quyền status.view' }),
      })
    })
    vi.stubGlobal('fetch', f)
    renderStatus()
    expect(await screen.findByText('Bạn không có quyền xem tình trạng nộp này')).toBeTruthy()
    expect(screen.queryByText('Không tải được dữ liệu')).toBeNull()
    expect(screen.getByRole('link', { name: 'Về báo cáo của đơn vị' }).getAttribute('href')).toBe('/reports')
  })

  // Mirror Dashboard.test.tsx M-01: QueryClient CẤU HÌNH NHƯ BẢN THẬT (chặn retry cho 4xx ở lớp
  // queryClient.ts) — 403 hiện NGAY, đúng 2 lần gọi (periods + status), không lượt thử lại nào.
  it('403 hiện NGAY với QueryClient cấu hình như bản thật, không đợi hết lượt thử lại 4xx', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('/templates/FM01/periods')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => PERIODS })
      }
      return Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Không có quyền status.view' }),
      })
    })
    vi.stubGlobal('fetch', f)
    const qc = new QueryClient({ defaultOptions: queryClientSanXuat.getDefaultOptions() })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/status']}>
          <Routes>
            <Route path="/status" element={<Status />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Bạn không có quyền xem tình trạng nộp này')).toBeTruthy()
    expect(f.mock.calls.length).toBe(2)
  })

  // ---- task-26-fix-5.md U3: BĂNG DỮ-LIỆU-CŨ là UI MỚI mang NGHĨA VỤ HÀNH VI MỚI.
  //
  // Vòng 4 sinh ra băng này rồi chỉ canh nó bằng đúng một phép kiểm SỰ TỒN TẠI
  // (`getByTestId` + `textContent !== ''` + nút có mặt) — **7 đột biến đi lọt**: băng hiện trên MỌI
  // lượt xem · băng biến mất ở cảnh phổ biến nhất · băng nháy lên giữa một lượt tải bình thường ·
  // nút Thử lại CHẾT · chữ băng rỗng hoặc dạy NGƯỢC · băng `display:none`.
  //
  // Luật rút ra, áp cho mọi phần tử UI mới: **một UI mới sinh nghĩa vụ ở CẢ HAI MẶT** — khi nào nó
  // PHẢI xảy ra, và khi nào nó TUYỆT ĐỐI KHÔNG được xảy ra — mỗi mặt một ca riêng. Bốn câu hỏi phải
  // có người canh: (1) khi nào hiện, (2) khi nào KHÔNG hiện, (3) nó NÓI gì, (4) nút của nó LÀM gì.
  describe('băng dữ-liệu-cũ — nghĩa vụ HAI MẶT (U3)', () => {
    // (2) MẶT ÂM, cảnh sạch nhất: cả hai nguồn lành, số liệu vừa tải xong. Băng "Không tải được số
    // liệu mới" ở đây là một cảnh báo GIẢ — hiện riết thành tiếng ồn rồi không ai tin nó nữa.
    it('U3 mặt ÂM: lượt xem BÌNH THƯỜNG (hai nguồn đều lành) — TUYỆT ĐỐI không có băng', async () => {
      const f = moiApi()
      renderStatus()
      expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
      await choLang(() => f.mock.calls.length)
      expect(screen.queryByTestId('bang-du-lieu-cu')).toBeNull()
    })

    // (2) MẶT ÂM, cảnh tinh vi hơn: `den` vừa đổi ở NỀN nên `tk` đang tải kỳ MỚI — nhưng CHƯA lỗi
    // gì. `keepPreviousData` giữ lưới cũ trong lúc chờ. Đây là CHỜ, không phải HỎNG — đúng câu bình
    // luận trong `Status.tsx` hứa. Ca này cũng là chốt chặn duy nhất còn lại cho chính tuỳ chọn
    // `placeholderData: keepPreviousData`: gỡ nó đi thì `tk.data` về `undefined`, `duLieuCu` bật, và
    // băng NHÁY LÊN giữa một lượt tải hoàn toàn bình thường (P-6 — vòng 3 đột biến này giết 5 ca,
    // trên HEAD vòng 4 thì 722/722 xanh vì `duLieuCuoi.current` đã làm thay việc giữ LƯỚI).
    it('U3 mặt ÂM: đang tải kỳ MỚI ở NỀN, chưa lỗi gì — KHÔNG băng (đó là chờ, không phải hỏng)', async () => {
      const PERIODS_MOI = [...PERIODS, { period_key: '2026-10', is_open: true }]
      let goiThuPeriods = 0
      let daGoiStatusMoi = false
      const f = vi.fn((url: string) => {
        if (url.includes('/templates/FM01/periods')) {
          goiThuPeriods++
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => (goiThuPeriods === 1 ? PERIODS : PERIODS_MOI),
          })
        }
        if (url.includes('/status?')) {
          if (url.includes('to=2026-10')) {
            daGoiStatusMoi = true
            return new Promise<never>(() => {})
          }
          return Promise.resolve({ ok: true, status: 200, json: async () => DEFAULT_STATUS })
        }
        throw new Error(`URL không lường trước: ${url}`)
      })
      vi.stubGlobal('fetch', f)
      renderStatus()
      expect(await screen.findByText('PTSC Đình Vũ')).toBeTruthy()
      await act(async () => {
        window.dispatchEvent(new Event('visibilitychange'))
      })
      await waitFor(() => expect(daGoiStatusMoi).toBe(true))
      await choLang(() => f.mock.calls.length)
      expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
      expect(screen.queryByTestId('skeleton')).toBeNull()
      expect(screen.queryByTestId('bang-du-lieu-cu')).toBeNull()
    })

    // (1) MẶT DƯƠNG ở cảnh phổ biến NHẤT: rời tab, quay lại, lượt làm mới CÙNG queryKey hỏng. Ca
    // 'C13 mục 2' khoá "lưới CÒN"; ca này khoá nửa còn lại của cùng một luật — "lưới còn thì phải
    // BÁO". Hai đột biến N-16/N-18 làm băng biến mất đúng ở đây mà không ca nào đỏ.
    it('U3 mặt DƯƠNG: lỗi nền CÙNG queryKey — lưới CÒN và băng PHẢI hiện', async () => {
      await dungCanhLoiNenCungKy()
      expect(screen.getByText('PTSC Đình Vũ')).toBeTruthy()
      expect(screen.getByTestId('bang-du-lieu-cu')).toBeTruthy()
    })

    // (3) BĂNG NÓI GÌ. KHÔNG dùng `bang.textContent !== ''`: chữ của chính cái NÚT ("Thử lại") nằm
    // TRONG băng nên khẳng định ấy luôn thoả — băng có thể rỗng chữ (N-24) hoặc **dạy NGƯỢC**
    // ("Số liệu đã được cập nhật mới nhất" — N-25, song sinh của [M-43] ở dòng chú giải) mà vẫn
    // xanh. Đọc CHỮ riêng, và khoá Ý NGHĨA bằng một mẫu chứ không bằng nguyên văn câu, để một bản
    // sau đổi lời mà vẫn nói đúng thì không bị phạt.
    it('U3: chữ của băng phải nói số liệu đang CŨ (không đọc textContent cả khối)', async () => {
      await dungCanhLoiNenCungKy()
      kiemChuBang(screen.getByTestId('bang-du-lieu-cu'))
    })

    // (3b) NGƯỜI DÙNG CÓ THẤY KHÔNG — khác "DOM có không". N-46 đổi `flex …` thành `hidden …`:
    // `getByTestId` vẫn thấy, `getByRole('button')` vẫn thấy, 722/722 xanh, mà mắt người dùng không
    // thấy gì. jsdom không nạp CSS thật nên `getComputedStyle` vô dụng; dùng đúng công cụ của dự án
    // (`cascade.ts` đọc CSS ĐÃ BUILD). Giới hạn phải nói rõ: `null` nghĩa là className không mang
    // utility `display` nào mà CSS build ra biết — đó CHÍNH LÀ thứ xảy ra với `hidden` (Tailwind chỉ
    // emit utility đang được dùng), nhưng nó cũng sẽ bắn nếu một bản sau bỏ hẳn utility display
    // (một `<div>` thường vẫn hiện). Khi ấy hãy sửa ca CÓ CHỦ Ý, đừng luồn qua nó.
    it('U3: băng phải NHÌN THẤY ĐƯỢC — kể cả TỪNG PHẦN TỬ CON (testid trong DOM không đủ)', async () => {
      await dungCanhLoiNenCungKy()
      const bang = screen.getByTestId('bang-du-lieu-cu')
      for (const el of [bang, ...bang.querySelectorAll('*')]) {
        expect({ the: moTa(el), biAn: biAnDi(el) }).toEqual({ the: moTa(el), biAn: false })
      }
    })

    // (4) NÚT CỦA NÓ LÀM GÌ. Ca `S1/[H-1]` chỉ kiểm nút CÓ MẶT, nên `onClick={() => {}}` (N-21) đi
    // lọt: đường thoát duy nhất của màn hình chết mà bộ test im. Khoá đúng HÀNH VI: bấm là gọi lại
    // CẢ HAI nguồn (cùng khuôn ca 'lỗi tải hiện InlineError kèm nút Thử lại' của nhánh chưa-có-dữ-liệu).
    it('U3: bấm Thử lại TRÊN BĂNG gọi lại CẢ HAI endpoint (đường thoát phải CHẠY, không chỉ có mặt)', async () => {
      const { dem } = await dungCanhLoiNenCungKy()
      const bang = screen.getByTestId('bang-du-lieu-cu')
      const truocKy = dem('/templates/FM01/periods')
      const truocTrangThai = dem('/status?')
      await userEvent.click(within(bang).getByRole('button', { name: 'Thử lại' }))
      await waitFor(() => {
        expect(dem('/templates/FM01/periods')).toBeGreaterThan(truocKy)
        expect(dem('/status?')).toBeGreaterThan(truocTrangThai)
      })
    })
  })
})
