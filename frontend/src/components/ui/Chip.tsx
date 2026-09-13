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

// Màu theo tokens.css: .c-ok/.c-sub/.c-ret/.c-draft/.c-none — "late" dùng chung màu với "submitted" (đúng mockup status.html).
const KIND_CLASS: Record<ChipKind, string> = {
  approved: 'bg-successBg text-success',
  submitted: 'bg-warningBg text-warning',
  late: 'bg-warningBg text-warning',
  returned: 'bg-dangerBg text-danger',
  draft: 'bg-mutedbg text-draft',
  missing: 'bg-transparent border-hair text-sec',
}

export function Chip({ kind, outline }: { kind: ChipKind; outline?: boolean }) {
  const classes = [
    'inline-block h-6 leading-[22px] px-2.5 rounded-full border border-transparent text-xs font-medium whitespace-nowrap',
    KIND_CLASS[kind],
    // outline (D6: nạp từ file tổng hợp) = nền trong suốt, viền theo màu chữ hiện tại
    outline && 'bg-transparent border-current',
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{LABEL[kind]}</span>
}
