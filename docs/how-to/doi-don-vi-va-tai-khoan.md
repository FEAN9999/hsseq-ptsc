# Cách đổi tên đơn vị và quản lý tài khoản

Thay tên tạm của đơn vị bằng tên thật, đặt lại mật khẩu, thêm người nhập, chuyển người nhập sang đơn vị khác, khoá tài khoản. Chưa có màn hình cho các việc này: màn "Tổ chức" và "Người dùng" chỉ để xem.

## Cần có

- Database dựng lại được (máy dev): sửa file seed rồi dựng lại.
- Database đã có số cần giữ (Supabase của bản demo): chạy được SQL trên nó, qua SQL Editor của Supabase hoặc `psql`.
- Trên máy dev, mở `psql` vào database local:

  ```bash
  docker compose -f infra/docker-compose.yml exec db psql -U hseq -d hseq
  ```

Seed chỉ chèn dòng chưa có, không bao giờ sửa dòng đã có. Mọi thay đổi trên database đã seed phải làm bằng SQL. Sửa file seed chỉ có tác dụng với database dựng mới.

## Đổi tên đơn vị

Tên trong seed là tên tạm ("Đơn vị thành viên 01 (tên tạm)"...). Chú thích trong seed ghi rõ phải thay trước buổi demo.

### Database dựng lại được

1. Sửa danh sách `ORG_UNITS` trong `backend/app/seed/__init__.py`. Giữ nguyên `code` (`U01`, `P05`...), chỉ đổi tên.
2. Dựng lại database (xoá mọi dữ liệu local):

   ```bash
   docker compose -f infra/docker-compose.yml down -v
   docker compose -f infra/docker-compose.yml up -d --build
   ```

### Database đã có số

Chạy một câu cho mỗi đơn vị, tra theo mã:

```sql
UPDATE org_unit SET name = 'Tên thật của đơn vị' WHERE code = 'U01';
```

Rồi sửa cùng tên trong `ORG_UNITS` để database dựng mới về sau giống database đang chạy.

Tên người nhập ("Người nhập U01") ghép từ mã đơn vị nên không phải đổi theo.

## Đặt lại mật khẩu

Không có màn đổi mật khẩu. Tạo chuỗi băm bcrypt trên máy rồi ghi vào database:

```bash
cd backend
.venv/bin/python -c "import getpass; from pwdlib import PasswordHash; from pwdlib.hashers.bcrypt import BcryptHasher; print(PasswordHash((BcryptHasher(),)).hash(getpass.getpass('Mật khẩu mới: ')))"
```

Lệnh hỏi mật khẩu mà không hiện chữ, rồi in chuỗi băm dạng `$2b$12$...`. Chuỗi băm không lộ mật khẩu, dán vào SQL được:

```sql
UPDATE app_user SET password_hash = '<chuỗi băm>' WHERE email = 'u05@ptsc.local';
```

Mật khẩu cũ hết tác dụng ngay. Token đã cấp vẫn dùng được tới khi hết hạn (12 giờ). Không có cách thu hồi riêng một token: khoá tài khoản thì token bị từ chối, nhưng mở lại thì token cũ chưa hết hạn lại dùng được.

## Khoá và mở tài khoản

```sql
UPDATE app_user SET active = false WHERE email = 'u05@ptsc.local';
```

Có hiệu lực ở request kế tiếp: đăng nhập trả 401, và token đã cấp cũng bị từ chối với 401, không chờ hết hạn. Câu báo không nói tài khoản bị khoá: đăng nhập nhận đúng câu của sai mật khẩu, token cũ nhận đúng câu của phiên hết hạn. Mở lại bằng `active = true`.

Đừng `DELETE` tài khoản: `user_role`, `report.created_by`, `report.decided_by` và `audit_log.actor_id` đều có thể trỏ tới nó. Khoá thay vì xoá.

## Thêm một người nhập

Hai câu: tạo tài khoản, rồi gán vai trò kèm phạm vi. Ghi đủ mọi cột vì database không có giá trị mặc định cho `active`.

```sql
INSERT INTO app_user (email, full_name, position, password_hash, org_unit_id, active)
SELECT 'nguoi.moi@ptsc.local', 'Họ tên', 'Đại diện SKATMT', '<chuỗi băm>', id, true
  FROM org_unit WHERE code = 'P05';

INSERT INTO user_role (user_id, role_id, scope_org_unit_id)
SELECT u.id, r.id, o.id
  FROM app_user u, role r, org_unit o
 WHERE u.email = 'nguoi.moi@ptsc.local' AND r.code = 'reporter' AND o.code = 'P05';
```

`scope_org_unit_id` quyết định người đó thấy báo cáo của đơn vị nào. Với vai `reporter`, để trống cột này là tài khoản bị 403 `Tài khoản chưa được gán đơn vị...` ở mọi trang báo cáo. Một đơn vị có thể có nhiều người nhập.

Thêm người xem toàn Tổng công ty: cùng hai câu, `r.code = 'viewer'` và `scope_org_unit_id` để NULL. Ý nghĩa của từng vai ở [Quyền và quy trình](../reference/quyen-va-quy-trinh.md#vai-trò).

## Chuyển người nhập sang đơn vị khác

Phạm vi nằm ở `user_role`, không nằm ở `app_user`:

```sql
UPDATE user_role
   SET scope_org_unit_id = (SELECT id FROM org_unit WHERE code = 'U06')
 WHERE user_id = (SELECT id FROM app_user WHERE email = 'u05@ptsc.local')
   AND role_id = (SELECT id FROM role WHERE code = 'reporter');

UPDATE app_user
   SET org_unit_id = (SELECT id FROM org_unit WHERE code = 'U06')
 WHERE email = 'u05@ptsc.local';
```

Câu đầu đổi báo cáo người đó thấy và sửa được. Câu sau đổi đơn vị công tác, hiện ở phụ đề trang báo cáo và trên sidebar.

## Kiểm tra

- Đổi tên: màn "Tổ chức" và danh sách báo cáo hiện tên mới sau khi tải lại trang.
- Mật khẩu: đăng nhập bằng mật khẩu mới vào được, mật khẩu cũ bị từ chối.
- Người nhập mới: đăng nhập vào `/reports`, chỉ thấy báo cáo của đơn vị được gán.
- Khoá: tab đang mở của người đó bị đưa về trang đăng nhập ở lần gọi API kế tiếp.

## Gỡ lỗi

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| Sửa `ORG_UNITS`, khởi động lại mà tên không đổi | Seed không sửa dòng đã có. Dùng `UPDATE`, hoặc `down -v` nếu là máy dev. |
| `null value in column "active" ... violates not-null constraint` | `INSERT` thiếu cột. Ghi đủ các cột như ví dụ. |
| Người nhập mới đăng nhập được nhưng mọi trang báo cáo trả 403 | Thiếu dòng `user_role`, hoặc `scope_org_unit_id` đang NULL. |
| Đổi `SEED_PASSWORD` mà mật khẩu không đổi | Seed chỉ dùng biến này lúc tạo tài khoản. Đặt lại bằng chuỗi băm như trên. |
| `update or delete on table "app_user" violates foreign key constraint` | Tài khoản còn được tham chiếu. Khoá thay vì xoá. |

## Xem thêm

- [Quyền và quy trình](../reference/quyen-va-quy-trinh.md): vai trò, phạm vi, tài khoản seed.
- [Mô hình dữ liệu](../reference/mo-hinh-du-lieu.md#tổ-chức-và-quyền): các bảng `org_unit`, `app_user`, `user_role`.
- [Kiến trúc](../explanation/kien-truc.md#jwt-trong-sessionstorage-không-có-refresh-token): vì sao khoá tài khoản có hiệu lực ngay.
