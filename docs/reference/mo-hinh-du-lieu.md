# Mô hình dữ liệu

Cơ sở dữ liệu có 18 bảng và 1 view. Ba migration Alembic tạo ra toàn bộ, không có bảng nào được tạo bằng tay.

Nguồn: model ORM ở `backend/app/models/*.py`, migration ở `backend/alembic/versions/`. Khi trang này và mã lệch nhau, mã đúng.

## Migration

| Mã | File | Việc làm |
|---|---|---|
| `0001` | `0001_schema.py` | Tạo 18 bảng, 2 chỉ mục. |
| `0002` | `0002_view.py` | Tạo view `v_report_value_computed`. |
| `0003` | `0003_view_bao_cao_moi.py` | Xoá rồi tạo lại view: báo cáo chưa có dòng `report_value` nào vẫn ra số lũy kế. |

Chạy `alembic upgrade head` (từ thư mục `backend/`) để lên bản mới nhất. Image Docker của API tự chạy lệnh này mỗi lần khởi động, xem [Cấu hình và lệnh](cau-hinh-va-lenh.md).

## Sơ đồ quan hệ

Mũi tên `──►` nghĩa là "có khoá ngoại trỏ tới".

```
role_permission ──► role, permission
user_role ──► app_user, role, org_unit (scope_org_unit_id, có thể NULL)
app_user ──► org_unit
org_unit ──► org_unit (parent_id, có thể NULL)

template_section ──► report_template
indicator ──► report_template, template_section
template_text_field ──► report_template
workflow_state ──► report_template
workflow_transition ──► report_template, workflow_state (from, to), permission
reporting_period ──► report_template

report ──► report_template, org_unit, reporting_period, workflow_state,
           app_user (created_by, decided_by)
report_value ──► report (ON DELETE CASCADE), indicator
report_text ──► report (ON DELETE CASCADE)
opening_balance ──► org_unit, indicator, reporting_period

audit_log ──► app_user (actor_id)
audit_log.entity + entity_id: tham chiếu mềm, không có khoá ngoại
```

## Tổ chức và quyền

### `org_unit`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `code` | varchar(32), UNIQUE | `PTSC`, `BAN01`, `U01`, `P05` |
| `name` | varchar(255) | |
| `type` | varchar(16) | `corp`, `dept`, `member_unit`, `project_board` |
| `parent_id` | integer, NULL | Seed không gán nên cây đơn vị phẳng. `GET /org-units` vẫn dựng cây theo cột này. |
| `is_reporting` | boolean | `true` với 22 đơn vị phải nộp báo cáo (U01..U17, P01..P05). |
| `active` | boolean | Có lưu, chưa có mã nào đọc. |

### `app_user`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `email` | varchar(255), UNIQUE | Dùng để đăng nhập. |
| `full_name` | varchar(255) | |
| `position` | varchar(255), NULL | Chức vụ. |
| `password_hash` | varchar(255) | Băm bcrypt qua `pwdlib`. |
| `org_unit_id` | integer | Đơn vị công tác, hiện ở `GET /auth/me`. Phạm vi xem báo cáo KHÔNG lấy từ cột này. |
| `active` | boolean | `false` thì đăng nhập trả 401, token đã cấp cũng bị từ chối ngay (`backend/app/api/deps.py`). |

### `role`, `permission`, `role_permission`

- `role`: `id`, `code` varchar(32), `name` varchar(255).
- `permission`: `id`, `code` varchar(64).
- `role_permission`: khoá chính ghép (`role_id`, `permission_id`).

`role.code` và `permission.code` không có ràng buộc UNIQUE. Seed tránh trùng bằng cách tra trước khi chèn.

### `user_role`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `user_id` | integer, khoá chính ghép | |
| `role_id` | integer, khoá chính ghép | |
| `scope_org_unit_id` | integer, NULL | Đơn vị được xem. NULL là toàn Tổng công ty. |

Khoá chính là (`user_id`, `role_id`) nên mỗi người chỉ có một phạm vi cho mỗi vai trò. Cách phạm vi quyết định ai xem được gì nằm ở [Quyền và quy trình](quyen-va-quy-trinh.md#phạm-vi-xem-báo-cáo).

## Danh mục mẫu

### `report_template`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `code` | varchar(16) | `FM01`. Không có UNIQUE. |
| `name_vi`, `name_en` | varchar(255) | `name_en` có thể NULL. |
| `period_type` | varchar(16) | `month`. |
| `version` | integer | Có lưu, chưa có mã nào đọc. |
| `active` | boolean | Dashboard chỉ đọc mẫu đang `active`. |

### `template_section`

`id`, `template_id`, `code` varchar(8) (`A`, `B-1` đến `B-9`, `C`), `name_vi`, `name_en` (NULL), `sort_order`.

### `indicator`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `template_id`, `section_id` | integer | |
| `code` | varchar(32) | UNIQUE cùng `template_id`. Ví dụ `B-1.1`. |
| `name_vi`, `name_en` | varchar(500) | `name_en` có thể NULL. |
| `unit` | varchar(32), NULL | Đơn vị đo. |
| `agg_type` | varchar(16) | `sum`, `counter`, `snapshot`, `computed`. Quyết định cột nào nhập được, xem [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md). |
| `formula` | varchar(500), NULL | Chỉ dòng `computed` dùng: danh sách mã cần cộng, ngăn bằng dấu phẩy, ví dụ `B-1.1,B-1.2,B-1.3`. |
| `reset_rule` | varchar(32) | `none`, `on_event:LTI`, `yearly`, `project_start`. Có lưu, API không trả, chưa có mã nào đọc. |
| `decimals` | integer | Số chữ số thập phân cho phép. Server và form cùng đọc cột này. |
| `required` | boolean | Ô bắt buộc trước khi nộp. |
| `sort_order` | integer | |
| `active` | boolean | `false` thì chỉ tiêu biến khỏi `GET /templates/{code}`, khỏi màn hình báo cáo, khỏi phép kiểm ô bắt buộc và khỏi loader fixture. |

Danh mục FM01 hiện có 53 chỉ tiêu: 48 `sum`, 4 `counter`, 1 `computed`, 0 `snapshot`.

### `template_text_field`

`id`, `template_id`, `code` varchar(8) (`C1`, `C2`, `C3`), `label_vi` varchar(500), `sort_order`.

## Quy trình và kỳ

### `workflow_state`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id`, `template_id` | integer | |
| `code` | varchar(32) | `draft`, `submitted`, `returned`, `approved` |
| `name_vi` | varchar(255) | |
| `is_initial` | boolean | Trạng thái của báo cáo vừa tạo. |
| `is_terminal` | boolean | Có lưu, chưa có mã nào đọc. |
| `is_editable` | boolean | Chỉ trạng thái này cho sửa số. |
| `counts_in_totals` | boolean | Báo cáo ở trạng thái này được cộng vào dashboard và lũy kế. |
| `sort_order` | integer | |

### `workflow_transition`

`id`, `template_id`, `from_state_id`, `to_state_id`, `action_code` varchar(32), `name_vi` varchar(255), `required_permission_id`, `requires_note` boolean.

Năm bước chuyển của FM01 được liệt kê ở [Quyền và quy trình](quyen-va-quy-trinh.md#bước-chuyển).

### `reporting_period`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id`, `template_id` | integer | |
| `period_key` | varchar(16) | Dạng `YYYY-MM`, ví dụ `2026-08`. |
| `start_date`, `end_date` | date | View lũy kế so thứ tự kỳ bằng `start_date`. |
| `due_at` | timestamptz | Hạn nộp. Nộp lần đầu sau mốc này thì `report.is_late = true`. |
| `is_open` | boolean | Kỳ đóng thì không tạo được báo cáo mới. |

Không có UNIQUE trên (`template_id`, `period_key`), nhưng mã tra kỳ bằng `one_or_none()` (ví dụ `POST /reports`, `PATCH /templates/{code}/periods/{period_key}`). Hai dòng cùng mã kỳ sẽ làm các chỗ đó lỗi 500. Đừng chèn trùng.

## Báo cáo

### `report`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `template_id`, `org_unit_id`, `period_id` | integer | UNIQUE cả ba: mỗi đơn vị một báo cáo mỗi kỳ. |
| `state_id` | integer | Trạng thái hiện tại. |
| `version` | integer, NOT NULL | Bắt đầu từ 1, tăng 1 sau mỗi lượt `PUT values` hoặc `transition` thành công. Dùng để chặn ghi đè, xem [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md). |
| `source` | varchar(8) | `seed` (nạp từ fixture) hoặc `live`. Lượt ghi sống đầu tiên đổi sang `live`. |
| `report_no`, `location`, `report_date`, `reporter_name`, `reporter_position` | varchar / date, NULL | Phần đầu biểu mẫu. `GET /reports/{id}` trả ra và màn hình hiện khi có ít nhất một ô khác NULL, nhưng chưa có đường nào ghi vào. |
| `first_submitted_at` | timestamptz, NULL | Lần nộp đầu. |
| `submitted_at` | timestamptz, NULL | Lần nộp gần nhất. |
| `decided_at`, `decided_by`, `decision_note` | NULL | Lần duyệt, trả lại hoặc mở lại gần nhất. |
| `is_late` | boolean | Tính một lần ở lượt nộp đầu. |
| `created_by` | integer, NULL | Người tạo. |
| `updated_at` | timestamptz | Mặc định `now()`, ORM cập nhật mỗi lần sửa dòng. |

Chỉ mục `ix_report_org_period` trên (`org_unit_id`, `period_id`).

### `report_value`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `report_id` | integer | Xoá báo cáo thì xoá theo (CASCADE). |
| `indicator_id` | integer | UNIQUE cùng `report_id`. |
| `this_period` | numeric(18,2), NULL | Số tháng này. |
| `acc_prev_entered` | numeric(18,2), NULL | Lũy kế kỳ trước do người nhập ghi. Chỉ fixture ghi cột này. |
| `acc_total_entered` | numeric(18,2), NULL | Lũy kế do người nhập ghi. |
| `note` | text, NULL | Ghi chú dòng. Chuỗi rỗng lưu thành NULL. |

Chỉ mục `ix_report_value_indicator_report` trên (`indicator_id`, `report_id`).

Cột nào có số tuỳ `agg_type` và nguồn ghi:

| `agg_type` | Nhập qua API | Nạp từ fixture |
|---|---|---|
| `sum` | `this_period`. Hai cột `acc_*` bị đặt NULL ở mọi lượt ghi, lũy kế lấy từ view. | Cả ba cột theo file. |
| `counter` | `this_period` và `acc_total_entered`. | Cả ba cột theo file. |
| `snapshot` | `acc_total_entered`. | Cả ba cột theo file. |
| `computed` | Bị từ chối. Không lưu. | Dòng bị bỏ qua. |

Với `counter`, `GET /reports/{id}` không trả `acc_prev_entered` đã lưu. Ô "kỳ trước" nó trả là `acc_total_entered` của kỳ gần nhất trước đó có `counts_in_totals`.

### `report_text`

Khoá chính ghép (`report_id`, `field_code`), cột `content` text (NULL). Xoá báo cáo thì xoá theo (CASCADE). `field_code` là `C1`, `C2`, `C3`.

### `opening_balance`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `org_unit_id`, `indicator_id`, `period_id` | integer | UNIQUE cả ba. |
| `value` | numeric(18,2), NOT NULL | Số dư mang sang. |
| `source` | varchar(8) | `seed` hoặc `live`. |

Chỉ loader fixture ghi bảng này: với mỗi dòng CSV thuộc kỳ đầu tiên của file, `value` là cột `acc_prev` của dòng đó. View lũy kế chỉ dùng số dư cho chỉ tiêu `sum`. Chi tiết ở [Fixture CSV](fixture-csv.md).

## Nhật ký

### `audit_log`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | integer, khoá chính | |
| `entity` | varchar(64) | Tên bảng được ghi log. |
| `entity_id` | integer | Không có khoá ngoại. |
| `action` | varchar(32) | |
| `actor_id` | integer, NULL | Người thao tác. |
| `before_json`, `after_json` | JSON, NULL | Ảnh chụp trước và sau. |
| `created_at` | timestamptz | Mặc định `now()`. |

Các dòng hiện có thể xuất hiện:

| `entity` | `action` | Nơi ghi |
|---|---|---|
| `report` | `submit`, `return`, `approve`, `reopen` | `POST /reports/{id}/transition` (`backend/app/services/workflow.py`) |
| `report` | `seed_import` | Loader fixture, một dòng mỗi báo cáo nạp vào |
| `report_template` | `fixture_sha` | Loader fixture, `after_json` là `{"sha256": ...}` |
| `reporting_period` | `open_period`, `close_period` | `PATCH /templates/{code}/periods/{period_key}` |

`POST /reports` và `PUT /reports/{id}/values` không ghi nhật ký. `GET /reports/{id}/history` đọc các dòng `entity = "report"` của một báo cáo, mới nhất trước.

## View `v_report_value_computed`

Một dòng cho mỗi cặp (báo cáo, chỉ tiêu `sum` thuộc mẫu của báo cáo đó), kể cả khi báo cáo chưa có dòng `report_value` nào (từ migration `0003`).

| Cột | Ý nghĩa |
|---|---|
| `report_id`, `indicator_id` | Khoá của dòng. |
| `acc_prev_computed` | Số dư mang sang (không có thì 0) cộng `this_period` của mọi báo cáo `counts_in_totals` cùng đơn vị, cùng chỉ tiêu, ở các kỳ trước kỳ này và không sớm hơn kỳ của số dư. |
| `acc_total_computed` | `acc_prev_computed` cộng `this_period` của chính báo cáo này (NULL tính là 0). |
| `missing_periods` | Mảng mã kỳ nằm trước kỳ này, tính từ kỳ của số dư (không có số dư thì từ kỳ sớm nhất đã có số được cộng), mà đơn vị chưa có báo cáo `counts_in_totals`. |

Số dư dùng cho một báo cáo là dòng `opening_balance` mới nhất của cùng đơn vị và chỉ tiêu có kỳ bắt đầu không muộn hơn kỳ của báo cáo.

View không reset theo năm: kỳ 01/2027 sẽ cộng tiếp số năm 2026. Migration `0002` ghi rõ đây là lối tắt có chủ đích (`gstack-shortcut(dec-3bc0293c)`).

Chỉ `GET /reports/{id}` đọc view này. Dashboard tự cộng thẳng từ `report_value`. Lý do thiết kế nằm ở [Lũy kế](../explanation/luy-ke.md).

## Mặc định chỉ có ở tầng ORM

Migration không khai giá trị mặc định phía database, trừ `report.updated_at` và `audit_log.created_at` (`now()`). Các mặc định như `is_reporting = false`, `active = true`, `version = 1` chỉ có trong model Python. Câu `INSERT` viết tay phải ghi đủ mọi cột NOT NULL. Câu `UPDATE` thì không bị ảnh hưởng.

## Xem thêm

- [API](api.md): endpoint nào đọc và ghi bảng nào.
- [Quyền và quy trình](quyen-va-quy-trinh.md): dữ liệu seed của các bảng quyền và quy trình.
- [Fixture CSV](fixture-csv.md): cách `report`, `report_value`, `opening_balance` được nạp hàng loạt.
- [Lũy kế](../explanation/luy-ke.md): vì sao lũy kế là view chứ không phải cột.
