// frontend/src/app/casingScan.ts
//
// Chỉ chạy trong Node (qua Vitest), không bao giờ vào bundle trình duyệt — cùng kỹ thuật và cùng lý
// do với routeScan.ts và components/ui/cascade.ts.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const THU_MUC_QUET_HOA_THUONG = ['src'] as const

const GOC = join(dirname(fileURLToPath(import.meta.url)), '../..')
const GOC_REPO = join(GOC, '..')

/** Nhóm các đường dẫn chỉ khác nhau hoa/thường. Trả nhóm ≥2 phần tử PHÂN BIỆT, đã sắp xếp. */
export function nhomDungHoaThuong(duongDan: string[]): string[][] {
  const theoChuThuong = new Map<string, Set<string>>()
  for (const d of duongDan) {
    const khoa = d.toLowerCase()
    const tap = theoChuThuong.get(khoa) ?? new Set<string>()
    tap.add(d)
    theoChuThuong.set(khoa, tap)
  }
  return [...theoChuThuong.values()]
    .filter((tap) => tap.size > 1)
    .map((tap) => [...tap].sort())
    .sort((a, b) => a[0].localeCompare(b[0]))
}

/** Mọi đường dẫn file dưới các thư mục quét, đọc THẲNG từ đĩa, tương đối so với `frontend/`. */
function duongDanTrenDia(): string[] {
  const ra: string[] = []
  const di = (thuMuc: string) => {
    for (const muc of readdirSync(thuMuc, { withFileTypes: true })) {
      const day = join(thuMuc, muc.name)
      if (muc.isDirectory()) di(day)
      else ra.push(relative(GOC, day))
    }
  }
  for (const t of THU_MUC_QUET_HOA_THUONG) di(join(GOC, t))
  return ra
}

/**
 * Đường dẫn nằm trong GIT INDEX (đã `git add`) dưới các thư mục quét, chuẩn hoá về cùng dạng
 * tương đối so với `frontend/` như `duongDanTrenDia()`. Chạy `git ls-files` với cwd = gốc repo
 * (một cấp trên `frontend/`). Không phải repo git, chưa cài `git`, hay lệnh lỗi vì lý do khác: trả
 * mảng rỗng — ĐỪNG ném lỗi, để `duongDanNguon()` còn dùng được ngoài git (xem giải thích đầy đủ ở
 * JSDoc của `duongDanNguon()` và ở casingScan.test.ts).
 */
function duongDanTrongChiMucGit(): string[] {
  try {
    const raw = execFileSync('git', ['ls-files'], { cwd: GOC_REPO, encoding: 'utf-8' })
    const tienTo = THU_MUC_QUET_HOA_THUONG.map((t) => `frontend/${t}/`)
    return raw
      .split('\n')
      .filter((dong) => tienTo.some((tt) => dong.startsWith(tt)))
      .map((dong) => dong.slice('frontend/'.length))
  } catch {
    return []
  }
}

/**
 * Mọi đường dẫn file dưới các thư mục quét, tương đối so với `frontend/` — HỢP của git index ∪
 * đĩa. Trên macOS (APFS) hai đường dẫn chỉ khác hoa/thường không thể cùng tồn tại trên đĩa (hệ điều
 * hành gộp làm một inode), nên chỉ đọc đĩa (`readdirSync`) không bao giờ có thể thấy va chạm đó —
 * `nhomDungHoaThuong(duongDanTrenDia())` xanh vĩnh viễn trên máy này bất kể repo có va chạm hay
 * không. Git index thì khác: nó có thể giữ một đường dẫn (case cũ) song song với file case mới
 * trên đĩa, vì `core.ignorecase=true` chỉ đổi cách git SO SÁNH, không tự xoá entry cũ. Cộng thêm
 * góc nhìn index thì rào chắn ở casingScan.test.ts mới bắt được va chạm thật thay vì luôn xanh.
 */
export function duongDanNguon(): string[] {
  return [...new Set([...duongDanTrenDia(), ...duongDanTrongChiMucGit()])]
}
