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
    model_config = ConfigDict(from_attributes=True)
