// Wordmark: "PTSC" + tên phòng ban. "HSEQ" chỉ xuất hiện ở tiêu đề trang, không ở đây (D10).
export function Wordmark() {
  return (
    <div className="font-semibold text-base leading-[1.2] text-foreground">
      PTSC
      <small className="block font-normal text-xs text-muted-foreground mt-0.5">Ban An toàn Chất lượng</small>
    </div>
  )
}
