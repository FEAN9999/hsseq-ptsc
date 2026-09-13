/**
 * Ô nhập số của FM01 — hiện định dạng vi-VN lúc nghỉ (`formatNumber`, Task 16), hiện số thô lúc
 * đang gõ để không vướng dấu chấm/phẩy định dạng.
 *
 * `type="text" inputMode="decimal"`, KHÔNG `type="number"` (task-21-carry.md C2): bàn phím
 * vi-VN nuốt dấu phẩy và cuộn chuột đổi số ngoài ý muốn; Task 22 còn đếm
 * `getAllByRole('textbox')` — đổi type sẽ đổi role thành spinbutton và làm đỏ test của task đó.
 *
 * task-21-carry.md C4: dán nhiều dòng từ Excel KHÔNG tự phân tích số ở đây — mỗi dòng của cùng
 * một cột có thể khai `decimals` khác nhau (vd B-1.1 decimals=2, B-2.1 decimals=0), mà ô đang
 * được dán vào chỉ biết `decimals` của chính nó. Tách dòng, cắt khoảng trắng, đưa NGUYÊN CHUỖI
 * lên `onPasteColumn` — nơi gọi (ReportForm, Task 22) mới gọi `parseViNumber` cho từng dòng với
 * đúng `decimals` của dòng đích.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react'
import { formatNumber } from '../../lib/format'
import { parseViNumber } from '../../lib/parseViNumber'

export interface NumberCellProps {
  value: number | null
  decimals: number
  ariaLabel: string
  onChange?: (ketQua: { value: number | null; error: string | null }) => void
  onCommit?: (ketQua: { value: number | null; error: string | null }) => void
  onPasteColumn?: (dong: string[]) => void
}

/** Số thô để SỬA lúc đang focus: không nhóm hàng nghìn (để dấu chấm không lẫn vào lúc gõ), vẫn
 * giữ dấu phẩy thập phân — đúng ngữ pháp mà `parseViNumber` đọc lại lúc blur. */
function soThoDeSua(value: number, decimals: number): string {
  return new Intl.NumberFormat('vi-VN', {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// Nhận cả '\r\n' (Excel Windows), '\r' đơn (fix-1 S7 — trước đây chỉ dò '\n' nên dán bằng '\r'
// đơn dính ba số làm một), và '\n' đơn làm dấu xuống dòng khi tách một cột đã dán.
const PHAN_CACH_DONG = /\r\n|\r|\n/

export function NumberCell({ value, decimals, ariaLabel, onChange, onCommit, onPasteColumn }: NumberCellProps) {
  // fix-1 S9: khởi tạo '' thay vì `formatNumber(value, decimals)` — effect ngay dưới đây LUÔN
  // chạy một lần lúc mount và ghi đè giá trị này trước khi người dùng thấy gì (React flush effect
  // trong `act()` của test; ở trình duyệt thật là ngay khung hình kế tiếp), nên định dạng sẵn ở
  // đây là mã thừa, không ai phân biệt được với bản rỗng.
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const dangFocus = useRef(false)
  // fix-1 S6: mốc so sánh — nhớ `text` tại thời điểm focus, blur mà `text` không đổi so với mốc
  // này thì KHÔNG bắn `onCommit` (chỉ Tab ngang qua không phải là một lần sửa).
  const textLucFocus = useRef('')
  const loiId = useId()

  // Đồng bộ lại hiển thị khi `value`/`decimals` đổi TỪ NGOÀI (derived tính lại, dán cột nạp giá
  // trị) — chỉ lúc KHÔNG focus, để không đè chữ người dùng đang gõ dở.
  //
  // fix-1 S2: gỡ luôn lỗi cũ cùng lúc — dán cột (C4) nạp `value` mới cho một ô đang lỗi vẫn phải
  // sạch lỗi, không được treo lại "Chỉ nhập số" trên một giá trị vừa được ghi đè hợp lệ.
  useEffect(() => {
    if (!dangFocus.current) {
      setText(formatNumber(value, decimals))
      setError(null)
    }
  }, [value, decimals])

  function xuLyFocus() {
    dangFocus.current = true
    // fix-1 S3: ô đang lỗi thì giữ NGUYÊN chữ người dùng đã gõ — đừng âm thầm thay bằng `value`
    // cũ (đằng nào cũng không dùng được vì `value` chưa hề đổi, chính là thứ gây lỗi ban đầu),
    // vì câu lỗi/aria-invalid vẫn treo trên màn hình trong khi chữ lại đổi, và gõ tiếp sẽ nối
    // đuôi vào một số cũ không ai còn thấy trên màn hình.
    if (error !== null) {
      textLucFocus.current = text
      return
    }
    const raw = value === null ? '' : soThoDeSua(value, decimals)
    setText(raw)
    textLucFocus.current = raw
  }

  function xuLyBlur() {
    dangFocus.current = false
    const ketQua = parseViNumber(text, decimals)
    setError(ketQua.error)
    if (!ketQua.error) setText(formatNumber(ketQua.value, decimals))
    // fix-1 S6: người dùng chỉ Tab ngang qua (không sửa gì) thì KHÔNG bắn `onCommit` — nếu không,
    // Task 23 (lưu-khi-rời-ô) sẽ tạo một PUT cho mỗi ô người dùng đi qua, và với ô có giá trị
    // nhiều chữ số thập phân hơn `decimals` thì còn bắn nhầm bản đã bị làm tròn theo hiển thị.
    if (text !== textLucFocus.current) onCommit?.(ketQua)
  }

  function xuLyChange(e: ChangeEvent<HTMLInputElement>) {
    const t = e.target.value
    setText(t)
    onChange?.(parseViNumber(t, decimals))
  }

  function xuLyDan(e: ClipboardEvent<HTMLInputElement>) {
    // fix-1 S10: không có nơi nhận thì đừng preventDefault — để mặc định trình duyệt xử lý paste
    // như một lần gõ bình thường vào chính ô này, đừng nuốt im lặng không giải thích.
    if (!onPasteColumn) return
    const raw = e.clipboardData.getData('text/plain')
    if (!PHAN_CACH_DONG.test(raw)) return
    e.preventDefault()
    const dong = raw.split(PHAN_CACH_DONG).map((d) => d.trim())
    // fix-1 S5: chỉ cắt các dòng trắng THỪA Ở CUỐI (artefact của Excel luôn kết thúc một vùng đã
    // copy bằng dấu xuống dòng) — dòng trắng Ở GIỮA vẫn giữ nguyên, vì nó mang nghĩa "ô này để
    // trống", một tín hiệu khác hẳn với đuôi thừa của phép tách chuỗi.
    while (dong.length > 0 && dong[dong.length - 1] === '') dong.pop()
    onPasteColumn(dong)
  }

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? loiId : undefined}
        value={text}
        onFocus={xuLyFocus}
        onBlur={xuLyBlur}
        onChange={xuLyChange}
        onPaste={xuLyDan}
        className={`block w-full h-9 border rounded-input px-2.5 bg-surface text-right tnum ${
          error ? 'border-danger text-danger' : 'border-hair text-ink'
        }`}
      />
      {error && (
        <span id={loiId} className="block text-[13px] mt-1 text-danger">
          {error}
        </span>
      )}
    </>
  )
}
