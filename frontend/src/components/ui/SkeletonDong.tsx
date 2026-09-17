// Đổi tên từ `Skeleton.tsx` ở Lát 0 redesign. Nó vẽ N DÒNG giả (prop `rows`), không phải một khối —
// khác hẳn `ui/skeleton.tsx` của shadcn (một <div> trơn có lớp shimmer mặc định của Tailwind).
//
// GIỮ NGUYÊN "tĩnh, KHÔNG shimmer": chuyển động duy nhất của app là `.flash` của Tile. Nếu về sau
// dựng lại file này TRÊN `ui/skeleton.tsx` của shadcn thì phải ghi đè bỏ lớp shimmer đó.
//
// Trên macOS `Skeleton.tsx` và `skeleton.tsx` LÀ CÙNG MỘT FILE — `shadcn add skeleton` đã ghi đè
// mất file này một lần (đo thật). Xem src/app/casingScan.test.ts.
//
// Đừng viết tên lớp Tailwind theo nghĩa đen trong comment ở file này: Tailwind v4 quét CẢ comment,
// nên một tên lớp nằm trong comment vẫn sinh ra CSS thật trong bundle. Đã đo: chuỗi đó từng làm
// dist/assets/*.css phình 20,78kB -> 20,92kB và nạp một animation mà app này cấm.

// Placeholder khi đang tải. Tĩnh, KHÔNG shimmer — chuyển động duy nhất trong app là flash của Tile.
const WIDTHS = ['40%', '100%', '70%']

export function SkeletonDong({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-3.5 my-2 rounded bg-gradient-to-r from-muted via-border to-muted"
          style={{ width: WIDTHS[i % WIDTHS.length] }}
        />
      ))}
    </div>
  )
}
