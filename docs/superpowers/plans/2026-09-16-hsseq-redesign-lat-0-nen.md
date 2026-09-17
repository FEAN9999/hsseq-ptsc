# HSSEQ Redesign — Lát 0: Nền (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa `frontend/` sang shadcn/ui v4.21 + hệ token mới, giữ giao diện gần như không đổi và **toàn bộ test xanh**, để tám lát dựng màn phía sau có nền ổn định.

**Architecture:** Cài shadcn v4.21 (`radix-nova`) cạnh mã hiện có, hợp nhất `index.css` từ bản CLI sinh ra với giá trị của gói handoff, rồi chuyển 478 lượt class token cũ sang token mới theo từng cụm thư mục. Hai primitive va chạm tên hoa/thường được đổi tên **trước** khi cài. `tailwind.config.ts` chỉ bị xoá ở bước cuối, sau khi không còn lượt class nào đọc nó.

**Tech Stack:** React 19.2 · Tailwind v4.3 (CSS-first) · Vite 8.3 · TypeScript 6.0 · Vitest 5 · shadcn/ui v4.21 (`radix-nova`, Radix UI, lucide) · Playwright

**Spec:** `docs/superpowers/specs/2026-09-16-hsseq-redesign-shadcn-design.md`

## Global Constraints

- **Lệnh test là `npm test`**, không phải `vitest run`. `package.json` định nghĩa `test` = `npm run build && vitest run`, vì `components/ui/cascade.ts` đọc **CSS THẬT đã build** ở `frontend/dist/assets/*.css`. Chạy `vitest run` trần sẽ đọc CSS cũ còn sót hoặc ném lỗi "Không tìm thấy frontend/dist/assets/*.css". *(Ngoại lệ: các bước chạy riêng một file test mới chưa đụng CSS build thì `npx vitest run <file>` là đủ, và mỗi bước như vậy đều ghi rõ.)*
- **Không dùng `baseUrl`** trong bất kỳ `tsconfig` nào. TypeScript 6 báo `TS5101: Option 'baseUrl' is deprecated` và `tsc -b` thoát khác 0. Chỉ khai `"paths": { "@/*": ["./src/*"] }`.
- **Lệnh cài shadcn đã xác minh:** `npx shadcn@latest init -t vite -b radix -p nova -y --no-monorepo`. Cờ `--base-color` **không còn tồn tại**; `-b` nghĩa là thư viện component, không phải base color. Bỏ bất kỳ cờ nào đều làm CLI rơi vào prompt tương tác và treo.
- **`index.css` phải có đủ ba `@import`**: `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`. Font Geist **KHÔNG** nạp bằng `@import` trong CSS mà bằng `import '@fontsource-variable/geist'` trong `src/main.tsx` — xem Task 6 Step 3b, có số đo. (README của gói thiết kế bảo bốn `@import`; đó là **chỗ lạc hậu thứ sáu** của nó.) Thiếu `shadcn/tailwind.css` thì 40 lượt `data-open` / `data-closed` / `data-active` trong `sidebar.tsx`, `sheet.tsx`, `tabs.tsx`, `tooltip.tsx` **không ăn style mà không có lỗi build nào**.
- **Ba bất biến không được phá:** `--toast-cao` (biến CSS + cơ chế đo trong `Toast.tsx`), `.flash` cùng nhánh `prefers-reduced-motion` (chuyển động **duy nhất** của app), và số thẳng cột (`tabular-nums`).
- **Sàn cỡ chữ 11px.** Dưới mức đó không đọc được ở 1024 zoom 125%.
- **Không có hai đường dẫn nào trong `src/` chỉ khác nhau hoa/thường.** macOS gộp chúng thành một file; Linux/CI tách thành hai.
- Giá trị token lấy nguyên từ `~/Downloads/design_handoff_hsseq_redesign/src-index.css`. Màu thương hiệu `--primary: #203878`.
- **TUYỆT ĐỐI KHÔNG COMMIT.** Người thực thi **không** chạy `git add`, `git commit`, `git stash`, `git checkout -b`, hay bất kỳ lệnh git nào ghi vào lịch sử hoặc vào index. Mọi thay đổi để nguyên trong cây làm việc. Người điều phối chụp ảnh cây sau mỗi task để review. Đây là chỉ thị của chủ dự án và nó **đè lên** mọi bước "Commit" mà khuôn mẫu skill hay thói quen gợi ý.
- **Đang làm thẳng trên `master`** với sự đồng ý tường minh của chủ dự án. Không tạo nhánh, không merge, không push, không mở PR.
- **CSS nằm NGOÀI `@layer` luôn thắng CSS nằm TRONG `@layer`, bất kể thứ tự viết.** `index.css` trộn cả hai: khối `body {}`, `.tnum`, `.flash`, `@keyframes` nằm trần, còn `@layer base` mới dùng token. Mọi thuộc tính khai ở khối trần sẽ **giết token tương ứng** mà không sinh lỗi và không làm đỏ test. Lát này đã dính HAI lần ở cùng một khối `body {}`: `font:` đè `--font-sans` (Ruling 13), rồi `background`/`color` đè `--background`/`--foreground` (Ruling 14). Trước khi đóng bất kỳ task nào đụng `index.css`: liệt kê mọi thuộc tính trong các khối trần, và với mỗi thuộc tính hỏi "có token nào đang khai cùng thứ này trong `@layer` không?".
- **Output của `npm test` phải SẠCH, không chỉ xanh.** Một cảnh báo build không làm đỏ test, nên nó đi lọt qua mọi cửa review đọc diff — đã lọt một lần thật trong lát này (Vite kêu `__dirname` ở `vite.config.ts`, do Task 1 đưa vào, phát hiện ở Task 3+4). Nếu task của bạn làm xuất hiện một dòng cảnh báo mới, đó là việc của bạn phải xử: sửa, hoặc báo lên kèm lý do không sửa được. So với output của task trước, đừng so với "cảm giác bình thường".
- **Ranh giới Task 8–11 vẽ theo THƯ MỤC, nhưng ràng buộc test↔class là theo COMPONENT.** Một assertion ở `pages/` hay `features/` có thể đang nói về class do một primitive trong `components/ui/` sinh ra. Khi bạn đổi class của một component, **mọi assertion nói về chính component đó là việc của bạn**, kể cả khi nó nằm ở thư mục của task khác — vì nó thuộc về thay đổi của bạn, chỉ là plan đặt nhầm chỗ. Task 8 đã dính: 11 ca đỏ ở `Dashboard.test.tsx`, `Reports.test.tsx`, `ReportForm.test.tsx` vì `Tile`/`Banner`/`nut.ts` đổi tên lớp. **Mỗi task phải kết thúc XANH.** Để cây đỏ vắt qua nhiều task nghĩa là một hồi quy thật sinh ra ở task sau sẽ lẫn vào đám đỏ đã biết và không ai thấy.
- **Cẩn thận khi tên lớp cũ đang được dùng làm BỘ ĐỊNH VỊ trong test, không chỉ để so màu.** `Dashboard.test.tsx` dùng `.closest('.rounded-tile')` ở bảy chỗ. `rounded-tile` là tên RIÊNG của `Tile` nên chắc chắn trúng; `rounded-xl` là tên CHUNG mà `card.tsx` của shadcn cũng dùng — đổi thẳng sẽ có nguy cơ selector leo lên trúng Card bọc ngoài, **test vẫn xanh nhưng đo nhầm phần tử**. Đổi bộ định vị thì phải tự chứng minh nó còn trỏ đúng chỗ.
- **Lát 0 không đổi chữ nghĩa và không đổi cấu trúc DOM.** Mọi `getByRole` / `getByText` của bộ e2e phải còn đúng nguyên.
- **Lát 0 KHÔNG hứa "không đổi một pixel" — đừng ai nói câu đó, kể cả trong báo cáo.** Lát 0 hứa
  đúng hai điều: không đổi chữ nghĩa, không đổi cấu trúc DOM. Còn **màu** thì đổi tên giữ nguyên giá
  trị (đã đo OKLab→sRGB, xem ghi chú dưới bảng), nhưng **thang bán kính và thang cỡ chữ thì ĐỔI GIÁ
  TRỊ có chủ đích** — đó chính là nội dung của bản redesign, không phải tai nạn. Ai thấy lệch px ở
  `rounded-*` / `text-*` thì **đừng "sửa" bảng về giá trị cũ**: làm thế là lặng lẽ huỷ bản thiết kế.

---

## File Structure

**Tạo mới:**

| File | Trách nhiệm |
|---|---|
| `frontend/components.json` | Cấu hình shadcn CLI (do CLI sinh) |
| `frontend/src/lib/utils.ts` | `cn()` re-export (do CLI sinh) |
| `frontend/src/hooks/use-mobile.ts` | Hook của `sidebar.tsx` (do CLI sinh) |
| `frontend/src/components/ui/{21 file kebab-case}` | Component shadcn (do CLI sinh) |
| `frontend/src/app/casingScan.ts` | Hàm thuần: tìm nhóm đường dẫn chỉ khác hoa/thường |
| `frontend/src/app/casingScan.test.ts` | Rào chắn hoa/thường |
| `frontend/src/app/alias.test.ts` | Canh alias `@/*` giải được và **không** có `baseUrl` |
| `frontend/src/app/cssNen.test.ts` | Canh ba `@import` và các token nền trong `index.css` |
| `frontend/src/app/assets.test.ts` | Canh bốn logo PTSC có mặt |
| `frontend/public/ptsc-{logo,mark,wordmark,wordmark-white}.png` | Asset logo |

**Đổi tên (`mv` thường — KHÔNG `git mv`, vì `git mv` ghi vào index):**

| Cũ | Mới | Lý do |
|---|---|---|
| `src/components/ui/Dialog.tsx` | `src/components/ui/DialogXacNhan.tsx` | Nó là hộp **xác nhận** (`requireNote`, `danger`, `pending`), không phải dialog chung. Và tránh va chạm với `dialog.tsx` của shadcn. |
| `src/components/ui/Dialog.test.tsx` | `src/components/ui/DialogXacNhan.test.tsx` | đi theo |
| `src/components/ui/Skeleton.tsx` | `src/components/ui/SkeletonDong.tsx` | Nó vẽ **N dòng** (prop `rows`), không phải một khối. Và tránh va chạm với `skeleton.tsx`. |

**Sửa:** `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/vite.config.ts`, `frontend/src/index.css`, `frontend/tailwind.config.ts`, 29 file dùng class token cũ, 6 file test ghim class.

**Xoá:** `frontend/tailwind.config.ts` (Task 12).

---

## Bảng đối chiếu token

**Đây là nguồn duy nhất của phép đổi class.** Task 8, 9, 10, 11 đều tra bảng này; không task nào chép lại nó.

### A. Ba tên **đụng nhau** — xử lý riêng ở Task 6

Ba tên này tồn tại ở **cả** `tailwind.config.ts` lẫn `@theme inline`, nên lớp nào thắng là không xác định. Chúng **không** đổi được cơ học: `text-sec` đi về hai đích khác nhau tuỳ nền.

| Cũ | Mới | Điều kiện |
|---|---|---|
| `text-success` | `text-success-foreground` | luôn luôn |
| `text-warning` | `text-warning-foreground` | luôn luôn |
| `text-sec` | `text-muted-foreground` | khi nằm trên nền sáng (`--background`, `--card`) — phần lớn các lượt |
| `text-sec` | `text-sec` (giữ tên, giá trị mới) | khi nằm trên nền `--muted` / `--sidebar-accent` — đây là chỗ mặc định shadcn trượt AA 4,39:1 |

### B. Phần cơ học — Task 8 đến 11

| Class cũ | Thay bằng |
|---|---|
| `bg-canvas` | `bg-background` |
| `bg-surface` | `bg-card` |
| `border-hair` | `border-border` |
| `bg-mutedbg` | `bg-muted` |
| `text-ink` | `text-foreground` |
| `text-soot` | `text-secondary-foreground` |
| `bg-cyan` / `border-cyanEdge` | `bg-primary` / `border-primary` |
| `text-danger` / `bg-dangerBg` | `text-destructive` / `bg-destructive-bg` |
| `bg-successBg` | `bg-success-bg` |
| `bg-warningBg` | `bg-warning-bg` |
| `border-warningEdge` | `border-warning` |
| `text-draft` | `text-secondary-foreground` |
| `border-danger` | `border-destructive` |
| `bg-danger` | `bg-destructive` |
| `bg-cyanEdge` | `bg-primary` |
| `from-mutedbg` | `from-muted` |
| `via-hair` | `via-border` |
| `to-mutedbg` | `to-muted` |
| `outline-cyan` | `outline-ring` | *(4 lượt — vòng focus bàn phím trên ô nhập: `focus:outline-2 focus:outline-cyan`. Đích đúng là `ring` chứ không phải `primary`: `--ring` và `--primary` cùng `#203878` nên không đổi pixel nào, nhưng tên `ring` mới nói đúng nó là vòng focus. `@layer base` cũng đã dùng `outline-ring/50`.)* |
| `rounded-tile` | `rounded-xl` |
| `rounded-input` | `rounded-md` |
| `text-table` | `text-sm` |
| `text-tableHead` | `text-[13.5px] font-medium text-muted-foreground` |
| `text-kpi` | `text-[44px] leading-none font-medium font-mono` |
| `text-pageTitle` | `text-2xl font-semibold tracking-[-0.4px]` |

### B-ter. Luật cho các hàng NỞ RA NHIỀU LỚP — bản nở chỉ LẤP CHỖ TRỐNG

Bốn hàng cuối mục B nở một token thành nhiều lớp (`text-table`, `text-tableHead`, `text-kpi`,
`text-pageTitle`). Bốn token cũ đó trong `tailwind.config.ts` **chỉ khai cỡ chữ** (`['13px','1.35']`
…) — không khai độ đậm, không khai màu. Bản nở thì có thêm `font-*` và `text-<màu>`. Khi phần tử
ĐÃ tự viết tay thuộc tính đó, ta được hai lớp cùng tranh một thuộc tính, và ai thắng là do thứ tự
trong CSS sinh ra quyết định — tức là do may rủi, không do ai viết ra chủ đích.

**Luật: bản nở chỉ LẤP CHỖ TRỐNG. Phần tử đã tự khai thuộc tính nào thì BỎ phần đó của bản nở đi.**

| Phần tử đã có sẵn | Thì bỏ phần này của bản nở |
|---|---|
| một lớp **độ đậm** (`font-semibold` / `font-bold` / `font-medium`…) | lớp **độ đậm** trong bản nở |

**`font-*` không phải một nhóm.** `font-medium` là `font-weight`; `font-mono` là `font-family`. Hai thứ đó KHÔNG tranh nhau, nên bản nở của `text-kpi` (`… font-medium font-mono`) chỉ bỏ `font-medium`, **giữ `font-mono`** — font đều chữ số là chủ đích thiết kế cho con số KPI. Bỏ nhầm `font-mono` là làm hỏng đúng thứ bản nở sinh ra để làm.

| Phần tử đã có sẵn | Thì bỏ phần này của bản nở |
|---|---|
| một lớp màu chữ (`text-soot`, `text-ink`, `text-sec`…) | `text-muted-foreground` trong bản nở |

Phần tử KHÔNG tự khai thì bản nở áp bình thường — **trừ đúng một ngoại lệ, và nó đã cắn thật.**

Các `<th>` không có lớp màu nào sẽ nhận `text-muted-foreground` từ bản nở. Trên nền trắng thì không
sao (4,81:1). Nhưng tiêu đề bảng của app này nằm trên `bg-muted`, và ở đó `text-muted-foreground`
chỉ còn **4,41:1 — dưới ngưỡng AA 4,5:1**. Spec §4 đã cấm sẵn đúng cặp này ("`text-muted-foreground`
trên `bg-muted` = 4,39:1 → dùng `text-sec`"), nghĩa là câu "đúng lối `TableHead` của shadcn, đó là ý
đồ thiết kế" ở bản kế hoạch trước là **sai và đã bị spec phủ quyết**. Vòng review toàn nhánh bắt
được 15 phần tử như vậy.

**Luật đúng:** phần tử trên `bg-muted` mà không tự khai màu chữ thì lấy `text-sec` (7,14:1), KHÔNG
lấy `text-muted-foreground` của bản nở.

Cũng đáng ghi lại vì sao lỗi này chỉ trúng một nửa: `GroupHeader.tsx:27` tự khai màu nên luật "bản nở
chỉ lấp chỗ trống" bảo vệ nó (nó giữ `text-secondary-foreground`, 16:1). Còn các `<th>` trần không có
gì để bảo vệ. Cùng một luật, hai kết cục — nên khi áp luật này, hãy hỏi thêm "phần tử này nằm trên
nền gì", đừng chỉ hỏi "nó có tự khai chưa".

**Vì sao chọn giữ cái phần tử tự khai, chứ không giữ bản nở:** câu hỏi "tiêu đề bảng nên `medium`
hay `semibold`" là quyết định THIẾT KẾ MÀN, thuộc Lát 1–8, không phải Lát 0. Lát 0 chỉ đổi hạ tầng
token. Giữ nguyên cái phần tử đang tự khai là cách duy nhất không lén quyết định thay cho lát sau.

**Ba chỗ luật này chạm tới (đã đo):**

| Chỗ | Va chạm | Xử |
|---|---|---|
| 11 lượt ở `features/` + 6 lượt ở `pages/Reports.tsx` (`text-tableHead`) | bản nở đưa `font-medium`, phần tử đã có `font-semibold` | bỏ `font-medium`; `font-semibold` thắng sẵn nên **hình chữ không đổi** |
| `features/report/GroupHeader.tsx:27` (`text-tableHead`) | bản nở đưa `text-muted-foreground`, phần tử đã có `text-soot`→`text-secondary-foreground` | bỏ `text-muted-foreground`; `text-secondary-foreground` thắng sẵn nên **màu không đổi** |
| `features/report/FormHeader.tsx:120` (`text-pageTitle`) | bản nở đưa `font-semibold`, phần tử đã có `font-medium` | bỏ `font-semibold`. **Đây là ca DUY NHẤT đang lệch thật**: `.font-semibold` nằm sau `.font-medium` trong CSS nên nó ĐANG thắng, tiêu đề form đã bị đổi từ 500 sang 600 ngoài ý muốn. Bỏ đi là trả về đúng bản cũ. |

### B-bis. Hàng nào giữ GIÁ TRỊ, hàng nào ĐỔI GIÁ TRỊ — đã đo, đừng đo lại

Câu hỏi này đã tốn trọn một vòng review ở Task 9. Chốt tại đây để không ai phải hỏi lần nữa.

**Màu — đổi tên, giữ nguyên giá trị.** Đã quy đổi OKLab→sRGB và đối chiếu từng cặp:

| Cặp | Cũ | Mới | |
|---|---|---|---|
| `bg-canvas` → `bg-background` | `#fafaf9` | `#fafaf9` | trùng khít |
| `bg-surface` → `bg-card` | `#ffffff` | `#ffffff` | trùng khít |
| `bg-mutedbg` → `bg-muted` | `#f5f5f4` | `#f5f5f4` | trùng khít |
| `text-soot` → `text-secondary-foreground` | `#1c1917` | `#1c1917` | trùng khít |
| `border-hair` → `border-border` | `#e8e6e5` | `#e7e5e4` | lệch 1/255 mỗi kênh — **gói thiết kế đã biết và đã chấp nhận**, `src-index.css:88` ghi thẳng: "`--border` (stone-200) gần đúng `#e8e6e5` mà app đang dùng" |

**Màu thương hiệu — ĐỔI GIÁ TRỊ, và đó là điểm chính của cả bản redesign.** Ba hàng cyan KHÔNG
thuộc nhóm "đổi tên giữ giá trị" ở trên:

| Cặp | Cũ | Mới |
|---|---|---|
| `bg-cyan` → `bg-primary` | `#3ba6f1` xanh dương sáng | `#203878` navy PTSC |
| `bg-cyanEdge` → `bg-primary` | `#3398e1` | `#203878` |
| `border-cyanEdge` → `border-primary` | `#3398e1` | `#203878` |

Ràng buộc toàn cục đã ghi thẳng: "Màu thương hiệu `--primary: #203878`". Cyan là màu của gói style
`DESIGN.md` (sản phẩm khác) mà app từng mượn; navy là màu PTSC. Đây là thay đổi ĐƯỢC MONG ĐỢI.

**Cạm bẫy đi kèm — hai token cũ gộp thành MỘT token mới.** `bg-cyan` và `bg-cyanEdge` cùng về
`bg-primary`. Phần tử nào dùng cái này lúc nghỉ và cái kia lúc rê chuột thì sau khi đổi, **hai trạng
thái thành y hệt nhau và hiệu ứng rê chuột biến mất** — không ca test nào bắt được, vì class vẫn hợp
lệ và test vẫn xanh.

Đã đo toàn `src/`: đúng **2 chỗ** dính (`pages/Forbidden.tsx:11`, `pages/NotFound.tsx:11`, cùng là
nút "Về trang chủ", trước là `bg-cyan border-cyanEdge hover:bg-cyanEdge`). **Xử: `hover:bg-primary/80`**
— chính là cách `components/ui/button.tsx:11` và `badge.tsx:11` do shadcn sinh ra đang dùng cho nút
primary, và lớp đó đã có sẵn trong CSS build nên không sinh luật mới. Hai nút đó là bản chép tay của
nút primary; Lát 1–8 thay bằng `<Button>` thì chúng nhận đúng lớp này.

Khi gặp bất kỳ cặp gộp nào khác, quét kiểu: phần tử có cả `X` lẫn `hover:X` sau khi đổi = hỏng.

**Bán kính và cỡ chữ — ĐỔI GIÁ TRỊ, và đó là chủ đích của bản thiết kế.** `src-index.css:32-35` của
gói handoff khai thang bán kính kèm chú thích công dụng ngay trên dòng:

```
--radius-sm: calc(var(--radius) - 4px);   /*  6px — badge nhỏ            */
--radius-md: calc(var(--radius) - 2px);   /*  8px — Button/Input/Badge   */
--radius-lg: var(--radius);               /* 10px — Alert/Tabs/Dialog    */
--radius-xl: calc(var(--radius) + 4px);   /* 14px — Card                 */
```

Đối chiếu với chỗ dùng thật thì khớp đúng ý đồ, không phải map bừa:

| Cặp | Cũ | Mới | Vì sao đúng |
|---|---|---|---|
| `rounded-input` → `rounded-md` | 6px | **8px** | Chỗ dùng là ô nhập và mục điều hướng — handoff ghi `--radius-md` "Button/**Input**/Badge". |
| `rounded-tile` → `rounded-xl` | 10px | **14px** | Chỗ dùng là thẻ/ô KPI — handoff ghi `--radius-xl` "**Card**". |
| `text-table` → `text-sm` | 13px / 1.35 | **14px / 20px** | Handoff đặt nền `body { font-size: 14px }` (`src-index.css:172`). Bảng dùng cỡ chữ nền, đúng lối shadcn. Dòng bảng sẽ CAO HƠN — đó là kết quả mong muốn. |
| `text-tableHead` → `text-[13.5px] font-medium text-muted-foreground` | 12px / 1.2 | **13,5px** | Giá trị tuỳ ý, chọn có chủ đích — không ai gõ `13.5px` do nhầm. |
| `text-kpi` → `text-[44px] leading-none font-medium font-mono` | 40px / 1.1 | **44px + font mono** | Con số KPI to hơn và chuyển sang font đều chữ số. |
| `text-pageTitle` → `text-2xl font-semibold tracking-[-0.4px]` | 24px / 1.25 | 24px + đậm + siết chữ | Cỡ giữ nguyên, thêm sức nặng và độ siết. |

**Hệ quả cho người review:** thấy `rounded-md` ra 8px thay vì 6px thì đó là ĐÚNG. Cái sai duy nhất ở
đây sẽ là đổi ngược về `rounded-[6px]` / `text-[13px]` để "giữ pixel".

**Một lối suy luận bị CẤM dùng làm bằng chứng:** "hash bundle CSS không đổi nên không đổi pixel". Sai.
Hash không đổi chỉ chứng minh không luật CSS nào được thêm/bớt — mà cả `.text-table` lẫn `.text-sm`
đều đã có sẵn trong bundle (thư mục chưa migrate còn dùng tên cũ). Nó KHÔNG nói gì về việc phần tử
vừa đổi tên lớp có trông giống trước hay không. Muốn khẳng định giá trị thì so giá trị khai báo hai
bên, như bảng trên.

**Nhóm thứ ba — TÁM màu ngữ nghĩa cũng ĐỔI GIÁ TRỊ, và cũng là chủ đích.** Hai nhóm trên chỉ nói về
màu trung tính và cyan; bảng này lấp nốt chỗ trống. Tất cả đã đo lại từ OKLCH sang sRGB, và mọi cặp
mới đều ĐẠT AA trên nền tương ứng — nên đây không phải lỗi, nhưng phải ghi ra, vì người review Lát 1
trở đi sẽ thấy chip "Nháp" đậm lên và viền banner cảnh báo sậm lại.

| Token cũ (`tailwind.config.ts`, đã xoá) | Giá trị cũ | Token mới (`index.css`) | Giá trị mới |
|---|---|---|---|
| `draft` | `#57534e` | `--secondary-foreground` | `#1c1917` — **đậm hơn hẳn** |
| `sec` | `#78716c` | `--sec` | `#57514d` |
| `success` | `#15803d` | `--success-foreground` | `#00572e` |
| `successBg` | `#f0fdf4` | `--success-bg` | `#e3f8e9` |
| `warning` | `#b45309` | `--warning-foreground` | `#863f00` |
| `warningEdge` | `#f59e0b` | `--warning` | `#bd7221` |
| `warningBg` | `#fffbeb` | `--warning-bg` | `#fff2e4` |
| `danger` | `#b91c1c` | `--destructive` | `#b33736` |
| `dangerBg` | `#fef2f2` | `--destructive-bg` | `#fff2f0` |

**Một cái bẫy nằm ngay trong bảng này, để dành cho Lát 6 (Duyệt báo cáo — nơi chip sống):** màu
`draft` cũ (`#57534e`) gần như TRÙNG với `--sec` hôm nay (`#57514d`). Nghĩa là chip "Nháp" đã có thể
giữ nguyên giá trị nếu dùng `text-sec`; nó đổi vì được ánh xạ sang `--secondary-foreground`
(`#1c1917`). Cả hai đều đạt AA, nên đây là lựa chọn thẩm mỹ chứ không phải điều kiện. Ai làm Lát 6
thì quyết một lần rồi ghi lại, đừng đo lại từ đầu.


### D. Hai cặp cần THÊM token trước khi đổi — làm ở Task 8 Step 0

Đo toàn bộ `src/` cho ra **22 cặp (tiền tố, token)** đang dùng, tổng **294 lượt**. Mục B phủ 20 cặp.
Hai cặp còn lại không suy cơ học được vì hệ token mới **chưa có chỗ đứng** cho chúng:

| Cũ | Lượt | Mới | Vì sao |
|---|---|---|---|
| `bg-soot` | 2 | `bg-dark-panel` | `soot: #1c1917` ở đây là **nền tối**, không phải màu chữ — lớp phủ modal (`DialogXacNhan.tsx:150`, `bg-soot/30`) và nền toast (`Toast.tsx:89`). Map về `bg-secondary-foreground` thì đúng giá trị nhưng sai nghĩa: đọc "nền = màu-chữ-phụ" sẽ làm lệch mọi người đọc sau. `--dark-panel` đã có sẵn trong `index.css` (Task 6 sinh ra) và bằng ĐÚNG giá trị `--secondary-foreground` — nên đổi tên này **không đổi một pixel nào**. |
| `text-sky` | 1 | `text-sky` (giữ tên) | `sky: #c1e1f7` là màu **liên kết trên nền tối** (`Toast.tsx:99`, chữ xanh nhạt trong toast tối). Hệ token mới không có màu nào thay được: `--primary` là navy `#203878` (chìm nghỉm trên nền tối), `--on-dark` là xám. Và `#c1e1f7` chính là màu `from` của `@keyframes flash-bg` — nó là màu nhấn của app, xứng đáng có token riêng. |

**Task 8 Step 0 phải thêm ba dòng vào `frontend/src/index.css` TRƯỚC khi đổi class**, nếu không hai
lớp trên không tồn tại và giao diện vỡ im lặng:

- trong khối `:root` — `--sky: #c1e1f7;`
- trong khối `@theme inline` — `--color-sky: var(--sky);` và `--color-dark-panel: var(--dark-panel);`

Lý do `--dark-panel` cần dòng `--color-*`: Task 6 đã tạo biến `--dark-panel` nhưng **không phơi nó ra
thành utility**, nên `bg-dark-panel` hiện KHÔNG phải một lớp hợp lệ. Biến có mà không dùng được.

### C. Ba chỗ **không** đổi

| Chỗ | Vì sao |
|---|---|
| `#c1e1f7` trong `@keyframes flash-bg` | Cyan chỉ còn sống ở đây. `.flash` là chuyển động duy nhất của app. |
| `var(--toast-cao)` ở `FormModeBar.tsx`, `AppShell.tsx` | Bất biến Ruling 425 |
| `text-[#a8a29e]` ở `Sidebar.tsx` (mục Giai đoạn 2 bị khoá) | Ba mục đó thành link thật ở Lát 8; lúc đó mới bỏ. Đây là nhãn điều hướng bị khoá, không phải chữ nội dung. |

### Phân bố 478 lượt

| Cụm | Lượt | File | Task |
|---|---|---|---|
| Ba tên đụng nhau (`success`, `warning`, `sec`) | 60 | rải khắp | Task 6 |
| `components/ui/` (phần còn lại) | ~100 | 12 | Task 8 |
| `components/` + `app/` | ~18 | 4 | Task 9 |
| `features/` | ~120 | 10 | Task 10 |
| `pages/` | ~180 | 9 | Task 11 |

---

### Task 1: Alias `@/*` — không `baseUrl`

**Files:**
- Create: `frontend/src/app/alias.test.ts`
- Modify: `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/vite.config.ts`

**Interfaces:**
- Consumes: không
- Produces: alias `@/*` → `frontend/src/*`, dùng được trong mã sản phẩm, trong test, và bởi shadcn CLI.

- [ ] **Step 1: Viết test đỏ**

```ts
// frontend/src/app/alias.test.ts
//
// Alias `@/*` là điều kiện bắt buộc của shadcn CLI, và mọi component sinh ra đều import qua nó
// (`@/lib/utils`, `@/components/ui/skeleton`). Hai mặt phải canh riêng:
//   1. Alias GIẢI ĐƯỢC lúc chạy — đúng cả trong bundle Vite lẫn trong Vitest.
//   2. KHÔNG có `baseUrl` — TypeScript 6 báo TS5101 và `tsc -b` thoát khác 0, nhưng lỗi đó chỉ lộ
//      ra khi chạy build, không lộ ra khi chạy vitest trần. Đo thẳng vào file cấu hình.
//      README của gói thiết kế bảo thêm `baseUrl`; làm theo thì gãy. Khoá lại để không ai "sửa
//      giúp" nó về.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { formatPeriod } from '@/lib/format'

const GOC = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('alias @/*', () => {
  it('giải được lúc chạy — import qua @/ trả đúng hàm thật', () => {
    expect(formatPeriod('2026-08')).toBe('08/2026')
  })

  it('tsconfig.json khai paths @/* → ./src/*', () => {
    const d = JSON.parse(readFileSync(join(GOC, 'tsconfig.json'), 'utf-8'))
    expect(d.compilerOptions?.paths?.['@/*']).toEqual(['./src/*'])
  })

  it.each(['tsconfig.json', 'tsconfig.app.json'])('%s KHÔNG có baseUrl (TS5101)', (ten) => {
    expect(readFileSync(join(GOC, ten), 'utf-8')).not.toMatch(/"baseUrl"/)
  })
})
```

> `formatPeriod` ở `src/lib/format.ts:9` đổi `"YYYY-MM"` thành `"MM/YYYY"` — đã kiểm, `'2026-08'` trả `'08/2026'`. Ca này chứng minh **alias giải được**; nó mượn một hàm có sẵn chứ không định nghĩa lại hành vi của hàm đó.

- [ ] **Step 2: Chạy để chắc chắn nó đỏ**

Run: `cd frontend && npx vitest run src/app/alias.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/format"`.

- [ ] **Step 3: Thêm alias vào ba file cấu hình**

`frontend/tsconfig.json` — thêm khối `compilerOptions` (file này hiện chỉ có `files` + `references`):

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

`frontend/tsconfig.app.json` — thêm ngay trước `"tsBuildInfoFile"`:

```json
    "paths": { "@/*": ["./src/*"] },
```

`frontend/vite.config.ts` — thêm import và khối `resolve`:

**Dùng `import.meta.dirname`, KHÔNG dùng `__dirname`.** Vite 8.3 in cảnh báo mỗi lần build khi config
chứa `__dirname`: `configLoader: 'native'` sẽ thành mặc định ở major sau và không đỡ `__dirname`.
Cảnh báo đó không làm đỏ test nên nó lọt qua cửa review dễ dàng — đã lọt một lần thật ở đây.
Đã kiểm: Node v24.14, `@types/node@24.13.4` khai `interface ImportMeta { dirname }` trong
`module.d.ts:575`, `tsconfig.node.json` để `module: "nodenext"` và `types: ["node"]` — nên nó typecheck.

```ts
import path from 'node:path'
```

```ts
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
```

- [ ] **Step 4: Chạy lại, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS toàn bộ. `tsc -b` không báo TS5101.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
build(frontend): alias @/* cho shadcn CLI — paths không baseUrl, TS6 từ chối baseUrl
```

---

### Task 2: Rào chắn hoa/thường

**Files:**
- Create: `frontend/src/app/casingScan.ts`, `frontend/src/app/casingScan.test.ts`

**Interfaces:**
- Consumes: không
- Produces: `nhomDungHoaThuong(duongDan: string[]): string[][]` — trả các nhóm ≥2 đường dẫn **phân biệt** chỉ khác nhau hoa/thường, đã sắp xếp. `duongDanNguon(): string[]` — mọi file dưới `src/`, tương đối so với `frontend/`. `THU_MUC_QUET_HOA_THUONG = ['src'] as const`.

Phải làm **trước** Task 5. `shadcn add skeleton dialog` ghi đè thẳng `Skeleton.tsx`/`Dialog.tsx` trên macOS; rào này là thứ báo động ở Task 5 và về sau.

- [ ] **Step 1: Viết test đỏ**

```ts
// frontend/src/app/casingScan.test.ts
//
// macOS (APFS) không phân biệt hoa/thường, Linux/CI thì có. Hệ quả đã đo thật: `shadcn add skeleton`
// GHI ĐÈ `ui/Skeleton.tsx` của repo trên máy dev, còn trên CI nó tạo file thứ hai — cùng một lệnh,
// hai cây nguồn khác nhau. `tsc` có bắt được (TS1149) nhưng chỉ khi có file import cả hai, nên
// không thể trông vào nó.
//
// Theo khuôn routeScan.test.ts: test hàm THUẦN bằng chuỗi tự dựng (không phụ thuộc đĩa), rồi khoá
// riêng hằng phạm vi, rồi mới quét cây thật.
import { describe, expect, it } from 'vitest'

import { duongDanNguon, nhomDungHoaThuong, THU_MUC_QUET_HOA_THUONG } from './casingScan'

describe('nhomDungHoaThuong — hàm thuần', () => {
  it('hai đường dẫn chỉ khác hoa/thường → một nhóm hai phần tử', () => {
    expect(nhomDungHoaThuong(['src/ui/Skeleton.tsx', 'src/ui/skeleton.tsx'])).toEqual([
      ['src/ui/Skeleton.tsx', 'src/ui/skeleton.tsx'],
    ])
  })

  it('tên khác nhau thật sự → không nhóm nào', () => {
    expect(nhomDungHoaThuong(['src/ui/SkeletonDong.tsx', 'src/ui/skeleton.tsx'])).toEqual([])
  })

  // Đụng ở phần THƯ MỤC cũng là đụng — Linux tách `Components/` và `components/` thành hai cây.
  it('khác hoa/thường ở thư mục, không phải tên file → vẫn là một nhóm', () => {
    expect(nhomDungHoaThuong(['src/Components/a.tsx', 'src/components/a.tsx'])).toEqual([
      ['src/Components/a.tsx', 'src/components/a.tsx'],
    ])
  })

  // Tự vệ: một đường dẫn kể hai lần KHÔNG phải đụng — nếu gộp bằng mảng thay vì Set thì ca này đỏ.
  it('trùng y hệt (cùng một đường dẫn kể hai lần) → KHÔNG tính là đụng', () => {
    expect(nhomDungHoaThuong(['src/a.tsx', 'src/a.tsx'])).toEqual([])
  })

  it('ba đường dẫn cùng nhóm → một nhóm ba phần tử, sắp xếp ổn định', () => {
    expect(nhomDungHoaThuong(['src/B.tsx', 'src/b.tsx', 'src/B.TSX'])).toEqual([
      ['src/B.TSX', 'src/B.tsx', 'src/b.tsx'],
    ])
  })
})

describe('phạm vi quét', () => {
  // Khẳng định thẳng vào hằng số: gỡ một thư mục ra khỏi phạm vi là ca này đỏ, không im lặng.
  it('quét đúng thư mục src', () => {
    expect([...THU_MUC_QUET_HOA_THUONG]).toEqual(['src'])
  })
})

describe('cây nguồn thật', () => {
  it('không có hai đường dẫn nào chỉ khác nhau hoa/thường', () => {
    expect(nhomDungHoaThuong(duongDanNguon())).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy để chắc chắn nó đỏ**

Run: `cd frontend && npx vitest run src/app/casingScan.test.ts`
Expected: FAIL — `Failed to resolve import "./casingScan"`.

- [ ] **Step 3: Viết hàm thuần**

```ts
// frontend/src/app/casingScan.ts
//
// Chỉ chạy trong Node (qua Vitest), không bao giờ vào bundle trình duyệt — cùng kỹ thuật và cùng lý
// do với routeScan.ts và components/ui/cascade.ts.
import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const THU_MUC_QUET_HOA_THUONG = ['src'] as const

const GOC = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** Nhóm các đường dẫn chỉ khác nhau hoa/thường. Trả nhóm ≥2 phần tử PHÂN BIỆT, đã sắp xếp. */
export function nhomDungHoaThuong(duongDan: string[]): string[][] {
  const theoChuThuong = new Map<string, Set<string>>()
  for (const d of duongDan) {
    const khoa = d.toLowerCase()
    const tap = theoChuThuong.get(khoa) ?? new Set<string>()
    tap.add(d)
    theoChuThuong.set(khoa, tap)
  }
  return [...theoChuThuong.values()]
    .filter((tap) => tap.size > 1)
    .map((tap) => [...tap].sort())
    .sort((a, b) => a[0].localeCompare(b[0]))
}

/** Mọi đường dẫn file dưới các thư mục quét, tương đối so với `frontend/`. */
export function duongDanNguon(): string[] {
  const ra: string[] = []
  const di = (thuMuc: string) => {
    for (const muc of readdirSync(thuMuc, { withFileTypes: true })) {
      const day = join(thuMuc, muc.name)
      if (muc.isDirectory()) di(day)
      else ra.push(relative(GOC, day))
    }
  }
  for (const t of THU_MUC_QUET_HOA_THUONG) di(join(GOC, t))
  return ra
}
```

- [ ] **Step 4: Chạy lại, phải xanh**

Run: `cd frontend && npx vitest run src/app/casingScan.test.ts`
Expected: PASS — 7 ca.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
test(casing): rào chắn hai đường dẫn chỉ khác hoa/thường — macOS gộp, Linux tách
```

---

### Task 3: `Dialog.tsx` → `DialogXacNhan.tsx`

**Files:**
- Rename: `src/components/ui/Dialog.tsx` → `src/components/ui/DialogXacNhan.tsx`
- Rename: `src/components/ui/Dialog.test.tsx` → `src/components/ui/DialogXacNhan.test.tsx`
- Modify: mọi file import nó (xác định ở Step 1)

**Interfaces:**
- Consumes: không
- Produces: `DialogXacNhan` với **đúng props như `Dialog` cũ** — `title`, `body?`, `confirmLabel`, `danger?`, `requireNote?`, `noteLabel?`, `pending?`, `onConfirm`, `onCancel`; và kiểu `DialogXacNhanProps`. **Không đổi một dòng hành vi nào ở task này.**

- [ ] **Step 1: Tìm mọi nơi import**

Run:
```bash
cd frontend && grep -rn "ui/Dialog\|from './Dialog'\|DialogProps\|<Dialog" --include="*.tsx" --include="*.ts" src/
```
Ghi lại danh sách. Dự kiến gồm `features/report/ReportForm.tsx` và chính file test.

- [ ] **Step 2: Đổi tên file**

```bash
cd frontend
mv src/components/ui/Dialog.tsx src/components/ui/DialogXacNhan.tsx
mv src/components/ui/Dialog.test.tsx src/components/ui/DialogXacNhan.test.tsx
```

> `mv` thường, **không** `git mv` — `git mv` ghi vào index, trái ràng buộc toàn cục. Git tự nhận ra đổi tên theo độ giống nội dung lúc chủ dự án commit.

- [ ] **Step 3: Đổi tên định danh trong nội dung**

Trong hai file vừa đổi tên và mọi file tìm được ở Step 1: đổi `Dialog` → `DialogXacNhan`, `DialogProps` → `DialogXacNhanProps`, và sửa đường dẫn import từ `./Dialog` / `../components/ui/Dialog` sang `./DialogXacNhan` / `../components/ui/DialogXacNhan`.

Thêm vào đầu `DialogXacNhan.tsx`:

```tsx
// Đổi tên từ `Dialog.tsx` ở Lát 0 redesign. Hai lý do, lý do thứ hai là lý do bắt buộc:
//   1. Nó KHÔNG phải dialog chung — là hộp xác nhận có `requireNote`/`danger`/`pending`. Tên mới
//      mô tả đúng việc nó làm.
//   2. shadcn sinh `ui/dialog.tsx`; trên macOS `Dialog.tsx` và `dialog.tsx` LÀ CÙNG MỘT FILE, nên
//      `shadcn add dialog` ghi đè mất file này (đã đo thật). Xem src/app/casingScan.test.ts.
```

- [ ] **Step 4: Chạy test, phải xanh y như trước**

Run: `cd frontend && npm test`
Expected: PASS toàn bộ, **cùng số ca như trước khi đổi tên**. Không ca nào đỏ — đây thuần tuý đổi tên.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
refactor(ui): Dialog → DialogXacNhan — tên đúng việc, và né va chạm với dialog.tsx của shadcn
```

---

### Task 4: `Skeleton.tsx` → `SkeletonDong.tsx`

**Files:**
- Rename: `src/components/ui/Skeleton.tsx` → `src/components/ui/SkeletonDong.tsx`
- Modify: `pages/Dashboard.tsx`, `pages/ReportDetail.tsx`, `pages/Reports.tsx`, `pages/Status.tsx`

**Interfaces:**
- Consumes: không
- Produces: `SkeletonDong({ rows }: { rows: number })` — **tĩnh, không shimmer**. Giữ nguyên hành vi và prop `rows`.

- [ ] **Step 1: Tìm mọi nơi import**

Run:
```bash
cd frontend && grep -rn "ui/Skeleton\|<Skeleton" --include="*.tsx" --include="*.ts" src/
```

- [ ] **Step 2: Đổi tên file**

```bash
cd frontend && mv src/components/ui/Skeleton.tsx src/components/ui/SkeletonDong.tsx
```

> `mv` thường, **không** `git mv` — xem ghi chú ở Task 3.

- [ ] **Step 3: Đổi tên định danh trong nội dung**

Đổi `Skeleton` → `SkeletonDong` trong file vừa đổi tên và bốn trang dùng nó; sửa đường dẫn import sang `../components/ui/SkeletonDong`.

Thêm vào đầu file:

```tsx
// Đổi tên từ `Skeleton.tsx` ở Lát 0 redesign. Nó vẽ N DÒNG giả (prop `rows`), không phải một khối —
// khác hẳn `ui/skeleton.tsx` của shadcn (một <div> trơn có lớp shimmer mặc định của Tailwind).
//
// GIỮ NGUYÊN "tĩnh, KHÔNG shimmer": chuyển động duy nhất của app là `.flash` của Tile. Nếu về sau
// dựng lại file này TRÊN `ui/skeleton.tsx` của shadcn thì phải ghi đè bỏ lớp shimmer đó.
//
// Trên macOS `Skeleton.tsx` và `skeleton.tsx` LÀ CÙNG MỘT FILE — `shadcn add skeleton` đã ghi đè
// mất file này một lần (đo thật). Xem src/app/casingScan.test.ts.
//
// Đừng viết tên lớp Tailwind theo nghĩa đen trong comment ở file này: Tailwind v4 quét CẢ comment,
// nên một tên lớp nằm trong comment vẫn sinh ra CSS thật trong bundle. Đã đo: chuỗi đó từng làm
// dist/assets/*.css phình 20,78kB -> 20,92kB và nạp một animation mà app này cấm.
```

- [ ] **Step 4: Chạy test, phải xanh y như trước**

Run: `cd frontend && npm test`
Expected: PASS toàn bộ, cùng số ca.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
refactor(ui): Skeleton → SkeletonDong — vẽ N dòng, và né va chạm với skeleton.tsx của shadcn
```

---

### Task 5: Cài shadcn v4.21 và 21 component

**Files:**
- Create: `frontend/components.json`, `frontend/src/lib/utils.ts`, `frontend/src/hooks/use-mobile.ts`, `frontend/src/components/ui/{21 file kebab-case}`
- Modify: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/index.css` (CLI hợp nhất vào; Task 6 hoàn thiện)
- Modify: `frontend/vite.config.ts` (sửa nợ kỹ thuật Task 1 để lại, và kiểm CLI có đụng vào không)

**Interfaces:**
- Consumes: alias `@/*` (Task 1); rào chắn hoa/thường (Task 2); hai tên đã dọn (Task 3, 4)
- Produces: `@/components/ui/{button,card,table,badge,tabs,input,label,alert,dialog,progress,skeleton,breadcrumb,avatar,separator,dropdown-menu,tooltip,sonner,select,empty,sheet,sidebar}`, `@/lib/utils` (xuất `cn`), `@/hooks/use-mobile`

- [ ] **Step 0: Trả nợ Task 1 — `__dirname` trong `vite.config.ts`**

Task 1 đã đưa `path.resolve(__dirname, './src')` vào `vite.config.ts:9`. File đó trước Task 1 không hề
có `__dirname` (đối chiếu ảnh chụp `snap/task-00-base`). Hệ quả: mỗi lần build, Vite 8.3 in

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'` …
  - `__dirname` (vite.config.ts:9:41). Use `import.meta.dirname` instead
```

Cảnh báo không làm đỏ test nên nó lọt qua cửa review của Task 1. Sửa trước khi chạy CLI, để lát nữa
còn phân biệt được tạp nhiễu nào là của mình và tạp nhiễu nào do `shadcn` sinh ra.

Trong `frontend/vite.config.ts`, đổi đúng một chỗ:

```ts
resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
```

Run: `cd frontend && npm test`
Expected: 815 xanh **và output không còn khối cảnh báo `configLoader: 'native'`**. Nếu `tsc` kêu
`import.meta` — dừng lại và báo, đừng quay về `__dirname`.

- [ ] **Step 1: Chạy init**

```bash
cd frontend && npx shadcn@latest init -t vite -b radix -p nova -y --no-monorepo < /dev/null
```

Expected: `✔ Validating Tailwind CSS. Found v4.` · `✔ Validating import alias.` · `✔ Writing components.json.`

- [ ] **Step 2: Thêm 21 component**

```bash
cd frontend && npx shadcn@latest add sidebar button card table badge tabs input label alert \
  dialog progress skeleton breadcrumb avatar separator dropdown-menu tooltip sonner select empty \
  -y --overwrite < /dev/null
```

Expected: `sheet.tsx` và `hooks/use-mobile.ts` cũng xuất hiện — chúng là phụ thuộc của `sidebar`.

- [ ] **Step 3: Kiểm rào chắn hoa/thường — bước quan trọng nhất của task**

Run: `cd frontend && npx vitest run src/app/casingScan.test.ts`
Expected: PASS. Ca `cây nguồn thật` xanh chứng minh `shadcn add` **không** ghi đè file nào của repo.

> Nếu ca này ĐỎ: CLI vừa tạo một file đụng tên. Đọc tên nhóm nó in ra, `git checkout` file bị ghi đè, đổi tên file cũ theo khuôn Task 3/4, rồi chạy lại Step 2. **Đừng đi tiếp khi ca này còn đỏ.**

- [ ] **Step 4: Kiểm dependency đã vào đúng**

Run: `cd frontend && git diff package.json`
Expected: thấy `cn`, `radix-ui`, `lucide-react`, `class-variance-authority`, `tw-animate-css`, `sonner`, `@fontsource-variable/geist`, `next-themes`, `shadcn`.

> `import { cn } from "cn"` trong component sinh ra **không phải lỗi** — `cn` là package thật (`shadcn-ui/cn`), thay cho cặp `clsx` + `tailwind-merge` của phiên bản cũ.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
build(frontend): cài shadcn v4.21 radix-nova và 21 component
```

> `npm test` **chưa** xanh ở đây — `index.css` do CLI hợp nhất chưa mang token của gói thiết kế. Task 6 đóng lại chỗ đó. Đây là task duy nhất trong plan commit ở trạng thái test chưa xanh; lý do là `shadcn init` và việc hợp nhất token là hai việc có kích thước rất khác nhau, gộp lại thành một commit thì không review được.

---

### Task 6: Hợp nhất `index.css` và gỡ ba tên token đụng nhau

**Files:**
- Create: `frontend/src/app/cssNen.test.ts`
- Modify: `frontend/src/index.css`, `frontend/src/main.tsx` (Step 3b nạp font), `frontend/tailwind.config.ts`
- Modify (sản phẩm, chứa `text-sec`/`text-warning`/`text-success`): `components/ui/{Chip,Banner,Tile,Wordmark,DialogXacNhan}.tsx`, `components/Sidebar.tsx`, `app/router.tsx`, `features/report/{FormHeader,FormModeBar,GroupHeader,ReportForm}.tsx`, `features/dashboard/{Coverage,UnitsTable}.tsx`, `pages/{Login,Reports,Status,ReportDetail,NotFound,Forbidden}.tsx`
- Modify (test): `components/ui/ui.test.tsx`, `features/report/ReportForm.test.tsx`, `pages/Dashboard.test.tsx`
- **KHÔNG** đụng `components/ui/cascade.test.ts`: nó có 2 lượt `border-warning`, nhưng nằm trong chuỗi CSS **tự dựng** làm dữ liệu giả cho phép kiểm "lớp là tiền tố của lớp khác" — không phải class thật. Xem ghi chú ở Step 4.
- Danh sách trên là kết quả đã ĐO (18 file sản phẩm, 3 file test; 43 `text-sec` + 14 `text-warning` + 3 `text-success` = 60 lượt). Nếu grep ở Step 4 ra tập khác, **grep thắng** — sửa theo grep và ghi chênh lệch vào báo cáo.

**Interfaces:**
- Consumes: `index.css` do CLI sinh (Task 5)
- Produces: bộ token đầy đủ — `--primary: #203878`, `--sec`, `--success*`, `--warning*`, `--destructive-bg`, `--dark-panel`, `--dark-panel-2`, `--on-dark`; **giữ** `--toast-cao`, `.tnum`, `.flash`. Và: không còn tên class nào tồn tại ở **cả hai** hệ token.

**Vì sao hai việc này là một task:** thêm `--color-sec` / `--color-success` / `--color-warning` vào `@theme inline` trong khi `tailwind.config.ts` vẫn khai `sec` / `success` / `warning` tạo ra ba lớp mà **hai hệ cùng định nghĩa** — lớp nào thắng là không xác định, đúng chỗ README cảnh báo "token cũ và token shadcn đánh nhau". Tách làm hai commit là cố ý để lại một commit ở trạng thái đó.

**Không** copy đè `src-index.css` của gói như README §0.4 bảo: file đó viết cho shadcn cũ và **thiếu `@import "shadcn/tailwind.css"`**. Lấy bản CLI sinh ra làm khung, áp giá trị của gói lên trên.

Nguồn đối chiếu: `~/Downloads/design_handoff_hsseq_redesign/src-index.css` (giá trị) và bản CLI sinh ra đã lưu ở scratchpad (`index.css.shadcn-v4.21-sinh-ra.reference`).

- [ ] **Step 1: Viết test đỏ cho tầng CSS**

```ts
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
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf-8')

describe('index.css — ba @import bắt buộc của shadcn v4.21', () => {
  it.each([
    ['tailwindcss', 'lõi Tailwind'],
    ['tw-animate-css', 'tiện ích animation component dùng'],
    ['shadcn/tailwind.css', 'custom variant data-open/data-closed/data-active — 40 lượt'],
    ['@fontsource-variable/geist', 'font preset nova nạp'],
  ])('có @import "%s" (%s)', (goi) => {
    expect(CSS).toContain(`@import "${goi}"`)
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

  // Chuyển động DUY NHẤT của app, và nhánh tôn trọng prefers-reduced-motion đi kèm nó.
  it('giữ .flash và nhánh prefers-reduced-motion', () => {
    expect(CSS).toContain('@keyframes flash-bg')
    expect(CSS).toMatch(/prefers-reduced-motion[\s\S]*?\.flash[\s\S]*?animation:\s*none/)
  })

  // Bảng FM01 có 53 dòng số; lệch cột là lỗi đọc số.
  it('giữ số thẳng cột', () => {
    expect(CSS).toContain('tabular-nums')
  })
})

describe('tailwind.config.ts — không tên nào đụng @theme inline', () => {
  // `sec`, `success`, `warning` là ba tên DUY NHẤT tồn tại ở cả hai hệ. Hai hệ cùng định nghĩa
  // `text-sec` thì lớp nào thắng là không xác định. Khoá lại để không ai thêm chúng về.
  const CONFIG = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../tailwind.config.ts'),
    'utf-8',
  )
  it.each(['sec', 'success', 'warning'])('config không còn khoá màu `%s`', (ten) => {
    expect(CONFIG).not.toMatch(new RegExp(`^\\s*${ten}:`, 'm'))
  })
})
```

- [ ] **Step 2: Chạy để chắc chắn nó đỏ**

Run: `cd frontend && npx vitest run src/app/cssNen.test.ts`
Expected: FAIL — thiếu `--primary: #203878`, `--sec`, `--success`, `--dark-panel`, `tabular-nums`, và ba khoá config vẫn còn.

- [ ] **Step 3: Hợp nhất `index.css`**

Giữ nguyên khung CLI sinh ra (ba `@import`, `@custom-variant dark`, `@theme inline` chuẩn, `.dark`, `@layer base`), rồi:

**3a.** Thêm ngay sau ba `@import` dòng nạp font của gói:

```css
@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');
```

**3b.** Trong `@theme inline`, **ghi đè** hai dòng font và **thêm** 8 token ngoài chuẩn:

```css
  --font-sans: 'Exo 2', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, monospace;

  /* Ngoài bộ chuẩn shadcn — trạng thái báo cáo cần ba màu, không phải hai */
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-bg: var(--success-bg);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-bg: var(--warning-bg);
  --color-destructive-bg: var(--destructive-bg);

  /* Chữ phụ ĐẬM HƠN --muted-foreground, dùng cho chữ nhỏ trên nền --muted/--sidebar-accent:
     --muted-foreground trên --muted chỉ đạt 4,39:1, dưới ngưỡng AA 4,5:1. */
  --color-sec: var(--sec);
```

**3c.** Trong `:root`, thay giá trị theo gói thiết kế và thêm token mới:

```css
  --background: oklch(0.985 0.001 106.423);
  --foreground: oklch(0.147 0.004 49.25);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.147 0.004 49.25);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.147 0.004 49.25);

  /* Navy logo PTSC. Màu thương hiệu VÀ là màu hành động DUY NHẤT. Trắng trên nền này = 10,59:1.
     Cyan #3ba6f1 cũ KHÔNG còn là màu hành động — nó chỉ còn sống trong @keyframes flash-bg. */
  --primary: #203878;
  --primary-foreground: oklch(0.985 0.001 106.423);

  --secondary: oklch(0.97 0.001 106.424);
  --secondary-foreground: oklch(0.216 0.006 56.043);
  --muted: oklch(0.97 0.001 106.424);
  --muted-foreground: oklch(0.553 0.013 58.071);
  --accent: oklch(0.97 0.001 106.424);
  --accent-foreground: oklch(0.216 0.006 56.043);

  /* KHÔNG dùng đỏ #e81820 của logo: trắng trên nền đó chỉ 4,0:1, trượt AA. Đỏ này 6,4:1. */
  --destructive: oklch(0.52 0.16 25);
  --destructive-foreground: oklch(0.985 0.001 106.423);
  --destructive-bg: oklch(0.975 0.02 25);

  --success: oklch(0.52 0.11 155);
  --success-foreground: oklch(0.4 0.1 155);
  --success-bg: oklch(0.96 0.03 155);
  --warning: oklch(0.62 0.13 62);
  --warning-foreground: oklch(0.45 0.13 62);
  --warning-bg: oklch(0.97 0.025 62);

  --sec: oklch(0.44 0.01 58);

  --border: oklch(0.923 0.003 48.717);
  --input: oklch(0.923 0.003 48.717);
  --ring: #203878;

  --sidebar: oklch(0.985 0.001 106.423);
  --sidebar-foreground: oklch(0.147 0.004 49.25);
  --sidebar-primary: #203878;
  --sidebar-primary-foreground: oklch(0.985 0.001 106.423);
  --sidebar-accent: oklch(0.97 0.001 106.424);
  --sidebar-accent-foreground: oklch(0.216 0.006 56.043);
  --sidebar-border: oklch(0.923 0.003 48.717);
  --sidebar-ring: #203878;

  /* Dải "Chỉ số an toàn" và nửa trái màn đăng nhập. Là stone-900, KHÔNG phải navy thương hiệu. */
  --dark-panel: oklch(0.216 0.006 56.043);
  --dark-panel-2: oklch(0.26 0.006 56);
  --on-dark: oklch(0.76 0.008 56);
```

**3d.** Trong `@layer base`, thêm quy tắc số:

```css
  .num, td.num, th.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```

**3e.** **Giữ nguyên** `--toast-cao: 0px` trong `:root`, và giữ khối `.tnum` / `@keyframes flash-bg` / `.flash` / `prefers-reduced-motion` mà CLI đã chừa lại. Đổi `.tnum` sang `font-variant-numeric: tabular-nums` (mạnh hơn `font-feature-settings`).

**3f.** **Giữ tạm** dòng `@config "../tailwind.config.ts"` — Task 12 mới gỡ.

- [ ] **Step 3b: Chuyển font Geist sang JS entry — sửa một lỗi production ĐÃ ĐO**

`shadcn init` viết `@import "@fontsource-variable/geist";` vào `src/index.css`. Trạng thái cuối Task 5
đã đo, và nó **hỏng ở production**:

- `dist/` chỉ có 4 file: 1 `.html`, 1 `.js`, 1 `.css`, 1 `.svg`. **Không một `.woff2` nào.**
- Nhưng `dist/assets/*.css` vẫn chứa `@font-face` trỏ `url(./files/geist-*.woff2)` — năm URL.
- Nghĩa là trình duyệt ở production gọi năm URL đó và nhận **404**, rồi lặng lẽ rơi về font hệ thống.
  Không lỗi build, không lỗi console, `npm test` vẫn 815 xanh. Chỉ lộ ra khi mở tab Network.

Nguyên nhân: Tailwind v4 nội tuyến `@import` của CSS **trước** khi đường ống asset của Vite kịp
rebase `url()`, nên Vite không bao giờ biết có năm file font cần phát ra.

Cách chữa — nạp font từ JS entry để Vite xử như một CSS module bình thường:

Trong `frontend/src/index.css`, **xoá** dòng `@import "@fontsource-variable/geist";`.

Trong `frontend/src/main.tsx`, thêm ngay **trên** dòng `import './index.css'`:

```tsx
import '@fontsource-variable/geist'
```

Thứ tự quan trọng: font trước `index.css` để `--font-sans: 'Geist Variable', sans-serif` ở
`index.css` có mặt họ font khi cascade chạy.

Run:
```bash
cd frontend && npm run build && find dist -name "*.woff2" | wc -l
```
Expected: **khác 0** (gói có 10 file woff2; Vite thường chỉ phát ra các subset thực sự được tham
chiếu). Nếu vẫn ra `0` thì cách chữa không ăn — DỪNG và báo, đừng trả lại `@import` cũ.

Kiểm thêm rằng CSS không còn trỏ vào đường dẫn chết:
```bash
cd frontend && grep -oE "url\([^)]*woff2[^)]*\)" dist/assets/*.css | head
```
Expected: các đường dẫn trỏ tới file CÓ THẬT trong `dist/` (dạng `/assets/...`), không còn `./files/`.

- [ ] **Step 4: Liệt kê từng lượt của ba tên đụng nhau, quyết định nền của nó**

Run:
```bash
cd frontend && grep -rn "text-sec\b\|text-warning\b\|text-success\b" --include="*.tsx" --include="*.ts" src/
```

Expected: 60 lượt (43 sản phẩm, 17 test). `text-sec` 43 · `text-warning` 14 · `text-success` 3.

Với mỗi lượt `text-sec`, đọc phần tử cha để biết nền. Quy tắc: cha có `bg-mutedbg` → giữ `text-sec`; còn lại → `text-muted-foreground`. Xem **Bảng đối chiếu token, mục A**.

> Hai lượt `border-warning` trong `components/ui/cascade.test.ts` nằm trong chuỗi CSS **tự dựng**, không phải mã sản phẩm — **không đụng tới**.

- [ ] **Step 5: Sửa ba file test trước, chạy để thấy đỏ**

Sửa `components/ui/ui.test.tsx`, `features/report/ReportForm.test.tsx`, `pages/Dashboard.test.tsx` sang tên lớp mới theo quyết định ở Step 4.

Run: `cd frontend && npm test`
Expected: FAIL — test đòi lớp mới, mã sản phẩm còn lớp cũ. Bước đỏ có chủ đích.

- [ ] **Step 6: Sửa mã sản phẩm và xoá ba khoá khỏi config**

Áp **Bảng đối chiếu token, mục A** lên các file sản phẩm liệt kê ở **Files**.

Rồi trong `frontend/tailwind.config.ts`, trong `theme.extend.colors`, xoá đúng ba dòng `sec`, `success`, `warning`. **Giữ** `successBg`, `warningBg`, `warningEdge`, `dangerBg` — tên chúng không đụng hệ mới (`bg-successBg` khác `bg-success-bg`).

- [ ] **Step 7: Chạy toàn bộ, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS. Các ca cascade trong `ui.test.tsx` giờ đo màu **thật** của token mới.

- [ ] **Step 8: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
feat(css): hợp nhất token shadcn v4.21 với bộ token PTSC, gỡ ba tên đụng nhau
```

---

### Task 7: Bốn asset logo vào `public/`

**Files:**
- Create: `frontend/public/ptsc-logo.png`, `ptsc-mark.png`, `ptsc-wordmark.png`, `ptsc-wordmark-white.png`
- Create: `frontend/src/app/assets.test.ts`

**Interfaces:**
- Consumes: không
- Produces: bốn asset dùng được qua đường dẫn tuyệt đối `/ptsc-*.png`

- [ ] **Step 1: Viết test đỏ**

```ts
// frontend/src/app/assets.test.ts
//
// Bốn asset logo sống trong public/ (Vite phục vụ nguyên si, không qua bundler) nên KHÔNG có import
// nào trỏ tới chúng — thiếu file thì không lỗi build, chỉ là ảnh vỡ lúc chạy. Canh sự tồn tại.
//
// Chọn bản nào ở đâu là một quyết định thiết kế, không phải sở thích: ở 26px, dòng
// "A member of PETROVIETNAM" trong logo đầy đủ chỉ cao ~5px → thành vệt mờ. Nên sidebar dùng bản
// `wordmark` (đã cắt tagline), chỗ rộng mới dùng `logo`.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../public')

describe('asset logo PTSC', () => {
  it.each([
    ['ptsc-logo.png', 'header bản in, chỗ rộng'],
    ['ptsc-mark.png', 'bản trắng — nửa tối màn đăng nhập'],
    ['ptsc-wordmark.png', 'sidebar 26px — đã cắt tagline'],
    ['ptsc-wordmark-white.png', 'bản trắng của wordmark, nền tối chỗ hẹp'],
  ])('%s có mặt (%s)', (ten) => {
    expect(existsSync(join(PUBLIC, ten))).toBe(true)
  })
})
```

- [ ] **Step 2: Chạy để chắc chắn nó đỏ**

Run: `cd frontend && npx vitest run src/app/assets.test.ts`
Expected: FAIL — cả bốn ca.

- [ ] **Step 3: Copy bốn file**

```bash
cp ~/Downloads/design_handoff_hsseq_redesign/ptsc-logo.png \
   ~/Downloads/design_handoff_hsseq_redesign/ptsc-mark.png \
   ~/Downloads/design_handoff_hsseq_redesign/ptsc-wordmark.png \
   ~/Downloads/design_handoff_hsseq_redesign/ptsc-wordmark-white.png \
   frontend/public/
```

- [ ] **Step 4: Chạy lại, phải xanh**

Run: `cd frontend && npx vitest run src/app/assets.test.ts`
Expected: PASS — 4 ca.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
feat(assets): bốn logo PTSC vào public/ — wordmark cho chỗ hẹp, logo đầy đủ cho chỗ rộng
```

---

### Task 8: Đổi class — `components/ui/`

**Files:**
- Modify: mọi file trong `src/components/ui/` còn class token cũ (xác định ở Step 1)
- Modify: `components/ui/ui.test.tsx`, `components/ui/cascade.test.ts` (nếu ghim tên lớp đã đổi)

**Interfaces:**
- Consumes: token mới và ba tên đụng nhau đã dọn (Task 6)
- Produces: `components/ui/` không còn class token cũ nào.

Tra **Bảng đối chiếu token, mục B** (đầu tài liệu) cho phép đổi, và **mục C** cho ba chỗ không đổi.

- [ ] **Step 1: Liệt kê lượt còn lại trong thư mục**

Run:
```bash
cd frontend/src/components/ui && grep -rnoE '(bg|text|border|ring|from|via|to)-(canvas|surface|hair|mutedbg|ink|soot|cyan|cyanEdge|sky|danger|dangerBg|successBg|warningBg|warningEdge|draft)\b|rounded-(tile|input)|text-(table|tableHead|kpi|pageTitle)\b' .
```

- [ ] **Step 2: Sửa test trước, chạy để thấy đỏ**

Cập nhật `ui.test.tsx` (và `cascade.test.ts` nếu nó ghim tên lớp thật) sang tên lớp mới.

Run: `cd frontend && npm test`
Expected: FAIL — test đòi lớp mới.

- [ ] **Step 3: Áp Bảng đối chiếu mục B lên mã sản phẩm trong thư mục**

Giữ nguyên `#c1e1f7` trong keyframes và mọi biểu thức đọc `var(--toast-cao)` (Bảng đối chiếu, mục C).

- [ ] **Step 4: Chạy test, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
refactor(ui): components/ui sang token shadcn
```

---

### Task 9: Đổi class — `components/` và `app/`

**Files:**
- Modify: `components/AppShell.tsx`, `components/Sidebar.tsx`, `app/router.tsx`
- Modify: `components/AppShell.test.tsx`
- Danh sách trên là kết quả đã ĐO bằng chính regex ở Step 1, không phải phỏng đoán. Nếu Step 1 của bạn ra một tập khác, **grep thắng** — sửa theo grep và ghi rõ chênh lệch vào báo cáo.

**Interfaces:**
- Consumes: Task 8
- Produces: `components/` (ngoài `ui/`) và `app/` không còn class token cũ.

Tra **Bảng đối chiếu token, mục B và C** (đầu tài liệu).

- [ ] **Step 1: Liệt kê lượt**

Run:
```bash
cd frontend/src && grep -rnoE '[a-z][a-z-]*-(canvas|surface|hair|mutedbg|ink|soot|cyan|cyanEdge|sky|danger|dangerBg|successBg|warningBg|warningEdge|draft)\b|rounded-(tile|input)|text-(table|tableHead|kpi|pageTitle)\b' components/*.tsx app/*.tsx
```

**Tiền tố MỞ (`[a-z][a-z-]*-`) là cố ý — đừng thu hẹp về `bg|text|border|ring`.** Bản đầu liệt kê
tiền tố đóng và đã bỏ sót `outline-cyan`, `from-mutedbg`, `via-hair`, `to-mutedbg`. Lượt nào regex
này ra mà Bảng đối chiếu (cuối brief này) không có thì **hỏi, đừng đoán**.

- [ ] **Step 2: Sửa `AppShell.test.tsx` trước, chạy để thấy đỏ**

**Giữ nguyên** ca canh `pb-[calc(1.5rem+var(--toast-cao))]` — đó là bất biến Ruling 425.

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Áp Bảng đối chiếu mục B lên ba file sản phẩm**

`Sidebar.tsx` giữ nguyên `text-[#a8a29e]` cho mục Giai đoạn 2 bị khoá (Bảng đối chiếu, mục C).

- [ ] **Step 4: Chạy test, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
refactor(shell): AppShell, Sidebar, router sang token shadcn
```

---

### Task 10: Đổi class — `features/`

**Files:**
- Modify: `features/dashboard/{Coverage,PeriodNav,UnitsTable}.tsx`, `features/report/{FormHeader,FormModeBar,GroupHeader,NumberCell,ReportForm}.tsx`, `features/status/StatusGrid.tsx`
- **KHÔNG** đụng `features/dashboard/KpiTile.tsx`: đã đo, file đó không có một `className` nào — nó uỷ toàn bộ trình bày cho `components/ui/Tile.tsx`, thuộc địa phận Task 8.
- Modify: `features/report/ReportForm.test.tsx`
- Modify: `pages/Dashboard.test.tsx` — **CHỈ dòng 365**, một comment, không phải assertion.
  Task 8 viết dòng đó để chứng minh bộ định vị `.closest('.rounded-xl')` còn trúng ô KPI, và nó
  nhắc `UnitsTable.tsx` dùng `.rounded-input`. Bạn đổi chính class đó ở `UnitsTable.tsx` → comment
  thành lời nói dối. Đổi nó thành tên mới cho khớp. Hai mặt: (1) comment sai là bẫy cho người đọc
  sau; (2) Tailwind v4 quét cả comment, nên để nguyên thì `.rounded-input` vẫn sinh CSS mồ côi.
  ĐỪNG đụng gì khác trong file đó — phần còn lại là của Task 11.
- Danh sách trên là kết quả đã ĐO bằng chính regex ở Step 1, không phải phỏng đoán. Nếu Step 1 của bạn ra một tập khác, **grep thắng** — sửa theo grep và ghi rõ chênh lệch vào báo cáo.

**Interfaces:**
- Consumes: Task 9
- Produces: `features/` không còn class token cũ.

Tra **Bảng đối chiếu token, mục B và C** (đầu tài liệu).

- [ ] **Step 1: Liệt kê lượt**

Run:
```bash
cd frontend/src/features && grep -rnoE '[a-z][a-z-]*-(canvas|surface|hair|mutedbg|ink|soot|cyan|cyanEdge|sky|danger|dangerBg|successBg|warningBg|warningEdge|draft)\b|rounded-(tile|input)|text-(table|tableHead|kpi|pageTitle)\b' .
```

**Tiền tố MỞ (`[a-z][a-z-]*-`) là cố ý — đừng thu hẹp về `bg|text|border|ring`.** Bản đầu liệt kê
tiền tố đóng và đã bỏ sót `outline-cyan`, `from-mutedbg`, `via-hair`, `to-mutedbg`. Lượt nào regex
này ra mà Bảng đối chiếu (cuối brief này) không có thì **hỏi, đừng đoán**.

- [ ] **Step 2: Sửa `ReportForm.test.tsx` trước, chạy để thấy đỏ**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Áp Bảng đối chiếu mục B lên mã sản phẩm**

`FormModeBar.tsx` giữ nguyên mọi biểu thức đọc `var(--toast-cao)`; `Tile` giữ nguyên `.flash` (Bảng đối chiếu, mục C).

- [ ] **Step 4: Chạy test, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
refactor(features): dashboard, report, status sang token shadcn
```

---

### Task 11: Đổi class — `pages/`

**Files:**
- Modify: `pages/{Dashboard,Login,Reports,ReportDetail,Status,Forbidden,NotFound}.tsx`
- Modify: `pages/Dashboard.test.tsx`
- **KHÔNG đụng `pages/Reports.test.tsx`** — Task 8 đã sửa nó rồi. Ca duy nhất ở đó nói về nền
  của `Chip` (`components/ui/Chip.tsx`, thuộc Task 8), nên theo ràng buộc "mọi assertion nói về
  component bạn đổi là việc của bạn" thì nó đã được đổi sang `bg-success-bg` từ Task 8. Đo lại
  ở cuối Task 8: file này còn **0 lượt** token cũ. Nó không có assertion nào về class của
  `Reports.tsx`, nên Task 11 không có việc gì ở đây.
- Danh sách trên là kết quả đã ĐO bằng chính regex ở Step 1, không phải phỏng đoán. Nếu Step 1 của bạn ra một tập khác, **grep thắng** — sửa theo grep và ghi rõ chênh lệch vào báo cáo.

**Interfaces:**
- Consumes: Task 10
- Produces: `src/` không còn class token cũ nào ngoài chuỗi tự dựng trong `cascade.test.ts`.

Tra **Bảng đối chiếu token, mục B và C** (đầu tài liệu).

- [ ] **Step 1: Liệt kê lượt**

Run:
```bash
cd frontend/src/pages && grep -rnoE '[a-z][a-z-]*-(canvas|surface|hair|mutedbg|ink|soot|cyan|cyanEdge|sky|danger|dangerBg|successBg|warningBg|warningEdge|draft)\b|rounded-(tile|input)|text-(table|tableHead|kpi|pageTitle)\b' .
```

**Tiền tố MỞ (`[a-z][a-z-]*-`) là cố ý — đừng thu hẹp về `bg|text|border|ring`.** Bản đầu liệt kê
tiền tố đóng và đã bỏ sót `outline-cyan`, `from-mutedbg`, `via-hair`, `to-mutedbg`. Lượt nào regex
này ra mà Bảng đối chiếu (cuối brief này) không có thì **hỏi, đừng đoán**.

- [ ] **Step 2: Sửa `Dashboard.test.tsx` trước, chạy để thấy đỏ**

(Chỉ MỘT file test. Bản đầu ghi "hai file" vì còn kê `Reports.test.tsx`; Task 8 đã xử file đó
rồi — xem ghi chú "KHÔNG đụng" ở mục Files.)

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Áp Bảng đối chiếu mục B lên bảy trang**

- [ ] **Step 4: Chạy test, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
refactor(pages): bảy trang sang token shadcn
```

---

### Task 12: Xoá `tailwind.config.ts`, chốt Lát 0

**Files:**
- Delete: `frontend/tailwind.config.ts`
- Modify: `frontend/src/index.css` (gỡ `@config`), `frontend/components.json` (gỡ khoá `tailwind.config`)
- Modify: `frontend/src/app/cssNen.test.ts`

**Interfaces:**
- Consumes: Task 6, 8, 9, 10, 11 (không còn lượt class nào đọc config cũ)
- Produces: một nguồn sự thật duy nhất cho token — `index.css`.

- [ ] **Step 1: Chứng minh không còn lượt nào đọc config cũ**

Run:
```bash
cd frontend/src && grep -rnE '[a-z][a-z-]*-(canvas|surface|hair|mutedbg|ink|soot|cyan|cyanEdge|danger|dangerBg|successBg|warningBg|warningEdge|draft)([^-a-zA-Z0-9]|$)|rounded-(tile|input)|text-(table|tableHead|kpi|pageTitle)\b' --include="*.tsx" --include="*.ts" .
```

**Tiền tố MỞ (`[a-z][a-z-]*-`) là cố ý — đừng thu hẹp về `bg|text|border|ring`.** Bản đầu liệt kê
tiền tố đóng và đã bỏ sót `outline-cyan`, `from-mutedbg`, `via-hair`, `to-mutedbg`. Lượt nào regex
này ra mà Bảng đối chiếu (cuối brief này) không có thì **hỏi, đừng đoán**.
**Regex này cố ý để TIỀN TỐ MỞ (`[a-z][a-z-]*-`) chứ không liệt kê `bg|text|border|...`.** Bản đầu
liệt kê bảy tiền tố và đã bỏ sót `outline-cyan` (4 lượt, vòng focus bàn phím) — tức nó sẽ tuyên bố
"sạch" trong khi bốn ô nhập mất vòng focus sau khi config bị xoá. Đừng thu hẹp lại.

**`sky` đã được BỎ khỏi danh sách token trên có chủ đích.** Mục D giữ nguyên tên `text-sky`
(`Toast.tsx:99`) và Task 8 đã thêm `--sky` + `--color-sky` vào `index.css`, nên nó là lớp hợp lệ ở
trạng thái cuối — để trong regex thì mỗi lần chạy lại báo động giả.

Expected: **đúng 15 dòng, tất cả nằm trong `components/ui/`, và không dòng nào là mã thi hành —
trừ một assertion cố ý.** Con số này đã ĐO trên toàn `src/` sau khi Task 11 xong, không phải ước
lượng: `components/`, `app/`, `features/`, `pages/` đều ra **0 lượt**. Năm nhóm dưới đây là toàn
bộ phần còn lại. Đừng sửa chúng, và đừng coi là việc chưa xong:

| Nơi | Vì sao còn |
|---|---|
| `components/ui/cascade.test.ts:22,25` | `border-warningEdge` trong chuỗi CSS **tự dựng** làm dữ liệu giả cho phép kiểm "lớp là tiền tố của lớp khác". Đổi là phá một test đang đúng. |
| `components/ui/cascade.ts:15,24,104,117` | Bốn dòng **comment** minh hoạ cách hàm hoạt động (`border-danger` đè `border-current`, `hover:bg-mutedbg`…). Không phải danh sách tra cứu chức năng. |
| `components/ui/ui.test.tsx:68,145,176` | Ba dòng **comment** giải thích vì sao phép đếm màu phải chốt `toBe(2)` — chốt chống tái phạm một lỗi lịch sử. |
| `components/ui/ui.test.tsx:244,248,250` | Cùng loại ba dòng trên, nhưng **dòng 250 là assertion đang chạy**: `not.toContain('text-tableHead')` — chốt chống tái phạm lỗi vòng sửa 1 (nhãn ô KPI từng dùng nhầm token của `<th>`). Tên token cũ phải còn NGUYÊN VĂN thì phép chốt mới có nghĩa; đổi nó là làm test xanh vĩnh viễn mà không đo gì. |
| `components/ui/Tile.tsx:26` | **Dòng duy nhất nằm trong mã sản phẩm.** Comment nói rõ vì sao nhãn dùng `text-[12px]` chứ KHÔNG dùng `text-tableHead`. Đây là chỗ dễ bị "dọn" nhất vì nó là `.tsx`; xoá là mất lời giải thích cho đúng cái lỗi mà dòng 250 đang canh. |
| `components/ui/Banner.tsx:5`, `Chip.tsx:13` | Comment nhắc tên lớp của `tokens.css` cũ (`.b-danger`, `.c-draft`) — không phải lớp Tailwind, không sinh CSS. |

Nếu grep ra dòng nào **ngoài** bảng này, đó là việc chưa xong — quay lại task tương ứng.

**Lưu ý về comment:** các tên lớp trong những comment trên hiện VẪN sinh CSS thật (Tailwind v4 quét cả
comment). Sau Step 3 của task này, `tailwind.config.ts` biến mất nên `canvas`/`surface`/`hair`/
`mutedbg`/`ink`/`danger` không còn là token nào cả — chúng thôi là lớp hợp lệ và tự hết sinh CSS.
Đó là lý do Step 5 so CSS trước/sau sẽ thấy các luật này **biến mất**; dòng `<` kiểu đó là ĐÚNG, không
phải mất style. Nếu còn chỗ khác, quay lại task tương ứng.

- [ ] **Step 2: Sửa `cssNen.test.ts` cho trạng thái cuối, chạy để thấy đỏ**

Thay khối `describe('tailwind.config.ts — không tên nào đụng @theme inline', …)` (đọc file config, giờ sắp bị xoá) bằng:

```ts
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
```

Thêm `existsSync` vào dòng import `node:fs` ở đầu file.

**Và bịt một lỗ ở lưới bảo vệ, phát hiện khi re-review Task 6.** Trong cùng file, `describe` Ruling 13
đang khoá khối `body {}` trần bằng regex theo TÊN THUỘC TÍNH (`/\bbackground(-color)?\s*:/` và
`/\bcolor\s*:/`). Nó bắt được mọi biến thể giá trị (`#fafaf9`, `rgb(250 250 249)`, thiếu dấu cách),
nhưng **lọt đường vòng qua `@apply`**: ai viết `body { @apply bg-white text-black; }` vào khối trần sẽ
tái tạo y hệt lỗi cascade-layer gốc mà test vẫn xanh. Không phải giả định xa vời — `@layer base` ngay
bên dưới trong cùng file đang dùng đúng cú pháp `@apply bg-background text-foreground` cho cùng mục
đích, nên người sửa sau rất dễ chép sang.

Thêm một `it` khoá: khối `body {}` trần **không được chứa `@apply`** (bất kể theo sau là gì). Nhân tiện
cho hai regex sẵn có phân biệt hoa/thường thành không phân biệt — `Background:` hiện đang lọt.

Run: `cd frontend && npx vitest run src/app/cssNen.test.ts`
Expected: FAIL — `@config` vẫn còn và file config vẫn tồn tại.

- [ ] **Step 3: Gỡ `@config` và xoá file config**

```bash
cd frontend
# gỡ dòng `@config "../tailwind.config.ts";` trong src/index.css (sửa tay)
rm tailwind.config.ts   # `rm` thường, KHÔNG `git rm` — không đụng index
```

Trong `components.json`, đổi khoá `"config": "tailwind.config.ts"` trong khối `tailwind` thành `"config": ""` (schema đòi khoá có mặt).

- [ ] **Step 4: Chạy toàn bộ, phải xanh**

Run: `cd frontend && npm test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Đo vùng quét sau khi mất config — BẮT BUỘC, đừng bỏ**

Xoá `tailwind.config.ts` là xoá luôn dòng `content: ['./index.html', './src/**/*.{ts,tsx}']` vốn đang
khoá vùng quét. Mất nó, Tailwind v4 tự dò nguồn, và vùng dò rộng tới đâu là điều CHƯA ai đo. Nếu nó
nới ra ngoài `src/`, mọi tên class nằm trong tài liệu và comment sẽ sinh CSS thật — và test cascade
(đọc CSS đã build) sẽ xanh giả.

Đừng đoán phạm vi. Đo trực tiếp bằng cách so CSS trước và sau. **Làm Step này bắc cầu qua Step 3:**
chụp CSS **trước khi** gỡ `@config` và xoá file, rồi mới so.

Trước Step 3:

```bash
cd frontend && npm run build && cp dist/assets/*.css /tmp/css-truoc-khi-xoa-config.css
```

Sau Step 3 (config đã xoá):

```bash
cd frontend && npm run build && diff <(tr '}' '\n' < /tmp/css-truoc-khi-xoa-config.css | sort) \
                                     <(tr '}' '\n' < dist/assets/*.css | sort)
```

Expected: **không một dòng `>` nào, và ĐÚNG BẢY dòng `<`** — không hơn, không kém.

Bảy dòng `<` đó là ĐÚNG, không phải mất style. Chúng là bảy luật hiện chỉ tồn tại vì tên lớp còn nằm
trong COMMENT (Tailwind v4 quét cả comment). Xoá `tailwind.config.ts` là các tên đó thôi làm token
nào cả, nên luật tự hết sinh. Đã đo trên bundle hiện tại trước khi giao task này:

| Luật biến mất | Comment giữ nó sống |
|---|---|
| `.text-tableHead` | `Tile.tsx:26`, `ui.test.tsx:244,248,250` |
| `.text-ink` | `ui.test.tsx:176` |
| `.border-danger` | `cascade.ts:15`, `ui.test.tsx:68` |
| `.bg-surface` | `cascade.ts:24` |
| `.bg-mutedbg` | `cascade.ts:24,117` |
| `.border-warningEdge` | `cascade.test.ts:22,25` |
| `.border-hair` | `cascade.ts:104` |

Đối chiếu bảy dòng `<` bạn nhận được với bảng này. Khớp thì đi tiếp.

Nếu `diff` in ra các dòng `>` (luật mới xuất hiện): vùng quét đã nới ra ngoài `src/`. Đọc vài dòng đó
để biết nguồn rò rỉ. Cách chữa — ghim tường minh trong `src/index.css`, **không** khôi phục config:

```css
@import "tailwindcss" source(none);
@source "../index.html";
@source "./";
```

(`source(none)` tắt hẳn phép tự dò; đã kiểm chứng có trong tailwindcss 4.3.3 đang cài — `dist/lib.mjs`
có nhánh `if (E === "none")`.) Build lại và so lại tới khi `diff` im.

Nếu `diff` in ra dòng `<` **NGOÀI bảy dòng trong bảng trên**: một phần `src/` đã rơi ra ngoài vùng
quét — nghiêm trọng hơn, vì giao diện sẽ mất style thật. Cùng cách chữa.

Nếu thiếu dòng `<` nào so với bảng (ví dụ chỉ ra năm dòng): nghĩa là tên lớp đó vẫn đang được MÃ THI
HÀNH dùng ở đâu đó chứ không chỉ nằm trong comment — quay lại Step 1, việc chưa xong.

- [ ] **Step 6: Chạy lint**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 7: Chạy e2e — cửa cuối của Lát 0**

Run: `cd e2e && npx playwright test`
Expected: PASS toàn bộ 4 spec. Lát 0 **không đổi chữ nghĩa hay cấu trúc DOM**, nên mọi `getByRole`/`getByText` phải còn đúng. Nếu có spec đỏ: đó là một thay đổi ngoài ý muốn ở một trong Task 8–11 — tìm và sửa mã, **đừng** sửa spec.

- [ ] **Step 8: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**
Người điều phối chụp ảnh cây rồi mới dispatch review.

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
build(css): xoá tailwind.config.ts — index.css là nguồn token duy nhất
```

---

---

### Task 13: Cập nhật tài liệu cho khớp hiện trạng

**Files:**
- Modify: `TODOS.md`, `docs/designs/hseq-platform-mvp-fm01.md`, `DESIGN.md`

**Interfaces:**
- Consumes: trạng thái cuối của Task 12 (token mới, `tailwind.config.ts` đã xoá)
- Produces: không tài liệu nào còn phát biểu sai về hệ token đang chạy.

Ba tài liệu đang nói ngược bản redesign. Chủ dự án đã chốt **sửa thẳng cho đúng hiện trạng**, không chèn khối "đã bị thay thế". Sửa đúng những phát biểu sai, **không** viết lại cả tài liệu.

- [ ] **Step 1: Liệt kê chính xác từng phát biểu sai**

Run:
```bash
cd /Users/phatlee/Documents/Project/hsseq-ptsc && grep -nE "cyan|#3ba6f1|#3398e1|Inter|tailwind\.config|KPI 40|Roobert" TODOS.md docs/designs/hseq-platform-mvp-fm01.md DESIGN.md
```

- [ ] **Step 2: Sửa `TODOS.md`**

Trong mục *"Logo PTSC chính thức thay wordmark chữ"*, câu Context hiện ghi *"**không** đổi accent cyan của app"* — câu này giờ sai. Sửa thành: accent của app là navy PTSC `#203878`; cyan `#3ba6f1` đã bị giáng cấp, chỉ còn sống trong `@keyframes flash-bg`. Ghi thêm rằng bốn file logo đã có sẵn ở `frontend/public/ptsc-*.png` từ Lát 0, nên phần "cần xin file" của mục này đã xong.

Rồi thêm năm mục hoãn của bản redesign (lấy nguyên từ spec mục 11), mỗi mục theo đúng khuôn **What / Why / Context / Effort / Priority** mà `TODOS.md` đang dùng:

1. **Bản in / PDF FM01** — `Bản in FM01.dc.html` trong gói handoff; hai đường: route `/reports/:id/print` + `window.print()`, hoặc backend sinh PDF. Nút *Xuất PDF* hiện đang disabled.
2. **Bản mobile / tablet** — thiết kế hiện chỉ cho desktop 1280+ và laptop 1024 zoom 125%. Hai chỗ khó: bảng form 7 cột và lưới tình trạng 22×4.
3. **Dark mode** — `@custom-variant dark` đã khai trong `index.css` nhưng chưa có bộ token tối.
4. **Favicon / app icon** từ logo PTSC — hiện vẫn là asset mặc định Vite (tím `#863bff`).
5. **Chế độ trình bày** cho dashboard khi họp — nút đã có trên header, chưa có màn.

- [ ] **Step 3: Sửa `docs/designs/hseq-platform-mvp-fm01.md`**

Bốn chỗ:

| Dòng (áng chừng) | Đang nói | Sửa thành |
|---|---|---|
| ~666 | `nhấn cyan #3ba6f1 / viền #3398e1`, `sky wash #c1e1f7`, ba token ngữ nghĩa dạng hex | Navy `#203878` là màu hành động duy nhất; ba token ngữ nghĩa nay là `--success` / `--warning` / `--destructive` trong `index.css`; `#c1e1f7` chỉ còn trong `@keyframes flash-bg` |
| ~667 | `chỉ Inter (Google Fonts, subset vietnamese)`, `font-feature-settings: "tnum"`, `KPI 40/500` | Exo 2 cho chữ, Geist Mono cho mọi con số; `font-variant-numeric: tabular-nums`; KPI 44/500 mono |
| ~699 | `DESIGN.md: palette stone + cyan … → kế thừa` | Không còn kế thừa `DESIGN.md`; token đến từ gói handoff qua `frontend/src/index.css` |
| ~711 | TD1 đặt token ở `tailwind.config` | Token ở `frontend/src/index.css` (`@theme inline` + `:root`); `tailwind.config.ts` đã bị xoá ở Lát 0 |

**Không** đụng phần lịch sử quyết định (bảng D1–D19, mục "Kết quả /plan-design-review" phần ghi ai quyết cái gì) — chỉ sửa những câu **mô tả hệ token đang chạy**.

- [ ] **Step 4: `DESIGN.md` — ĐỪNG sửa bảng token của nó. Chỉ thêm MỘT dòng phạm vi.**

**Bản kế hoạch đầu bảo đổi `Cyan Signal` thành navy và `Inter` thành `Exo 2` trong `DESIGN.md`. Đó là
SAI, đừng làm.** Đã đo trước khi giao việc:

- `DESIGN.md` có tiêu đề **"Seline Analytics — Style Reference"**. Nó là style guide của một **sản
  phẩm khác**, không phải của app này.
- `grep -ci 'hseq\|hsseq\|ptsc' DESIGN.md` = **0**. Nó chưa bao giờ phát biểu điều gì về HSSEQ.
- Quyết định D19 trong `docs/designs/hseq-platform-mvp-fm01.md:606` đã chốt từ đầu: "DESIGN.md là
  style landing page, không màu ngữ nghĩa" — app chỉ **mượn** dải stone trung tính của nó (tên token
  cũ `canvas`/`soot`/`hair` chính là lấy từ `--color-stone-canvas`/`--color-soot`/`--color-stone-border`).

Đổi `Cyan Signal` của nó thành navy sẽ làm file này **không còn mô tả đúng sản phẩm nào cả** — không
đúng Seline, cũng không đúng HSSEQ. "Viết đè cho đúng hiện trạng" áp cho tài liệu nói về APP NÀY;
`DESIGN.md` không nằm trong số đó. Phát biểu lạc hậu thật sự nằm ở chỗ **trỏ tới** nó
(`hseq-platform-mvp-fm01.md:699` "→ kế thừa"), và Step 3 đã sửa rồi.

Việc duy nhất ở đây: file nằm ở gốc repo nên người đọc sau dễ tưởng nó mô tả repo này. Thêm **đúng
một dòng** ngay dưới tiêu đề, không đụng gì khác:

```markdown
> **Không phải hệ thiết kế của HSSEQ.** Đây là style reference của một sản phẩm khác, app chỉ từng
> mượn dải stone trung tính. Token đang chạy của HSSEQ nằm ở `frontend/src/index.css`.
```

- [ ] **Step 5: Chứng minh không còn phát biểu sai**

Run:
```bash
cd /Users/phatlee/Documents/Project/hsseq-ptsc && grep -nE "accent cyan|nhấn cyan|chỉ Inter|tailwind\.config" TODOS.md docs/designs/hseq-platform-mvp-fm01.md DESIGN.md
```
Expected: không dòng nào khẳng định cyan là accent của app, Inter là font của app, hay `tailwind.config` là nơi chứa token.

- [ ] **Step 6: Dừng — TUYỆT ĐỐI KHÔNG commit**

Để nguyên thay đổi trong cây làm việc. **Không chạy `git add`, không chạy `git commit`.**

Thông điệp commit gợi ý, để chủ dự án tự commit sau khi duyệt:

```text
docs: cập nhật token, font, màu cho khớp hệ shadcn — cyan hết là accent
```

## Nghiệm thu Lát 0

Xong lát này, cả bốn điều sau phải đúng cùng lúc:

1. `cd frontend && npm test` xanh toàn bộ.
2. `cd e2e && npx playwright test` xanh toàn bộ 4 spec.
3. `cd frontend && npm run lint` xanh.
4. App chạy `npm run dev` **trông gần như không đổi** so với trước Lát 0 — đây là lát nền, không phải lát đổi hình.

Và bốn rào chắn mới đang canh:

| Rào | Canh cái gì |
|---|---|
| `src/app/alias.test.ts` | alias `@/*` giải được; **không** có `baseUrl` (TS5101) |
| `src/app/casingScan.test.ts` | không có hai đường dẫn chỉ khác hoa/thường |
| `src/app/cssNen.test.ts` | ba `@import`; token nền; ba bất biến; không còn `@config`; config đã xoá |
| `src/app/assets.test.ts` | bốn logo PTSC có mặt |

Và ba tài liệu (`TODOS.md`, `docs/designs/hseq-platform-mvp-fm01.md`, `DESIGN.md`) không còn phát biểu sai về hệ token.

## Lát tiếp theo

Lát 1 (AppShell + Sidebar + kỳ thành bối cảnh toàn app) có plan riêng, viết sau khi Lát 0 đạt nghiệm thu — mức chi tiết của nó phụ thuộc vào những gì Lát 0 lộ ra khi chạy thật.
