// frontend/src/features/report/FormModeBar.tsx
//
// Thanh dính dưới của form (bản vẽ `.bar`): bên trái một câu cảnh báo, bên phải các nút.
//
// Nút KHÔNG hardcode theo trạng thái/vai. Chúng sinh thẳng từ `transitions` của
// `GET /templates/{code}` (backend/app/api/templates.py:104) — đúng ý định đã ghi trong docstring
// của endpoint đó ("FE vẽ nút Nộp / Trả lại / Duyệt thẳng theo danh sách này") và đúng
// task-22-carry.md C1 (quyền quyết định chế độ, không phải chuỗi vai trò). Nhờ vậy 5 chế độ của
// bảng D14 rơi ra từ dữ liệu:
//   nháp + report.submit        → "Nộp báo cáo"          (name_vi của seed)
//   trả lại + report.submit     → "Nộp lại"
//   đã nộp + report.return/approve → "Trả lại…" + "Duyệt"
//   đã duyệt + report.return    → "Mở lại…"
//   đã nộp + người nộp          → không nút nào
//
// Dấu "…" gắn vào đúng các chuyển trạng thái `requires_note` — nó là lời hứa "bấm xong còn một
// hộp thoại nữa" (Trả lại / Mở lại đều bắt nhập lý do, D24), không phải trang trí.
import { NUT_CHINH, NUT_GHOST, NUT_THUONG } from '../../components/ui/nut'
import type { ChuyenTrangThai } from './ReportForm'

/** Số mã chỉ tiêu tối đa liệt kê trong thanh trước khi rút gọn thành "+n". Cùng quy ước với thanh
 * coverage của dashboard ("≤ 4 tên, hơn thì +n", thiết kế dòng 623): một form trống hoàn toàn
 * thiếu 52 ô, liệt hết sẽ đẩy thanh dính cao gần nửa màn hình. */
const MA_HIEN_TOI_DA = 8

/** Mã chỉ tiêu → id neo trong DOM ("B-8.1" → "B-8-1"). Dấu chấm hợp lệ trong id nhưng lại là dấu
 * chọn lớp trong CSS/`querySelector`, nên bản vẽ states.html đã chọn sẵn dạng gạch (`id="B-8-1"`). */
export function maNeo(ma: string): string {
  return ma.replace(/\./g, '-')
}

/** Câu báo kết quả lần dán cột gần nhất; `null` khi lần dán vừa rồi trọn vẹn (hoặc chưa dán lần
 * nào). Hai nguyên nhân được nói RIÊNG (fix-2 F1): dòng không đọc được thì nêu tên được mã và ô
 * đích còn giữ số cũ; dòng tràn khỏi cuối lưới thì không có ô đích nào cả, chỉ đếm được. */
function cauBaoDan(boQua: string[], tran: number): string | null {
  if (boQua.length === 0 && tran === 0) return null
  const ve: string[] = []
  if (boQua.length > 0) {
    const con = boQua.length - MA_HIEN_TOI_DA
    const ds = boQua.slice(0, MA_HIEN_TOI_DA).join(', ') + (con > 0 ? `, +${con}` : '')
    // `boQua.length` là TỔNG THẬT, không phải độ dài danh sách đã cắt — hai con số chọi nhau
    // ("bỏ qua 8 dòng … +12") còn tệ hơn không báo.
    ve.push(`bỏ qua ${boQua.length} dòng không đọc được (${ds})`)
  }
  if (tran > 0) ve.push(`${tran} dòng vượt ngoài bảng`)
  if (boQua.length > 0) ve.push('ô đích giữ nguyên số cũ')
  return `Dán: ${ve.join(' · ')}`
}

export function FormModeBar({
  chuyenDuoc,
  suaDuoc,
  thieuBatBuoc,
  boQuaKhiDan,
  tranKhiDan,
  soDemLech,
  onLuu,
  onChuyenTrangThai,
}: {
  chuyenDuoc: ChuyenTrangThai[]
  suaDuoc: boolean
  /** Mã các chỉ tiêu còn thiếu ô bắt buộc — rỗng khi chưa bấm Nộp lần nào (D16: chỉ đỏ sau lần
   * bấm Nộp đầu tiên), nên component này không cần biết `daBamNop`. */
  thieuBatBuoc: string[]
  /** Mã các dòng bị bỏ qua ở lần dán cột gần nhất (fix-1 S1). Đứng TRƯỚC hai thông điệp kia trong
   * thứ tự ưu tiên vì nó là thứ vừa xảy ra dưới tay người dùng; "thiếu ô bắt buộc" và "bộ đếm
   * lệch" đã nằm đó sẵn từ trước cú dán. */
  boQuaKhiDan: string[]
  /** Số dòng tràn khỏi cuối lưới ở lần dán gần nhất (fix-2 F1). */
  tranKhiDan: number
  soDemLech: number
  onLuu: () => void
  onChuyenTrangThai: (chuyen: ChuyenTrangThai) => void
}) {
  const hienThi = thieuBatBuoc.slice(0, MA_HIEN_TOI_DA)
  const cauDan = cauBaoDan(boQuaKhiDan, tranKhiDan)
  return (
    // P3 (final-fix-FE.md, Ruling 425 · final-review-R3-report.md §A1): `bottom-0` cố định làm cụm
    // nút bên phải nằm ĐÚNG dưới Toast (`fixed right-6 bottom-6`) — bấm Duyệt xong, nút tiếp theo
    // không ăn suốt 4 giây. `bottom-[var(--toast-cao)]` cho thanh lùi lên đúng dải Toast đang
    // chiếm; biến mặc định `0px` (index.css) nên khi không có Toast thì thanh đứng y chỗ cũ.
    <div className="sticky bottom-[var(--toast-cao)] -mx-6 -mb-6 mt-3 flex items-center justify-between gap-4 bg-card border-t border-border px-5 py-3 text-sm">
      <div>
        {cauDan !== null ? (
          <span className="text-warning-foreground">{cauDan}</span>
        ) : thieuBatBuoc.length > 0 ? (
          <span className="text-destructive">
            Thiếu {thieuBatBuoc.length} ô bắt buộc:{' '}
            {hienThi.map((ma) => (
              <a key={ma} href={`#${maNeo(ma)}`} className="text-destructive font-medium underline mr-1.5">
                {ma}
              </a>
            ))}
            {thieuBatBuoc.length > hienThi.length && <span>+{thieuBatBuoc.length - hienThi.length}</span>}
          </span>
        ) : (
          // D25: bộ đếm lệch KHÔNG chặn nộp — câu này chỉ để người duyệt (và người nộp) biết vì
          // sao không có gì chặn họ lại.
          soDemLech > 0 && (
            <span className="text-warning-foreground">
              {soDemLech} bộ đếm lệch công thức chưa có ghi chú · vẫn được nộp
            </span>
          )
        )}
      </div>
      <div className="flex gap-2">
        {suaDuoc && (
          <button type="button" onClick={onLuu} className={NUT_THUONG}>
            Lưu
          </button>
        )}
        {chuyenDuoc.map((c) => (
          <button
            key={`${c.action_code}-${c.from_state}`}
            type="button"
            onClick={() => onChuyenTrangThai(c)}
            className={c.requires_note ? NUT_GHOST : NUT_CHINH}
          >
            {c.name_vi}
            {c.requires_note ? '…' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}
