// frontend/src/components/ui/nut.ts
//
// Chuỗi lớp của NÚT, một chỗ duy nhất. Trước vòng sửa 1 của Task 24 ba chuỗi này có hai bản chép
// nguyên văn (`features/report/FormModeBar.tsx` và `components/ui/DialogXacNhan.tsx`) — hai bản nghĩa là
// đổi chiều cao nút ở một nơi thì thanh dính và hộp thoại lệch nhau, mà không gì báo.
//
// Không dựng thành component `<Nut>`: hai nơi gọi truyền bộ thuộc tính khác hẳn nhau (thanh dính
// có `id` neo và `title`, hộp thoại có `disabled` theo hai nguồn), nên một component bọc sẽ chỉ là
// chỗ chuyển tiếp prop.

const NUT =
  'inline-flex items-center justify-center h-8 px-3.5 rounded-md border text-sm font-medium whitespace-nowrap disabled:opacity-50'

/** Nút phụ trên nền trắng — "Huỷ" của hộp thoại, "Lưu" của thanh dính. */
export const NUT_THUONG = `${NUT} bg-card border-border text-foreground transition-colors duration-[120ms] hover:bg-muted`
/** Nút chính (xanh) — mỗi màn hình chỉ một cái. */
export const NUT_CHINH = `${NUT} bg-primary border-primary text-white`
/** Nút phụ trên nền xám của thanh dính. */
export const NUT_GHOST = `${NUT} bg-transparent border-border text-foreground transition-colors duration-[120ms] hover:bg-muted`
/** Nút chính ĐỎ — thao tác phá đi thứ người khác vừa làm (Trả lại). */
export const NUT_NGUY = `${NUT} bg-destructive border-destructive text-white`
