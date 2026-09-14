// frontend/src/app/routeScan.test.ts
//
// task-26-fix-2.md R4: RE_LINK_TO cũ (`[^>]*?`) không vượt được dấu `>` — mà `>` nằm ngay trong
// idiom JSX phổ biến nhất, `onClick={() => 0}`, đứng TRƯỚC `to=`. Một `<Link>` mang prop dạng đó
// biến mất hoàn toàn khỏi tập quét (routes.test.tsx "nguồn 4"), và không real page nào trong
// src/pages|src/features hiện có hình dạng đó — routes.test.tsx không có cách nào tự lộ ra lỗ này.
// File này test TRỰC TIẾP `duongDanTrongNoiDung` (khuôn resolveCascadeWinnerFromCss/cascade.test.ts
// — chuỗi input tự dựng, không phụ thuộc file thật trên đĩa) cho TỪNG kiểu trích dẫn/hình dạng prop
// đã dùng thật trong dự án, cộng thêm đúng hình dạng vừa vá.
import { describe, expect, it } from 'vitest'

import { duongDanTrongNoiDung } from './routeScan'

describe('duongDanTrongNoiDung — <Link to=>: từng kiểu trích dẫn/hình dạng prop (task-26-fix-2.md R4)', () => {
  it.each<[string, string, string]>([
    ['to="…" (nháy kép — Dashboard.tsx/Status.tsx)', '<Link to="/khong-ton-tai-A">x</Link>', '/khong-ton-tai-A'],
    ["to={'…'} (bọc trong {})", "<Link to={'/khong-ton-tai-B'}>x</Link>", '/khong-ton-tai-B'],
    [
      'có prop arrow function đứng TRƯỚC to= — `>` của "=>" đúng ca RE_LINK_TO vừa vá',
      '<Link onClick={() => 0} to="/khong-ton-tai-C">x</Link>',
      '/khong-ton-tai-C',
    ],
    [
      'thẻ xuống dòng, prop arrow function TRƯỚC to= trên dòng khác',
      '<Link\n  onClick={() => 0}\n  to="/khong-ton-tai-D"\n>\n  x\n</Link>',
      '/khong-ton-tai-D',
    ],
  ])('%s', (_ten, jsx, dichMongDoi) => {
    expect(duongDanTrongNoiDung(jsx)).toEqual([dichMongDoi])
  })

  // Tự vệ: hai `<Link>` liên tiếp, cái ĐẦU không có prop nào trước `to=` — đảm bảo chặn `</Link`
  // (thêm khi vá R4) không vô tình khiến quét bỏ sót hay lẫn lộn giữa hai thẻ liền kề.
  it('hai <Link> liên tiếp, không lẫn đích của nhau', () => {
    const jsx = '<Link to="/a">x</Link><Link onClick={() => 0} to="/b">y</Link>'
    expect(new Set(duongDanTrongNoiDung(jsx))).toEqual(new Set(['/a', '/b']))
  })
})
