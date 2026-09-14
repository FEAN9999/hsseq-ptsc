// frontend/src/features/dashboard/KpiTile.tsx
//
// carry C4: Tile (Task 15) đã có sẵn — component này chỉ thêm ba việc Tile không tự làm được:
// (1) nhớ giá trị trước để (2) bật `flash` đúng 600ms khi số ĐỔI (khớp @keyframes flash-bg 600ms
// trong index.css — không thêm CSS mới, không animation JS), và (3) quyết định `danger`.
//
// `code` là optional: KpiTile chỉ TỰ quyết định đỏ khi biết mã chỉ tiêu (Dashboard truyền code từ
// kpis[].code thật); test đơn lẻ của KpiTile (không quan tâm màu) có thể bỏ qua prop này.
// LTI/FAT là hai KPI DUY NHẤT tô đỏ khi > 0 (thiết kế dòng 623 "ô LTI / FAT đỏ khi > 0") — bốn ô
// còn lại (Đơn vị có LTI, Tổng giờ công, Near miss, HAZOB) không bao giờ đỏ dù giá trị dương. Mã
// hoá cứng Ở ĐÂY là mã chỉ tiêu (B-2.1/B-2.2), KHÔNG phải nhãn hiển thị — carry C2 chỉ cấm khoá
// cứng NHÃN/thứ tự lưới ở FE, không cấm dùng mã để quyết định kiểu hiển thị.
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Tile } from '../../components/ui/Tile'

const MA_DO_KHI_DUONG = new Set(['B-2.1', 'B-2.2'])
const THOI_GIAN_FLASH_MS = 600

interface KpiTileProps {
  code?: string
  label: string
  value: number | null
  unit: string
}

export function KpiTile({ code, label, value, unit }: KpiTileProps) {
  const gtTruoc = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (gtTruoc.current === value) return
    gtTruoc.current = value
    setFlash(true)
    // flushSync: callback này chạy từ một continuation NGOÀI vòng render gốc (setTimeout), giống
    // hệt lý do Login.tsx dùng flushSync cho bộ đếm "đang đánh thức" — không có nó, React 19 xếp
    // lịch cập nhật qua MessageChannel (macrotask thật) mà vi.advanceTimersByTimeAsync (chỉ tua
    // timer giả + microtask) không đợi tới, nên .flash không kịp gỡ trước dòng expect kế tiếp.
    const hen = setTimeout(() => flushSync(() => setFlash(false)), THOI_GIAN_FLASH_MS)
    return () => clearTimeout(hen)
  }, [value])

  // Vòng sửa 1 (task-25-fix-1.md A3, review N24 — đột biến TƯƠNG ĐƯƠNG thật): `value !== null &&`
  // tách riêng là thừa — `null > 0` vốn đã `false` (so sánh quan hệ ép `null` thành `0`), và
  // `Tile` (carry C4) tự che tiếp bằng `isDanger = Boolean(danger) && !isMissing`. Gấp null-check
  // vào NGAY trong phép so sánh (`?? 0`) thay vì một mệnh đề `&&` riêng — tsc strict-null vẫn đòi
  // thu hẹp kiểu cho `>`, nhưng không còn là hai điều kiện lặp ý nhau.
  const danger = (value ?? 0) > 0 && MA_DO_KHI_DUONG.has(code ?? '')

  return <Tile label={label} value={value} unit={unit} danger={danger} flash={flash} />
}
