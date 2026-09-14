// frontend/src/app/routeScan.test.ts
//
// task-26-fix-2.md R4: RE_LINK_TO cũ (`[^>]*?`) không vượt được dấu `>` — mà `>` nằm ngay trong
// idiom JSX phổ biến nhất, `onClick={() => 0}`, đứng TRƯỚC `to=`. Một `<Link>` mang prop dạng đó
// biến mất hoàn toàn khỏi tập quét (routes.test.tsx "nguồn 4"), và không real page nào trong
// src/pages|src/features hiện có hình dạng đó — routes.test.tsx không có cách nào tự lộ ra lỗ này.
// File này test TRỰC TIẾP `duongDanTrongNoiDung` (khuôn resolveCascadeWinnerFromCss/cascade.test.ts
// — chuỗi input tự dựng, không phụ thuộc file thật trên đĩa) cho TỪNG kiểu trích dẫn/hình dạng prop
// đã dùng thật trong dự án, cộng thêm đúng hình dạng vừa vá.
//
// task-26-fix-3.md S3: vòng 2 chỉ mở rộng HÌNH DẠNG PROP của `<Link>`, chưa mở rộng TÊN THẺ — nên
// `<NavLink>`/`<Navigate>` (idiom react-router THẬT, Sidebar.tsx/routes.tsx/router.tsx đang dùng)
// hoàn toàn vô hình, và nửa `navigate()` của `duongDanTrongNoiDung` (đã có từ trước) chưa từng có
// ca nào trong file này. Bổ sung cả hai — xem bình luận "PHỦ/KHÔNG PHỦ" đầu `routeScan.ts` cho
// quyết định phạm vi đầy đủ (chỉ phủ hình dạng dự án ĐANG dùng thật, không cố phủ mọi hình dạng
// tưởng tượng).
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

  // Tự vệ: hai `<Link>` liên tiếp, cái ĐẦU không có prop nào trước `to=` — hai đích tách bạch, dù
  // KHÔNG thật sự đi qua chặn dừng `</Link` (xem ca [N-01] ở describe khối dưới — regex lười tìm
  // `to=` của thẻ đầu trước khi chạm `</Link`, nên ca này không chứng minh được chặn dừng).
  it('hai <Link> liên tiếp, không lẫn đích của nhau', () => {
    const jsx = '<Link to="/a">x</Link><Link onClick={() => 0} to="/b">y</Link>'
    expect(new Set(duongDanTrongNoiDung(jsx))).toEqual(new Set(['/a', '/b']))
  })
})

describe('duongDanTrongNoiDung — <NavLink>/<Navigate> (task-26-fix-3.md S3: idiom dự án ĐANG dùng thật)', () => {
  it.each<[string, string, string]>([
    ['<NavLink to="…"> (idiom Sidebar.tsx MucNav)', '<NavLink to="/khong-ton-tai-E">x</NavLink>', '/khong-ton-tai-E'],
    [
      '<Navigate to="…" replace /> (idiom routes.tsx/router.tsx — tự đóng)',
      '<Navigate to="/khong-ton-tai-F" replace />',
      '/khong-ton-tai-F',
    ],
    ['to = "…" (khoảng trắng quanh =, hợp lệ cú pháp JSX dù hiếm gặp)', '<Link to = "/khong-ton-tai-G">x</Link>', '/khong-ton-tai-G'],
  ])('%s', (_ten, jsx, dichMongDoi) => {
    expect(duongDanTrongNoiDung(jsx)).toEqual([dichMongDoi])
  })

  // Đúng hình dạng THẬT DUY NHẤT của <NavLink> trong dự án (Sidebar.tsx:35, qua prop `to`) — `to`
  // là một BIẾN, không phải chuỗi literal, nên không có dấu trích dẫn ngay sau `to={` — quét ĐÚNG Ý
  // không ra phần tử nào (không phải bỏ sót: "nguồn 1" routes.test.tsx dựng Sidebar thật rồi đọc
  // href thật thay thế cho occurrence CHÍNH XÁC này).
  it('<NavLink to={bien}> — biến động, không phải literal — KHÔNG ra phần tử nào (khớp occurrence thật Sidebar.tsx)', () => {
    const jsx = '<NavLink to={to} className={({ isActive }) => (isActive ? "a" : "b")}>x</NavLink>'
    expect(duongDanTrongNoiDung(jsx)).toEqual([])
  })

  // [N-01] task-26-rereview-2.md Phần B: chặn dừng `(?!<\/(?:Link|NavLink|Navigate))` (vá ở R4,
  // mở rộng tên thẻ ở S3) trước vòng này CHƯA ca nào thật sự ĐI QUA nó — ca "hai <Link> liên tiếp"
  // ở trên KHÔNG chứng minh được vì quét lười (`*?`) luôn dừng ở `to=` GẦN NHẤT, và khi thẻ nào
  // cũng có `to=` riêng, tập kết quả giống hệt nhau dù có chặn hay không (chỉ khác thẻ nào "nhận"
  // đích — không quan sát được qua tập kết quả). Cảnh chặn dừng THẬT SỰ đổi kết quả: thẻ Link-họ
  // KHÔNG có `to=` (có `</Link>` đóng hẳn) đứng trước một PHẦN TỬ KHÁC (không phải Link/NavLink/
  // Navigate) mang thuộc tính tên `to=` không liên quan gì tới điều hướng. KHÔNG chặn dừng: quét
  // vượt qua hẳn `</Link>` rồi đọc nhầm `to=` của phần tử khác đó, thêm một đích BỊA vào tập. CÓ
  // chặn dừng (mã hiện tại): match từ `<Link` thất bại ngay tại `</Link>`, và vì phần tử kia không
  // phải Link/NavLink/Navigate nên KHÔNG có match nào khác — tập kết quả đúng là RỖNG.
  it('[N-01] <Link> không to= (có </Link> đóng) đứng trước prop `to=` của phần tử KHÔNG PHẢI Link-họ — chặn dừng ngăn đọc nhầm', () => {
    const jsx = '<Link className="a">child</Link>\n<SomeThing to="/khong-phai-dich-dieu-huong">x</SomeThing>'
    expect(duongDanTrongNoiDung(jsx)).toEqual([])
  })
})

describe('duongDanTrongNoiDung — navigate(): cả ba kiểu trích dẫn (task-26-fix-3.md S3 — [N-33] chưa ca nào trước vòng này)', () => {
  it.each<[string, string, string]>([
    ["navigate('…') nháy đơn (useChuyenTrangThai.ts)", "navigate('/khong-ton-tai-I')", '/khong-ton-tai-I'],
    ['navigate("…") nháy kép', 'navigate("/khong-ton-tai-J")', '/khong-ton-tai-J'],
    ['navigate(`…`) template literal', 'navigate(`/khong-ton-tai-K`)', '/khong-ton-tai-K'],
  ])('%s', (_ten, jsCall, dichMongDoi) => {
    expect(duongDanTrongNoiDung(jsCall)).toEqual([dichMongDoi])
  })

  // Đúng ý carry C5 nguồn 2 (task-26-fix-1.md Q3 bình luận RE_NAVIGATE): navigate(biến) — đích ĐỘNG,
  // không phải hằng số tĩnh — KHÔNG được quét; kiểm bằng chạy THẬT đường đăng nhập (Login.test.tsx).
  it('navigate(bien) — đích động — KHÔNG ra phần tử nào', () => {
    expect(duongDanTrongNoiDung('navigate(noiBo)')).toEqual([])
  })
})
