# Thiết kế: HSSEQ — redesign toàn bộ UI trên shadcn/ui

Ngày: 2026-09-16 · Trạng thái: **đã thực thi xong cả chín lát (0–8)**
Gói thiết kế nguồn: `~/Downloads/design_handoff_hsseq_redesign/` (11 file, README 33 KB)

---

## 1. Tóm tắt

Dựng lại toàn bộ giao diện `frontend/` theo gói handoff: 9 màn hiện có + 3 màn quản trị
Giai đoạn 2, trên **shadcn/ui v4.21**, font **Exo 2**, màu thương hiệu navy `#203878`
lấy từ logo PTSC. Kèm 2 endpoint backend mới để 3 màn quản trị chạy bằng dữ liệu thật.

Quy mô đo được trên cây hiện tại:

| Số đo | Giá trị |
|---|---|
| File sản phẩm dùng class token cũ | 29 / 48 |
| Lượt class token cũ phải đổi | 478 |
| File test đơn vị ghim class token cũ | 6 / 24 |
| Màn hình | 9 dựng lại + 3 mới |
| Spec Playwright chịu ảnh hưởng | 4 |

---

## 2. Quyết định đã chốt

| Nhánh | Chốt | Ghi chú |
|---|---|---|
| Phạm vi | **Toàn bộ 12 màn** | Người dùng chọn sau khi nghe đề xuất cắt còn 4 màn |
| Backend | Làm **cả 2** endpoint còn thiếu | `GET /users`, lật `reporting_period.is_open` |
| Toast | Thay bằng **sonner** | Bắt buộc giữ cơ chế `--toast-cao` |
| Bản in / PDF | **Hoãn sau demo** | Đẩy sang `TODOS.md`. `Bản in FM01.dc.html` **ngoài phạm vi đợt này**, và không dựng nút *Xuất PDF* nào cả — xem mục 11 |
| Test | Cập nhật sang token mới, **giữ nguyên độ chặt** | Vẫn canh màu chữ và khoảng cách |
| Đường di trú | **Nền trước, rồi từng màn** | Xem mục 7 |

Hai đường bị loại, ghi lại để không mở lại:

- **Hai hệ token song song (strangler).** README §0.4 nói thẳng: giữ `@config` sẽ khiến
  token cũ và token shadcn đánh nhau — Tailwind v4 CSS-first và config v3 là hai nguồn
  sự thật cho cùng một biến.
- **Dựng app song song `/v2/*`.** Nhân đôi mã và test để cuối cùng vẫn thay hết 12/12 màn.

---

## 3. Kết quả đo: năm chỗ gói handoff đã lạc hậu

Đo bằng phép thử thật trên nhánh `spike/shadcn-init` (đã xoá) và một bản sao biệt lập
trong scratchpad. **Kết luận nền: bộ công cụ chạy được** — shadcn v4.21 nhận đúng
Vite 8.3 + Tailwind v4.3, và cả 21 component biên dịch sạch dưới TypeScript 6 với
`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`.

Nhưng README được viết cho shadcn **cũ**. Năm chỗ sai, cả năm đều làm hỏng Bước 0:

### 3.1 `--base-color stone` không còn tồn tại

CLI v4 thay base color bằng hệ **preset** (Nova · Vega · Maia · Lyra · Mira · Luma ·
Sera · Rhea · Custom), và cờ `-b` đổi nghĩa thành *thư viện component*
(Base UI / React Aria / **Radix UI**). Lệnh trong README **treo ở prompt tương tác**.

Lệnh đã xác minh chạy được:

```bash
npx shadcn@latest init -t vite -b radix -p nova -y --no-monorepo
```

`components.json` sinh ra mang `"style": "radix-nova"`, `"baseColor": "neutral"`,
`"iconLibrary": "lucide"`.

### 3.2 `baseUrl` làm gãy build trên TypeScript 6

README §0.1 bảo thêm `"baseUrl": "."`. Kết quả:

```
tsconfig.app.json(3,5): error TS5101: Option 'baseUrl' is deprecated and will stop
functioning in TypeScript 7.0.
```

**Sửa:** bỏ hẳn `baseUrl`, chỉ khai `"paths": { "@/*": ["./src/*"] }` trong cả
`tsconfig.json` và `tsconfig.app.json`. TS neo `paths` theo vị trí tsconfig, và
shadcn CLI vẫn nhận alias (đã xác minh: *"✔ Validating import alias"*).

### 3.3 Danh sách dependency khác hẳn

| README nói | Thực tế v4.21 |
|---|---|
| `clsx` + `tailwind-merge` | gộp thành một package **`cn`** (`shadcn-ui/cn`) |
| `@radix-ui/*` rời | một package **`radix-ui`** |
| — | thêm `@fontsource-variable/geist`, `next-themes`, và chính `shadcn` |
| `lucide-react`, `class-variance-authority`, `tw-animate-css`, `sonner` | đúng |

Nên `import { cn } from "cn"` trong component sinh ra **không phải lỗi** — đó là
package thật.

### 3.4 Va chạm hoa/thường trên macOS — ghi đè mất mã

`shadcn add skeleton dialog` **ghi đè thẳng** `ui/Skeleton.tsx` và `ui/Dialog.tsx`
của repo, vì APFS không phân biệt hoa/thường.

Mất `Skeleton` cũ — bản cũ nhận prop `rows` và **cố ý tĩnh, không shimmer**; bản
shadcn có `animate-pulse`, **trái luật "chuyển động duy nhất của app là `.flash`"**.

Nguy hơn nữa, `tsc` báo:

```
src/components/ui/sidebar.tsx(17,26): error TS1149: File name '.../ui/skeleton.tsx'
differs from already included file name '.../ui/Skeleton.tsx' only in casing.
```

Trên Linux/CI đó là **hai file riêng biệt** — cùng một bộ lệnh cho ra **hai cây khác
nhau** giữa máy dev (macOS) và CI.

Tổng **46 lỗi TS**, trong đó **45 là hệ quả của đúng vụ ghi đè này**
(38 ở `Dialog.test.tsx`, 3 ở `ReportForm.tsx`, 4 ở các trang dùng `Skeleton rows=`).
**Không lỗi nào sinh từ 20 component shadcn còn lại.**

### 3.5 `src-index.css` của gói thiếu `@import "shadcn/tailwind.css"` — hỏng im lặng

Đây là chỗ nặng nhất, vì **không có lỗi build nào báo**.

shadcn v4.21 sinh `index.css` với bốn import; gói handoff chỉ có hai:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";        /* ← gói handoff THIẾU */
@import "@fontsource-variable/geist"; /* ← gói handoff THIẾU */
```

`shadcn/tailwind.css` khai các custom variant mà component v4 phụ thuộc:
`data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-selected`,
`data-disabled`, `data-active`. Đếm được trong component sinh ra:

```
data-active:  16 lượt   │ sheet.tsx · sidebar.tsx
data-open:    13 lượt   │ tooltip.tsx · tabs.tsx
data-closed:  11 lượt   │
```

Thiếu import đó thì **Sidebar đóng/mở, Tabs đang chọn, Tooltip đều không ăn style** —
đúng bốn component xương sống của bản redesign (Sidebar là màn 2; Tabs có mặt ở
Dashboard, Duyệt báo cáo và header form).

Ba chỗ lệch nhỏ hơn cùng nguồn gốc:

| Thứ | Gói handoff | v4.21 cần |
|---|---|---|
| `--font-heading` | không khai | 3 lượt dùng trong component |
| `--radius-2xl/3xl/4xl` | không khai | 1 lượt `rounded-4xl` |
| `--chart-1..5` | không khai | có trong `@theme inline` chuẩn (12 màn không dùng biểu đồ — rủi ro thấp) |

Thang bán kính **không lệch về số**: handoff dùng `calc(var(--radius) - 4px)`,
v4.21 dùng `calc(var(--radius) * 0.6)`; tại `--radius: 0.625rem` cả hai đều ra
6 / 8 / 10 / 14 px.

**Quyết định:** **không** copy `src-index.css` đè lên như README §0.4 bảo. Thay vào
đó **hợp nhất**: lấy file CLI sinh ra làm khung (đúng import và đúng dây variant cho
v4.21), rồi áp **giá trị** và **token thêm** của gói handoff lên trên.

Bản CLI sinh ra đã lưu để đối chiếu:
`<scratchpad>/index.css.shadcn-v4.21-sinh-ra.reference`

Ghi chú phụ: CLI **hợp nhất** vào `index.css` sẵn có chứ không xoá trắng — nó giữ
nguyên `--toast-cao`, `body`, `.tnum`, `.flash`, và **giữ cả**
`@config "../tailwind.config.ts"`. Dòng `@config` đó vẫn phải tự tay xoá.

---

## 4. Kiến trúc token

`frontend/src/index.css` sau khi hợp nhất gồm, theo thứ tự:

1. Bốn `@import` của v4.21 (mục 3.5). **Không** `@import url(...)` Google Fonts:
   Exo 2 + Geist Mono tự host qua `@fontsource-variable/*`, nạp bằng hai dòng
   `import` ở đầu `src/main.tsx` (mục 12).
2. `@custom-variant dark (&:is(.dark *))` — khai sẵn, **chưa có bộ token tối**
   (ngoài phạm vi, mục 11).
3. `@theme inline` — bộ chuẩn v4.21 (`--color-*`, `--radius-*`, `--font-heading`),
   **ghi đè** `--font-sans` sang `'Exo 2'` và `--font-mono` sang `'Geist Mono'`,
   **cộng** 8 token ngoài chuẩn của handoff: `--color-success`,
   `--color-success-foreground`, `--color-success-bg`, `--color-warning`,
   `--color-warning-foreground`, `--color-warning-bg`, `--color-destructive-bg`,
   `--color-sec`.
4. `:root` — giá trị màu của handoff (navy `#203878` làm `--primary` và `--ring`;
   `--background` = `#fafaf9` trùng đúng `canvas` cũ nên không phải đổi nền), cộng
   `--dark-panel`, `--dark-panel-2`, `--on-dark`, `--danger-on-dark`, và
   **giữ `--toast-cao: 0px`**.

   Hai giá trị lệch handoff, cả hai vì tương phản đo được trên `--dark-panel`
   (oklch L 0.216) — panel "Chỉ số an toàn" của dashboard là chỗ ĐẦU TIÊN hai màu
   này thật sự được dùng làm màu chữ:
   - `--on-dark` = `oklch(0.79 0.008 56)`, **không phải** L 0.76 của handoff. L 0.76
     chỉ cho 4,16:1 — trượt AA 4,5:1, mà đây là màu nhãn 12px. L 0.79 cho 5,06:1 và
     vẫn nhạt hơn trắng (20,68:1) đủ để giữ thứ bậc "dòng phụ".
   - `--danger-on-dark` = `oklch(0.72 0.17 25)`, token MỚI. Dùng lại `--destructive`
     trên nền tối đo ra **1,74:1** — gần như vô hình. Token này cho 5,40:1. Nó là màu
     cho DẢI TỐI của giao diện sáng, không liên quan bộ token chế độ tối ở §11.
5. `@layer base` — bản v4.21, cộng quy tắc `.num` dùng `font-mono` +
   `font-variant-numeric: tabular-nums`.
6. Giữ nguyên từ file cũ: `.tnum`, `@keyframes flash-bg`, `.flash`, nhánh
   `prefers-reduced-motion` — nhánh này ở Lát 3 phải phủ **hai** lớp, không còn một:
   `.flash` và `.animate-spin` (vòng chờ lúc đánh thức Render ở màn đăng nhập).
   Bản nở `animate-spin` của Tailwind không tự sinh nhánh reduced-motion.

`tailwind.config.ts` bị **xoá** sau khi 478 lượt class đã chuyển xong, cùng lúc gỡ
dòng `@config`. Bảng đối chiếu class cũ → mới dùng nguyên bảng ở README.

### Bốn chỗ mặc định shadcn không đạt tương phản — phải chừa ra

Giữ nguyên bốn ngoại lệ README đã đo, vì đây là điều kiện AA:

1. `text-muted-foreground` trên `bg-muted` = 4,39:1 → dùng `text-sec` (5,9:1).
2. Badge trắng trên nền `--warning` = 3,75:1 → chữ **mực**
   `oklch(0.216 0.006 56.043)` (7,9:1). Ngoại lệ: badge trên mục nav **đang mở**
   nằm trên nền navy → chữ **trắng**.
3. `#a8a29e` (stone-400) làm màu chữ = 3,3:1 → cấm. Không còn chỗ nào trong `src/`
   dùng mã này. Ba mục "Quản trị nền tảng" trên `Sidebar.tsx` là **link thật** từ Lát 8
   (`/admin/templates` · `/admin/org` · `/admin/users`), không còn `aria-disabled` hay
   tooltip "Giai đoạn 2" nào.
4. `SidebarGroupLabel` phải là `text-sidebar-foreground/70`, **không** phải
   `text-muted-foreground/70`.

---

## 5. Va chạm hoa/thường: đổi tên theo đúng việc, không phải mẹo né

Chỉ **2 trong 9** primitive cũ va chạm. Đổi tên bằng `git mv` **trước** khi
`shadcn add`:

| Cũ | Thành | Lý do đổi tên |
|---|---|---|
| `ui/Dialog.tsx` | `ui/DialogXacNhan.tsx` | Nó không phải dialog chung — là hộp xác nhận có `requireNote`, `danger`, `pending`. Tên mới mô tả đúng hơn tên cũ. Dựng lại trên `ui/dialog.tsx` của shadcn. |
| `ui/Skeleton.tsx` | `ui/SkeletonDong.tsx` | Nó vẽ **N dòng** giả (prop `rows`), không phải một khối. Dựng lại trên `ui/skeleton.tsx`, **ghi đè bỏ `animate-pulse`** để giữ luật một-chuyển-động. |

Hai bộ sống song song suốt Lát 0 → **không có khoảng đỏ**, và cây trên macOS giống
hệt cây trên CI.

**Rào chắn:** thêm test quét cây, đỏ nếu tồn tại hai đường dẫn chỉ khác nhau
hoa/thường. Theo đúng pattern `app/routeScan.test.ts` repo đã có. Chặn tái phát khi
thêm component shadcn về sau.

---

## 6. `--toast-cao` trên sonner

Hợp đồng hiện tại (`components/ui/Toast.tsx`) phải giữ nguyên:

- Đo **`window.innerHeight - rect.top`**, cố ý **không** dùng `offsetHeight`: dải
  chừa phải gồm cả khoảng hở dưới (`bottom-6`), và đo thẳng từ hình học thì không
  có hằng số ma thuật nào trôi khỏi CSS.
- Dùng **`useLayoutEffect`** để biến có giá trị **trước lượt vẽ đầu** — với
  `useEffect`, thanh dính nhảy lên sau khi người dùng đã thấy nó ở chỗ cũ.
- **Dọn biến** (`removeProperty`) khi Toast tắt *hoặc* khi unmount — để lại dải chừa
  vĩnh viễn thì mọi trang về sau thiếu pixel mà không ai biết vì sao.

Cách dựng: một lớp bọc mỏng quanh `<Toaster/>` của sonner, đo phần tử
`[data-sonner-toast]` trên cùng qua `ResizeObserver` + `MutationObserver`.

Ba chỗ sonner khác Toast cũ, xử lý thẳng trong thiết kế:

| Khác biệt | Xử lý |
|---|---|
| sonner có animation vào/ra sẵn — trái luật "chuyển động duy nhất là `.flash`" | Tắt animation trong `ui/sonner.tsx` |
| sonner xếp chồng nhiều toast và **bung khi rê chuột** → dải cao lên, đẩy thanh dính | Chốt `visibleToasts={1}` + `expand={false}` |
| Toast cũ tự dọn biến khi unmount | Lớp bọc giữ nguyên nhánh `removeProperty` |

Giữ `role="status"` — bộ e2e bám trực tiếp (3 chỗ).

---

## 7. Trình tự chín lát

Theo phụ thuộc trước, giá trị demo sau.

| Lát | Nội dung | Vì sao ở vị trí này |
|---|---|---|
| **0** | Nền: alias `@/*` (không `baseUrl`), `shadcn init`, 21 component, `index.css` hợp nhất, đổi 478 lượt class, xoá `tailwind.config.ts`, copy 4 PNG vào `public/`, đổi tên 2 primitive va chạm, rào chắn hoa/thường, sửa 6 file test | Mọi màn đều phụ thuộc. Xong lát này app **trông gần như cũ** nhưng chạy trên token mới và **test xanh** |
| **1** | `AppShell` + `Sidebar` (`sidebar-07`), kỳ báo cáo thành **bối cảnh toàn app** | Cả 12 màn ngồi trong nó — xong là mọi màn khác ngay |
| **2** | 403 / 404 + `/` thành LỐI VÀO | Nhỏ nhất. Kiểm `Empty` + token chạy suốt đầu-cuối, rẻ |
| **3** | Đăng nhập | Độc lập, không nằm trong `AppShell` |
| **4** | Dashboard | Câu hỏi 1 của Trưởng ban ATCL: "số toàn Tổng công ty" |
| **5** | Tình trạng nộp + hai huy hiệu đếm trên sidebar | Câu hỏi 2: "ai chưa nộp" |
| **6** | Duyệt báo cáo + Báo cáo đơn vị (2 vai, cùng `pages/Reports.tsx`) | |
| **7** | Form nhập 53 dòng | Nặng nhất — để sau khi mọi primitive đã ổn định |
| **8** | 3 màn quản trị + 2 endpoint backend, mở khoá 3 mục nav | Phụ thuộc backend mới. Ba màn CHỈ ĐỌC, trừ đúng một thao tác ghi: mở / đóng kỳ |

**Thay đổi UX trong Lát 1 cần nói rõ:** kỳ báo cáo chuyển từ *từng-trang* (trước đó là
`features/dashboard/PeriodNav.tsx` trên đầu Dashboard) thành **bối cảnh chung của cả app**,
đọc/ghi `?period=YYYY-MM` từ bộ chọn trên sidebar. Ẩn với vai `reporter`. Lát 4 còn giữ song
song cả hai bộ chọn; bản dọn sau Lát 8 bỏ hẳn bộ trên đầu trang và mang BIÊN của dải kỳ (P2,
Ruling 424) sang bộ chọn trên sidebar, nên nay chỉ còn MỘT bộ chọn kỳ trong cả app.

Hệ quả ở từng màn: Dashboard **lọc** số liệu theo kỳ; `/status` **không** lọc — nó vẽ cả
dải kỳ, nên chỉ **tô cột** của kỳ đang chọn (Lát 5). Không có cột được tô thì bộ chọn kỳ
và huy hiệu `x/22` ngay cạnh nó không trỏ vào đâu trên màn đó cả. Các mục nav **không**
mang `?period=` theo: chuyển trang là cả bộ chọn lẫn cột được tô cùng rơi về `KY_MAC_DINH`
— mất kỳ đang xem, nhưng hai chỗ vẫn nói **cùng một kỳ**. Hai huy hiệu đếm đọc chung khoá
`['dashboard','summary',period]` với Dashboard (`staleTime` 5 phút, tắt hẳn với người
không có `dashboard.view`) nên không sinh thêm lượt gọi nào; `submitted_count === 0` thì
không vẽ huy hiệu, còn `0/22` thì có — đó là một trạng thái có nghĩa.

---

## 8. Backend: hai endpoint

Mô hình dữ liệu **đã đủ** — không cần migration. Bám đúng pattern
`require_permission` hiện có.

| Endpoint | Việc | Quyền | Bảng |
|---|---|---|---|
| `GET /users` | join `app_user` + `user_role` + `role` + `org_unit`, đếm quyền mỗi người | `user.manage` | có sẵn |
| `PATCH /templates/{code}/periods/{period_key}` | lật `reporting_period.is_open` | `template.manage` | có sẵn |

Màn **Tổ chức** không cần endpoint mới: `GET /org-units` đã trả cây có `children`
và `is_reporting`.

Hai chi tiết đã chốt khi dựng (Lát 8):

- **Số quyền là `count(distinct)`**, không phải `count(*)`: một người giữ hai vai chồng
  nhau (admin_atcl và viewer cùng cấp `dashboard.view`) sẽ ra con số lớn hơn tổng số
  quyền có thật. Seed không ai giữ hai vai, nên ca canh phải tự dựng cảnh đó.
- **Đóng kỳ chặn ĐÚNG hai cửa**, và màn hình chỉ được nói đúng bấy nhiêu: `POST /reports`
  trả 409 (`api/reports.py:89`), và ô TRỐNG của kỳ đó biến khỏi `GET /reports`
  (`services/reports.py:353`). Nó **không** chặn nộp hay duyệt một báo cáo đã tạo —
  `apply_transition` không đọc `is_open` bao giờ. Câu "đơn vị không nộp được nữa" trong
  mockup 08 là một khẳng định SAI, không dùng.

---

## 9. Chiến lược test

Giữ nguyên độ chặt hiện tại. Bốn nhóm việc:

1. **6 file test đơn vị ghim class** (`AppShell`, `ui/cascade`, `ui/ui`,
   `report/ReportForm`, `pages/Dashboard`, `pages/Reports`) → đổi tên token theo
   bảng đối chiếu.
2. **`Dialog.test.tsx`** (38 lỗi) → đi theo `DialogXacNhan.tsx`: đổi import, **giữ
   nguyên ca kiểm**.
3. **Màn dựng lại → test viết lại** theo cấu trúc mới, giữ nguyên mức chặt. Vẫn canh
   màu **chữ** — chỗ repo đã ship lỗi thật hai lần (commit `39fd161`).
4. **Rào chắn hoa/thường** (mục 5).

### Bộ e2e Playwright (4 spec) cũng dính

Phần lớn bám `getByRole` / `getByText` nên an toàn. Ba loại phải xử lý:

| Loại | Cụ thể | Xử lý |
|---|---|---|
| **Giữ bằng mọi giá** | `td[data-cot]`, `td[data-testid="o-ky"]`, `role="status"` | e2e bám trực tiếp — mọi bản dựng lại phải giữ nguyên các thuộc tính này |
| **Giữ nguyên copy** | `heading 'Dashboard SKATMT'` và dòng `'Tổng từ 21 báo cáo đã duyệt'` | Lát 4 GIỮ cả hai. H1 là danh tính của trang cho trình đọc màn hình và cho nhánh 403 — một H1 chỉ ghi tháng thì mất danh tính đó, trong khi kỳ đã được bộ chọn kỳ trên sidebar và dòng bao phủ nói rõ. Dòng bao phủ giữ nguyên `Coverage.tsx` vì nó là chỗ DUY NHẤT trên trang trả lời "đơn vị nào chưa nộp" bằng tên |
| **Một chỗ mong manh** | `demo-path.spec.ts` bám `div.overflow-auto` | Đã sửa ở Lát 4, KHÔNG bằng `data-testid`: selector đổi thành `div.overflow-auto:has(table)`. Sidebar dựng trên shadcn mang `overflow-auto` ở `SidebarContent` và đứng TRƯỚC trong DOM, nên `querySelector` cũ bắt nhầm khung sidebar (`scrollTop` luôn 0) và phép đo mất nghĩa. Cùng ca còn có một Locator lọc `has: table` — hai bên nay dùng chung một hằng |
| **Ô KPI đọc theo cấu trúc** | `soKpi()` lấy `> div` con thứ hai của ô | Đã sửa ở Lát 4 sang `.font-mono`: đơn vị đo nay nằm CÙNG DÒNG với con số nên con thứ hai trả về cả `"63 số vụ"` |
| **Neo đo khoảng cách** | `demo-path.spec.ts` ca `C-T25/2` lấy `h1.parentElement` làm "titlebar" | Đã sửa ở Lát 6: giả định đó chỉ đúng khi `<h1>` là con TRỰC TIẾP của titlebar. Lát 6 bọc `<h1>` cùng dòng phụ đề trong một `<div>` con ⇒ `nextElementSibling` thành khối điều khiển BÊN PHẢI cùng hàng flex, phép đo trả **-34px**. Neo mới leo từ `<h1>` lên tổ tiên nằm ngay dưới gốc trang (con đầu của `[data-slot="noi-dung"]`) — đúng với cả ba trang |
| **Ba màn quản trị** | Lát 8 thêm ba bảng mới và mở khoá ba mục nav | Hai ca mới trong `demo-path.spec.ts`: `C-Lát8/1` bấm từng mục nav (không `goto`) rồi đo tràn ngang ở cả hai khung nhìn — cùng lớp lỗi `min-w-0` của Lát 6, thứ jsdom không thấy; `C-Lát8/2` mở rồi đóng lại kỳ **06/2026** qua giao diện. Chọn 06/2026 vì nó đang ĐÓNG trong seed nên ca kết thúc ở đúng trạng thái ban đầu — `reset_demo.py` là insert-if-absent, KHÔNG đặt lại `is_open` của kỳ đã có, nên đụng vào 08 / 09 là để lại một database không còn demo được |
| **Neo của ca route** | `routes.test.tsx` chứng minh `/reports/:id` dừng ở `ReportDetail` bằng chuỗi `"<đơn vị> · <kỳ>"` của vệt breadcrumb trong trang | Đã sửa ở Lát 7: vệt đó bị bỏ (lặp nguyên chữ của `<h1>` ngay dưới, và AppShell đã có breadcrumb riêng từ Lát 1). Neo mới là NÚT QUAY LẠI — thứ chỉ `ReportDetail` dựng — khoanh trong `[data-slot="noi-dung"]` vì nhãn trùng một link của Sidebar |

---

## 10. Bất biến không được phá

| Thứ | Ở đâu | Vì sao |
|---|---|---|
| `--toast-cao` | `index.css` (mặc định `0px`) + `components/ui/Toast.tsx` → `AppShell` và `FormModeBar` | Thiếu thì thanh thao tác của form bị Toast che suốt 4 giây (Ruling 425). Từ lát 5 dải này đo trên `<ol data-sonner-toaster>`, và hai chi tiết KHÔNG được gỡ: (1) `<ol>` phải được cấp `height: var(--front-toast-height)` — sonner đặt toast `<li>` position:absolute nên `<ol>` vốn CAO 0px và phép đo trả về 24px, chừa thiếu nguyên chiều cao toast; (2) `visibleToasts={1}` — cả ý tưởng chừa chỗ giả định dải có chiều cao ỔN ĐỊNH, cho sonner xếp chồng thì thanh thao tác nhảy mỗi lần một toast tới. e2e `C-T24/2b` là ca duy nhất bắt được khi (1) bị gỡ |
| `.flash`, `.flash-toi` **và** `.animate-spin` trong nhánh `prefers-reduced-motion` | `index.css` | **Hai** chuyển động của app, và chỉ hai. Cái nháy ô KPI khi số đổi (D18) là MỘT chuyển động viết thành hai luật vì ô KPI ngồi trên hai nền — `.flash` cho thẻ trắng, `.flash-toi` cho panel tối; bản sáng kết ở nền trắng nên chạy trên panel tối là nháy NGƯỢC. Logic bật/tắt dùng chung ở `features/dashboard/useNhaySo.ts`. `animate-spin` (vòng chờ lúc đánh thức Render ở màn đăng nhập) phải khai tay: bản nở của Tailwind không tự sinh nhánh reduced-motion. `cssNen.test.ts` canh cả ba |
| MỘT bộ chọn kỳ, ở sidebar | `components/Sidebar.tsx` | Hai bộ điều khiển cùng một `?period=` trên cùng màn hình buộc người dùng phải chọn xem nên bấm cái nào. Bộ chọn duy nhất này cũng là nơi giữ BIÊN của dải kỳ (P2, Ruling 424): không khoá hai đầu thì một cú bấm `›` ở kỳ cuối dải đẩy người trình bày sang kỳ không tồn tại. Màn "kỳ chưa có trong hệ thống" của Dashboard là lưới đỡ SAU khi đã rơi, không thay được cái khoá |
| `Tabs` của form nhập phải CÓ ĐIỀU KHIỂN (`value` + `onValueChange`) | `features/report/ReportForm.tsx` | Radix gỡ nội dung tab không hoạt động khỏi DOM. Mọi neo trỏ vào một ô của bảng — tám mã "Thiếu N ô bắt buộc" ở chân trang (`FormModeBar`) và "Tới ô đầu →" trong `NhacTruocDuyet` — phải kéo tab về `chi-tieu` TRƯỚC khi nhảy; để Radix tự giữ trạng thái thì cú bấm từ tab khác không làm gì cả và người dùng không biết vì sao. `ReportForm.test.tsx` canh bằng helper `moTabC()` (Radix đổi tab ở `mousedown`, không phải `click`) |
| MỘT phép đếm ô bắt buộc, khai ở `features/report/tienDo.ts` | `tienDo.ts` ← `TienDoNhap`, `GroupHeader`, `thieuBatBuoc` | Bốn chỗ trên cùng màn nói về cùng một tập hợp: thanh `Progress` ("51/53 ô"), chip từng nhóm, bộ đếm "· N thiếu" trên hàng tiêu đề nhóm, và câu "Thiếu N ô bắt buộc" ở chân trang. Viết bốn phép đếm riêng là cách để một hôm nào đó thanh tiến độ nói "đủ" trong khi chân trang vẫn chặn nộp |
| Tên khả truy cập của huy hiệu mã phải có dấu cách | `ReportForm.tsx` (`OChu`), `TienDoNhap.tsx` | Mã đứng thành một `<span>` riêng cạnh nhãn thì JSX nuốt xuống dòng giữa hai nút, và `textContent` dính thành "C1Hoạt động nổi bật" / "B-8Quản lý môi trường" — trình đọc màn hình đọc liền một từ. Phải chèn `{' '}` thật; dấu cách trắng giữa hai flex item không sinh ô nào nên hình không đổi một pixel |
| `staleTime` mặc định **30s** của `app/queryClient.ts` | mọi hook nhận `staleTime` tuỳ chọn | TanStack trải options lên `defaultOptions`, nên một khoá `staleTime: undefined` **ghi đè** mặc định chứ không phải "không đặt". Chỉ đưa khoá vào khi nơi gọi thật sự truyền. Mất bất biến này thì Dashboard bắn thêm một lượt `/dashboard/summary` mỗi lần mount — e2e `Q1 — duyệt xong, dashboard đổi 21→22` là nơi đã bắt được, `queryClient.test.tsx` là nơi đo nhanh |
| Số thẳng cột | `body` cũ dùng `font-feature-settings: "tnum"`; bản mới dùng `font-variant-numeric` + font mono | Bảng FM01 có 53 dòng số; lệch cột là lỗi đọc số |
| `data-cot`, `data-testid="o-ky"`, `role="status"` | các màn | e2e bám trực tiếp |
| Câu từ chối đăng nhập | `backend/app/api/auth.py` `SAI_DANG_NHAP` | Backend **cố ý** trả cùng một câu cho sai email / sai mật khẩu / tài khoản bị khoá, để không lộ tài khoản có tồn tại hay không. **Không** thêm "còn N lần thử" hay "tài khoản bị khoá" |
| `min-w-0` trên `SidebarInset` | `components/AppShell.tsx` | `SidebarInset` của shadcn là flex item `w-full flex-1`; `min-width:auto` mặc định làm nó từ chối co xuống dưới bề rộng nội dung, nên mọi khung `overflow-x-auto` bên trong KHÔNG bao giờ cuộn mà đùn cả trang rộng ra (đo ở `/reports` "Tất cả" trên 1024: `scrollWidth` 1118 / `clientWidth` 1024 — sidebar lẫn thanh đầu trang trượt khỏi màn hình). e2e `C-Lát6` canh ở cả hai khung nhìn |
| `/` là LỐI VÀO, không phải bí danh của `/login` | `app/routes.tsx` | Hai màn lỗi 403/404 đứng ngoài `AppShell` nên nút trên màn là đường đi DUY NHẤT của chúng, và nó trỏ `/`. Nếu `/` lại dẫn về form đăng nhập cho người đang có phiên thì lối thoát của một ngõ cụt là một ngõ cụt khác. Đích phải quyết SAU `RequireAuth`: một lần tải trang chỉ khôi phục `token`, `permissions` còn rỗng cho tới lượt `/auth/me` |
| Nhãn trang `/reports` | `features/reports/nhanTrang.ts` | Tên trang đổi theo QUYỀN. Mục nav Sidebar và vệt breadcrumb AppShell phải đọc cùng một hàm — viết riêng mỗi nơi một bản đã từng cho ra hai cái tên khác nhau trên cùng một màn |
| Nhãn ba mục quản trị | `features/admin/muc.ts` | Cùng lý do `nhanTrang.ts`: quyền → đường → nhãn → icon của "Mẫu báo cáo / Tổ chức / Người dùng" chỉ khai MỘT chỗ, vì Sidebar dựng mục nav và AppShell dựng breadcrumb từ đúng danh sách đó. Ba quyền ĐỘC LẬP, không gộp thành một cờ "là quản trị" |
| Màu nhấn chỉ dành cho việc NÊN LÀM | `pages/QuanTriMau.tsx`, `pages/Reports.tsx` | Nút "Mở kỳ"/"Đóng kỳ" đều là nút phẳng. Bản đầu tô "Mở kỳ" bằng nền primary và hai nút đậm nhất trang lại rơi vào 06/2026 và 07/2026 — hai kỳ lịch sử không ai cần mở. Sức nặng của thao tác nằm ở hộp thoại xác nhận, không nằm ở màu nút |
| Sàn cỡ chữ 11px | toàn bộ | Dưới mức đó không đọc được ở 1024 zoom 125% — một trong ba thiết bị đích |
| Màu của `Chip` cấp qua `className`, KHÔNG thành variant của `badge.tsx` | `components/ui/Chip.tsx` | Sáu màu trạng thái dựng trên token `--success*`/`--warning*` là phần THÊM của gói bàn giao, không thuộc bộ chuẩn shadcn — lần `shadcn add badge` sau sẽ ghi đè tệp và nuốt mất variant tự thêm. Cùng tiền lệ `NhacTruocDuyet.tsx` đã đặt với `Alert`. Áp cho mọi primitive shadcn khác |
| Mỗi chip mang ĐÚNG MỘT utility cho mỗi thuộc tính màu | `Chip.tsx` (ba bảng `KIND_TEXT`/`KIND_BG`/`KIND_BORDER` tách rời) | Hai lỗi thật đã phải trả giá: fix S1 (`border-color`) và vòng sửa 3 — P1 (`background-color`), cả hai vì hai utility cùng thuộc tính đứng cạnh nhau và CSS build ra quyết định ai thắng, bất kể thứ tự viết trong JSX. Từ lát 3 `Chip` đi qua `cn` (tailwind-merge) nên lớp bị ghi đè bị gỡ hẳn khỏi chuỗi — nhưng 24 ca ĐẾM trong `ui.test.tsx` giờ canh chính điều đó: `cn` phải còn là tailwind-merge, không được thay bằng phép nối chuỗi |
| `py-0` trên mọi hằng cỡ ô bảng | `khung.tsx` `O_BANG` · `Reports.tsx` `O_BANG` · `UnitsTable.tsx` `O_CHUNG` · `StatusGrid.tsx` `O_KY` | `TableCell` của shadcn khai `p-2` — đệm VIẾT TẮT bốn chiều. Các hằng chỉ truyền `px-3` nên 8px trên+dưới lọt vào: đo thật Reports 36→49px/dòng (+858px cho trang 66 dòng), StatusGrid 41→57px. `py-0` trông như lớp thừa, đúng hình dạng thứ bị dọn trong một lần đọc lại — `ui.test.tsx` khoá nó |
| Viền hàng bảng thuộc về DÒNG, không thuộc về Ô | năm bảng dựng trên `ui/table.tsx` | `TableRow` cấp `border-b` và `TableBody` cấp `[&_tr:last-child]:border-0`. Giữ thêm `border-b` trên `<td>` là viền đôi; đặt lại trên ô cũng làm thừa cái hack `[&_tbody_tr:last-child_td]:border-b-0` mà `UnitsTable`/`Reports` từng cần. Ca A5-h ở `Dashboard.test.tsx` canh dòng cuối không có gạch dưới |
| `role="status"` trên từng toast | `components/ui/Toast.tsx` | sonner 2.0.8 **không phát ra thuộc tính `role` nào** (đếm trên `dist`: `role` 0 lần, `aria-live` 1 lần trên `<section>` bọc ngoài) và không có prop để truyền vào. Cả e2e lẫn bốn tệp test đơn tìm toast bằng `[role="status"]` + NỘI DUNG, nên vai này là HỢP ĐỒNG chứ không phải trang trí. Gắn tay bằng `MutationObserver`, và phải gắn lên chính `<li data-sonner-toast>` — đặt lên một thẻ con hẹp hơn là tự tay biến phép giao toast↔nút thành bằng chứng rỗng |
| `zIndex: 40` của khay toast | `components/ui/sonner.tsx` | Mặc định của sonner là `999999999`, tức toast nổi TRÊN cả hộp thoại. Hộp thoại / sheet / tooltip / select / dropdown của kho đều `z-50`; 40 đặt toast ngay dưới chúng. e2e `C-T24/2b` bắn tia vào tâm toast và đòi màn chắn hộp thoại che được nó |
| Bảng của form nhập ở lại `<table>` thuần | `features/report/ReportForm.tsx` | `Table` của shadcn tự bọc một `<div overflow-x-auto>` **không nhận `className`**, nên không gắn được `max-h` vào đúng phần tử cuộn và `<thead sticky top-0>` của bảng 53 dòng sẽ chết. Đây là ngoại lệ có lý do, không phải chỗ sót |

---

## 11. Ngoài phạm vi đợt này

Đẩy sang `TODOS.md`:

1. **Bản in / PDF** — đã chốt hoãn. `Bản in FM01.dc.html` là file duy nhất của gói
   handoff không được áp vào mã. Nút *Xuất PDF* **cũng không dựng**: một nút disabled
   vĩnh viễn là lời hứa suông trên màn hình (Lát 7 đã xử đúng như vậy). Quy ước
   "disabled + tooltip" chỉ áp dụng cho lúc dựng tính năng in thật.
2. **Bản mobile / tablet.** Thiết kế chỉ cho desktop 1280+ và laptop 1024 zoom 125%.
3. **Dark mode.** `@custom-variant dark` khai sẵn nhưng không có bộ token tối.
4. **Favicon / app icon** từ logo PTSC (hiện là asset mặc định Vite, tím `#863bff`).
5. **Chế độ trình bày** cho dashboard khi họp. Mockup có vẽ nút trên header nhưng
   Lát 4 **không dựng** — màn đứng sau nút chưa được thiết kế.

---

## 12. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| **Khối lượng so với mốc demo** | **Đã qua** | 12 màn + 2 endpoint + viết lại test đã xong cả chín lát. Thứ tự lát được xếp để dừng ở bất cứ lát nào vẫn ship được; không phải dùng tới |
| Font Exo 2 + Geist Mono qua Google Fonts CDN | **Đã qua** | Lát 0 tự host bằng `@fontsource-variable/exo-2` và `@fontsource-variable/geist-mono`, nạp trong `src/main.tsx` và đóng gói cùng bundle — mạng nội bộ PTSC chặn CDN cũng không ảnh hưởng. `src/app/cssNen.test.ts` canh đúng hai dòng import đó |
| `--chart-1..5` không khai trong token handoff | Thấp | 12 màn không dùng biểu đồ |
| `node_modules` của repo hiện dư các package shadcn từ phép thử | Thấp | `package.json` đã hoàn nguyên; `npm ci` dọn sạch. Lát 0 cài lại đúng bộ này |

---

## 13. Nguồn đối chiếu

- Gói handoff: `~/Downloads/design_handoff_hsseq_redesign/`
- `index.css` do shadcn v4.21 sinh ra (để hợp nhất):
  `<scratchpad>/index.css.shadcn-v4.21-sinh-ra.reference`
- Kế hoạch MVP đã chốt: `docs/superpowers/plans/2026-09-09-hseq-mvp-fm01.md`
- Thiết kế MVP đã duyệt: `docs/designs/hseq-platform-mvp-fm01.md`
