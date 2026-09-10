# backend/app/api/org.py
"""Danh mục đơn vị — chỉ đọc. Không cần quyền riêng ngoài đăng nhập."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, current_user
from app.core.db import get_db
from app.models import OrgUnit

router = APIRouter(prefix="/org-units")


@router.get("/reporting")
def ds_don_vi_bao_cao(u: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """22 đầu mối (`is_reporting = true`) — người nhập chọn đơn vị, FE dựng bộ lọc."""
    ds = db.query(OrgUnit).filter_by(is_reporting=True).order_by(OrgUnit.id).all()
    return [{"id": o.id, "code": o.code, "name": o.name, "type": o.type} for o in ds]


@router.get("")
def cay_don_vi(u: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """Toàn bộ đơn vị dạng cây theo `parent_id`. Seed hiện chưa gán `parent_id`
    cho đơn vị nào (Task 6) nên cây này tạm thời phẳng — không phải lỗi ở đây."""
    ds = db.query(OrgUnit).order_by(OrgUnit.id).all()
    theo_id = {
        o.id: {"id": o.id, "code": o.code, "name": o.name, "type": o.type,
               "is_reporting": o.is_reporting, "children": []}
        for o in ds
    }
    goc = []
    for o in ds:
        node = theo_id[o.id]
        if o.parent_id is not None and o.parent_id in theo_id:
            theo_id[o.parent_id]["children"].append(node)
        else:
            goc.append(node)
    return goc
