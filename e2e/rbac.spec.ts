// e2e/rbac.spec.ts
//
// Ba ca ÂM về phân quyền. "Mặt âm là nơi lỗi trốn" (5 trong 7 lỗ của Task 26 nằm ở đó), nhưng một
// ca âm đứng MỘT MÌNH lại là ca dễ xanh giả nhất trên đời: `toHaveCount(0)` cũng đúng khi trang
// trắng, khi selector gõ sai, khi phiên rụng giữa chừng. Vì vậy mỗi ca dưới đây đi kèm một ĐỐI
// CHỨNG DƯƠNG trên cùng một trang, cùng một dữ liệu, chỉ khác tài khoản — thứ sẽ ĐỎ nếu ca âm
// đang xanh vì lý do sai.
import { expect, test } from '@playwright/test'

import { CO_THE_RESET, DON_VI_U22, boQuaNeuKhongResetDuoc, dangNhap, idBaoCao, resetDemo, tokenApi } from './helpers'

/** `beforeAll` chứ không `beforeEach`: không ca nào trong file này làm đổi dữ liệu, nên một lượt
 *  reset là đủ — và `reset_demo.py` xoá rồi nạp lại toàn bộ bảng `report`, chạy thừa là mất thời
 *  gian thật chứ không phải phòng xa.
 *
 *  S1 (vòng sửa 1): KHÔNG gọi `test.skip()` ở đây — trong `beforeAll` nó bỏ qua CẢ TỆP, kể cả hai
 *  ca chỉ-đọc vốn chạy được ở mọi môi trường. Ca duy nhất cần trạng thái sạch (người xem, phải có
 *  một báo cáo NHÁP) tự khai báo bỏ qua trong thân nó. */
test.beforeAll(() => {
  if (CO_THE_RESET) resetDemo()
})

test('người nộp mở báo cáo đơn vị khác thì thấy trang 403 (và trang của chính mình vẫn mở được)', async ({
  page,
  request,
}) => {
  // Brief viết `/reports/9999`. Sai: `api/reports.py:113` tra báo cáo TRƯỚC khi xét phạm vi, id
  // không tồn tại là `NotFoundError` → 404 → màn "Không tìm thấy báo cáo". Ca sẽ ĐỎ mà chẳng bao
  // giờ chạm tới nhánh 403. Phải lấy id THẬT của một đơn vị KHÁC — và id thật đổi sau mỗi lượt
  // reset (sequence tăng dần), nên phải tra chứ không viết cứng.
  const tokenAdmin = await tokenApi(request, 'admin@ptsc.local')
  const idDonViKhac = await idBaoCao(request, tokenAdmin, DON_VI_U22) // P05, không phải U01
  const idCuaMinh = await idBaoCao(request, tokenAdmin, 'U01')

  await dangNhap(page, 'u01@ptsc.local')

  await page.goto(`/reports/${idDonViKhac}`)
  await expect(page.getByText('Bạn không có quyền xem báo cáo này')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Về báo cáo của đơn vị' })).toBeVisible()
  // Mặt âm: không được để lọt một mảnh nào của form ra màn — 403 mà vẫn vẽ bảng chỉ tiêu thì số
  // liệu đơn vị khác đã rò rồi, dù có kèm câu từ chối.
  await expect(page.locator('table')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Lưu|Nộp|Duyệt|Trả lại/ })).toHaveCount(0)

  // Nút của nó LÀM GÌ: lối thoát phải dẫn về đúng danh sách của đơn vị mình.
  await page.getByRole('link', { name: 'Về báo cáo của đơn vị' }).click()
  await page.waitForURL('**/reports')
  await expect(page.getByRole('heading', { name: /Báo cáo SKATMT/ })).toBeVisible()

  // ĐỐI CHỨNG DƯƠNG: cùng tài khoản, cùng route, báo cáo của CHÍNH đơn vị mình thì mở bình thường.
  // Thiếu bước này, một phiên rụng hay một lỗi tải chung cũng cho ra đúng những khẳng định trên.
  await page.goto(`/reports/${idCuaMinh}`)
  await expect(page.getByRole('heading', { name: /FM01 · 08\/2026/ })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(62)
  await expect(page.getByText('Bạn không có quyền xem báo cáo này')).toHaveCount(0)
})

test('người xem không có nút Lưu hay Nộp trên chính báo cáo mà người nộp sửa được', async ({
  page,
  request,
}) => {
  boQuaNeuKhongResetDuoc()
  // Báo cáo phải đang ở trạng thái SỬA ĐƯỢC (nháp). Chọn một báo cáo đã duyệt thì `suaDuoc` false
  // vì TRẠNG THÁI, và ca sẽ xanh mà không nói gì về quyền — đúng kiểu "ca chỉ chứng minh một thứ
  // tồn tại" mà sáu vòng của Task 26 phải trả giá.
  const idNhap = await idBaoCao(request, await tokenApi(request, 'admin@ptsc.local'), DON_VI_U22)

  await dangNhap(page, 'viewer@ptsc.local')
  await page.goto(`/reports/${idNhap}`)
  // Chờ trang LẮNG bằng một mốc chắc chắn: form đã vẽ đủ 62 dòng. Không có mốc này thì
  // `toHaveCount(0)` phía dưới thoả ngay ở khung hình skeleton — bằng chứng rỗng.
  await expect(page.locator('tbody tr')).toHaveCount(62)
  await expect(page.getByRole('heading', { name: /FM01 · 08\/2026/ })).toBeVisible()

  await expect(page.getByRole('button', { name: /Lưu|Nộp|Duyệt|Trả lại/ })).toHaveCount(0)
  // Không nút thì cũng không được còn ô nhập nào: ẩn nút mà vẫn cho gõ là rò quyền qua cửa sau.
  await expect(page.locator('td[data-cot] input')).toHaveCount(0)
  await expect(page.locator('textarea')).toHaveCount(0)

  // ĐỐI CHỨNG DƯƠNG: cùng báo cáo, cùng trạng thái nháp, tài khoản có quyền thì thấy đủ nút và đủ
  // ô nhập. Đây là thứ chứng minh ba khẳng định âm ở trên nói về QUYỀN chứ không phải về trạng
  // thái báo cáo hay về một trang chưa tải xong.
  await dangNhap(page, 'u22@ptsc.local')
  await page.goto(`/reports/${idNhap}`)
  await expect(page.locator('tbody tr')).toHaveCount(62)
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nộp báo cáo' })).toBeVisible()
  await expect(page.locator('td[data-cot] input').first()).toBeVisible()
})

test('chưa đăng nhập vào /dashboard thì bị đẩy về /login kèm ?next= — và next= đưa được về chỗ cũ', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
  // Mặt âm: đá về /login mà vẫn vẽ dashboard phía sau thì mới là lỗi rò.
  await expect(page.getByRole('heading', { name: 'Dashboard SKATMT' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()

  // `next=` phải giữ CẢ query string (app/router.tsx dùng `pathname + search`, cùng quy ước với
  // client.ts) — mất query là mất bộ lọc người dùng đang đứng.
  await page.goto('/dashboard?period=2026-07')
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Fperiod%3D2026-07/)

  // Nút của nó LÀM GÌ: đăng nhập xong phải quay về ĐÚNG chỗ cũ, không phải về trang mặc định.
  // `tuMo: false` — đang đứng sẵn ở `/login?next=…`, điều hướng lại sẽ xoá mất chính cái `next=`.
  await dangNhap(page, 'admin@ptsc.local', { tuMo: false })
  await expect(page).toHaveURL(/\/dashboard\?period=2026-07/)
  await expect(page.getByRole('heading', { name: 'Dashboard SKATMT' })).toBeVisible()

  // Và khi ĐÃ có phiên, chính route đó không còn bị đá đi nữa — Ruling 204 (phiên sống qua một
  // lần tải lại, `sessionStorage`) là thứ làm `page.goto` sau đăng nhập không đăng xuất im lặng.
  // Không có khẳng định này, ca trên vẫn xanh cả khi mọi route đều đá về /login.
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Dashboard SKATMT' })).toBeVisible()
})
