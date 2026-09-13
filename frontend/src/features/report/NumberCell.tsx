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

export function NumberCell({ value, decimals, ariaLabel, onChange, onCommit, onPasteColumn }: NumberCellProps) {
  const [text, setText] = useState(() => formatNumber(value, decimals))
  const [error, setError] = useState<string | null>(null)
  const dangFocus = useRef(false)
  const loiId = useId()

  // Đồng bộ lại hiển thị khi `value`/`decimals` đổi TỪ NGOÀI (derived tính lại, dán cột nạp giá
  // trị) — chỉ lúc KHÔNG focus, để không đè chữ người dùng đang gõ dở.
  useEffect(() => {
    if (!dangFocus.current) setText(formatNumber(value, decimals))
  }, [value, decimals])

  function xuLyFocus() {
    dangFocus.current = true
    setText(value === null ? '' : soThoDeSua(value, decimals))
  }

  function xuLyBlur() {
    dangFocus.current = false
    const ketQua = parseViNumber(text, decimals)
    setError(ketQua.error)
    if (!ketQua.error) setText(formatNumber(ketQua.value, decimals))
    onCommit?.(ketQua)
  }

  function xuLyChange(e: ChangeEvent<HTMLInputElement>) {
    const t = e.target.value
    setText(t)
    onChange?.(parseViNumber(t, decimals))
  }

  function xuLyDan(e: ClipboardEvent<HTMLInputElement>) {
    const raw = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text')
    if (!raw.includes('\n')) return
    e.preventDefault()
    onPasteColumn?.(raw.split('\n').map((dong) => dong.trim()))
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
