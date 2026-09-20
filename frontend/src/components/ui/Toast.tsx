import { useEffect, useRef } from 'react'
import { Toaster } from './sonner'

/** P3 (final-fix-FE.md, Ruling 425 · final-review-R3-report.md §A1) — tên biến CSS mà Toast công
 *  bố chiều cao dải của mình qua đó. Giá trị mặc định `0px` khai trong `index.css`. */
const BIEN_CAO = '--toast-cao'

/** Link hành động trong toast — lát 5 giữ nguyên hình dạng `<a>` của bản tự vẽ, KHÔNG dùng
 *  `action: {label, onClick}` của sonner (thứ đó dựng ra một `<button data-button>`).
 *
 *  Lý do là một khẳng định e2e, không phải sở thích: `demo-path.spec.ts:441` bấm toast bằng
 *  `getByRole('link', { name: 'Xem dashboard' })`, và `useChuyenTrangThai.test.tsx:236` cũng vậy.
 *  sonner nhận thẳng một ReactElement làm `action` (`React.isValidElement(toast.action)` — dist
 *  dòng 875) nên giữ được vai `link` mà không phải vẽ lại gì.
 *
 *  Là COMPONENT chứ không phải hàm dựng phần tử, để `useChuyenTrangThai.ts` (tệp `.ts`, không viết
 *  được JSX) gọi qua `createElement(LienKetToast, …)`.
 *
 *  `text-primary` thay cho `text-sky` của bản cũ: `--sky` (#c1e1f7) là màu chữ cho NỀN TỐI của
 *  mockup states.html; trên nền `--popover` (trắng) của sonner nó gần như vô hình. */
export function LienKetToast({ nhan, onNhan }: { nhan: string; onNhan: () => void }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        onNhan()
      }}
      className="text-primary no-underline font-medium ml-auto shrink-0"
    >
      {nhan}
    </a>
  )
}

export function Toast() {
  const vo = useRef<HTMLElement>(null)

  // P3 — Toast DÀNH SẴN CHỖ thay vì nổi đè.
  //
  // Trước bản vá, Toast (`fixed right-6 bottom-6`) chồng thẳng lên cụm nút bên phải của thanh dính
  // (`FormModeBar`, `sticky bottom-0 justify-between`): bấm Duyệt xong, nút tiếp theo KHÔNG ăn suốt
  // 4 giây. Chính bộ e2e đã đo được điều đó và đi VÒNG qua nó (mở hộp thoại bằng bàn phím) thay vì
  // tố nó.
  //
  // Vá toạ độ (`bottom-…24`) chỉ dời cửa sang một thanh dính cao hơn hoặc một viewport thấp hơn —
  // 1024×640 đã đo được đúng lỗi này. Câu hỏi đúng là "Toast có được phép nằm đè lên vùng bấm được
  // không" — KHÔNG. Nên Toast tự đo dải nó chiếm rồi CÔNG BỐ, và vùng nội dung của app (`AppShell`)
  // cùng mọi thanh dính đáy (`FormModeBar`) lùi lên đúng bấy nhiêu.
  //
  // Đo `innerHeight - rect.top` chứ không đo `offsetHeight`: dải cần chừa gồm CẢ khoảng hở dưới
  // (sonner: `--offset-bottom`, 24px — trùng đúng `bottom-6` của bản cũ), và một phép đo lấy thẳng
  // từ hình học thì không có hằng số ma thuật nào để trôi khỏi CSS.
  //
  // LÁT 5 — ĐO TRÊN PHẦN TỬ NÀO. sonner dựng `<ol data-sonner-toaster>` (fixed, `bottom:24px`) rồi
  // đặt từng toast `<li>` position:ABSOLUTE, `bottom:0` bên trong. Cái `<ol>` vì thế CAO 0px:
  // `innerHeight - olRect.top` trả về đúng 24px, tức dải chừa thiếu nguyên chiều cao toast và bất
  // biến hỏng lặng lẽ. `sonner.tsx` vá bằng `height: var(--front-toast-height)` (biến chính sonner
  // đã tính sẵn) để hộp `<ol>` TRÙNG hộp toast; phép đo dưới đây mới có nghĩa.
  //
  // Đo trên `<ol>` chứ không trên `<li>` là CÓ CHỦ ĐÍCH: `<li>` mang transition `transform .4s`
  // lúc trượt vào, nên rect của nó trong 400ms đầu nằm thấp hơn chỗ nghỉ. Đo `<ol>` (không
  // transform) cho dải ĐẦY ĐỦ ngay từ khung hình đầu — thanh thao tác lùi lên TRƯỚC khi toast tới
  // nơi, chứ không bò lên theo nó.
  //
  // `MutationObserver` chứ không `ResizeObserver`: phần tử cần theo dõi (`<ol>`) được dựng và gỡ
  // theo từng lượt toast, và thứ làm dải đổi cỡ là biến `--front-toast-height` trên thuộc tính
  // `style` của chính nó — một phép đổi THUỘC TÍNH, không phải đổi cỡ phần tử đang được quan sát.
  useEffect(() => {
    const vung = vo.current
    if (vung === null) return
    const goc = document.documentElement

    const doVaCongBo = () => {
      const khay = vung.querySelector<HTMLElement>('[data-sonner-toaster]')
      // sonner chỉ dựng `<ol>` khi CÓ toast. Dọn biến khi không còn toast nào HOẶC khi `<Toast/>`
      // unmount — để lại một dải chừa vĩnh viễn thì mọi trang về sau thiếu bấy nhiêu pixel mà
      // không ai biết vì sao.
      if (khay === null) {
        goc.style.removeProperty(BIEN_CAO)
        return
      }
      // `role="status"` gắn tay: sonner KHÔNG cấp vai nào cho `<li>` (chỉ `aria-live="polite"` trên
      // `<section>` bọc ngoài, dist dòng 706 & 1145) và không có prop nào để truyền vai vào. Cả bộ
      // e2e lẫn bốn tệp test đơn tìm toast bằng `[role="status"]` + NỘI DUNG, nên vai này là một
      // phần của hợp đồng chứ không phải trang trí. Đặt trên `<li>` để hộp đo được của nó là hộp
      // TOAST THẬT — `doGiaoToastVoiNut` (e2e) lấy `getBoundingClientRect()` của chính phần tử
      // mang vai này, đặt lên một thẻ con nào hẹp hơn là tự tay làm phép giao thành bằng chứng rỗng.
      for (const banh of khay.querySelectorAll('[data-sonner-toast]')) {
        banh.setAttribute('role', 'status')
      }
      goc.style.setProperty(
        BIEN_CAO,
        `${Math.ceil(window.innerHeight - khay.getBoundingClientRect().top)}px`,
      )
    }

    doVaCongBo()
    const theoDoi = new MutationObserver(doVaCongBo)
    // `attributeFilter: ['style']` chứ không phải mọi thuộc tính: chỉ `style` mới đổi hình học
    // (`--front-toast-height`), và lọc hẹp lại cũng là thứ chặn vòng lặp — chính callback này đặt
    // `role` trên `<li>`, một thuộc tính ngoài bộ lọc nên không tự gọi lại mình.
    theoDoi.observe(vung, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', doVaCongBo)
    return () => {
      theoDoi.disconnect()
      window.removeEventListener('resize', doVaCongBo)
      goc.style.removeProperty(BIEN_CAO)
    }
  }, [])

  return (
    <Toaster
      ref={vo}
      position="bottom-right"
      // `1` chứ không phải mặc định `3`: cả ý tưởng "chừa chỗ" giả định dải có chiều cao ỔN ĐỊNH.
      // Cho sonner xếp chồng 3 toast thì thanh thao tác NHẢY mỗi lần một toast tới. Bốn nơi gọi
      // trong app đều bắn đúng MỘT thông báo một lúc nên `1` không mất gì.
      visibleToasts={1}
      expand={false}
      // `light` chứ không `system`: `sonner.tsx` gọi `useTheme()` của next-themes mà app KHÔNG
      // mount `ThemeProvider` nào, và khối `.dark` trong `index.css` là bảng màu CLI sinh ra, chưa
      // ai chỉnh. Để `system` thì máy bật dark mode sẽ ra toast tối trên một app sáng toàn phần.
      theme="light"
    />
  )
}
