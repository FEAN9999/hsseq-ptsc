# Quyền và quy trình

Trang này liệt kê ai được làm gì, mỗi người xem được báo cáo của đơn vị nào, và một báo cáo đi qua những trạng thái nào.

Nguồn: dữ liệu ở `backend/app/seed/__init__.py`, phạm vi ở `backend/app/api/deps.py`, chuyển trạng thái ở `backend/app/services/workflow.py`. Khi trang này và mã lệch nhau, mã đúng.

## Quyền

Seed khai 14 quyền. Cột "Nơi kiểm" cho biết mã nào thực sự đọc quyền đó.

| Quyền | Nơi kiểm | `admin_atcl` | `reporter` | `viewer` |
|---|---|:-:|:-:|:-:|
| `report.create` | `POST /reports` | ✓ | ✓ | |
| `report.edit` | `PUT /reports/{id}/values`. Form chỉ hiện ô nhập khi có quyền này. | ✓ | ✓ | |
| `report.submit` | Bước chuyển `submit`, qua cột `workflow_transition.required_permission_id` | ✓ | ✓ | |
| `report.return` | Bước chuyển `return` và `reopen`, cùng cách trên | ✓ | | |
| `report.approve` | Bước chuyển `approve`. Frontend: nhãn "Duyệt báo cáo" và danh sách chờ duyệt. | ✓ | | |
| `report.view_own_unit` | Phạm vi xem báo cáo, xem mục dưới | ✓ | ✓ | |
| `report.view_all` | Phạm vi xem báo cáo, xem mục dưới | ✓ | | ✓ |
| `dashboard.view` | `GET /dashboard/*`, mục "Dashboard", chọn đích khi mở địa chỉ `/` | ✓ | | ✓ |
| `status.view` | `GET /status`, mục "Tình trạng nộp" | ✓ | | ✓ |
| `template.manage` | `PATCH /templates/{code}/periods/{period_key}`, mục "Mẫu báo cáo" | ✓ | | |
| `org.manage` | Chỉ ẩn hiện mục "Tổ chức" ở frontend. `GET /org-units` không đòi quyền này. | ✓ | | |
| `user.manage` | `GET /users`, mục "Người dùng" | ✓ | | |
| `workflow.manage` | Chưa có mã nào kiểm | ✓ | | |
| `audit.view` | Chưa có mã nào kiểm. `GET /reports/{id}/history` cố ý không đòi quyền này để người nhập xem được lịch sử báo cáo của mình. | ✓ | | |

Quyền của ba bước chuyển không nằm trong mã Python. Mỗi dòng `workflow_transition` trỏ tới một quyền, và `kiem_quyen_trong_pham_vi` đọc quyền đó lúc chuyển. Đổi quyền của một bước chuyển là sửa dữ liệu, không phải sửa mã.

## Vai trò

| Mã | Tên | Quyền |
|---|---|---|
| `admin_atcl` | Admin Ban ATCL | Cả 14 quyền |
| `reporter` | Người nhập | `report.create`, `report.edit`, `report.submit`, `report.view_own_unit` |
| `viewer` | Người xem | `report.view_all`, `dashboard.view`, `status.view` |

Frontend chọn mục menu và chế độ của form theo quyền, không theo tên vai trò. Chỗ duy nhất đọc tên vai trò là trang đăng nhập: có vai `reporter` thì vào `/reports`, còn lại vào `/dashboard` (`frontend/src/pages/Login.tsx`).

## Phạm vi xem báo cáo

Phạm vi gắn với vai trò, nằm ở cột `user_role.scope_org_unit_id`. NULL nghĩa là toàn Tổng công ty. Cột `app_user.org_unit_id` (đơn vị công tác) không ảnh hưởng tới phạm vi.

Mỗi request, server gộp phạm vi theo từng mã quyền qua mọi vai trò của người dùng. Nếu một vai trò cấp quyền đó với phạm vi NULL thì kết quả là NULL, bất kể vai trò khác hẹp hơn.

Hàm `pham_vi_bao_cao` là nơi duy nhất quyết định phạm vi. Nó xét theo thứ tự:

1. Có `report.view_all`: trả phạm vi của quyền này. NULL là toàn Tổng công ty, còn gán đơn vị thì chỉ các đơn vị đó.
2. Không có, nhưng có `report.view_own_unit`: trả phạm vi của quyền này. Nếu phạm vi là NULL thì trả 403 `Tài khoản chưa được gán đơn vị. Liên hệ Ban ATCL để cấp lại quyền.`
3. Không có cả hai: 403 `Bạn không có quyền xem báo cáo`.

Những chỗ lọc theo phạm vi: danh sách, chi tiết, lịch sử, ghi số và chuyển trạng thái báo cáo, hai endpoint dashboard, tình trạng nộp. Các endpoint danh mục (`/templates`, `/org-units`) cũng gọi hàm này để chặn người không có quyền xem báo cáo, nhưng không lọc kết quả.

Ví dụ với seed: `u05@ptsc.local` chỉ thấy báo cáo của U05. Mở báo cáo của U06 bằng id trả 403 `Bạn không có quyền xem báo cáo của đơn vị này`.

## Trạng thái

| Mã | Tên | Ban đầu | Cho sửa số | Cộng vào tổng |
|---|---|:-:|:-:|:-:|
| `draft` | Nháp | ✓ | ✓ | |
| `submitted` | Đã nộp | | | |
| `returned` | Trả lại | | ✓ | |
| `approved` | Đã duyệt | | | ✓ |

- "Cho sửa số" là cột `is_editable`. Ghi số vào báo cáo ở trạng thái khác trả 403 `Báo cáo ở trạng thái không cho sửa`.
- "Cộng vào tổng" là cột `counts_in_totals`. Chỉ báo cáo ở trạng thái này được cộng vào dashboard và vào lũy kế của các kỳ sau.
- Cột `is_terminal` có trong bảng nhưng chưa có mã nào đọc, nên seed không đặt trạng thái nào là cuối.

## Bước chuyển

```
                 submit "Nộp báo cáo"               approve "Duyệt"
      draft ─────────────────────────► submitted ─────────────────► approved
                                        │     ▲                        │
                        return "Trả lại"│     │submit "Nộp lại"        │reopen "Mở lại"
                                        ▼     │                        │
                                       returned ◄──────────────────────┘
```

| `action_code` | Từ | Sang | Quyền | Bắt buộc ghi chú | Tên |
|---|---|---|---|:-:|---|
| `submit` | `draft` | `submitted` | `report.submit` | | Nộp báo cáo |
| `submit` | `returned` | `submitted` | `report.submit` | | Nộp lại |
| `return` | `submitted` | `returned` | `report.return` | ✓ | Trả lại |
| `approve` | `submitted` | `approved` | `report.approve` | | Duyệt |
| `reopen` | `approved` | `returned` | `report.return` | ✓ | Mở lại |

Mọi bước chuyển thành công đều:

- đổi trạng thái, tăng `version` thêm 1, đặt `source = "live"`;
- ghi một dòng `audit_log` với ảnh chụp trước và sau, trong cùng transaction.

Riêng từng loại:

- `submit` kiểm mọi ô bắt buộc của cả báo cáo. Thiếu ô nào thì trả 400 kèm danh sách chỉ tiêu. Nộp thành công đặt `submitted_at`. Lần nộp đầu tiên còn đặt `first_submitted_at` và `is_late` (nộp sau `due_at` của kỳ).
- `approve`, `return`, `reopen` đặt `decided_at`, `decided_by`, `decision_note`.
- `return` và `reopen` bắt buộc có ghi chú. Server chỉ đòi ghi chú không rỗng. Hộp thoại ở frontend đòi ít nhất 10 ký tự (`TOI_THIEU_GHI_CHU` trong `frontend/src/components/ui/DialogXacNhan.tsx`).
- `reopen` đưa báo cáo đã duyệt về `returned`, tức là rút nó khỏi tổng dashboard và lũy kế cho tới khi được duyệt lại.

Thứ tự kiểm lỗi của `POST /reports/{id}/transition` nằm ở [API](api.md).

Hai chỗ trong mã phụ thuộc vào mã hành động tiếng Anh: `"submit"` (kiểm ô bắt buộc, đặt thời điểm nộp) và `approve`/`return`/`reopen` (`CAC_ACTION_QUYET_DINH`, ghi người quyết định). Một mẫu báo cáo mới dùng mã hành động khác vẫn chuyển trạng thái được nhưng mất hai hành vi này. Xem [Nền tảng theo dữ liệu](../explanation/nen-tang-theo-du-lieu.md).

## Kỳ báo cáo

Seed tạo bốn kỳ cho mẫu FM01. Hạn nộp là 23:59:59 giờ Việt Nam.

| Kỳ | Từ ngày | Đến ngày | Hạn nộp | Trạng thái |
|---|---|---|---|---|
| `2026-06` | 01/06/2026 | 30/06/2026 | 05/07/2026 | Đóng |
| `2026-07` | 01/07/2026 | 31/07/2026 | 05/08/2026 | Đóng |
| `2026-08` | 01/08/2026 | 31/08/2026 | 05/10/2026 | Mở |
| `2026-09` | 01/09/2026 | 30/09/2026 | 05/10/2026 | Mở |

Kỳ `2026-08` là kỳ demo. Hạn của nó được đẩy sang 05/10/2026 để lượt nộp trong buổi demo không bị gắn nhãn nộp muộn.

Đóng kỳ chỉ có hai tác dụng:

1. `POST /reports` cho kỳ đó trả 409 `Kỳ báo cáo đã đóng, không thể tạo báo cáo mới`.
2. Dòng trống (đơn vị chưa tạo báo cáo) của kỳ đó biến khỏi `GET /reports`.

Báo cáo đã tạo trong kỳ đóng vẫn sửa, nộp và duyệt được. Cách mở hoặc đóng kỳ ở [Cách mở, đóng và thêm kỳ báo cáo](../how-to/mo-dong-va-them-ky.md).

## Đơn vị

Seed tạo 35 đơn vị, không đơn vị nào có `parent_id`:

| Mã | Tên (tạm) | `type` | Phải nộp |
|---|---|---|:-:|
| `PTSC` | Tổng công ty CP Dịch vụ Kỹ thuật Dầu khí | `corp` | |
| `BAN01` đến `BAN12` | Ban 01 (tên tạm) ... | `dept` | |
| `U01` đến `U17` | Đơn vị thành viên 01 (tên tạm) ... | `member_unit` | ✓ |
| `P01` đến `P05` | Ban dự án 01 (tên tạm) ... | `project_board` | ✓ |

Tên đơn vị trong seed là tên tạm. Seed chỉ chèn khi chưa có, không bao giờ cập nhật dòng đã có, nên sửa danh sách `ORG_UNITS` không đổi được tên trên database đã seed. Cách đổi ở [Cách đổi tên đơn vị và quản lý tài khoản](../how-to/doi-don-vi-va-tai-khoan.md).

## Tài khoản seed

| Email | Vai trò | Phạm vi | Đơn vị công tác |
|---|---|---|---|
| `admin@ptsc.local` | `admin_atcl` | Toàn Tổng công ty | PTSC |
| `u01@ptsc.local` đến `u22@ptsc.local` | `reporter` | Một đơn vị, xem dưới | Chính đơn vị đó |
| `viewer@ptsc.local` | `viewer` | Toàn Tổng công ty | PTSC |

Người nhập thứ n gắn với đơn vị phải nộp thứ n theo thứ tự `id`: `u01` là U01, `u17` là U17, `u18` là P01, `u22` là P05. Họ tên là "Người nhập" cộng mã đơn vị, ví dụ "Người nhập P05".

Mọi tài khoản seed dùng chung một mật khẩu. Seed đọc nó từ biến môi trường `SEED_PASSWORD` lúc tạo tài khoản. Không đặt biến này thì dùng giá trị mặc định ghi ở `backend/app/seed/__init__.py` (hàm `_seed_users`). Tài liệu này cố ý không chép mật khẩu ra.

Đổi `SEED_PASSWORD` sau khi đã seed không đổi mật khẩu của tài khoản đã có, vì seed không cập nhật dòng cũ.

Seed còn làm một việc sau khi nạp fixture: báo cáo kỳ `2026-08` của đơn vị thứ 22 (P05) được đưa về `draft` để làm đường demo nộp và duyệt. Việc này chỉ chạy khi báo cáo đó còn `source = "seed"`, nên không đè lên thao tác thật.

## Xem thêm

- [API](api.md): mã lỗi và thứ tự kiểm của từng endpoint.
- [Mô hình dữ liệu](mo-hinh-du-lieu.md): các bảng `role`, `user_role`, `workflow_state`, `workflow_transition`.
- [Nền tảng theo dữ liệu](../explanation/nen-tang-theo-du-lieu.md): phần nào của quy trình nằm trong dữ liệu, phần nào còn cứng trong mã.
- [Vòng báo cáo đầu tiên](../tutorials/vong-bao-cao-dau-tien.md): đi hết vòng nộp, trả lại, duyệt với các tài khoản trên.
