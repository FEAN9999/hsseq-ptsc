// frontend/src/app/casingScan.test.ts
//
// macOS (APFS) không phân biệt hoa/thường, Linux/CI thì có. Hệ quả đã đo thật: `shadcn add skeleton`
// GHI ĐÈ `ui/Skeleton.tsx` của repo trên máy dev, còn trên CI nó tạo file thứ hai — cùng một lệnh,
// hai cây nguồn khác nhau. `tsc` có bắt được (TS1149) nhưng chỉ khi có file import cả hai, nên
// không thể trông vào nó.
//
// Theo khuôn routeScan.test.ts: test hàm THUẦN bằng chuỗi tự dựng (không phụ thuộc đĩa), rồi khoá
// riêng hằng phạm vi, rồi mới quét cây thật.
import { describe, expect, it } from 'vitest'

import { duongDanNguon, nhomDungHoaThuong, THU_MUC_QUET_HOA_THUONG } from './casingScan'

describe('nhomDungHoaThuong — hàm thuần', () => {
  it('hai đường dẫn chỉ khác hoa/thường → một nhóm hai phần tử', () => {
    expect(nhomDungHoaThuong(['src/ui/Skeleton.tsx', 'src/ui/skeleton.tsx'])).toEqual([
      ['src/ui/Skeleton.tsx', 'src/ui/skeleton.tsx'],
    ])
  })

  it('tên khác nhau thật sự → không nhóm nào', () => {
    expect(nhomDungHoaThuong(['src/ui/SkeletonDong.tsx', 'src/ui/skeleton.tsx'])).toEqual([])
  })

  // Đụng ở phần THƯ MỤC cũng là đụng — Linux tách `Components/` và `components/` thành hai cây.
  it('khác hoa/thường ở thư mục, không phải tên file → vẫn là một nhóm', () => {
    expect(nhomDungHoaThuong(['src/Components/a.tsx', 'src/components/a.tsx'])).toEqual([
      ['src/Components/a.tsx', 'src/components/a.tsx'],
    ])
  })

  // Tự vệ: một đường dẫn kể hai lần KHÔNG phải đụng — nếu gộp bằng mảy thay vì Set thì ca này đỏ.
  it('trùng y hệt (cùng một đường dẫn kể hai lần) → KHÔNG tính là đụng', () => {
    expect(nhomDungHoaThuong(['src/a.tsx', 'src/a.tsx'])).toEqual([])
  })

  it('ba đường dẫn cùng nhóm → một nhóm ba phần tử, sắp xếp ổn định', () => {
    expect(nhomDungHoaThuong(['src/B.tsx', 'src/b.tsx', 'src/B.TSX'])).toEqual([
      ['src/B.TSX', 'src/B.tsx', 'src/b.tsx'],
    ])
  })
})

describe('phạm vi quét', () => {
  // Khẳng định thẳng vào hằng số: gỡ một thư mục ra khỏi phạm vi là ca này đỏ, không im lặng.
  it('quét đúng thư mục src', () => {
    expect([...THU_MUC_QUET_HOA_THUONG]).toEqual(['src'])
  })
})

describe('cây nguồn thật', () => {
  // duongDanNguon() giờ là HỢP của git index ∪ đĩa (xem JSDoc trong casingScan.ts) — chỉ đọc đĩa
  // thì trên macOS/APFS ca này xanh vĩnh viễn, vì hai đường dẫn chỉ khác hoa/thường không thể cùng
  // tồn tại trên đĩa. Nếu ca dưới đây ĐỎ, đó không phải hồi quy: repo đang có va chạm hoa/thường
  // thật giữa git index và đĩa, và thông điệp lỗi (tham số thứ hai của expect) nói rõ lệnh chữa.
  it('không có hai đường dẫn nào chỉ khác nhau hoa/thường', () => {
    expect(
      nhomDungHoaThuong(duongDanNguon()),
      'Va chạm hoa/thường giữa git index và đĩa (nhóm liệt kê ở "Received" bên dưới). Chỉ chủ dự ' +
        'án chữa được — cần ghi vào git index — bằng đúng lệnh sau:\n' +
        'git rm --cached --ignore-unmatch frontend/src/components/ui/Dialog.tsx ' +
        'frontend/src/components/ui/Dialog.test.tsx frontend/src/components/ui/Skeleton.tsx && ' +
        'git add -A frontend/src',
    ).toEqual([])
  })
})
