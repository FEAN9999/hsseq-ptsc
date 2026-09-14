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
  dangNhap,
  idBaoCao,
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

test.describe('phân đoạn 2 của buổi demo', () => {
  test.beforeEach(() => {
    resetDemo()
  })

  test('người nộp sửa và nộp, admin trả lại rồi duyệt, dashboard thành 22/22', async ({
    browser,
    request,
  }) => {
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

    // ── 8. Admin duyệt, dashboard đổi số NGAY, không một lần sleep nào ─────────────────────────
    await p2.reload()
    await p2.getByRole('button', { name: 'Duyệt' }).click()
    await p2.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click()

    // Toast tự tắt sau 4 s (Toast.TOAST_MS) — bấm ngay, không chen khẳng định chậm nào vào giữa.
    await p2.getByRole('link', { name: 'Xem dashboard' }).click()
    await p2.waitForURL('**/dashboard')

    // KHÔNG waitForTimeout: invalidateReportQueries phải làm dashboard đổi số ngay.
    await expect(p2.getByText('Tổng từ 22 báo cáo đã duyệt')).toBeVisible()
    // Và đổi ĐÚNG LƯỢNG: "không còn là 21" chưa đủ, con số phải cộng thêm đúng LTI của đơn vị vừa
    // được duyệt. Đây là chỗ phân biệt "cache đã làm mới" với "cache trả về số nào cũng được".
    await expect(oKpi(p2, 'LTI trong kỳ')).not.toContainText('—')
    expect(await soKpi(p2, 'LTI trong kỳ')).toBe((ltiTruoc ?? 0) + (ltiP05 ?? 0))

    await nguoiNop.close()
    await admin.close()
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

  test('C-T24/1 — Ctrl+S ở một dòng giữa bảng không làm trang nhảy cuộn, và vẫn lưu thật', async ({
    page,
    request,
  }) => {
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
    await o.fill('9')
    await page.keyboard.press('Control+s')
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
  })

  test('C-T24/2 — hộp thoại z-50 nằm trên MỌI lớp dính, đo bằng phép bắn tia trên pixel', async ({
    page,
    request,
  }) => {
    const idP05 = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)
    await dangNhap(page, 'u22@ptsc.local')
    await page.goto(`/reports/${idP05}`)
    await expect(page.locator('tbody tr')).toHaveCount(62)

    // "Chỉ tiêu" chứ không phải "Tháng này": ở viewport 1024×640, bảng rộng hơn khung
    // `overflow-auto` của nó nên cột "Tháng này" nằm NGOÀI phần đang thấy — `boundingBox()` vẫn
    // trả hộp của nó (Playwright không cắt theo khung cha), và điểm giữa hộp đó rơi trúng mục lục
    // bên phải. Cột đầu luôn nằm trong tầm nhìn ở cả hai viewport, và nó cũng `sticky top-0 z-20`
    // y hệt — vẫn đúng lớp cần đo.
    const headerDinh = page.getByRole('columnheader', { name: 'Chỉ tiêu' })
    const thanhDinh = page.getByRole('button', { name: 'Nộp báo cáo' })
    await expect(headerDinh).toBeInViewport()
    await expect(thanhDinh).toBeInViewport()
    const diem = async (l: Locator) => {
      const h = await l.boundingBox()
      if (h === null) throw new Error('không lấy được hộp bao')
      return { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) }
    }
    const diemHeader = await diem(headerDinh)
    const diemThanh = await diem(thanhDinh)

    // ĐỐI CHỨNG ÂM trước: khi CHƯA mở hộp thoại, hai điểm đó phải trúng đúng hai lớp dính. Không
    // có bước này thì phép đo sau chỉ chứng minh "toạ độ trỏ vào chỗ trống".
    const truoc = await page.evaluate(
      ([a, b]) => {
        const ten = (e: Element | null) => (e ? `${e.tagName.toLowerCase()}:${(e.textContent ?? '').slice(0, 24)}` : 'null')
        return [
          ten(document.elementFromPoint(a.x, a.y)),
          ten(document.elementFromPoint(b.x, b.y)),
        ]
      },
      [diemHeader, diemThanh],
    )
    expect(truoc[0], 'điểm đo không trúng header cột dính').toContain('Chỉ tiêu')
    expect(truoc[1], 'điểm đo không trúng thanh dưới dính').toContain('Nộp báo cáo')

    await thanhDinh.click()
    const hop = page.getByRole('dialog')
    await expect(hop).toBeVisible()

    // Phép đo thật: phần tử NẰM TRÊN CÙNG tại đúng hai điểm đó phải thuộc lớp phủ của hộp thoại.
    // `Dialog` cố ý KHÔNG gọi `showModal()` nên không có top-layer — `z-50` là thứ duy nhất giữ nó
    // trên `z-20` của header dính và trên thanh dưới (`z-auto`). Trước nay chỉ được kiểm bằng suy
    // luận trên CSS; đây là phép đo trên pixel.
    const ketQua = await page.evaluate(
      ([a, b]) => {
        const lop = document.querySelector('div.fixed.inset-0.z-50')
        const trong = (x: number, y: number) => {
          const el = document.elementFromPoint(x, y)
          return {
            thuocLopPhu: lop !== null && el !== null && lop.contains(el),
            the: el ? `${el.tagName.toLowerCase()}:${(el.textContent ?? '').slice(0, 24)}` : 'null',
          }
        }
        return { header: trong(a.x, a.y), thanh: trong(b.x, b.y), zIndex: lop ? getComputedStyle(lop).zIndex : null }
      },
      [diemHeader, diemThanh],
    )
    expect(ketQua.zIndex, 'lớp phủ hộp thoại phải có z-index tường minh').toBe('50')
    expect(ketQua.header.thuocLopPhu, `header cột dính vẫn nổi trên hộp thoại: ${ketQua.header.the}`).toBe(true)
    expect(ketQua.thanh.thuocLopPhu, `thanh dưới dính vẫn nổi trên hộp thoại: ${ketQua.thanh.the}`).toBe(true)

    // Và phần tử bên dưới KHÔNG CÒN bấm được — vế "nút của nó làm gì" của lớp phủ. Bấm vào đúng
    // toạ độ nút "Nộp báo cáo" lúc này không được mở thêm hộp thoại thứ hai.
    await page.mouse.click(diemThanh.x, diemThanh.y)
    await expect(page.getByRole('dialog')).toHaveCount(1)

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
