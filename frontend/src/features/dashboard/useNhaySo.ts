// frontend/src/features/dashboard/useNhaySo.ts
//
// Nháy ô KPI 600 ms khi CON SỐ đổi — hành vi D18 của thiết kế đã duyệt ("ô có số đổi sau refetch
// nháy nền #c1e1f7 → trắng 600 ms", `docs/designs/hseq-platform-mvp-fm01.md`), và là nhịp cuối của
// kịch bản demo: admin duyệt xong thì dashboard tự invalidate, ô đổi số nháy lên cho người xem
// thấy con số vừa động chứ không phải tự hỏi có gì đổi không.
//
// Tách thành hook (trước Lát 4 nó nằm trong `KpiTile.tsx`) vì hai nơi vẽ ô KPI ngồi trên hai NỀN
// khác nhau: `BangChiSo` trên panel tối, `TheSoLieu` trên thẻ trắng. Chuyển động là MỘT, lớp CSS
// là hai (`.flash` / `.flash-toi` trong index.css) — hook chỉ trả lời "có đang nháy không", nơi
// gọi chọn lớp hợp với nền của mình. Nháy sáng-rồi-về-trắng trên panel tối là nháy NGƯỢC.
//
// Không có animation viết bằng JS: hook chỉ bật/tắt một lớp; 600 ms và nhánh
// `prefers-reduced-motion` nằm trọn trong CSS.
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

export const THOI_GIAN_NHAY_MS = 600

export function useNhaySo(gia: number | null): boolean {
  const gtTruoc = useRef(gia)
  const [nhay, setNhay] = useState(false)

  useEffect(() => {
    if (gtTruoc.current === gia) return
    gtTruoc.current = gia
    setNhay(true)
    // flushSync: callback này chạy từ một continuation NGOÀI vòng render gốc (setTimeout), giống
    // hệt lý do Login.tsx dùng flushSync cho bộ đếm "đang đánh thức" — không có nó, React 19 xếp
    // lịch cập nhật qua MessageChannel (macrotask thật) mà vi.advanceTimersByTimeAsync (chỉ tua
    // timer giả + microtask) không đợi tới, nên lớp nháy không kịp gỡ trước dòng expect kế tiếp.
    const hen = setTimeout(() => flushSync(() => setNhay(false)), THOI_GIAN_NHAY_MS)
    return () => clearTimeout(hen)
  }, [gia])

  return nhay
}
