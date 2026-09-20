// Wordmark: "PTSC" + tên phòng ban. KHÔNG in tên app ở đây — chữ "HSSEQ" do `Sidebar.tsx` tự dựng
// trong khối header của nó, cạnh logo ảnh (D10 bản mới: tên app thống nhất là HSSEQ, không phải
// HSEQ, và chỗ nó xuất hiện là wordmark sidebar + `<title>`).
export function Wordmark() {
  return (
    <div className="font-semibold text-base leading-[1.2] text-foreground">
      PTSC
      <small className="block font-normal text-xs text-muted-foreground mt-0.5">Ban An toàn Chất lượng</small>
    </div>
  )
}
