// frontend/src/features/report/useKeyboardNav.tsx
//
// Bàn phím kiểu Excel cho bảng 55 dòng (thiết kế Pass 6, D21/D22):
//   Enter / ↓        ô nhập kế tiếp CÙNG CỘT, và KHÔNG submit form
//   Shift+Enter / ↑  ô nhập phía trên cùng cột
//   Tab              ô nhập kế tiếp bên phải rồi sang dòng sau, bỏ qua ô chỉ đọc
//   Esc              khôi phục giá trị trước khi sửa
//   Ctrl/Cmd+S       chốt ô đang gõ dở rồi Lưu
//
// TAB KHÔNG CÓ MÃ Ở ĐÂY, CÓ CHỦ Ý. Ô chỉ đọc của bảng này là `<td>` chữ thường (yêu cầu a11y:
// "ô chỉ đọc là <td>, không input disabled"), mà `<td>` không nhận focus — nên thứ tự Tab mặc
// định của trình duyệt ĐÃ đúng thứ tự "trái sang phải, trên xuống dưới, bỏ ô chỉ đọc". Viết thêm
// một trình xử lý Tab chỉ để chép lại hành vi mặc định là cách chắc chắn nhất để làm hỏng nó
// (Shift+Tab, ra khỏi bảng, các nút ở thanh dưới). Ca test "Tab bỏ qua ô chỉ đọc" vì vậy đo một
// bất biến của CẤU TRÚC DOM, không đo mã trong file này.
//
// Điều hướng đi theo DOM chứ không theo một bản đồ chỉ số song song: một danh sách "ô nhập" tự
// dựng sẽ lệch khỏi bảng thật ngay khi bảng đổi (thêm cột Lệch cho admin, nhóm ẩn/hiện, dòng
// `empty` của snapshot không có ô nào). `data-cot` trên `<td>` là thứ duy nhất cần biết.
import { useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/** Mọi ô NHẬP của một cột, đúng thứ tự chúng nằm trong bảng. */
function oCungCot(luoi: HTMLElement, cot: string): HTMLInputElement[] {
  return Array.from(luoi.querySelectorAll<HTMLInputElement>(`td[data-cot="${cot}"] input`))
}

function cotCuaO(o: HTMLElement): string | null {
  return o.closest('td')?.getAttribute('data-cot') ?? null
}

function diChuyen(luoi: HTMLElement, tuO: HTMLInputElement, buoc: 1 | -1) {
  const cot = cotCuaO(tuO)
  if (cot === null) return
  const ds = oCungCot(luoi, cot)
  const i = ds.indexOf(tuO)
  const dich = ds[i + buoc]
  // Hết bảng thì đứng yên — KHÔNG cuộn vòng về đầu: người nhập gõ tới dòng cuối rồi Enter thêm
  // một lần nữa sẽ bị ném ngược lên dòng đầu mà không hiểu vì sao.
  if (dich) dich.focus()
}

/** Đặt lại chữ trong một `<input>` mà React đang điều khiển, theo cách React NHÌN THẤY: ghi qua
 * setter gốc của `HTMLInputElement.prototype.value` rồi bắn `input` — gán thẳng `o.value` sẽ bị
 * React ghi đè ở lần vẽ kế tiếp vì bộ theo dõi giá trị nội bộ của nó không hề đổi.
 *
 * Đây là cách DUY NHẤT khôi phục được ô mà vẫn GIỮ FOCUS: `NumberCell` không nhận lệnh "đặt lại
 * chữ" từ ngoài, và mọi cách khác (dựng lại ô bằng `key`, hay blur rồi ghi đè state) đều cướp
 * focus khỏi ô người dùng đang đứng — đúng thứ Esc sinh ra để tránh.
 */
function datLaiChu(o: HTMLInputElement, chu: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(o, chu)
  o.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Chốt ô đang gõ dở TRƯỚC khi lưu (fix-2 K1).
 *
 * Cả ba loại ô nhập của form — ô số (`NumberCell.xuLyBlur`), ô "Ghi chú" của từng chỉ tiêu, ô chữ
 * nhóm C — đẩy giá trị vào hàng chờ của lớp lưu trong `onBlur` của chúng. Nên ô ĐANG focus chưa
 * bao giờ nằm trong hàng chờ: gọi thẳng `saveNow()` sẽ gửi một `PUT` thiếu đúng con số vừa gõ,
 * rồi dải đầu báo "Đã lưu HH:MM" — màn hình nói đã lưu trong khi server chưa hề thấy số đó. Mà
 * Ctrl+S là ĐÚNG cử chỉ người cẩn thận làm ngay sau khi gõ xong, chưa kịp rời ô. (Nút "Lưu" không
 * dính lỗi này: bấm chuột lên nút đã tự rời ô trước khi trình xử lý click chạy.)
 *
 * `flushSync` KHÔNG phải trang trí. `blur()` bắn `focusout` đồng bộ nên `onBlur` chạy xong ngay,
 * nhưng các `setState` trong đó chỉ được VẼ LẠI ở microtask kế tiếp. Không ép vẽ thì `focus()`
 * ngay dưới đọc trúng `error`/`text` CŨ của `NumberCell`, và với ô đang giữ một chuỗi không phải
 * số, nhánh "giữ nguyên chữ người dùng đã gõ" (fix-1 S3) không chạy — chữ đó bị thay bằng giá trị
 * cũ, đúng lỗi S3 đã sửa.
 *
 * Trả focus về đúng ô vì Ctrl+S là cử chỉ GIỮA CHỪNG, không phải cử chỉ rời ô: bỏ focus lại ở
 * `<body>` thì Enter/mũi tên/Tab của người đang nhập 55 dòng rơi vào hư không.
 */
function chotODangGo() {
  const o = document.activeElement
  if (!(o instanceof HTMLInputElement || o instanceof HTMLTextAreaElement)) return
  flushSync(() => o.blur())
  o.focus()
}

export function useKeyboardNav(luoiRef: RefObject<HTMLElement | null>, onLuu: () => void) {
  // Chữ của ô tại đúng thời điểm nó nhận focus — "giá trị trước khi sửa" mà Esc khôi phục về.
  const chuLucFocus = useRef('')
  // Giữ `onLuu` mới nhất mà không phải gỡ/gắn lại listener mỗi lần cha vẽ lại (cha vẽ lại theo
  // TỪNG PHÍM gõ trong bảng này).
  const luuRef = useRef(onLuu)
  luuRef.current = onLuu

  useEffect(() => {
    const luoi = luoiRef.current
    if (!luoi) return

    function ghiNhoChuLucFocus(e: FocusEvent) {
      const o = e.target
      if (!(o instanceof HTMLInputElement)) return
      // ĐỌC TRỄ MỘT MICROTASK, có lý do: `NumberCell` đổi chữ hiển thị sang dạng SỐ THÔ ngay
      // trong `onFocus` của nó, mà React nghe `onFocus` bằng chính sự kiện `focusin` này ở gốc
      // cây — tức SAU listener của lưới (lưới nằm sâu hơn, bọt lên trước). Đọc thẳng `o.value`
      // tại đây sẽ bắt được chữ LÚC NGHỈ: với ô rỗng đó là "—", và Esc sẽ "khôi phục" một ô
      // trống thành lỗi "Chỉ nhập số".
      queueMicrotask(() => {
        chuLucFocus.current = o.value
      })
    }

    // Ctrl/Cmd+S gắn ở WINDOW, không ở lưới (fix-1 S2). Listener cấp lưới chỉ nghe được phím gõ
    // BÊN TRONG form; ngay sau khi tải trang, và sau mỗi lần bấm vào vùng trống, focus nằm ở
    // `<body>` nên keydown không bao giờ bọt tới — Ctrl+S lúc đó rơi vào trình duyệt và mở hộp
    // thoại "Lưu trang", đúng thứ dòng `preventDefault` dưới đây sinh ra để tránh. Bản vẽ
    // states.html in sẵn lời hứa "Ctrl+S để lưu" ở dải đầu, tức lời hứa ở cấp TRANG.
    function xuLyLuu(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
      e.preventDefault() // nếu không, trình duyệt mở hộp thoại "Lưu trang"
      chotODangGo()
      luuRef.current()
    }

    function xuLyPhim(e: KeyboardEvent) {
      const o = e.target
      // Enter/↑/↓/Esc CHỈ áp cho ô số. Trong textarea nhóm C, Enter phải giữ mặc định (xuống
      // dòng) — thiết kế nói thẳng điều này.
      // `cotCuaO(o) === null` KHÔNG thừa dù hôm nay không đầu vào nào phân biệt được (đo: 109/109
      // ô đều nằm trong `td[data-cot]`, 3 ô nhóm C là `<textarea>` đã bị canh `instanceof` chặn).
      // `luoiRef` gắn ở div bọc CẢ form, nên `<dialog>` nhập lý do trả lại của Task 24 render bên
      // trong sẽ có `<input>` ngoài lưới — không có canh này thì Esc trong ô đó bị nhánh Esc dưới
      // đây nuốt mất `preventDefault` và dialog không đóng được.
      if (!(o instanceof HTMLInputElement) || cotCuaO(o) === null) return

      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Enter trong một `<form>` là "gửi biểu mẫu"; ở đây nó là "xuống ô dưới".
        e.preventDefault()
        const len = luoiRef.current
        if (len) diChuyen(len, o, e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        datLaiChu(o, chuLucFocus.current)
      }
    }

    luoi.addEventListener('focusin', ghiNhoChuLucFocus)
    luoi.addEventListener('keydown', xuLyPhim)
    window.addEventListener('keydown', xuLyLuu)
    return () => {
      luoi.removeEventListener('focusin', ghiNhoChuLucFocus)
      luoi.removeEventListener('keydown', xuLyPhim)
      window.removeEventListener('keydown', xuLyLuu)
    }
  }, [luoiRef])
}
