/**
 * Ô nhập số của FM01 — hiện định dạng vi-VN lúc nghỉ (`dinhDangSoBang` ngay dưới đây), hiện số
 * thô lúc đang gõ để không vướng dấu chấm/phẩy định dạng.
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
import { useEffect, useId, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import { parseViNumber } from '../../lib/parseViNumber'

export interface NumberCellProps {
  value: number | null
  decimals: number
  ariaLabel: string
  /** Lỗi do NGƯỜI GỌI phát hiện (Task 22: "Bắt buộc" sau lần bấm Nộp đầu) — khác lỗi phân tích
   * chuỗi của chính ô này. Lỗi nội bộ thắng khi cả hai cùng có: nó nói về CHỮ ĐANG NẰM TRONG ô,
   * còn lỗi ngoài nói về giá trị đã chốt. Không có prop này thì không cách nào đặt `aria-invalid`
   * lên chính `<input>` từ ngoài — đó là điều thiết kế a11y đòi (mỗi ô lỗi có aria-invalid +
   * aria-describedby), nên đây là bổ sung bắt buộc chứ không phải tiện tay. */
  loiNgoai?: string | null
  onChange?: (ketQua: { value: number | null; error: string | null }) => void
  onCommit?: (ketQua: { value: number | null; error: string | null }) => void
  onPasteColumn?: (dong: string[]) => void
}

/** Số lúc NGHỈ — task-22-carry.md C13: KHÔNG dùng `formatNumber` (nó đệm số 0 tới đúng `decimals`,
 * nên `402100` ở dòng B-1.1 `decimals=2` ra "402.100,00" trong khi ô chỉ đọc ngay cạnh trong CÙNG
 * MỘT DÒNG hiện "402.100" theo bản vẽ approve.html). Chỉ `maximumFractionDigits`: số nguyên ra
 * "402.100", số lẻ vẫn hiện đủ tới `decimals`.
 *
 * Export để bảng 55 dòng (ReportForm, Task 22) vẽ ô CHỈ ĐỌC bằng đúng hàm này — hai luật định
 * dạng nằm cạnh nhau trong một dòng mà lệch nhau chính là lỗi C13 mô tả.
 *
 * `null` ra "—", không bao giờ "0" (ràng buộc toàn cục). `-0` ép về `0` vì `Intl.NumberFormat`
 * nhìn DẤU BIT chứ không nhìn giá trị so sánh (cùng lý do đã ghi ở `formatNumber`). */
export function dinhDangSoBang(n: number | null, decimals: number): string {
  if (n === null) return '—'
  const nSach = n === 0 ? 0 : n
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: decimals }).format(nSach)
}

/** Số thô để SỬA lúc đang focus: không nhóm hàng nghìn (để dấu chấm không lẫn vào lúc gõ), vẫn
 * giữ dấu phẩy thập phân — đúng ngữ pháp mà `parseViNumber` đọc lại lúc blur.
 *
 * C13: bỏ `minimumFractionDigits` ở ĐÂY NỮA, không chỉ ở lúc nghỉ — nếu lúc nghỉ hiện "402.100"
 * mà bấm vào lại hiện "402100,00" thì người dùng thấy ",00" mọc ra từ hư không. */
function soThoDeSua(value: number, decimals: number): string {
  return new Intl.NumberFormat('vi-VN', {
    useGrouping: false,
    maximumFractionDigits: decimals,
  }).format(value)
}

// Nhận cả '\r\n' (Excel Windows), '\r' đơn (fix-1 S7 — trước đây chỉ dò '\n' nên dán bằng '\r'
// đơn dính ba số làm một), và '\n' đơn làm dấu xuống dòng khi tách một cột đã dán.
const PHAN_CACH_DONG = /\r\n|\r|\n/

export function NumberCell({ value, decimals, ariaLabel, loiNgoai, onChange, onCommit, onPasteColumn }: NumberCellProps) {
  // fix-2 T1 — ĐỪNG xoá initializer này (fix-1 S9 từng xoá nhầm nó, coi là mã chết — SAI).
  // Đây là chữ của LẦN VẼ ĐẦU TIÊN; `useEffect` ngay dưới chỉ lo các lần `value` đổi VỀ SAU,
  // vì hợp đồng React chạy effect SAU khi trình duyệt đã vẽ — không phải "ngay lập tức" như
  // comment cũ (đã sai) từng khẳng định. Test RTL không thấy được khoảng trống này vì
  // `render()` flush effect đồng bộ trong `act()`, nhưng trình duyệt thật thì có: đo bằng
  // `flushSync`/`renderToString` (task-21-rereview-1.md §3) cho khung hình đầu rỗng thật —
  // dựng 165 ô kiểu bảng FM01 thì 165/165 ô rỗng ở khung đầu, kể cả ô hiện `—`. Không có test
  // nào bắt được nếu xoá dòng này (đã xác nhận: 0 ca đỏ) — ĐỪNG suy ra từ đó là mã thừa.
  const [text, setText] = useState(() => dinhDangSoBang(value, decimals))
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
      setText(dinhDangSoBang(value, decimals))
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
    if (!ketQua.error) setText(dinhDangSoBang(ketQua.value, decimals))
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

  /** Esc = HUỶ lần sửa đang dở. `useKeyboardNav` (listener cấp lưới) đã trả chữ về mốc trước khi
   * sửa, nên trạng thái lỗi phải được tính LẠI theo đúng chữ vừa được trả về — không xoá mù quáng.
   *
   * fix-4 xoá thẳng `setError(null)` vì tưởng mốc khôi phục luôn hợp lệ; fix-5 M1 đo ra ca biên
   * phá tiền đề đó: bỏ dở một ô đang lỗi rồi quay lại thì mốc của lượt focus MỚI chính là chuỗi
   * hỏng (fix-1 S3 giữ nguyên chữ), Esc trả về đúng `100a` và xoá đỏ lúc đó để ô mang chuỗi hỏng
   * mà trông sạch sẽ. Tính lại thì cả hai đường đều đúng: khôi phục về `100` là hết đỏ ngay (đúng
   * thứ fix-4 sinh ra để vá — người nhập bấm Esc thoát ô đỏ, thấy vẫn đỏ thì kết luận Esc không
   * ăn), khôi phục về `100a` là vẫn đỏ.
   *
   * Đọc `e.currentTarget.value` được vì tới lượt `onKeyDown` của React thì chữ ĐÃ về mốc: lưới
   * nằm sâu hơn gốc cây nơi React 18 gắn listener uỷ quyền, nên listener của lưới bọt lên trước.
   * Thứ tự đó nay MANG TẢI, không còn là mô tả suông (fix-5 M6): đọc trước lượt khôi phục là đọc
   * trúng chuỗi hỏng và ô đã Esc xong vẫn đỏ.
   *
   * KHÔNG đụng `loiNgoai`: lỗi đó nói về giá trị ĐÃ CHỐT ("Bắt buộc" sau lần bấm Nộp đầu tiên),
   * không phải về chữ đang nằm trong ô — Esc không trả lời được nó. */
  function xuLyPhim(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setError(parseViNumber(e.currentTarget.value, decimals).error)
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
    // fix-2 T5: bỏ canh `dong.length > 0` — `split` không bao giờ trả mảng rỗng, và khi mảng
    // rỗng thì `dong[-1]` là `undefined !== ''` nên vòng lặp tự dừng, canh này là thừa.
    while (dong[dong.length - 1] === '') dong.pop()
    onPasteColumn(dong)
    // Cha vừa nạp giá trị mới cho CẢ CỘT, kể cả ô này. Effect đồng bộ ở trên cố ý không đè chữ
    // của ô ĐANG FOCUS (fix-1 N1) — nhưng ở đây không ai đang gõ dở cả, nên giữ focus sẽ biến
    // đúng ô vừa được dán vào thành ô DUY NHẤT không hiện số mới (nó vẫn đang hiện chữ rỗng/số
    // cũ của lúc focus). Rời focus để nó nhận lại giá trị như mọi ô khác trong cột.
    e.currentTarget.blur()
  }

  // Lỗi nội bộ (chữ đang nằm trong ô sai) thắng lỗi ngoài (giá trị đã chốt còn thiếu).
  const loiHienThi = error ?? loiNgoai ?? null

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={loiHienThi ? 'true' : undefined}
        aria-describedby={loiHienThi ? loiId : undefined}
        value={text}
        onFocus={xuLyFocus}
        onBlur={xuLyBlur}
        onChange={xuLyChange}
        onPaste={xuLyDan}
        onKeyDown={xuLyPhim}
        // h-7 (28px) chứ không phải h-9 (36px): dòng bảng CŨNG cao 36px (tokens.css `td{height:36px}`),
        // nên ô nhập cao bằng cả dòng sẽ đặt viền dưới của nó chồng đúng lên hairline của `<td>` —
        // viền đôi mà task-22-carry.md C11 cảnh báo. Bản vẽ chốt sẵn con số: `.cell{height:28px}`.
        // `focus:outline` là "viền trong 2px cyan" của thiết kế (Pass 6), không phải trang trí.
        className={`block w-full h-7 border rounded-md px-2 bg-card text-right tnum focus:outline-2 focus:outline-ring focus:-outline-offset-2 ${
          loiHienThi ? 'border-destructive text-destructive' : 'border-border text-foreground'
        }`}
      />
      {loiHienThi && (
        <span id={loiId} className="block text-[11px] leading-[1.3] text-destructive">
          {loiHienThi}
        </span>
      )}
    </>
  )
}
