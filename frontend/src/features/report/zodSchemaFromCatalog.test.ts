// frontend/src/features/report/zodSchemaFromCatalog.test.ts
import { describe, expect, it } from 'vitest'
import { zodSchemaFromCatalog } from './zodSchemaFromCatalog'

const CATALOG = {
  indicators: [
    { code: 'B-2.1', agg_type: 'sum',      decimals: 0, required: true,  formula: null },
    { code: 'B-1.1', agg_type: 'sum',      decimals: 2, required: true,  formula: null },
    { code: 'B-1.4', agg_type: 'computed', decimals: 2, required: false, formula: 'B-1.1' },
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

  it('dòng computed không bao giờ bắt buộc', () => {
    const r = zodSchemaFromCatalog(CATALOG).safeParse({
      'B-2.1': { thisPeriod: 1 }, 'B-1.1': { thisPeriod: 1 },
    })
    expect(r.success).toBe(true)
  })
})
