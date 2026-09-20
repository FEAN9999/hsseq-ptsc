# Sổ quyết định — đợt redesign shadcn (Lát 0 → lát sonner)

> **Đây là BIÊN BẢN của một đợt làm đã đóng, không phải luật đang hiệu lực.**
>
> Tệp này sinh ra làm sổ ghi (ledger) của quy trình subagent-driven development, sống trong
> `.superpowers/` — một thư mục bị `.gitignore` bỏ qua. Nó được chuyển vào `docs/` vì phần giá
> trị nhất của cả đợt nằm ở đây: **131 phán quyết** kèm lý do và cái giá phải trả nếu sai (đánh
> số tới 141, mười số đầu bị nhảy cóc). Mã
> nguồn nói *cái gì*; tệp này nói *vì sao*.
>
> **Cách đọc:**
> - Mục **Rulings** và các mục **LÁT …** là phần đáng đọc — mỗi phán quyết có dạng
>   "quyết định — vì sao — sai thì trả giá gì".
> - Mục **Quét xung đột (preflight)** và các mục **Review …** là sổ sách vận hành của quy trình,
>   giữ lại cho đủ mạch chứ ít giá trị tra cứu.
> - Các dòng **Tự kiểm** là BẰNG CHỨNG đo được tại thời điểm đó (số ca test, e2e, đột biến thử),
>   không phải trạng thái hôm nay.
>
> **Ràng buộc chép trong tệp** ("tuyệt đối không commit", "làm thẳng trên `master`") là điều kiện
> vận hành CỦA ĐỢT LÀM ĐÓ, do chủ dự án đặt lúc bấy giờ — **không phải quy tắc của kho**. Đợt làm
> đã kết thúc bằng một commit lên `main`. Bất biến nào còn hiệu lực thì nằm ở §10 của
> `docs/superpowers/specs/2026-09-16-hsseq-redesign-shadcn-design.md`, không phải ở đây.

---

# SDD ledger — plan: docs/superpowers/plans/2026-09-16-hsseq-redesign-lat-0-nen.md

Spec: docs/superpowers/specs/2026-09-16-hsseq-redesign-shadcn-design.md

## Ràng buộc do chủ dự án đặt (đè lên khuôn mẫu skill)

- **TUYỆT ĐỐI KHÔNG COMMIT.** Không `git add`/`git commit`/`git mv`/`git stash`. Thay cho commit:
  ảnh chụp cây ở `snap/<nhãn>/` (`snap.sh`), diff review ở `review/` (`diff.sh`).
- **Làm thẳng trên `master`**, có đồng ý tường minh. Không nhánh, không merge, không push, không PR.
- Docs bị nói ngược thì **sửa thẳng cho đúng hiện trạng** (Task 13), không chèn khối "đã thay thế".

## Quét xung đột trước khi chạy (preflight)

### Cặp task dùng chung file hoặc giao diện

| Cặp | Produces → Consumes | Kết quả |
|---|---|---|
| T1 → T5 | alias `@/*` → shadcn CLI đòi alias | khớp |
| T2 → T5 | `casingScan` → T5 Step 3 dùng làm chốt chặn | khớp |
| T3 → T5 | `Dialog.tsx` đổi tên → `shadcn add dialog` | khớp, thứ tự đúng |
| T4 → T5 | `Skeleton.tsx` đổi tên → `shadcn add skeleton` | khớp, thứ tự đúng |
| T5 → T6 | `index.css` CLI hợp nhất → T6 hoàn thiện | khớp |
| T3 → T6 | `DialogXacNhan.tsx` → T6 sửa `text-sec` trong nó | khớp (T6 dùng đúng tên mới) |
| T6 → T8..T11 | token mới + 3 khoá config đã xoá → phép đổi class | khớp |
| **T6 → T12** | `cssNen.test.ts` đọc `tailwind.config.ts` → T12 **xoá** file đó | **XUNG ĐỘT** — xem Ruling 1 |
| T4 → T8 | `SkeletonDong.tsx` có `from-mutedbg via-hair to-mutedbg` → regex T8 có `from\|via\|to` | khớp |
| T12 → T13 | trạng thái token cuối → sửa docs | khớp |
| T7 | độc lập, không giao với task nào | — |

### Từng task tự nhất quán?

| Task | Tests ↔ code ↔ Files | Kết quả |
|---|---|---|
| T1 | test đọc `tsconfig*.json` + import `@/lib/format`; Files khai đúng 3 file cấu hình | khớp (`formatPeriod` đã kiểm thật) |
| T2 | 7 ca hàm thuần + hằng phạm vi + cây thật; Files khai 2 file | khớp |
| T3 | thuần đổi tên, test cũ phải xanh nguyên | khớp |
| T4 | thuần đổi tên, 4 trang tiêu thụ | khớp |
| T5 | không test riêng; chốt chặn mượn T2 | khớp — task duy nhất kết thúc khi `npm test` chưa xanh, plan nói rõ lý do |
| T6 | 16 ca + 3 ca config; Files liệt 19 file sản phẩm + 3 file test | khớp — đã đối chiếu với số đo thật (43 lượt sản phẩm / 17 lượt test) |
| T7 | 4 ca tồn tại file | khớp |
| **T8..T11** | regex Step 1 của T9/T10/T11 thiếu `from\|via\|to` (T8 có) | **LỆCH** — xem Ruling 2 |
| T12 | chứng minh sạch + xoá config + e2e | khớp |
| T13 | sửa 3 docs, có bước chứng minh | khớp |

## Rulings

- **Ruling 1 (T6 → T12):** `cssNen.test.ts` của T6 gọi `readFileSync(tailwind.config.ts)` ngay trong
  thân `describe`, nên khi T12 xoá file đó, test sẽ ném ENOENT lúc thu thập ca — trước cả khi chạy.
  T12 Step 2 đã bảo **thay cả khối `describe`**, mà `CONFIG` nằm trong khối đó, nên phép thay giải
  quyết luôn. Quyết định: **giữ nguyên plan**, và mang lời nhắc này vào dispatch của T12 để người
  thực thi biết `readFileSync` phải biến mất cùng khối.
  *Sai thì trả giá gì:* `npm test` đỏ ngay ở T12 Step 4 với ENOENT — lộ ra tức thì, sửa một dòng.

- **Ruling 2 (T9/T10/T11):** regex liệt kê ở Step 1 của ba task này chỉ có `(bg|text|border|ring)`,
  thiếu `from|via|to`. Đã đo cây thật: **chỉ có đúng một** lượt gradient token cũ
  (`components/ui/Skeleton.tsx:10`), nằm trong `components/ui/` nên T8 phủ. Quyết định: **giữ nguyên
  regex**; T12 Step 1 dùng regex đầy đủ có `from|via|to` làm lưới cuối.
  *Sai thì trả giá gì:* một class gradient sót lại tới T12 và bị bắt ở đó — mất một vòng sửa nhỏ.

## Tiến độ

Base: cây sạch ở `master`, ảnh chụp `snap/task-00-base` (87 file).

Task 1: complete (snap/task-00-base → snap/task-01, review clean: spec ✅, quality Approved)
Task 1: minor (deferred): task-1-report.md ghi file test "116 lines", diff thật 32 dòng — sai số đếm trong báo cáo, nội dung file đúng 100% so với brief.
Task 1: Ruling: reviewer nêu ⚠️ reflog có `checkout -b spike/shadcn-init` lúc 19:41–19:43. Đó là phép thử shadcn do TÔI (điều phối) chạy TRƯỚC khi ràng buộc cấm commit tồn tại, có chủ dự án duyệt tường minh; nhánh tại đúng ee3a76f, không sinh commit, đã xoá. Không phải vi phạm của implementer. *Sai thì trả giá gì:* nếu thực ra có commit lạc, `git log` vẫn ở ee3a76f sẽ lộ ra ngay ở task sau.

Task 2: complete (snap/task-01 → snap/task-02, review clean: spec ✅, quality Approved)
Task 2: minor (deferred): typo comment "mảy" thay vì "mảng" trong casingScan.test.ts:32.
Task 2: minor (deferred): hai tầng sort lệch kiểu (.sort() ordinal trong nhóm, .localeCompare() giữa nhóm); nhánh giữa-nhóm chưa ca nào chạy qua. Plan-mandated, chép nguyên từ brief.
Task 2: minor (deferred): thư mục rỗng chỉ khác hoa/thường sẽ lọt rào (chỉ file mới tạo path). Không áp dụng cho ca `shadcn add`.
Task 2: minor (deferred): ca "quét đúng thư mục src" là pin-test vào chính hằng số. Có chủ đích, ghi rõ trong comment.

Task 2: Ruling 3 (từ ⚠️ của reviewer — LỖ THẬT mà preflight của tôi sót): rào chắn hoa/thường bắt được
  ca LINUX (hai file riêng) nhưng KHÔNG bắt được ca MACOS. Trên macOS, `shadcn add skeleton` ghi đè
  vào inode của `Skeleton.tsx` mà GIỮ NGUYÊN tên mục thư mục — nên `duongDanNguon()` chỉ thấy MỘT
  đường dẫn, rào chắn XANH, trong khi nội dung file đã bị phá. Chúng ta đang chạy trên macOS.
  Vì sao hôm nay vẫn an toàn: Task 3 và Task 4 đổi tên hai file đó TRƯỚC Task 5, nên không còn gì để
  ghi đè. Nhưng "chốt chặn" ở Task 5 Step 3 vì thế gần như rỗng nghĩa trên macOS.
  Quyết định: giữ nguyên rào chắn (giá trị thật của nó là trên CI và cho các lần thêm component sau),
  và BỔ SUNG vào dispatch Task 5 một phép kiểm trực tiếp: sau `shadcn add`, đối chiếu
  `SkeletonDong.tsx` và `DialogXacNhan.tsx` với ảnh chụp snap/task-04 — đổi một byte là hỏng.
  Tôi cũng tự kiểm chéo bằng diff ảnh chụp ở phía điều phối.
  *Sai thì trả giá gì:* nếu cả hai phép kiểm đều trượt, một primitive của repo bị thay bằng bản shadcn
  mà không ai thấy — nhưng `npm test` sẽ đỏ ngay vì prop `rows`/`title` biến mất (đã đo ở phép thử: 45 lỗi TS).

Task 3+4: Ruling 4 (LỖI DO PLAN CỦA TÔI, không phải lỗi implementer): khối comment mà brief Task 4
  cấp cho `SkeletonDong.tsx` chứa chuỗi `animate-pulse` theo nghĩa đen. Tailwind v4 quét CẢ comment,
  nên nó sinh CSS thật. Tôi đã tự kiểm chứng độc lập trong `frontend/dist/assets/*.css`:
    --animate-pulse:pulse 2s cubic-bezier(.4, 0, .6, 1) infinite
    .animate-pulse{animation:var(--animate-pulse)}
  Nguồn duy nhất: SkeletonDong.tsx:2 và :5. Bundle 20.78kB -> 20.92kB.
  Trớ trêu: file có nhiệm vụ KHÔNG nhấp nháy lại là file duy nhất bơm animation nhấp nháy vào bundle.
  Quyết định: viết lại hai dòng comment để bỏ token nghĩa đen, và thêm một comment ghi lại chính bài
  học đó (diễn đạt sao cho không chứa token). Ba tiêu chí nghiệm thu: grep src/ không còn dòng nào;
  npm test đúng 815 xanh; grep -c trong dist CSS = 0.
  *Sai thì trả giá gì:* nếu bỏ sót, một lớp animation chết nằm trong bundle sản phẩm và Task 12 sẽ
  không chứng minh được "CSS sạch" — mất một vòng sửa ở cuối lát, đắt hơn sửa bây giờ.

Task 3+4: Ruling 5 (RỦI RO KÉO THEO tới Task 12 — phát hiện khi truy nguyên Ruling 4): tôi đã đo
  ngay xem tên class nằm trong docs/plan có lọt vào CSS không. Kết quả ĐO: không lọt —
  bg-success-bg / text-success-foreground / rounded-4xl / bg-destructive-bg / text-warning-foreground
  đều = 0 trong dist CSS. Lý do: `tailwind.config.ts:4` vẫn khoá `content: ['./index.html','./src/**/*.{ts,tsx}']`.
  NHƯNG Task 12 XOÁ chính file đó. Mất config, Tailwind v4 chuyển sang tự dò nguồn, và vùng dò khi ấy
  là điều tôi CHƯA đo chứ không phải điều tôi biết.
  Quyết định: không đoán bây giờ, không đụng repo ngoài plan. BỔ SUNG vào dispatch Task 12 một phép đo
  bắt buộc SAU khi xoá config: build lại, rồi grep dist CSS tìm 5 token trên (chúng chỉ tồn tại trong
  docs/, không có trong src/). Nếu bất kỳ token nào > 0 thì vùng quét đã nới ra ngoài src/, và cách
  chữa là ghim tường minh bằng `@source` trong index.css thay vì giữ lại tailwind.config.ts.
  *Sai thì trả giá gì:* nếu bỏ qua phép đo này, Task 12 báo "sạch" trong khi CSS sản phẩm chứa hàng
  chục class ma sinh từ chính bảng đối chiếu trong plan — và test cascade đọc CSS thật sẽ xanh giả.

Task 3+4: Ruling 5 — ĐÍNH CHÍNH phương pháp (lỗi trong chính Ruling 5 ở trên, tôi tự bắt được):
  phép thử "5 token giấy quỳ" là phép thử YẾU. Năm token đó nằm ở `docs/` tức TRÊN `frontend/`, trong
  khi build chạy trong `frontend/`. Nếu Tailwind chỉ dò trong `frontend/` thì phép thử luôn xanh bất
  kể vùng quét có nới hay không — xanh giả, đúng thứ nó định bắt. (Tôi đã xác nhận cả 5 token có thật
  trong docs/ và bằng 0 trong src/, nên dữ liệu thì đúng, chỉ suy luận là hỏng.)
  Quyết định: thay bằng phép đo không cần biết vùng quét — chụp `dist/assets/*.css` TRƯỚC khi xoá
  config, xoá, build lại, rồi `diff` hai tập luật đã tách theo `}` và sort. Vùng quét không đổi thì
  tập luật phải y hệt; dòng `>` = rò rỉ vào, dòng `<` = mất style. Plan Task 12 Step 5 đã viết lại.
  Phương án chữa `@import "tailwindcss" source(none)` giữ nguyên — đã kiểm chứng trong tailwindcss
  4.3.3 đang cài (`dist/lib.mjs` có nhánh `if (E === "none")`), không phải phỏng đoán từ tài liệu.
  *Sai thì trả giá gì:* nếu phép so cũng hỏng, Task 12 vẫn chốt "sạch" trên một CSS bẩn — nhưng lần
  này sai sót sẽ lộ ở Lát 1 khi component shadcn đầu tiên render lệch.

Task 3+4: đã sửa xong lỗi Ruling 4 (implementer). Tôi đã đồng bộ ba nguồn cho khớp nhau: plan (vá
  tay), task-4-brief.md (sinh lại từ plan đã vá), và file thật. Trước khi đồng bộ, brief vẫn giữ
  văn bản lỗi — reviewer đối chiếu brief với file sẽ báo "lệch so với yêu cầu" mà thực ra là đúng.

Task 3+4: Ruling 6 (NỢ KỸ THUẬT TASK 1 ĐỂ LẠI, tôi phát hiện khi tự chạy lại npm test để kiểm chéo
  báo cáo implementer — không phải từ diff): build in cảnh báo
    (!) Your Vite config uses features that are unsupported by `configLoader: 'native'` …
        - `__dirname` (vite.config.ts:9:41). Use `import.meta.dirname` instead
  Đối chiếu snap/task-00-base: vite.config.ts TRƯỚC Task 1 không hề có `__dirname`. Task 1 đưa nó vào,
  và văn bản gây ra nó là của PLAN TÔI VIẾT. Task 1 đã qua cửa review "clean" vì reviewer đọc diff chứ
  không đọc output test — cảnh báo không làm đỏ test nên không cửa nào bắt.
  Đã kiểm trước khi kê đơn: Node v24.14; @types/node@24.13.4 khai `interface ImportMeta { dirname }`
  (module.d.ts:575); tsconfig.node.json để module "nodenext" + types ["node"] — nên import.meta.dirname
  typecheck được. Không phỏng đoán.
  Quyết định: KHÔNG mở vòng sửa riêng cho Task 1 (một dòng, không đáng một lượt dispatch). Gộp thành
  Task 5 Step 0 — Task 5 vốn đã đụng tầng cấu hình, và `shadcn init -t vite` có thể tự sửa
  vite.config.ts nên gộp vào đó thì một người kiểm được cả hai. Đã thêm vite.config.ts vào mục Files
  của Task 5. Plan Task 1 cũng đã vá để không tái sinh lỗi nếu ai chạy lại.
  Và sửa cái GỐC chứ không chỉ cái ca: thêm ràng buộc toàn cục "output npm test phải SẠCH, không chỉ
  xanh — so với output task trước, không so với cảm giác". Brief Task 5 đã sinh lại để mang ràng buộc mới.
  *Sai thì trả giá gì:* nếu import.meta.dirname vẫn hỏng trong ngữ cảnh Vite config, Task 5 Step 0 đỏ
  ngay ở `tsc` và mất vài phút — đã dặn implementer dừng lại báo chứ đừng lùi về __dirname.

Task 3+4: tôi tự chạy `npm test` độc lập: 26 file, 815/815 xanh, exit 0. Khớp báo cáo implementer.
Task 3+4: tôi tự kiểm 3 tiêu chí nghiệm thu: grep src/ = 0 dòng; dist/assets/index-DAAbh1xj.css =
  20784 byte (đúng baseline); grep -c animate-pulse trong CSS = 0. Khớp.
Task 3+4: tôi tự kiểm 9 dòng đổi ở 7 file mở rộng — tất cả nằm trong comment hoặc chuỗi mô tả `it(...)`,
  không chạm mã thi hành, không chạm chuỗi mà test dùng để tìm phần tử. Đã giao reviewer kiểm chéo lại.
Task 3+4: ảnh chụp snap/task-03-04 (90 file), gói review review/task-03-04.diff (1642 dòng, 18 file).
  Đã dispatch task reviewer (sonnet). ĐANG CHỜ.

Task 3: complete (snap/task-02 → snap/task-03-04, review clean: spec ✅, quality Approved)
Task 4: complete (cùng lượt dispatch với Task 3 — hai phép đổi tên cùng hình dạng, gộp một lô)
Task 3+4: reviewer tự kiểm độc lập 4 phép grep/find (không còn file đụng hoa/thường tên cũ; không còn
  import trỏ tên cũ; không còn JSX gọi tên cũ; không còn animate-pulse) và tự đọc từng hunk của 9 dòng
  ở 7 file mở rộng — xác nhận toàn bộ nằm trong comment hoặc nhãn `it(...)`, không dòng nào đổi bên
  trong expect/getByRole/getByText/querySelector. Khớp kết luận của tôi.
Task 3+4: minor (deferred): brief Task 3 tự mâu thuẫn — mục "Files" chỉ nêu ReportForm.tsx, nhưng
  Step 3 bảo sửa "mọi file tìm được ở Step 1" mà grep theo substring nên bắt cả comment ở cascade.ts,
  nut.ts. Lỗi của PLAN TÔI VIẾT, không phải của implementer (implementer theo đúng câu chữ Step 3 và
  khai rõ lựa chọn ở mục 4.1 báo cáo). Cùng cái bẫy này nằm sẵn trong Task 8–11 — xem Ruling 7.

Ruling 7 (nâng cái Minor của reviewer Task 3+4 thành phép đo, vì cùng cái bẫy nằm sẵn ở Task 8–11):
  reviewer nêu brief Task 3 tự mâu thuẫn giữa mục "Files" (danh sách cứng) và Step 3 (grep). Tôi không
  parked nó, mà đi đo xem Task 9/10/11 có dính cùng bệnh không — chạy chính regex của Task 12 Step 1
  lên từng thư mục và so với danh sách trong plan.
  Kết quả: Task 9 khớp chính xác (AppShell.tsx, AppShell.test.tsx, Sidebar.tsx, app/router.tsx).
  Task 11 khớp chính xác (7 trang + 2 file test). Task 10 SAI: plan liệt kê
  `features/dashboard/KpiTile.tsx` nhưng file đó không có MỘT className nào — đã đọc cả 51 dòng, nó
  uỷ toàn bộ trình bày cho `components/ui/Tile.tsx` (địa phận Task 8) và chỉ giữ logic flash/danger.
  Quyết định: gỡ KpiTile khỏi Files của Task 10, ghi rõ "KHÔNG đụng" kèm lý do; và thêm vào cả ba
  task câu "danh sách trên là kết quả đã ĐO... nếu Step 1 ra tập khác thì grep thắng".
  *Sai thì trả giá gì:* nếu để nguyên, reviewer Task 10 báo "file được liệt kê mà diff không đụng =
  Thiếu" — một phát hiện giả tốn trọn một vòng sửa, hoặc tệ hơn: implementer cố sửa KpiTile cho khớp
  danh sách và bịa ra thay đổi không ai cần.

Task 5: Ruling 8 (implementer báo là "bom hẹn giờ"; tôi kiểm và thấy NÓ ĐÃ NỔ ở mức index —
  CẦN CHỦ DỰ ÁN RA TAY, tôi không tự sửa được vì mọi cách sửa đều ghi vào git index, đang bị cấm):
  `core.ignorecase=true`. Task 3/4 đổi tên bằng `mv` thường nên git index vẫn giữ path cũ
  `Dialog.tsx` / `Skeleton.tsx` / `Dialog.test.tsx`. Task 5 sinh `dialog.tsx` / `skeleton.tsx` chữ
  thường. Git gộp hoa-thường và HIỆN ĐANG BÁO:
      M frontend/src/components/ui/Dialog.tsx
      M frontend/src/components/ui/Skeleton.tsx
  trong khi trên đĩa hai file đó KHÔNG CÒN TỒN TẠI. Tôi đã mở `git diff -- .../Skeleton.tsx`: nội dung
  mà git tưởng là "bản sửa" chính là Skeleton của shadcn (`import { cn } from "cn"`,
  `className={cn("animate-pulse rounded-md bg-muted", className)}`).
  Hệ quả nếu ai đó `git add -A`: lịch sử ghi Skeleton của shadcn DƯỚI TÊN HOA `Skeleton.tsx`, và
  repo sẽ KHÔNG có `skeleton.tsx`. Trên macOS vẫn chạy; trên Linux/CI thì `import { Skeleton } from
  "@/components/ui/skeleton"` trong `sidebar.tsx` không giải được -> vỡ build. Kèm thêm cái mỉa mai:
  `animate-pulse` quay lại repo qua ngả đó, đúng thứ vừa tốn một vòng sửa để gỡ.
  Cây làm việc thì SẠCH — đã kiểm bằng diff/md5/inode, ba file đổi tên không bị chạm một byte.
  Quyết định: KHÔNG tự chữa (mọi cách đều là lệnh ghi index). Ghi thành việc bắt buộc của chủ dự án
  TRƯỚC KHI commit Task 5, kèm lệnh chính xác. Đây là một trong bốn thứ được phép dừng lại mà hỏi.
  *Sai thì trả giá gì:* nếu bỏ qua, một commit `git add -A` ngây thơ làm đỏ CI theo kiểu "chạy trên
  máy tôi mà" — loại lỗi tốn nhiều giờ nhất để truy.

Task 5: Ruling 9 (LỖI PRODUCTION THẬT, implementer nêu đúng và đúng mực khi không tự sửa):
  `shadcn init` viết `@import "@fontsource-variable/geist";` vào index.css. Tôi đã đo độc lập:
  `dist/` có ĐÚNG 4 file (1 html, 1 js, 1 css, 1 svg) — KHÔNG một `.woff2` nào; mà `dist/assets/*.css`
  vẫn chứa `@font-face` trỏ `url(./files/geist-*.woff2)`, năm URL. Tức production gọi năm URL đó,
  nhận 404, rồi lặng lẽ rơi về font hệ thống. Không lỗi build, không lỗi console, test vẫn 815 xanh.
  Nguyên nhân: Tailwind v4 nội tuyến `@import` của CSS TRƯỚC khi đường ống asset của Vite kịp rebase
  `url()`, nên Vite không biết có font cần phát ra.
  Quyết định: đây là việc của Task 6 (brief Task 5 nói rõ hai lần index.css thuộc Task 6, implementer
  giữ đúng ranh giới — ghi nhận). Đã chèn Task 6 Step 3b: xoá dòng @import khỏi index.css, thêm
  `import '@fontsource-variable/geist'` vào main.tsx NGAY TRÊN `import './index.css'`, nghiệm thu bằng
  `find dist -name "*.woff2" | wc -l` khác 0 và url() trong CSS trỏ vào file có thật.
  Kèm theo: ràng buộc toàn cục "index.css phải có đủ BỐN @import" là SAI — đã sửa thành BA, và ghi
  nhận đây là chỗ lạc hậu THỨ SÁU của README gói thiết kế (spec mới liệt kê năm chỗ).
  *Sai thì trả giá gì:* nếu bỏ qua, demo ~30/09 chạy bằng font hệ thống thay vì Geist — toàn bộ nhịp
  chữ của bản thiết kế sai lệch mà không ai hiểu vì sao, vì không có lỗi nào hiện ra.

Task 5: ảnh chụp snap/task-05 (114 file, +24 file mới), gói review review/task-05.diff (2830 dòng).

Task 5: Ruling 8 — ĐÃ XÁC MINH LỆNH CHỮA (không phải phương án nghe có vẻ đúng; đã chạy thật trên
  một index TẠM qua GIT_INDEX_FILE, `git add --dry-run` nên không ghi object, index thật không đụng —
  đã đối chiếu `git status` trước/sau, giống hệt).
  A. HIỆN TRẠNG, `git add -A` sẽ làm:
       add 'frontend/src/components/ui/Dialog.tsx'      <- nội dung dialog.tsx của shadcn
       add 'frontend/src/components/ui/Skeleton.tsx'    <- nội dung skeleton.tsx của shadcn
     và `dialog.tsx` / `skeleton.tsx` KHÔNG hề xuất hiện trong danh sách add. Repo sẽ không có file
     chữ thường nào -> `sidebar.tsx` gọi "@/components/ui/skeleton" vỡ trên Linux/CI. Đúng như dự đoán.
  B. SAU khi gỡ ba mục cũ khỏi index, `git add -A` làm đúng:
       add 'frontend/src/components/ui/dialog.tsx'
       add 'frontend/src/components/ui/skeleton.tsx'
       add 'frontend/src/components/ui/DialogXacNhan.tsx' (+ .test.tsx, + SkeletonDong.tsx)
  LỆNH CHO CHỦ DỰ ÁN, chạy TRƯỚC khi commit Task 5:
       git rm --cached --ignore-unmatch \
         frontend/src/components/ui/Dialog.tsx \
         frontend/src/components/ui/Dialog.test.tsx \
         frontend/src/components/ui/Skeleton.tsx
       git add -A frontend/src
       git ls-files frontend/src/components/ui/ | grep -iE 'dialog|skeleton'
  Dòng cuối phải in ĐÚNG năm path: DialogXacNhan.test.tsx, DialogXacNhan.tsx, SkeletonDong.tsx,
  dialog.tsx, skeleton.tsx.

Task 5: complete (snap/task-03-04 → snap/task-05, review clean: spec ✅, quality Approved)
Task 5: reviewer tự kiểm độc lập vượt cả phạm vi report: đủ 21 component + sheet.tsx + use-mobile.ts;
  `find|tolower|uniq -d` trên toàn cây src = rỗng (không cặp hoa/thường nào); 5 file cấu hình
  (tsconfig x3, index.html, tailwind.config.ts) diff 0 khác biệt so ảnh chụp trước — CLI không tự ý
  sửa gì; không baseUrl ở đâu; ba bất biến còn nguyên (đọc full index.css); 4 file Task 3/4 + Toast.tsx
  diff im lặng; sàn 11px giữ; mã sinh không bị sửa tay (grep tiếng Việt có dấu + TODO/console/debugger).
  Còn tự kiểm CHUỖI CUNG ỨNG gói `cn` trên npm registry (repository shadcn-ui/cn, maintainer shadcn)
  để loại khả năng typosquat — việc tôi không nghĩ tới khi soạn dispatch.
Task 5: minor (deferred): index.css thiếu newline cuối file (CLI ghi, cosmetic).
Task 5: minor (deferred): 3/21 file shadcn (empty, skeleton, sonner) dùng React.ComponentProps mà
  không import React tường minh — quy ước gốc của registry, tsc build qua nhờ global namespace UMD.

Ruling 10 (LỖI TRONG CƠ CHẾ REVIEW CỦA TÔI, reviewer Task 5 chỉ ra ở mức Minor): snap.sh không chụp
  `package-lock.json`, nên nó vắng mặt ở CẢ HAI phía mọi ảnh chụp — reviewer phải vòng qua repo sống
  để đối chiếu. Đúng ở task cài đặt thì lockfile là thứ đáng soi nhất (6047 dòng đổi).
  Quyết định: sửa snap.sh thêm package-lock.json, và BÙ NGƯỢC vào hai ảnh chụp đã có —
  task-03-04 lấy từ `git show HEAD:frontend/package-lock.json` (hợp lệ vì Task 1–4 không đụng
  dependency nào), task-05 lấy bản hiện tại. Nhờ vậy diff Task 6 sắp tới không bị nhiễu bởi một
  lockfile 6000 dòng "xuất hiện từ hư không".
  *Sai thì trả giá gì:* nếu bản HEAD không thật sự khớp trạng thái trước Task 5, diff Task 6 sẽ hiện
  một ít nhiễu lockfile — thấy ngay và sửa được, không ảnh hưởng mã.

Task 6: Ruling 11 (LỖI TRONG CƠ CHẾ BRIEF CỦA TÔI — hệ thống, còn ảnh hưởng Task 9/10/11):
  "## Bảng đối chiếu token" là mục CẤP CAO NHẤT ở dòng 61 của plan — tôi cố ý đặt đó khi tự review
  để tránh tham chiếu chéo giữa các task. Nhưng `scripts/task-brief` chỉ trích phần `### Task N`,
  nên bảng KHÔNG BAO GIỜ đi kèm brief. Mọi brief nói "Xem Bảng đối chiếu token, mục A/B/C" đều trỏ
  vào hư không: Task 6 (2 chỗ), Task 9, 10, 11 (4 chỗ).
  Implementer Task 6 phải tự đi tìm một bảng THAY THẾ trong README gói thiết kế. Tôi đã kiểm kết quả
  thực tế thay vì tin lời: đếm chính xác (loại nhiễu tiền tố — `\btext-sec\b` khớp cả
  `text-secondary-foreground`, `\btext-warning\b` khớp cả `text-warning-foreground`; phép đếm đầu của
  tôi sai vì lý do này):
    text-warning bare = 0, text-warning-foreground = 14  -> đúng bảng A ("luôn luôn")
    text-success bare = 0, text-success-foreground = 3   -> đúng bảng A
    text-sec bare = 4: 3 trong comment + 1 lượt THẬT ở features/report/GroupHeader.tsx:30
    border-warning = 2, cả hai trong cascade.test.ts (ca miễn trừ có chủ đích)
  Lượt text-sec giữ lại ở GroupHeader: cha là `<td className="... bg-mutedbg ...">` — đúng điều kiện
  "giữ tên khi trên nền --muted" của bảng A. Phán đoán của implementer ĐÚNG.
  Quyết định: kết quả đúng nên KHÔNG mở vòng sửa vì chuyện bảng. Nhưng phải sửa cơ chế trước Task 9:
  nối bảng vào brief sau khi sinh. *Sai thì trả giá gì:* nếu không sửa, ba task đổi class cơ học tiếp
  theo mỗi task lại tự bịa một bảng — và ở đó không có Step 4 nào chép sẵn quy tắc như Task 6 may mắn có.

Task 6: Ruling 12 (TÔI SAI — đính chính Ruling 9 của chính mình): tôi chẩn đoán đúng cơ chế (Tailwind
  nội tuyến @import trước khi Vite rebase url()) nhưng KHÔNG BAO GIỜ HỎI font đó có ai dùng không.
  Đo bây giờ: `grep -rn "Geist Variable" src/` = KHÔNG CÓ GÌ. Thiết kế dùng 'Exo 2' (sans) và
  'Geist Mono' (mono); `@fontsource-variable/geist` là Geist SANS — không phải Mono. Nên Step 3b đã
  đóng gói thành công 5 file woff2 mà không thứ gì tham chiếu: đổi 5 URL chết lấy 5 file chết.
  *Sai thì trả giá gì:* đã trả rồi — một bước thừa trong Task 6 và ~100kB font vô dụng trong bundle.

Task 6: Ruling 13 (LỖI THẬT, implementer phát hiện, tôi xác nhận bằng CSS đã build): chữ thân trang
  VẪN LÀ INTER, không phải Exo 2. Nguyên nhân đo được trong dist/assets/*.css:
    body{color:#0c0a09;font-feature-settings:"tnum";background:#fafaf9;margin:0;
         font:14px/1.45 Inter,system-ui,sans-serif}      <- KHÔNG nằm trong @layer
  Quy tắc cascade layers: style ngoài layer luôn thắng style trong layer. `@layer base` chỉ đặt
  `html { @apply font-sans }` (Exo 2) và `body { bg-background text-foreground }`. Shorthand `font:`
  của body ngoài layer đè family thừa kế -> toàn bộ app render bằng Inter.
  Nghĩa là: toàn bộ nhịp chữ của bản thiết kế CHƯA HỀ được áp dụng, mà không test nào đỏ.
  Đây đúng là việc của Task 6 ("hợp nhất index.css") — file hợp nhất tự mâu thuẫn: khai
  `--font-sans: 'Exo 2'` rồi đè cứng body về Inter. Văn bản gây ra nó là Step 3 trong PLAN TÔI VIẾT.
  Quyết định: mở vòng sửa 1 cho Task 6.

Task 6: minor (deferred): Chip.tsx kind `missing` — quy tắc cơ học cho `text-muted-foreground`, comment
  ý định gốc ghi "chưa nộp → chữ sec". Implementer theo quy tắc cơ học, đúng chỉ dẫn. Chấp nhận:
  Chip sẽ bị thay bằng Badge ở lát sau.

Task 6 vòng sửa 1: DONE. Tôi tự kiểm độc lập cả 5 tiêu chí, không tin lời:
  1. `grep -c fonts.googleapis dist/assets/*.css` = 0.
  2. body trong CSS build: `body{color:#0c0a09;font-feature-settings:"tnum";background:#fafaf9;
     margin:0;font-size:14px;line-height:1.45}` — KHÔNG còn family, nên thừa kế từ html.
  3. 11 file woff2 (5 exo-2 + 6 geist-mono), CÓ subset vietnamese cho CẢ HAI —
     exo-2-vietnamese-wght-normal-*.woff2 và geist-mono-vietnamese-wght-normal-*.woff2.
  4. Tên khớp: @font-face khai "Exo 2 Variable" / "Geist Mono Variable", token khai đúng hai tên đó.
  5. package.json chỉ còn exo-2 + geist-mono; geist (Sans) đã gỡ. main.tsx nạp cả hai TRƯỚC ./index.css.
  Và tôi kiểm thêm một bước không ai yêu cầu, vì đây đúng là chỗ đã âm thầm hỏng HAI lần: luật nào
  thắng cho `html`. Ba luật, theo thứ tự trong file build — luật cuối là
  `html{font-family:"Exo 2 Variable",system-ui,sans-serif}`; và luật preflight của Tailwind giải
  `var(--default-font-family, ...)` mà biến đó cũng = "Exo 2 Variable". Cả hai đường đều về Exo 2.
  Nhịp chữ của bản thiết kế giờ mới thật sự được áp dụng.

Task 6 vòng sửa 1: implementer BẮT THÊM một lỗi không ai nêu, kể cả tôi: hai gói @fontsource-variable
  khai family kèm hậu tố " Variable" ('Exo 2 Variable', 'Geist Mono Variable') — khác tên trần mà CDN
  dùng và brief gốc đặt cho --font-sans/--font-mono. Không sửa thì tái diễn đúng lỗi "tải đủ font
  nhưng không khớp tên, âm thầm rơi về hệ thống" — tức là đổi một lỗi im lặng lấy một lỗi im lặng khác.
  Đã sửa token cho khớp. Ghi nhận: đây là lần thứ hai implementer này bắt lỗi mà phía tôi bỏ sót.

Task 6: ảnh chụp snap/task-06, gói review review/task-06.diff.

Task 6: Ruling 14 (reviewer trả lời ĐÚNG câu hỏi trọng tâm tôi giao — "còn luật nào ngoài @layer đang
  lặng lẽ đè token không" — và câu trả lời là CÓ, ngay trong chính khối vừa sửa):
  `index.css:73-80`, khối `body {}` trần còn `background: #fafaf9` và `color: #0c0a09`, vẫn đè
  `@layer base { body { @apply bg-background text-foreground } }`.
  Tôi tự kiểm hai điều. MỘT: reviewer nói "hiện vô hại vì trùng giá trị" — tôi tự tính oklch→sRGB
  bằng ma trận OKLab, `oklch(0.985 0.001 106.423)` = #fafaf9 và `oklch(0.147 0.004 49.25)` = #0c0a09,
  khớp từng bit. Đúng là trùng hợp giá trị, không phải cơ chế đúng.
  HAI — nặng hơn reviewer nói: reviewer bảo "task sau làm dark mode sẽ không có tác dụng". Nhưng
  `index.css:145` ĐÃ CÓ SẴN `.dark { --background: oklch(0.145 0 0); --foreground: oklch(0.985 0 0) }`
  do shadcn CLI sinh, và dòng 5 có `@custom-variant dark (&:is(.dark *))`. Token không phải "sẽ chết"
  mà ĐÃ CHẾT cho <body> ngay bây giờ. Chỉ chưa có mã nào bật `.dark` nên lỗi ngủ trên HAI lớp may mắn
  cùng lúc: giá trị trùng, và dark mode chưa đấu dây.
  Quyết định: vòng sửa 2 — xoá hai dòng, khoá bằng test, và thêm phép kiểm đọc CSS ĐÃ BUILD (điểm mù
  reviewer chỉ ra: cssNen.test.ts chỉ đọc văn bản nguồn nên không bắt được ca "config JS thắng CSS
  @theme"). *Sai thì trả giá gì:* ngày ai đó bật dark mode hoặc chỉnh sắc nền, không gì xảy ra và
  không ai biết tại sao.

Ruling 15 (BÀI HỌC HỆ THỐNG, không phải một ca): cùng một hình dạng lỗi đã cắn BA lần trong lát này —
  comment sinh CSS (Ruling 4), `font:` đè `--font-sans` (Ruling 13), `background`/`color` đè
  `--background`/`--foreground` (Ruling 14). Điểm chung: CSS/Tailwind hỏng ÂM THẦM — không lỗi build,
  không lỗi console, test vẫn xanh. Rào chắn kiểu "chạy test rồi xem đỏ không" mù hoàn toàn với lớp lỗi này.
  Quyết định: thêm ràng buộc toàn cục — "CSS ngoài @layer luôn thắng CSS trong @layer; trước khi đóng
  bất kỳ task nào đụng index.css, liệt kê mọi thuộc tính trong khối trần và hỏi có token nào khai cùng
  thứ đó trong @layer không". Ràng buộc này đi theo mọi dispatch còn lại.

Task 6: minor (deferred): `tailwind.config.ts:24` còn `fontFamily: { sans: ['Inter', ...] }` — bản sao
  chết của --font-sans. Reviewer đã kiểm: CSS @theme thắng, 0 chữ "Inter" trong bundle. Task 12 xoá cả file.
Task 6: minor (đã gộp vào vòng sửa 2): cssNen.test.ts:53 khoá import font chỉ theo nháy đơn.

Task 6 vòng sửa 2: DONE. Tự kiểm: khối body trần giờ chỉ còn margin/font-size/line-height/
  font-feature-settings — không thuộc tính nào đè token. CSS build có hai khối tách biệt:
  `body{background-color:var(--background);color:var(--foreground)}` (từ layer) và
  `body{font-feature-settings:"tnum";margin:0;font-size:14px;line-height:1.45}` (trần, vô hại).
  `grep -c Inter dist/assets/*.css` = 0. Không tiến trình `vite preview` nào chạy lạc.
  Implementer đi xa hơn yêu cầu: dựng `vite preview` đo bằng TRÌNH DUYỆT THẬT (getComputedStyle +
  canvas quy đổi sRGB) ra rgb(250,250,249)/rgb(12,10,9) — khớp bit-for-bit; và bật thử `.dark` ở
  runtime, giờ đổi màu đúng thành #0a0a0a/#fafafa, trước khi sửa thì không. Tức nó chứng minh được
  lỗi ngủ yên ĐÃ HẾT, chứ không chỉ chứng minh mã đã đổi. Nó cũng tự đính chính một con số đếm sai
  trong ghi chú của chính nó (27 → 24 test), không ai hỏi.

Ruling 16 (tôi TỰ ÁP ràng buộc @layer vừa viết ở Ruling 15, quét mọi khối trần chứ không chỉ body —
  và tìm được một ca nữa, nhưng quyết định KHÔNG sửa):
  Bốn khối trần còn lại: `.tnum`, `@media (prefers-reduced-motion) { .flash }`, `.flash`, và
  `@keyframes flash-bg { from { background: #c1e1f7 } to { background: #fff } }`.
  Ba khối đầu không đè token nào. Khối `@keyframes` ghim cứng `#fff` ở đích. Ở chế độ sáng
  `--card: oklch(1 0 0)` = trắng tinh nên KHỚP. Ở chế độ tối `--card: oklch(0.205 0 0)` ≈ #343434 —
  flash sẽ kết ở trắng trên nền tối, tức nhấp nháy ngược.
  Quyết định: KHÔNG sửa trong Lát 0. Lý do: `.flash` + nhánh prefers-reduced-motion là BẤT BIẾN đã
  tuyên bố ("chuyển động DUY NHẤT của app"), khối này có từ trước đợt redesign, và dark mode chưa
  đấu dây. Sửa bây giờ là mở rộng phạm vi vào một bất biến vì một tính năng đang ngủ. Ghi lại cho ai
  làm dark mode: đổi `#fff` thành `var(--card)` là đủ.
  *Sai thì trả giá gì:* nếu dark mode được bật trước khi ai đọc dòng này, KPI tile sẽ chớp trắng trên
  nền tối — khó chịu nhưng thấy ngay bằng mắt, không phải lỗi im lặng.

Task 6: complete (snap/task-05 → snap/task-06-fix2; 2 vòng sửa; re-review: "Phát hiện đã được xử lý: Có")
Task 6: re-review tự CHẠY regex với các cách viết biến thể thay vì chỉ đọc mã — dựng bảng thử
  `background:#fafaf9` không dấu cách / `rgb(250 250 249)` / `background-color:` / `Background:` /
  `@apply bg-stone-50`. Kết luận: test mới khoá theo TÊN THUỘC TÍNH nên bắt mọi biến thể giá trị
  (đúng thứ reviewer trước lo), nhưng lọt hai đường: `@apply` (đáng kể) và hoa/thường (lý thuyết).

Ruling 17: lỗ `@apply` là lỗ ở LƯỚI BẢO VỆ, không phải lỗi sống — không có mã nào đang dùng đường đó.
  Quyết định: KHÔNG mở vòng sửa 3. Gộp vào Task 12 Step 2, nơi `cssNen.test.ts` vốn đã bị sửa — tốn 0
  lượt dispatch thêm. Đã vá thẳng vào plan chứ không chỉ ghi ledger, để nó đi theo brief Task 12 và
  không phụ thuộc vào việc tôi có nhớ hay không.
  *Sai thì trả giá gì:* trong khoảng từ giờ tới Task 12, nếu ai chèn `@apply` vào khối body trần thì
  không test nào bắt. Không ai đang làm việc đó, và Task 12 là task đụng index.css tiếp theo.
Task 6: minor (deferred): tên lớp Tailwind sống (`bg-background`, `text-foreground`, `font-sans`) được
  trích nghĩa đen trong comment/tiêu đề test mới. Re-review đã kiểm: cả ba đã sống thật ở index.css nên
  không sinh CSS chết. Vô hại lần này; ghi lại vì là thói quen dễ tái phạm với class KHÔNG dùng ở đâu.

Task 7: implementer báo DONE, không mối lo. Tôi tự kiểm: cả bốn file khớp md5 với nguồn ở
  ~/Downloads/design_handoff_hsseq_redesign/ (không chỉ khớp byte — md5 bắt được cả ca cùng kích thước
  mà nội dung khác), điểm ảnh đúng 2553x802 / 2175x680 / 2553x555 / 2175x467, và cả bốn có mặt trong
  dist/ với tên KHÔNG băm (Vite chép nguyên public/).
  Tôi cũng tự đọc src/app/assets.test.ts trước khi giao review: 25 dòng, it.each bốn file, kiểm
  existsSync. Không phải test rỗng — nó canh đúng một lỗ thật: không import nào trỏ tới public/ nên
  thiếu file thì KHÔNG lỗi build, chỉ vỡ ảnh lúc chạy. Điểm yếu duy nhất: không bắt được file 0 byte
  hay hỏng nội dung; nhưng ghim kích thước vào test sẽ làm nó giòn khi asset được xuất lại. Existence
  là đúng tầng.

Task 7: complete (snap/task-06-fix2 → snap/task-07, review clean: spec ✅, quality Approved)
Task 7: minor (deferred): assets.test.ts chỉ kiểm existsSync — file 0 byte sẽ lọt. Reviewer đồng ý
  đây là đúng tầng của brief; ghim kích thước vào test sẽ làm nó giòn khi asset được xuất lại.

Ruling 18 (LỖ TRONG BẢNG ĐỐI CHIẾU CỦA TÔI — tìm ra khi đo trước lúc giao Task 8, chưa ai nêu):
  tôi viết bảng B theo từng cặp (tiền tố, token) cụ thể, nhưng codebase dùng nhiều tổ hợp tiền tố hơn
  bảng liệt kê. Đo toàn bộ src/ bằng regex loại nhiễu tiền tố: **22 cặp đang dùng, 294 lượt**. Bảng B
  phủ 14 cặp. THIẾU 8 cặp / 18 lượt:
    border-danger (7), bg-danger (3), bg-cyanEdge (2), bg-soot (2), text-sky (1),
    from-mutedbg (1), via-hair (1), to-mutedbg (1)
  Sáu cặp đầu suy cơ học được (giữ tiền tố, đổi token theo bảng) — đã thêm thẳng vào bảng B.
  Hai cặp còn lại KHÔNG suy được vì hệ token mới chưa có chỗ đứng, tôi phải đi đọc từng chỗ dùng:
  - `bg-soot` KHÔNG phải màu chữ mà là NỀN TỐI: lớp phủ modal (DialogXacNhan.tsx:150, `bg-soot/30`)
    và nền toast (Toast.tsx:89, kèm `text-white`). Map về `bg-secondary-foreground` đúng giá trị nhưng
    sai nghĩa. `--dark-panel` đã có sẵn và BẰNG ĐÚNG giá trị `--secondary-foreground`
    (cả hai = oklch(0.216 0.006 56.043)) nên `bg-dark-panel` không đổi một pixel nào.
  - `text-sky` là màu LIÊN KẾT TRÊN NỀN TỐI (Toast.tsx:99). Hệ mới không có màu thay được: --primary
    là navy #203878 (chìm trên nền tối), --on-dark là xám. Và #c1e1f7 chính là màu `from` của
    @keyframes flash-bg — nó là màu nhấn của app. Giữ tên `text-sky`, thêm token.
  Tôi cũng đọc comment ngay trên Toast.tsx:89 ("khác token có chủ đích, đừng sửa lại cho đúng token")
  để chắc mình không đè lên một quyết định cũ — comment đó nói về `fixed` vs `absolute`, không phải màu.
  PHÁT HIỆN KÈM THEO: Task 6 tạo `--dark-panel` nhưng KHÔNG phơi nó thành `--color-dark-panel`, nên
  `bg-dark-panel` hiện không phải lớp hợp lệ. Biến có mà không dùng được.
  Quyết định: thêm mục D vào bảng, và Task 8 Step 0 thêm ba dòng vào index.css (`--sky`, `--color-sky`,
  `--color-dark-panel`) TRƯỚC khi đổi class.
  *Sai thì trả giá gì:* nếu không sửa, Task 8–11 gặp 8 cặp không có trong bảng và mỗi task lại tự đoán
  một kiểu; riêng `bg-soot`/`text-sky` mà đoán bừa thì toast và lớp phủ modal vỡ màu ở chỗ không ai
  hay nhìn tới.

Task 8: DONE_WITH_CONCERNS — 11 test ĐỎ. Tôi tự chạy lại và xác nhận đủ 11 ca:
  Dashboard.test.tsx 6 ca (dùng `.closest('.rounded-tile')` làm BỘ ĐỊNH VỊ — Tile giờ phát rounded-xl
  nên selector không tìm thấy gì), Reports.test.tsx 1 ca (bg-successBg), ReportForm.test.tsx 4 ca
  (bg-dangerBg / bg-mutedbg / bg-warningBg / bg-danger).

Ruling 19 (LỖI THIẾT KẾ TRONG PLAN CỦA TÔI, lộ ra ở task thực thi đầu tiên chạm nhiều tầng):
  tôi vẽ ranh giới Task 8–11 theo THƯ MỤC, nhưng ràng buộc test↔class là theo COMPONENT. Assertion
  nằm ở features//pages/ lại nói về class do components/ui/ sinh ra. Task 8 vì thế KHÔNG THỂ xanh nếu
  chỉ đụng thư mục của nó.
  Quyết định: KHÔNG chấp nhận để cây đỏ vắt từ Task 8 tới Task 11. Bốn task chạy đỏ liên tiếp nghĩa là
  một hồi quy thật sinh ra ở Task 9/10 sẽ lẫn vào 11 ca đỏ đã biết và không ai thấy — mất trắng lưới
  an toàn theo-từng-task, thứ đắt nhất mà quy trình này mua được. Task 8 sửa luôn 11 assertion đó vì
  chúng NÓI VỀ chính component nó vừa đổi. Đã thêm ràng buộc toàn cục để Task 9/10/11 không lặp lại.
  *Sai thì trả giá gì:* Task 8 phình ra 3 file ngoài thư mục của nó — đổi lại mỗi task vẫn có cửa xanh
  thật sự để tựa vào.

Ruling 20 (RỦI RO TÔI PHÁT HIỆN KHI ĐỌC 11 CA ĐỎ, chưa ai nêu — loại lỗi TEST XANH NHƯNG ĐO NHẦM):
  bảy chỗ trong Dashboard.test.tsx dùng `.closest('.rounded-tile')` làm bộ định vị. `rounded-tile` là
  tên RIÊNG của Tile nên chắc chắn trúng ô KPI. Nhưng đích của nó, `rounded-xl`, là tên CHUNG —
  `card.tsx` của shadcn cũng dùng. Nếu có Card bọc ngoài, `.closest('.rounded-xl')` leo lên trúng Card,
  test XANH TRỞ LẠI nhưng đo nhầm phần tử. Đây là lỗi tệ hơn đỏ: đỏ thì thấy, còn cái này im lặng.
  Quyết định: bắt implementer tự chứng minh từng chỗ trong bảy chỗ còn trỏ đúng ô KPI, và nếu
  `rounded-xl` không đủ riêng thì dùng bộ định vị chắc hơn kèm lý do. Đã thành ràng buộc toàn cục.

Ruling 21 (LỖ THỨ HAI TRONG PHÉP ĐO CỦA TÔI, implementer nêu đúng): regex 22-cặp tôi dùng ở Ruling 18
  chỉ liệt kê 7 tiền tố (bg|text|border|ring|from|via|to) nên BỎ SÓT `outline-cyan`. Đo lại bằng tiền
  tố MỞ: 4 lượt, đều là vòng focus bàn phím trên ô nhập
  (`focus:outline-2 focus:outline-cyan focus:-outline-offset-2`) — DialogXacNhan.tsx:183,
  NumberCell.tsx:190, ReportForm.tsx:980 và :1027. Đây là trợ năng, mất đi thì không ai thấy ngay.
  Nghiêm trọng hơn: **regex chứng minh ở Task 12 Step 1 cũng dùng đúng 7 tiền tố đó** — nó sẽ tuyên bố
  "sạch" trong khi bốn ô nhập mất vòng focus sau khi config bị xoá.
  Quyết định: `outline-cyan` → `outline-ring` (không phải `outline-primary`: cùng giá trị #203878 nên
  không đổi pixel, nhưng tên `ring` nói đúng nó là vòng focus, và @layer base đã dùng outline-ring/50).
  Đã thêm vào bảng B, VÀ đổi regex Task 12 sang tiền tố mở kèm ghi chú "đừng thu hẹp lại".
  Dương tính giả đã loại: `b-danger`/`c-draft` nằm trong comment nhắc tên lớp của tokens.css cũ.

Task 8 vòng sửa 1: DONE. Tôi tự kiểm: npm test = 847/847 xanh, đúng bằng mốc trước Task 8.
  `outline-cyan` = 0 trong components/ui/, còn đúng 3 trong features/ (địa phận Task 10) — đúng phạm vi.
  Implementer xử lý Ruling 20 (rủi ro bộ định vị) bằng ĐO chứ không bằng lý lẽ: nó kiểm `Card` của
  shadcn không được import ở đâu trong app, và `rounded-xl` thật sự chỉ có ở Tile/DialogXacNhan/
  InlineError cộng vài primitive shadcn chưa gắn; `UnitsTable` (nơi chữ "Near miss" trùng tiêu đề cột)
  dùng `rounded-input` chứ không phải `rounded-xl`. Vì `.closest()` lấy tổ tiên GẦN NHẤT nên `rounded-xl`
  hiện đủ riêng. Nó còn ghi một chú thích ngay tại ca đó nêu bằng chứng, để cảnh báo nếu sau này có ai
  lắp <Card> vào Dashboard thật. Tôi kiểm chéo: grep `<Card|from.*ui/card` toàn src/ = 0 dòng. Khớp.
Task 8: tôi tự quét token cũ còn lại trong components/ui/ bằng regex tiền tố MỞ — 13 lượt, và tôi đọc
  TỪNG DÒNG: 7 dòng comment ở cascade.ts/ui.test.tsx (minh hoạ cách hàm hoạt động, giải thích vì sao
  phép đếm chốt toBe(2)), 2 dòng comment ở Banner/Chip nhắc tên lớp tokens.css cũ, 2 chuỗi CSS tự dựng
  ở cascade.test.ts, và 1 lượt `text-sky` ở Toast.tsx:99 mà mục D CỐ Ý GIỮ. Không mã thi hành nào còn
  token cũ. Khớp lời implementer.

Ruling 22 (hệ quả của việc trên, tôi tự bắt): phép chứng minh ở Task 12 Step 1 sẽ liệt kê CẢ 13 dòng
  đó cộng `text-sky` — người thực thi Task 12 sẽ tưởng việc chưa xong, hoặc tệ hơn là đi "dọn" mấy
  chuỗi CSS tự dựng và phá test đang đúng.
  Quyết định: (a) bỏ `sky` khỏi danh sách token trong regex — `text-sky` là lớp HỢP LỆ ở trạng thái
  cuối (Task 8 đã thêm --sky + --color-sky), để trong regex thì mỗi lần chạy lại báo động giả;
  (b) viết lại Expected của Step 1 thành một BẢNG liệt kê đủ 5 nhóm dòng được phép còn lại kèm lý do
  từng nhóm, và câu "grep ra dòng nào NGOÀI bảng này mới là việc chưa xong";
  (c) ghi chú rằng các tên lớp trong comment đó HIỆN vẫn sinh CSS thật, nhưng sau khi Step 3 xoá
  tailwind.config.ts thì chúng thôi là token nào cả nên tự hết sinh CSS — nên dòng `<` mà Step 5 thấy
  là ĐÚNG, không phải mất style.
  *Sai thì trả giá gì:* nếu không vá, Task 12 hoặc dừng nhầm vì báo động giả, hoặc phá cascade.test.ts.

Task 8: review trả Approved. Người review tự kiểm CHÉO chứ không tin báo cáo: đọc thẳng Dashboard.tsx,
  KpiTile.tsx, Tile.tsx, UnitsTable.tsx để xác nhận lập luận `.closest('.rounded-xl')`; tự chạy lại
  grep `<Card`; đọc index.css xác nhận ba bất biến; rà cả 542 dòng diff xác nhận không đổi chữ/DOM.
  Hai mục Important của nó KHÔNG nằm trong cây làm việc Task 8 — đều là lỗ hổng ở TÀI LIỆU điều phối,
  tức lỗi của tôi, không phải của người thực thi.

Ruling 23 (từ Important #1 — regex tiền tố đóng còn sống ở Task 9/10/11): tôi đã vá tiền tố mở cho
  Task 12 ở Ruling 22 nhưng QUÊN ba task trước nó. Đo lại: Task 9 và 11 không có lượt `outline|from|
  via|to` nào, nhưng Task 10 có ĐÚNG 3 lượt `outline-cyan` (NumberCell.tsx:190, ReportForm.tsx:980,
  1027) — regex cũ sẽ tuyên bố "đã liệt kê đủ" trong khi ba ô nhập mất vòng focus.
  Quyết định: đổi cả ba Step 1 sang `[a-z][a-z-]*-`, và chèn dưới mỗi khối lệnh đoạn cảnh báo nói rõ
  vì sao đừng thu hẹp lại + "lượt nào regex ra mà Bảng đối chiếu không có thì HỎI, đừng đoán".
  Không bỏ `sky` khỏi ba danh sách đó: đã đo, `sky` không xuất hiện ngoài components/ui/ nên vô hại.
  *Sai thì trả giá gì:* regex rộng hơn chỉ tốn công đọc thêm vài dòng; regex hẹp thì mất style im lặng.

Ruling 24 (từ Important #2 — allowlist Task 12 thiếu 4 dòng): chạy ĐÚNG lệnh Task 12 lên
  components/ui/ (đã là trạng thái cuối) ra 15 dòng; bảng của tôi mới phủ 11. Bổ sung hai hàng:
  - ui.test.tsx:244,248,250 — dòng 250 KHÔNG phải comment mà là assertion đang chạy
    (`not.toContain('text-tableHead')`), chốt chống tái phạm lỗi vòng sửa 1. Tên token cũ phải còn
    nguyên văn thì phép chốt mới có nghĩa.
  - Tile.tsx:26 — dòng DUY NHẤT nằm trong mã sản phẩm, comment giải thích vì sao nhãn KHÔNG dùng
    text-tableHead. Là .tsx nên dễ bị "dọn" nhất, mà xoá là mất lời giải cho đúng cái lỗi dòng 250 canh.
  Cũng sửa câu Expected: "15 dòng đã đo bằng chính lệnh trên" thay cho lời khẳng định chung chung.
  *Sai thì trả giá gì:* không vá thì Task 12 dừng nhầm vì báo động giả, hoặc xoá mất hai chốt.

Minor của người review: con số "13 lượt" tôi tự chốt là thiếu — đúng ra 15. Tôi sót Tile.tsx:26.
  Không đổi kết luận nào, nhưng chính dòng sót đó là dòng phải vào allowlist ở Ruling 24.

Task 8: complete

Ruling 25 (tôi tự bắt khi đo trước phạm vi Task 10/11, không do ai báo): Task 8 đã sửa
  `pages/Reports.test.tsx` — đúng theo Ruling 19, vì ca duy nhất ở đó nói về nền của `Chip` thuộc
  Task 8. Truy bằng snapshot: successBg=1 suốt từ task-00-base đến task-07, sang task-08 thành
  success-bg=1. Hệ quả: Files-list của Task 11 còn kê `pages/Reports.test.tsx` trong khi file đó đã
  còn 0 lượt token cũ — ĐÚNG hình dạng lỗi KpiTile mà tôi đã bỏ khỏi Task 10 trước đây.
  Quyết định: bỏ khỏi Files của Task 11, kèm ghi chú "KHÔNG đụng" nêu rõ ai đã làm và vì sao.
  *Sai thì trả giá gì:* để nguyên thì người thực thi Task 11 hoặc báo "Missing" giả, hoặc bịa ra
  thay đổi trong một file đang đúng.

Ruling 26 (cùng lượt đo): comment Task 8 vừa viết ở `pages/Dashboard.test.tsx:365` mô tả
  `UnitsTable.tsx` dùng `.rounded-input` — mà `UnitsTable.tsx` là file của Task 10. Task 10 đổi
  `rounded-input` → `rounded-md` thì comment đó thành sai, và vì Tailwind v4 quét comment nên
  `.rounded-input` vẫn sinh CSS mồ côi cho tới khi Task 12 xoá config. Step 1 của Task 10 chạy
  `cd features && grep .` nên KHÔNG nhìn thấy dòng này.
  Quyết định: giao dòng 365 cho Task 10 (task nào làm cho câu chữ thành sai thì task đó sửa), ghi rõ
  "CHỈ dòng 365, đừng đụng gì khác — phần còn lại của file là của Task 11".
  *Sai thì trả giá gì:* giao nhầm cho Task 11 thì comment sai sống qua một vòng review; không giao
  cho ai thì nó sống tới hết lát.

Task 9: nộp DONE_WITH_CONCERNS. 4 file, 15 lượt, đúng bằng con số tôi đo trước khi dispatch — Files-list
  không lệch lần nào. Tôi tự chạy `npm test`: 847/847, sạch, không cảnh báo. Tự quét lại phạm vi bằng
  regex tiền tố mở: 0 lượt sót. Mục C còn nguyên (`text-[#a8a29e]` ở Sidebar.tsx:31, `--toast-cao` ở
  AppShell.tsx:24,28). Diff 99 dòng, chỉ chạm đúng 4 file, không lan.

Ruling 27 (phán về mối lo người thực thi tự nêu): nó đổi `text-table` → `text-sm` trong HAI dòng
  COMMENT ở Sidebar.tsx:23,25 và tự báo lên vì không chắc có vượt phạm vi không. Tôi duyệt, và lý do
  quan trọng hơn bản thân phép đổi: comment đó cảnh báo "đừng dùng text-xs/text-table ở đây vì chúng
  tự mang line-height". Tôi kiểm CSS đã build: `.text-sm{font-size:...;line-height:...}` — đúng, nó
  CÓ mang line-height, nên câu cảnh báo vẫn đúng nguyên nghĩa với cái tên mới. Ngược lại, giữ
  `text-table` trong comment thì (a) comment trỏ vào một token sắp chết, (b) Tailwind v4 quét comment
  nên `.text-table` tiếp tục sinh CSS mồ côi. Đây là áp ĐÚNG ràng buộc toàn cục chứ không phải vượt
  phạm vi. *Sai thì trả giá gì:* nếu `text-sm` hoá ra không tương đương thì comment thành sai — nhưng
  đã đo trên CSS thật, không phải suy đoán.

Tôi tự bắt (không ai báo): cảnh báo đầu tiên của tôi — ".bg-muted không sinh CSS" — là SAI, do regex
  `\.bg-muted{` của tôi không khớp selector GỘP mà Tailwind sinh ra
  (`.bg-muted,.bg-muted\/50{background-color:var(--muted)}`). Mã đúng. Đáng ghi lại một hệ quả: điều
  đó chứng minh `cascade.ts` có xử lý được dạng selector gộp — nếu không, ca AppShell.test.tsx:206 đã
  trả null và đỏ, chứ không xanh.

Tôi cũng tự kiểm cái rủi ro nguy hiểm nhất của toàn bộ phép đổi tên — đổi tên có làm lệch màu không.
  Chuyển OKLab→sRGB: `oklch(0.97 0.001 106.424)` (--muted) = #f5f5f4 = đúng giá trị cũ của
  `.bg-mutedbg`. TRÙNG KHÍT, không lệch một pixel.

Đo trước cho Task 10 — cái bẫy đã làm Task 8 đỏ 11 ca (test ở thư mục khác assert lên component mình
  vừa đổi). Tôi liệt kê MỌI assertion về class trong `pages/*.test.tsx` và soi từng dòng xem có dòng
  nào chạm token mà Task 10 sắp đổi (canvas/surface/hair/mutedbg/ink/soot/outline-cyan/danger/table/
  tableHead/pageTitle/rounded-input/rounded-tile):
  - Dashboard.test.tsx:176,177,405-436 → nói về Coverage.tsx và UnitsTable.tsx (ĐÚNG là file Task 10),
    nhưng chỉ dùng tên ĐÃ MỚI (`text-muted-foreground`) hoặc lớp cấu trúc (`mb-5`, `text-right`).
  - Dashboard.test.tsx:187,199,369,637 → `.closest('.rounded-xl')` + `bg-destructive-bg`: `rounded-xl`
    do Tile.tsx sinh (Task 8, đã xong), `bg-destructive-bg` đã là tên mới.
  - Dashboard.test.tsx:541 `toContain('rounded-tile')` → đo ra chuỗi "Bạn không có quyền xem dashboard
    này" nằm ở `pages/Dashboard.tsx:117`, tức TASK 11 chứ không phải Task 10.
  - Status.test.tsx:384-448 → so hai `resolveCascadeWinner` với nhau, hoặc với `bg-transparent` (lớp
    gốc Tailwind). Đổi tên nhất quán thì vẫn bằng nhau.
  - Status.test.tsx:720-736 → `w-[260px]`, `sticky`, `left-0`, `h-10`: lớp cấu trúc, không phải token.
  Kết luận: **Task 10 KHÔNG có ràng buộc test chéo thư mục.** Việc duy nhất vượt khỏi `features/` là
  comment ở Dashboard.test.tsx:365 mà Ruling 26 đã giao. Khác hẳn Task 8.

Ghi chú phụ (đo được lúc rà): hàng `bg-successBg → bg-success-bg` của bảng B ĐÃ xong sạch toàn src/
  (0 lượt `successBg` còn lại, 3 lượt `success-bg`) — Task 8 làm theo Ruling 19. Task 10/11 sẽ thấy
  hàng đó không còn lượt nào; đó là đúng, không phải bỏ sót.

Task 9: review trả "Changes requested" với một mục Critical. TÔI BÁC mục Critical đó, có bằng chứng.
  Nhưng lỗi mà nó lần ra là CÓ THẬT và là lỗi CỦA TÔI — chỉ nằm ở chỗ khác chỗ nó tưởng.

Ruling 28 (phán về Critical của review Task 9):
  Số liệu người review đưa ra ĐÚNG, tôi đo lại xác nhận: `rounded-input` 6px → `rounded-md` 8px
  (--radius .625rem × .8), `text-table` 13px/1.35 → `text-sm` 14px/20px (--text-sm .875rem,
  line-height calc(1.25/.875)). Giá trị THẬT SỰ đổi.
  Nhưng kết luận "vi phạm cam kết không đổi pixel" thì sai, vì hai lẽ:
  (a) Plan CHƯA BAO GIỜ có ràng buộc "không đổi một pixel". Global Constraints chỉ nói "Lát 0 không
      đổi chữ nghĩa và không đổi cấu trúc DOM". Câu "không đổi một pixel nào, mục B là đổi TÊN không
      đổi GIÁ TRỊ" là câu TÔI tự viết vào lệnh giao việc Task 8 và Task 9. Nó không có trong plan,
      không có trong spec.
  (b) Gói thiết kế gốc khai thẳng thang bán kính kèm chú thích công dụng ngay trên dòng
      (`~/Downloads/design_handoff_hsseq_redesign/src-index.css:32-35`):
        --radius-md: calc(var(--radius) - 2px);  /*  8px — Button/Input/Badge */
        --radius-xl: calc(var(--radius) + 4px);  /* 14px — Card */
      Chỗ dùng `rounded-input` là ô nhập và mục nav → `--radius-md` "Input". Chỗ dùng `rounded-tile`
      là thẻ/ô KPI → `--radius-xl` "Card". Khớp đúng ý đồ. Và `text-table` → `text-sm` khớp nền
      `body { font-size: 14px }` mà handoff đặt ở dòng 172. Đây LÀ bản redesign, không phải tai nạn.
  Vậy: mã Task 9 ĐÚNG, không có vòng sửa. Task 8 cũng không phải làm lại.
  *Sai thì trả giá gì:* nếu tôi phán nhầm, ta đổi bán kính và cỡ chữ toàn app mà tưởng là không đổi —
  nhưng bằng chứng là chú thích do chính người thiết kế viết cạnh từng con số, khó sai hơn suy đoán.

  Lỗi của tôi và cái giá đã trả: câu "không đổi một pixel" tôi tự bịa ra đã (1) tốn trọn một vòng
  review đi truy một vi phạm không tồn tại, và (2) suýt nguy hiểm — một người thực thi tin câu đó có
  thể "sửa" bảng về `rounded-[6px]`/`text-[13px]` để giữ pixel, tức LẶNG LẼ HUỶ bản thiết kế, đúng
  ngược mục tiêu. Đã vá: thêm hẳn một ràng buộc toàn cục nói rõ Lát 0 hứa gì và KHÔNG hứa gì, kèm
  câu "đừng sửa bảng về giá trị cũ để giữ pixel".

Ruling 29 (nhận mục Important của review — đúng, và có giá trị):
  Lý lẽ "hash bundle CSS không đổi ⇒ không lệch pixel" là SAI về logic, dù ở Task 9 nó tình cờ ra
  kết quả đúng cho phần màu. Hash không đổi chỉ chứng minh không luật CSS nào được thêm/bớt — mà cả
  `.text-table` lẫn `.text-sm` đều đã có sẵn trong bundle vì features//pages/ chưa migrate. Nó không
  nói gì về phần tử vừa đổi tên lớp. Đã cấm lối suy luận này thành văn trong plan.

Ruling 30 (mục Minor): `border-hair` #e8e6e5 → `border-border` #e7e5e4 lệch 1/255 mỗi kênh. Không
  hành động: gói thiết kế ĐÃ biết và đã chấp nhận — `src-index.css:88` ghi thẳng "`--border`
  (stone-200) gần đúng #e8e6e5 mà app đang dùng". Người thiết kế đã phán rồi, tôi không phán lại.

Đã thêm mục **B-bis** vào Bảng đối chiếu: liệt kê hàng nào giữ giá trị (5 cặp màu, có số đo) và hàng
  nào đổi giá trị có chủ đích (6 cặp bán kính/cỡ chữ, có trích chú thích của người thiết kế). Kiểm
  ranh giới awk của brief.sh: bảng vẫn trọn vẹn (dòng 69→195), B-bis đi kèm mọi brief từ nay.

Task 9: complete

Task 10: nộp DONE_WITH_CONCERNS. 113 lượt / 10 file, khớp con số tôi đo trước. npm test 847/847 sạch.
  Người thực thi nêu hai mối lo, và nó ĐÚNG cả hai — nhưng quan trọng hơn: hai mối lo đó là MỘT lỗ
  hổng duy nhất trong Bảng đối chiếu, và khi tôi kéo sợi chỉ thì ra chỗ thứ ba mà nó chưa thấy.

Ruling 31: bốn hàng cuối mục B nở một token thành nhiều lớp. Bốn token cũ trong tailwind.config.ts
  CHỈ khai cỡ chữ (`table: ['13px','1.35']`, `tableHead: ['12px','1.2']`…) — không độ đậm, không màu.
  Bản nở lại thêm `font-*` và `text-<màu>`. Phần tử nào đã tự viết tay thuộc tính đó thì thành hai
  lớp tranh một thuộc tính, ai thắng do thứ tự byte trong CSS quyết định — may rủi, không chủ đích.
  Đo thứ tự thật trong dist/assets/*.css: .font-medium@29055 < .font-semibold@29243;
  .text-muted-foreground@30340 < .text-secondary-foreground@30569.
  Ba chỗ chạm:
  (1) 11 lượt features/ + 6 lượt pages/Reports.tsx: bản nở đưa `font-medium`, phần tử đã có
      `font-semibold` → semibold thắng sẵn, hình chữ KHÔNG đổi, `font-medium` là lớp chết.
  (2) GroupHeader.tsx:27: bản nở đưa `text-muted-foreground`, phần tử đã có `text-soot` →
      `text-secondary-foreground` thắng sẵn, màu KHÔNG đổi, nhưng đúng là mong manh.
  (3) **FormHeader.tsx:120 — ca DUY NHẤT ĐANG LỆCH THẬT, người thực thi chưa thấy.** Tôi truy
      snap/task-09: trước Task 10 là `text-pageTitle font-medium text-ink`, tức 500. Bản nở của
      `text-pageTitle` đưa vào `font-semibold`, mà semibold nằm SAU trong CSS → nó ĐANG thắng.
      Tiêu đề trang form đã âm thầm đổi từ 500 sang 600.
  Quyết định — luật "bản nở chỉ LẤP CHỖ TRỐNG": phần tử đã tự khai thuộc tính nào thì bỏ phần đó của
  bản nở. Chọn giữ cái phần tử tự khai (chứ không giữ bản nở) vì câu hỏi "tiêu đề bảng nên medium hay
  semibold" là quyết định THIẾT KẾ MÀN, thuộc Lát 1-8. Lát 0 mà tự quyết là lén làm thay lát sau.
  Đã viết thành mục **B-ter** trong Bảng đối chiếu, có bảng ba chỗ chạm.
  *Sai thì trả giá gì:* nếu luật này sai thì ta giữ lại vài lớp cũ đáng lẽ nên bỏ — sửa ở Lát 1-8 khi
  làm chính màn đó, rẻ. Còn không vá thì tiêu đề form lệch đậm nhạt mà không ai biết vì sao.

Ghi nhận: người thực thi từ chối tự ý xoá lớp chết vì "bảng chỉ cho phép đổi đúng chuỗi cho trước" —
  đúng kỷ luật. Việc phán là của tôi, không phải của nó.

Task 10 vòng sửa 1: xong, tôi tự kiểm độc lập (không chỉ tin báo cáo):
  - npm test: 847/847, sạch, không cảnh báo.
  - GroupHeader.tsx:27 giờ là `text-[13.5px] font-semibold text-secondary-foreground` — đúng MỘT độ
    đậm, đúng MỘT màu, khớp ngữ nghĩa bản cũ (`text-tableHead font-semibold text-soot`, tableHead
    vốn chỉ khai cỡ chữ).
  - FormHeader.tsx:120 giờ là `text-2xl tracking-[-0.4px] font-medium ...` — đã trả về 500.
  - Quét TOÀN `src/`: không còn phần tử nào có hai lớp font-weight tranh nhau (0 kết quả), cũng
    không còn phần tử nào có hai lớp màu chữ tranh nhau (0 kết quả). Lỗ hổng B-ter đã bịt kín, không
    chỉ ở ba chỗ đã biết.
  - Diff task-09→task-10: 386 dòng, đúng 10 file features/ + 1 dòng comment ở pages/Dashboard.test.tsx
    (Ruling 26 giao). Không lan.

Đo trước cho Task 11 (làm trong lúc chờ review Task 10) — bề mặt B-ter ở `pages/` LỚN HƠN Task 10
  nhiều, và chứa đúng cái bẫy FormHeader vừa sửa, lặp lại 6 lần. Liệt kê theo từng bản nở:
  - `text-tableHead` × 6 (Reports.tsx): đều đã có `font-semibold`, KHÔNG có lớp màu → bỏ `font-medium`
    của bản nở, GIỮ `text-muted-foreground` (đúng ý đồ TableHead của shadcn). Giống 10 <th> ở Task 10.
  - **`text-pageTitle` × 6** (Reports · Dashboard×2 · Forbidden · Status · NotFound): cả sáu đều đã có
    `font-medium` VÀ `text-ink` viết tay. Bản nở đưa `font-semibold` vào, mà `.font-semibold` nằm SAU
    `.font-medium` trong CSS → nó sẽ THẮNG và đổi âm thầm tiêu đề SÁU TRANG từ 500 sang 600. Đây đúng
    là ca `FormHeader.tsx:120` của Task 10, nhân sáu. Theo B-ter: bỏ `font-semibold`, giữ `font-medium`.
  - `text-kpi` × 2 (Forbidden, NotFound — con số 403/404 cỡ lớn): phần tử đã có `font-medium`, mà bản
    nở CŨNG là `font-medium` → trùng lặp chứ không tranh nhau. Theo B-ter vẫn bỏ phần của bản nở để
    khỏi còn `font-medium font-medium`.
  - `text-table` × 21: nở thành ĐÚNG MỘT lớp `text-sm`, không mang độ đậm cũng không mang màu → không
    va chạm nào, kể cả ở những chỗ đã có sẵn `font-medium`/`text-soot`/`text-muted-foreground`.
  Tổng: 14 chỗ phải áp B-ter, trong đó 6 chỗ nếu bỏ qua thì lệch hiển thị thật.

Bẫy Ruling 19 cho Task 11: đã kiểm, KHÔNG có. Chỉ `app/routeScan.test.ts` và
  `features/report/ReportForm.test.tsx` có nhắc chuỗi "pages/" — cả hai đều chỉ trong COMMENT, không
  assert class nào của trang. `app/routes.test.tsx` có 0 khẳng định về className.

Task 10: review trả Approved, KHÔNG một phát hiện nào ở cả ba mức. Nó xác minh độc lập trên mã sống
  chứ không đọc báo cáo: tự chạy lại regex Step 1 (0 sót), tự đếm 113 lượt/10 file, tự grep
  `outline-ring` ra đúng 3 vị trí, và quan trọng nhất là kiểm B-ter theo CẢ HAI CHIỀU — không chỉ
  "đã bỏ phần thừa chưa" mà còn "có bỏ lố không": xác nhận 10 <th> không viết tay màu thì VẪN CÒN
  `text-muted-foreground`. Đó đúng là chiều dễ sai mà tôi đã đặt riêng một câu hỏi.
  Một kỹ thuật của nó đáng giữ lại cho các vòng sau: đếm mỗi hunk có số dòng `+` bằng đúng số dòng
  `-` → chứng minh không dòng nào được thêm/bớt, tức loại trừ rủi ro đổi DOM bằng SỐ LIỆU chứ không
  bằng lời khai. Rẻ hơn đọc tay 386 dòng mà chắc hơn.

Task 10: complete

Đo trước allowlist Task 12 (chạy ĐÚNG regex của Task 12 lên ba thư mục đã đóng): `components/` ngoài
  `ui/`, `app/`, và `features/` giờ SẠCH TUYỆT ĐỐI — 0 lượt. Toàn bộ 15 dòng còn lại đều nằm trong
  `components/ui/`, và trùng khít với bảng allowlist tôi đã vá ở Ruling 24. Không phải sửa gì thêm
  cho ba thư mục này.
  Một hàng trong allowlist hiện là hàng CHẾT: `app/cssNen.test.ts` được liệt vì nhắc `text-sec`, mà
  `sec` chưa bao giờ nằm trong regex của Task 12 (nó thuộc mục A). Sẽ dọn cùng lúc với việc chốt
  phần `pages/` sau khi Task 11 xong — một lần sửa có đo, thay vì hai lần đoán.

Ruling 32 (đo trước Task 13, tự bắt): plan bảo Task 13 Step 4 sửa `DESIGN.md` — đổi `Cyan Signal`
  thành navy, `Inter` thành `Exo 2`. ĐÓ LÀ SAI, tôi đã gỡ khỏi plan. Bằng chứng:
  - `DESIGN.md` tiêu đề "**Seline Analytics — Style Reference**", tức style guide của một SẢN PHẨM
    KHÁC. `grep -ci 'hseq|hsseq|ptsc'` = 0 — nó chưa bao giờ phát biểu gì về HSSEQ.
  - Quyết định D19 (`hseq-platform-mvp-fm01.md:606`) đã chốt từ đầu: "DESIGN.md là style landing
    page, không màu ngữ nghĩa"; app chỉ MƯỢN dải stone (tên token cũ canvas/soot/hair chính là lấy
    từ --color-stone-canvas/--color-soot/--color-stone-border của nó).
  Sửa cyan thành navy sẽ làm file đó không mô tả đúng sản phẩm NÀO cả. "Viết đè cho đúng hiện trạng"
  — chỉ thị của chủ dự án — áp cho tài liệu nói về APP NÀY; DESIGN.md không nằm trong số đó. Phát
  biểu lạc hậu thật nằm ở chỗ TRỎ TỚI nó (fm01:699 "→ kế thừa"), mà Step 3 đã sửa.
  Quyết định: Step 4 chỉ còn thêm ĐÚNG MỘT dòng phạm vi dưới tiêu đề DESIGN.md (file nằm ở gốc repo
  nên người đọc sau dễ tưởng nó mô tả repo này), trỏ về `frontend/src/index.css`.
  *Sai thì trả giá gì:* nếu tôi phán nhầm thì ta thiếu một lần cập nhật tài liệu — rẻ. Còn làm theo
  plan cũ thì ta phá một tài liệu đang đúng, và không ai phát hiện vì chẳng ai đọc lại Seline.

Đã kiểm luôn số dòng plan nêu cho `hseq-platform-mvp-fm01.md` (~666, ~667, ~699, ~711): CHÍNH XÁC cả
  bốn. Task 13 Step 3 giao được nguyên trạng.

Task 11: nộp DONE_WITH_CONCERNS, 148/148 lượt trên 8 file, npm test 847/847 sạch. Bốn mối lo, phán:

Ruling 33 (mối lo 1 — ĐÚNG, lỗ hổng tài liệu của tôi): `bg-cyan`/`bg-cyanEdge`/`border-cyanEdge` →
  `bg-primary`/`border-primary` là đổi MÀU THẬT (#3ba6f1, #3398e1 → #203878), không phải đổi tên giữ
  giá trị như 5 cặp màu tôi đã liệt trong B-bis. Người thực thi đúng khi chỉ ra B-bis chú thích kỹ
  cho radius/cỡ chữ mà bỏ trống chuyện này. Đây LÀ chủ đích — ràng buộc toàn cục ghi thẳng "Màu
  thương hiệu --primary: #203878", và cyan vốn là màu của DESIGN.md (sản phẩm khác) mà app từng
  mượn. Đã vá: B-bis có thêm khối "Màu thương hiệu — ĐỔI GIÁ TRỊ" với bảng ba hàng.

Ruling 34 (mối lo 2 — HỎNG THẬT, người thực thi là người duy nhất thấy): bảng gộp HAI token cũ vào
  MỘT token mới (`bg-cyan` và `bg-cyanEdge` cùng về `bg-primary`). Phần tử dùng cái này lúc nghỉ và
  cái kia lúc hover thì sau khi đổi hai trạng thái thành y hệt nhau — hiệu ứng rê chuột BIẾN MẤT, và
  không ca test nào bắt được vì class vẫn hợp lệ, test vẫn xanh.
  Truy snap/task-10: trước là `bg-cyan border-cyanEdge hover:bg-cyanEdge` (sáng lúc nghỉ, đậm lúc
  hover). Tôi viết một phép quét TỔNG QUÁT toàn src/ — phần tử nào có cả `X` lẫn `hover:X` — ra đúng
  2 chỗ: pages/Forbidden.tsx:11 và pages/NotFound.tsx:11, cùng là nút "Về trang chủ".
  Quyết định: `hover:bg-primary/80`, đúng nguyên văn cách `components/ui/button.tsx:11` và
  `badge.tsx:11` do shadcn sinh ra đang dùng cho nút primary. Đã kiểm: lớp `hover\:bg-primary\/80`
  ĐÃ có sẵn trong dist/assets/*.css nên không sinh luật CSS mới. Chấp nhận việc hướng đổi ngược lại
  (nhạt đi khi hover thay vì đậm lên) — đó là idiom shadcn cho nút primary, cùng loại với việc chấp
  nhận bán kính 6→8px. Hai nút này là bản chép tay của nút primary; Lát 1-8 thay bằng <Button> sẽ
  nhận đúng lớp này.
  *Sai thì trả giá gì:* nếu hướng hover nên giữ "đậm lên" thì sửa ở Lát 1-8 khi làm chính màn đó, rẻ.
  Còn không sửa thì hai nút mất phản hồi rê chuột vĩnh viễn mà test vẫn xanh.
  Đã ghi cả cạm bẫy "hai token gộp làm một" vào B-bis kèm phép quét, để lát sau không dẫm lại.

Mối lo 3 (comment components/ui/ còn token cũ): đã có phán quyết từ Ruling 22/24 — 15 dòng đó nằm
  trong allowlist Task 12, có lý do từng nhóm. KHÔNG dọn. Đã nói rõ với người thực thi.
Mối lo 4 (không tách được lượt `npm test` "trước" vì cấm git stash): không phải thiếu sót. Mốc do TÔI
  giữ — tôi tự chạy npm test lúc đóng Task 10 (847/847 sạch) và có snap/task-10. Cách nó dùng (đối
  chiếu từng hunk) là đúng cho phần nó kiểm soát được.

Task 11 vòng sửa 1: xong, tôi tự kiểm độc lập:
  - npm test 847/847, sạch.
  - `pages/` SẠCH TUYỆT ĐỐI — 0 lượt token cũ, kể cả trong comment (người thực thi sửa cả dòng 174
    và 539 của Dashboard.test.tsx cho khớp tên mới).
  - hover khôi phục: `hover:bg-primary/80` ở cả Forbidden.tsx:11 và NotFound.tsx:11.
  - Chạy lại cả BA phép quét va chạm trên toàn src/: hai font-weight = 0, hai màu chữ = 0,
    hover trùng trạng thái nghỉ = 0.
  - Diff task-10→task-11: 419 dòng, đúng 8 file `pages/`. `pages/Reports.test.tsx` KHÔNG nằm trong
    diff — đúng, Task 8 đã xử nó.

Chốt allowlist Task 12 bằng số đo CUỐI thay vì để hàng chết: chạy đúng regex Task 12 trên TOÀN `src/`
  ra đúng 15 dòng, tất cả trong `components/ui/`. `components/` ngoài ui/, `app/`, `features/`,
  `pages/` đều 0 lượt. Đã bỏ hàng chết (`app/cssNen.test.ts`, `pages/Dashboard.test.tsx` — cả hai
  không còn khớp regex nữa) và viết lại Expected thành con số đo được, có nêu rõ đã đo sau Task 11.

Ruling 35 (tôi tự bắt khi soi Task 12 trước lúc giao — mâu thuẫn NỘI TẠI do chính tôi tạo ra ở
  Ruling 22): Step 1 tôi đã ghi chú "sau khi xoá config, tên lớp trong comment thôi sinh CSS, nên
  dòng `<` ở Step 5 là ĐÚNG". Nhưng tôi KHÔNG sửa Step 5, mà Expected của nó vẫn ghi "`diff` không in
  gì" và đoạn dưới ghi dòng `<` nghĩa là "một phần src/ rơi ra ngoài vùng quét — NGHIÊM TRỌNG".
  Người thực thi Task 12 đọc Step 5 sẽ thấy dòng `<` thật, đọc chữ "nghiêm trọng", rồi hoặc dừng
  nhầm hoặc khôi phục lại config để "chữa" — tức huỷ chính việc của task.
  Đã ĐO chính xác thay vì ước lượng: đúng **7 luật** trong bundle hiện tại chỉ sống nhờ tên lớp nằm
  trong comment — `.text-tableHead`, `.text-ink`, `.border-danger`, `.bg-surface`, `.bg-mutedbg`,
  `.border-warningEdge`, `.border-hair`. (Các token cũ khác như `text-soot`, `rounded-tile`,
  `bg-canvas`, `text-kpi`, `bg-cyan` ra 0 — không comment nào nhắc, không mã nào dùng.)
  Quyết định: viết lại Expected của Step 5 thành "không một dòng `>` nào, và ĐÚNG BẢY dòng `<`", kèm
  bảng ánh xạ từng luật với comment đang giữ nó sống. Và thêm chiều ngược: THIẾU dòng `<` cũng là
  tín hiệu xấu — nghĩa là tên lớp đó vẫn đang được mã thi hành dùng, việc chưa xong.
  *Sai thì trả giá gì:* nếu con số 7 lệch thì người thực thi sẽ thấy ngay vì bảng liệt kê đích danh
  từng luật; lệch là tín hiệu thật chứ không phải báo động giả.

Task 11: review trả Approved, không Critical/Important. Nó tự kiểm độc lập ở mức cao: chạy lại regex
  Step 1 trên snap/task-10 để dựng lại mốc TRƯỚC (ra đúng 148, khớp brief), rồi chạy trên cây hiện
  tại (0 lượt); đọc thẳng từng dòng cả 14 chỗ B-ter; tự viết script quét cả hằng chuỗi BTN_* ở
  Reports.tsx chứ không chỉ className trực tiếp; và dùng lại mẹo đếm +/- từng hunk (27 hunk, tổng
  +66/-66, mọi hunk cân bằng) để chứng minh không dòng nào được thêm/bớt.

Ruling 36 (hệ quả từ mục Minor của review, và nó nguy hiểm hơn chỗ review chỉ ra): review khen người
  thực thi phân biệt đúng `font-mono` (font-family, KHÔNG tranh) với `font-medium` (font-weight, CÓ
  tranh) ở bản nở của `text-kpi`. Nhưng bảng B-ter do tôi viết lại ghi "bỏ **mọi** `font-*` trong bản
  nở" — tức luật của tôi SAI, và người thực thi làm đúng nhờ tự phán chứ không nhờ luật. Ai theo sát
  chữ của tôi ở Lát 1-8 sẽ bỏ luôn `font-mono` và làm hỏng đúng thứ bản nở sinh ra để làm (font đều
  chữ số cho con số KPI).
  Quyết định: sửa B-ter thành "lớp **độ đậm** trong bản nở", kèm đoạn nói rõ `font-*` không phải một
  nhóm — `font-medium` là weight, `font-mono` là family, không tranh nhau.
  *Sai thì trả giá gì:* không sửa thì luật sai này sống tới Lát 8 và chỉ lộ ra khi con số KPI mất font
  đều — mà không ca test nào canh font-family.

Minor của review (brief Task 11 Step 2 ghi "sửa HAI file test" trong khi Files chỉ còn một): đúng, dư
  âm của Ruling 25 khi tôi bỏ `Reports.test.tsx` khỏi Files mà quên câu chữ Step 2. Đã sửa.

Task 11: complete

Task 12: nộp DONE. Step 5 ra **7 dòng `<`, 0 dòng `>`** — khớp CHÍNH XÁC con số và bảng tôi đo trước
  khi giao (Ruling 35). Phép dự đoán đó là cái đắt giá nhất tôi làm cho task này: không có nó, người
  thực thi gặp 7 dòng `<` sau khi đọc chữ "nghiêm trọng" ở bản plan cũ thì rất dễ khôi phục config.
  Tôi tự kiểm độc lập:
  - `tailwind.config.ts` KHÔNG còn trên đĩa; `@config` trong index.css = 0; components.json
    `"config": ""`.
  - Bảy luật mồ côi: đếm lại trong bundle mới, cả 7 đều ra **0**. Bundle 1007 → 1001 luật.
  - npm test 847/847, sạch. Ba bất biến còn nguyên (toast-cao ở Toast.tsx + AppShell.tsx,
    .flash/prefers-reduced-motion/flash-bg 5 dòng, tnum/tabular-nums 3 dòng).
  - Ca test mới có mặt: "không còn @config trỏ về tailwind.config.ts" và "tailwind.config.ts đã bị xoá".
  - Diff task-11→task-12: 121 dòng, đúng 4 file (components.json, cssNen.test.ts, index.css, và
    tailwind.config.ts bị xoá). Ảnh chụp 121 → 120 file.
  - Cảnh báo `npm run lint`: đã tự chạy, toàn bộ là `react(refs)` và `react(only-export-components)`
    ở Status.tsx, useKeyboardNav.tsx, FormModeBar.tsx, Login.tsx, FormHeader.tsx, sidebar.tsx —
    không file nào Task 12 đụng, và không cảnh báo nào liên quan tới class/CSS. Đúng như người thực
    thi báo: có sẵn, không phải hồi quy. Ràng buộc "output SẠCH" nói về `npm test`, và npm test sạch.

Task 12: review trả Approved, không Critical/Important. Nó dùng một kỹ thuật đáng giữ cho các vòng
  sau: MÔ PHỎNG THỰC NGHIỆM bằng Node thuần để kiểm hai ca test mới có thật sự bắt lỗi không — tiêm
  `body { @apply bg-white text-black; }` vào khối trần rồi xác nhận ca chuyển ĐỎ; và thử `Background:`
  viết hoa để xác nhận regex cũ (không /i) trượt còn regex mới bắt được. Đó là cách duy nhất phân
  biệt guard thật với guard hình thức — đọc mã không đủ.
  Nó cũng tìm được một bằng chứng git tinh tế mà tôi bỏ qua: `tailwind.config.ts` đang ở trạng thái
  ` D` với cột ĐẦU TRỐNG trong `git status --porcelain` — đúng dấu hiệu `rm` thường; nếu là `git rm`
  thì `D` sẽ nằm ở cột đầu (đã stage). Chứng minh bằng trạng thái chứ không bằng lời khai.
  Nó cũng giải thích đúng ca đặc biệt `.bg-mutedbg`: dòng `<` thực ra là `.hover\:bg-mutedbg:hover`,
  vì comment ở cascade.ts chỉ viết `hover:bg-mutedbg` chứ không có chỗ nào viết `bg-mutedbg` trần.

Task 12: complete

Tôi tự chạy lại bộ e2e (cửa cuối của Lát 0, Task 12 Step 7): **40/40 xanh, exit 0**, 4 spec × 2
  viewport, 1,2 phút, trên trình duyệt thật qua build thật. Đây là bằng chứng MẠNH NHẤT cho ràng buộc
  "Lát 0 không đổi chữ nghĩa và không đổi cấu trúc DOM" — jsdom trong vitest có thể bỏ sót, còn e2e
  dùng getByRole/getByText trên DOM thật. Sau 478 lượt đổi class, mọi bộ định vị vẫn trúng.
  Quy mô Lát 0 tính tới Task 12: 81 file khác so với mốc task-00-base, đậm nhất ở components/ui/ (27).

Task 13: nộp DONE_WITH_CONCERNS, 5 mối lo. Phán:

Ruling 37 (mối lo 2 — phát hiện GIÁ TRỊ NHẤT của cả task, và nó bắt lỗi của TÔI):
  `frontend/index.html:8-10` vẫn còn ba thẻ Google Fonts nạp Inter. Tôi kiểm: bundle có 0 chữ
  "Inter", font thật nạp từ src/main.tsx qua @fontsource-variable. Tức ba thẻ đó hoàn toàn chết.
  NHƯNG: thẻ thứ ba là `<link rel="stylesheet">`, tức CHẶN RENDER. Nếu mạng PTSC chặn Google Fonts —
  đúng rủi ro spec đã nêu — thì trang treo chờ timeout.
  **Tôi đã tuyên bố sai trước đó**: sau khi chốt tự host font ở Task 6, tôi nói phụ thuộc Google Fonts
  CDN đã được gỡ và rủi ro "mạng PTSC chặn Google Fonts" được rút khỏi spec. SAI. Tôi chỉ gỡ `@import`
  trong CSS mà không hề kiểm index.html. Ba thẻ này sống sót qua trọn 13 task.
  Quyết định: gộp vào vòng sửa Task 13 (cùng loại nói dối mà task này tồn tại để dẹp, chỉ khác là nằm
  trong mã), cộng một ca test khoá lại trong cssNen.test.ts — đọc index.html, cấm `fonts.googleapis.com`
  và `fonts.gstatic.com`. Bắt buộc chạy npm test sau vì đụng frontend/.
  *Sai thì trả giá gì:* không sửa thì app treo khi tải trang trên chính mạng nó chạy, mà không test
  nào bắt được vì jsdom lẫn e2e đều không chặn mạng ngoài.

Ruling 38 (mối lo 4 — chỗ người thực thi tự nhận kém chắc chắn nhất): dòng 711 giờ nói
  `tailwind.config.ts` đã bị xoá, nhưng dòng 713 `Files:` vẫn kê nó — hai dòng CẠNH NHAU tự mâu
  thuẫn, và mâu thuẫn ấy do chính lượt sửa của ta tạo ra. Bỏ mục đó khỏi `Files:`. KHÔNG sửa các tên
  file khác trên cùng dòng (`Skeleton.tsx` đã đổi tên từ trước) — lệch có sẵn, không do ta gây, theo
  CLAUDE.md thì "nêu, đừng xoá".

Mối lo 1 (nút "Xuất PDF"/"chế độ trình bày" không tồn tại): người thực thi xử ĐÚNG. Tôi grep xác
  nhận không có nút nào như vậy trong frontend/src/. Chép nguyên văn spec vào TODOS sẽ tạo đúng loại
  phát biểu sai mà task này tồn tại để dẹp.
Mối lo 3 (tự mở rộng sửa dòng 281 và cụm "(kế thừa DESIGN.md)" ở 666): ĐÚNG, giữ. Cụm "kế thừa
  DESIGN.md" chính là phát biểu lạc hậu THẬT (Ruling 32 đã chỉ ra), sửa thành "(theo gói handoff,
  frontend/src/index.css)" là chính xác.
Mối lo 5 (5 mục mới thiếu "Depends on"): không phải vấn đề. Đếm TODOS.md: 11 mục có
  What/Why/Context/Effort/Priority nhưng chỉ 6 có "Depends on" — trường đó TÙY CHỌN theo quy ước của
  chính file.

Task 13 vòng sửa 1: xong, tôi tự kiểm:
  - `frontend/index.html` giờ chỉ còn dòng `<link rel="icon" ... favicon.svg>`. Ba thẻ Google Fonts
    đã sạch.
  - Ca khoá mới đọc CHÍNH file nguồn `frontend/index.html` (không phải dist/) và cấm cả
    `fonts.googleapis.com` lẫn `fonts.gstatic.com` — đúng chỗ cần khoá, vì dist/ chỉ là bản sao.
  - npm test **848/848** (847 + 1 ca mới), sạch, không cảnh báo.
  - Diff task-12→task-13: 165 dòng, đúng 5 file (DESIGN.md, TODOS.md, hseq-platform-mvp-fm01.md,
    frontend/index.html, cssNen.test.ts).
  - Đang chạy lại e2e ở nền vì index.html đổi nghĩa là hiện vật build đổi.
  - e2e chạy lại sau khi đổi index.html: **40/40 xanh, exit 0**. Hiện vật build vẫn lành.

Dựng gói cho vòng review TOÀN NHÁNH (làm trong lúc chờ review Task 13):
  Diff đầy đủ task-00-base → task-13: 15.841 dòng / 81 file — quá lớn, và hơn nửa là rác phụ thuộc.
  Tách ra có CĂN CỨ chứ không đoán:
  - `package-lock.json` = 8.884 dòng (56% toàn diff), thuần churn phụ thuộc.
  - 21 component shadcn: tôi so `snap/task-05` (lúc CLI vừa sinh) với `snap/task-13` và xác nhận
    **tất cả còn nguyên BYTE** — không ai sửa lén mã vendor. Đây là phép kiểm chưa ai làm, và nó
    cho phép loại chúng khỏi gói review một cách chính đáng.
  Kết quả: `review/LAT-0-CHINH.diff`, 4.159 dòng / 59 file.

  Tôi tự bắt một lỗi ở bước này: bộ lọc đầu của tôi định nghĩa vendor = "không đổi từ task-05", và nó
  quét nhầm `cascade.ts` cùng `DialogXacNhan.test.tsx` — hai file MÌNH viết, chỉ tình cờ không đổi từ
  task-05. Loại chúng đi thì người review cuối không bao giờ thấy 676 dòng mã tự viết. Đã siết lại
  điều kiện: tên viết thường + đúng một dấu chấm + đuôi .tsx + nguyên si từ task-05. Rồi kiểm ngược
  để chắc hai file đó nằm TRONG gói.

### Review Task 13 → Approved, không có Critical/Important chặn. Bốn phán quyết đóng đuôi.

Ruling 39: `Depends on` trong TODOS.md là trường BẮT BUỘC, không phải tùy chọn — thêm cho cả 5 mục mới.
  Đây là tôi ĐẢO phán quyết trước của chính mình. Lần trước tôi đếm trên file ĐÃ có 5 mục mới, ra 6/11
  có `Depends on`, rồi kết luận "trường này tùy chọn" và dặn implementer như vậy. Suy luận vòng: tôi
  suy ra quy ước của file từ một tập đã bị chính 5 mục đang xét pha loãng. Đo lại trên `snap/task-12`
  (trước Task 13): 6 mục / 6 mục đều có — 100%. Reviewer đúng, tôi sai.
  Giá nếu sai: 5 dòng thừa trong TODOS.md, xoá trong một phút.

Ruling 40: sửa VẾ SAU của dòng 711 (`fm01.md`, mục TD1) cho khớp vế trước — cùng một câu.
  Brief khoanh dòng 711 rất hẹp (chỉ nửa nói về `tailwind.config.ts`), nên implementer dừng đúng chỗ.
  Nhưng kết quả là MỘT câu mà nửa đầu nói hiện trạng ("`tailwind.config.ts` đã bị xoá ở Lát 0") còn
  nửa sau vẫn "palette stone + cyan + 3 token ngữ nghĩa, Inter subset vietnamese". Một câu tự cãi
  nhau còn lừa người đọc hơn là để nguyên cả dòng cũ. Đã đổi thành "bộ token shadcn/radix-nova,
  primary navy `#203878`), Exo 2 + Geist Mono tự host + tnum" — `tnum` giữ vì vẫn sống thật
  (`index.css:77,79,189`). Giá nếu sai: một dòng doc.

Ruling 41: ranh giới của lệnh "viết đè cho đúng hiện trạng" — BIÊN BẢN CÓ NGÀY thì giữ, CHECKLIST SỐNG
  và câu mô tả hiện trạng thì đè.
  Quét nốt `fm01.md` còn 3 chỗ nhắc cyan/Inter: dòng 606 (bảng quyết định D19), 622 (`Bố cục từng màn
  (Pass 1: 4/10 → 9/10)`), 647 (`Chế độ form theo trạng thái × vai (D14)`). Cả ba nằm dưới heading tự
  đánh dấu là biên bản của buổi review 2026-09-09 (đầu file: "Generated by /office-hours on 2026-09-09
  … 27 quyết định D1 đến D27"). Đè lên đó là sửa biên bản, làm nó thành bản ghi của một buổi họp chưa
  từng diễn ra. Còn 666/667/706/711/713 là câu mô tả hiện trạng và mục `- [ ]` còn mở ("checkbox as
  you ship") — đúng đối tượng để đè, và đã đè.
  Giá nếu sai: ba dòng trong `fm01.md` mô tả giao diện tiền-redesign; spec Lát 1–8 mới là nguồn của
  các màn đó nên không ai đọc ba dòng này để dựng màn.

Ruling 42: khẳng định "cyan chỉ còn sống trong `@keyframes flash-bg`" là SAI — sửa ở cả hai chỗ.
  Tôi viết câu đó ở `index.css:23` lẫn `TODOS.md:61`. Đọc thật keyframe: `index.css:83` là
  `from { background: #c1e1f7 }` — tint sky, KHÁC cyan. `grep -rn '3ba6f1' frontend/src/` trả về đúng
  MỘT dòng: chính cái comment đang khẳng định nó còn sống ở đâu đó. Câu tự bác bỏ mình.
  Sự thật: cyan `#3ba6f1` không còn ở bất kỳ đâu trong `frontend/src`. Đã sửa cả hai.
  (`flash-bg` hardcode `#c1e1f7`/`#fff` thay vì `var(--sky)` vẫn là khoản hoãn có chủ ý từ trước,
  không đụng ở đây.)

Task 13: complete

### Vòng review TOÀN NHÁNH đã giao (model mạnh nhất)

Dựng lại gói trước khi giao, vì 4 ruling trên vừa sửa thêm `TODOS.md`, `fm01.md`, `index.css` SAU khi
gói cũ được dựng. Ảnh chụp mới `snap/task-13-final` (120 file).
`review/LAT-0-CHINH.diff` = **4.163 dòng / 59 file** (gói cũ 4.159 — chênh 4 dòng đúng bằng phần vừa sửa).
Chạy lại bộ lọc vendor trên ảnh mới: vẫn đúng 21 component shadcn nguyên byte từ `snap/task-05`, và
kiểm ngược lần nữa để chắc `cascade.ts`, `nut.ts`, `ui.test.tsx`, `DialogXacNhan*`, `SkeletonDong.tsx`
đều NẰM TRONG gói.
`npm test` sau bốn sửa đổi: **848/848**, build sạch, font Exo 2 + Geist Mono vào `dist` đúng.

Soát read-only phần chồng yêu sẽ phải tự chạy (tôi bị cấm chạy): index vẫn giữ 3 đường cũ
(`Dialog.tsx`, `Dialog.test.tsx`, `Skeleton.tsx`), đĩa có 5 đường mới, `core.ignorecase=true` nên git
không tự thấy. Quét toàn bộ hợp (index ∪ đĩa) của `frontend/src`: **đúng hai cặp đụng hoa/thường**,
cả hai chính là hai cặp đã biết, không phát sinh cặp mới. HEAD vẫn `ee3a76f`, index sạch.

### Review toàn nhánh trả: 1 Critical · 5 Important · 9 Minor. Phán quyết 43–50.

Tôi tự kiểm chứng từng mục trước khi xử, không nhận lời reviewer làm sự thật.

Ruling 43: I1 ĐÚNG, và lỗi nằm ở KẾ HOẠCH CỦA TÔI. Spec thắng.
  Tự tính OKLab→sRGB: `text-muted-foreground` (#79716b) trên `bg-muted` (#f5f5f4) = **4,41:1**, dưới
  AA 4,5:1. `text-sec` (#57514d) trên nền đó = 7,14:1. Rồi tìm ra spec §4 dòng 198 đã cấm sẵn ĐÚNG
  cặp này từ đầu: "`text-muted-foreground` trên `bg-muted` = 4,39:1 → dùng `text-sec`".
  Mà B-ter của tôi lại viết các `<th>` trần nhận `text-muted-foreground` là "đúng lối TableHead của
  shadcn, đó là ý đồ thiết kế". Spec là thẩm quyền ràng buộc, kế hoạch chỉ là lập luận từ spec — nên
  câu đó của tôi bị phủ quyết. Đã vá B-ter (ghi luật đúng + vì sao lỗi chỉ trúng một nửa: phần tử tự
  khai màu như `GroupHeader.tsx:27` được luật "bản nở chỉ lấp chỗ trống" che, `<th>` trần thì không),
  và giao sửa 15 dòng sang `text-sec`.
  Tôi cũng soát nốt BA ngoại lệ AA còn lại của spec §4 mà reviewer không đụng: badge trắng trên
  `--warning` (không có ca nào trong Lát 0), `#a8a29e` (còn ở `Sidebar.tsx:31` nhưng có 3 dòng lý do
  và chính spec đã hẹn nó biến mất khi Lát 8 dựng 3 màn quản trị), `SidebarGroupLabel` (mã vendor,
  đang đúng `text-sidebar-foreground/70`). Chỉ #1 vỡ.
  Giá nếu sai: 15 tiêu đề cột đậm hơn thiết kế gốc — nhưng spec bắt, nên không sai được.

Ruling 44: I4 "sonner chưa thay vào" là SỰ THẬT nhưng KHÔNG phải lỗi thực thi — lỗi ở MÔ TẢ CỦA TÔI.
  Tôi viết trong dispatch rằng Lát 0 "thay Toast tự viết bằng sonner". Sai phạm vi: "Toast → sonner"
  là quyết định của cả bản redesign 12 màn, không phải nội dung Lát 0. Bằng chứng ngược lại nằm ngay
  trong Global Constraints: `--toast-cao` và cơ chế đo trong `Toast.tsx` là BẤT BIẾN không được phá.
  Lát 0 CÀI sonner (có trong package.json + 21 component vendor), không NỐI. Kiểm thêm: `<Toaster/>`
  không được render ở đâu cả — mã chết, không rủi ro chạy.
  Cái bẫy reviewer nêu (`useTheme()` không provider, thiếu 4 điều kiện spec §6) là thật nhưng thuộc
  lát nối sonner. Ghi lại để lát đó không giẫm.
  Giá nếu sai: nếu sonner đáng lẽ thuộc Lát 0 thì một lát sau phải làm — nhưng bất biến `Toast.tsx`
  chứng minh là không.

Ruling 45: I5 — sửa rào chắn hoa/thường và CỐ Ý GIAO LẠI CÂY CÓ MỘT CA ĐỎ.
  `casingScan.ts` liệt kê file bằng `readdirSync` trên đĩa. Trên macOS/APFS hai đường chỉ khác hoa
  thường KHÔNG THỂ cùng tồn tại trên đĩa — nên ca "cây nguồn thật" về cấu trúc là không thể đỏ, xanh
  vĩnh viễn. Trong khi repo ĐANG có đúng va chạm đó ở git index (`Dialog.tsx` vs `dialog.tsx`), tức
  rào chắn đang xanh đúng lúc thứ nó sinh ra để chặn đang xảy ra.
  Sửa = đọc hợp git index ∪ đĩa. Hệ quả: ca đó sẽ ĐỎ, và tôi KHÔNG thể làm nó xanh — chữa cần ghi
  vào git index, việc mà chủ dự án cấm tôi làm.
  Tôi chọn giao lại 847 xanh / 1 đỏ thay vì 848 xanh, và bắt thông điệp thất bại in ra nguyên văn
  lệnh chữa. Lý do: chủ dự án là người commit, nên một ca đỏ có thông điệp tự giải thích là cái chốt
  tốt hơn nhiều so với một dòng ghi chú trong chat sẽ trôi mất. Cây xanh lúc này là cây nói dối.
  Giá nếu sai: chồng yêu mở ra thấy đỏ và tưởng bản redesign hỏng — nên tôi phải nói thật rõ trong
  báo cáo, và thông điệp test phải tự giải thích được.

Ruling 46: M3 — bốn số hiệu lát SAI, do chính tôi viết cách đó hai mươi phút ở Ruling 39.
  Tôi đoán số lát khi viết 5 dòng `Depends on` mà không tra spec §7. Tra rồi: `/reports/:id` là Lát 7
  (không phải 2), `/status` Lát 5 (không phải 4), `/dashboard` Lát 4 (không phải 3). Đã sửa.
  Đáng ghi: Task 13 sinh ra để tài liệu thôi phát biểu sai, và tôi đưa vào bốn phát biểu sai mới.

Ruling 47: M5 — CHÚ THÍCH khối `.dark`, không xoá.
  Reviewer đưa hai lựa chọn. Chọn chú thích vì khối CLI là điểm khởi đầu hữu ích cho lát làm dark
  mode, còn xoá thì mất nó mà chẳng được gì (không có gì gắn class `.dark` nên khối này đang trơ).
  Đã bổ sung vào mục TODOS hai sự thật còn thiếu: `--sidebar-primary` là TÍM, và tám token của gói
  (`--success*`, `--warning*`, `--destructive-bg`, `--sec`, `--dark-panel*`, `--on-dark`, `--sky`)
  hoàn toàn không được khai lại.
  Giá nếu sai: một khối comment ai đó xoá sau này.

Ruling 48: M8 rộng hơn reviewer nói — SÁU chỗ trong kế hoạch ghi "bốn @import", không phải một.
  Sự thật lấy từ mã: `index.css` có ĐÚNG BA. Đã sửa dòng 51, 742, 755, 818, 820, 1570.
  GIỮ NGUYÊN dòng 18 — chỗ "bốn" ở đó là cố ý trích lỗi của README gói thiết kế ("chỗ lạc hậu thứ
  sáu của nó"), sửa đi là xoá mất một phát hiện.
  Còn `cssNen.test.ts:6` cũng ghi "bốn" chọi với dòng 23 ghi "ba" — HOÃN đến khi implementer trả
  file, vì nó đang sửa đúng file đó (mục 3 và 6 của brief). Tránh sửa song song.

Ruling 49: M6 — thêm nhóm thứ ba vào B-bis: CHÍN màu ngữ nghĩa cũng đổi giá trị.
  Đối chiếu `snap/task-00-base/frontend/tailwind.config.ts` (bản gốc trước khi xoá) với `index.css`
  hôm nay, tự tính hex cả chín. Reviewer đưa 8 hàng và mọi giá trị cũ đều khớp chính xác; tôi thêm
  hàng thứ chín là `sec` (#78716c → #57514d) vì chính nó là gốc của M2.
  Bắt thêm một cái bẫy reviewer không nêu: màu `draft` cũ (#57534e) gần như TRÙNG `--sec` hôm nay
  (#57514d) — chip "Nháp" đã có thể giữ nguyên giá trị nếu dùng `text-sec`, nó đổi vì được ánh xạ
  sang `--secondary-foreground` (#1c1917). Cả hai đạt AA nên là lựa chọn thẩm mỹ. Ghi để Lát 6 quyết
  một lần thay vì đo lại.

Ruling 50: M4 và M9 — hoãn, có lý do đo được.
  M4: 5 cảnh báo `oxlint` mới đều nằm trong 21 component vendor đã chứng minh nguyên byte. Sửa mã
  vendor là phá chính căn cứ đã cho phép loại chúng khỏi gói review.
  M9: `animate-pulse`/`animate-spin` chỉ vào bundle từ component vendor KHÔNG được render. Tôi kiểm
  `SkeletonDong.tsx` — nó tự viết, tĩnh, không dựng trên `ui/skeleton.tsx`, và chính file đó đã ghi
  sẵn kỷ luật về trap comment. Bất biến "`.flash` là chuyển động duy nhất" còn nguyên. Đây là byte
  thừa, không phải hành vi.

### Vòng sửa cuối: DONE_WITH_CONCERNS. Tôi tự kiểm + xử 2 mục treo.

Tự kiểm trạng thái cuối, không nhận báo cáo làm sự thật:
- `grep` phần tử vừa `bg-muted` vừa `text-muted-foreground`: **rỗng**. Cặp trượt AA đã hết.
- 16 dòng nay dùng `text-sec` cạnh `bg-muted`.
- 21 component vendor: `cmp` từng file với `snap/task-05` — **còn nguyên byte**, không ai đụng.

Ruling 51: brief của tôi ghi "15 dòng" nhưng liệt kê 16 — tôi cộng sai. Implementer đi theo NỘI DUNG
  chứ không theo con số, nên vẫn đúng. Cùng loại với M3: tôi lại đưa một con số không kiểm vào brief.
  Lần thứ ba trong lát này. Bài học ghi ra đây: con số nào tôi viết mà không chạy lệnh đếm thì phải
  coi là chưa đo.

Ruling 52: nhận phát hiện phụ của implementer — có luật CSS chết thứ BẢY, ngoài bảng sáu của mục 5.
  `AppShell.tsx:24` (MÃ SẢN PHẨM, không phải test) có comment gõ `pb-[var(--toast-cao)]`, trong khi
  lớp thật ở dòng 28 là `pb-[calc(1.5rem+var(--toast-cao))]`. Hai lỗi trong một: comment nói sai mã
  làm gì, và nó đẻ ra một luật CSS chết trong bundle.
  Implementer báo mà không tự sửa vì ngoài 8 mục được giao — đúng kỷ luật phạm vi, và tôi ghi nhận.
  Tôi sửa: thay bằng tên lớp THẬT. Vì lớp đó đang được mã dùng ở dòng 28, viết nó vào comment KHÔNG
  đẻ luật mới — vừa hết luật chết, vừa hết câu sai, không phải bẻ chữ.
  Đã kiểm `pb-[var(--toast-cao)]` không còn xuất hiện ở đâu khác trong `src/`.

Ruling 53: xử nốt `cssNen.test.ts:6` đã hoãn ở Ruling 48 — sửa "bốn @import" thành "ba".
  File tự mâu thuẫn: dòng 6 ghi bốn, dòng 23 ghi ba, `index.css` có đúng ba. Hoãn lúc đó là để tránh
  sửa song song với implementer; nó trả file rồi nên làm luôn.

Implementer tự bắt 2 lỗi của chính nó trước khi báo cáo (dùng `//` trong CSS — không hợp lệ; và
`JSON.parse` trên `tsconfig.app.json` vốn là JSONC có comment, lại còn chứa `"@/*"` tự mang `/*`).
Cả hai đã sửa và tự kiểm bằng đột biến. Ghi nhận: nó kiểm bằng cách phá rồi xem có đỏ không, đúng
thứ brief yêu cầu.

Nghiệm thu sau vòng sửa (tôi tự chạy, tự đo):
- `npm test`: **848 xanh / 1 đỏ**. Ca đỏ DUY NHẤT là `casingScan.test.ts > cây nguồn thật`, đúng ca
  đã cố ý làm cho đỏ được (Ruling 45). Output sạch, không cảnh báo build mới.
- Thông điệp ca đỏ đạt yêu cầu: nó liệt kê đúng hai nhóm va chạm (`Dialog.tsx`↔`dialog.tsx`,
  `Skeleton.tsx`↔`skeleton.tsx`) VÀ in nguyên văn lệnh chữa. Người đọc output biết ngay phải làm gì.
- Bundle: 7 luật CSS chết đã hết sạch (`bg-white`, `bottom-24`, `flex-row-reverse`, `grid-cols-2`,
  `pb-[var(--toast-cao)]`, `text-[Npx]`, và luật thứ bảy). 4 lớp mã thật đang dùng vẫn còn nguyên,
  trong đó `pb-[calc(1.5rem+var(--toast-cao))]` còn đúng 1 lượt — nên bố cục không vỡ.
  (Lần kiểm đầu của tôi cho kết quả sai: mẫu grep không tính dấu `\` thoát trong tên lớp đã build.
  Tự bắt và đo lại bằng regex có xét ký tự thoát.)
- Kiểm bất biến "không đổi DOM, không đổi chữ" trên diff vòng sửa (457 dòng / 17 file): với mọi file
  SẢN PHẨM, đếm `+` và `-` từng file — sáu file cân chằn chặn (chỉ đổi tên lớp tại chỗ). Ba file lệch
  và cả ba đều có lý do không đụng DOM: `casingScan.ts` (+37/-2, module chỉ chạy trong Node, không
  bao giờ vào bundle trình duyệt), `index.css` (+5/-0, thêm comment cho khối `.dark`), `Sidebar.tsx`
  (+7/-6 — tôi mở tận mắt: hai khối comment, không một dòng JSX nào đổi).
  Rồi bóc mọi text node trong diff: **chữ hiển thị thêm = rỗng, chữ hiển thị bỏ = rỗng.**
- Tôi suýt đọc nhầm một kết quả e2e: gọi `npx playwright test` từ `frontend/` trả "No tests found"
  NHƯNG THOÁT 0. Config nằm ở `e2e/playwright.config.ts`, phải chạy từ `e2e/`. Một lệnh sai chỗ mà
  thoát 0 là đúng loại bẫy khiến người ta báo xanh cho một phép thử chưa từng chạy.
- **e2e: 40/40 xanh** (chạy lại từ đúng `e2e/`, 1,1 phút). Đây là bằng chứng mạnh nhất cho bất biến
  "không đổi chữ nghĩa, không đổi DOM": toàn bộ `getByRole` / `getByText` của bộ e2e còn trúng
  nguyên sau khi 16 tiêu đề cột đổi màu và bảy comment bị viết lại.

### Re-review có phạm vi: ĐẠT KÈM SỬA. 8/8 mục đủ, không hồi quy, không đẻ lớp CSS chết mới.

Hai vấn đề nó nêu đều nằm ở HỒ SƠ, không ở mã — và cả hai truy về một lỗi của tôi.

Ruling 54: lỗi đóng gói — `FIX-CUOI.diff` có biên RỘNG HƠN điều tôi khai với người re-review.
  Tôi dựng nó từ `task-13-final` → `fix-cuoi`, nên nó chứa cả phần implementer làm LẪN bốn chỗ tôi
  tự sửa xen vào (`AppShell.tsx:24`, `cssNen.test.ts:6`, bốn số hiệu lát, đoạn dark mode trong
  TODOS). Tôi giới thiệu nó là "diff của vòng sửa 8 mục". Người re-review đọc đúng như tôi khai, nên
  kết luận báo cáo của implementer "tự mâu thuẫn với diff của chính nó" và "sửa 3 chỗ ngoài phạm vi".
  Cả hai suy luận đều hợp lý từ thứ tôi đưa; sai là ở thứ tôi đưa.
  Đây là cùng một loại sai với bộ lọc vendor tôi tự bắt trước đó: **gói review có biên không khớp
  với điều tôi khai về nó.** Hai lần trong một lát. Bài học: khi dựng gói review, khai biên của nó
  bằng cách LIỆT KÊ file kèm nguồn thay đổi, đừng mô tả bằng một câu.
  Đã kiểm lại mã: `AppShell.tsx:24` đúng, literal `pb-[var(--toast-cao)]` không còn ở đâu trong
  `src/`. Đã ghi chú đính chính vào cuối `fix-cuoi-report.md` để hồ sơ không đổ oan cho người sửa —
  nó báo mà không tự sửa là ĐÚNG kỷ luật phạm vi, không phải thiếu sót.
  Giá nếu sai: không có; mã đã được kiểm độc lập, chỉ câu chữ hồ sơ được chỉnh.

Ruling 55: KHÔNG xoá workspace của kế hoạch, và KHÔNG chạy `finishing-a-development-branch`.
  Khuôn mẫu skill bảo review cuối sạch thì xoá workspace rồi đóng nhánh. Ở đây cả hai bước đều
  không áp dụng được:
  - Đóng nhánh nghĩa là commit/merge. Chủ dự án cấm tuyệt đối commit. Không có gì để đóng.
  - Vì không commit, git KHÔNG có lịch sử của lát này. Toàn bộ vết review nằm trong workspace: 15
    ảnh chụp, các diff theo task, ledger 55 phán quyết. Xoá đi là chủ dự án mất sạch đường lần lại
    trước cả khi kịp xem. Ledger cũng là bản đồ hồi phục nếu phiên này bị nén ngữ cảnh.
  Giữ lại. Nó nằm trong `.superpowers/` đã gitignore nên không bẩn cây làm việc.

### LÁT 0 ĐÓNG.

Trạng thái bàn giao đã tự kiểm: `npm test` 848 xanh / 1 đỏ có chủ đích · e2e 40/40 · không đổi một
chữ hiển thị · không đổi DOM · 21 vendor nguyên byte · HEAD `ee3a76f`, index sạch, không một commit.
Còn đúng MỘT việc của chủ dự án: chạy lệnh `git rm --cached …` mà ca test đỏ đang in ra.

---

## LÁT 4 — Dashboard SKATMT (quy trình nhẹ, không subagent)

Chủ dự án chọn bỏ bộ máy SDD nặng, dựng thẳng từng màn rồi tự kiểm và báo cáo. Ghi ở đây để hồ sơ
liền mạch với 55 phán quyết phía trên.

**File mới:** `features/dashboard/BangChiSo.tsx`, `BaoPhuKy.tsx`, `TheSoLieu.tsx`.
**Viết lại:** `pages/Dashboard.tsx`. **Sửa:** `features/dashboard/UnitsTable.tsx`, `index.css`,
`pages/Dashboard.test.tsx`, `app/routes.test.tsx`, `e2e/demo-path.spec.ts`,
`specs/…-shadcn-design.md`.

Ruling 56: sáu KPI CHIA theo ngữ nghĩa, không theo danh sách vị trí.
  Panel tối nhận `kpis.filter(mục-tiêu-bằng-0)`, ba thẻ dưới nhận PHẦN CÒN LẠI; mỗi nhóm giữ
  nguyên thứ tự mảng API. Bản đầu tôi viết là mỗi component tự tra mã của mình — một chỉ tiêu mới
  do backend thêm sẽ lặng lẽ không hiện ở đâu cả, và `B-1.4` bị vẽ hai lần. Cách chia này cũng làm
  ca "render đúng thứ tự mảng API (carry C2, N32)" xanh mà không phải sửa ca.
  Giá nếu sai: một chỉ tiêu mục-tiêu-0 mới sẽ rơi xuống nhóm khối lượng thay vì lên panel.

Ruling 57: panel ba ô, KHÔNG bốn như mockup.
  Ô thứ tư của mockup là "Giờ công an toàn không LTI" (B-1.5). `/dashboard/summary` không trả chỉ
  số đó — `_KPI` của backend đúng sáu mã. Cộng dồn `gio_an_toan_tu_lti_cuoi` từng đơn vị không ra
  con số đó (mỗi đơn vị đếm từ mốc LTI riêng). Ba ô thật hơn bốn ô có một ô bịa. Muốn đủ bốn thì
  phải thêm KPI ở backend.
  Giá nếu sai: panel hụt một ô so với bản vẽ cho tới khi backend bổ sung.

Ruling 58: bỏ hẳn phần "so với kỳ trước".
  Bản đầu tôi cho Dashboard gọi thêm `/dashboard/summary` của kỳ liền trước để tính lệch. Ba cái
  giá: thêm một lượt mạng mỗi lần mở trang trên Render free; ~60 dòng logic lệch ở hai component;
  và nó phá ca M-01 (ca ấy đếm request THEO endpoint để chứng minh "không thử lại 4xx", hai lượt
  gọi hợp lệ khác kỳ cũng làm ca đỏ). Không spec hay ca nào đòi phần lệch. YAGNI.
  Giá nếu sai: mất một thông tin bối cảnh đẹp; thêm lại được bất cứ lúc nào.

Ruling 59: giữ H1 "Dashboard SKATMT" và giữ `Coverage.tsx`, trái với dự đoán của spec §9.
  Spec đoán h1 sẽ đổi thành "Tháng 8 · 2026" và dòng bao phủ sẽ bị thay. Dựng xong mới thấy cả hai
  đều nên giữ: h1 là danh tính trang (breadcrumb + trình đọc màn hình + nhánh 403), còn `Coverage`
  là chỗ DUY NHẤT nói "đơn vị nào chưa nộp" bằng TÊN. Đã viết đè hai dòng đó trong spec.
  Giá nếu sai: lệch bản vẽ ở phần chữ tiêu đề.

Ruling 60: `--on-dark` đổi L 0.76 → 0.79, và thêm token `--danger-on-dark`.
  Đo trên `--dark-panel`: `--on-dark` cũ 4,16:1 (trượt AA cho nhãn 12px), `--destructive` 1,74:1
  (gần như vô hình). Giá trị mới: 5,06:1 và 5,40:1. Trước Lát 4 `--on-dark` chưa được dùng làm màu
  chữ ở đâu nên đổi giá trị không lay chỗ nào. CÙNG LỚP LỖI với vụ 16 `<th>` ở 4,41:1 của Lát 0 —
  lần đó là bản nở áp nhầm, lần này là token chưa ai đo vì chưa ai dùng.
  Giá nếu sai: hai màu nhạt hơn bản vẽ một chút.

Ruling 61: `soKpi()` và `div.overflow-auto` trong e2e là ĐỊNH VỊ, sửa được; không nới khẳng định.
  Ba ca e2e đỏ. `soKpi` đếm con thứ mấy của ô — đơn vị đo nay cùng dòng với số nên nó đọc
  "63 số vụ". `div.overflow-auto` trần lấy phần tử ĐẦU TIÊN của tài liệu, mà `SidebarContent` của
  shadcn (Lát 1) mang đúng lớp đó và đứng trước — phép đo "khung bảng có cuộn không" đã đo nhầm
  khung sidebar. Chỗ thứ hai là lỗi tiềm ẩn CÓ SẴN trong ca test (Locator lọc `has: table`, chuỗi
  `evaluate` thì không) mà Lát 1 làm nó lộ ra; báo cáo "e2e 40/40" sau Lát 1 do đó đã ĐO THIẾU.
  Sửa định vị, giữ nguyên mọi vị ngữ.
  Giá nếu sai: không; hai bên nay dùng chung một hằng, lệch lại sẽ thấy ngay.

**Tự kiểm:** `npm test` 849 xanh / 1 đỏ có chủ đích (`casingScan`, chờ lệnh `git rm --cached`) ·
e2e 40/40 · `tsc -b` sạch · `oxlint` không thêm cảnh báo mới · HEAD `ee3a76f`, không một commit.

**Nợ đã ghi, chưa xử:** `ui/Tile.tsx`, `features/dashboard/KpiTile.tsx` và luật `.flash` trong
`index.css` nay không còn ai gọi (Dashboard là nơi duy nhất dùng). Chưa xoá: `Tile` là nguyên thuỷ
dùng chung, các lát 5/6/8 có thể cần. Nếu hết lát 8 vẫn không ai gọi thì xoá cả ba cùng bộ test của
chúng.

---

## LÁT 7 — Form nhập báo cáo 53 dòng (quy trình nhẹ, không subagent)

**Sửa:** `features/report/ReportForm.tsx`, `pages/ReportDetail.tsx`, `components/AppShell.tsx`,
`app/routes.test.tsx`. Không dựng file mới — màn này đã có đủ hành vi, chỉ thiếu chỗ để nhìn.

Ruling 62: đây là lát SỬA BỀ MẶT, không dựng lại.
  `ReportForm.tsx` 1045 dòng, bộ test của nó 3450 dòng khoá từng ô một. Viết lại là đánh đổi một
  buổi làm việc lấy rủi ro phá hành vi đã đo. Chỉ đụng ba thứ thật sự hỏng trên màn hình: vệt
  breadcrumb lặp, cột bị cắt, và 53 ô ghi chú viền rỗng.
  Giá nếu sai: màn này giống bản vẽ ít hơn ba màn kia.

Ruling 63: bề rộng cột đặt trên BẢNG, không đặt trên từng cột.
  Bảy cột tự khai bề rộng cứng cộng lại 1088px, trong khi chỗ trống thật ở 1280px chỉ 800px —
  nên ở đúng viewport demo, cột "Cộng dồn" nằm ngoài tầm nhìn: người nhập đổi một số rồi KHÔNG
  THẤY con số cộng dồn vừa đổi. Nay hai cột chữ co giãn theo %, ba cột số 100px, và `min-w-[700px]`
  đặt một lần trên `<table>`.
  Giá nếu sai: bốn chỉ tiêu có tên dài nhất xuống hai dòng.

Ruling 64: dưới 1280px mục lục xuống thành DẢI TRÊN bảng, không ẩn đi.
  Ở 1024px (đúng 1280 xem ở 125%, viewport `zoom-125` của bộ e2e) chỗ trống chỉ 720px; cắt thêm
  176px cho cột mục lục thì bảng còn 528px và hai cột phải nằm ngoài tầm nhìn — đúng lúc người
  trình bày phóng to cho dễ đọc thì lại mất cột. Đã cân nhắc `hidden xl:block` và BỎ: jsdom không
  nạp CSS nên ca "mục lục đủ 11 link" sẽ xanh vì một lý do không tồn tại trên trình duyệt. Dải hẹp
  là MỘT dòng cuộn ngang, không phải khối tự xuống dòng — khối ba dòng ăn ~90px chiều cao ở đúng
  viewport 640px đang thiếu chỗ nhất.
  Giá nếu sai: ở màn hẹp phải cuộn dải mục lục để tới nhóm cuối.

Ruling 65: `ReportDetail` bỏ vệt breadcrumb, đổi thành NÚT QUAY LẠI.
  Từ Lát 1, thanh đầu trang của AppShell đã có breadcrumb — màn này hiện hai vệt chồng nhau. Vế
  sau của vệt cũ ("<đơn vị> · <kỳ>") lặp đúng chữ của `<h1>` ngay dưới nó. Giữ nguyên phần đi theo
  QUYỀN (người duyệt về "Chờ duyệt", người nộp về "Báo cáo của đơn vị") vì đó là hành vi đã đo.
  Đồng thời breadcrumb của AppShell cho `/reports/:id` đổi `Duyệt báo cáo` → `Nghiệp vụ`: nhãn
  trang danh sách đổi theo quyền, viết cứng một nhãn là nói sai với người chỉ có quyền nộp.
  Giá nếu sai: mất một cấp điều hướng; nút quay lại vẫn còn.

Ruling 66: ca `routes.test.tsx` đổi MỐC NEO, không nới khẳng định.
  Ca ấy chứng minh route dừng ở `ReportDetail` (không phải chỉ `ReportForm`) bằng chuỗi
  "<đơn vị> · <kỳ>" của vệt breadcrumb vừa bỏ. Neo mới: nút quay lại — thứ chỉ `ReportDetail` dựng
  — khoanh trong `[data-slot="noi-dung"]` vì nhãn trùng với một link của Sidebar.
  Giá nếu sai: không; vị ngữ giữ nguyên, chỉ đổi chỗ đo.

**Đã cân nhắc và KHÔNG làm:** bỏ chữ "Nháp" lặp ở dòng meta và chip (ca 1763 nói rõ "đúng như
thiết kế", `getAllByText('Nháp')` đếm đúng 2); đổi `🔒 tự tính` sang icon lucide (ca 481 khoá
nguyên văn chuỗi đó); thêm `hover:` cho dòng bảng (dòng đã có `focus-within:bg-background`, thêm
hover là hai luật nền tranh nhau trong cùng cascade).

**Tự kiểm:** `npm test` **850/850 xanh** · e2e **40/40** · `tsc -b` sạch · `oxlint` không thêm cảnh
báo mới · HEAD `ee3a76f`, không một commit.

**Ghi nhận:** rào chắn hoa/thường (`casingScan`) nay XANH — chủ dự án đã chạy lệnh `git rm --cached`.
73 file đang nằm ở vùng stage, chưa commit.

---

## LÁT 3 — Đăng nhập (quy trình nhẹ, không subagent)

**Sửa:** `pages/Login.tsx` (chỉ phần hiển thị), `index.css`, `app/cssNen.test.ts`.
Không đụng một dòng logic nào: `thuGoiHealth`, `duongDanNoiBo`, `dieuHuongSauDangNhap`, chuỗi
`POST /auth/login → GET /auth/me`, bộ đếm 3s và ba lượt thử `/health` giữ nguyên từng ký tự.

Ruling 67: KHÔNG dựng bộ đếm "giờ công an toàn" của bản vẽ.
  Mockup mục 01 có một con số lớn ở nửa trái. Trước khi đăng nhập, trang này không có quyền đọc
  bất kỳ số liệu nào — `/health` là endpoint DUY NHẤT gọi được và nó chỉ trả trạng thái máy chủ.
  Một con số bịa ở màn đầu tiên của một hệ thống AN TOÀN là thứ tệ nhất có thể đặt ở đó. Thay bằng
  ba câu nói đúng về chính hệ thống. Muốn có bộ đếm thì phải thêm một endpoint công khai.
  Giá nếu sai: nửa trái ít bắt mắt hơn bản vẽ.

Ruling 68: nửa trái ẩn dưới `lg`, và `Wordmark` chỉ hiện khi nó ẩn.
  Dưới 1024px nửa tối chỉ còn là dải trang trí đẩy form xuống dưới nếp gấp. Ẩn nó thì màn hẹp mất
  dấu hiệu "đây là hệ của ai", nên `Wordmark` (chữ, nền sáng) hiện đúng lúc đó — hai nhãn hiệu
  loại trừ nhau, không bao giờ cùng hiện trên trình duyệt. Trong jsdom (không nạp CSS) cả hai cùng
  dựng, nhưng chúng là hai dạng KHÁC NHAU (ảnh `alt="PTSC"` và chữ), nên không ca nào bắt trùng.
  Giá nếu sai: màn hẹp thừa một logo.

Ruling 69: thêm `animate-spin` thì phải sửa luôn hợp đồng reduced-motion, và sửa luôn câu chữ.
  `index.css` viết "chuyển động DUY NHẤT của app" cho `.flash`. Vòng chờ mới làm câu đó SAI. Bản
  nở `animate-spin` của Tailwind KHÔNG tự sinh nhánh `prefers-reduced-motion`, nên nếu chỉ thêm
  lớp thì máy của người xin bớt chuyển động vẫn quay. Đã khai tay trong khối reduced-motion, viết
  đè câu chú thích thành "HAI chuyển động, và chỉ hai", và nới ca canh trong `cssNen.test.ts` để
  nó phủ CẢ HAI — nếu không, luật mới không có ai canh.
  Giá nếu sai: không; ca test giữ đúng cả hai vế.

Ruling 70: ba trạng thái thông báo dùng CHUNG một khe, khác nhau màu và icon.
  "Đang đánh thức" / "Không kết nối được" / lỗi đăng nhập trước đây là ba dòng chữ trần dưới nút.
  Ở màn đầu tiên của buổi demo (Render ngủ dậy) đây là thứ người trình bày phải đọc được từ xa.
  Một hằng `KHE_BAO` cho hình dạng, ba cặp màu/icon cho nghĩa.
  Giá nếu sai: khe thông báo cao hơn trước ~20px.

**Tự kiểm:** `npm test` **850/850 xanh** · e2e **40/40** · `tsc -b` sạch · `oxlint` 33 cảnh báo,
KHÔNG thêm cái nào mới (cảnh báo duy nhất ở `Login.tsx` là `duongDanNoiBo` vốn có, chỉ dời số dòng)
· HEAD `ee3a76f`, không một commit.

---

## LÁT 5 — Tình trạng nộp (`/status`)

Tệp đụng tới: `features/status/StatusGrid.tsx`, `pages/Status.tsx`, `pages/Status.test.tsx`,
`features/dashboard/useSummary.ts`, `components/Sidebar.tsx`, `components/AppShell.test.tsx`,
`app/routes.test.tsx`, `app/queryClient.test.tsx`.

Ruling 71: `260px` / `104px` của bản vẽ là SÀN, không phải bề rộng chốt.
  Bảng cũ rộng đúng `260 + n×104`. Với dải 4 kỳ của seed đó là 676px nằm giữa một vùng 976px —
  gần một phần ba bề ngang bỏ trống ngay cạnh một lưới 22 dòng, và mắt phải nhảy qua khoảng trắng
  đó để đọc "Tổng theo kỳ". Đổi sang `w-full table-fixed` + `style={{ minWidth: 260 + n*104 }}`:
  `table-fixed` giữ TỈ LỆ của bản vẽ (cột đơn vị gấp 2,5 lần một cột kỳ) khi kéo giãn, `minWidth`
  giữ sàn để dải kỳ dài ra thì cuộn ngang chứ không bóp cột.
  Giá nếu sai: ở màn rất rộng, một cột kỳ có thể rộng hơn chip nằm trong nó.

Ruling 72: huy hiệu đếm trên sidebar đọc `/dashboard/summary`, KHÔNG thêm endpoint mới.
  Sidebar cần hai con số: số chờ duyệt và "đã nộp / tổng đầu mối". Cả hai đã nằm sẵn trong
  `/dashboard/summary` (`submitted_count`, `reporting_units`, `missing_units`). Dùng lại đúng khoá
  `['dashboard','summary',period]` mà Dashboard đang dùng ⇒ mở Dashboard rồi đi chỗ khác không tốn
  thêm một request nào, và `invalidateReportQueries` vốn đã làm mới khoá này nên duyệt xong huy
  hiệu tự đổi. `batDau: co('dashboard.view')` để người chỉ-nộp không bắn một lượt 403 ở MỌI trang.
  Giá nếu sai: người có `status.view` mà không có `dashboard.view` sẽ không thấy huy hiệu.

Ruling 73: mọi số đọc từ mạng để vẽ Sidebar phải qua canh KIỂU trước.
  `tong.data.missing_units.length` ném `TypeError` nếu thân trả về dị dạng. Sidebar dựng trong MỌI
  trang sau `RequireAuth` và không `ErrorBoundary` nào trong `src/` đỡ ⇒ đó là màn trắng toàn app,
  không phải một huy hiệu thiếu. Thêm `laSo()` / `Array.isArray()` và ca test dựng đúng cảnh đó.
  Giá nếu sai: không; canh kiểu chỉ tốn vài dòng.

Ruling 74: `submitted_count === 0` thì KHÔNG vẽ huy hiệu, không vẽ số `0`.
  Huy hiệu ở đây nghĩa là "có việc đang chờ anh". Một con số `0` màu cảnh báo bên cạnh "Duyệt báo
  cáo" nói ngược lại điều nó muốn nói. `daNop/tong` thì NGƯỢC LẠI: `0/22` là một trạng thái có
  nghĩa thật (chưa ai nộp), nên vẫn vẽ.
  Giá nếu sai: người duyệt không có tín hiệu "hàng đợi trống" — nhưng chính trang đó đã nói.

Ruling 75: cột của kỳ đang chọn được tô nhạt; `?period=` phải có tác dụng trên màn này.
  Trang vẽ CẢ DẢI kỳ, nên trước Lát 5 bộ chọn kỳ ở sidebar — và huy hiệu `21/22` vừa gắn lên, vốn
  đọc đúng kỳ đó — không trỏ vào đâu trên màn hình cả. Tô NỀN Ô (`bg-primary/5`) và đậm hơn ở ô
  tiêu đề, KHÔNG đụng vào chip: màu chip là thứ duy nhất mang nghĩa đã nộp/chưa nộp, thêm một màu
  nữa lên đó là trộn hai chiều thông tin. Trang vẫn không LỌC theo kỳ — dải kỳ là giá trị của màn
  này. Kỳ ngoài dải thì không tô cột nào (có ca canh).
  Giá nếu sai: thêm một sắc nền rất nhạt trên một cột.

Ruling 76: `staleTime` chỉ được đưa vào tuỳ chọn khi nơi gọi THẬT SỰ truyền.
  Viết thẳng `staleTime,` vào object làm nơi gọi không truyền gì vẫn đưa vào khoá
  `staleTime: undefined`, và TanStack trải options lên `defaultOptions` nên khoá đó GHI ĐÈ mặc
  định 30s của `app/queryClient.ts` ⇒ Dashboard thành stale-ngay, mỗi lần mount lại bắn thêm một
  lượt `/dashboard/summary`. Đây là lỗi THẬT do Lát 5 tạo ra, và e2e `Q1 — duyệt xong, dashboard
  đổi 21→22` bắt được (đỏ ở cả hai khung nhìn). Vá bằng spread có điều kiện, và thêm ca đo cùng bất
  biến ở `app/queryClient.test.tsx` — đúng chỗ đặt cái mặc định bị ghi đè — vì để e2e 1,2 phút canh
  một bất biến đo được trong vài mili giây là đặt lưới sai chỗ. Đã kiểm sức phân biệt: bỏ bản vá
  thì ca đỏ ("expected 1 times, got 2").
  Giá nếu sai: không.

Ruling 77: các mục nav KHÔNG mang `?period=` theo, và để nguyên như vậy.
  Bấm "Tình trạng nộp" ở sidebar khi đang xem kỳ 07 thì URL thành `/status` trơn, và cả bộ chọn kỳ
  LẪN cột được tô cùng rơi về `KY_MAC_DINH` — hai chỗ vẫn NÓI CÙNG MỘT KỲ, chỉ là không nhớ kỳ cũ.
  Sửa việc "nhớ" là đổi hành vi điều hướng của Lát 1 và đụng bảng kiểm href trong `routes.test.tsx`
  — ngoài phạm vi một lát phẫu thuật. Ghi lại để quyết sau.
  Giá nếu sai: đổi kỳ rồi chuyển trang thì mất kỳ đang xem.

**Tự kiểm:** `npm test` **859/859 xanh** (850 trước Lát 5 + 5 ca huy hiệu + 3 ca cột kỳ + 1 ca
`staleTime`) · e2e **40/40** ở cả `desktop-1280` lẫn `zoom-125` · `tsc -b` sạch · `oxlint` 33 cảnh
báo, ĐÚNG BẰNG trước Lát 5 · đã xoá spec chụp màn tạm `e2e/_chup-man.spec.ts` · HEAD `ee3a76f`,
không một commit.

---

## LÁT 6 — Duyệt báo cáo + Báo cáo đơn vị (`/reports`, hai vai)

Tệp đụng tới: `pages/Reports.tsx`, `pages/Reports.test.tsx`, `features/reports/nhanTrang.ts` (mới),
`components/AppShell.tsx`, `components/AppShell.test.tsx`, `components/Sidebar.tsx`,
`e2e/demo-path.spec.ts`.

Ruling 78: GIỮ NGUYÊN chữ của tiêu đề, dù mockup có chữ đẹp hơn.
  Mockup mục 03 ghi "Hàng chờ duyệt". `tieuDeHangDoi` hiện tại đổi chữ theo HAI biến (`xemTatCa`
  và `report.approve`) vì vai viewer không duyệt được, nên không được thấy chữ hứa hành động —
  đó là kết luận của Ruling 198/S2, có bốn ca khoá lại. Một chữ đẹp hơn mà nói sai với một vai thì
  thua. Thông tin của mockup được thêm bằng DÒNG PHỤ ĐỀ dưới h1, không thay chữ h1.
  Giá nếu sai: tiêu đề admin kém gọn hơn bản vẽ.

Ruling 79: phụ đề phải nói ĐÚNG phạm vi, nên KHÔNG chép "Kỳ 08/2026" của bản vẽ.
  Mockup ghi phụ đề "Kỳ 08/2026 · mẫu FM01". Hàng đợi admin KHÔNG lọc theo kỳ — nó gộp cả 06, 07,
  08 (66 dòng trên seed). Chép nguyên là in một câu sai ngay dưới tiêu đề. Viết đúng hiện trạng:
  "Mẫu FM01 · gộp mọi kỳ — không theo kỳ chọn ở thanh bên", và câu đó còn trả lời sẵn thắc mắc
  "sao đổi kỳ ở sidebar mà bảng không đổi".
  Giá nếu sai: phụ đề dài hơn bản vẽ một vế.

Ruling 80: BỎ thẻ "kỳ đang mở" cỡ lớn của mockup mục 07.
  Bản vẽ cho người nộp có một thẻ lớn ("09" / "2026" / hạn nộp / nút Tạo báo cáo) đứng trên bảng
  "Các kỳ trước". Nó giả định CÓ ĐÚNG MỘT kỳ đang mở. Seed thật đang mở HAI kỳ (08 và 09), và
  `GET /reports` KHÔNG trả `is_open` (carry C7 gọi đó là "trường ma") — tức trang này không có cách
  nào biết kỳ nào đang mở mà không thêm một lượt gọi nữa. Một thẻ "kỳ đang mở" chọn bừa một trong
  hai sẽ GIẤU kỳ còn lại, mà kỳ còn lại đang là bản nháp dở. Thay bằng sức nặng NÚT: cả hai dòng
  còn việc đều mang nút chính.
  Giá nếu sai: màn người nộp ít bắt mắt hơn bản vẽ.

Ruling 81: sức nặng nút đi theo "dòng này có chờ CHÍNH người đang xem không", không theo chữ nút.
  Bản trước tô nút chính cho MỌI dòng của admin: ở chế độ "Tất cả" đó là 66 nút navy như nhau và
  màu nhấn hết nghĩa. Người duyệt chỉ có việc với dòng `submitted`; viewer không duyệt được nên
  KHÔNG dòng nào là việc của họ. Chữ nút ("Mở"/"Xem") giữ nguyên — đó là hợp đồng cũ có ca khoá.
  Giá nếu sai: người duyệt phải đọc chip trạng thái thay vì nhìn màu nút.

Ruling 82: ô tìm đơn vị lọc TRÊN DỮ LIỆU ĐANG CÓ, và bỏ dấu cả hai vế đ/Đ.
  66 dòng đã nằm sẵn trong bộ nhớ; gọi lại API để lọc là thêm một đường mạng cho việc không cần.
  Gõ không dấu là cách gõ thường ngày, nên phải bỏ dấu — `normalize('NFD')` một mình KHÔNG tách
  được `đ` (chữ cái riêng trong Unicode, không phải d + dấu), phải thay tay CẢ `đ` lẫn `Đ`.
  Đã đo: fixture ban đầu chỉ có `Đ` hoa ⇒ bỏ hẳn vế `đ` thường mà bộ test vẫn xanh. Thêm fixture
  "Ban điều độ sản xuất"; giờ mỗi vế có ca riêng bắt được (đo lại từng vế một).
  Giá nếu sai: không.

Ruling 83: con số ở tiêu đề đếm CẢ hàng đợi, không đếm kết quả lọc.
  "Chờ duyệt (n)" trả lời "còn bao nhiêu việc" — một câu không được đổi nghĩa theo chuỗi người dùng
  vừa gõ vào ô tìm. Kết quả lọc có con số riêng ("1/66 dòng") đặt ngay cạnh chính ô đó.
  Giá nếu sai: người dùng phải nhìn hai chỗ thay vì một.

Ruling 84: nhãn trang `/reports` về MỘT nguồn (`features/reports/nhanTrang.ts`).
  Tên trang đổi theo quyền, và trước Lát 6 nó được viết ra ở hai chỗ độc lập: mục nav Sidebar
  (đúng) và vệt breadcrumb AppShell (ghi cứng "Duyệt báo cáo"). LỖI THẬT quan sát được: người chỉ
  có quyền nộp mở `/reports` thấy nav ghi "Báo cáo của đơn vị" còn vệt ngay trên đầu ghi "Duyệt báo
  cáo" — hứa một quyền họ không có. Bình luận ở `duongDanBreadcrumb` đã nói đúng chuyện này cho
  nhánh `/reports/:id` từ Lát 7 nhưng không sửa nhánh danh sách ngay dòng dưới.
  Giá nếu sai: không.

Ruling 85: cấm ngắt dòng TỪNG Ô + ghim cột Hành động dính mép phải, thay vì chốt bề rộng bảng.
  Ở 1024 zoom 125% sáu cột không vừa. Mặc định trình duyệt ngắt dòng từng ô ⇒ 66 dòng cao thấp lởm
  chởm (đo trên ảnh chụp). Cấm ngắt thì bảng lấy đúng bề rộng nó cần và khung bọc cuộn ngang —
  nhưng lúc đó thứ đầu tiên trôi khỏi màn hình lại là cột DUY NHẤT bấm được. Ghim nó `sticky
  right-0` (cùng khuôn cột đơn vị dính trái của `StatusGrid`). Ô trạng thái là ô DUY NHẤT vẫn được
  ngắt dòng: ghi chú Trả lại dài tới 120 ký tự.
  Giá nếu sai: ở 1024 cột "Cập nhật" bị ô dính che một phần cho tới khi cuộn.

Ruling 86: `min-w-0` cho `SidebarInset` — LỖI TẦNG KHUNG có từ Lát 1, không phải lỗi của Lát 6.
  `SidebarInset` của shadcn là flex item `w-full flex-1`, và `min-width:auto` mặc định làm nó TỪ
  CHỐI co xuống dưới bề rộng nội dung. Hệ quả: khung `overflow-x-auto` của bảng không bao giờ cuộn,
  nó đùn cả trang rộng ra. Đo được ở `/reports` "Tất cả" trên 1024: `scrollWidth` **1118** trên
  `clientWidth` **1024** ⇒ kéo ngang là cả sidebar lẫn thanh đầu trang trượt khỏi màn hình. Vùng
  nội dung bên trong đã có `min-w-0` từ Lát 1; thiếu đúng một mắt xích ở tầng trên làm nó vô hiệu.
  Sau bản vá: 1024/1024, khung bọc nhận đúng phần tràn (812 trên 718).
  Giá nếu sai: không — đây là bản vá, không phải đánh đổi.

Ruling 87: lưới canh cho Ruling 86 đặt ở e2e, và phải có VẾ THỨ HAI.
  jsdom không nạp CSS nên không ca đơn vị nào thấy được. Ca `C-Lát6` đi qua `/dashboard`, `/status`,
  `/reports` ở cả hai khung nhìn. Chỉ hỏi "tài liệu có tràn không" là CHƯA ĐỦ: ở 1280 bảng vốn đã
  vừa nên ca xanh kể cả khi `min-w-0` lại biến mất. Vế thứ hai — khung bọc bảng không được rộng hơn
  vùng nội dung — mới là thứ phân biệt. Đã đo: bỏ `min-w-0` ⇒ ca đỏ ở `zoom-125`.
  Giá nếu sai: không.

Ruling 88: neo "titlebar" của ca đo khoảng cách (`C-T25/2`) đổi sang leo cây, không lấy `h1.parentElement`.
  Ca cũ giả định `<h1>` là con TRỰC TIẾP của titlebar. Lát 6 bọc `<h1>` cùng dòng phụ đề trong một
  `<div>` con ⇒ `nextElementSibling` thành khối điều khiển BÊN PHẢI cùng hàng flex, và phép đo trả
  **-34px**. Neo mới: leo từ `<h1>` lên tới tổ tiên nằm ngay dưới gốc trang (con đầu của
  `[data-slot="noi-dung"]`) — đúng với cả ba trang, không phụ thuộc cách từng trang bọc tiêu đề.
  Đây là lần thứ ba một ca e2e neo theo CẤU TRÚC DOM phải sửa vì một màn được dựng lại (sau
  `div.overflow-auto` ở Lát 4 và neo `/reports/12` ở Lát 7).
  Giá nếu sai: không.

**Tự kiểm:** `npm test` **873/873 xanh** (863 trước + 4 ca breadcrumb + 7 ca ô tìm/nút, trừ chồng
lấn) · e2e **42/42** ở cả hai khung nhìn (40 + ca `C-Lát6` × 2) · `tsc -b` sạch · `oxlint` 33 cảnh
báo, ĐÚNG BẰNG trước Lát 6 · đã xoá spec chụp màn tạm · HEAD `ee3a76f`, không một commit.

---

## LÁT 2 — 403 / 404

Tệp đụng tới: `components/TrangLoi.tsx` (mới), `components/TrangLoi.test.tsx` (mới),
`pages/Forbidden.tsx`, `pages/NotFound.tsx`, `app/routes.tsx`, `app/routes.test.tsx`,
`e2e/rbac.spec.ts`.

Ruling 89: `/` là LỐI VÀO của ứng dụng, không phải bí danh của `/login`.
  Cả hai màn lỗi nằm NGOÀI `AppShell` — không sidebar, không breadcrumb — nên nút trên màn là đường
  đi DUY NHẤT. Nút đó là `<a href="/">Về trang chủ`, mà `/` là `<Navigate to="/login">` và
  `Login.tsx` KHÔNG kiểm token sẵn có (nó chỉ dựng form). Kết quả: người ĐANG đăng nhập bấm lối
  thoát của một ngõ cụt và rơi vào một ngõ cụt khác. Sửa ở GỐC: `/` thành
  `<RequireAuth><LoiVao/></RequireAuth>`, `LoiVao` chọn `/dashboard` hay `/reports` theo quyền.
  Người chưa đăng nhập vẫn về `/login` — `RequireAuth` lo, kèm `?next=%2F` nên đăng nhập xong quay
  lại `/` rồi mới toả đi đúng chỗ. Không có vòng lặp: `/` → đích cụ thể, một bước.
  Giá nếu sai: một lần chuyển hướng nữa cho người gõ `/` khi chưa đăng nhập.

Ruling 90: màn lỗi KHÔNG tự chọn giữa `/dashboard` và `/reports` — nó trỏ `/` và để LỐI VÀO quyết.
  Bản đầu của lát này tự đọc `permissions` để chọn đích. SAI, và ảnh chụp thật lộ ra ngay: một màn
  lỗi gần như luôn được mở bằng một lần TẢI TRANG, mà `session.ts` chỉ khôi phục `token` —
  `permissions` rỗng cho tới khi `RequireAuth` hỏi lại `/auth/me`, và hai màn này đứng NGOÀI
  `RequireAuth`. Nút vẽ ra chữ "Đăng nhập" ngay cạnh nút "Đổi tài khoản" trên màn của một người
  đang đăng nhập. `token` thì ngược lại — nó sống qua tải trang — nên vẫn đủ tin để chọn CHỮ.
  Đây là bài học "đừng đọc thứ chưa được nạp": cùng lớp với `duLieuCuoi` của Status.tsx.
  Giá nếu sai: nhãn nút chung chung hơn ("Về trang chủ" thay vì "Về Dashboard").

Ruling 91: 403 có lối thoát THỨ HAI ("Đổi tài khoản"), 404 thì không.
  "Không đủ quyền" rất thường là "đang đăng nhập nhầm tài khoản", và đường đăng xuất nằm ở chân
  sidebar — đúng thứ màn này không có. 404 thì không liên quan gì tới tài khoản đang dùng, nên
  không mượn nút đó. Nút chỉ hiện khi `token !== null`: không có phiên thì không có gì để đổi.
  Giá nếu sai: thêm một nút trên một màn hiếm gặp.

Ruling 92: `<h1>` thật, KHÔNG dùng `EmptyTitle` của shadcn.
  `EmptyTitle` dựng ra `<div>` (`React.ComponentProps<"div">`, không có `asChild`). Ở
  `pages/Reports.tsx` thế là đúng — ô trống nằm trong một trang đã có `<h1>` riêng. Ở đây ô trống
  LÀ cả trang, nên dùng nó là bỏ luôn danh tính trang với trình đọc màn hình. Bản đầu của lát này
  mắc đúng lỗi đó và ca e2e mới (`getByRole('heading')`) bắt được ngay lượt chạy đầu — một lỗi
  a11y mà ba ca đơn vị đọc `href`/chữ đều không thấy.
  Giá nếu sai: không.

Ruling 93: `Empty` ở màn-lỗi bỏ `border-dashed`.
  Lớp mặc định của `Empty` có viền đứt nét — đúng cho một ô rỗng GIỮA nội dung khác, sai khi nó
  chiếm cả màn hình (trông như trang đang tải dở). Đây cũng là câu trả lời cho mục tiêu "Lát 2 kiểm
  `Empty` chạy đầu-cuối" trong spec: component dùng được, nhưng phải chỉnh cho đúng ngữ cảnh.
  Giá nếu sai: không.

Ruling 94: lưới canh đặt ở CẢ hai tầng, và tầng e2e đi qua HAI vai.
  Ca đơn vị khoá `href` của nút và đích của `/` riêng rẽ; ca e2e nối cả chuỗi trên trình duyệt thật
  (`rbac.spec.ts`) vì chỉ ở đó mới lộ ra nếu `RequireAuth` nạp lại phiên hỏng hay `/` rơi vào vòng
  chuyển hướng — hai thứ `MemoryRouter` với `fetch` giả không chạm tới. Đi hai vai vì đích của `/`
  đổi theo quyền. Đã đo sức phân biệt: trả `/` về `<Navigate to="/login">` ⇒ 2 ca đơn vị đỏ; đổi
  `<Link>` thành `<a href>` ⇒ ca điều hướng SPA đỏ; bỏ nhánh chọn đích ⇒ 5 ca đỏ.
  Giá nếu sai: không.

Ruling 95: `/login` vào bảng kiểm đích của `routeScan` (`routes.test.tsx` nguồn 4).
  `navigate('/login')` của nút "Đổi tài khoản" là lần ĐẦU một trang trong `src/pages` tự điều hướng
  về `/login` — trước đó chỉ `RequireAuth` (ở `src/app/`, ngoài ba thư mục quét) làm việc đó. Ca
  so khớp CHÍNH XÁC tập đích đã đỏ đúng như thiết kế của nó; khai thêm phần tử, không nới ca.
  Giá nếu sai: không.

**Tự kiểm:** `npm test` **885/885 xanh** (873 trước + 9 ca màn lỗi + 2 ca lối vào + 1 ca tập đích)
· e2e **46/46** ở cả hai khung nhìn (42 + 2 ca lối thoát × 2 vai) · `tsc -b` sạch · `oxlint` 33 cảnh
báo, ĐÚNG BẰNG trước Lát 2 · đã xoá spec chụp màn tạm · HEAD `ee3a76f`, không một commit.

---

## LÁT 8 — ba màn quản trị + hai endpoint backend

Lát CUỐI của đợt redesign, và lát DUY NHẤT phải động vào backend. Ba màn: `/admin/templates`
("Mẫu báo cáo"), `/admin/org` ("Tổ chức"), `/admin/users` ("Người dùng"). Ba mục nav trong nhóm
"Quản trị nền tảng" hết khoá.

Tệp đụng tới — backend: `app/api/templates.py`, `app/api/users.py` (mới), `app/main.py`,
`tests/api/test_admin.py` (mới). Frontend: `api/client.ts`, `features/admin/khung.tsx` (mới),
`features/admin/muc.ts` (mới), `pages/QuanTriMau.tsx` · `QuanTriToChuc.tsx` · `QuanTriNguoiDung.tsx`
(+ ba file test, đều mới), `app/routes.tsx`, `app/routes.test.tsx`, `components/Sidebar.tsx`,
`components/AppShell.tsx`, `components/AppShell.test.tsx`, `e2e/demo-path.spec.ts`.

Ruling 96: màn quản trị chỉ có ĐÚNG MỘT thao tác ghi — mở / đóng kỳ. Mọi nút khác trong mockup bị bỏ.
  Mockup 08/09 vẽ "Tạo mẫu mới", "Khai danh mục chỉ tiêu", "Thêm đơn vị", "Mời tài khoản". Không
  endpoint nào tồn tại cho bốn thứ đó, và mỗi thứ kéo theo một đường đi riêng (đặt mật khẩu, gửi
  thư, migration danh mục). Dựng nút rồi để nó không làm gì là lời hứa sai đặt đúng chỗ người dùng
  tin nhất — màn quản trị. Thay vào đó phụ đề nói thẳng: "Danh sách chỉ để xem — cấp và thu hồi vai
  vẫn làm trực tiếp trên CSDL."
  Giá nếu sai: người demo phải nói miệng rằng ba màn này chỉ đọc.

Ruling 97: câu mô tả "đóng kỳ" viết theo NGUỒN, không chép mockup.
  Mockup ghi "Đóng kỳ thì đơn vị không nộp được nữa". Đối chiếu tại nguồn thì SAI: `is_open` chặn
  đúng hai cửa — `POST /reports` trả 409 (`api/reports.py:89`) và ô TRỐNG của kỳ đó biến khỏi
  `GET /reports` (`services/reports.py:353`). `apply_transition` KHÔNG đọc `is_open` bao giờ, nên
  một báo cáo đã tạo vẫn nộp và duyệt được. Màn hình ghi đúng bấy nhiêu: "Đóng kỳ chỉ chặn TẠO báo
  cáo mới cho kỳ đó — báo cáo đã tạo vẫn nộp và duyệt được."
  Giá nếu sai: một câu sai trên màn hình mà chỉ người đọc mã backend mới phát hiện ra.

Ruling 98: mở kỳ đi thẳng, đóng kỳ phải qua hộp thoại — bất đối xứng CÓ Ý.
  Mở kỳ chỉ THÊM lối vào cho 22 đầu mối, không lấy đi gì; hỏi lại là ma sát không mua được gì.
  Đóng kỳ lấy đi lối vào của những đơn vị chưa kịp tạo báo cáo. Một bản vá "cho đồng bộ" theo
  chiều nào cũng hỏng: bỏ hộp thoại là mất hàng rào, thêm hộp thoại cho cả hai là ma sát vô ích.
  Ba ca đơn vị khoá cả hai chiều, và e2e `C-Lát8/2` đi lại đúng hai đường đó trên trình duyệt thật.
  Giá nếu sai: một cú bấm trượt đóng nhầm kỳ đang mở giữa buổi demo.

Ruling 99: `GET /users` gác bằng `user.manage`, KHÔNG dùng `yeu_cau_xem_bao_cao` như `/templates`.
  Hai endpoint danh mục hiện có (`/templates`, `/org-units`) mở cho mọi vai vì ai nộp báo cáo cũng
  cần đọc chúng để dựng form. `/users` thì khác hẳn: nó trả email, chức danh, VAI và PHẠM VI của
  24 người — tức chính bản đồ phân quyền. Không có lý do nào để một người nhập đọc được nó.
  Giá nếu sai: một vai quản trị tương lai chỉ có `user.manage` mà thiếu quyền xem báo cáo vẫn vào
  được, đúng ý.

Ruling 100: số quyền là `count(distinct)`, và phải có ca dựng cảnh một người HAI VAI mới đo được.
  `admin_atcl` và `viewer` chồng nhau ba quyền. Seed không ai giữ hai vai, nên `count(*)` xanh
  suốt trên dữ liệu thật — ca canh phải tự gán thêm vai viewer cho admin trong transaction test
  rồi khẳng định vẫn là 14, không phải 17. Đây là lớp lỗi "so một giá trị với chính cái mặc định
  nó rơi về" mà `test_viewer_khong_sua_duoc_gi` đã dạy một lần.
  Giá nếu sai: một con số trên màn phân quyền lớn hơn tổng số quyền có thật.

Ruling 101: cột "Đã nộp" của bảng kỳ nằm sau `status.view`, và thiếu quyền thì hiện "—", không 403.
  Con số đó là dữ liệu BÁO CÁO (`GET /status`), quyền khác hẳn `template.manage` đang gác trang.
  Vai admin_atcl thật có cả hai, nhưng một vai chỉ-quản-trị-mẫu là cấu hình hợp lệ — và với vai đó
  màn hình phải mất một CỘT, không phải mất cả trang. Query tắt hẳn bằng `enabled` nên cũng không
  bắn ra một lượt 403 nào. Cùng khuôn với hai huy hiệu đếm trên Sidebar (Lát 5).
  Giá nếu sai: một lượt gọi thừa và một cột trống.

Ruling 102: "Đã nộp" đếm `submitted|approved`, KHÔNG đếm `draft`.
  Vị từ lấy nguyên từ `pages/Reports.tsx:154`, không tự chế lại. Bản nháp là báo cáo TỒN TẠI mà
  chưa ai nộp — và con số quyết định "có nên đóng kỳ này không" chính là số đơn vị ĐÃ NỘP. Lưới
  fixture của ca test cố ý có đủ bốn trạng thái khác nhau ở cùng một kỳ, vì một lưới toàn
  `approved` không phân biệt được phép lọc đúng với `units.length`.
  Giá nếu sai: đóng kỳ trong khi tưởng 22/22 đã nộp mà thật ra 20 bản còn là nháp.

Ruling 103: màn Tổ chức dựng ĐỆ QUY theo `children` dù dữ liệu hôm nay phẳng, và NÓI RA là nó phẳng.
  Seed chưa gán `parent_id` cho đơn vị nào (`api/org.py` ghi thẳng), nên cây ra 35 nút gốc. Giả
  định phẳng mà viết phẳng thì ngày có phân cấp thật sẽ mất nút con mà không ai biết. Ngược lại,
  im lặng để người quản trị nhìn một "sơ đồ tổ chức" phẳng lì cũng là giấu một sự thật — nên có
  một dòng nói đúng điều đó, và dòng đó BIẾN MẤT khi dữ liệu có phân cấp. Ca canh dựng một cây có
  con để tách `ds.length` khỏi phép duyệt đệ quy — trên dữ liệu phẳng hai phép đó cho cùng một số.
  Giá nếu sai: một dòng chữ thừa trên màn hiếm mở.

Ruling 104: bỏ avatar viết tắt ở bảng người dùng (mockup 09 có vẽ).
  Quy ước viết tắt của app là hai chữ đầu của email — đúng cho ô tài khoản ở chân sidebar, nơi chỉ
  có MỘT người. Ở bảng 24 dòng nó gộp `u01@`…`u09@` thành cùng chữ "U0" trên chín dòng khác nhau:
  một ký hiệu nhận dạng mà không nhận dạng được ai là nhiễu đội lốt thông tin. Đo được trên ảnh
  chụp thật. Tên + email đã đủ phân biệt. Dựng lại được khi tài khoản mang tên người thật, bằng
  một quy ước viết tắt khác.
  Giá nếu sai: mất một điểm neo thị giác khi lướt danh sách dài.

Ruling 105: hai nút mở/đóng kỳ đều PHẲNG — màu nhấn không dùng ở màn này.
  Bản đầu tô "Mở kỳ" bằng nền primary. Ảnh chụp lộ ra ngay: hai nút đậm nhất trang rơi vào 06/2026
  và 07/2026 — hai kỳ lịch sử đã đóng mà không ai cần mở lại. Màu nhấn chỉ dành cho việc NÊN LÀM
  (luật Lát 6), mà màn này không có việc nào như thế. Sức nặng của thao tác đóng kỳ nằm ở hộp thoại
  xác nhận. Cùng lý do, chip "Đầu mối" ở màn Tổ chức bỏ nền `success` — "là đầu mối báo cáo" là một
  THUỘC TÍNH, không phải một kết quả tốt, và 22 trên 35 dòng cùng sáng xanh thì chẳng còn nổi bật.
  Giá nếu sai: không.

Ruling 106: e2e đóng/mở kỳ chạy trên **06/2026**, không phải kỳ đang mở.
  Ca mở rồi đóng lại nên kết thúc ở đúng trạng thái ban đầu. Chọn 06/2026 vì nó ĐANG ĐÓNG trong
  seed. Không được đụng 08 và 09/2026: chúng là bối cảnh của cả buổi demo, và `reset_demo.py` là
  insert-if-absent nên nó KHÔNG đặt lại `is_open` của một kỳ đã có — một ca hỏng giữa chừng sẽ để
  lại một database không còn demo được. Mở 06/2026 cũng không đổi số dòng của `/reports`: kỳ đó đã
  đủ báo cáo cho cả 22 đầu mối nên các dòng ấy hiện ra bất kể `is_open`.
  Giá nếu sai: phải chạy `reset_demo.py` bằng tay sau một lượt e2e đỏ.

Ruling 107: `MUC_QUAN_TRI` ra `features/admin/muc.ts`, không export từ `Sidebar.tsx`.
  AppShell cần đúng danh sách đó để dựng breadcrumb — đây chính là hình dạng lỗi Lát 6 đã sửa ở
  `/reports` (hai chỗ viết tên trang độc lập thì hai chỗ nói hai tên). Export thẳng từ `Sidebar.tsx`
  chạy được nhưng thêm một cảnh báo `only-export-components` (33 → 34); tách file theo đúng tiền lệ
  `features/reports/nhanTrang.ts` thì vừa đúng ý vừa giữ nguyên 33.
  Giá nếu sai: không.

**Lưu ý vận hành (không phải ruling):** container `infra-api-1` chạy IMAGE đã build, không mount mã
nguồn — nên sau khi thêm endpoint phải `docker compose up -d --build api` thì e2e mới thấy. Lượt
chạy đầu của `C-Lát8/2` đỏ đúng vì lý do này (`PATCH` trả 404).

**Tự kiểm:** backend `pytest` **334/334 xanh** (324 trước + 10 ca mới), 6 đột biến thử đều bị bắt
(bỏ `count(distinct)` · bỏ gác `user.manage` · bỏ gác `template.manage` · bỏ ghi `is_open` · đảo
`action` của audit · bỏ `is_open` khỏi thân trả về) · frontend `npm test` **909/909 xanh** (885
trước + 24 ca mới), 6 đột biến thử đều bị bắt · e2e **50/50** ở cả hai khung nhìn (46 + 2 ca × 2)
· `tsc -b` sạch · `oxlint` **33 cảnh báo, đúng bằng trước Lát 8** · đã xoá spec chụp màn tạm ·
HEAD `ee3a76f`, không một commit.

---

## DỌN SAU LÁT 8 — nợ Lát 4 + bỏ bộ chọn kỳ thừa (quy trình nhẹ, không subagent)

**Người dùng chốt hai việc:** (1) dọn `ui/Tile.tsx`, `features/dashboard/KpiTile.tsx`, luật `.flash`
— đúng khoản nợ ghi ở cuối Lát 4 ("nếu hết lát 8 vẫn không ai gọi thì xoá cả ba"); (2) Dashboard có
hai bộ chọn kỳ, bỏ bộ trên đầu trang.

**Sửa:** `features/dashboard/{BangChiSo,TheSoLieu}.tsx`, `components/Sidebar.tsx`,
`pages/Dashboard.tsx`, `index.css`, `components/ui/ui.test.tsx`, `pages/Dashboard.test.tsx`,
`components/AppShell.test.tsx`, `app/cssNen.test.ts`, `docs/designs/hseq-platform-mvp-fm01.md`,
`docs/superpowers/specs/2026-09-16-hsseq-redesign-shadcn-design.md`.
**Thêm:** `features/dashboard/useNhaySo.ts`.
**Xoá:** `components/ui/Tile.tsx`, `features/dashboard/KpiTile.tsx`,
`features/dashboard/PeriodNav.tsx`.

Ruling 108: khoản nợ Lát 4 ghi "không còn ai gọi thì xoá cả ba", nhưng `.flash` KHÔNG cùng loại với
  hai file kia. Tra lại nguồn: nó là D18 của thiết kế đã duyệt ("ô có số đổi sau refetch nháy nền
  #c1e1f7 → trắng 600 ms"), là một dòng trong bảng trạng thái màn `/dashboard`, là bất biến §10 của
  spec, VÀ là nhịp cuối của kịch bản demo ("admin duyệt → dashboard invalidate → ô đổi số nháy").
  Tức Lát 4 không bỏ một luật CSS thừa — nó ĐÁNH RƠI một hành vi đã chốt khi dựng lại ô KPI thành
  `BangChiSo`/`TheSoLieu`, và `KpiTile` mồ côi chính là vật chứng. Xoá nốt là hợp thức hoá một
  hồi quy. Báo người dùng kèm hai đường; người dùng chọn KHÔI PHỤC.
  Giá nếu sai: một chuyển động 600ms không ai để ý — rẻ hơn hẳn chiều ngược lại (mất một nhịp demo
  đã hứa, và phát hiện ra vào đúng hôm demo).

Ruling 109: khôi phục bằng HOOK (`useNhaySo`) chứ không bằng cách hồi sinh `KpiTile`. Lát 4 chia ô
  KPI làm hai component trên hai NỀN; một component ô dùng chung không dựng lại được nữa (panel tối
  có dòng phụ "Đang ở mức 0" và danh sách mã đơn vị, thẻ trắng có icon). Thứ dùng chung được chỉ
  còn đúng phần logic "số có đổi không". Hook giữ nguyên `useRef(gia)` + `flushSync` của bản cũ —
  hai chi tiết đó đều có ca test riêng và đều từng là lỗi thật.

Ruling 110: thêm `.flash-toi` chứ không dùng chung `.flash`. `@keyframes flash-bg` kết ở `#fff`;
  chạy trên `--dark-panel` thì ô loé trắng rồi mới tối lại — nháy NGƯỢC, đúng điều ledger Lát 0
  (dòng 374) đã chỉ ra khi từ chối sửa vội. Bản tối nháy bằng một lớp trắng 14% rồi tan về trong
  suốt. Bất biến §10 viết lại: vẫn HAI chuyển động, nhưng cái thứ nhất là một chuyển động viết
  thành hai luật. Ca test dùng `classList.contains` chứ không `className.toContain` — chuỗi 'flash'
  nằm TRONG 'flash-toi', so chuỗi thì ca "đúng lớp cho đúng nền" thành vô nghĩa.

Ruling 111: bỏ `PeriodNav` thì phải MANG BIÊN theo, không được bỏ không. Bộ chọn trên sidebar chưa
  bao giờ có biên; `PeriodNav` có, và có là vì P2/Ruling 424 sau một lỗi thật (bấm `›` ở kỳ cuối
  dải → màn "0 đã duyệt / 22 chưa nộp", đọc y hệt mất sạch dữ liệu). Dashboard nay có màn "kỳ chưa
  có trong hệ thống" đỡ ở dưới, nhưng đó là lưới đỡ SAU khi người dùng đã rơi — và sidebar còn
  đứng trên `/status`, nơi kỳ ngoài dải chỉ lặng lẽ không tô cột nào. Nên `ChonKy` nay tự hỏi
  `GET /templates/FM01/periods` bằng ĐÚNG khoá truy vấn Dashboard/Status/QuanTriMau đang dùng —
  trên ba màn đó không phát sinh lượt gọi thứ hai — và truy vấn nằm TRONG `ChonKy` nên người không
  có `dashboard.view`/`status.view` không hỏi gì cả (có ca canh chiều này).
  Giá nếu sai: một lượt GET nhỏ trên các màn khác của người có quyền xem dashboard.

Ruling 112: ba ca "cửa 1" của P2 chuyển từ `Dashboard.test.tsx` sang `components/AppShell.test.tsx`
  chứ không xoá — biên nằm ở đâu thì ca nằm ở đó, và AppShell.test.tsx đã là nơi Sidebar được dựng
  trong test. Hai ca đo mặt ÂM ("giữa dải thì cả hai nút còn bấm được", "dải kỳ hỏng thì không
  khoá") phải vào từ kỳ CUỐI và đợi cái khoá hiện ra trước rồi mới lùi: đo thẳng ở giữa dải thì
  "chưa khoá vì chưa biết dải" và "không khoá vì đang ở giữa dải" nhìn giống hệt nhau — ca xanh
  giả. Ca "dải kỳ hỏng" đo bằng một việc LÀM ĐƯỢC (bấm `›` ở kỳ cuối và URL thật sự đổi), không
  bằng một thuộc tính vắng mặt.

Ruling 113: hai ca `keepPreviousData` của Dashboard mất nút bấm để đổi kỳ. Không dựng cả AppShell
  vào test trang, cũng không giữ lại một `PeriodNav` chỉ để test: thêm `NutDoiKyTest` gõ thẳng vào
  `?period=` — đúng cái công tắc thật — và chỉ render khi ca test xin, để không thêm một `<button>`
  lạ vào mọi ca khác của file.

**Tự kiểm:** `tsc -b` sạch · frontend `npm test` **902/902 xanh** (909 trước; −11 ca của `Tile`,
−5 ca của `KpiTile`, −7 ca bộ chọn kỳ trong `Dashboard.test.tsx`; +6 ca nháy đo trên hai component
THẬT, +9 ca bộ chọn kỳ ở `AppShell.test.tsx`, +1 ca `flash-bg-toi` ở `cssNen.test.ts`) · 7 đột
biến thử đều bị bắt (BangChiSo dùng nhầm lớp sáng · TheSoLieu bỏ nháy · `useRef(gia)` → `null` ·
bỏ `disabled` nút kỳ sau · khoá quá tay · khoá cả khi chưa biết dải · bỏ `.flash-toi` khỏi nhánh
reduced-motion) · e2e **50/50** ở cả hai khung nhìn · `oxlint` **33 cảnh báo, đúng bằng trước** ·
đã xoá spec chụp màn tạm · HEAD `ee3a76f`, không một commit.

**Ghi chú vận hành:** lượt e2e đầu đỏ vì cổng 5173 đang có `npm run dev` của người dùng —
`playwright.config.ts` cố ý đặt `reuseExistingServer: false` để luôn đo bản BUILD, nên nó không
mượn server sẵn có mà báo lỗi cổng. Hỏi rồi mới tắt; không tự tắt tiến trình của người dùng.

---

## DỰNG LẠI MÀN `/reports/:id` THEO MOCKUP 04

Chủ dự án xem `/reports/2` trên bản deploy và nói thẳng: "vẫn không giống design". Đúng, và
Ruling 62 của Lát 7 đã ghi sẵn cái giá này — "màn này giống bản vẽ ít hơn ba màn kia" — nên
điều thiếu không phải là phát hiện mà là nói rõ ràng hơn với người trả tiền cho nó. Lát này
trả nợ đó, và chỉ đụng LỚP NHÌN: không một dòng logic lưu / trạng thái / bàn phím nào đổi.

Ruling 114: `/reports/:id` chia BA TAB (`Chỉ tiêu` · `Hoạt động nổi bật` · `Lịch sử thao tác`)
  đúng bản vẽ, và `Tabs` phải CÓ ĐIỀU KHIỂN. Radix gỡ nội dung tab không hoạt động khỏi DOM, nên
  tám mã "Thiếu N ô bắt buộc" ở chân trang và neo "Tới ô đầu →" trong khối nhắc đều phải kéo tab
  về `chi-tieu` trước khi nhảy — để Radix tự giữ thì cú bấm từ tab khác im lặng không làm gì.
  Đã ghi thành bất biến ở §10 của spec.
  Giá nếu sai: một lượt đổi tab thừa khi người dùng đang đứng sẵn ở tab Chỉ tiêu.

Ruling 115: cột mục lục 176px BỊ THAY, không phải bị thêm bạn. Mục lục cũ trả lời một câu
  ("nhóm này ở đâu"); thẻ "Tiến độ nhập" (`Progress` + dải chip) trả lời thêm câu người nhập hỏi
  nhiều hơn hẳn ("còn nhóm nào chưa xong"). Giữ cả hai là hai hàng điều hướng nói cùng một chuyện
  trong lúc bảng 53 dòng đang tranh từng pixel. Bảng nay chiếm trọn bề rộng: ở 1024px (viewport
  `zoom-125`) chỗ trống thật là 1024 − 256 − 48 = 720px, trước đây cắt thêm 176px thì hai cột phải
  nằm ngoài tầm nhìn.
  Giá nếu sai: mất một lối nhảy mà người quen bản cũ đang dùng.

Ruling 116: dải chip liệt ĐÚNG chín nhóm CÓ TRONG BẢNG, không liệt đủ 11 như mục lục cũ. Mục lục
  cũ phải liệt cả A và C vì nó là lối đi DUY NHẤT tới hai khối đó; nay A là dải đầu luôn nằm trên
  màn hình và C là một TAB có nhãn riêng — một chip `#C` trong thẻ tiến độ của tab Chỉ tiêu sẽ trỏ
  vào một khối đang không có trong DOM. Cùng lý do, đã GỠ `id="C"` khỏi `TabsContent`: nó còn đè
  luôn id Radix tự sinh, làm `aria-controls` của nút tab trỏ vào hư không.
  Giá nếu sai: link sâu `/reports/2#C` hết tác dụng — chưa nơi nào trong app sinh ra link đó.

Ruling 117: ba ca test canh "mục lục đủ 11 mục" chuyển thành một bất biến TỔNG QUÁT HƠN, không
  xoá: `neoHong()` đòi mọi neo `#x` đang có trên trang phải có đích thật. Thứ họ hàng ca đó bảo vệ
  (P7 — nhóm A năm trường null không được để lại một link trỏ vào chỗ trống) còn nguyên, và nay
  không buộc vào một hình dạng điều hướng cụ thể nào.

Ruling 118: hai lời nhắc không chặn nộp gom thành MỘT `Alert` (bản vẽ: "Hai điểm cần biết trước
  khi duyệt"). Tiêu đề đếm thật và đi theo QUYỀN — "Một/Hai điểm … trước khi duyệt|nộp" — vì người
  nộp cũng thấy khối này và mốc sắp tới của họ là NỘP; in "Hai điểm" khi chỉ có một là nói sai ngay
  dòng đầu. `role="status"` đè `role="alert"` mặc định của primitive: đây là bối cảnh có sẵn lúc mở
  trang, không phải sự kiện vừa xảy ra. Màu warning đặt bằng lớp, KHÔNG thêm `variant` vào
  `ui/alert.tsx`, để lần `shadcn add alert` sau không nuốt mất ba token `--warning*` của gói
  handoff.

Ruling 119: huy hiệu mã đứng cạnh nhãn làm HỎNG tên khả truy cập — JSX nuốt xuống dòng giữa hai
  nút nên `textContent` dính thành "C1Hoạt động nổi bật" / "B-8Quản lý môi trường". Chèn `{' '}`
  thật ở cả `OChu` lẫn chip `TienDoNhap`; dấu cách trắng giữa hai flex item không sinh ô nào nên
  hình không đổi một pixel. Ba ca test đổi chuỗi tìm theo (`'C1. …'` → `'C1 …'`) là HỆ QUẢ của
  việc sửa lỗi này, không phải nới lỏng ca test. Đã ghi thành bất biến ở §10.

Ruling 120: `🔒 tự tính` đổi thành `Badge` + icon lucide `lock` như bản vẽ gọi tên. Emoji vẽ khác
  nhau trên mỗi hệ điều hành và trình đọc màn hình đọc nó thành "khoá đã khoá". Ca test tách làm
  hai khẳng định (chữ ở `textContent`, icon ở `querySelector('svg.lucide-lock')`) để bỏ mất bên
  nào cũng đỏ — icon lucide `aria-hidden` không vào `textContent`.

Ruling 121: hàng tiêu đề nhóm nhận bộ đếm "N chỉ tiêu · M thiếu" của bản vẽ, và con số "thiếu"
  lấy từ `tienDo.ts` chứ không đếm lại tại chỗ. Bốn chỗ trên cùng màn nói về cùng một tập hợp
  (thanh `Progress`, chip từng nhóm, bộ đếm hàng nhóm, câu "Thiếu N ô" ở chân trang) — bốn phép
  đếm riêng là cách để một hôm nào đó thanh tiến độ nói "đủ" trong khi chân trang vẫn chặn nộp.
  Ca test khoá đúng điều đó: đọc số của chip rồi đòi hàng nhóm nói cùng con số.

Ruling 122: viền nét đứt cho ô Ghi chú rỗng (bản vẽ mục 6) KHÔNG làm. Ô ghi chú hiện cố ý để viền
  trong suốt cho tới khi rê chuột / đặt con trỏ, có chú thích tại chỗ: 53 ô luôn-có-viền là 53 cái
  hộp rỗng tranh mắt với hai cột số. Nét đứt là cùng một lỗi, chỉ nhẹ hơn. Ghi vào "khác có chủ ý",
  không vào việc phải làm.

Ruling 123: nút "Xuất PDF" và "So kỳ trước" của bản vẽ (mục 6, phần header) KHÔNG dựng. §2 của
  spec đã chốt "Bản in / PDF hoãn sau demo… và không dựng nút *Xuất PDF* nào cả"; "So kỳ trước"
  chưa có endpoint nào đỡ. Một nút chết trên màn nhập liệu là chỗ tệ nhất để hứa suông.

Ruling 124: chia tab sinh ra một lỗi hình học mà bản vẽ không nói tới và không ca test nào bắt
  được: `FormModeBar` là `sticky bottom-0`, mà `sticky` chỉ dính khi có gì để cuộn. Trước đây bảng
  53 dòng luôn bảo đảm trang cao hơn khung nhìn; nay hai trong ba tab ngắn (tab Lịch sử của một báo
  cáo mới nạp có ĐÚNG một dòng) nên cụm nút "Lưu / Nộp báo cáo" đứng lửng giữa một trang trắng.
  Chữa bằng một chuỗi flex `ReportDetail` → `ReportForm` → `Tabs` (`min-h-full` + `flex-1`), KHÔNG
  bằng một hằng số chiều cao đoán tay: hằng số ấy sẽ sai ở đúng khung nhìn 1024×640 của bộ e2e.
  Bắt được bằng MẮT, qua ảnh chụp Playwright — jsdom không có layout nên đây là loại lỗi chỉ ảnh
  chụp hoặc e2e mới thấy.
  Giá nếu sai: một thanh cuộn thừa trên tab ngắn ở màn hình rất thấp.

Ruling 125: ba khối mới (tab, khối nhắc, thẻ tiến độ) được đo THẲNG, không chỉ chạm gián tiếp.
  Các ca sẵn có chỉ đụng tới chúng như phương tiện (mở tab để tới ô chữ C, đếm neo) nên một bản vá
  làm hỏng đúng khối mới vẫn có thể xanh. Thêm 11 ca: ba tab đúng nhãn và mặc định; hai ca "neo kéo
  tab về Chỉ tiêu" (chân trang và "Tới ô đầu") — đây là cửa canh bất biến `Tabs` có điều khiển;
  tab Lịch sử gọi đúng đường và in tên việc theo `mau.transitions`, dòng `seed_import` không sinh
  vệt trạng thái cụt đầu; thẻ tiến độ in đúng "n/m ô bắt buộc" và thanh mang cùng con số; mẫu
  không có ô bắt buộc thì không vẽ thanh; chip thiếu mang màu cảnh báo rồi trở về thường khi điền
  đủ; khối nhắc đếm "Một/Hai" và đổi động từ theo quyền; không điểm nào thì không vẽ khối; neo
  "Tới ô đầu" chỉ hiện khi có chỗ nhảy tới.

**Tự kiểm:** `tsc -b` sạch · frontend `npm test` **915/915 xanh** (902 trước; +2 ca bộ đếm hàng
nhóm, +11 ca của ba khối mới; 25 ca của `ReportForm.test.tsx` đã đổi theo cấu trúc tab mới, không
ca nào bị xoá) · **5/5 đột biến thử đều bị bắt**: `daDienO` luôn `true` (4 ca đỏ) · bỏ
`onNhayToiO` ở chân trang (1) · luôn in "Hai điểm" (1) · hàng nhóm in `soThieu={0}` (2) · chip
thiếu mất màu cảnh báo (1) · `oxlint` **33 cảnh báo, đúng bằng trước** · HEAD `83ec676`,
không một commit.

---

## DỰNG LẠI BỐN PRIMITIVE (Button · Card · Badge · Table)

Vì sao có phần này: đợt redesign trước ĐÃ ĐỔI THEME chứ chưa DỰNG LẠI. Kiểm kê 21 primitive
shadcn đã cài cho ra 9 dùng thật, 5 chỉ dùng nội bộ, **7 chưa ai gọi lần nào** (`avatar`, `card`,
`dialog`, `label`, `select`, `sonner`, `table`) — trong khi bốn thứ chúng thay thế được vẽ tay
khắp nơi: `Card` ≥8 bản sao, `Badge` 7 `<span>` + `Chip.tsx`, `Table` 4 bảng thô, và `Button` có
**BỐN** hệ thống cạnh tranh đẻ ra sáu chiều cao nút khác nhau. Đó là câu trả lời cho "sao vẫn
không giống design".

Ruling 126: `Chip.tsx` KHÔNG bị xoá dù README gói bàn giao ghi "Chip → Badge". `Chip` không phải
  primitive trình bày — nó biết sáu trạng thái báo cáo, sáu nhãn tiếng Việt, và luật "nguồn `seed`
  vẽ viền rỗng". Đó là tri thức nghiệp vụ. Chỉ phần VỎ đi xuống `Badge`; API (`kind`/`outline`/
  `testId`/`ariaDisabled`) và bảy nơi gọi không đổi một ký tự.
  Giá nếu sai: một lớp bọc mỏng phải gỡ sau, rẻ.

Ruling 127: màu của `Chip` và của mọi huy hiệu quản trị cấp qua `className`, KHÔNG thêm variant
  vào `badge.tsx`. `shadcn add badge` lần sau sẽ ghi đè tệp. Cùng tiền lệ `NhacTruocDuyet.tsx` đã
  đặt với `Alert`. Đã nâng thành bất biến ở §10 của spec.

Ruling 128: huy hiệu nào VỐN có viền thì dựng bằng `variant="outline"`, nào vốn không có thì
  `variant="secondary"` — không để primitive vẽ thêm một đường viền chưa từng tồn tại. Một quy
  tắc, áp cho cả sáu huy hiệu tay ở ba màn quản trị. Mã mẫu `FM01` ban đầu làm sai theo brief
  (`secondary`, mất hairline) trong khi "Đầu mối" cùng chuỗi gốc lại giữ — sửa lại cho khớp.

Ruling 129: 24 ca ĐẾM utility trong `ui.test.tsx` giữ nguyên dù chúng KHÔNG còn canh bất biến cũ.
  `cn@0.3` là tailwind-merge: nó gỡ hẳn lớp bị ghi đè khỏi chuỗi, nên nhét một utility dư vào
  `Chip` làm đỏ 24 ca KẾT QUẢ nhưng **0 ca ĐẾM**. Lớp lỗi S1/P1 giờ bất khả thi về cấu trúc, và 24
  ca ấy nay canh một bất biến khác, thật không kém: `cn` phải CÒN là tailwind-merge (đo: thay bằng
  nối chuỗi thuần → đếm ra 3 và 2 → đỏ). Ghi chú đã viết thẳng vào tệp test.
  Giá nếu sai: 24 ca canh một thứ không ai định canh — nhưng thứ đó vẫn đáng canh.

Ruling 130: viền hàng bảng chuyển từ Ô sang DÒNG, theo shadcn. Giữ `border-b` trên `<td>` cạnh
  `border-b` của `TableRow` là viền đôi. Hệ quả: hack `[&_tbody_tr:last-child_td]:border-b-0` trên
  `<table>` của `UnitsTable`/`Reports` không còn cần — `TableBody` làm sẵn. Ca A5-h ở
  `Dashboard.test.tsx` (sinh ra ở vòng sửa 2 vì không ca nào khoá cái hack đó) được VIẾT LẠI cho
  đúng chỗ thực thi mới, không xoá: bất biến "dòng cuối không gạch dưới" không đổi.

Ruling 131: bảng của form nhập (`ReportForm.tsx`) ở lại `<table>` thuần. `Table` của shadcn tự bọc
  `<div overflow-x-auto>` **không nhận `className`**, nên không gắn được `max-h` vào đúng phần tử
  cuộn và `<thead sticky top-0>` của bảng 53 dòng sẽ chết. Đã ghi lý do ngay trên thẻ và nâng
  thành bất biến ở §10, để lần đọc lại sau không tưởng đây là chỗ sót.

Ruling 132: `py-0` thêm vào bốn hằng cỡ ô. `TableCell` khai `p-2` — đệm VIẾT TẮT bốn chiều — mà
  các hằng của kho chỉ truyền `px-3`, nên 8px trên+dưới lọt vào: đo thật Reports 36→49px mỗi dòng
  (+858px cho trang 66 dòng), StatusGrid 41→57px. Đây là loại lỗi một lát "chỉ đổi vỏ" vẫn đẻ ra
  được, và nó không đỏ ở đâu cả cho tới khi có ca khoá.

Ruling 133: `StatusGrid` tắt `hover:bg-muted/50` mà `TableRow` mang sẵn. Chỉ cột Đơn vị có
  `bg-card`, các ô kỳ trong suốt, nên hover mặc định cho ra dòng **sáng loang lổ**. Giữ đúng hiện
  trạng thay vì đẻ một hiệu ứng mới nửa vời. `UnitsTable` cũng tắt riêng cho dòng `aria-disabled`:
  một dòng vừa báo "không bấm được" vừa sáng lên khi rê chuột là hai tín hiệu ngược nhau.
  Giá nếu sai: mất một hiệu ứng rê chuột trên lưới trạng thái — thêm lại là 2 lớp.

**Tự kiểm:** `tsc -b` sạch · `npm test` **919/919 xanh** (915 trước; +1 ca khoá `rounded-md` của
Chip, +2 ca khoá `py-0`, +1 ca đếm; **không ca nào bị xoá**) · `oxlint` **33 cảnh báo, đúng bằng
trước** · đột biến thử: gỡ `py-0` khỏi `O_BANG` → đúng 1 ca đỏ · đo trên Chromium thật với CSS đã
build: cột Đơn vị của `StatusGrid` và cột Hành động của `Reports` vẫn dính (lệch 0px ở mọi vị trí
cuộn), chiều cao dòng về đúng 36/36/41px như trước · `components/ui/table.tsx` và
`components/ui/badge.tsx` **không đổi một dòng** — đó là điểm của cả bốn lát · không một commit.

**e2e: 50/50 xanh** trên cả hai khung nhìn (`desktop-1280` và `zoom-125`), chạy sau khi bật lại
Docker — kể cả bốn ca hình học khó nhất: C-Lát6 (không trang nào đẩy tài liệu rộng ra ngang),
C-T24/2 và 2b (hộp thoại nằm trên mọi lớp dính, đo bằng bắn tia pixel), C-T25/2 (khoảng cách dưới
titlebar).

**Rà bằng MẮT, 8 màn + 1 trạng thái cuộn** (e2e xanh vẫn không thấy được lỗi kiểu Ruling 124):
`/dashboard` · `/reports` (cả "Đã nộp" lẫn "Tất cả") · `/status` · ba màn quản trị · form nhập
(tab Chỉ tiêu và tab Lịch sử). Cột "Hành động" của `/reports` đo ở 1024: đẩy hết `scrollLeft`
88/88 mà cột vẫn dính mép phải, và vạch ngăn dòng CHẠY XUYÊN qua cột dính — nền `bg-card` của ô
dính không che mất `border-b` của `TableRow`, đúng thứ đáng ngờ nhất khi dời viền từ Ô sang DÒNG.

**Một khuyết tật thấy bằng mắt, CÓ TRƯỚC bốn lát này:** chip `Nháp` (`bg-muted`) đứng trong cột kỳ
đang chọn (`O_KY_CHON` = `bg-primary/5`) gần như tàng hình — ở cỡ thật nó đọc như chữ trần trong
khi mọi ô cạnh nó đọc như huy hiệu. Lát 3 làm chip thấp đi 24→20px nên yếu thêm một chút, nhưng
nguyên nhân là cặp màu, không phải lát 3. Chưa sửa: đây là quyết định thiết kế, không phải lỗi
dựng lại.

---

## CHỐT HIỆN TRẠNG SAU BỐN LÁT

Ruling 134: chip `draft` được cấp viền (`border-transparent` → `border-border`), LỆCH khỏi mockup
  status.html một cách có chủ ý. Nền nó là `bg-muted` (oklch L 0.97); ở lưới /status cột kỳ đang
  chọn tô `O_KY_CHON = bg-primary/5` ≈ L 0.96. Chênh 1% độ sáng: ở cỡ thật chip "Nháp" đọc như
  CHỮ TRẦN trong khi mọi ô cạnh nó đọc như huy hiệu, nên người xem lưới đọc ô đó là "chưa có gì"
  thay vì "có bản nháp" — sai nghĩa, không chỉ xấu. `--border` (L 0.923) tách bạch với CẢ HAI nền.
  Chọn cấp viền thay vì đổi nền `draft` hay đổi `O_KY_CHON`: hai đường kia sửa một ngữ cảnh mà
  đánh vào mọi ngữ cảnh khác (chip `draft` còn đứng ở /reports, đầu form, BaoPhuKy — đều trên
  `bg-card`), còn viền thì nhìn rõ ở cả ba. Cùng lối `missing` đã dùng, không phải một lối vẽ mới.
  Bắt được bằng MẮT qua ảnh chụp, không ca test nào bắt. Ca `kind=draft` trong `ui.test.tsx` được
  sửa khẳng định cho đúng bản mới, không xoá.
  Giá nếu sai: một đường hairline thừa quanh chip Nháp ở ba màn.

Ruling 135: tên app thống nhất là **HSSEQ**, không phải HSEQ. Trước đó app nói hai giọng: wordmark
  sidebar (thứ người dùng nhìn cả ngày) ghi HSSEQ, còn `<title>`, câu "Đăng nhập HSEQ" và tiêu đề
  FastAPI ghi HSEQ. Đổi 6 chuỗi người dùng thấy + 9 khẳng định trong `routes.test.tsx`. **KHÔNG**
  đụng tên CSDL/user `hseq`, biến `DATABASE_URL`, tên tệp tài liệu hay tên thư mục kho — đó là
  định danh hạ tầng, đổi chúng là một lần di trú chứ không phải một lần đổi thương hiệu. D10 của
  `docs/designs/hseq-platform-mvp-fm01.md` đã viết đè cho đúng.

**Tự kiểm:** `tsc -b` sạch · `npm test` **919/919** · `oxlint` **33** · **e2e 50/50 xanh** trên cả
hai khung nhìn · đo trên trình duyệt thật: viền chip Nháp `oklch(0.923 0.003 48.717)` trên nền ô
`oklab(… / 0.05)`, `<title>` trả về "HSSEQ · PTSC" · ảnh trước/sau xác nhận chip đã đọc ra hình
huy hiệu · không một commit.

---

## LÁT 5 — `Toast` TỰ VẼ → `sonner`

Món nợ cuối của §2 spec ("Toast → sonner", chốt từ lâu, chưa ai làm). `sonner` là primitive shadcn
thứ bảy nằm mồ côi; sau lát này còn bốn (`avatar`, `dialog`, `label`, `select`) và cả bốn mồ côi
vì app không có nhu cầu, không phải vì ai quên.

Ruling 136: giữ `--toast-cao`, đo trên `<ol data-sonner-toaster>`. README gói bàn giao mục 0.5 ghi
  thẳng "thay Toast bằng sonner thì PHẢI giữ cơ chế này", nên đây không phải chỗ để cân lại. Hai
  chi tiết chỉ lộ ra khi đo thật, không đọc tài liệu nào mà biết được:
  (a) sonner đặt toast `<li>` position:**absolute** bên trong `<ol>`, nên `<ol>` CAO 0px và
      `innerHeight - rect.top` trả về đúng 24px — dải chừa thiếu nguyên 54px chiều cao toast, và
      hỏng LẶNG LẼ. Chữa bằng `height: var(--front-toast-height)` (biến chính sonner đã tính).
  (b) đo trên `<ol>` chứ KHÔNG trên `<li>`: `<li>` mang `transition: transform .4s` lúc trượt vào,
      đo nó thì dải bò lên theo toast thay vì chừa đủ ngay từ khung hình đầu.
  Đột biến thử (gỡ `height`): **C-T24/2b đỏ ở CẢ HAI viewport**. Đáng ghi lại — **C-T24/2c vẫn
  XANH**, dù nó mới là ca mang tên "Toast không đè lên bất kỳ nút nào". Lưới cho lỗi này rốt cuộc
  chỉ có MỘT sợi, không phải hai như tên hai ca gợi ý.

Ruling 137: `role="status"` gắn tay bằng `MutationObserver`. sonner 2.0.8 **không phát ra thuộc
  tính `role` nào** — đếm trên `dist/index.js` và `index.mjs`: `role` 0 lần, `aria-live` 1 lần
  (trên `<section>` bọc ngoài) — và không có prop để truyền vai vào. Vai này là HỢP ĐỒNG: cả e2e
  lẫn bốn tệp test đơn tìm toast bằng `[role="status"]` + nội dung. Phải gắn lên chính
  `<li data-sonner-toast>`; đặt lên một thẻ con hẹp hơn là tự tay biến phép giao toast↔nút thành
  bằng chứng rỗng.
  Giá nếu sai: một observer nhỏ phải gỡ nếu sonner sau này tự cấp vai.

Ruling 138: `zIndex: 40` cho khay toast. Mặc định sonner là `999999999` — toast nổi trên cả hộp
  thoại. Mọi lớp nổi của kho (`dialog`/`sheet`/`tooltip`/`select`/`dropdown`) đều `z-50`; 40 đặt
  toast ngay dưới chúng, đúng thứ `C-T24/2b` đòi.

Ruling 139: **giữ prop `action`** — brief của tôi nói nó là mã chết, và tôi SAI. Tôi chỉ grep
  `--include="*.tsx"` nên bỏ sót `features/report/useChuyenTrangThai.ts` (tệp `.ts`) đang truyền
  `{label: 'Xem dashboard', onClick}`, cùng bốn người canh bám vào nó: `demo-path.spec.ts:441`
  (đường demo thật), `:852` (C-T24/2b), `:921` (C-T24/2c) và `useChuyenTrangThai.test.tsx:236`.
  Cũng không dùng `action: {label, onClick}` của sonner vì nó dựng ra `<button>`, mất vai `link`
  mà ba ca kia tìm bằng `getByRole('link')` — truyền thẳng một ReactElement `<a>` (sonner nhận
  `React.isValidElement`). Đây là lần thứ ba liên tiếp một subagent bắt được lỗi trong brief tôi
  viết; ba lần đều là lỗi ĐIỀU TRA, không phải lỗi phán đoán.

Ruling 140: `visibleToasts={1}` + `expand={false}`. Cả ý tưởng "chừa chỗ" giả định dải có chiều
  cao ỔN ĐỊNH; cho sonner xếp chồng 3 toast thì thanh thao tác nhảy mỗi lần một toast tới, tệ hơn
  hiện trạng. Bốn nơi gọi đều bắn đúng một thông báo một lúc. Đo: hover KHÔNG làm thanh nhảy —
  `--toast-cao` và cả hai hộp giống hệt từng pixel, vì `visibleToasts=1` làm trạng thái "bung"
  trùng trạng thái nghỉ.

Ruling 141: `theme="light"`, không để `"system"`. `sonner.tsx` gọi `useTheme()` của `next-themes`
  mà app **không mount `ThemeProvider` nào**, và khối `.dark` trong `index.css` có chú thích nói
  rõ nó là bảng màu CLI sinh ra, chưa ai chỉnh. Để `"system"` thì máy nào bật dark mode sẽ ra toast
  tối trên một app sáng toàn phần.

**Đổi trông thấy được:** toast từ panel tối ôm nội dung → thẻ trắng `--popover` 356×54px có viền
và bóng; link hành động từ `text-sky` sang `text-primary` navy, dời sang mép phải. Đổi màu link là
BẮT BUỘC chứ không phải thẩm mỹ: `--sky` (#c1e1f7) là màu chữ cho nền tối, trên nền trắng gần như
vô hình. Chữ tiếng Việt giữ nguyên văn toàn bộ.

**Tự kiểm:** `tsc -b` sạch · `npm test` **919/919** (32 tệp, exit 0) · `oxlint` **32** — giảm 1,
đúng cảnh báo `Toast.tsx only-export-components` mất đi cùng `useToast`, không cảnh báo mới ·
**e2e 50/50 xanh** · đo thật: `--toast-cao` 0px → **78px** → 0px, GIỐNG HỆT ở cả 1280×800 và
1024×640 · phép giao toast↔nút **rỗng ở cả hai viewport**, đo ở ba khoảnh khắc (đang trượt vào ·
đã lắng · đang hover) với 8 nút đang hiện · không một commit.

**Còn treo:** `role="status"` nay lồng trong `<section aria-live="polite">` của sonner — hai vùng
sống lồng nhau, có thể bị đọc hai lần. Chưa đo bằng trình đọc màn hình thật. Và dải chừa trả lại ở
4200ms chứ không 4000ms (hoạt ảnh trượt ra cộng thêm 200ms).
