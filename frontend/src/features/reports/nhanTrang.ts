// frontend/src/features/reports/nhanTrang.ts
//
// MỘT nguồn duy nhất cho nhãn của trang `/reports`. Trang này đổi tên theo QUYỀN, và trước Lát 6
// cái tên đó được viết ra ở HAI chỗ độc lập: mục nav trên `components/Sidebar.tsx` (đúng theo
// quyền) và vệt breadcrumb trên `components/AppShell.tsx` (ghi cứng "Duyệt báo cáo"). Hệ quả đo
// được: một người chỉ có quyền nộp mở `/reports` thì mục nav bên trái ghi "Báo cáo của đơn vị"
// còn breadcrumb ngay trên đầu ghi "Duyệt báo cáo" — hứa một quyền họ không có, trên chính màn
// hình họ dùng nhiều nhất.
//
// Ba nhánh LOẠI TRỪ NHAU, đúng thứ tự — người có `report.approve` cũng có `report.view_own_unit`,
// nên thứ tự ở đây là thứ tự ưu tiên, không phải một chuỗi `if` tuỳ ý:
//   1. report.approve  → "Duyệt báo cáo"       (duyệt được)
//   2. report.view_all → "Báo cáo"             (xem mọi đơn vị, không duyệt — vai viewer)
//   3. report.edit|submit|view_own_unit → "Báo cáo của đơn vị" (vai reporter)
// `null` = không có quyền nào chạm tới trang này ⇒ Sidebar không dựng mục nav.
export function nhanTrangBaoCao(quyen: Set<string>): string | null {
  if (quyen.has('report.approve')) return 'Duyệt báo cáo'
  if (quyen.has('report.view_all')) return 'Báo cáo'
  if (quyen.has('report.edit') || quyen.has('report.submit') || quyen.has('report.view_own_unit'))
    return 'Báo cáo của đơn vị'
  return null
}
