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

function moiFileTsx(dir: string): string[] {
  const ra: string[] = []
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten)
    if (statSync(p).isDirectory()) {
      ra.push(...moiFileTsx(p))
    } else if (ten.endsWith('.tsx') && !ten.endsWith('.test.tsx')) {
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

// Bắt CẢ BA kiểu trích dẫn (`, ', ") cho navigate(...) và <Link to=...> — dự án hiện chỉ dùng
// template literal (`) nhưng không giới hạn theo lịch sử hiện tại: một trang sau đổi sang chuỗi
// thường ('...'/"...") vẫn phải bắt được, đúng tinh thần "đừng chép tay".
// Chỉ khớp khi đối số ĐẦU là một chuỗi/template literal (bắt đầu bằng dấu trích dẫn) — navigate(x)
// với biến động (Login.tsx: navigate(noiBo, ...)) không khớp, ĐÚNG Ý: những đích đó không phải hằng
// số tĩnh để quét, chúng thuộc "nguồn 2" (đăng nhập) — kiểm bằng chạy THẬT đường đăng nhập, không
// phải quét nguồn (xem routes.test.tsx).
const RE_NAVIGATE = /\bnavigate\(\s*[`'"]([^`'"]*)[`'"]/g
const RE_LINK_TO = /<Link\s[^>]*?\bto=\{?\s*[`'"]([^`'"]*)[`'"]/g

/** Mọi đích `navigate()`/`<Link to=>` TĨNH trong src/pages + src/features, đã chuẩn hoá — dùng để
 * khẳng định carry C3/C5 (nguồn 4): mỗi đích phải khớp một route thật trong `routeObjects`. */
export function duongDanDieuHuongTrongTrang(): string[] {
  const files = [...moiFileTsx(join(SRC_DIR, 'pages')), ...moiFileTsx(join(SRC_DIR, 'features'))]
  const ra = new Set<string>()
  for (const f of files) {
    const noiDung = readFileSync(f, 'utf-8')
    for (const re of [RE_NAVIGATE, RE_LINK_TO]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(noiDung)) !== null) {
        ra.add(chuanHoa(m[1]))
      }
    }
  }
  return [...ra]
}
