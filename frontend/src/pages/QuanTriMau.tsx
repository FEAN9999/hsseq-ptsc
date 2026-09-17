// frontend/src/pages/QuanTriMau.tsx
//
// `/admin/templates` — "Mẫu báo cáo" (Lát 8). Màn quản trị DUY NHẤT có thao tác ghi: mở/đóng kỳ
// (`PATCH /templates/FM01/periods/{key}`). Mọi thứ còn lại chỉ đọc.
//
// Ba thứ mockup 08 vẽ mà màn này KHÔNG dựng, và lý do (không phải bỏ quên):
//   · "Tạo mẫu mới" / "Khai danh mục chỉ tiêu" / thẻ FM02 nháp — backend không có endpoint nào tạo
//     hay sửa mẫu, và seed chỉ có FM01. Một nút chết trên màn quản trị là lời hứa sai ở đúng chỗ
//     người dùng tin nhất.
//   · Bốn ô đếm "53 chỉ tiêu · 11 nhóm · …" — số đó nằm trong `GET /templates/FM01`, một thân JSON
//     kéo cả 53 chỉ tiêu + 53 dòng transitions về chỉ để in bốn con số. Việc của màn này là KỲ;
//     đổi bốn con số lấy một lượt tải nặng thứ tư trên cùng một trang là không đáng.
//
// Câu "đóng kỳ nghĩa là gì" phải NÓI ĐÚNG — đã đối chiếu tại nguồn, `is_open` chặn đúng hai cửa:
//   1. `POST /reports` → 409 "Kỳ báo cáo đã đóng" (backend/app/api/reports.py:89);
//   2. ô TRỐNG của kỳ đó biến khỏi `GET /reports` (backend/app/services/reports.py:353).
// Nó KHÔNG chặn nộp/duyệt một báo cáo ĐÃ tạo — `apply_transition` không đọc `is_open` bao giờ.
// Viết "đơn vị không nộp được nữa" (câu trong mockup) là một khẳng định SAI trên màn quản trị.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CircleCheck, CircleSlash } from 'lucide-react'

import { api } from '../api/client'
import { invalidateReportQueries } from '../api/invalidate'
import { DialogXacNhan } from '../components/ui/DialogXacNhan'
import { useToast } from '../components/ui/Toast'
import { O_BANG, O_TIEU_DE, TieuDeQuanTri, VungDuLieu } from '../features/admin/khung'
import { useSession } from '../app/session'
import { formatDateTime, formatPeriod } from '../lib/format'

// Khoá cứng CÓ CHỦ Ý, đúng tiền lệ `useReportList.ts` và `pages/Status.tsx`: chọn mẫu là một thay
// đổi TOÀN CỤC (mọi trang đang khoá FM01), không phải việc của riêng màn này.
const TEMPLATE = 'FM01'

interface MauTomTat {
  code: string
  name_vi: string
  name_en: string
  period_type: string
  active: boolean
}

interface Ky {
  period_key: string
  start_date: string
  end_date: string
  due_at: string
  is_open: boolean
}

interface OLuoi {
  period_key: string
  state: string | null
}

interface LuoiTrangThai {
  periods: string[]
  units: { code: string; cells: OLuoi[] }[]
}

/** "2026-09-01" → "01/09/2026". KHÔNG dùng `formatDateTime`: đây là một NGÀY LỊCH (cột `date` của
 *  Postgres), không mang giờ cũng không mang múi giờ — đẩy nó qua `new Date()` là tự thêm một múi
 *  giờ không có thật rồi có ngày lệch mất một ngày. */
function ngay(d: string): string {
  const [nam, thang, ngayTrongThang] = d.split('-')
  return `${ngayTrongThang}/${thang}/${nam}`
}

/** Số đơn vị ĐÃ NỘP ở một kỳ — `submitted` (đang chờ duyệt) hoặc `approved` (đã duyệt), cùng vị từ
 *  `pages/Reports.tsx:154` dùng. `draft`/`returned` KHÔNG tính: báo cáo tồn tại nhưng chưa ai nộp,
 *  mà đó chính là con số quản trị cần biết trước khi đóng kỳ. */
function soDaNop(luoi: LuoiTrangThai, ky: string): number {
  return luoi.units.filter((dv) => {
    const o = dv.cells.find((c) => c.period_key === ky)
    return o?.state === 'submitted' || o?.state === 'approved'
  }).length
}

// MỘT kiểu nút cho cả hai chiều, CỐ Ý. Bản đầu tô "Mở kỳ" bằng nền primary — chụp màn ra thì hai
// nút đậm nhất trang lại nằm ở 06/2026 và 07/2026, hai kỳ lịch sử đã đóng mà không ai cần mở lại.
// Màu nhấn là thứ chỉ dùng cho việc NÊN LÀM (luật Lát 6), mà màn này không có việc nào như thế:
// mở hay đóng kỳ đều là quyết định của người quản trị, không phải gợi ý của giao diện. Sức nặng
// của thao tác đóng kỳ nằm ở hộp thoại xác nhận, không nằm ở màu nút.
const NUT =
  'inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors duration-[120ms] hover:bg-muted disabled:opacity-50'

export function QuanTriMau() {
  const quyen = useSession((s) => s.permissions)
  const qc = useQueryClient()
  const toast = useToast()
  const [dangHoiDong, setDangHoiDong] = useState<Ky | null>(null)

  const mau = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<MauTomTat[]>('/templates'),
  })

  // CÙNG `queryKey` với `pages/Status.tsx` và `pages/Dashboard.tsx` — ba trang đọc chung một bản
  // cache, nên đóng một kỳ ở đây là bộ chọn kỳ và lưới tình trạng cũng thấy ngay.
  const ky = useQuery({
    queryKey: ['templates', TEMPLATE, 'periods'],
    queryFn: () => api.get<Ky[]>(`/templates/${TEMPLATE}/periods`),
  })

  const tu = ky.data?.[0]?.period_key
  const den = ky.data?.at(-1)?.period_key
  // Cột "Đã nộp" là số liệu BÁO CÁO, nằm sau `status.view` — quyền KHÁC với `template.manage` đang
  // gác trang này. Vai admin_atcl thật có cả hai, nhưng một vai chỉ-quản-trị-mẫu là cấu hình hợp lệ,
  // và với vai đó thì đây phải là một cột "—" chứ không phải một lượt 403 làm hỏng cả trang.
  const coTinhTrang = quyen.has('status.view')
  const luoi = useQuery({
    queryKey: ['status', TEMPLATE, tu, den],
    queryFn: () => api.get<LuoiTrangThai>(`/status?template=${TEMPLATE}&from=${tu}&to=${den}`),
    enabled: coTinhTrang && tu !== undefined && den !== undefined,
  })
  const tongDauMoi = luoi.data?.units.length ?? null

  const doiKy = useMutation({
    mutationFn: (v: { period_key: string; is_open: boolean }) =>
      api.patch<Ky>(`/templates/${TEMPLATE}/periods/${v.period_key}`, { is_open: v.is_open }),
    onSuccess: (moi) => {
      setDangHoiDong(null)
      // Đóng/mở kỳ đổi luôn thứ 22 đơn vị NHÌN THẤY: `GET /reports` bỏ ô trống của kỳ đã đóng,
      // Dashboard/Status đọc chung danh sách kỳ. Dọn cả bốn nhóm khoá thay vì chỉ nhóm của trang
      // này — cùng lý do `invalidateReportQueries` ra đời.
      qc.invalidateQueries({ queryKey: ['templates'] })
      invalidateReportQueries(qc)
      toast(`Đã ${moi.is_open ? 'mở' : 'đóng'} kỳ ${formatPeriod(moi.period_key)}`)
    },
    onError: (loi: Error) => toast(loi.message),
  })

  const soKy = ky.data?.length ?? null
  const soMo = ky.data?.filter((k) => k.is_open).length ?? null

  return (
    <div>
      <TieuDeQuanTri
        tieuDe="Mẫu báo cáo"
        phuDe={
          soKy === null
            ? null
            : `${TEMPLATE} · ${soKy} kỳ, ${soMo} đang mở. Đóng kỳ chỉ chặn TẠO báo cáo mới cho kỳ đó` +
              ' — báo cáo đã tạo vẫn nộp và duyệt được.'
        }
      />

      <VungDuLieu q={mau} soDong={3}>
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {(mau.data ?? []).map((m) => (
            <div key={m.code} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {m.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name_vi}</span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    m.active ? 'text-success-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {m.active ? <CircleCheck className="size-3.5" /> : <CircleSlash className="size-3.5" />}
                  {m.active ? 'Đang dùng' : 'Ngừng dùng'}
                </span>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">{m.name_en}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-sec">
                <CalendarClock className="size-3.5" />
                {m.period_type === 'month' ? 'Kỳ theo tháng' : `Kỳ: ${m.period_type}`}
              </p>
            </div>
          ))}
        </div>
      </VungDuLieu>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-medium">Kỳ của {TEMPLATE}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {coTinhTrang
              ? 'Cột "Đã nộp" đếm đơn vị đã nộp hoặc đã duyệt — bản nháp chưa tính.'
              : 'Cần quyền xem tình trạng nộp mới thấy được số đơn vị đã nộp từng kỳ.'}
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <VungDuLieu q={ky} soDong={4}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={O_TIEU_DE}>Kỳ</th>
                  <th className={O_TIEU_DE}>Bắt đầu</th>
                  <th className={O_TIEU_DE}>Kết thúc</th>
                  <th className={O_TIEU_DE}>Hạn nộp</th>
                  <th className={O_TIEU_DE}>Đã nộp</th>
                  <th className={O_TIEU_DE}>Trạng thái</th>
                  <th className={`${O_TIEU_DE} text-right`}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {(ky.data ?? []).map((k) => (
                  <tr key={k.period_key} className="transition-colors duration-[120ms] hover:bg-muted/50">
                    <td className={`${O_BANG} font-medium tabular-nums`}>{formatPeriod(k.period_key)}</td>
                    <td className={`${O_BANG} tabular-nums text-sec`}>{ngay(k.start_date)}</td>
                    <td className={`${O_BANG} tabular-nums text-sec`}>{ngay(k.end_date)}</td>
                    <td className={`${O_BANG} tabular-nums text-sec`}>{formatDateTime(k.due_at)}</td>
                    <td className={`${O_BANG} tabular-nums`} data-testid={`da-nop-${k.period_key}`}>
                      {luoi.data && tongDauMoi
                        ? `${soDaNop(luoi.data, k.period_key)}/${tongDauMoi}`
                        : '—'}
                    </td>
                    <td className={O_BANG}>
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                          k.is_open
                            ? 'bg-success-bg text-success-foreground'
                            : 'bg-muted text-secondary-foreground'
                        }`}
                      >
                        {k.is_open ? 'Đang mở' : 'Đã đóng'}
                      </span>
                    </td>
                    <td className={`${O_BANG} text-right`}>
                      {/* Mở kỳ KHÔNG hỏi lại (chỉ thêm quyền cho đơn vị, không lấy đi gì); đóng kỳ
                          thì hỏi, vì nó chặn lối vào của 22 đầu mối. Bất đối xứng là CÓ Ý. */}
                      <button
                        type="button"
                        disabled={doiKy.isPending}
                        onClick={() =>
                          k.is_open
                            ? setDangHoiDong(k)
                            : doiKy.mutate({ period_key: k.period_key, is_open: true })
                        }
                        className={NUT}
                      >
                        {k.is_open ? 'Đóng kỳ' : 'Mở kỳ'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </VungDuLieu>
        </div>
      </div>

      {dangHoiDong && (
        <DialogXacNhan
          title={`Đóng kỳ ${formatPeriod(dangHoiDong.period_key)}?`}
          body={
            'Đơn vị chưa tạo báo cáo cho kỳ này sẽ không tạo được nữa, và kỳ biến khỏi danh sách của' +
            ' họ. Báo cáo đã tạo vẫn nộp và duyệt được. Mở lại kỳ bất cứ lúc nào.'
          }
          confirmLabel="Đóng kỳ"
          pending={doiKy.isPending}
          onConfirm={() => doiKy.mutate({ period_key: dangHoiDong.period_key, is_open: false })}
          onCancel={() => setDangHoiDong(null)}
        />
      )}
    </div>
  )
}
