// frontend/src/features/report/useChuyenTrangThai.ts
//
// Lớp CHUYỂN TRẠNG THÁI của form FM01: hỏi lại bằng `Dialog`, gửi `POST /reports/{id}/transition`,
// làm mới cache, rồi toast. Tên hook KHÔNG phải `useTransition` — đó là hook có sẵn của React
// (`import { useTransition } from 'react'`), trùng tên nghĩa là file nào lỡ cần cả hai sẽ vỡ.
//
// NĂM ĐIỀU ĐỊNH HÌNH FILE NÀY:
//
// 1. THÂN REQUEST LÀ `{action, expected_state, version, note?}` (`TransitionIn`,
//    backend/app/api/reports.py:155). `expected_state` + `version` là khoá lạc quan — gửi sai một
//    trong hai là 409 (`services/workflow.py:198`).
//
// 2. HÀNH ĐỘNG ĐI TỪ DỮ LIỆU, KHÔNG TỪ CHUỖI VIẾT CỨNG. `action_code`/`requires_note` lấy nguyên
//    từ `GET /templates/{code}` — mẫu báo cáo thứ hai phải chạy được mà không sửa file này
//    (CONTEXT.md). Riêng CÂU CHỮ của bốn hộp thoại thì spec dòng 682 chốt nguyên văn theo từng
//    thao tác, nên bảng `CAU_CHU` dưới đây tra theo `action_code` — và có nhánh rơi về `name_vi`
//    cho mọi mã lạ, chứ không phải một phép rẽ nhánh đóng.
//
// 3. LỖI NÀO CŨNG ĐÓNG HỘP THOẠI rồi đẩy lên cho form hiện banner (spec dòng 682: "409 trong
//    dialog → đóng dialog, banner 409 của form"). Callback tên `onLoi` chứ không phải `onConflict`
//    như brief khai: cùng đường đó còn mang 400 "thiếu ô bắt buộc lúc nộp"
//    (`services/workflow.py:229`, kèm `errors[]`) và 403 — gọi nó là "conflict" là nói dối về ba
//    phần tư số ca đi qua nó.
//
// 4. KHÔNG ĐOÁN NGHĨA CỦA 409. Hai loại 409 của transition (xung đột phiên bản / thao tác không
//    hợp lệ ở trạng thái hiện tại) đều mang ĐÚNG `{state, version}` như nhau — không có dấu hiệu
//    nào trong thân phân biệt được, và `detail` thì dựng ĐỘNG từ tên tiếng Việt trong DB
//    (hop-dong-loi-backend.md). Nên ở đây chỉ chuyển `detail` nguyên văn lên trên, tuyệt đối
//    không rẽ nhánh theo chuỗi và không tự chế câu thay server.
//
// 5. TOAST DỰNG TỪ `name_vi`, không phải từ một bảng chuỗi thứ hai: "Nộp báo cáo" → "Đã nộp báo
//    cáo", "Duyệt" → "Đã duyệt". Chỉ HẠ CHỮ CÁI ĐẦU (không `toLowerCase()` cả câu) để tên riêng
//    trong `name_vi` của mẫu khác không bị hạ theo.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { api, ApiError, type ApiErrorItem } from '../../api/client'
import { invalidateReportQueries } from '../../api/invalidate'
import { useToast } from '../../components/ui/Toast'
import { formatPeriod } from '../../lib/format'
import type { ChuyenTrangThai, DauBaoCao } from './ReportForm'

/** Lỗi của một lượt chuyển trạng thái, đã bóc sẵn cho banner của form. `errors` là danh sách ô
 * thiếu/sai của 400 — hiện ra từng dòng, không nuốt thành một câu chung chung. */
export interface LoiChuyen {
  detail: string
  errors: ApiErrorItem[] | null
}

/** Câu chữ của một hộp thoại xác nhận — đúng bộ prop mà `Dialog` nhận. */
export interface NoiDungDialog {
  title: string
  body?: string
  confirmLabel: string
  danger: boolean
  requireNote: boolean
  noteLabel: string
}

interface CauChu {
  title: (dau: DauBaoCao) => string
  body?: string
  confirmLabel: string
  danger?: boolean
  noteLabel?: string
}

/** Spec dòng 682, NGUYÊN VĂN. Mã lạ (mẫu báo cáo khác) rơi về `name_vi` — xem `noiDungDialog`. */
const CAU_CHU: Record<string, CauChu> = {
  submit: {
    title: (dau) => `Nộp báo cáo ${formatPeriod(dau.period_key)} của ${dau.org_unit.name}?`,
    body: 'Sau khi nộp bạn không sửa được cho tới khi Ban ATCL trả lại.',
    confirmLabel: 'Nộp',
  },
  approve: {
    title: () => 'Duyệt báo cáo này?',
    body: 'Số liệu sẽ vào tổng toàn Tổng công ty.',
    confirmLabel: 'Duyệt',
  },
  return: {
    title: () => 'Trả lại báo cáo',
    confirmLabel: 'Trả lại',
    danger: true,
    noteLabel: 'Lý do trả lại (người nộp sẽ thấy nguyên văn)',
  },
  reopen: {
    title: () => 'Mở lại báo cáo',
    body: 'Số liệu sẽ rời khỏi tổng cho tới khi duyệt lại',
    confirmLabel: 'Mở lại',
    noteLabel: 'Lý do mở lại (người nộp sẽ thấy nguyên văn)',
  },
}

/** Câu chữ hộp thoại cho một chuyển trạng thái.
 *
 * `requireNote` lấy từ DỮ LIỆU (`c.requires_note` của `GET /templates/{code}`), không lấy từ bảng
 * trên: bảng chỉ giữ câu chữ. Nhờ vậy "Mở lại" bắt nhập lý do vì seed khai `requires_note=true`,
 * chứ không vì ai đó nhớ thêm nó vào một danh sách thứ hai. */
export function noiDungDialog(c: ChuyenTrangThai, dau: DauBaoCao): NoiDungDialog {
  const cau = CAU_CHU[c.action_code]
  return {
    title: cau ? cau.title(dau) : `${c.name_vi}?`,
    body: cau?.body,
    confirmLabel: cau?.confirmLabel ?? c.name_vi,
    danger: cau?.danger ?? false,
    requireNote: c.requires_note,
    noteLabel: cau?.noteLabel ?? `Lý do (người nộp sẽ thấy nguyên văn)`,
  }
}

/** "Nộp báo cáo" → "nộp báo cáo". Chỉ chữ cái đầu: `toLowerCase()` cả câu sẽ hạ luôn tên riêng
 * trong `name_vi` của mẫu khác ("Gửi Ban ATCL" → "gửi ban atcl"). */
function chuDauThanhThuong(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export interface KetQuaChuyenTrangThai {
  /** Chuyển trạng thái đang chờ xác nhận; `null` khi không hỏi gì cả. */
  dangHoi: ChuyenTrangThai | null
  /** Hộp thoại có đang mở không — luôn bằng `dangHoi !== null`. */
  dialogMo: boolean
  /** Từ lúc bấm nút chính tới lúc server trả lời. */
  pending: boolean
  /** Mở hộp thoại xác nhận cho một chuyển trạng thái. */
  hoi: (c: ChuyenTrangThai) => void
  /** Đóng hộp thoại, không gửi gì. */
  huy: () => void
  /** Gửi `POST /reports/{id}/transition`. `expectedState`/`version` do nơi gọi đọc ra ĐÚNG LÚC
   * xác nhận (form giữ `version` mới nhất trong reducer của nó, cập nhật sau mỗi lần lưu). */
  xacNhan: (
    c: ChuyenTrangThai,
    expectedState: string,
    version: number,
    ghiChu: string,
  ) => Promise<void>
}

export function useChuyenTrangThai(
  reportId: number,
  dau: DauBaoCao,
  opts: { onLoi?: (loi: LoiChuyen) => void } = {},
): KetQuaChuyenTrangThai {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const [dangHoi, setDangHoi] = useState<ChuyenTrangThai | null>(null)
  const [pending, setPending] = useState(false)

  async function xacNhan(c: ChuyenTrangThai, expectedState: string, version: number, ghiChu: string) {
    setPending(true)
    try {
      await api.post(`/reports/${reportId}/transition`, {
        action: c.action_code,
        expected_state: expectedState,
        version,
        // Chỉ gửi `note` cho thao tác CÓ đòi lý do: `TransitionIn.note` mặc định `None`, gửi thừa
        // một chuỗi rỗng là ghi đè `decision_note` của lượt trả lại trước bằng khoảng trắng.
        ...(c.requires_note ? { note: ghiChu } : {}),
      })
      setDangHoi(null)
      // Trước toast: câu "Đã duyệt · [Xem dashboard]" là lời hứa số đã đổi, mà số chỉ đổi khi cache
      // được dọn (task-24-carry.md C2 — chờ thêm không cứu được cache sai).
      invalidateReportQueries(qc, reportId)
      if (c.action_code === 'approve') {
        toast(`Đã ${chuDauThanhThuong(c.name_vi)}`, {
          label: 'Xem dashboard',
          onClick: () => navigate('/dashboard'),
        })
      } else if (c.action_code === 'submit') {
        // Kỳ nằm trong câu vì người nhập giữ nhiều kỳ cùng lúc (spec dòng 635: "Đã nộp báo cáo
        // 08/2026") — "Đã nộp" trống không nói được vừa nộp kỳ nào.
        toast(`Đã ${chuDauThanhThuong(c.name_vi)} ${formatPeriod(dau.period_key)}`)
      } else {
        toast(`Đã ${chuDauThanhThuong(c.name_vi)}`)
      }
    } catch (loi) {
      setDangHoi(null)
      opts.onLoi?.(
        loi instanceof ApiError
          ? { detail: loi.detail, errors: loi.errors ?? null }
          : // Không phải `ApiError` = chưa từng có phản hồi nào (fetch ném TypeError): mất mạng.
            { detail: 'Mất kết nối, chưa gửi được. Thử lại khi có mạng.', errors: null },
      )
    } finally {
      setPending(false)
    }
  }

  return {
    dangHoi,
    dialogMo: dangHoi !== null,
    pending,
    hoi: setDangHoi,
    huy: () => setDangHoi(null),
    xacNhan,
  }
}
