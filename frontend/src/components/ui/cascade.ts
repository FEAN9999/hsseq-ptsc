/// <reference types="node" />
// File này chỉ chạy trong Node (qua Vitest), không bao giờ vào bundle trình duyệt — cần
// @types/node (đã có sẵn trong devDependencies) cho node:fs/node:path/node:url, nhưng
// tsconfig.app.json (dùng cho toàn bộ src/ phía browser) không khai `types: ["node"]`. Thay vì
// nới lỏng tsconfig chung cho cả app, tham chiếu type ngay tại đây — đúng phạm vi vòng sửa này.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Chỉ dùng trong test. Đọc CSS THẬT đã build ra (frontend/dist/assets/*.css) để trả lời câu hỏi
// "utility nào thắng cascade cho một thuộc tính CSS", thay vì hỏi "className có chứa chuỗi này
// không". Hai câu hỏi đó KHÁC NHAU: mọi utility Tailwind ở đây là selector một lớp (.foo{...}),
// cùng độ đặc hiệu — nên khi hai lớp cùng có mặt trong className và cùng khai báo một thuộc tính,
// lớp đứng SAU trong file CSS thắng, bất kể thứ tự viết trong JSX hay trong chuỗi className.
// `className.includes('border-current')` vẫn true dù `border-danger` đứng sau đã đè mất nó.
//
// KHÔNG dùng getComputedStyle của jsdom để thay việc này: jsdom không có engine layout/CSS thật,
// không phân giải nổi `calc(var(--spacing) * 1.5)` (giá trị margin-top thật của mt-1.5/mt-0.5) —
// dùng nó sẽ tạo cảm giác an toàn giả lần nữa, đúng thứ đã làm 21 test vòng 1 mù trước lỗi cascade.

// frontend/src/components/ui/cascade.ts -> lên 3 cấp là frontend/, rồi vào dist/assets
const DIST_ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../dist/assets')

function loadBuiltCss(): string {
  let cssFiles: string[]
  try {
    cssFiles = readdirSync(DIST_ASSETS_DIR)
      .filter((f) => f.endsWith('.css'))
      .sort()
  } catch {
    cssFiles = []
  }

  if (cssFiles.length === 0) {
    throw new Error(
      'Không tìm thấy frontend/dist/assets/*.css. Test cascade đọc CSS THẬT đã build ra để phát ' +
        'hiện lớp nào thắng khi hai utility cùng thuộc tính cùng có mặt trong className — jsdom ' +
        'không có CSS engine nên không giả lập được (đặc biệt các giá trị calc(var(--spacing) * n) ' +
        'của margin). Chạy "npm run build" trong frontend/ trước, rồi chạy lại test.',
    )
  }

  // Gom nội dung mọi file CSS đã build (thường chỉ có một) theo thứ tự tên file, để so vị trí byte
  // xuyên suốt là nhất quán.
  return cssFiles.map((f) => readFileSync(join(DIST_ASSETS_DIR, f), 'utf-8')).join('\n')
}

// Escape một tên lớp thành dạng xuất hiện trong selector CSS thật mà Tailwind build ra — mọi ký tự
// không phải chữ/số/gạch ngang/gạch dưới bị thoát bằng backslash (".mt-1.5" -> ".mt-1\.5",
// "text-[12px]" -> ".text-\[12px\]"), đúng cách CSS.escape hoạt động. Kết quả là CHUỖI VĂN BẢN
// thật sẽ xuất hiện trong file CSS (có ký tự \ thật), CHƯA phải cú pháp regex.
function toCssSelector(className: string): string {
  return className.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

// Escape một chuỗi văn bản thường thành literal an toàn để nhét vào `new RegExp(...)` — mọi ký tự
// có nghĩa đặc biệt trong regex (kể cả dấu \ mà toCssSelector vừa chèn vào ở trên) đều bị thoát lại
// một lần nữa. Bắt buộc phải có bước này: nếu thiếu, dấu \ CSS.escape chèn vào (vd. trong "mt-1\.5")
// sẽ bị REGEX hiểu nhầm thành ký tự escape của riêng nó — biến "\." (2 ký tự cần khớp: \ và .)
// thành chỉ còn nghĩa "khớp 1 dấu . đơn" — nên sẽ KHÔNG khớp được text CSS thật có dấu \ trong đó,
// resolver luôn trả null cho mọi lớp có ký tự đặc biệt (mt-1.5, mt-0.5, text-[12px], ...). Đây
// chính là lỗi khiến 3 test margin-top của Tile đỏ sai (resolver trả null) trước khi sửa dòng này.
function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Vị trí byte CUỐI CÙNG (lớn nhất) của rule ".<className>{...}" (đơn lẻ hoặc trong nhóm
// ".a,.b{...}") có khai báo đúng `cssProperty`. Trả về null nếu lớp này không tồn tại trong CSS,
// hoặc tồn tại nhưng không khai báo thuộc tính đó (vd. .border-hair không khai báo margin-top).
function lastOffsetDeclaring(css: string, className: string, cssProperty: string): number | null {
  const selector = escapeForRegex(toCssSelector(className))
  // Trước dấu chấm phải là đầu file, `}` của rule trước, khoảng trắng, hoặc `,` của nhóm chọn —
  // để không khớp nhầm vào một tên lớp dài hơn có chứa className này làm tiền tố.
  const pattern = new RegExp(`(?<=^|[}\\s,])\\.${selector}(?=[,{\\s])`, 'g')
  const propPattern = new RegExp(`(?:^|;)\\s*${cssProperty}\\s*:`)

  let match: RegExpExecArray | null
  let last: number | null = null
  while ((match = pattern.exec(css)) !== null) {
    const braceStart = css.indexOf('{', match.index)
    const braceEnd = braceStart === -1 ? -1 : css.indexOf('}', braceStart)
    if (braceStart === -1 || braceEnd === -1) continue
    const declarations = css.slice(braceStart + 1, braceEnd)
    if (propPattern.test(declarations)) {
      last = match.index
    }
  }
  return last
}

/**
 * Cho một chuỗi `className` (nhiều lớp cách nhau bởi khoảng trắng) và tên một thuộc tính CSS
 * (`border-color`, `margin-top`, `color`, `background-color`, ...), trả về TÊN LỚP thắng cascade
 * cho thuộc tính đó trong CSS đã build ra — tức lớp có mặt trong className, có khai báo thuộc
 * tính này, và đứng SAU CÙNG trong file CSS. Trả `null` nếu không có lớp nào trong className khai
 * báo thuộc tính này.
 */
export function resolveCascadeWinner(className: string, cssProperty: string): string | null {
  const css = loadBuiltCss()
  let winnerClass: string | null = null
  let winnerOffset = -1

  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const offset = lastOffsetDeclaring(css, cls, cssProperty)
    if (offset !== null && offset > winnerOffset) {
      winnerOffset = offset
      winnerClass = cls
    }
  }

  return winnerClass
}
