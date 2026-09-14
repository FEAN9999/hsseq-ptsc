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

// Chữ theo tokens.css: .c-ok/.c-sub/.c-ret/.c-draft/.c-none — "late" dùng chung màu với
// "submitted" (đúng mockup status.html). Nền tách riêng ở KIND_BG bên dưới — xem lý do ở đó.
const KIND_TEXT: Record<ChipKind, string> = {
  approved: 'text-success',
  submitted: 'text-warning',
  late: 'text-warning',
  returned: 'text-danger',
  draft: 'text-draft',
  missing: 'text-sec',
}

// Nền riêng theo kind — cùng lý do tách KIND_BORDER (fix S1, vòng sửa 1): utility background-color
// trong Tailwind cùng độ đặc hiệu, đứng sau trong CSS build ra là thắng bất kể thứ tự viết trong
// JSX. Vòng sửa 3 — P1: trước đây outline CỘNG THÊM 'bg-transparent' cạnh bg-* của kind thay vì
// THAY THẾ, nên kind nào có nền đứng SAU 'bg-transparent' trong CSS thật (submitted/late:
// bg-warningBg) vẫn thắng, chip outline hiện nền vàng thay vì trong suốt — đúng lỗi S1, chỉ khác
// background-color thay vì border-color. Sửa triệt để như S1: tách bg-* khỏi KIND_TEXT, để mỗi
// chip chỉ được phép có ĐÚNG MỘT utility background-color (xem hàm Chip bên dưới).
const KIND_BG: Record<ChipKind, string> = {
  approved: 'bg-successBg',
  submitted: 'bg-warningBg',
  late: 'bg-warningBg',
  returned: 'bg-dangerBg',
  draft: 'bg-mutedbg',
  missing: 'bg-transparent',
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

// Task 26: testId/ariaDisabled — hai prop TUỲ CHỌN, mặc định không render thuộc tính nào (không
// đổi hành vi các nơi gọi cũ — Reports.tsx/UnitsTable.tsx không truyền, không lệch). Lưới /status
// cần định vị TỪNG Ô qua data-testid `o-<mã đơn vị>-<kỳ>` và đánh dấu ô "Chưa nộp" không bấm được
// ngay trên CHÍNH phần tử mang màu nền (StatusGrid.tsx) — không dựng thêm một <span> bọc ngoài chỉ
// để gắn hai thuộc tính này (sẽ tách "phần tử có nền" khỏi "phần tử có testid/aria-disabled" thành
// hai phần tử khác nhau, làm mù ca test giống lỗi C2 đã sửa).
export function Chip({
  kind,
  outline,
  testId,
  ariaDisabled,
}: {
  kind: ChipKind
  outline?: boolean
  testId?: string
  ariaDisabled?: boolean
}) {
  // outline (D6: nạp từ file tổng hợp) THAY THẾ viền lẫn nền của kind bằng border-current /
  // bg-transparent, không cộng thêm — nếu cộng thêm sẽ tái tạo đúng lỗi cascade đã sửa (hai
  // utility cùng thuộc tính cùng lúc), như P1 đã chứng minh xảy ra thật với background-color.
  const borderClass = outline ? 'border-current' : KIND_BORDER[kind]
  const bgClass = outline ? 'bg-transparent' : KIND_BG[kind]

  const classes = [
    'inline-block h-6 leading-[22px] px-2.5 rounded-full border text-xs font-medium whitespace-nowrap',
    bgClass,
    KIND_TEXT[kind],
    borderClass,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} data-testid={testId} aria-disabled={ariaDisabled ? 'true' : undefined}>
      {LABEL[kind]}
    </span>
  )
}
