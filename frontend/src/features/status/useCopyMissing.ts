// frontend/src/features/status/useCopyMissing.ts
//
// Nút "Sao chép danh sách chưa nộp" (mockup status.html, ghi chú bản vẽ: "nút sao chép danh sách
// chưa nộp vào clipboard + toast 'Đã sao chép n đơn vị' thay cho xuất file (D6)"). Dùng CHUNG
// useToast() (Task 15) — không tự dựng cơ chế toast riêng cho trang này.
//
// Nhận thẳng `string[]` (tên đơn vị đã lọc sẵn), không nhận đối tượng đơn vị đầy đủ: hook chỉ lo
// HAI việc (ghi clipboard, hiện toast), việc "đơn vị nào chưa nộp ở kỳ nào" là của nơi gọi
// (Status.tsx) — theo đúng ranh giới trang tự lo dữ liệu, hook tự lo một hành vi UI.
import { useToast } from '../../components/ui/Toast'

export function useCopyMissing() {
  const hienToast = useToast()
  return async function saoChepDanhSachChuaNop(tenDonViChuaNop: string[]): Promise<void> {
    await navigator.clipboard.writeText(tenDonViChuaNop.join('\n'))
    hienToast(`Đã sao chép ${tenDonViChuaNop.length} đơn vị`)
  }
}
