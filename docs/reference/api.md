# API backend

Backend HSSEQ là một ứng dụng FastAPI. Mọi endpoint nằm dưới tiền tố `/api/v1` và trao đổi JSON.
Trang này liệt kê đủ 19 endpoint: ai được gọi, gửi gì, nhận gì, và lỗi nào có thể xảy ra. Mọi chi
tiết lấy từ `backend/app/api/*.py`, `backend/app/services/*.py` và `backend/app/schemas/*.py`.
Trang OpenAPI tự sinh nằm ở `/docs` của cùng server, ví dụ http://localhost:8000/docs.

## Địa chỉ gốc

| Môi trường | Địa chỉ gốc |
|---|---|
| Máy nhà, gọi thẳng container `api` | `http://localhost:8000/api/v1` |
| Máy nhà, qua Vite (`npm run dev` hoặc `npm run preview`) | `http://localhost:5173/api/v1`, Vite chuyển tiếp sang cổng 8000 |
| Bản demo | `https://hsseq-ptsc-api.onrender.com/api/v1` |

## Xác thực

- Gọi `POST /auth/login` để lấy token, rồi gửi token trong header `Authorization: Bearer <token>`
  ở mọi request khác.
- Token là JWT ký HS256 bằng `JWT_SECRET`, sống 12 giờ, chỉ chứa `sub` (id người dùng) và `exp`.
  Không có refresh token: hết hạn thì đăng nhập lại (`backend/app/core/security.py`).
- Mỗi request đọc lại người dùng và quyền từ DB. Tài khoản bị đặt `active = false` mất quyền ngay ở
  request kế tiếp, không chờ token hết hạn.
- Chỉ `POST /auth/login` và `GET /health` không cần token.

## Quy ước chung

- **Khoá lạ bị từ chối.** Mọi thân request kế thừa `ApiModel` (`backend/app/schemas/base.py`) với
  `extra="forbid"`. Gửi một khoá không có trong schema, ví dụ `thisPeriod` thay cho `this_period`,
  nhận 422 chứ không bị bỏ qua.
- **Số là số JSON.** Giá trị số liệu (cột `Numeric(18,2)`) trả về dạng số (`12.35`), không phải
  chuỗi. `id` và `version` là số nguyên.
- **Thời điểm** trả về dạng ISO 8601 theo UTC. Hạn nộp `2026-10-05T16:59:59Z` là 23:59:59 ngày
  05/10/2026 giờ Việt Nam.
- **Câu lỗi `detail` là tiếng Việt**, trừ lỗi 422 do FastAPI sinh.
- **Mỗi request là một transaction.** Thành công thì commit, gặp bất kỳ lỗi nào thì rollback toàn
  bộ (`get_db` trong `backend/app/core/db.py`). Không có lượt ghi nửa vời.

## Mã lỗi

| Mã | Khi nào | Thân |
|---|---|---|
| 400 | Sai luật nghiệp vụ: số âm, ghi vào cột tự tính, thiếu ô bắt buộc lúc nộp, thiếu ghi chú | `{"detail": "...", "errors": [...]}`, `errors` chỉ có ở một số lỗi |
| 401 | Thiếu token, token sai hoặc hết hạn, tài khoản bị khoá, sai đăng nhập | `{"detail": "Chưa đăng nhập hoặc phiên đã hết hạn"}` hoặc `{"detail": "Sai email hoặc mật khẩu"}` |
| 403 | Thiếu quyền, báo cáo ngoài phạm vi đơn vị, hoặc báo cáo ở trạng thái không cho sửa | `{"detail": "..."}` |
| 404 | Không có báo cáo, mẫu hoặc kỳ được hỏi | `{"detail": "..."}` |
| 409 | Sai `version` hoặc `expected_state`, thao tác không hợp lệ ở trạng thái hiện tại, kỳ đã đóng, báo cáo đã tồn tại | `{"detail": "...", ...}` kèm trường riêng của từng ca |
| 422 | Request sai hình dạng: thiếu tham số, sai kiểu, khoá lạ, kỳ sai định dạng | Dạng mặc định của FastAPI: `{"detail": [{"type", "loc", "msg", "input", ...}]}` |
| 503 | `GET /health` khi không kết nối được DB | `{"status": "down"}` |

Mỗi phần tử của `errors` có một trong hai dạng: `{"indicator_code", "message"}` cho ô số, hoặc
`{"field_code", "message"}` cho ô chữ nhóm C.

**403 đến trước 422.** Các endpoint nhận tham số hoặc thân bắt buộc kiểm quyền trong một dependency
của FastAPI, chạy trước khi FastAPI kiểm tham số. Người thiếu quyền nhận 403 kể cả khi gửi request
sai hình dạng. Áp dụng cho `GET /reports`, `PUT /reports/{id}/values`,
`POST /reports/{id}/transition`, `GET /status`, `GET /dashboard/*`, `GET /users` và
`PATCH /templates/{code}/periods/{period_key}`. Riêng `POST /reports` chỉ kiểm quyền
`report.create` ở dependency; phần "đúng một đơn vị" được kiểm sau khi thân request hợp lệ.

## Danh sách endpoint

| # | Method | Đường dẫn | Quyền cần | Việc |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | không | Đổi email và mật khẩu lấy token |
| 2 | GET | `/auth/me` | đăng nhập | Người dùng, vai, quyền, đơn vị |
| 3 | GET | `/health` | không | Kiểm server và DB |
| 4 | GET | `/templates` | xem báo cáo ¹ | Danh sách mẫu báo cáo |
| 5 | GET | `/templates/{code}` | xem báo cáo ¹ | Danh mục đầy đủ của một mẫu |
| 6 | GET | `/templates/{code}/periods` | xem báo cáo ¹ | Các kỳ của một mẫu |
| 7 | PATCH | `/templates/{code}/periods/{period_key}` | `template.manage` | Mở hoặc đóng một kỳ |
| 8 | GET | `/org-units/reporting` | xem báo cáo ¹ | Các đơn vị phải nộp |
| 9 | GET | `/org-units` | xem báo cáo ¹ | Cây đơn vị |
| 10 | GET | `/users` | `user.manage` | Tài khoản, vai, phạm vi |
| 11 | GET | `/reports` | xem báo cáo ¹ | Báo cáo trong phạm vi |
| 12 | POST | `/reports` | `report.create` | Tạo báo cáo nháp |
| 13 | GET | `/reports/{id}` | xem báo cáo ¹ | Chi tiết một báo cáo |
| 14 | PUT | `/reports/{id}/values` | `report.edit` | Lưu số, ghi chú, ô chữ |
| 15 | POST | `/reports/{id}/transition` | theo thao tác ² | Nộp, trả lại, duyệt, mở lại |
| 16 | GET | `/reports/{id}/history` | xem báo cáo ¹ | Nhật ký chuyển trạng thái |
| 17 | GET | `/status` | `status.view` | Lưới đơn vị × kỳ |
| 18 | GET | `/dashboard/summary` | `dashboard.view` | 6 KPI và tình hình nộp |
| 19 | GET | `/dashboard/units` | `dashboard.view` | Số liệu từng đơn vị |

¹ "Xem báo cáo" nghĩa là có `report.view_all` hoặc `report.view_own_unit`, kiểm bằng
`pham_vi_bao_cao` trong `backend/app/api/deps.py`. Cả ba vai seed đều có một trong hai. Những
endpoint trả dữ liệu báo cáo còn lọc theo phạm vi đơn vị của người gọi. Xem
[Quyền và quy trình](quyen-va-quy-trinh.md).

² Quyền cụ thể lấy từ bảng `workflow_transition` của mẫu: `report.submit` cho nộp,
`report.return` cho trả lại và mở lại, `report.approve` cho duyệt.

---

## Xác thực

### 1. `POST /auth/login`

Thân request:

| Trường | Kiểu | Bắt buộc |
|---|---|---|
| `email` | chuỗi | có |
| `password` | chuỗi | có |

Phản hồi 200:

```json
{"access_token": "eyJhbGciOiJIUzI1NiIs...", "token_type": "bearer"}
```

Lỗi:

- 401 `Sai email hoặc mật khẩu`: email không tồn tại, sai mật khẩu, hoặc tài khoản có
  `active = false`. Ba ca dùng chung một câu để không lộ tài khoản nào tồn tại.
- 422: thiếu trường hoặc có khoá lạ.

Chưa có giới hạn số lần đăng nhập sai. Việc này nằm trong `TODOS.md`.

### 2. `GET /auth/me`

Phản hồi 200 (tài khoản `admin@ptsc.local`):

```json
{
  "user": {"id": 1, "email": "admin@ptsc.local", "full_name": "Admin Ban ATCL",
           "position": "Chuyên viên tổng hợp Ban ATCL"},
  "roles": ["admin_atcl"],
  "permissions": ["audit.view", "dashboard.view", "..."],
  "org_unit": {"id": 1, "code": "PTSC", "name": "Tổng công ty CP Dịch vụ Kỹ thuật Dầu khí"}
}
```

- `roles`: mã vai, sắp theo chữ cái.
- `permissions`: mọi mã quyền người này có, gộp qua mọi vai, sắp theo chữ cái.
- `org_unit`: đơn vị ghi trên tài khoản (`app_user.org_unit_id`). Trường này chỉ để hiển thị.
  Phạm vi dữ liệu thật nằm ở vai (`user_role.scope_org_unit_id`), và hai giá trị có thể khác nhau.

### 3. `GET /health`

Không cần token. Chạy `SELECT 1` trên DB.

- 200 `{"status": "ok"}`
- 503 `{"status": "down"}` khi không kết nối được DB.

Trang đăng nhập gọi endpoint này để đánh thức Render trước khi người dùng bấm nút.

---

## Danh mục

### 4. `GET /templates`

Phản hồi 200, sắp theo `code`:

```json
[{"code": "FM01", "name_vi": "BÁO CÁO THÁNG CÔNG TÁC SKATMT DỰ ÁN",
  "name_en": "MONTHLY PROJECT HSE REPORT", "period_type": "month", "active": true}]
```

### 5. `GET /templates/{code}`

Trả toàn bộ danh mục của một mẫu. Frontend dựng form và các nút chuyển trạng thái từ đây.

| Khoá | Nội dung |
|---|---|
| `code`, `name_vi`, `name_en` | Thông tin mẫu |
| `sections[]` | `{code, name_vi, name_en, sort_order}`, sắp theo `sort_order` |
| `indicators[]` | `{code, section_code, name_vi, name_en, unit, agg_type, formula, decimals, required, sort_order}`. Chỉ chỉ tiêu `active`, sắp theo thứ tự nhóm rồi thứ tự trong nhóm |
| `text_fields[]` | `{code, label_vi, sort_order}`, ô chữ nhóm C |
| `states[]` | `{code, name_vi, is_initial, is_editable, counts_in_totals, sort_order}` |
| `transitions[]` | `{action_code, from_state, to_state, name_vi, required_permission, requires_note}`, sắp theo `id` |

Với FM01 hiện tại: 11 nhóm, 53 chỉ tiêu (48 `sum`, 4 `counter`, 1 `computed`), 3 ô chữ `C1` đến
`C3`, 4 trạng thái, 5 chuyển trạng thái.

Lỗi: 404 `Không tìm thấy mẫu báo cáo`.

### 6. `GET /templates/{code}/periods`

Phản hồi 200, sắp theo `start_date`:

```json
[{"period_key": "2026-08", "start_date": "2026-08-01", "end_date": "2026-08-31",
  "due_at": "2026-10-05T16:59:59+00:00", "is_open": true}]
```

Lỗi: 404 `Không tìm thấy mẫu báo cáo`.

### 7. `PATCH /templates/{code}/periods/{period_key}`

Mở hoặc đóng một kỳ. Đây là thao tác ghi duy nhất của nhóm `/templates`.

Quyền: `template.manage`. Thân request: `{"is_open": true | false}`.

Phản hồi 200: một kỳ, cùng hình dạng với một phần tử của `GET /templates/{code}/periods`.

Tác dụng:

- Ghi một dòng `audit_log` (`entity = "reporting_period"`, `action = "open_period"` hoặc
  `"close_period"`, `before_json`/`after_json` là `{"is_open": ...}`) trong cùng transaction.
- Không kiểm `version`. Hai người bấm cùng lúc thì người sau thắng, cả hai lượt đều nằm trong
  `audit_log`.

Đóng kỳ chặn đúng hai việc:

1. `POST /reports` cho kỳ đó trả 409 `Kỳ báo cáo đã đóng, không thể tạo báo cáo mới`.
2. Dòng "chưa tạo báo cáo" của kỳ đó biến khỏi `GET /reports` của người có phạm vi hẹp.

Đóng kỳ **không** chặn sửa, nộp hay duyệt một báo cáo đã tạo.

Lỗi: 403 thiếu quyền; 404 `Không tìm thấy mẫu báo cáo` hoặc `Không tìm thấy kỳ báo cáo`.

### 8. `GET /org-units/reporting`

Các đơn vị có `is_reporting = true`, sắp theo `id`. Seed có 22 đơn vị: U01 đến U17, rồi P01 đến P05.

```json
[{"id": 14, "code": "U01", "name": "Đơn vị thành viên 01 (tên tạm)", "type": "member_unit"}]
```

### 9. `GET /org-units`

Toàn bộ đơn vị dạng cây theo `parent_id`. Mỗi nút:
`{id, code, name, type, is_reporting, children[]}`. Nút không có cha, hoặc có cha không tồn tại, là
gốc. Seed chưa gán `parent_id` nên hôm nay cây phẳng: 35 nút gốc.

### 10. `GET /users`

Quyền: `user.manage`. Chỉ đọc; không có endpoint tạo, sửa hay khoá tài khoản.

Phản hồi 200, sắp theo email:

```json
{"id": 23, "email": "u22@ptsc.local", "full_name": "Người nhập P05",
 "position": "Đại diện SKATMT", "active": true,
 "org_unit": {"code": "P05", "name": "Ban dự án 05 (tên tạm)"},
 "roles": [{"code": "reporter", "name": "Người nhập",
            "scope": {"code": "P05", "name": "Ban dự án 05 (tên tạm)"}}],
 "permission_count": 4}
```

- `roles[].scope = null` nghĩa là vai đó không giới hạn đơn vị (toàn Tổng công ty).
- `permission_count` đếm mã quyền khác nhau, gộp qua mọi vai.

---

## Báo cáo

### 11. `GET /reports`

| Tham số query | Bắt buộc | Ý nghĩa |
|---|---|---|
| `template` | có | Mã mẫu, ví dụ `FM01`. Thiếu thì 422 |
| `period` | không | `period_key`, ví dụ `2026-08` |
| `org_unit` | không | Mã đơn vị, ví dụ `P05` |
| `state` | không | Mã trạng thái, ví dụ `submitted` |

Mỗi phần tử:

```json
{"id": 132, "period_key": "2026-08",
 "org_unit": {"code": "P05", "name": "Ban dự án 05 (tên tạm)"},
 "state": "draft", "source": "live", "is_late": false,
 "due_at": "2026-10-05T16:59:59Z", "updated_at": "2026-09-27T15:29:45.465825Z",
 "decision_note": null}
```

Kết quả phụ thuộc phạm vi của người gọi:

- **Toàn Tổng công ty** (`report.view_all`, vai admin và viewer): chỉ những báo cáo đã tồn tại, lọc
  theo các tham số.
- **Phạm vi hẹp** (`report.view_own_unit`, vai reporter): mỗi đơn vị trong phạm vi có một dòng cho
  mỗi kỳ **đang mở**, kể cả khi chưa tạo báo cáo. Dòng chưa tạo có `id`, `state`, `source`,
  `is_late`, `updated_at`, `decision_note` bằng `null`. Kỳ đã đóng chỉ hiện nếu đã có báo cáo.
  `org_unit` ngoài phạm vi cho ra danh sách rỗng. Lọc `state` loại luôn các dòng chưa tạo.

Mã mẫu không tồn tại cho ra `[]`, không phải 404. Kết quả sắp theo mã đơn vị rồi theo kỳ.

### 12. `POST /reports`

Tạo báo cáo nháp cho đơn vị của người gọi.

Quyền: `report.create`. Thân request: `{"template": "FM01", "period_key": "2026-09"}`.

Phản hồi 201: `{"id": 133}`. Báo cáo mới ở trạng thái đầu của mẫu (`draft`), `version = 1`,
`source = "live"`.

Kiểm theo thứ tự:

1. 403 `Không xác định được đúng một đơn vị để tạo báo cáo cho tài khoản này`: phạm vi của người gọi
   không phải đúng một đơn vị. Admin và viewer (phạm vi toàn Tổng công ty) luôn rơi vào đây.
2. 404 `Không tìm thấy mẫu báo cáo`.
3. 400 `Đơn vị này không thuộc diện phải nộp báo cáo`: đơn vị có `is_reporting = false`.
4. 404 `Không tìm thấy kỳ báo cáo`.
5. 409 `Kỳ báo cáo đã đóng, không thể tạo báo cáo mới`.
6. 409 `Báo cáo đã tồn tại cho đơn vị và kỳ này`, kèm `existing_id`:

   ```json
   {"detail": "Báo cáo đã tồn tại cho đơn vị và kỳ này", "existing_id": 133}
   ```

### 13. `GET /reports/{id}`

Phản hồi 200:

| Khoá | Nội dung |
|---|---|
| `id`, `version`, `state`, `source`, `is_late` | Thông tin báo cáo. `source` là `seed` (nạp từ fixture) hoặc `live` (đã có người thao tác) |
| `header` | `{org_unit, template_code, period_key, due_at, report_no, location, report_date, reporter_name, reporter_position, submitted_at, decided_at, decision_note}` |
| `missing_periods` | Các kỳ trước **chưa được duyệt** mà lũy kế phải bỏ qua, sắp tăng dần |
| `values[]` | Một phần tử cho **mỗi** chỉ tiêu `active` của mẫu, theo thứ tự danh mục |
| `texts` | Đủ mọi ô chữ của mẫu, ví dụ `{"C1": "...", "C2": null, "C3": null}` |

Mỗi phần tử `values`:

| Trường | Ý nghĩa |
|---|---|
| `indicator_code` | Mã chỉ tiêu |
| `this_period` | Tháng này |
| `acc_prev_entered` | Lũy kế tháng trước do người nhập hoặc fixture ghi |
| `acc_total_entered` | Cộng dồn do người nhập hoặc fixture ghi |
| `acc_prev_computed` | Lũy kế tháng trước do view tính |
| `acc_total_computed` | Cộng dồn do view tính |
| `diff` | Chỉ `sum`: `acc_total_entered - acc_total_computed` khi cả hai có mặt |
| `counter_check` | Chỉ `counter`: `{status, expected, message}` |
| `note` | Ghi chú của dòng |

Cách điền từng trường khác nhau theo `agg_type`:

- `sum`: hai cột `*_computed` lấy từ view `v_report_value_computed`.
- `counter`: `acc_prev_entered` là `acc_total_entered` của kỳ trước gần nhất **đã duyệt** của cùng
  đơn vị. `counter_check.status` là `ok`, `lech` (lệch công thức, chỉ cảnh báo, không chặn nộp) hoặc
  `bo_qua` (chưa đủ số để kiểm).
- `snapshot`: `this_period` và `acc_prev_entered` luôn `null`.
- `computed`: `this_period`, `acc_prev_computed`, `acc_total_computed` là tổng các thành phần trong
  `formula`; thành phần trống tính là 0. Hai cột `*_entered` luôn `null`.

Ví dụ một dòng `counter`:

```json
{"indicator_code": "B-1.5", "this_period": 4.0, "acc_prev_entered": 5.0,
 "acc_total_entered": 9.0, "acc_prev_computed": null, "acc_total_computed": null,
 "diff": null, "counter_check": {"status": "ok", "expected": 9.0, "message": ""}, "note": null}
```

Lỗi: 404 `Không tìm thấy báo cáo`; 403 `Bạn không có quyền xem báo cáo của đơn vị này` khi báo cáo
nằm ngoài phạm vi.

### 14. `PUT /reports/{id}/values`

Lưu số, ghi chú và ô chữ. Quyền: `report.edit`, và báo cáo phải nằm trong phạm vi.

Thân request:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `version` | số nguyên, bắt buộc | `version` đang có trên form. Sai thì 409 |
| `values[]` | danh sách, bắt buộc (được rỗng) | Mỗi phần tử `{indicator_code, this_period?, acc_total_entered?, note?}` |
| `texts` | object, tuỳ chọn | `{"C1": "..." \| null, ...}` |

Không có trường `acc_prev_entered`: không loại chỉ tiêu nào cho nhập cột đó.

**Gửi một phần.** Chỉ chỉ tiêu có mặt trong `values` bị đụng tới. Trong một phần tử:

- Trường **vắng mặt** giữ nguyên giá trị đang lưu.
- Trường có mặt với giá trị `null` **xoá trắng** ô đó.
- `note` rỗng (`""`) được lưu thành `null`.

`texts` theo cùng luật: không gửi `texts` thì không đụng ô chữ nào; mã có mặt thì ghi; `""` lưu thành
`null`; tối đa 2000 ký tự mỗi ô.

**Làm tròn trước khi kiểm.** Server làm tròn nửa lên (ROUND_HALF_UP) về đúng `decimals` của chỉ tiêu
rồi mới kiểm luật. `12.345` với `decimals = 2` lưu thành `12.35`. `1.5` với `decimals = 0` lưu thành
`2`, không bị từ chối. Frontend chặn số quá thập phân ngay ở ô nhập nên chỉ client gọi API thẳng gặp
ca này.

**Cột nào được lưu** theo `agg_type`:

| `agg_type` | Cột nhận từ request | Ghi chú |
|---|---|---|
| `sum` | `this_period` | Mỗi lần ghi, hai cột `acc_*_entered` bị đặt `null` |
| `counter` | `this_period`, `acc_total_entered` | |
| `snapshot` | `acc_total_entered` | |
| `computed` | không | Gửi số vào đây là lỗi 400 |

Kiểm theo thứ tự, dừng ở lỗi đầu tiên:

1. 403 `Bạn không có quyền thực hiện thao tác này` khi thiếu `report.edit`.
2. 404 `Không tìm thấy báo cáo`.
3. 403 `Bạn không có quyền sửa báo cáo của đơn vị này` (ngoài phạm vi).
4. 403 `Báo cáo ở trạng thái không cho sửa` (trạng thái có `is_editable = false`, ví dụ `submitted`).
5. 409 `Người khác vừa sửa báo cáo này` khi `version` lệch. Thân lỗi kèm trạng thái, `version` và
   toàn bộ `values` hiện tại để client vá lại form:

   ```json
   {"detail": "Người khác vừa sửa báo cáo này", "state": "draft", "version": 3,
    "values": [{"indicator_code": "B-1.1", "this_period": 12.35, "...": "..."}]}
   ```

6. 400 `Dữ liệu không hợp lệ` khi một mã chỉ tiêu lặp lại trong cùng payload.
7. 400 `Dữ liệu không hợp lệ` khi vi phạm luật số. Mỗi ô một lỗi:

   | `message` | Khi nào |
   |---|---|
   | `Chỉ tiêu không có trong mẫu báo cáo` | Mã lạ |
   | `Dòng tự tính, không nhận giá trị gửi lên` | Gửi số vào cột không nhập được |
   | `Số không được âm` | Số âm |
   | `Số quá lớn, tối đa 16 chữ số phần nguyên` | Trị tuyệt đối ≥ 10^16 |

   Luật số chữ số thập phân không báo lỗi ở endpoint này vì số đã được làm tròn trước khi kiểm.

8. 400 `Dữ liệu không hợp lệ` cho ô chữ, `errors` dùng khoá `field_code`:
   `Trường chữ không có trong mẫu báo cáo` hoặc `Nội dung tối đa 2000 ký tự`. Ô chữ chỉ được kiểm
   khi phần số đã hợp lệ.

Lượt lưu không kiểm "ô bắt buộc". Việc đó để tới lúc nộp.

Phản hồi 200: `{"version": 4, "values": [...]}`. `values` là toàn bộ giá trị sau khi ghi, cùng
hình dạng với `GET /reports/{id}`, để client cập nhật các cột tự tính. Mỗi lượt ghi thành công tăng
`version` đúng 1 (kể cả khi `values` rỗng) và đặt `source = "live"`.

### 15. `POST /reports/{id}/transition`

Chuyển trạng thái: nộp, trả lại, duyệt, mở lại.

Thân request:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `action` | chuỗi, bắt buộc | `action_code` trong `transitions` của mẫu: `submit`, `return`, `approve`, `reopen` |
| `expected_state` | chuỗi, bắt buộc | Trạng thái client đang thấy |
| `version` | số nguyên, bắt buộc | `version` client đang thấy |
| `note` | chuỗi, tuỳ chọn | Lý do. Bắt buộc với thao tác có `requires_note = true` |

Phản hồi 200: `{"state": "submitted", "version": 5}`.

Kiểm theo thứ tự:

1. 404 `Không tìm thấy báo cáo`.
2. 403 `Bạn không có quyền chuyển trạng thái báo cáo này`: người gọi không có quyền nào trong số các
   quyền mà bảng `workflow_transition` của mẫu này dùng.
3. 403 `Bạn không có quyền chuyển trạng thái báo cáo của đơn vị này` (ngoài phạm vi).
4. Khoá dòng báo cáo (`SELECT ... FOR UPDATE`).
5. 409 `Người khác vừa sửa báo cáo này`, kèm `state` và `version` hiện tại, khi `expected_state` hoặc
   `version` lệch.
6. 409 `Không thể "<tên thao tác>" ở trạng thái hiện tại`, kèm `state` và `version`, khi không có
   chuyển trạng thái nào mang `action` đó đi từ trạng thái hiện tại. Tên thao tác lấy từ `name_vi`
   trong DB, ví dụ `Không thể "Duyệt" ở trạng thái hiện tại`.
7. 403 `Bạn không có quyền thực hiện thao tác này` (thiếu quyền của đúng thao tác này) hoặc
   `Bạn không có quyền thực hiện thao tác này trên đơn vị này`.
8. 400 `Thao tác này bắt buộc có ghi chú` khi `requires_note = true` mà `note` rỗng hoặc toàn khoảng
   trắng.
9. Riêng `submit`: 400 `Dữ liệu không hợp lệ` nếu còn ô bắt buộc trống trên **toàn bộ** báo cáo.
   Mỗi ô thiếu một phần tử `{"indicator_code": "B-1.2", "message": "Ô bắt buộc, chưa có giá trị"}`.

Khi qua hết:

- `state` đổi, `version` tăng 1, `source = "live"`.
- `submit`: ghi `submitted_at`. Ở lần nộp **đầu tiên**, ghi thêm `first_submitted_at` và
  `is_late = (thời điểm nộp > due_at của kỳ)`.
- `approve`, `return`, `reopen`: ghi `decided_at`, `decided_by` và `decision_note = note`.
- Ghi một dòng `audit_log` với ảnh chụp trước và sau, trong cùng transaction.

Hai loại 409 mang cùng hình dạng `{detail, state, version}`. Client nên hiện nguyên `detail` và cập
nhật `state`, `version` từ thân lỗi.

### 16. `GET /reports/{id}/history`

Cùng luật phạm vi với `GET /reports/{id}`. Không cần `audit.view`: người nhập được xem lịch sử báo
cáo của chính đơn vị mình.

Phản hồi 200, mới nhất trước:

```json
[{"id": 812, "action": "approve", "actor_id": 1,
  "before": {"state": "submitted", "version": 6, "...": "..."},
  "after": {"state": "approved", "version": 7, "...": "..."},
  "created_at": "2026-09-27T15:29:52.903276Z"},
 {"id": 745, "action": "seed_import", "actor_id": 1, "before": null,
  "after": {"note": "nạp từ file tổng hợp kỳ 2026-08"},
  "created_at": "2026-09-27T15:29:45.465825Z"}]
```

Hai hình dạng dòng:

- Dòng chuyển trạng thái (`submit`, `return`, `approve`, `reopen`): `before` và `after` là ảnh chụp
  `state`, `version`, `source`, `submitted_at`, `first_submitted_at`, `decided_at`, `decided_by`,
  `decision_note`, `is_late`.
- Dòng `seed_import` do loader fixture ghi: `before` là `null`, `after` chỉ có `note`.

Nhật ký này không ghi lịch sử từng con số. `PUT .../values` không sinh dòng nào ở đây.

---

## Theo dõi

### 17. `GET /status`

Lưới trạng thái: mỗi đơn vị phải nộp × mỗi kỳ trong khoảng.

| Tham số query | Bắt buộc | Ràng buộc |
|---|---|---|
| `template` | có | Mã mẫu |
| `from` | có | Khớp `^[0-9]{4}-(0[1-9]\|1[0-2])$`, sai thì 422 |
| `to` | có | Cùng ràng buộc |

Quyền: `status.view`, rồi lọc theo phạm vi.

Phản hồi 200:

```json
{"periods": ["2026-06", "2026-07", "2026-08", "2026-09"],
 "units": [{"code": "P01", "name": "Ban dự án 01 (tên tạm)",
            "cells": [{"period_key": "2026-06", "state": "approved", "source": "seed",
                       "is_late": false, "report_id": 118},
                      {"period_key": "2026-09", "state": null, "source": null,
                       "is_late": null, "report_id": null}]}]}
```

- `periods`: các kỳ trong khoảng, sắp theo `start_date`.
- `units`: sắp theo **mã** đơn vị, nên P01 đến P05 đứng trước U01 đến U17.
- Ô chưa có báo cáo vẫn có mặt, mọi trường trừ `period_key` là `null`.

Lỗi: 403 thiếu `status.view` (vai reporter); 404 `Không tìm thấy mẫu báo cáo`; 422 sai định dạng kỳ.

### 18. `GET /dashboard/summary`

Tham số query: `period` (bắt buộc, không kiểm định dạng). Quyền: `dashboard.view`, rồi lọc theo phạm
vi.

Không nhận `template`: endpoint đọc mẫu đang có `active = true`.

Phản hồi 200:

```json
{"period_key": "2026-08", "reporting_units": 22, "approved_count": 21, "submitted_count": 0,
 "missing_units": [{"code": "P05", "name": "Ban dự án 05 (tên tạm)"}],
 "kpis": [{"code": "B-2.2", "label": "LTI trong kỳ", "value": 63.0, "unit": "Số vụ"},
          "... thêm 5 KPI ..."]}
```

Mỗi đơn vị phải nộp rơi vào đúng một trong ba nhóm, xác định bằng cờ của trạng thái (không so tên
trạng thái):

| Nhóm | Điều kiện |
|---|---|
| `approved_count` | Báo cáo ở trạng thái `counts_in_totals = true` |
| `submitted_count` | Có báo cáo, trạng thái không `counts_in_totals` và không `is_editable` |
| `missing_units` | Chưa có báo cáo, hoặc báo cáo đang `is_editable` (nháp, trả lại). Sắp theo mã |

`kpis` luôn đủ 6 phần tử theo thứ tự dưới đây. Chỉ báo cáo `counts_in_totals` được cộng.

| `code` | `label` | Cách tính | `unit` |
|---|---|---|---|
| `B-2.2` | LTI trong kỳ | Σ `this_period` của B-2.2 | Số vụ |
| `B-2.1` | FAT trong kỳ | Σ `this_period` của B-2.1 | Số vụ |
| `DON_VI_CO_LTI` | Đơn vị có LTI | Số đơn vị có B-2.2 > 0 | Đơn vị |
| `B-1.4` | Tổng giờ công | Σ `this_period` của B-1.1, B-1.2, B-1.3 | Giờ |
| `B-2.10` | Near miss | Σ `this_period` của B-2.10 | Số vụ |
| `B-2.11` | HAZOB card | Σ `this_period` của B-2.11 | Cái |

`period` không khớp kỳ nào không trả 404: mọi con số về 0, mọi đơn vị nằm trong `missing_units`.

### 19. `GET /dashboard/units`

Tham số và quyền giống `GET /dashboard/summary`.

Phản hồi 200, một dòng cho mỗi đơn vị phải nộp trong phạm vi:

```json
{"org_unit": {"code": "P01", "name": "Ban dự án 01 (tên tạm)"},
 "gio_cong": 9.0, "lti": 5.0, "fat": 4.0, "near_miss": 3.0, "hazob": 4.0,
 "gio_an_toan_tu_lti_cuoi": 12.0, "state": "approved", "report_id": 120}
```

- `lti`, `fat`, `near_miss`, `hazob`, `gio_an_toan_tu_lti_cuoi` lấy từ B-2.2, B-2.1, B-2.10, B-2.11,
  B-1.5. Cột được đọc tuỳ `agg_type`: `sum` đọc `this_period`; `counter` và `snapshot` đọc
  `acc_total_entered`.
- `gio_cong` = B-1.1 + B-1.2 + B-1.3, ô trống tính là 0; `null` khi đơn vị chưa có báo cáo.
- Khác `summary`, bảng này hiện số của báo cáo ở **mọi** trạng thái, kèm `state` để phân biệt.
- Sắp giảm dần theo LTI, rồi FAT, rồi giờ công. Đơn vị chưa có số xuống cuối. Hoà nhau thì theo mã
  đơn vị.

---

## Ví dụ gọi bằng `curl`

Các lệnh dưới đây chạy được trên stack local sau khi làm theo
[bài học đầu tiên](../tutorials/vong-bao-cao-dau-tien.md). `jq` có sẵn trên macOS bản mới; nếu máy
không có, bỏ phần `| jq ...`.

Đăng nhập và giữ token trong biến shell. `read -rs` hỏi mật khẩu mà không in ra màn hình và không lưu
vào lịch sử lệnh. Mật khẩu chung của tài khoản seed được giải thích ở
[Quyền và quy trình](quyen-va-quy-trinh.md#tài-khoản-seed).

```bash
API=http://localhost:8000/api/v1
read -rs MAT_KHAU
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"u22@ptsc.local\",\"password\":\"$MAT_KHAU\"}" | jq -r .access_token)
```

Liệt kê báo cáo của đơn vị mình. `id` trên máy bạn sẽ khác, vì mỗi lần nạp lại dữ liệu demo tạo báo
cáo mới:

```bash
curl -s "$API/reports?template=FM01" -H "Authorization: Bearer $TOKEN" \
  | jq -c '.[] | {id, period_key, state}'
```

```json
{"id":130,"period_key":"2026-06","state":"approved"}
{"id":131,"period_key":"2026-07","state":"approved"}
{"id":132,"period_key":"2026-08","state":"draft"}
{"id":null,"period_key":"2026-09","state":null}
```

Giữ `id` và `version` của báo cáo nháp vào biến:

```bash
ID=$(curl -s "$API/reports?template=FM01&period=2026-08" -H "Authorization: Bearer $TOKEN" \
  | jq '.[0].id')
V=$(curl -s $API/reports/$ID -H "Authorization: Bearer $TOKEN" | jq .version)
```

Lưu một ô. Phản hồi mang `version` mới:

```bash
curl -s -X PUT $API/reports/$ID/values -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"version\": $V, \"values\": [{\"indicator_code\": \"B-2.1\", \"this_period\": 5}]}" \
  | jq '{version}'
```

Nộp báo cáo với `version` vừa nhận (ở đây là `V + 1`):

```bash
curl -s -X POST $API/reports/$ID/transition -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"action\": \"submit\", \"expected_state\": \"draft\", \"version\": $((V + 1))}"
```

```json
{"state":"submitted","version":3}
```

## Xem thêm

- [Quyền và quy trình](quyen-va-quy-trinh.md): 14 quyền, 3 vai, phạm vi, trạng thái, tài khoản seed.
- [Mô hình dữ liệu](mo-hinh-du-lieu.md): các bảng phía sau từng endpoint.
- [Cấu hình và lệnh](cau-hinh-va-lenh.md): biến môi trường, cổng, lệnh chạy.
- [Cách thêm một endpoint API](../how-to/them-endpoint-api.md).
- [An toàn khi nhập liệu](../explanation/an-toan-nhap-lieu.md): vì sao có `version`, gửi một phần,
  và 403 đến trước 422.
- [Số lũy kế được tính thế nào](../explanation/luy-ke.md): nguồn của các cột `*_computed`.
