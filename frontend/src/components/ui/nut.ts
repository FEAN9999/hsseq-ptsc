// frontend/src/components/ui/nut.ts
//
// Chuỗi lớp của NÚT, một chỗ duy nhất. Trước vòng sửa 1 của Task 24 ba chuỗi này có hai bản chép
// nguyên văn (`features/report/FormModeBar.tsx` và `components/ui/Dialog.tsx`) — hai bản nghĩa là
// đổi chiều cao nút ở một nơi thì thanh dính và hộp thoại lệch nhau, mà không gì báo.
//
// Không dựng thành component `<Nut>`: hai nơi gọi truyền bộ thuộc tính khác hẳn nhau (thanh dính
// có `id` neo và `title`, hộp thoại có `disabled` theo hai nguồn), nên một component bọc sẽ chỉ là
// chỗ chuyển tiếp prop.

const NUT =
  'inline-flex items-center justify-center h-8 px-3.5 rounded-input border text-table font-medium whitespace-nowrap disabled:opacity-50'

/** Nút phụ trên nền trắng — "Huỷ" của hộp thoại, "Lưu" của thanh dính. */
export const NUT_THUONG = `${NUT} bg-surface border-hair text-ink transition-colors duration-[120ms] hover:bg-mutedbg`
/** Nút chính (xanh) — mỗi màn hình chỉ một cái. */
export const NUT_CHINH = `${NUT} bg-cyan border-cyanEdge text-white`
/** Nút phụ trên nền xám của thanh dính. */
export const NUT_GHOST = `${NUT} bg-transparent border-hair text-ink transition-colors duration-[120ms] hover:bg-mutedbg`
/** Nút chính ĐỎ — thao tác phá đi thứ người khác vừa làm (Trả lại). */
export const NUT_NGUY = `${NUT} bg-danger border-danger text-white`
