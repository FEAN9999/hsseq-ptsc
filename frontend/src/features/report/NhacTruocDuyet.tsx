// frontend/src/features/report/NhacTruocDuyet.tsx
//
// Khối Alert đầu form (mockup 04: "Hai điểm cần biết trước khi duyệt") — gom hai lời nhắc mà bản
// trước để rời thành hai banner xám xếp chồng.
//
// Gom lại vì chúng là MỘT câu hỏi: "trước khi tôi bấm nút, có gì tôi cần biết không?". Hai banner
// riêng, cùng màu xám, cùng giọng, đứng cạnh hai banner lỗi khác — người đọc phải tự phân loại.
// Một khối, đúng số điểm, kèm một lối nhảy tới chỗ cần xem, thì không phải phân loại gì cả.
//
// TIÊU ĐỀ đi theo QUYỀN, không viết cứng "trước khi duyệt" như bản vẽ: người nộp cũng thấy khối
// này, và với họ mốc sắp tới là NỘP. Số điểm cũng đếm thật (một hoặc hai) — in "Hai điểm" khi chỉ
// có một điểm là nói sai ngay ở dòng đầu tiên.
//
// KHÔNG hiện gì khi cả hai điểm đều vắng: một khối "không có gì đáng lo" chiếm chỗ vĩnh viễn trên
// màn hình 53 dòng là thứ người ta học cách không nhìn nữa.
import { ArrowRight, TriangleAlert } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { formatPeriod } from '../../lib/format'
import { maNeo } from './FormModeBar'

/** Tối đa bao nhiêu mã chỉ tiêu lệch được liệt thẳng trong câu. Hơn thì "+n" — một câu dài 14 mã
 *  không còn là một lời nhắc, nó là một danh sách. */
const MA_HIEN_TOI_DA = 3

const SO_CHU = ['Không', 'Một', 'Hai']

export function NhacTruocDuyet({
  kyChuaTinh,
  maLech,
  coQuyenDuyet,
  onNhayToiO,
}: {
  /** `missing_periods` của báo cáo — các kỳ trước chưa duyệt nên chưa vào cột lũy kế. */
  kyChuaTinh: string[]
  /** Mã các chỉ tiêu có bộ đếm lệch công thức mà chưa có ghi chú. */
  maLech: string[]
  coQuyenDuyet: boolean
  /** Kéo tab về "Chỉ tiêu" trước khi neo "Tới ô đầu" nhảy — ô nó trỏ tới nằm trong bảng, và Radix
   *  gỡ nội dung tab không hoạt động khỏi DOM, nên bấm từ tab khác sẽ không làm gì cả. */
  onNhayToiO?: () => void
}) {
  const diem: React.ReactNode[] = []

  if (kyChuaTinh.length > 0) {
    diem.push(
      <span key="ky">
        Lũy kế chưa tính kỳ <b className="font-semibold">{kyChuaTinh.map(formatPeriod).join(', ')}</b> (chưa
        duyệt) — cột "Lũy kế tháng trước" sẽ đổi khi kỳ đó được duyệt.
      </span>,
    )
  }

  if (maLech.length > 0) {
    const hien = maLech.slice(0, MA_HIEN_TOI_DA)
    diem.push(
      <span key="lech">
        <b className="font-semibold">{maLech.length} bộ đếm</b> lệch công thức chưa có ghi chú (
        {hien.join(', ')}
        {maLech.length > hien.length && ` +${maLech.length - hien.length}`}) — không chặn nộp.
      </span>,
    )
  }

  if (diem.length === 0) return null

  return (
    // `role="status"` đè `role="alert"` mặc định của primitive: khối này là bối cảnh có sẵn khi
    // mở trang, không phải một sự kiện vừa xảy ra — `alert` làm trình đọc màn hình cắt ngang câu
    // đang đọc (cùng lý do fix-1 S12 đã chọn `status` cho banner lũy kế).
    //
    // Màu warning đặt bằng lớp thay vì thêm một `variant` vào `ui/alert.tsx`: ba token
    // `--warning*` là phần THÊM của gói handoff, không thuộc bộ chuẩn shadcn, nên để primitive
    // nguyên bản thì lần `shadcn add alert` sau không nuốt mất nó.
    <Alert
      role="status"
      className="mb-3 border-warning bg-warning-bg px-4 py-3 text-warning-foreground *:[svg]:text-warning"
    >
      <TriangleAlert />
      <AlertTitle className="text-warning-foreground">
        {SO_CHU[diem.length] ?? diem.length} điểm cần biết trước khi {coQuyenDuyet ? 'duyệt' : 'nộp'}
      </AlertTitle>
      <AlertDescription className="text-warning-foreground [&>span]:block [&>span]:leading-[1.55]">
        {diem.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </AlertDescription>
      {/* Lối nhảy chỉ hiện khi CÓ chỗ để nhảy tới. Điểm "lũy kế chưa tính" nói về một kỳ KHÁC,
          không có ô nào trên trang này để chỉ vào. */}
      {maLech.length > 0 && (
        <AlertAction className="top-1/2 right-4 -translate-y-1/2">
          <a
            href={`#${maNeo(maLech[0])}`}
            onClick={onNhayToiO}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-warning-foreground no-underline hover:underline"
          >
            Tới ô đầu
            <ArrowRight className="size-4" />
          </a>
        </AlertAction>
      )}
    </Alert>
  )
}
