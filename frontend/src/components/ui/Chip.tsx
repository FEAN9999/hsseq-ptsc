import { Badge } from './badge'

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
  approved: 'text-success-foreground',
  submitted: 'text-warning-foreground',
  late: 'text-warning-foreground',
  returned: 'text-destructive',
  draft: 'text-secondary-foreground',
  missing: 'text-muted-foreground',
}

// Nền riêng theo kind — cùng lý do tách KIND_BORDER (fix S1, vòng sửa 1): utility background-color
// trong Tailwind cùng độ đặc hiệu, đứng sau trong CSS build ra là thắng bất kể thứ tự viết trong
// JSX. Vòng sửa 3 — P1: trước đây outline CỘNG THÊM 'bg-transparent' cạnh bg-* của kind thay vì
// THAY THẾ, nên kind nào có nền đứng SAU 'bg-transparent' trong CSS thật (submitted/late:
// bg-warning-bg) vẫn thắng, chip outline hiện nền vàng thay vì trong suốt — đúng lỗi S1, chỉ khác
// background-color thay vì border-color. Sửa triệt để như S1: tách bg-* khỏi KIND_TEXT, để mỗi
// chip chỉ được phép có ĐÚNG MỘT utility background-color (xem hàm Chip bên dưới).
const KIND_BG: Record<ChipKind, string> = {
  approved: 'bg-success-bg',
  submitted: 'bg-warning-bg',
  late: 'bg-warning-bg',
  returned: 'bg-destructive-bg',
  draft: 'bg-muted',
  missing: 'bg-transparent',
}

// Viền riêng theo kind — kind nào mockup không có viền thì cấp border-transparent ngay tại đây
// (không để trống: bỏ trống thì border-color mặc định là currentColor, viền sẽ ăn theo màu chữ).
//
// `draft` LỆCH khỏi mockup status.html một cách có chủ ý: nó có viền, mockup thì không. Lý do đo
// được — nền của nó là `bg-muted` (oklch L 0.97), mà ở lưới /status cột kỳ ĐANG CHỌN tô
// `bg-primary/5` ≈ L 0.96 (StatusGrid.tsx `O_KY_CHON`). Chênh 1% độ sáng: ở cỡ thật chip "Nháp"
// đọc như CHỮ TRẦN trong khi mọi ô cạnh nó đọc như huy hiệu — người xem lưới sẽ đọc ô đó là
// "chưa có gì" thay vì "có bản nháp". `--border` (L 0.923) tách bạch với CẢ HAI nền nên viền nhìn
// rõ ở mọi ngữ cảnh chip này xuất hiện: lưới /status, bảng /reports, đầu form (nền `bg-card`).
// Đây là cùng cách `missing` đã dùng, không phải một lối vẽ mới.
const KIND_BORDER: Record<ChipKind, string> = {
  approved: 'border-transparent',
  submitted: 'border-transparent',
  late: 'border-transparent',
  returned: 'border-transparent',
  draft: 'border-border',
  missing: 'border-border',
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

  // Vỏ TRÌNH BÀY là primitive `ui/badge.tsx`, không còn chuỗi utility tự vẽ (README gói bàn giao
  // mục 12: `ui/Chip.tsx` → `Badge`). Ba bảng màu ở trên vẫn cấp qua `className` chứ KHÔNG thành
  // variant mới trong `badge.tsx`: sáu màu này dựng trên token `--success*`/`--warning*` là phần
  // THÊM của gói bàn giao, không thuộc bộ chuẩn shadcn, nên lần `shadcn add badge` sau sẽ nuốt
  // mất. Cùng tiền lệ `features/report/NhacTruocDuyet.tsx` đã đặt với `Alert`.
  //
  // `rounded-md` (README in đậm: KHÔNG phải pill) ghi đè `rounded-4xl` mặc định của Badge.
  //
  // `variant="outline"` chọn vì `cn` (clsx + tailwind-merge) GỠ HẲN utility bị ghi đè khỏi chuỗi:
  // `border-border`/`text-foreground` của variant và `border-transparent` của lớp nền Badge biến
  // mất khi ba lớp dưới đây có mặt, nên mỗi chip vẫn chỉ còn ĐÚNG MỘT utility background-color,
  // MỘT border-color, MỘT color ở trạng thái nghỉ — đúng bất biến mà fix S1 và vòng sửa 3 — P1
  // phải trả giá mới có. Phần còn lại của variant (`[a]:hover:*`) biên dịch ra `:is(a):hover`, mà
  // chip luôn là <span> (kể cả khi StatusGrid bọc nó trong <Link>), nên không bao giờ khớp.
  return (
    <Badge
      variant="outline"
      className={`rounded-md ${bgClass} ${KIND_TEXT[kind]} ${borderClass}`}
      data-testid={testId}
      aria-disabled={ariaDisabled ? 'true' : undefined}
    >
      {LABEL[kind]}
    </Badge>
  )
}
