// Placeholder khi đang tải. Tĩnh, KHÔNG shimmer — chuyển động duy nhất trong app là flash của Tile.
const WIDTHS = ['40%', '100%', '70%']

export function Skeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-3.5 my-2 rounded bg-gradient-to-r from-mutedbg via-hair to-mutedbg"
          style={{ width: WIDTHS[i % WIDTHS.length] }}
        />
      ))}
    </div>
  )
}
