// frontend/src/app/routeScan.ts
//
// Carry C5 (task-26-carry.md, nguồn 4 của bất biến "mọi đích điều hướng dẫn tới trang thật"): quét
// TỰ ĐỘNG mọi đích `navigate(...)`/`<Link to=...>` trong src/pages và src/features — "đừng chép
// tay": một danh sách gõ tay sẽ không tự cập nhật khi một trang SAU thêm một điều hướng mới, làm
// bất biến mất tác dụng ngay từ ngày nó được viết. Cùng lý do và cùng kỹ thuật đọc file THẬT với
// components/ui/cascade.ts (Task 18): CHỈ chạy trong Node (qua Vitest), không bao giờ vào bundle
// trình duyệt — cần @types/node nhưng tsconfig.app.json (dùng cho toàn bộ src/ phía browser) không
// khai `types: ["node"]`; tham chiếu type ngay tại đây thay vì nới lỏng tsconfig chung cho cả app.
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// frontend/src/app/routeScan.ts -> lên 1 cấp là frontend/src/
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// task-26-fix-1.md Q3/[B-3]: TÊN CŨ `moiFileTsx` + bộ lọc chỉ `.tsx` đang phát biểu đúng một GIỚI
// HẠN SAI — carry C5 nguồn 4 viết nguyên văn "quét navigate( và <Link to= trong src/pages và
// src/features", không nói "trong các file .tsx". File `.ts` (hook, không phải component) vẫn có
// thể gọi `navigate(...)` y hệt — `features/report/useChuyenTrangThai.ts:190` có
// `navigate('/dashboard')` THẬT, từng bị bỏ trắng hoàn toàn vì lọc cũ chỉ nhận đuôi `.tsx`.
function moiFileNguon(dir: string): string[] {
  const ra: string[] = []
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten)
    if (statSync(p).isDirectory()) {
      ra.push(...moiFileNguon(p))
    } else if (/\.tsx?$/.test(ten) && !/\.test\.tsx?$/.test(ten)) {
      ra.push(p)
    }
  }
  return ra
}

// `${bieu_thuc}` bất kỳ trong chuỗi mẫu -> "1": chỉ hình dạng PATHNAME cần đo cho việc khớp route —
// react-router khớp ":id" với MỌI đoạn non-empty, không theo giá trị cụ thể của biểu thức bên
// trong. Query/hash phía sau (?from=...#...) không ảnh hưởng khớp route nên giữ nguyên, vô hại.
function chuanHoa(duongDanTho: string): string {
  return duongDanTho.replace(/\$\{[^}]*\}/g, '1')
}

// Bắt CẢ BA kiểu trích dẫn (`, ', ") cho navigate(...) và <Link to=...> — cả ba đã CÓ THẬT trong
// dự án (task-26-fix-1.md Q3: `<Link to="/reports">` dấu nháy kép ở Dashboard.tsx:63,
// ReportDetail.tsx:51/84, Status.tsx:76; dấu nháy đơn ở useChuyenTrangThai.ts), không phải chỉ
// template literal — bình luận cũ khẳng định sai. Quét cả ba đúng tinh thần "đừng chép tay".
// Chỉ khớp khi đối số ĐẦU là một chuỗi/template literal (bắt đầu bằng dấu trích dẫn) — navigate(x)
// với biến động (Login.tsx: navigate(noiBo, ...)) không khớp, ĐÚNG Ý: những đích đó không phải hằng
// số tĩnh để quét, chúng thuộc "nguồn 2" (đăng nhập) — kiểm bằng chạy THẬT đường đăng nhập, không
// phải quét nguồn (xem routes.test.tsx).
const RE_NAVIGATE = /\bnavigate\(\s*[`'"]([^`'"]*)[`'"]/g
// task-26-fix-2.md R4: `[^>]*?` (bản cũ) KHÔNG vượt được dấu `>` — mà `>` nằm ngay trong idiom JSX
// phổ biến nhất, `onClick={() => 0}`, nên MỌI `<Link>` có một prop chứa `>` đứng TRƯỚC `to=` (arrow
// function là ca thường gặp nhất, không phải ca hiếm) biến mất hoàn toàn khỏi tập quét — tập không
// đổi, ca khoá-tập vẫn xanh, `it.each` không sinh ca nào cho đích đó: cả bốn nguồn của bất biến
// C3/C5 cùng mù với đích đó. Đổi sang `[\s\S]*?` (mọi ký tự, kể cả `>` và xuống dòng) để vượt được
// prop bất kỳ đứng trước `to=`; chặn dừng ở `</Link` để KHÔNG lỡ vượt qua hẳn thẻ đang xét (trường
// hợp giả định `<Link>` không có `to=` — không thể xảy ra thật vì `to` là prop bắt buộc theo kiểu
// react-router — regex vẫn tự vệ đúng thay vì đọc nhầm `to=` của phần tử khác phía sau).
const RE_LINK_TO = /<Link\s(?:(?!<\/Link)[\s\S])*?\bto=\{?\s*[`'"]([^`'"]*)[`'"]/g

// task-26-fix-2.md R4: tách vòng quét MỘT nội dung file ra khỏi việc đọc đĩa (khuôn
// resolveCascadeWinnerFromCss/cascade.ts — tự dựng chuỗi input thay vì phụ thuộc file thật) — để
// routeScan.test.ts test được TỪNG kiểu trích dẫn/hình dạng prop của `<Link to=>` độc lập, không
// cần thả fixture xuống src/pages|src/features thật.
export function duongDanTrongNoiDung(noiDung: string): string[] {
  const ra = new Set<string>()
  for (const re of [RE_NAVIGATE, RE_LINK_TO]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(noiDung)) !== null) {
      ra.add(chuanHoa(m[1]))
    }
  }
  return [...ra]
}

/** Mọi đích `navigate()`/`<Link to=>` TĨNH trong src/pages + src/features, đã chuẩn hoá — dùng để
 * khẳng định carry C3/C5 (nguồn 4): mỗi đích phải khớp một route thật trong `routeObjects`. */
export function duongDanDieuHuongTrongTrang(): string[] {
  const files = [...moiFileNguon(join(SRC_DIR, 'pages')), ...moiFileNguon(join(SRC_DIR, 'features'))]
  const ra = new Set<string>()
  for (const f of files) {
    const noiDung = readFileSync(f, 'utf-8')
    for (const d of duongDanTrongNoiDung(noiDung)) ra.add(d)
  }
  return [...ra]
}
