export type ChipKind = 'approved' | 'submitted' | 'late' | 'returned' | 'draft' | 'missing'

// Nhãn tiếng Việt — bắt buộc theo CONTEXT.md, chữ trên giao diện luôn là tiếng Việt.
const LABEL: Record<ChipKind, string> = {
  approved: 'Đã duyệt',
  submitted: 'Đã nộp',
  late: 'Đã nộp (muộn)',
  returned: 'Trả lại',
  draft: 'Nháp',
  missing: 'Chưa nộp',
}

// Màu nền/chữ theo tokens.css: .c-ok/.c-sub/.c-ret/.c-draft/.c-none — "late" dùng chung màu với
// "submitted" (đúng mockup status.html). KHÔNG chứa border-* ở đây — xem KIND_BORDER bên dưới:
// utility border-color trong Tailwind cùng độ đặc hiệu, đứng sau trong CSS build ra là thắng bất
// kể thứ tự viết trong JSX (fix S1) — nên mỗi chip chỉ được phép có ĐÚNG MỘT utility border-<màu>,
// tách hẳn khỏi bg/text để không bao giờ có hai utility border-color cùng lúc trong className.
const KIND_CLASS: Record<ChipKind, string> = {
  approved: 'bg-successBg text-success',
  submitted: 'bg-warningBg text-warning',
  late: 'bg-warningBg text-warning',
  returned: 'bg-dangerBg text-danger',
  draft: 'bg-mutedbg text-draft',
  missing: 'bg-transparent text-sec',
}

// Viền riêng theo kind — kind nào mockup không có viền thì cấp border-transparent ngay tại đây
// (không để trống: bỏ trống thì border-color mặc định là currentColor, viền sẽ ăn theo màu chữ).
const KIND_BORDER: Record<ChipKind, string> = {
  approved: 'border-transparent',
  submitted: 'border-transparent',
  late: 'border-transparent',
  returned: 'border-transparent',
  draft: 'border-transparent',
  missing: 'border-hair',
}

export function Chip({ kind, outline }: { kind: ChipKind; outline?: boolean }) {
  // outline (D6: nạp từ file tổng hợp) THAY THẾ viền của kind bằng border-current, không cộng
  // thêm — nếu cộng thêm sẽ tái tạo đúng lỗi cascade đã sửa (hai utility border-color cùng lúc).
  const borderClass = outline ? 'border-current' : KIND_BORDER[kind]

  const classes = [
    'inline-block h-6 leading-[22px] px-2.5 rounded-full border text-xs font-medium whitespace-nowrap',
    KIND_CLASS[kind],
    borderClass,
    outline && 'bg-transparent',
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{LABEL[kind]}</span>
}
