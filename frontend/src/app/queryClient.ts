// frontend/src/app/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

// staleTime 30s: đủ cho các màn đọc (dashboard, status, reports) mà không gọi lại liên tục;
// refetchOnWindowFocus bù lại cho trường hợp cần số mới ngay (ví dụ quay lại tab sau khi người
// khác vừa duyệt) mà không cần hạ staleTime chung xuống 0.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})
