// frontend/src/app/cssNen.test.ts
//
// Đo THẲNG vào file nguồn index.css, không qua CSS đã build. Lý do: hai nhóm khẳng định dưới đây
// đều hỏng IM LẶNG — không lỗi build, không lỗi runtime, chỉ là giao diện trông sai.
//
// Nhóm 1 — ba @import. `shadcn/tailwind.css` khai các custom variant `data-open` / `data-closed` /
// `data-active` mà component v4 phụ thuộc (đếm được 40 lượt trong sidebar/sheet/tabs/tooltip).
// Thiếu nó: Sidebar đóng/mở, Tabs đang chọn, Tooltip đều không ăn style. Gói thiết kế THIẾU đúng
// dòng import này — đó là lý do file test này tồn tại.
//
// Nhóm 2 và 3 — token của gói, và ba bất biến của repo mà bản CSS mới phải mang theo.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf-8')
const MAIN_TSX = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../main.tsx'),
  'utf-8',
)

describe('index.css — ba @import bắt buộc của shadcn v4.21', () => {
  it.each([
    ['tailwindcss', 'lõi Tailwind'],
    ['tw-animate-css', 'tiện ích animation component dùng'],
    ['shadcn/tailwind.css', 'custom variant data-open/data-closed/data-active — 40 lượt'],
  ])('có @import "%s" (%s)', (goi) => {
    expect(CSS).toContain(`@import "${goi}"`)
  })
})

// Step 3b, vòng sửa 1: bản đầu tự host ĐÚNG CƠ CHẾ nhưng SAI FONT — `@fontsource-variable/geist` là
// Geist SANS, trong khi thiết kế dùng 'Exo 2' (chữ) + 'Geist Mono' (số); không chỗ nào trong mã
// tham chiếu 'Geist Variable' cả. Kết quả: 5 file .woff2 đóng gói ra không ai dùng — đổi "5 URL
// chết" (404) lấy "5 file chết" (không ai tải). Vấn đề thật không phải lỗi mạng, mà là nạp SAI font.
//
// Thêm nữa: bản đó tải 'Exo 2'/'Geist Mono' qua CDN Google Fonts — mạng nội bộ PTSC có thể chặn CDN
// ngoài, demo sẽ âm thầm rơi về font hệ thống mà không lỗi nào báo. Sửa triệt để: tự host CẢ HAI
// font đúng thiết kế dùng, qua JS entry (main.tsx), không qua CDN.
//
// Bẫy thứ ba (bắt được khi sửa vòng này): package `@fontsource-variable/*` khai `font-family` kèm
// hậu tố " Variable" ('Exo 2 Variable', 'Geist Mono Variable'), KHÁC tên trần 'Exo 2'/'Geist Mono'
// mà CDN Google Fonts dùng. --font-sans/--font-mono phải khớp ĐÚNG tên family gói tự host khai ra,
// nếu không trình duyệt không khớp được @font-face nào, lại âm thầm rơi về font hệ thống lần nữa.
describe('font đúng thiết kế, tự host qua JS entry, không qua CDN (Step 3b, vòng sửa 1)', () => {
  it('index.css không còn nạp font qua CDN Google Fonts', () => {
    expect(CSS).not.toContain('fonts.googleapis.com')
  })

  it('không còn tham chiếu font Geist SAI (Geist Sans) ở index.css lẫn main.tsx', () => {
    expect(CSS).not.toContain('Geist Variable')
    // Bắt cả hai kiểu nháy ('...'/"...") — chỉ khoá nháy đơn thì ai import lại bằng nháy kép sẽ lọt.
    // Không khớp nhầm `fontsource-variable/geist-mono` vì sau "geist" phải là dấu nháy ngay, không
    // phải "-".
    expect(MAIN_TSX).not.toMatch(/fontsource-variable\/geist['"]/)
  })

  it('main.tsx import cả hai gói font đúng: Exo 2 (chữ) và Geist Mono (số)', () => {
    expect(MAIN_TSX).toContain(`import '@fontsource-variable/exo-2'`)
    expect(MAIN_TSX).toContain(`import '@fontsource-variable/geist-mono'`)
  })

  it('main.tsx nạp cả hai font TRƯỚC index.css — --font-sans/--font-mono cần font đã có mặt khi cascade chạy', () => {
    const viTriExo2 = MAIN_TSX.indexOf(`import '@fontsource-variable/exo-2'`)
    const viTriGeistMono = MAIN_TSX.indexOf(`import '@fontsource-variable/geist-mono'`)
    const viTriCss = MAIN_TSX.indexOf(`import './index.css'`)
    expect(viTriExo2).toBeGreaterThanOrEqual(0)
    expect(viTriGeistMono).toBeGreaterThanOrEqual(0)
    expect(viTriCss).toBeGreaterThanOrEqual(0)
    expect(viTriExo2).toBeLessThan(viTriCss)
    expect(viTriGeistMono).toBeLessThan(viTriCss)
  })

  it('--font-sans/--font-mono khớp ĐÚNG tên family gói tự host khai ra (hậu tố "Variable")', () => {
    expect(CSS).toMatch(/--font-sans:\s*'Exo 2 Variable'/)
    expect(CSS).toMatch(/--font-mono:\s*'Geist Mono Variable'/)
  })
})

// Ruling 13 (vòng sửa 1, mở rộng vòng sửa 2): style NGOÀI @layer luôn thắng style TRONG @layer, bất
// kể thứ tự viết — `@layer base { body { @apply bg-background text-foreground } html { @apply
// font-sans } }` vô nghĩa nếu `body {}` trần (đứng ngoài mọi @layer) tự khai lại font-family/
// background/color cho chính nó, vì con thắng cha bất kể layer. Đã bắt được BA LẦN cùng hình dạng ở
// đúng một khối: lần 1 `font: 14px/1.45 Inter...` (toàn app kẹt Inter dù --font-sans đổi gì), lần 2
// `background: #fafaf9; color: #0c0a09;` (trùng giá trị với --background/--foreground hôm nay NÊN
// KHÔNG lệch thị giác — nhưng --background/--foreground đã có nhánh `.dark` do CLI sinh; `.dark`
// bật lên thì nền/chữ sẽ không đổi theo vì khối trần này luôn thắng, lỗi ngủ yên tới lúc đó).
describe('index.css — body không tự khai font-family/background/color (Ruling 13)', () => {
  const khoiBody = CSS.match(/(?:^|\n)body\s*\{[^}]*\}/)?.[0] ?? ''

  it('khối body{} trần tồn tại và có nội dung', () => {
    expect(khoiBody).not.toBe('')
  })

  it('không có font-family/shorthand font — để thừa kế --font-sans từ html', () => {
    expect(khoiBody).not.toMatch(/font-family\s*:/)
    // shorthand `font:` (vd. `font: 14px/1.45 Inter, ...`) cũng đặt font-family — cấm luôn dạng đó
    // (khác `font-feature-settings:`/`font-size:` — không bắt đầu bằng "font" + khoảng trắng + ":").
    expect(khoiBody).not.toMatch(/\bfont\s*:\s*[\d.]/)
  })

  it('không có background/background-color/color — để thừa kế --background/--foreground qua @layer base', () => {
    expect(khoiBody).not.toMatch(/\bbackground(-color)?\s*:/i)
    expect(khoiBody).not.toMatch(/\bcolor\s*:/i)
  })

  // Đường vòng qua @apply: hai khẳng định trên khoá theo TÊN THUỘC TÍNH nên không bắt được
  // `body { @apply bg-…white text-…black; }` — cách viết này tái tạo đúng lỗi cascade-layer gốc (con
  // thắng cha bất kể layer). `@layer base` ngay bên dưới đang dùng đúng cú pháp
  // `@apply bg-background text-foreground` cho cùng mục đích, nên người sửa sau rất dễ chép nhầm
  // vào khối trần này.
  it('khối body{} trần không được chứa @apply', () => {
    expect(khoiBody).not.toMatch(/@apply/)
  })
})

describe('index.css — token của gói thiết kế', () => {
  it('--primary là navy PTSC #203878', () => {
    expect(CSS).toMatch(/--primary:\s*#203878/)
  })

  it.each([
    '--sec', '--success', '--success-bg', '--warning', '--warning-bg',
    '--destructive-bg', '--dark-panel', '--on-dark',
  ])('khai %s', (bien) => {
    expect(CSS).toMatch(new RegExp(`${bien}:`))
  })
})

describe('index.css — ba bất biến của repo', () => {
  // Ruling 425: Toast tự đo rồi ghi đè biến này; mọi thanh dính đáy đọc nó để lùi lên. Khai ở CSS
  // (chứ không chỉ đặt bằng JS) để `bottom-[var(--toast-cao)]` luôn hợp lệ trước khi Toast mount.
  it('giữ --toast-cao mặc định 0px', () => {
    expect(CSS).toMatch(/--toast-cao:\s*0px/)
  })

  // HAI chuyển động của app, và nhánh tôn trọng prefers-reduced-motion phải phủ CẢ HAI. Lát 3
  // thêm `animate-spin` (vòng chờ lúc đánh thức Render ở màn đăng nhập) — bản nở của Tailwind
  // KHÔNG tự sinh nhánh reduced-motion cho nó, nên nếu không khai tay trong index.css thì máy của
  // người xin bớt chuyển động vẫn quay.
  //
  // Cái nháy ô KPI là MỘT chuyển động viết thành hai luật, vì ô KPI ngồi trên hai nền: `.flash`
  // (thẻ trắng) và `.flash-toi` (panel tối). Nhánh reduced-motion phải phủ cả hai — bỏ sót bản
  // tối thì người xin bớt chuyển động vẫn thấy panel loé.
  it('giữ .flash, .flash-toi, .animate-spin và nhánh prefers-reduced-motion phủ CẢ BA', () => {
    expect(CSS).toContain('@keyframes flash-bg')
    expect(CSS).toContain('@keyframes flash-bg-toi')
    expect(CSS).toMatch(/prefers-reduced-motion[\s\S]*?\.flash\s*\{[\s\S]*?animation:\s*none/)
    expect(CSS).toMatch(/prefers-reduced-motion[\s\S]*?\.flash-toi[\s\S]*?animation:\s*none/)
    expect(CSS).toMatch(/prefers-reduced-motion[\s\S]*?\.animate-spin[\s\S]*?animation:\s*none/)
  })

  // Bản tối KHÔNG được kết ở nền trắng như bản sáng — đó chính là lý do nó tồn tại (useNhaySo.ts).
  it('@keyframes flash-bg-toi tan về trong suốt, không kết ở nền trắng', () => {
    const khoi = CSS.match(/@keyframes flash-bg-toi\s*\{([\s\S]*?)\}\s*\}/)
    expect(khoi).toBeTruthy()
    expect(khoi![1]).toContain('transparent')
    expect(khoi![1]).not.toMatch(/to\s*\{[^}]*#fff/)
  })

  // Bảng FM01 có 53 dòng số; lệch cột là lỗi đọc số. Chuỗi 'tabular-nums' tự nó có thể xuất hiện
  // trong CSS đã build vì nhiều lý do khác nhau, nên chỉ toContain là ca xanh giả — khoá đúng hai
  // luật nguồn của bất biến này: (a) .tnum, và (b) luật ô số .num/td.num/th.num phải khai CẢ
  // font-mono LẪN tabular-nums (thiếu một trong hai là lệch cột hoặc lẫn font).
  it('giữ số thẳng cột', () => {
    expect(CSS).toMatch(/\.tnum\s*\{\s*font-variant-numeric:\s*tabular-nums\s*;?\s*\}/)

    const khoiSoO = CSS.match(/\.num\s*,\s*td\.num\s*,\s*th\.num\s*\{([^}]*)\}/)
    expect(khoiSoO, 'không tìm thấy luật .num, td.num, th.num trong index.css').toBeTruthy()
    expect(khoiSoO![1]).toMatch(/font-family:\s*var\(--font-mono\)\s*;?/)
    expect(khoiSoO![1]).toMatch(/font-variant-numeric:\s*tabular-nums\s*;?/)
  })
})

describe('index.css — một nguồn sự thật duy nhất', () => {
  // Tailwind v4 CSS-first và config v3 là hai nguồn cho cùng một biến. Giữ cả hai thì lớp nào
  // thắng là không xác định — đúng chỗ README của gói thiết kế cảnh báo "đánh nhau".
  it('không còn @config trỏ về tailwind.config.ts', () => {
    expect(CSS).not.toContain('@config')
  })

  it('tailwind.config.ts đã bị xoá', () => {
    expect(
      existsSync(join(dirname(fileURLToPath(import.meta.url)), '../../tailwind.config.ts')),
    ).toBe(false)
  })
})

// Vòng sửa 2, Việc 3: mọi khẳng định phía trên đọc THẲNG index.css (nguồn) — bịt lỗi Ở TOKEN, nhưng
// không bịt lỗi Ở TẦNG THẮNG-THUA CASCADE (đúng thứ đã bị bắt ba lần liền, ngay trong khối `body{}`).
// `npm test` luôn build trước khi test chạy (`npm run build && vitest run` — `components/ui/
// cascade.ts` đã dựa đúng giả định này), nên thêm khẳng định đọc CSS ĐÃ BUILD: xác nhận `.font-sans`
// giải ra ĐÚNG family thật, và cả bundle không còn "Inter" ở đâu. Quan trọng vì `tailwind.config.ts`
// (nguồn `fontFamily: { sans: ['Inter', ...] }` cạnh tranh cũ) đã bị xoá hẳn ở Task 12 — hôm nay
// `@theme` của index.css là nguồn DUY NHẤT, nhưng chưa test nào CHỨNG MINH điều đó; nếu có nguồn
// font khác chen vào (đổi `@config`, nâng cấp Tailwind, ...) thì đây là lưới chặn duy nhất, không
// thì lỗi lại im lặng như hai lần trước.
function docCssDaBuild(): string {
  const thuMucAssets = join(dirname(fileURLToPath(import.meta.url)), '../../dist/assets')
  let files: string[]
  try {
    files = readdirSync(thuMucAssets).filter((f) => f.endsWith('.css'))
  } catch {
    files = []
  }
  if (files.length === 0) {
    throw new Error(
      'Không tìm thấy frontend/dist/assets/*.css. Chạy "npm test" (KHÔNG phải "vitest run" trần) để ' +
        'build trước khi test — cùng lý do components/ui/cascade.ts đã đọc CSS thật.',
    )
  }
  return files.map((f) => readFileSync(join(thuMucAssets, f), 'utf-8')).join('\n')
}
const CSS_DA_BUILD = docCssDaBuild()

describe('CSS ĐÃ BUILD — .font-sans giải ra đúng font thật, không còn Inter (vòng sửa 2)', () => {
  it('.font-sans trong bundle thật giải ra "Exo 2 Variable" — @theme của index.css là nguồn DUY NHẤT, không nguồn font nào khác đè', () => {
    expect(CSS_DA_BUILD).toMatch(/\.font-sans\{font-family:["']Exo 2 Variable["']/)
  })

  it('bundle đã build không còn chữ "Inter" ở đâu', () => {
    expect(CSS_DA_BUILD).not.toContain('Inter')
  })

  // Task 13, vòng sửa 1: hai ca trên xác nhận index.css nguồn và CSS đã build sạch Inter, nhưng
  // `frontend/index.html` từng tự tải Inter qua 3 dòng <link> CDN Google Fonts — thừa (font thật tự
  // host qua @fontsource-variable/* nạp từ main.tsx, không rule CSS nào còn dùng Inter) và CHẶN
  // RENDER (link stylesheet là request đồng bộ chờ trước khi vẽ trang); mạng nội bộ PTSC chặn CDN
  // ngoài thì trang treo chờ timeout dù không dùng font đó. Ba dòng đã xoá khỏi index.html; khoá lại
  // ở đây để không ai vô tình thêm về.
  it('index.html không còn nạp font qua CDN Google Fonts', () => {
    const INDEX_HTML = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../index.html'),
      'utf-8',
    )
    expect(INDEX_HTML).not.toContain('fonts.googleapis.com')
    expect(INDEX_HTML).not.toContain('fonts.gstatic.com')
  })
})
