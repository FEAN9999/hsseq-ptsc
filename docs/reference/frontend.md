# Frontend

Ứng dụng React ở `frontend/`: các trang, cách gác quyền, khoá cache, cách lưu số, phím tắt và định dạng số.

Nền: React 19, Vite, TypeScript, Tailwind v4, thành phần shadcn/ui, TanStack Query 5, zustand, zod, react-router 7, sonner cho thông báo. Test bằng vitest (jsdom). Lệnh ở [Cấu hình và lệnh](cau-hinh-va-lenh.md#frontend-chạy-từ-frontend).

## Trang

Bảng route ở `frontend/src/app/routes.tsx`.

| Đường dẫn | Trang | Gác |
|---|---|---|
| `/login` | Đăng nhập | Không |
| `/403` | Không có quyền | Không |
| `/dashboard` | Dashboard | Phiên đăng nhập |
| `/reports` | Danh sách báo cáo | Phiên đăng nhập |
| `/reports/:id` | Một báo cáo | Phiên đăng nhập |
| `/status` | Tình trạng nộp | Phiên đăng nhập |
| `/admin/templates` | Mẫu báo cáo, mở và đóng kỳ | Phiên đăng nhập |
| `/admin/org` | Tổ chức (chỉ xem) | Phiên đăng nhập |
| `/admin/users` | Người dùng (chỉ xem) | Phiên đăng nhập |
| `/` | Chuyển tiếp: có `dashboard.view` thì sang `/dashboard`, không thì `/reports` | Phiên đăng nhập |
| `*` | Không tìm thấy | Không |

Route chỉ gác phiên (`RequireAuth` trong `frontend/src/app/router.tsx`), không gác quyền. Mục menu ẩn theo quyền, còn gõ thẳng địa chỉ thì trang vẫn mở và API trả 403, trang hiện câu lỗi tiếng Việt. Backend là nơi duy nhất quyết định quyền.

Ba trang quản trị chỉ đọc, trừ thao tác mở và đóng kỳ. API chưa có endpoint tạo hay sửa mẫu, đơn vị, người dùng.

## Phiên đăng nhập

- Đăng nhập gọi `POST /auth/login`, rồi `GET /auth/me` để lấy người dùng, đơn vị và danh sách quyền.
- Token lưu trong `sessionStorage`, khoá `hseq.token`: sống qua lần tải lại trang, mất khi đóng tab, không chia sẻ giữa các tab.
- Quyền không lưu. Tải lại trang thì `RequireAuth` gọi lại `GET /auth/me`.
- Không có token: chuyển sang `/login?next=<đường dẫn đang mở>`.
- Bất kỳ lời gọi API nào nhận 401 (trừ chính `/auth/login`) đều đăng xuất và chuyển sang `/login?next=...`.
- Sau đăng nhập: đi tới `next` nếu đó là đường dẫn nội bộ an toàn. Không có thì tài khoản có vai `reporter` vào `/reports`, còn lại vào `/dashboard`.
- Trước khi đăng nhập, trang gọi `/health` để đánh thức API (Render free ngủ sau 15 phút không có request). Sau 3 giây chưa xong thì hiện dòng báo đang đánh thức máy chủ.

## Menu

Mục menu ở `frontend/src/components/Sidebar.tsx`, mỗi mục hiện theo một quyền:

| Mục | Quyền |
|---|---|
| Dashboard | `dashboard.view` |
| Duyệt báo cáo / Báo cáo / Báo cáo của đơn vị | `report.approve`, `report.view_all`, hoặc một trong `report.edit`, `report.submit`, `report.view_own_unit` (xét theo thứ tự đó, `frontend/src/features/reports/nhanTrang.ts`) |
| Tình trạng nộp | `status.view` |
| Mẫu báo cáo | `template.manage` |
| Tổ chức | `org.manage` |
| Người dùng | `user.manage` |

Bộ chọn kỳ nằm trên sidebar, đổi tham số `?period=` trên địa chỉ, chỉ hiện với người có `dashboard.view` hoặc `status.view`. Kỳ mặc định khi địa chỉ chưa có `?period=` là `KY_MAC_DINH = '2026-08'` trong `frontend/src/lib/format.ts`.

## Form báo cáo

Form nằm ở `frontend/src/features/report/ReportForm.tsx`, có ba thẻ: "Chỉ tiêu", "Hoạt động nổi bật" (ba ô chữ C1 đến C3), "Lịch sử thao tác".

Mọi quyết định hiển thị đọc quyền, không đọc tên vai trò:

- Ô nhập hiện khi trạng thái hiện tại có `is_editable` VÀ người dùng có `report.edit`.
- Nút chuyển trạng thái lấy từ `transitions` của `GET /templates/{code}`: bước chuyển có `from_state` là trạng thái hiện tại và `required_permission` nằm trong quyền của người dùng.
- Cột "Lệch" (số nhập trừ số hệ thống tính) chỉ hiện với người có `report.approve`.
- Bước chuyển có `requires_note` mở hộp thoại đòi lý do ít nhất 10 ký tự.

Cột nào nhập được theo `agg_type` do `frontend/src/features/report/cellPolicy.ts` quyết, chép cùng bảng với `backend/app/domain/report_rules.py`. Lý do có hai bản ở [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md).

### Cách lưu

Lớp lưu ở `frontend/src/features/report/useSaveValues.ts`:

- Không tự lưu theo đồng hồ. Rời một ô có sửa thì hẹn lưu sau 1,5 giây (`DO_TRE = 1500`), gộp mọi ô đã đổi từ lần lưu trước thành MỘT lời gọi `PUT /reports/{id}/values`.
- Nút "Lưu" và Ctrl+S (Cmd+S trên macOS) lưu ngay.
- Chỉ gửi ô đã đổi. Số và ô chữ đi chung một request, nên một lần lưu là một `version`.
- `version` mới lấy từ phản hồi, không tự cộng. Chuyển trạng thái cũng trả `version` mới và form nhận lấy số đó.
- Lỗi mạng: ô vẫn nằm trong hàng chờ, hiện banner mất mạng, tự gửi lại khi trình duyệt báo có mạng.
- 409 kèm `values`: người khác vừa sửa. Form vẽ lại cột chỉ đọc từ chính thân lỗi và hiện banner xung đột.
- Còn ô chưa lưu mà chuyển sang trang khác trong ứng dụng hoặc đóng tab thì được hỏi lại trước khi rời.
- Bấm "Nộp" thì lưu trước. Lưu hỏng thì không nộp. Còn ô bắt buộc trống thì chặn ngay trên form, không gọi API.
- Số trong form lấy một lần lúc trang mở, từ cache nếu có. Lượt tải nền về sau đổi trạng thái và nút, không đổi ô số. Đây là lỗi chưa sửa, hệ quả ở [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md#cái-giá).

### Phím tắt

Ở `frontend/src/features/report/useKeyboardNav.tsx`:

| Phím | Việc |
|---|---|
| Enter hoặc ↓ | Ô nhập kế tiếp cùng cột. Không gửi form. |
| Shift+Enter hoặc ↑ | Ô nhập phía trên cùng cột. |
| Tab | Ô nhập kế tiếp theo thứ tự trái sang phải, bỏ qua ô chỉ đọc. Dùng hành vi sẵn có của trình duyệt. |
| Esc | Trả ô về giá trị trước khi sửa. |
| Ctrl+S hoặc Cmd+S | Chốt ô đang gõ rồi lưu. |

## Số

### Nhập

`parseViNumber` trong `frontend/src/lib/parseViNumber.ts` đọc số kiểu Việt Nam:

- Dấu phẩy là dấu thập phân: `12,5` là 12,5.
- Dấu chấm chỉ hợp lệ khi là dấu ngăn nghìn đúng nhóm ba chữ số: `1.234.567` hợp lệ. `1284500.00` hay `0.5` bị báo `Chỉ nhập số` thay vì bị đoán sai thành số khác.
- Khoảng trắng bị bỏ qua. Ô rỗng là không có giá trị.

Câu báo lỗi, dùng chung với backend:

| Trường hợp | Câu báo |
|---|---|
| Ký tự lạ, dấu chấm sai nhóm | `Chỉ nhập số` |
| Số âm | `Số không được âm` |
| Từ 10^16 trở lên | `Số quá lớn, tối đa 16 chữ số phần nguyên` |
| Quá số chữ số thập phân của chỉ tiêu | `Chỉ nhận tối đa N chữ số thập phân` |

### Hiển thị

`formatNumber` trong `frontend/src/lib/format.ts` dùng `Intl.NumberFormat('vi-VN')` với đúng số chữ số thập phân của chỉ tiêu. Giá trị `null` hiện một dấu gạch dài, không hiện 0, vì ô trống và ô bằng 0 mang nghĩa khác nhau trong báo cáo.

## Khoá cache

TanStack Query cấu hình ở `frontend/src/app/queryClient.ts`: dữ liệu coi là mới trong 30 giây, tải lại khi cửa sổ được focus lại, không thử lại lỗi 4xx, lỗi khác thử lại tối đa 3 lần.

| Khoá | Dữ liệu |
|---|---|
| `['templates']` | Danh sách mẫu |
| `['template', code]` | Danh mục một mẫu |
| `['templates', 'FM01', 'periods']` | Các kỳ của FM01 |
| `['reports', 'FM01', 'submitted' \| 'all']` | Danh sách báo cáo. Người có `report.approve` hoặc `report.view_all` mặc định chỉ tải báo cáo `submitted`, bật xem tất cả thì tải hết. |
| `['report', id]` | Một báo cáo |
| `['report', id, 'history']` | Lịch sử thao tác của báo cáo |
| `['dashboard', 'summary', period]` | KPI dashboard |
| `['dashboard', 'units', period]` | Bảng đơn vị trên dashboard |
| `['status', 'FM01', from, to]` | Lưới tình trạng nộp |
| `['org-units']` | Cây đơn vị |
| `['users']` | Danh sách người dùng |

Sau mỗi lần lưu số hoặc chuyển trạng thái, `invalidateReportQueries` (`frontend/src/api/invalidate.ts`) làm mới `['dashboard']`, `['status']`, `['reports']` và `['report', id]`. Làm mới `['report', id]` cũng làm mới lịch sử của nó vì khoá lịch sử bắt đầu bằng khoá đó.

Mã mẫu `'FM01'` đang viết cứng ở `Dashboard.tsx`, `Status.tsx`, `QuanTriMau.tsx`, `Sidebar.tsx` và `useReportList.ts`. Xem [Nền tảng theo dữ liệu](../explanation/nen-tang-theo-du-lieu.md).

## Gọi API

`frontend/src/api/client.ts` là nơi duy nhất biết địa chỉ API: tiền tố `VITE_API_BASE`, mặc định `/api/v1`. Lỗi từ server thành `ApiError` mang `status`, `detail` và danh sách `errors` nếu có. Phản hồi 200 mà không phải JSON bị chặn lại và báo lỗi có nhắc tên `VITE_API_BASE`.

## Test

| Lệnh (từ `frontend/`) | Việc |
|---|---|
| `npm test` | Build rồi chạy vitest. |
| `npx vitest run src/lib` | Chạy test của một thư mục mà không build. Riêng test `cascade` cần `dist/` đã có. |
| `npm run lint` | `oxlint`. |

Một số test đọc thẳng file trên đĩa thay vì chạy React:

- `src/components/ui/cascade.test.ts` đọc CSS đã build trong `dist/`, nên `npm test` build trước.
- `src/app/routeScan.test.ts` quét mọi đích điều hướng trong `src/` và đòi mỗi đích là một route có thật.
- `src/app/casingScan.test.ts` đòi không có hai file nào chỉ khác nhau chữ hoa chữ thường. Ổ đĩa macOS mặc định không phân biệt hoa thường, nên `Dialog.tsx` và `dialog.tsx` của shadcn sẽ đè nhau. Vì vậy thành phần của dự án có tên riêng như `DialogXacNhan.tsx`, `SkeletonDong.tsx`.

Test giao diện đầu cuối nằm ở gói `e2e/` riêng, xem [Cấu hình và lệnh](cau-hinh-va-lenh.md#e2e-chạy-từ-e2e).

## Xem thêm

- [API](api.md): các endpoint mà trang gọi.
- [Quyền và quy trình](quyen-va-quy-trinh.md): quyền nào mở mục nào.
- [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md): vì sao lưu theo lượt, khoá phiên bản và kiểm hai phía.
- [Kiến trúc](../explanation/kien-truc.md): frontend nằm ở đâu trong toàn hệ thống.
