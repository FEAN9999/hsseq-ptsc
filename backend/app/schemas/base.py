# backend/app/schemas/base.py
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer

# pydantic 2.13 mặc định serialize Decimal thành CHUỖI ("1284500.50").
# FE dùng z.number() nên phải ép về JSON number ở đúng một chỗ.
JsonNumber = Annotated[
    Decimal | None,
    PlainSerializer(lambda v: None if v is None else float(v),
                    return_type=float | None, when_used="json"),
]


class ApiModel(BaseModel):
    # `extra="forbid"`, KHÔNG phải mặc định `"ignore"` của pydantic: với
    # `"ignore"`, một khoá gõ sai ở trường TUỲ CHỌN (`thisPeriod` thay cho
    # `this_period`, `text` thay cho `texts`, `notes` thay cho `note`) đi lọt
    # thành **200 "đã lưu" mà không lưu gì — và `version` vẫn tăng**. Lượt ghi
    # rỗng đó đốt token khoá lạc quan: người đang mở cùng báo cáo nhận 409
    # "Người khác vừa sửa báo cáo này" trong khi thực tế không ai sửa gì
    # (final-review-R1-report.md §(A3)). Bốn trường tuỳ chọn đó là toàn bộ nội
    # dung người dùng gõ vào form FM01, nên cửa này mở đúng trên đường nhập
    # liệu chính. Ca canh: tests/api/test_put_values.py::
    # test_khoa_go_sai_bi_tu_choi_422_va_khong_dot_version.
    #
    # Bảo đảm này phủ **MỌI** thân request, không chỉ schemas/report.py:
    # `TransitionIn` (api/reports.py) và `DangNhapRequest` (api/auth.py) từng
    # kế thừa `BaseModel` trần nên vẫn `extra="ignore"` — một bảo đảm nửa vời
    # là một bảo đảm GIẢ (final-rereview-report.md §N1). Hai lớp đó nay cũng
    # qua `ApiModel`; ca canh: tests/api/test_transition.py::
    # test_khoa_go_sai_o_transition_bi_tu_choi_422_khong_duyet_bao_cao và
    # tests/api/test_auth.py::test_khoa_go_sai_o_login_bi_tu_choi_422_khong_cap_token.
    model_config = ConfigDict(from_attributes=True, extra="forbid")
