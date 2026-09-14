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
//
// Resolver chỉ trả lời cho TRẠNG THÁI NGHỈ của phần tử (vòng sửa 3 — P3): rule có pseudo-class
// (:hover, :focus, ...) trong selector, hoặc nằm trong @media mang điều kiện tương tác
// (hover/pointer), không được tính vào cuộc đua — các rule đó chỉ áp dụng lúc người dùng tương
// tác, không áp dụng lúc nghỉ. Task 18-26 sẽ thêm nút có cả `bg-surface` lẫn `hover:bg-mutedbg`;
// nếu resolver lỡ tính luôn rule hover, kết quả cho trạng thái nghỉ sẽ sai.

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

// Khoảng byte [start, end) của mọi khối `@media ...{ ... }` mang ĐIỀU KIỆN TƯƠNG TÁC (hover hoặc
// pointer — vd. "@media (hover:hover)"). Rule nằm trong các khối này chỉ áp dụng khi người dùng
// tương tác, không áp dụng lúc nghỉ (P3). Đơn giản hoá có chủ đích cho đúng CSS Tailwind v4 build
// ra ở dự án này: điều kiện luôn là một cụm duy nhất, không lồng dấu { bên trong phần điều kiện —
// nếu sau này cần @media lồng ngoặc phức tạp hơn, hàm đếm độ sâu dấu { bên dưới vẫn đúng, chỉ phần
// nhận diện "có phải điều kiện tương tác không" (regex /hover|pointer/i) có thể cần xem lại.
function findInteractiveMediaRanges(css: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const mediaOpen = /@media([^{]*)\{/g
  let m: RegExpExecArray | null
  while ((m = mediaOpen.exec(css)) !== null) {
    if (!/hover|pointer/i.test(m[1])) continue
    const start = m.index
    let depth = 1
    let i = mediaOpen.lastIndex // ngay sau dấu { vừa khớp
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    ranges.push([start, i])
  }
  return ranges
}

function isInsideAnyRange(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => pos >= start && pos < end)
}

// Vị trí byte CUỐI CÙNG (lớn nhất) của rule ".<className>{...}" ở TRẠNG THÁI NGHỈ (đơn lẻ hoặc
// trong nhóm ".a,.b{...}") có khai báo đúng `cssProperty`. Trả về null nếu lớp này không tồn tại
// trong CSS ở trạng thái nghỉ, hoặc tồn tại nhưng không khai báo thuộc tính đó (vd. .border-hair
// không khai báo margin-top).
function lastOffsetDeclaring(
  css: string,
  className: string,
  cssProperty: string,
  interactiveRanges: Array<[number, number]>,
): { offset: number; value: string } | null {
  const selector = escapeForRegex(toCssSelector(className))
  // Lookbehind (vòng sửa 3 — P3 nguyên nhân 1): thêm `{` — CSS build ra bị minify hoàn toàn,
  // không có khoảng trắng sau dấu { mở khối (`@media (hover:hover){.foo{...}`), nên rule ĐẦU TIÊN
  // ngay sau một khối bất kỳ (không riêng gì @media hover) trước đây không khớp được.
  // Lookahead (P3 nguyên nhân 2): thêm `:` — pseudo-class như :hover đứng NGAY sau tên lớp, không
  // qua dấu phân cách nào (`.hover\:bg-mutedbg:hover{`).
  const pattern = new RegExp(`(?<=^|[}{\\s,])\\.${selector}(?=[,{\\s:])`, 'g')
  // GIỚI HẠN đã biết (P5): so khớp thuộc tính ĐẦY ĐỦ (vd. "border-color", "margin-top"), không
  // hiểu thuộc tính RÚT GỌN (shorthand — "border" gộp border-width+style+color, "margin" gộp 4
  // cạnh). Tailwind v4 ở dự án này không sinh shorthand cho các utility đang dùng nên tình huống
  // này chưa xảy ra. Nếu một ngày gặp: cho propPattern nhận thêm danh sách shorthand tương ứng của
  // từng thuộc tính đủ rồi khớp cả hai — chưa viết code cho việc này vì chưa cần.
  const propPattern = new RegExp(`(?:^|;)\\s*${cssProperty}\\s*:`)

  let match: RegExpExecArray | null
  let last: { offset: number; value: string } | null = null
  while ((match = pattern.exec(css)) !== null) {
    const matchEnd = match.index + match[0].length
    // (a) Pseudo-class ngay sau tên lớp (:hover, :focus, ...) — chỉ áp dụng lúc tương tác. Loại
    // có chủ đích (P3), không phải bỏ sót do regex tình cờ không khớp như trước khi sửa.
    if (css[matchEnd] === ':') continue
    // (b) Rule nằm trong @media điều kiện tương tác — phòng thủ thêm cho trường hợp lý thuyết một
    // rule trong khối này không tự mang pseudo-class trên chính selector của nó.
    if (isInsideAnyRange(match.index, interactiveRanges)) continue

    const braceStart = css.indexOf('{', matchEnd)
    const braceEnd = braceStart === -1 ? -1 : css.indexOf('}', braceStart)
    if (braceStart === -1 || braceEnd === -1) continue
    const declarations = css.slice(braceStart + 1, braceEnd)
    const khai = propPattern.exec(declarations)
    if (khai !== null) {
      // Giá trị = từ sau dấu `:` tới dấu `;` kế tiếp (hoặc hết khối). Giữ nguyên văn, chỉ cắt
      // khoảng trắng hai đầu — nơi gọi tự quyết so số hay so chuỗi.
      const sauDauHai = khai.index + khai[0].length
      const dauCham = declarations.indexOf(';', sauDauHai)
      const value = declarations.slice(sauDauHai, dauCham === -1 ? undefined : dauCham).trim()
      last = { offset: match.index, value }
    }
  }
  return last
}

/**
 * Lõi thuật toán, nhận thẳng chuỗi CSS làm tham số — tách riêng khỏi việc đọc file để
 * `cascade.test.ts` kiểm được chính quy tắc "đứng sau thắng" bằng CSS tự dựng, không phụ thuộc
 * CSS thật đang build ra hôm nay (thứ tự utility trong CSS thật do Tailwind tự sắp, không phải
 * thứ ta kiểm soát để chủ động tạo cuộc đua).
 *
 * Cho một chuỗi `className` (nhiều lớp cách nhau bởi khoảng trắng) và tên một thuộc tính CSS
 * (`border-color`, `margin-top`, `color`, `background-color`, ...), trả về TÊN LỚP thắng cascade
 * cho thuộc tính đó ở trạng thái nghỉ — tức lớp có mặt trong className, có khai báo thuộc tính
 * này tại một rule không-tương-tác, và đứng SAU CÙNG trong CSS. Trả `null` nếu không có lớp nào
 * trong className khai báo thuộc tính này ở trạng thái nghỉ.
 */
function thangCascade(
  css: string,
  className: string,
  cssProperty: string,
): { cls: string; value: string } | null {
  const interactiveRanges = findInteractiveMediaRanges(css)
  let winner: { cls: string; value: string } | null = null
  let winnerOffset = -1

  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const kq = lastOffsetDeclaring(css, cls, cssProperty, interactiveRanges)
    // Đây là quy tắc LÕI của cả resolver: giữa nhiều lớp CÙNG có mặt trong className và CÙNG khai
    // báo thuộc tính đang hỏi, lớp có vị trí byte LỚN HƠN (đứng sau trong CSS) thắng — đúng cách
    // trình duyệt thật xử lý cascade khi độ đặc hiệu bằng nhau. `cascade.test.ts` khoá đúng dòng
    // so sánh `>` này bằng một cuộc đua tự dựng: đảo chiều thành `<` phải làm test đó đỏ.
    if (kq !== null && kq.offset > winnerOffset) {
      winnerOffset = kq.offset
      winner = { cls, value: kq.value }
    }
  }

  return winner
}

export function resolveCascadeWinnerFromCss(css: string, className: string, cssProperty: string): string | null {
  return thangCascade(css, className, cssProperty)?.cls ?? null
}

/**
 * Bọc ngoài dùng cho test component thật: đọc CSS đã build ra rồi gọi thẳng lõi thuật toán ở
 * trên. Xem `resolveCascadeWinnerFromCss` để biết ngữ nghĩa đầy đủ.
 */
export function resolveCascadeWinner(className: string, cssProperty: string): string | null {
  return resolveCascadeWinnerFromCss(loadBuiltCss(), className, cssProperty)
}

/**
 * GIÁ TRỊ mà lớp thắng cascade khai báo, nguyên văn như trong CSS đã build ("50", "fixed", "0").
 * `resolveCascadeWinner` chỉ trả về TÊN lớp, đủ để khoá "lớp nào thắng" nhưng không nói được
 * những bất biến SO SÁNH HAI PHẦN TỬ khác nhau — vd. "lớp phủ hộp thoại phải nằm TRÊN header cột
 * dính", thứ duy nhất bù cho việc `Dialog` không gọi `showModal()` (components/ui/Dialog.tsx).
 * So tên lớp ở đó là tautology; so hai con số mới là đo thật.
 */
export function resolveDeclaredValue(className: string, cssProperty: string): string | null {
  return thangCascade(loadBuiltCss(), className, cssProperty)?.value ?? null
}
