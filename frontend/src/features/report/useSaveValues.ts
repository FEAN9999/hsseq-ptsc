// frontend/src/features/report/useSaveValues.ts
//
// Lớp LƯU của form FM01 (thiết kế D23): không autosave theo đồng hồ — lưu khi RỜI Ô CÓ SỬA,
// debounce 1,5 giây, gộp các ô đổi từ lần lưu trước thành MỘT `PUT /reports/{id}/values`.
// Thêm nút "Lưu" / Ctrl+S (`saveNow`) và `beforeunload` khi còn ô chưa lưu.
//
// NĂM ĐIỀU ĐỊNH HÌNH FILE NÀY:
//
// 1. THÂN REQUEST LÀ `{version, values[]}` (backend/app/schemas/report.py `PutValuesIn`).
//    `version` là khoá lạc quan: gửi sai số là 409 ở MỌI lần lưu. Sau mỗi lần lưu, `version` mới
//    lấy từ PHẢN HỒI — không tự cộng 1, vì lần ghi của người khác cũng đẩy số đó lên.
//
// 2. PAYLOAD MỘT PHẦN: chỉ mã có mặt trong `values` bị đụng tới, mã vắng mặt giữ nguyên nội dung
//    đang lưu (`validate_values`, app/domain/report_rules.py). Nên hàng chờ dưới đây chỉ giữ ô đã
//    đổi TỪ LẦN LƯU TRƯỚC, không phải mọi ô đã từng đổi.
//
// 3. PHẢN HỒI PUT PHẢI ĐƯỢC ĐẨY NGƯỢC LÊN FORM (task-23-carry.md C9). `ghi_gia_tri` trả
//    `doc_gia_tri(...)` — cùng đường tính `computed`/`counter_check`/`diff` với `GET /reports/{id}`
//    (services/reports.py:369-374, 509). Task 22 cố ý KHÔNG chép `evaluate_computed` sang
//    TypeScript, nên `giaTriMoi` dưới đây là con đường DUY NHẤT để dòng "Tổng giờ công" đổi số.
//
// 4. 409 CÓ HAI NGHĨA, phân biệt bằng SỰ CÓ MẶT của `values` trong thân lỗi chứ không bằng chuỗi
//    `detail` (câu đó dựng ĐỘNG từ tên tiếng Việt của transition trong DB — hop-dong-loi-backend.md).
//    Có `values` = "người khác vừa sửa": vẽ lại cột chỉ đọc THẲNG TỪ THÂN LỖI, không gọi lại GET.
//    Không có `values` = thao tác không hợp lệ ở trạng thái hiện tại: chỉ hiện `detail` nguyên văn.
//
// 5. SAI LUẬT NGHIỆP VỤ LÀ 400, KHÔNG PHẢI 422 (services/reports.py:427,465). 422 ở dự án này chỉ
//    xảy ra khi payload sai schema Pydantic, tức lỗi lập trình FE.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, ApiError, type ApiErrorItem } from '../../api/client'
import { invalidateReportQueries } from '../../api/invalidate'
import { formatTime } from '../../lib/format'
import type { GiaTriBaoCao, LoiXungDot } from './ReportForm'

/** `idle` chưa đụng gì · `dirty` có ô chờ · `saving` đang bay · `saved` server đã nhận ·
 * `error` lượt gửi vừa rồi hỏng (ô vẫn nằm trong hàng chờ, không mất). */
type TrangThaiLuu = 'idle' | 'saving' | 'saved' | 'dirty' | 'error'

/** Ô đã đổi của MỘT chỉ tiêu. Ba khoá này là đúng ba trường ghi được của `ValueIn`
 * (app/schemas/report.py) — không có `accPrev`: không agg_type nào cho nhập cột đó. */
export interface ODoi {
  thisPeriod?: number | null
  accTotal?: number | null
  note?: string
}

interface OGui {
  indicator_code: string
  this_period?: number | null
  acc_total_entered?: number | null
  note?: string
}

interface PhanHoiLuu {
  version: number
  values: GiaTriBaoCao[]
}

export interface KetQuaLuu {
  status: TrangThaiLuu
  /** "14:02" giờ VN của lần lưu thành công gần nhất. */
  savedAt: string | null
  /** Số Ô (không phải số DÒNG) đang chờ gửi — dải đầu nói "Chưa lưu (3 ô)". */
  dirtyCount: number
  /** Lượt gửi gần nhất hỏng vì MẠNG (không phải vì server từ chối) → banner offline, tự gửi lại
   * khi trình duyệt báo `online`. */
  offline: boolean
  /** `detail` NGUYÊN VĂN của lỗi server không phải xung đột phiên bản. Tuyệt đối không viết lại
   * câu: 409 loại hai và 400 đều mang câu do backend dựng. */
  loiLuu: string | null
  /** Từng dòng lỗi của 400 (`errors[]`), đi kèm `loiLuu`. `detail` của 400 chỉ là "Dữ liệu không
   * hợp lệ" — câu đó một mình không nói được ô nào sai, mà đây lại là ĐƯỜNG DUY NHẤT lỗi độ dài
   * 2000 ký tự của ba ô chữ nhóm C về được tới màn hình (`services/reports.py:515`). */
  loiLuuChiTiet: ApiErrorItem[] | null
  /** 409 "người khác vừa sửa": object MỚI mỗi lần xung đột (nơi gọi theo dõi bằng danh tính). */
  xungDot: LoiXungDot | null
  /** Giá trị server trả về sau lần lưu thành công gần nhất — C9. Object MỚI mỗi lần lưu. */
  giaTriMoi: PhanHoiLuu | null
  markDirty: (ma: string, o: ODoi) => void
  /** `true` khi server đã nhận (hoặc không có gì để gửi); `false` khi lượt gửi hỏng. "Nộp" đọc
   * giá trị này để không chuyển trạng thái bằng số chưa lên tới server. */
  saveNow: () => Promise<boolean>
}

/** Thiết kế dòng 681: 1,5 giây. */
const DO_TRE = 1500

/** Đếm Ô, không đếm DÒNG: sửa cả "Tháng này" lẫn "Cộng dồn" của một chỉ tiêu là 2 ô chưa lưu. */
function demO(hangCho: Map<string, ODoi>): number {
  let n = 0
  for (const o of hangCho.values()) n += Object.keys(o).length
  return n
}

/** Hàng chờ → `values[]` của request. Khoá nào KHÔNG được đánh dấu thì KHÔNG có mặt: backend coi
 * trường vắng mặt là "ô này không đổi" (ValueIn mặc định None), nên gửi thừa một khoá là nói dối
 * về thứ người dùng vừa làm. */
function thanGui(hangCho: Map<string, ODoi>): OGui[] {
  return [...hangCho].map(([ma, o]) => ({
    indicator_code: ma,
    ...('thisPeriod' in o ? { this_period: o.thisPeriod } : {}),
    ...('accTotal' in o ? { acc_total_entered: o.accTotal } : {}),
    ...('note' in o ? { note: o.note } : {}),
  }))
}

export function useSaveValues(reportId: number, phienBanDau: number): KetQuaLuu {
  const qc = useQueryClient()
  const [status, setStatus] = useState<TrangThaiLuu>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [dirtyCount, setDirtyCount] = useState(0)
  const [offline, setOffline] = useState(false)
  const [loiLuu, setLoiLuu] = useState<string | null>(null)
  const [loiLuuChiTiet, setLoiLuuChiTiet] = useState<ApiErrorItem[] | null>(null)
  const [xungDot, setXungDot] = useState<LoiXungDot | null>(null)
  const [giaTriMoi, setGiaTriMoi] = useState<PhanHoiLuu | null>(null)

  // Hàng chờ nằm trong ref chứ không trong state: callback của `setTimeout` và `.then` của request
  // phải đọc bản MỚI NHẤT, không phải bản đóng băng trong closure của lần render đã hẹn giờ.
  // `dirtyCount` là bản sao chỉ để VẼ.
  const hangCho = useRef(new Map<string, ODoi>())
  // `phienBanDau` chỉ dùng cho lần khởi tạo: từ lúc form mở, `version` đi theo phản hồi PUT/409,
  // không đi theo prop — nếu không, một lượt refetch của TanStack Query (invalidate sau mỗi lần
  // lưu) sẽ đẩy ngược số cũ vào đây giữa hai lần gõ.
  const phienBan = useRef(phienBanDau)
  const hen = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dangBay = useRef<Promise<boolean> | null>(null)

  function huyHen() {
    if (hen.current !== null) {
      clearTimeout(hen.current)
      hen.current = null
    }
  }

  function datHen() {
    huyHen()
    hen.current = setTimeout(() => {
      hen.current = null
      void saveNow()
    }, DO_TRE)
  }

  /** Trả ô đã gửi hỏng về hàng chờ. Ô nào người dùng đã gõ ĐÈ trong lúc request bay thì giữ bản
   * mới — trả nguyên si bản cũ về là xoá đúng thứ vừa gõ dưới tay họ. */
  function traLaiHangCho(daGui: Map<string, ODoi>) {
    for (const [ma, o] of daGui) hangCho.current.set(ma, { ...o, ...hangCho.current.get(ma) })
    setDirtyCount(demO(hangCho.current))
  }

  async function gui(): Promise<boolean> {
    // Nhấc hết ô ra khỏi hàng chờ TRƯỚC khi gửi: ô gõ trong lúc request bay thuộc về lượt sau.
    const daGui = hangCho.current
    hangCho.current = new Map()
    setDirtyCount(0)
    setStatus('saving')
    setLoiLuu(null)
    setLoiLuuChiTiet(null)
    try {
      const kq = await api.put<PhanHoiLuu>(`/reports/${reportId}/values`, {
        version: phienBan.current,
        values: thanGui(daGui),
      })
      phienBan.current = kq.version
      setGiaTriMoi({ version: kq.version, values: kq.values })
      setSavedAt(formatTime(new Date().toISOString()))
      setOffline(false)
      // Gõ tiếp trong lúc request bay thì vẫn còn ô chưa lưu — "Đã lưu 14:02" lúc đó là nói dối.
      setStatus(hangCho.current.size > 0 ? 'dirty' : 'saved')
      invalidateReportQueries(qc, reportId)
      return true
    } catch (loi) {
      traLaiHangCho(daGui)
      setStatus('error')
      if (loi instanceof ApiError) {
        // Cả hai loại 409 đều mang `version` mới: nhận lấy để lần gửi sau không đụng lại chính
        // cái xung đột vừa rồi. Canh `typeof` là vì 400/403 KHÔNG mang `version` — với 409 thì
        // hợp đồng (hop-dong-loi-backend.md, quét AST) bảo đảm luôn có, nên nhánh xung đột dưới
        // đây đọc thẳng `phienBan.current` chứ không canh thêm lần nữa cho một ca không tồn tại.
        if (typeof loi.version === 'number') phienBan.current = loi.version
        if (loi.status === 409 && Array.isArray(loi.values)) {
          setXungDot({ detail: loi.detail, version: phienBan.current, values: loi.values as GiaTriBaoCao[] })
        } else {
          setLoiLuu(loi.detail)
          setLoiLuuChiTiet(loi.errors ?? null)
        }
      } else {
        // Không phải `ApiError` = chưa từng có phản hồi nào (fetch ném TypeError). Đó là mất mạng,
        // không phải server từ chối.
        setOffline(true)
      }
      return false
    } finally {
      dangBay.current = null
    }
  }

  async function saveNow(): Promise<boolean> {
    huyHen()
    // Đang có một lượt bay: chờ nó xong rồi mới gửi tiếp. Gửi chồng lên nó là cầm chắc 409 với
    // chính mình, vì `version` mới chỉ có trong phản hồi chưa về.
    const dang = dangBay.current
    if (dang) await dang
    if (hangCho.current.size === 0) return true
    const p = gui()
    dangBay.current = p
    return p
  }

  function markDirty(ma: string, o: ODoi) {
    hangCho.current.set(ma, { ...hangCho.current.get(ma), ...o })
    setDirtyCount(demO(hangCho.current))
    setStatus('dirty')
    datHen()
  }

  useEffect(() => {
    function chanDongTab(e: BeforeUnloadEvent) {
      // `dangBay` cũng tính: ô đã rời hàng chờ nhưng chưa có xác nhận nào từ server, đóng tab lúc
      // này vẫn là mất số.
      if (hangCho.current.size === 0 && dangBay.current === null) return
      // Trình duyệt hiện hộp thoại CHUẨN CỦA NÓ, không nhận câu chữ riêng (Chrome bỏ từ 2016).
      // `preventDefault` là cách đúng chuẩn hiện nay; `returnValue` cho trình duyệt cũ.
      e.preventDefault()
      e.returnValue = ''
    }
    function khiCoMang() {
      // Không cần canh "còn ô nào không": `saveNow` tự về sớm khi hàng chờ rỗng. Canh thêm ở đây
      // là chép lại đúng phép kiểm đó lần thứ hai.
      void saveNow()
    }
    window.addEventListener('beforeunload', chanDongTab)
    window.addEventListener('online', khiCoMang)
    return () => {
      window.removeEventListener('beforeunload', chanDongTab)
      window.removeEventListener('online', khiCoMang)
      // Rời màn hình thì huỷ hẹn: không có ai đọc kết quả nữa, và một PUT bắn ra sau khi form đã
      // chết chỉ làm mọi tab khác dính 409.
      huyHen()
    }
    // Mảng rỗng có chủ ý: `saveNow` của lần render đầu đọc mọi thứ nó cần qua ref (`hangCho`,
    // `phienBan`, `dangBay`) và qua hằng của phiên (`reportId`, `qc`), nên closure cũ không hề cũ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    status,
    savedAt,
    dirtyCount,
    offline,
    loiLuu,
    loiLuuChiTiet,
    xungDot,
    giaTriMoi,
    markDirty,
    saveNow,
  }
}
