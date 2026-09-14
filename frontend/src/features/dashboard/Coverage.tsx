// frontend/src/features/dashboard/Coverage.tsx
//
// Thanh coverage — nói "ai chưa nộp" MỘT LẦN DUY NHẤT trên trang (D9: không footer giải thích,
// không lặp lại ở đâu khác). `approvedCount === 0` thay HẲN bằng câu khác (carry C5): số 0 đọc như
// "không có tai nạn" trong khi sự thật là "chưa ai duyệt".
//
// Toàn bộ MỘT dòng text phẳng (không tách <b> theo mockup) — testing-library gộp text theo TỪNG
// phần tử (chỉ nối các text-node con TRỰC TIẾP, bỏ qua text nằm trong thẻ con lồng — xem
// getNodeText trong @testing-library/dom); tách <b> giữa dòng sẽ làm một khẳng định substring của
// test (regex xuyên qua chỗ nối) không còn khớp trên phần tử cha nữa. Đánh đổi lấy chắc chắn hơn
// đúng-hệt-mockup về mặt đậm/nhạt, thứ mockup không có test nào khoá.
import { formatNumber, formatPeriod } from '../../lib/format'

const SO_TEN_TOI_DA = 4

interface MissingUnit {
  code: string
  name: string
}

export function Coverage({
  periodKey,
  reportingUnits,
  approvedCount,
  submittedCount,
  missingUnits,
}: {
  periodKey: string
  reportingUnits: number
  approvedCount: number
  submittedCount: number
  missingUnits: MissingUnit[]
}) {
  if (approvedCount === 0) {
    return (
      <div className="text-sec text-table mb-5">
        Chưa có báo cáo được duyệt · Đã nộp {formatNumber(submittedCount, 0)}/{formatNumber(reportingUnits, 0)}
      </div>
    )
  }

  const ten = missingUnits
    .slice(0, SO_TEN_TOI_DA)
    .map((u) => u.name)
    .join(', ')
  const con = missingUnits.length - SO_TEN_TOI_DA
  const phanChuaNop =
    missingUnits.length > 0 ? ` · Chưa nộp ${missingUnits.length}: ${ten}${con > 0 ? `, +${con}` : ''}` : ''

  return (
    <div className="text-sec text-table mb-5">
      Kỳ {formatPeriod(periodKey)} · Toàn Tổng công ty · {formatNumber(reportingUnits, 0)} đầu mối · Tổng từ{' '}
      {formatNumber(approvedCount, 0)} báo cáo đã duyệt · Chờ duyệt {formatNumber(submittedCount, 0)}
      {phanChuaNop}
    </div>
  )
}
