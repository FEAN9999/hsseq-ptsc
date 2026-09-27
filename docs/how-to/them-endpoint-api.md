# Cách thêm một endpoint API

Thêm một endpoint vào backend FastAPI theo đúng khuôn của dự án: gác quyền, lọc phạm vi, trả lỗi tiếng Việt, có test. Ví dụ xuyên suốt là `GET /reports/late?period=...`, liệt kê báo cáo nộp muộn trong phạm vi người gọi được xem.

## Cần có

- Thư viện backend đã cài, kể cả `pytest` (xem [Cấu hình và lệnh](../reference/cau-hinh-va-lenh.md#backend-trên-máy-chạy-từ-backend)).
- Postgres đang chạy (`docker compose -f infra/docker-compose.yml up -d db`) và database `hseq_test` đã có bảng. Volume mới thì `hseq_test` còn trống: chạy migration cho nó một lần theo mục [Biến của pytest](../reference/cau-hinh-va-lenh.md#biến-của-pytest).

## Các bước

### 1. Chọn router

Mỗi nhóm endpoint là một file trong `backend/app/api/` với một `APIRouter` có `prefix`. Endpoint về báo cáo vào `backend/app/api/reports.py` (`prefix="/reports"`).

Nhóm mới thì tạo file mới rồi gắn vào `backend/app/main.py`, cùng tiền tố với các nhóm khác:

```python
app.include_router(ten_nhom.router, prefix="/api/v1")
```

### 2. Khai hình dạng dữ liệu

Schema kế thừa `ApiModel` (`backend/app/schemas/base.py`). Nó bật `extra="forbid"`, nên khoá lạ trong request bị từ chối 422 thay vì bị bỏ qua. Số thập phân dùng `JsonNumber` để ra số JSON thay vì chuỗi.

```python
class BaoCaoMuonOut(ApiModel):
    id: int
    org_unit_code: str
    first_submitted_at: datetime
```

### 3. Viết route, gác quyền và phạm vi

```python
@router.get("/late", response_model=list[BaoCaoMuonOut])
def ds_nop_muon(
    period: str,
    pham_vi: set[int] | None = Depends(_pham_vi),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Report.id, OrgUnit.code, Report.first_submitted_at)
        .join(OrgUnit, OrgUnit.id == Report.org_unit_id)
        .join(ReportingPeriod, ReportingPeriod.id == Report.period_id)
        .filter(ReportingPeriod.period_key == period, Report.is_late.is_(True))
    )
    if pham_vi is not None:
        q = q.filter(Report.org_unit_id.in_(pham_vi))
    return [BaoCaoMuonOut(id=i, org_unit_code=c, first_submitted_at=t) for i, c, t in q.all()]
```

Ba quy tắc:

- **Quyền** kiểm bằng `Depends(require_permission("mã.quyền"))` từ `backend/app/api/deps.py`. Nó chỉ kiểm có hay không có quyền.
- **Phạm vi** là bắt buộc với mọi endpoint đụng tới báo cáo. Lấy từ `pham_vi_bao_cao`, lọc truy vấn theo tập đơn vị nó trả (`None` là toàn Tổng công ty). Quên bước này là lộ số của cả 22 đơn vị, dù route trông vẫn như đã được gác vì có `require_permission`.
- **Gọi phạm vi như một dependency** (`_pham_vi` trong `reports.py`), không gọi trong thân hàm. FastAPI kiểm tham số query sau khi chạy xong dependency, nên kiểm phạm vi trong thân hàm làm người không có quyền nhận 422 (thiếu tham số) thay vì 403.

Endpoint danh mục (không trả số báo cáo) dùng `Depends(yeu_cau_xem_bao_cao)` thay cho hai thứ trên. Đừng chỉ dùng `Depends(current_user)`: tài khoản đã bị thu hết vai vẫn qua được cho tới khi token hết hạn.

### 4. Đặt route tĩnh trước route có tham số

`/reports/late` phải được khai TRƯỚC `/reports/{report_id}` trong file. Khai sau thì `/reports/{report_id}` bắt đường dẫn trước, không đổi được `"late"` thành số nguyên và trả 422:

```json
{"detail": [{"type": "int_parsing", "loc": ["path", "report_id"], "input": "late", ...}]}
```

### 5. Trả lỗi nghiệp vụ

Ném lớp lỗi trong `backend/app/core/errors.py`, câu `detail` bằng tiếng Việt. Frontend hiện nguyên văn câu này.

| Lớp | Mã |
|---|---|
| `ValidationError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |

Tham số thêm thành trường trong thân lỗi:

```python
raise ConflictError("Báo cáo đã tồn tại cho đơn vị và kỳ này", existing_id=existing.id)
# → 409 {"detail": "Báo cáo đã tồn tại cho đơn vị và kỳ này", "existing_id": 12}
```

### 6. Ghi dữ liệu

`db: Session = Depends(get_db)` cho một session mỗi request: tự commit khi route xong, tự rollback khi có lỗi. Không tự gọi `db.commit()`. Cần `id` của dòng vừa thêm thì `db.flush()`. Ghi `audit_log` trong cùng session để nhật ký và thay đổi cùng sống hoặc cùng mất.

### 7. Viết test

Test API nằm ở `backend/tests/api/`. Fixture `client` và `db` trong `tests/conftest.py` bọc mỗi test trong một transaction và rollback ở cuối, nên không phải dọn dữ liệu.

```python
from app.models import Report
from app.seed import seed_all
from tests.api.test_rbac import dang_nhap


def test_nop_muon_chi_trong_pham_vi(client, db):
    seed_all(db)
    db.query(Report).update({Report.is_late: True})

    h = dang_nhap(client, "u22@ptsc.local")
    r = client.get("/api/v1/reports/late?period=2026-07", headers=h)
    assert r.status_code == 200
    assert [d["org_unit_code"] for d in r.json()] == ["P05"]

    h = dang_nhap(client, "admin@ptsc.local")
    r = client.get("/api/v1/reports/late?period=2026-07", headers=h)
    assert len(r.json()) == 22
```

Báo cáo seed đều nộp đúng hạn, nên test tự đánh dấu muộn trước khi gọi. Bỏ hai dòng lọc `pham_vi` trong route thì test này đỏ: `u22` thấy cả 22 đơn vị thay vì chỉ P05.

Ca nên có cho mọi endpoint mới: người không có quyền nhận 403, người có quyền chỉ thấy đơn vị trong phạm vi, và từng lỗi nghiệp vụ.

```bash
cd backend
pytest tests/api/test_nop_muon.py
pytest
```

### 8. Gọi từ frontend

Mọi lời gọi đi qua `api` trong `frontend/src/api/client.ts`:

```ts
const q = useQuery({
  queryKey: ['reports', 'late', period],
  queryFn: () => api.get<BaoCaoMuon[]>(`/reports/late?period=${period}`),
})
```

Khoá bắt đầu bằng `'reports'` nên tự làm mới sau mỗi lần lưu số hoặc chuyển trạng thái (`invalidateReportQueries`).

### 9. Cập nhật tài liệu

Thêm endpoint vào bảng và mục chi tiết của [API](../reference/api.md), kèm thứ tự kiểm lỗi.

## Kiểm tra

- http://localhost:8000/docs có endpoint mới.
- Gọi bằng `curl` với token của hai vai khác nhau cho kết quả khác nhau theo phạm vi.
- `pytest` xanh.

## Gỡ lỗi

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| Mọi test lỗi `UndefinedTable: relation "org_unit" does not exist` | `hseq_test` chưa có bảng. Chạy migration cho nó, xem [Biến của pytest](../reference/cau-hinh-va-lenh.md#biến-của-pytest). |
| 422 `int_parsing` ở `report_id` | Route tĩnh khai sau route có tham số. Chuyển nó lên trên. |
| Người thiếu quyền nhận 422 thay vì 403 | Phạm vi đang kiểm trong thân hàm. Chuyển thành dependency. |
| 422 `extra_forbidden` | Request gửi khoá không có trong schema. Sửa request, đừng nới `extra`. |
| Container chạy mà endpoint trả 404 | Image cũ. `docker compose -f infra/docker-compose.yml up -d --build`. |
| 500, thân lỗi là chữ `Internal Server Error` | Có exception không thuộc lớp lỗi của dự án. Xem traceback trong log uvicorn, rồi ném đúng lớp lỗi ở bước 5. |

## Xem thêm

- [API](../reference/api.md): quy ước chung, mã lỗi, các endpoint hiện có.
- [Quyền và quy trình](../reference/quyen-va-quy-trinh.md#phạm-vi-xem-báo-cáo): phạm vi được tính thế nào.
- [An toàn nhập liệu](../explanation/an-toan-nhap-lieu.md): khoá phiên bản khi endpoint mới có ghi báo cáo.
