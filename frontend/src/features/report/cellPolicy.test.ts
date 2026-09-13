// frontend/src/features/report/cellPolicy.test.ts
import { describe, expect, it, vi } from 'vitest'
import { cellPolicy } from './cellPolicy'

describe('cellPolicy: ma trận agg_type × 3 cột', () => {
  it('sum: chỉ Tháng này nhập được, bắt buộc ở Tháng này', () => {
    expect(cellPolicy('sum')).toEqual({
      accPrev: 'derived', thisPeriod: 'input', accTotal: 'derived',
      requiredCell: 'thisPeriod',
    })
  })

  it('counter: Tháng này tuỳ chọn, Cộng dồn nhập và bắt buộc', () => {
    expect(cellPolicy('counter')).toEqual({
      accPrev: 'derived', thisPeriod: 'input', accTotal: 'input',
      requiredCell: 'accTotal',
    })
  })

  it('snapshot: chỉ Cộng dồn', () => {
    expect(cellPolicy('snapshot')).toEqual({
      accPrev: 'empty', thisPeriod: 'empty', accTotal: 'input',
      requiredCell: 'accTotal',
    })
  })

  it('computed: cả 3 cột chỉ đọc, không bao giờ bắt buộc', () => {
    expect(cellPolicy('computed')).toEqual({
      accPrev: 'derived', thisPeriod: 'derived', accTotal: 'derived',
      requiredCell: null,
    })
  })

  // task-16-fix-brief.md F3: MAC_DINH_AN_TOAN tồn tại để khoá HẾT 3 cột, không riêng
  // thisPeriod — bản cũ chỉ khẳng định .thisPeriod, mở accTotal thành 'input' trong khối đó
  // vẫn 18/18 xanh (lỗi đúng chiều nguy hiểm: loại lạ mà mở được ô nhập). Khẳng định đủ hình
  // dạng để đột biến đó phải đỏ.
  it('agg_type lạ (giai đoạn 2) thì khoá cả 3 cột và cảnh báo, không vỡ trang', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(cellPolicy('ratio' as never)).toEqual({
      accPrev: 'derived', thisPeriod: 'derived', accTotal: 'derived',
      requiredCell: null,
    })
    expect(warn).toHaveBeenCalled()
  })
})

describe('cellPolicy khớp với catalog thật', () => {
  // task-16-carry.md C1: fixture thật KHÔNG có agg_type 'snapshot' (FM01 chỉ tình cờ không
  // dùng loại này — cellPolicy('snapshot') vẫn phải tồn tại, xem test ở trên). Vì vậy không
  // thể so bằng `toEqual(['computed','counter','snapshot','sum'])` như brief gốc — so bằng
  // phép BAO HÀM: mọi agg_type catalog thật có phải được cellPolicy nhận diện (không rơi vào
  // nhánh "agg_type lạ" ở trên). Danh mục thêm một loại mới mà cellPolicy chưa biết thì nhánh
  // đó gọi console.warn — test này đỏ ngay, không cần liệt kê cứng danh sách loại đã biết.
  it('mọi agg_type trong fm01-catalog.json đều có chính sách', async () => {
    const catalog = (await import('../../test/fixtures/fm01-catalog.json')).default
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warn.mockClear() // ca trên trong cùng file đã gọi console.warn — không dùng lịch sử của ca đó

    const loai = new Set(catalog.indicators.map((i: { agg_type: string }) => i.agg_type))
    for (const t of loai) cellPolicy(t as never)

    expect(warn).not.toHaveBeenCalled()
  })
})
