// frontend/src/features/status/useCopyMissing.ts
//
// Nút "Sao chép danh sách chưa nộp" (mockup status.html, ghi chú bản vẽ: "nút sao chép danh sách
// chưa nộp vào clipboard + toast 'Đã sao chép n đơn vị' thay cho xuất file (D6)"). Dùng CHUNG
// `toast()` của sonner (lát 5) — không tự dựng cơ chế toast riêng cho trang này.
//
// Nhận thẳng `string[]` (tên đơn vị đã lọc sẵn), không nhận đối tượng đơn vị đầy đủ: hook chỉ lo
// HAI việc (ghi clipboard, hiện toast), việc "đơn vị nào chưa nộp ở kỳ nào" là của nơi gọi
// (Status.tsx) — theo đúng ranh giới trang tự lo dữ liệu, hook tự lo một hành vi UI.
import { toast } from 'sonner'

export function useCopyMissing() {
  return async function saoChepDanhSachChuaNop(tenDonViChuaNop: string[]): Promise<void> {
    // task-26-fix-1.md Q7 [NHẸ]: `writeText` reject là chế độ hỏng CÓ TÀI LIỆU của API này (mất
    // focus tài liệu, ngữ cảnh không bảo mật, người dùng chặn quyền) — không phải tình huống bịa.
    // Đã `await` (tức đã quyết định quan tâm tới kết quả) nên phải xử lý trọn vẹn, không bỏ dở nửa
    // chừng: bọc try/catch để (1) người dùng luôn thấy toast dù thành công hay hỏng, và (2) Promise
    // trả về KHÔNG BAO GIỜ reject nữa — nơi gọi (Status.tsx: `onClick={() => saoChep(...)}`) vứt bỏ
    // Promise này an toàn, không còn unhandled rejection.
    try {
      await navigator.clipboard.writeText(tenDonViChuaNop.join('\n'))
      toast(`Đã sao chép ${tenDonViChuaNop.length} đơn vị`)
    } catch {
      toast('Không sao chép được, thử lại')
    }
  }
}
