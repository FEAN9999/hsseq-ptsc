// frontend/src/features/report/useDraftCache.ts
//
// Task 29 (task-29-scope.md): giữ SỐ ĐANG GÕ qua một phiên chết giữa chừng. Đường 401
// (`api/client.ts`) gọi `logout()` rồi `location.assign(...)` — một lượt CHUYỂN TRANG THẬT, xoá
// sạch mọi state trong bộ nhớ (kể cả reducer của `ReportForm`). Hook này là thứ duy nhất sống sót
// qua lượt chuyển trang đó.
//
// Khoá `sessionStorage`, KHÔNG `localStorage` — tiền đề đã đo (task-29-carry.md C-T29c):
// `session.ts:68` (`logout()`) chỉ `removeItem` đúng khoá `hseq.token` của nó, và không nơi nào
// trong `frontend/src` gọi `sessionStorage.clear()`/`localStorage.clear()`. Một khoá `draft:<id>`
// vì vậy sống sót qua đường 401. Khoá này KHÁC không gian tên với `hseq.token` — không ai tranh
// khoá nên không phải lỗi, chỉ là hai khoá độc lập.
//
// TÁCH KHỎI hàng chờ lưu (`useSaveValues.ts`, Task 23) — CỐ Ý không gộp: hàng chờ trả lời "gửi gì
// lên server" (chỉ ô đã ĐỔI từ lần lưu trước); cache này trả lời "vẽ lại gì sau khi trang chết"
// (mọi ô đang hiện trên màn hình, kể cả ô còn chưa rời để vào hàng chờ). `ReportForm.tsx` gọi cả
// hai ở cùng chỗ, không dùng cái này thay cái kia.

/** Một dòng nháp — khớp CẤU TRÚC với `ONhap` của `ReportForm.tsx` (không import ngược để tránh
 * vòng phụ thuộc; TypeScript so cấu trúc chứ không so tên nên hai bên vẫn khớp nhau khi gán). */
export interface DraftONhap {
  thisPeriod?: number | null
  accTotal?: number | null
}

export type DraftValues = Record<string, DraftONhap>

export interface DraftCache {
  /** Ghi ĐÈ toàn bộ bản nháp — nơi gọi tự chịu trách nhiệm truyền đủ những gì cần giữ. */
  luu: (values: DraftValues) => void
  /** `null` khi chưa từng có nháp nào (tab mới, hoặc đã `xoa()`). */
  doc: () => DraftValues | null
  xoa: () => void
}

export function useDraftCache(reportId: number): DraftCache {
  const khoa = `draft:${reportId}`
  return {
    luu(values) {
      sessionStorage.setItem(khoa, JSON.stringify(values))
    },
    doc() {
      const raw = sessionStorage.getItem(khoa)
      return raw === null ? null : (JSON.parse(raw) as DraftValues)
    },
    xoa() {
      sessionStorage.removeItem(khoa)
    },
  }
}
