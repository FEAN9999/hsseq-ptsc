// frontend/src/features/report/zodSchemaFromCatalog.test.ts
import { describe, expect, it } from 'vitest'
import { zodSchemaFromCatalog } from './zodSchemaFromCatalog'

// X-COUNTER/X-SNAPSHOT là mã hư cấu (task-16-fix-brief.md F4) — CATALOG này chỉ dùng nội bộ
// cho test, không phải fixture thật. `snapshot` không tồn tại trong FM01 (task-16-carry.md C1)
// nên không có mã thật nào để mượn; đặt tên rõ ràng để không ai tưởng đây là mã FM01 có thật.
const CATALOG = {
  indicators: [
    { code: 'B-2.1',      agg_type: 'sum',      decimals: 0, required: true,  formula: null },
    { code: 'B-1.1',      agg_type: 'sum',      decimals: 2, required: true,  formula: null },
    { code: 'B-1.4',      agg_type: 'computed', decimals: 2, required: false, formula: 'B-1.1' },
    { code: 'X-COUNTER',  agg_type: 'counter',  decimals: 0, required: true,  formula: null },
    { code: 'X-SNAPSHOT', agg_type: 'snapshot', decimals: 0, required: true,  formula: null },
  ],
}

describe('zodSchemaFromCatalog', () => {
  it('ô bắt buộc trống thì báo lỗi tiếng Việt', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { thisPeriod: null } })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('bắt buộc')
  })

  it('số âm bị chặn ngay ở client', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { thisPeriod: -1 } })
    expect(r.success).toBe(false)
  })

  it('decimals = 0 thì 1,5 bị chặn', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { thisPeriod: 1.5 } })
    expect(r.success).toBe(false)
  })

  it('decimals = 2 thì 12,35 hợp lệ', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({
      'B-2.1': { thisPeriod: 1 }, 'B-1.1': { thisPeriod: 12.35 },
    })
    expect(r.success).toBe(true)
  })

  // task-16-carry.md C3: 12.35 tình cờ an toàn (12.35*100 = 1235 chẵn). 8.29 mới là ca thật
  // của nhóm B-1 (giờ công, decimals=2) gây sai số dấu phẩy động nếu đếm bằng cách nhân 10^n
  // (8.29 * 100 = 828.9999999999999) — phải hợp lệ.
  it('decimals = 2 thì 8,29 hợp lệ (bẫy dấu phẩy động khi nhân luỹ thừa 10)', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-1.1': { thisPeriod: 8.29 } })
    expect(r.success).toBe(true)
  })

  // task-16-fix-brief.md F5: cùng họ lỗi với C3, đầu phổ nhỏ thay vì lớn. String(1e-7) ra
  // '1e-7' (ký hiệu mũ, không có dấu chấm) — nếu hàm đếm chỉ tìm dấu '.' sẽ trả 0 chữ số
  // thập phân, cho 1e-7 (thật ra 7 chữ số thập phân) lọt qua chỉ tiêu decimals=0.
  it('decimals = 0 thì 1e-7 (0,0000001) bị chặn — đầu phổ nhỏ của bẫy String()', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { thisPeriod: 1e-7 } })
    expect(r.success).toBe(false)
  })

  // task-16-fix-brief.md F9: bản cũ chỉ chứng minh "mã vắng mặt thì ổn" — đúng với MỌI mã,
  // không riêng computed. Đưa B-1.4 vào payload thật (dù rỗng) để đo đúng điều tên test nói.
  it('dòng computed không bao giờ bắt buộc', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({
      'B-2.1': { thisPeriod: 1 }, 'B-1.1': { thisPeriod: 1 }, 'B-1.4': {},
    })
    expect(r.success).toBe(true)
  })

  // task-16-fix-brief.md F1: report_rules.py:134 — cột KHÔNG thuộc editable_columns của
  // agg_type đó phải bị chặn, đúng câu "Dòng tự tính, không nhận giá trị gửi lên". Trước vòng
  // sửa này, schema nhận giá trị ở cả 3 cột cho mọi loại — sum.accPrev và computed.thisPeriod
  // đều lọt.
  describe('F1: chỉ cột `input` của cellPolicy mới nhận giá trị', () => {
    it('sum.accPrev bị chặn — sum chỉ nhận ở thisPeriod', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { accPrev: 5 } })
      expect(r.success).toBe(false)
      expect(JSON.stringify(r)).toContain('Dòng tự tính, không nhận giá trị gửi lên')
    })

    it('computed.thisPeriod bị chặn — computed không nhận ở cột nào', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-1.4': { thisPeriod: 5 } })
      expect(r.success).toBe(false)
      expect(JSON.stringify(r)).toContain('Dòng tự tính, không nhận giá trị gửi lên')
    })
  })

  // task-16-fix-brief.md F2: report_rules.py:71-75 — GIOI_HAN_DO_LON = 10^16, cùng ngưỡng,
  // cùng câu lỗi (Postgres Numeric(18,2) từ chối và ném 500 trần nếu lọt tới đó).
  describe('F2: chặn số quá lớn (>= 10^16)', () => {
    it('1e16 bị chặn', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { thisPeriod: 1e16 } })
      expect(r.success).toBe(false)
      expect(JSON.stringify(r)).toContain('Số quá lớn, tối đa 16 chữ số phần nguyên')
    })

    it('1e15 vẫn hợp lệ (chưa chạm ngưỡng)', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'B-2.1': { thisPeriod: 1e15 } })
      expect(r.success).toBe(true)
    })
  })

  // task-16-fix-brief.md F4: CATALOG trước đây chỉ có sum/computed, không ca nào có
  // requiredCell = 'accTotal' — hardcode `o.thisPeriod` thay `o[requiredCell]` vẫn 18/18 xanh.
  describe('F4: counter/snapshot — ô bắt buộc nằm ở accTotal, không phải thisPeriod', () => {
    it('counter: có thisPeriod nhưng thiếu accTotal vẫn báo bắt buộc', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'X-COUNTER': { thisPeriod: 5 } })
      expect(r.success).toBe(false)
    })

    it('counter: có accTotal (dù thisPeriod tuỳ chọn bỏ trống) thì hợp lệ', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'X-COUNTER': { accTotal: 10 } })
      expect(r.success).toBe(true)
    })

    it('snapshot: bỏ trống accTotal thì báo bắt buộc', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'X-SNAPSHOT': {} })
      expect(r.success).toBe(false)
    })

    it('snapshot: có accTotal thì hợp lệ', () => {
      const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'X-SNAPSHOT': { accTotal: 3 } })
      expect(r.success).toBe(true)
    })
  })

  // task-16-fix-brief.md F6: report_rules.py:126 — mã không có trong danh mục sinh lỗi, không
  // bị `.partial()` âm thầm loại bỏ.
  it('F6: mã không có trong danh mục thì báo lỗi, không biến mất lặng lẽ', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({ 'MA-LA': { thisPeriod: 1 } })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r)).toContain('Chỉ tiêu không có trong mẫu báo cáo')
  })
})
