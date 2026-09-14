// e2e/demo-path.spec.ts
//
// Phân đoạn 2 của buổi demo, chạy trên trình duyệt thật — cộng bốn phép ĐO mà jsdom không làm
// được (task-27-carry.md C1, C-T24/1, C-T24/2, C-T25/1, C-T25/2).
//
// Luật áp cho từng ca trong file này (rút từ sáu vòng sửa của Task 26): một phần tử tương tác
// sinh BỐN nghĩa vụ — khi nào hiện · khi nào KHÔNG hiện · nói gì · NÚT CỦA NÓ LÀM GÌ. Vì vậy
// hầu hết ca ở đây đều có một "đối chứng âm" đi kèm: một khẳng định sẽ ĐỔ nếu ca test đang đo
// nhầm chỗ. Ví dụ ca dashboard không chỉ hỏi "có thấy 22 không" mà còn chốt "trước khi duyệt phải
// là 21" — nếu không, một trang tải sẵn 22 từ đầu cũng làm ca xanh mà chẳng chứng minh gì.
import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  DON_VI_U22,
  boQuaNeuKhongResetDuoc,
  dangNhap,
  idBaoCao,
  nopBaoCaoQuaApi,
  resetDemo,
  tokenApi,
  tranNgang,
  thuPhamTranNgang,
} from './helpers'

/** Đọc một số đã định dạng vi-VN ("1.234,5") về `number`. `—` (chưa có dữ liệu) → `null`. */
function doSoVi(chuoi: string): number | null {
  const s = chuoi.trim()
  if (s === '' || s === '—') return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

/** Cùng cách định dạng mà `dinhDangSoBang` (NumberCell.tsx) dùng cho ô dẫn xuất. Viết lại ở đây
 *  thay vì import từ `frontend/src`: e2e phải nói bằng thứ NGƯỜI DÙNG ĐỌC TRÊN MÀN, không dùng
 *  chung hàm với mã đang bị kiểm — dùng chung thì hàm sai vẫn làm ca xanh. */
function soVi(n: number, decimals = 0): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: decimals }).format(n)
}

/** Một dòng của bảng `/reports` theo đúng ô "Kỳ".
 *
 *  KHÔNG dùng `getByRole('row', { name: /08\/2026/ })` như brief: với báo cáo đã duyệt, cột "Hạn
 *  nộp" hiện ngày tuyệt đối, nên dòng 07/2026 mang chuỗi "05/08/2026" và cũng khớp `/08\/2026/`
 *  → strict mode vi phạm (hai dòng). Khoanh theo `data-testid="o-ky"` với so khớp ĐÚNG BẰNG. */
function hangKy(page: Page, ky: string): Locator {
  return page.locator('tbody tr').filter({ has: page.locator(`td[data-testid="o-ky"]:text-is("${ky}")`) })
}

/** Ô KPI của dashboard, khoanh theo chữ nhãn.
 *
 *  Brief viết `getByLabel('LTI trong kỳ')` — không khớp gì cả: `components/ui/Tile.tsx` vẽ nhãn
 *  bằng một `<div>` thường, `aria-label` duy nhất trên ô là `"chưa có dữ liệu"` và chỉ nằm trên
 *  dấu `—`. Lấy nhãn rồi trèo lên phần tử cha (chính là ô KPI) là cách đọc đúng cấu trúc thật. */
function oKpi(page: Page, nhan: string): Locator {
  return page.getByText(nhan, { exact: true }).locator('xpath=..')
}

/** Giá trị số trong một ô KPI (dòng ngay dưới nhãn). */
async function soKpi(page: Page, nhan: string): Promise<number | null> {
  const tile = oKpi(page, nhan)
  const chu = await tile.locator('> div').nth(1).innerText()
  return doSoVi(chu)
}

/** Ô nhập / ô dẫn xuất của một chỉ tiêu trong form FM01.
 *
 *  Neo cả hai đầu (`^` và `$`) và giữ DẤU CÁCH sau mã: `aria-label` là `"<mã> <tên>, <cột>"`, nên
 *  `/^B-2\.1 /` loại được B-2.10..B-2.18 — `/B-2\.1/` trần sẽ khớp mười chỉ tiêu. */
function oChiTieu(page: Page, ma: string, cot: 'Lũy kế tháng trước' | 'Tháng này' | 'Cộng dồn'): Locator {
  return page.getByLabel(new RegExp(`^${ma.replace('.', '\\.')} .*, ${cot}$`))
}

/** Một lớp DÍNH/NỔI đang hiện, kèm điểm tâm đã cắt theo tầm nhìn. */
interface LopDinh {
  x: number
  y: number
  ten: string
  viTri: string
  z: string
}

/** CHẠY TRONG TRANG (`page.evaluate`) — không được tham chiếu gì ngoài phạm vi chính nó.
 *
 *  Liệt kê mọi phần tử `position: sticky|fixed` đang thật sự hiện, và TỰ KIỂM từng cái bằng chính
 *  phép bắn tia sẽ dùng ở bước sau: lớp nào không tự chứng minh được là "trên cùng tại điểm của
 *  nó" thì bị loại (đang bị che, bị cắt khỏi khung `overflow`, hoặc nằm ngoài tầm nhìn). Giữ nó
 *  lại chỉ tạo ra một khẳng định trỏ vào chỗ trống. */
function lietKeLopDinh(): LopDinh[] {
  const rong = document.documentElement.clientWidth
  const cao = document.documentElement.clientHeight
  const ra: LopDinh[] = []
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue
    const r = el.getBoundingClientRect()
    // Cắt hộp theo tầm nhìn rồi mới lấy tâm: `getBoundingClientRect` KHÔNG bị khung `overflow`
    // của cha cắt, nên tâm hộp thô có thể rơi hẳn ra ngoài màn.
    const x = Math.round((Math.max(r.left, 0) + Math.min(r.right, rong)) / 2)
    const y = Math.round((Math.max(r.top, 0) + Math.min(r.bottom, cao)) / 2)
    if (Math.min(r.right, rong) - Math.max(r.left, 0) < 4) continue
    if (Math.min(r.bottom, cao) - Math.max(r.top, 0) < 4) continue
    const tren = document.elementFromPoint(x, y)
    if (tren === null || !(el === tren || el.contains(tren))) continue
    ra.push({
      x,
      y,
      ten: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}"`,
      viTri: cs.position,
      z: cs.zIndex,
    })
  }
  return ra
}

/** CHẠY TRONG TRANG. Bắn tia vào từng điểm đã liệt kê khi hộp thoại ĐANG MỞ, rồi hỏi: thứ trúng
 *  tia có thuộc "màn chắn" của hộp thoại không.
 *
 *  R4 (vòng sửa 2) — MÀN CHẮN TÌM THEO TÍNH CHẤT QUAN SÁT ĐƯỢC, KHÔNG THEO QUAN HỆ CÂY DOM.
 *  Bản vòng 1 tìm lớp phủ bằng "tổ tiên `position: fixed` gần nhất của `<dialog open>`". Cách đó
 *  gỡ được phần đóng băng CON SỐ `z-50`, nhưng vẫn đóng băng một quan hệ CẤU TRÚC: tách nền mờ ra
 *  thành ANH EM của `<dialog>` (khuôn mẫu modal phổ biến nhất, và là khuôn mẫu BẮT BUỘC nếu sau
 *  này dựng bằng portal) làm ca đỏ dù tính chất thật vẫn đúng — nền mờ vẫn phủ kín, tia vẫn trúng
 *  nó. Nay "màn chắn" = chính `<dialog open>` CỘNG mọi phần tử `position: fixed` phủ gần kín khung
 *  nhìn, bất kể chúng là cha, con hay anh em của nhau.
 *
 *  GIỚI HẠN ĐÃ BIẾT, ghi thẳng ra: nếu `Dialog` đổi sang `showModal()` thật (Task 24 cố ý KHÔNG
 *  dùng — xem task-24 carry), hộp thoại lên TOP LAYER và `::backdrop` không phải một phần tử, nên
 *  `elementFromPoint` sẽ trả về lớp dính bên dưới và ca này ĐỎ. Lúc đó ca phải được viết lại theo
 *  `:modal` / `inert` chứ không phải nới trần — thông điệp lỗi nói thẳng điều đó. */
function banTiaVaoManChan(diem: LopDinh[]) {
  const rong = document.documentElement.clientWidth
  const cao = document.documentElement.clientHeight
  const hop = document.querySelector('dialog[open]')
  const manChan: Element[] = []
  if (hop !== null) manChan.push(hop)
  let soManPhuKin = 0
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    if (getComputedStyle(el).position !== 'fixed') continue
    const r = el.getBoundingClientRect()
    if (r.width < rong * 0.95 || r.height < cao * 0.95) continue
    manChan.push(el)
    soManPhuKin++
  }
  return {
    coHopThoai: hop !== null,
    soManPhuKin,
    taManChan: manChan
      .map((m) => `${m.tagName.toLowerCase()}[z=${getComputedStyle(m).zIndex}]`)
      .join(' + '),
    diem: diem.map((d) => {
      const el = document.elementFromPoint(d.x, d.y)
      return {
        ...d,
        thuocManChan: el !== null && manChan.some((m) => m === el || m.contains(el)),
        tren: el === null ? 'null' : `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}"`,
      }
    }),
  }
}

test.describe('phân đoạn 2 của buổi demo', () => {
  test.beforeEach(() => {
    resetDemo()
  })

  test('người nộp sửa và nộp, admin trả lại rồi duyệt, dashboard thành 22/22', async ({
    browser,
    request,
  }) => {
    boQuaNeuKhongResetDuoc()
    const nguoiNop = await browser.newContext()
    const admin = await browser.newContext()
    const p1 = await nguoiNop.newPage()
    const p2 = await admin.newPage()
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)

    // ── 1. Người nộp mở báo cáo nháp của đơn vị mình ───────────────────────────────────────────
    await dangNhap(p1, 'u22@ptsc.local')
    await expect(p1.getByRole('heading', { name: /Báo cáo SKATMT/ })).toBeVisible()
    await hangKy(p1, '08/2026').getByRole('link', { name: 'Mở' }).click()
    await p1.waitForURL(`**/reports/${idP05}`)

    // ── 2. Sửa một ô, cột Cộng dồn phải đổi THEO PHÍM, rồi tự lưu ──────────────────────────────
    const oThangNay = oChiTieu(p1, 'B-2.1', 'Tháng này')
    const luyKeTruoc = doSoVi(await oChiTieu(p1, 'B-2.1', 'Lũy kế tháng trước').innerText())
    expect(luyKeTruoc, 'B-2.1 phải có lũy kế tháng trước từ 06+07/2026').not.toBeNull()

    // Số mới phải KHÁC số seed. Brief viết `fill('3')` trong khi fixture cũng cho B-2.1 = 3:
    // `NumberCell.xuLyBlur` chỉ gọi `onCommit` khi chuỗi ĐỔI, nên gõ lại đúng số cũ sẽ không sinh
    // lượt lưu nào và mọi khẳng định "Đã lưu" phía sau thành bằng chứng rỗng.
    const soCu = doSoVi(await oThangNay.inputValue())
    const soMoi = 5
    expect(soMoi, 'số demo phải khác số seed, nếu không sẽ không có lượt lưu nào').not.toBe(soCu)

    await oThangNay.fill(String(soMoi))
    // Cột Cộng dồn của chỉ tiêu `sum` là ô DẪN XUẤT = lũy kế trước + tháng này (ReportForm
    // `giaTriDong`), không phải chính số vừa gõ như brief giả định.
    await expect(oChiTieu(p1, 'B-2.1', 'Cộng dồn')).toHaveText(soVi((luyKeTruoc ?? 0) + soMoi))

    const choLuu = p1.waitForResponse(
      (r) => r.url().includes(`/reports/${idP05}/values`) && r.request().method() === 'PUT' && r.ok(),
    )
    await oThangNay.blur()
    await choLuu
    await expect(p1.getByText(/Đã lưu \d{2}:\d{2}/)).toBeVisible()

    // Số LTI của chính đơn vị này, đọc TỪ MÀN — dùng để chốt dashboard đổi đúng lượng ở bước 8.
    const ltiP05 = doSoVi(await oChiTieu(p1, 'B-2.2', 'Tháng này').inputValue())
    expect(ltiP05).not.toBeNull()

    // ── 3. Nộp ────────────────────────────────────────────────────────────────────────────────
    await p1.getByRole('button', { name: 'Nộp báo cáo' }).click()
    await p1.getByRole('dialog').getByRole('button', { name: 'Nộp' }).click()
    await expect(p1.getByText('Đã nộp báo cáo 08/2026')).toBeVisible()
    // Đã nộp thì KHÔNG còn sửa được — vế âm của chính cú bấm vừa rồi. Đếm Ô NHẬP chứ không đếm
    // `aria-label`: ô chỉ-đọc (`ODoc`) mang ĐÚNG nhãn đó, nên `getByLabel(...).toHaveCount(0)` sẽ
    // đỏ cả khi form đã khoá đúng.
    await expect(p1.getByRole('button', { name: 'Lưu' })).toHaveCount(0)
    await expect(p1.locator('td[data-cot] input')).toHaveCount(0)
    await expect(oChiTieu(p1, 'B-2.1', 'Tháng này').locator('input')).toHaveCount(0)

    // ── 4. Admin: dashboard TRƯỚC khi duyệt phải là 21, không phải 22 ──────────────────────────
    await dangNhap(p2, 'admin@ptsc.local')
    await p2.waitForURL('**/dashboard')
    await expect(p2.getByText('Tổng từ 21 báo cáo đã duyệt')).toBeVisible()
    await expect(p2.getByText('Tổng từ 22 báo cáo đã duyệt')).toHaveCount(0)
    const ltiTruoc = await soKpi(p2, 'LTI trong kỳ')
    expect(ltiTruoc).not.toBeNull()

    // ── 5. Admin mở đúng báo cáo vừa nộp từ hàng đợi ───────────────────────────────────────────
    await p2.getByRole('link', { name: 'Duyệt báo cáo' }).click()
    await p2.waitForURL('**/reports')
    // Hàng đợi lọc `state=submitted`: đúng MỘT dòng, và phải là dòng vừa nộp — "có một dòng nào đó"
    // thì không chứng minh được lượt nộp ở bước 3 đã tới đúng nơi.
    await expect(p2.locator('tbody tr')).toHaveCount(1)
    await expect(hangKy(p2, '08/2026')).toContainText('Ban dự án 05')
    await hangKy(p2, '08/2026').getByRole('link', { name: 'Mở' }).click()
    await p2.waitForURL(`**/reports/${idP05}`)

    // ── 6. Trả lại kèm lý do ──────────────────────────────────────────────────────────────────
    const LY_DO = 'Kiểm lại số B-2.1 giúp anh'
    await p2.getByRole('button', { name: 'Trả lại…' }).click()
    const hopTraLai = p2.getByRole('dialog')
    // Nút chính KHOÁ khi lý do chưa đủ 10 ký tự (Dialog.TOI_THIEU_GHI_CHU) — vế âm của ô lý do.
    await expect(hopTraLai.getByRole('button', { name: 'Trả lại' })).toBeDisabled()
    await hopTraLai.getByRole('textbox').fill(LY_DO)
    await expect(hopTraLai.getByRole('button', { name: 'Trả lại' })).toBeEnabled()
    await hopTraLai.getByRole('button', { name: 'Trả lại' }).click()
    await expect(p2.getByText('Đã trả lại')).toBeVisible()

    // ── 7. Người nộp tải lại: phiên còn sống, thấy nguyên văn lý do, sửa và nộp lại ────────────
    await p1.reload()
    // Băng trả lại là `role="status"` (ReportForm, fix-1 S12 đổi từ `alert` sang `status` có chủ
    // ý) — brief viết `getByRole('alert')` là theo bản cũ.
    await expect(p1.getByRole('status').filter({ hasText: 'Ban ATCL trả lại' })).toContainText(LY_DO)

    const choLuu2 = p1.waitForResponse(
      (r) => r.url().includes(`/reports/${idP05}/values`) && r.request().method() === 'PUT' && r.ok(),
    )
    await oChiTieu(p1, 'B-2.1', 'Tháng này').fill('2')
    await oChiTieu(p1, 'B-2.1', 'Tháng này').blur()
    await choLuu2
    await p1.getByRole('button', { name: 'Nộp lại' }).click()
    await p1.getByRole('dialog').getByRole('button', { name: 'Nộp' }).click()
    await expect(p1.getByText('Đã nộp lại 08/2026')).toBeVisible()

    // ── 8. Admin duyệt, dashboard ra 22 ───────────────────────────────────────────────────────
    // `reload()` ở đây là thao tác THẬT của người duyệt (báo cáo vừa được nộp lại từ tab khác,
    // trình duyệt này chưa biết) và nó vẫn được giữ. NHƯNG phải nói đúng cái nó KHÔNG làm:
    //
    // Q1 (vòng sửa 1): `reload()` dựng lại `QueryClient` từ số không, nên mọi khẳng định sau đây
    // đọc từ một lượt fetch NGUỘI. Chúng KHÔNG nói được gì về `invalidateReportQueries` — người
    // soát chứng minh bằng M5b (vô hiệu hoá toàn bộ lớp làm mới cache) mà cả 5 ca vẫn xanh.
    // Comment cũ ở đây tự nhận là canh lớp cache; đó là một lời hứa sai và đã bị gỡ.
    // Lớp cache nay có ca RIÊNG ngay bên dưới, chạy trên cảnh KHÔNG có reload.
    await p2.reload()
    await p2.getByRole('button', { name: 'Duyệt' }).click()
    await p2.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click()

    // Toast tự tắt sau 4 s (Toast.TOAST_MS) — bấm ngay, không chen khẳng định chậm nào vào giữa.
    await p2.getByRole('link', { name: 'Xem dashboard' }).click()
    await p2.waitForURL('**/dashboard')

    await expect(p2.getByText('Tổng từ 22 báo cáo đã duyệt')).toBeVisible()
    // Đổi ĐÚNG LƯỢNG: "không còn là 21" chưa đủ, con số phải cộng thêm đúng LTI của đơn vị vừa
    // được duyệt — vế này canh phép cộng phía server, không canh cache.
    await expect(oKpi(p2, 'LTI trong kỳ')).not.toContainText('—')
    expect(await soKpi(p2, 'LTI trong kỳ')).toBe((ltiTruoc ?? 0) + (ltiP05 ?? 0))

    await nguoiNop.close()
    await admin.close()
  })

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Q1 (vòng sửa 1) — lớp LÀM MỚI CACHE, đo trên cảnh KHÔNG tải lại trang.
  //
  // Vì sao phải có ca riêng: ca demo ở trên gọi `p2.reload()` trước khi duyệt, mà `reload()` dựng
  // lại `QueryClient` từ số không. Sau đó mọi con số đọc được đều là fetch nguội, nên vô hiệu hoá
  // TOÀN BỘ `invalidateReportQueries` vẫn 5/5 xanh (M5b). Dạng mù (b): một lớp ở giữa che mất
  // đúng thứ đang cần đo.
  //
  // Cảnh dưới đây là cảnh khán giả buổi demo sẽ nhìn: một tab duy nhất, không F5 lần nào —
  // admin đứng ở dashboard (số 21 đã nằm trong cache), đi duyệt, rồi bấm "Xem dashboard" quay về.
  // `staleTime: 30_000` (app/queryClient.ts) giữ nguyên con số 21 trên màn suốt 30 giây; thứ DUY
  // NHẤT làm nó thành 22 trong khoảng đó là một lượt invalidate. Không có invalidate ⇒ ca ĐỎ.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  test('Q1 — duyệt xong, dashboard đổi 21→22 NGAY mà KHÔNG tải lại trang (lớp làm mới cache)', async ({
    page,
    request,
  }) => {
    boQuaNeuKhongResetDuoc()
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)
    // Dựng cảnh NGOÀI trình duyệt đang đo: nếu nộp bằng chính tab này thì lượt
    // `invalidateReportQueries` của cú nộp cũng lẫn vào phép đo.
    await nopBaoCaoQuaApi(request, await tokenApi(request, 'u22@ptsc.local'), idP05)

    // R3 (vòng sửa 2) — đếm mọi lượt gọi `/dashboard/summary` để KHẲNG ĐỊNH tiền đề thứ nhất ở
    // dưới, thay vì tin nó. Gắn trước cả `dangNhap` để không bỏ sót lượt nào.
    let soLuotSummary = 0
    page.on('response', (r) => {
      if (r.url().includes('/dashboard/summary')) soLuotSummary++
    })

    await dangNhap(page, 'admin@ptsc.local')
    await page.waitForURL('**/dashboard')
    await expect(page.getByText('Tổng từ 21 báo cáo đã duyệt')).toBeVisible()
    const ltiTruoc = await soKpi(page, 'LTI trong kỳ')
    expect(ltiTruoc).not.toBeNull()
    // Mốc tính tuổi cache: từ giây này, `['dashboard','summary','2026-08']` mang con số 21 và còn
    // TƯƠI trong 30 s.
    const mocCache = Date.now()

    // ── R3, TIỀN ĐỀ 2: "KHÔNG tải lại trang" — cắm một cái mốc chỉ sống được trong MỘT vòng đời
    // của `window`. Một lượt tải trang thật ở bất cứ đâu trong đoạn đo (kể cả do mã sản phẩm tự
    // gọi `location.assign`) sẽ xoá nó, và cũng dựng lại `QueryClient` từ số không — đúng cái lỗ
    // `p2.reload()` mà vòng sửa 1 vừa gỡ khỏi tệp test, chỉ dời chỗ vào mã sản phẩm (N29).
    await page.evaluate(() => {
      Object.assign(window, { __e2eMocTrang: 'con-nguyen' })
    })

    // ── R3, TIỀN ĐỀ 1: cache CÒN TƯƠI qua một vòng điều hướng ─────────────────────────────────
    // Cả ca này chỉ có sức phân biệt khi `['dashboard','summary']` KHÔNG tự làm mới sau mỗi lần
    // mount. Hạ `staleTime` xuống 0 là con số 22 ở cuối ca sẽ tới nơi dù `invalidateReportQueries`
    // có là thân rỗng hay không — ca xanh giả, im lặng (N4). Nên đo thẳng: đi khỏi dashboard rồi
    // quay lại, KHÔNG có mutation nào ở giữa, và đòi con số không sinh thêm lượt fetch nào.
    expect(
      soLuotSummary,
      'không bắt được lượt gọi `/dashboard/summary` nào — phép đếm dưới đây sẽ rỗng',
    ).toBeGreaterThanOrEqual(1)
    const luotTruocVong = soLuotSummary
    await page.getByRole('link', { name: 'Duyệt báo cáo' }).click()
    await page.waitForURL('**/reports')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL('**/dashboard')
    await expect(page.getByText('Tổng từ 21 báo cáo đã duyệt')).toBeVisible()
    expect(
      soLuotSummary,
      `quay lại dashboard đã bắn thêm ${soLuotSummary - luotTruocVong} lượt fetch summary dù không ` +
        'có mutation nào ở giữa ⇒ cache KHÔNG còn tươi qua một vòng điều hướng, và con số 22 ở cuối ' +
        'ca này không còn chứng minh được là do `invalidateReportQueries`',
    ).toBe(luotTruocVong)

    await page.getByRole('link', { name: 'Duyệt báo cáo' }).click()
    await page.waitForURL('**/reports')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await hangKy(page, '08/2026').getByRole('link', { name: 'Mở' }).click()
    await page.waitForURL(`**/reports/${idP05}`)

    // Báo cáo đang `submitted` ⇒ không sửa được ⇒ ô là `<td>` chỉ-đọc, đọc bằng innerText.
    const ltiP05 = doSoVi(await oChiTieu(page, 'B-2.2', 'Tháng này').innerText())
    expect(ltiP05).not.toBeNull()

    await page.getByRole('button', { name: 'Duyệt' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click()
    await page.getByRole('link', { name: 'Xem dashboard' }).click()
    await page.waitForURL('**/dashboard')

    // KHÔNG `reload()`, KHÔNG `waitForTimeout`. Mọi thứ trên màn lúc này đi qua cùng một
    // `QueryClient` đã cầm sẵn con số 21.
    await expect(page.getByText('Tổng từ 22 báo cáo đã duyệt')).toBeVisible()
    await expect(page.getByText('Tổng từ 21 báo cáo đã duyệt')).toHaveCount(0)
    expect(await soKpi(page, 'LTI trong kỳ')).toBe((ltiTruoc ?? 0) + (ltiP05 ?? 0))

    // Bằng chứng ca này CÓ THỂ giết được đột biến, không phải xanh nhờ may: nếu cả đoạn trên chạy
    // lâu hơn `staleTime` thì react-query tự refetch lúc mount và con số 22 sẽ tới nơi dù
    // `invalidateReportQueries` có là no-op hay không — lúc đó ca thành xanh giả. Chốt lại bằng
    // một trần thời gian có lề rộng.
    const troi = Date.now() - mocCache
    expect(
      troi,
      `đoạn đo mất ${troi}ms — phải ở xa dưới staleTime 30 000ms, nếu không con số 22 có thể đến ` +
        'từ một lượt refetch vì hết hạn chứ không phải từ invalidateReportQueries',
    ).toBeLessThan(20_000)

    // Và cái mốc cắm từ đầu đoạn đo phải còn nguyên: còn nó thì `window` chưa hề bị dựng lại, tức
    // `QueryClient` cầm con số 21 suốt từ đầu tới giờ vẫn là CHÍNH NÓ.
    expect(
      await page.evaluate(() => (window as unknown as { __e2eMocTrang?: string }).__e2eMocTrang ?? null),
      'mốc cắm ở đầu đoạn đo đã mất ⇒ trang đã bị TẢI LẠI giữa chừng ⇒ `QueryClient` được dựng lại ' +
        'từ số không và con số 22 đến từ một lượt fetch nguội, không phải từ lớp làm mới cache',
    ).toBe('con-nguyen')
  })

  // C1 + C-T25/1: vòng lặp phải có `/reports/:id` (form FM01 — màn RỘNG NHẤT) và `/dashboard`
  // (bảng 22 đơn vị × 8 cột). Chạy ở CẢ hai project nên bao luôn "1280×800 và ở 125%".
  test('trang không bao giờ cuộn ngang ở cả hai viewport', async ({ page, request }) => {
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)
    await dangNhap(page, 'admin@ptsc.local')

    // Mỗi trang chờ một mốc LẮNG riêng. Đo ngay sau `goto` là đo đúng khung hình skeleton — lúc đó
    // chưa có bảng nào để mà tràn, ca sẽ xanh mà không canh gì (luật Task 26 về `expect` thoả ngay
    // lần thử đầu).
    const man: { url: string; lang: (p: Page) => Promise<void> }[] = [
      {
        url: '/dashboard',
        lang: async (p) => {
          await expect(p.getByText(/Tổng từ \d+ báo cáo đã duyệt|Chưa có báo cáo được duyệt/)).toBeVisible()
          await expect(p.locator('tbody tr')).toHaveCount(22)
        },
      },
      {
        url: '/status',
        lang: async (p) => {
          // 23 = 22 đơn vị + dòng "Tổng theo kỳ" (StatusGrid dựng nó TRONG `tbody`, không phải
          // `tfoot`) — đếm 22 sẽ đỏ vì lý do sai.
          await expect(p.locator('tbody tr')).toHaveCount(23)
          await expect(p.getByText('Tổng theo kỳ')).toBeVisible()
          // Ô của kỳ đã có báo cáo phải trỏ tới id THẬT. `/reports/undefined` ở đây là dấu hiệu
          // backend không trả `report_id` (đã gặp một lần với image docker cũ — xem báo cáo).
          await expect(p.locator('a[href="/reports/undefined"]')).toHaveCount(0)
          // C-T26b: băng "dữ liệu cũ" KHÔNG được hiện ở đường đi demo sạch. Thấy nó ở đây là một
          // phát hiện đáng báo, không phải chuyện vặt.
          await expect(p.getByTestId('bang-du-lieu-cu')).toHaveCount(0)
        },
      },
      {
        url: '/reports',
        lang: async (p) => {
          // Bộ lọc mặc định của admin là `state=submitted`; sau reset không có báo cáo nào đã nộp
          // nên bảng RỖNG — đo "không cuộn ngang" trên một trang trống là không đo gì. Bấm "Tất
          // cả" để có đúng bản rộng nhất của màn này.
          await p.getByRole('button', { name: 'Tất cả' }).click()
          // 66 = 22 đơn vị × 3 kỳ ĐÃ CÓ báo cáo. Kỳ 09/2026 tuy đang mở nhưng chưa đơn vị nào
          // tạo báo cáo, và `liet_ke_bao_cao` chỉ dựng dòng trống cho phạm vi MỘT đơn vị (người
          // nộp), không dựng 22 dòng trống thay cho admin — đo trên API trước khi viết số này.
          await expect(p.locator('tbody tr')).toHaveCount(66)
        },
      },
      {
        url: `/reports/${idP05}`,
        lang: async (p) => {
          await expect(p.getByRole('heading', { name: /FM01 · 08\/2026/ })).toBeVisible()
          await expect(p.locator('tbody tr')).toHaveCount(62) // 53 chỉ tiêu + 9 hàng tiêu đề nhóm
        },
      },
    ]

    for (const { url, lang } of man) {
      await page.goto(url)
      await lang(page)
      const tran = await tranNgang(page)
      const thuPham = tran > 0 ? await thuPhamTranNgang(page) : []
      expect(tran, `${url} cuộn ngang ${tran}px — thủ phạm: ${thuPham.join(' | ')}`).toBeLessThanOrEqual(0)
    }
  })

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Ba phép đo chỉ làm được bằng trình duyệt thật (task-27-carry.md C-T24, C-T25/2).
  // Task 24/25 ghi rõ đây là "chỗ CHƯA ĐO, không phải chỗ đã sạch" — jsdom không có bố cục.
  // ────────────────────────────────────────────────────────────────────────────────────────────

  test('C-T24/1 — Ctrl+S ở một dòng giữa bảng không làm trang nhảy cuộn, và tự nó lưu NGAY', async ({
    page,
    request,
  }) => {
    boQuaNeuKhongResetDuoc()
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)
    await dangNhap(page, 'u22@ptsc.local')
    await page.goto(`/reports/${idP05}`)
    await expect(page.locator('tbody tr')).toHaveCount(62)

    // B-5.3 nằm giữa bảng (chỉ tiêu thứ 34/53). `chotODangGo()` của Ctrl+S làm blur() rồi focus()
    // lại ô — trên trình duyệt thật, focus() có thể kéo trang/khung cuộn về phía phần tử.
    const o = oChiTieu(page, 'B-5.3', 'Tháng này')
    await o.scrollIntoViewIfNeeded()
    await o.click()
    // Ô phải THỰC SỰ nằm trong tầm nhìn trước khi đo: nếu nó đang khuất, mọi cú nhảy sau đó là
    // hành vi đúng của trình duyệt chứ không phải lỗi, và phép đo mất nghĩa.
    await expect(o).toBeInViewport()

    const khung = page.locator('div.overflow-auto').filter({ has: page.locator('table') }).first()
    const truoc = await page.evaluate(
      (sel) => ({
        trang: window.scrollY,
        bang: document.querySelector(sel)?.scrollTop ?? -1,
      }),
      'div.overflow-auto',
    )
    expect(truoc.bang, 'phải cuộn được xuống giữa bảng thì phép đo mới có nghĩa').toBeGreaterThan(0)

    // Gõ một số MỚI rồi Ctrl+S: vừa đo cú nhảy, vừa chứng minh phím tắt LÀM ĐÚNG VIỆC của nó
    // (chốt ô đang gõ rồi lưu) — một ca chỉ đo "không nhảy" mà không đo "có lưu" là nửa ca.
    const choLuu = page.waitForResponse(
      (r) => r.url().includes(`/reports/${idP05}/values`) && r.request().method() === 'PUT' && r.ok(),
    )
    // Đo tới lúc request RỜI trình duyệt, không tới lúc phản hồi về: thời gian server xử lý một
    // `PUT` 62 dòng (đo được ~500ms) là hằng số chung của cả hai đường, cộng nó vào chỉ làm hai
    // con số xích lại gần nhau và bóp lề của phép so ở cuối ca.
    const choReqLuu = page.waitForRequest(
      (r) => r.url().includes(`/reports/${idP05}/values`) && r.method() === 'PUT',
    )
    await o.fill('9')
    const mocCtrlS = Date.now()
    await page.keyboard.press('Control+s')
    await choReqLuu
    const treCtrlS = Date.now() - mocCtrlS
    await choLuu
    await expect(page.getByText(/Đã lưu \d{2}:\d{2}/)).toBeVisible()

    const sau = await page.evaluate(
      (sel) => ({
        trang: window.scrollY,
        bang: document.querySelector(sel)?.scrollTop ?? -1,
      }),
      'div.overflow-auto',
    )
    expect(sau.trang, `trang nhảy ${sau.trang - truoc.trang}px sau Ctrl+S`).toBe(truoc.trang)
    expect(sau.bang, `khung bảng nhảy ${sau.bang - truoc.bang}px sau Ctrl+S`).toBe(truoc.bang)
    // Ô vẫn giữ focus và giữ chỗ đặt con trỏ — đó là cả lý do `chotODangGo()` gọi focus() lại.
    await expect(o).toBeFocused()
    await expect(khung).toBeVisible()

    // ── R1 (vòng sửa 2): TÁCH HAI ĐƯỜNG `PUT`, nếu không thì nửa "vẫn lưu" là bằng chứng rỗng ──
    //
    // Một mình cái `waitForResponse` ở trên KHÔNG chứng minh được phím tắt có lưu: `chotODangGo()`
    // gọi `o.blur()`, `NumberCell.xuLyBlur` bắn `onCommit`, `useSaveValues.markDirty` hẹn giờ, và
    // hàng chờ ấy sẽ tự bay đi sau `DO_TRE` — nên `PUT` vẫn tới dù Ctrl+S đã bỏ hẳn lượt gọi
    // `luuRef.current()` (đột biến N25: ca xanh, lỗ không ai canh).
    //
    // Thứ phân biệt được hai đường từ phía trình duyệt là THỜI ĐIỂM, không phải nội dung:
    //   · đường Ctrl+S  → `saveNow()` → `huyHen()` → gửi NGAY
    //   · đường rời-ô   → phải đợi hết debounce rồi mới gửi
    // Gợi ý "Ctrl+S trên một ô KHÔNG đổi giá trị vẫn phải bắn PUT" không dùng được ở sản phẩm
    // này: `saveNow()` về sớm khi hàng chờ rỗng (useSaveValues.ts — `if (hangCho.current.size === 0
    // && hangChoChu.current.size === 0) return true`), nên ô không đổi thì KHÔNG có `PUT` nào ở cả
    // hai đường. Bắt nó bắn sẽ phải sửa mã sản phẩm, mà task này không đụng mã sản phẩm.
    //
    // Nên đo CẢ HAI đường trong CÙNG lượt chạy rồi so nhau, thay vì khẳng định một con số tuyệt
    // đối: hạ `DO_TRE` từ 1500 xuống 300 là một thay đổi hợp lệ và không được làm ca này đỏ.
    const choLuuRoiO = page.waitForResponse(
      (r) => r.url().includes(`/reports/${idP05}/values`) && r.request().method() === 'PUT' && r.ok(),
    )
    const choReqRoiO = page.waitForRequest(
      (r) => r.url().includes(`/reports/${idP05}/values`) && r.method() === 'PUT',
    )
    await o.fill('8')
    const mocRoiO = Date.now()
    // Enter = xuống ô dưới cùng cột (useKeyboardNav) ⇒ ô này blur ⇒ chỉ có lớp tự-lưu-khi-rời-ô
    // đẩy nó đi, không có lượt gọi `saveNow()` nào.
    await page.keyboard.press('Enter')
    await choReqRoiO
    const treRoiO = Date.now() - mocRoiO
    await choLuuRoiO

    expect(
      treRoiO,
      `Ctrl+S mất ${treCtrlS}ms tới lúc server nhận, còn đường tự-lưu-khi-rời-ô mất ${treRoiO}ms. ` +
        'Hai số này PHẢI cách nhau thì ca mới phân biệt được "phím tắt tự lưu" với "cú blur do ' +
        'chính phím tắt gây ra đã lưu hộ". Bằng nhau nghĩa là một trong hai: phím tắt đã thôi gọi ' +
        'saveNow() (lỗi — sửa mã), hoặc debounce DO_TRE đã bị bỏ (lúc đó không trình duyệt nào ' +
        'tách được hai đường nữa — phải viết lại ca, đừng nới trần).',
    ).toBeGreaterThan(3 * treCtrlS)
  })

  // Q2 + Q4 (vòng sửa 1). Hai thứ đổi so với bản đầu:
  //
  // Q2 — bản đầu khẳng định `zIndex === '50'` và tìm lớp phủ bằng selector `div.fixed.inset-0.z-50`.
  // Cả hai đóng băng HIỆN TRẠNG: đổi `z-50` thành `z-[70]` — một bản sửa ĐÚNG HƠN, đẩy hộp thoại
  // lên cao hơn nữa — làm ca ĐỎ (M6c). Đó là dạng mù (d): ca phạt đúng người sửa đúng. Tính chất
  // thật cần canh là "lớp phủ thắng phép bắn tia ở mọi lớp dính", không phải một con số. Nay lớp
  // phủ được tìm bằng ĐỊNH NGHĨA (tổ tiên `position: fixed` gần nhất của `<dialog open>`) và con
  // số z-index chỉ còn đi kèm trong thông điệp lỗi để người sửa đọc, không còn bị khẳng định.
  // (R4, vòng sửa 2: phép tìm lớp phủ đã bỏ nốt quan hệ CÂY DOM — xem `banTiaVaoManChan`.)
  //
  // Q4 — tên ca cũ hứa "trên MỌI lớp dính" trong khi chỉ bắn tia HAI điểm tự chọn tay. Nay các lớp
  // dính được LIỆT KÊ ĐỘNG: mọi phần tử có `position: sticky|fixed`, đang thấy được, và tự chứng
  // minh là lớp trên cùng tại điểm của nó TRƯỚC khi hộp thoại mở. Thêm một lớp dính mới vào form
  // thì ca này tự phủ luôn, không phải sửa. Lớp `Toast` không có mặt Ở CA NÀY vì đường đi của ca
  // này (mở thẳng một báo cáo nháp rồi bấm "Nộp") không sinh toast nào — nó được đo ở ca C-T24/2b
  // ngay dưới, nơi toast thật sự sống cùng lúc với hộp thoại.
  test('C-T24/2 — hộp thoại nằm trên MỌI lớp dính đang hiện, đo bằng phép bắn tia trên pixel', async ({
    page,
    request,
  }) => {
    boQuaNeuKhongResetDuoc()
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)
    await dangNhap(page, 'u22@ptsc.local')
    await page.goto(`/reports/${idP05}`)
    await expect(page.locator('tbody tr')).toHaveCount(62)

    const nutNop = page.getByRole('button', { name: 'Nộp báo cáo' })
    await expect(nutNop).toBeInViewport()

    // BƯỚC 1 — liệt kê lớp dính và TỰ KIỂM từng lớp bằng chính phép bắn tia, khi chưa có hộp thoại.
    // Lớp nào không tự chứng minh được là "trên cùng tại điểm của nó" thì bị loại (đang bị che, bị
    // cắt khỏi khung `overflow`, hoặc nằm ngoài tầm nhìn) — giữ nó lại chỉ tạo ra một khẳng định
    // trỏ vào chỗ trống.
    const lopDinh = await page.evaluate(lietKeLopDinh)

    // Không có lớp nào thì ca này không canh gì cả — phải đổ, không được xanh rỗng.
    expect(
      lopDinh.length,
      'không tìm thấy lớp dính nào đang hiện — form FM01 phải có header cột dính và thanh dưới dính',
    ).toBeGreaterThanOrEqual(3)
    // Và phải có đủ CẢ HAI loại mà C-T24/2 gọi tên: header cột (sticky, z dương) và thanh dưới.
    expect(lopDinh.some((l) => l.ten.includes('Chỉ tiêu')), `lớp dính đo được: ${JSON.stringify(lopDinh)}`).toBe(true)
    expect(lopDinh.some((l) => l.ten.includes('Nộp báo cáo')), `lớp dính đo được: ${JSON.stringify(lopDinh)}`).toBe(true)

    // BƯỚC 2 — mở hộp thoại, bắn tia lại vào ĐÚNG những điểm vừa tự kiểm.
    await nutNop.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const ketQua = await page.evaluate(banTiaVaoManChan, lopDinh)

    expect(ketQua.coHopThoai, 'không có `dialog[open]` nào — phép bắn tia dưới đây sẽ vô nghĩa').toBe(true)
    expect(
      ketQua.soManPhuKin,
      'không tìm thấy màn chắn `position:fixed` nào phủ kín khung nhìn — hộp thoại của app này phải ' +
        'có một lớp phủ như vậy (nếu đã đổi sang `showModal()` thật thì ca này phải viết lại theo ' +
        '`:modal`/`inert`, xem chú thích của banTiaVaoManChan)',
    ).toBeGreaterThanOrEqual(1)
    for (const d of ketQua.diem) {
      expect(
        d.thuocManChan,
        `lớp dính ${d.ten} (${d.viTri}, z=${d.z}) tại (${d.x},${d.y}) vẫn nổi trên hộp thoại ` +
          `(màn chắn: ${ketQua.taManChan}) — tia trúng ${d.tren}`,
      ).toBe(true)
    }

    // Và phần tử bên dưới KHÔNG CÒN bấm được — vế "nút của nó làm gì" của lớp phủ. Bấm vào đúng
    // toạ độ nút "Nộp báo cáo" lúc này không được mở thêm hộp thoại thứ hai.
    const diemNut = lopDinh.find((l) => l.ten.includes('Nộp báo cáo'))!
    await page.mouse.click(diemNut.x, diemNut.y)
    await expect(page.getByRole('dialog')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  // R2 (vòng sửa 2) — LỚP `Toast`, nay ĐO chứ không còn suy luận.
  //
  // Báo cáo vòng 1 viết rằng cảnh "hộp thoại mở trong khi Toast còn sống" chỉ tới được bằng một
  // cuộc đua với đồng hồ, vì đo thấy phải chờ ~4,5 s mới bấm được nút "Mở lại". GHI CHÚ ĐÓ SAI, và
  // cái làm nó sai lại chính là một lỗi: nút "Mở lại" hiện sau 4ms; 4,5 giây kia là do CHÍNH TOAST
  // CHE MẤT CÁI NÚT (toast `fixed right-6 bottom-6` chồng lên đầu phải thanh nút dính), nên phép
  // kiểm "điểm bấm không bị che" của Playwright phải đứng đợi toast tự tắt. Mở hộp thoại bằng BÀN
  // PHÍM không đi qua phép kiểm ấy: 28ms/26ms, toast còn sống — lề 140 lần trên ngân sách 4 s.
  //
  // Lỗi UI "toast che thanh nút dính" là một PHÁT HIỆN, đã chuyển sang review tổng; task này không
  // đụng mã sản phẩm. Ở đây chỉ dựng lại cảnh đó để bắn tia vào TÂM TOAST.
  test('C-T24/2b — Toast còn sống thì hộp thoại vẫn nằm trên nó (bắn tia vào tâm Toast)', async ({
    page,
    request,
  }) => {
    boQuaNeuKhongResetDuoc()
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)
    // Nộp NGOÀI trình duyệt đang đo để cảnh bắt đầu đúng ở chỗ cần: admin đứng trước một báo cáo
    // `submitted`, bấm Duyệt một cái là có toast.
    await nopBaoCaoQuaApi(request, await tokenApi(request, 'u22@ptsc.local'), idP05)
    await dangNhap(page, 'admin@ptsc.local')
    await page.goto(`/reports/${idP05}`)
    await expect(page.locator('tbody tr')).toHaveCount(62)

    await page.getByRole('button', { name: 'Duyệt' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click()

    // Toast "Đã duyệt · Xem dashboard" — khoanh theo chính cái link của nó, vì `role="status"`
    // còn có ở dải đầu form (FormHeader "Đã lưu…") và ở hai banner của ReportForm.
    const toast = page.getByRole('status').filter({ hasText: 'Xem dashboard' })
    await expect(toast).toBeVisible()

    const nutMoLai = page.getByRole('button', { name: 'Mở lại' })
    await expect(nutMoLai).toBeVisible()

    // Liệt kê KHI TOAST ĐANG SỐNG: nếu toast không lọt vào danh sách thì ca này không đo thứ nó
    // sinh ra để đo, phải đổ ngay tại đây chứ không xanh rỗng ở dưới.
    const lopDinh = await page.evaluate(lietKeLopDinh)
    expect(
      lopDinh.some((l) => l.ten.includes('Đã duyệt')),
      `Toast không có trong danh sách lớp nổi đang hiện: ${JSON.stringify(lopDinh)}`,
    ).toBe(true)

    // Mở bằng BÀN PHÍM có chủ ý: `click()` đòi tâm nút không bị che, mà toast đang che đúng chỗ đó
    // — Playwright sẽ đứng đợi 4 s cho toast tắt, tức tự tay xoá mất tiền đề của phép đo.
    await nutMoLai.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()

    // TIỀN ĐỀ, đọc ngay lập tức (không `expect` có retry — một khẳng định chờ được thì nó sẽ chờ
    // toast SỐNG LẠI, chuyện không bao giờ xảy ra, và biến lỗi tiền đề thành một lỗi hết giờ khó
    // đọc): toast phải CÒN trên màn cùng lúc với hộp thoại.
    expect(
      await toast.isVisible(),
      'Toast đã tắt trước khi hộp thoại kịp mở — mọi khẳng định dưới đây sẽ là bằng chứng rỗng',
    ).toBe(true)

    const ketQua = await page.evaluate(banTiaVaoManChan, lopDinh)
    expect(ketQua.coHopThoai, 'không có `dialog[open]` nào — phép bắn tia dưới đây sẽ vô nghĩa').toBe(true)
    for (const d of ketQua.diem) {
      expect(
        d.thuocManChan,
        `lớp nổi ${d.ten} (${d.viTri}, z=${d.z}) tại (${d.x},${d.y}) vẫn nổi trên hộp thoại ` +
          `(màn chắn: ${ketQua.taManChan}) — tia trúng ${d.tren}`,
      ).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('C-T25/2 — đo khoảng cách dưới titlebar của /status, /dashboard và /reports trên pixel', async ({
    page,
  }, thongTin) => {
    await dangNhap(page, 'admin@ptsc.local')

    // `lang` KHÔNG phải thủ tục cho đẹp. `/status` vẽ tiêu đề ở CẢ nhánh skeleton lẫn nhánh đã
    // tải, nhưng ở nhánh skeleton cái `h1` nằm trong một `div` bọc ngoài chứ không phải trong
    // titlebar — đo lúc đó trả về `null` (bản đầu của ca này đo trúng đúng khung hình ấy và im
    // lặng cho ra `undefined`). Đây chính là cái bẫy "expect thoả ngay ở lần thử đầu lúc trang
    // còn đang tải là bằng chứng rỗng".
    const doKhoangCach = async (url: string, tenTieuDe: RegExp, lang: () => Promise<void>) => {
      await page.goto(url)
      const h1 = page.getByRole('heading', { name: tenTieuDe })
      await expect(h1).toBeVisible()
      await lang()
      return page.evaluate((ten) => {
        const el = Array.from(document.querySelectorAll('h1')).find((h) =>
          new RegExp(ten).test(h.textContent ?? ''),
        )
        const thanh = el?.parentElement // div titlebar bọc h1 + điều khiển bên phải
        const sau = thanh?.nextElementSibling
        if (!thanh || !sau) return null
        const a = thanh.getBoundingClientRect()
        const b = sau.getBoundingClientRect()
        return {
          marginBottom: getComputedStyle(thanh).marginBottom,
          khe: Math.round(b.top - a.bottom),
        }
      }, tenTieuDe.source)
    }

    const dash = await doKhoangCach('/dashboard', /Dashboard SKATMT/, async () => {
      await expect(page.locator('tbody tr')).toHaveCount(22)
    })
    const reports = await doKhoangCach('/reports', /Chờ duyệt|Tất cả báo cáo|Báo cáo SKATMT/, async () => {
      await page.getByRole('button', { name: 'Tất cả' }).click()
      await expect(page.locator('tbody tr')).toHaveCount(66)
    })
    // `/status` cũng vào phép đo: `Status.tsx` dùng `mb-1.5` = ĐÚNG 6px của bản vẽ
    // (`tokens.css: .titlebar{…margin-bottom:6px}`), nên nó là mốc so — không có nó thì hai số
    // 16/20 chỉ là "khác bản vẽ", có nó mới thấy chúng là hai ngoại lệ giữa một mực đã đúng.
    const status = await doKhoangCach('/status', /Tình trạng nộp/, async () => {
      await expect(page.locator('tbody tr')).toHaveCount(23)
    })
    expect(dash, '/dashboard không tìm được titlebar').not.toBeNull()
    expect(reports, '/reports không tìm được titlebar').not.toBeNull()
    expect(status, '/status không tìm được titlebar').not.toBeNull()

    // Ca này CỐ Ý không phán xử — task-27-carry.md C-T25/2 nói rõ: đo trên pixel rồi mới quyết, và
    // nếu lệch thì đó là một mục cho review tổng KÈM SỐ ĐO, không phải chỗ để tự sửa. Ghi số vào
    // annotation để `--reporter=list` và trace đều đọc được.
    thongTin.annotations.push({
      type: 'titlebar',
      description:
        `bản vẽ 6px · /status mb=${status?.marginBottom} khe=${status?.khe}px · ` +
        `/dashboard mb=${dash?.marginBottom} khe=${dash?.khe}px · ` +
        `/reports mb=${reports?.marginBottom} khe=${reports?.khe}px`,
    })

    // Thứ DUY NHẤT ca này canh: cả ba trang đều thật sự có một titlebar dựng được và đo được.
    // Nếu một trang mất hẳn khoảng cách (0px) thì đó không còn là chuyện thẩm mỹ nữa.
    expect(dash!.khe).toBeGreaterThan(0)
    expect(reports!.khe).toBeGreaterThan(0)
    expect(status!.khe).toBeGreaterThan(0)
  })
})
