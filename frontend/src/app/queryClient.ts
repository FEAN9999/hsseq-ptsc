// frontend/src/app/queryClient.ts
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'

// staleTime 30s: đủ cho các màn đọc (dashboard, status, reports) mà không gọi lại liên tục;
// refetchOnWindowFocus bù lại cho trường hợp cần số mới ngay (ví dụ quay lại tab sau khi người
// khác vừa duyệt) mà không cần hạ staleTime chung xuống 0.
//
// Vòng sửa 2 Task 25 (task-25-fix-2.md P2/M-01, task-25-rereview-1.md M-01 [VỪA]): sửa Ở LỚP,
// không ở từng hook — trước bản vá, KHÔNG chỗ nào đặt `retry` (kể cả `useSummary`/`useUnits`) nên
// mọi query chạy với mặc định TanStack (3 lần thử lại, backoff 1s/2s/4s). 4xx (400-499) là KẾT
// LUẬN của máy chủ — "chưa có quyền dashboard.view" không đời nào thành công dù thử lại bao
// nhiêu lần — nên 403 THẬT của Dashboard mất ~7-8 giây và bắn 8 request thay vì hiện đúng câu
// NGAY. 5xx/lỗi mạng vẫn thử lại (đó là trục trặc TẠM THỜI, đúng tinh thần lỗi-nền-không-phá-
// màn-hình ở B-01/ReportDetail F1) — chỉ chặn 4xx.
// `ReportDetail.tsx:36,41` đặt `retry: false` cứng tại chỗ — sau bản vá này nó THỪA (4xx đã bị
// chặn ở đây, 5xx/mạng của nó vốn không cần retry vì trang đã tự xử lý lỗi nền qua F1) nhưng GIỮ
// NGUYÊN: đó là ràng buộc CHẶT HƠN tại chỗ (không retry gì hết, kể cả 5xx), không phải mã chết.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (soLanDaThu, loi) => {
        if (loi instanceof ApiError && loi.status >= 400 && loi.status < 500) return false
        return soLanDaThu < 3
      },
    },
  },
})
