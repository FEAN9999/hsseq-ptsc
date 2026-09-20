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
import { toast } from 'sonner'

import { api } from '../api/client'
import { invalidateReportQueries } from '../api/invalidate'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { DialogXacNhan } from '../components/ui/DialogXacNhan'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
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

export function QuanTriMau() {
  const quyen = useSession((s) => s.permissions)
  const qc = useQueryClient()
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
            <Card key={m.code}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {/* `outline` + `bg-muted` chứ không `secondary`: giữ lại đường viền hairline mà
                      bản tự vẽ đã có, và khớp với huy hiệu "Đầu mối" ở QuanTriToChuc.tsx vốn dựng
                      từ cùng một chuỗi `border border-border bg-muted`. Vẫn đúng MỘT utility mỗi
                      thuộc tính: `outline` không cấp `bg-*`, và `border-transparent` của lớp nền
                      Badge bị `border-border` của variant ghi đè, `cn` gỡ hẳn khỏi chuỗi. */}
                  <Badge variant="outline" className="rounded-md bg-muted font-mono">
                    {m.code}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name_vi}</span>
                  {/* Màu chữ cấp qua `className` chứ không thành variant mới trong `badge.tsx` —
                      `--success-foreground` là token THÊM của gói bàn giao, lần `shadcn add badge`
                      sau sẽ nuốt mất (cùng tiền lệ `features/report/NhacTruocDuyet.tsx` với Alert).
                      Icon không còn tự khai cỡ: Badge ép `[&>svg]:size-3!` nên một `size-3.5` viết
                      tay ở đây chỉ là chữ chết. */}
                  <Badge
                    variant="outline"
                    className={`rounded-md ${m.active ? 'text-success-foreground' : 'text-muted-foreground'}`}
                  >
                    {m.active ? <CircleCheck /> : <CircleSlash />}
                    {m.active ? 'Đang dùng' : 'Ngừng dùng'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="truncate text-xs text-muted-foreground">{m.name_en}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-sec">
                  <CalendarClock className="size-3.5" />
                  {m.period_type === 'month' ? 'Kỳ theo tháng' : `Kỳ: ${m.period_type}`}
                </p>
              </CardContent>
            </Card>
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
        {/* Vỏ này KHÔNG có viền/nền — nó nằm trong khối bọc ngay trên, nên `Card` là thừa. Chỉ
            `overflow-x-auto` bị bỏ (container của `Table` đã cuộn ngang, giữ cả hai là hai vùng
            cuộn lồng nhau); `min-w-0` giữ nguyên theo vỏ cũ. */}
        <div className="min-w-0">
          <VungDuLieu q={ky} soDong={4}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={O_TIEU_DE}>Kỳ</TableHead>
                  <TableHead className={O_TIEU_DE}>Bắt đầu</TableHead>
                  <TableHead className={O_TIEU_DE}>Kết thúc</TableHead>
                  <TableHead className={O_TIEU_DE}>Hạn nộp</TableHead>
                  <TableHead className={O_TIEU_DE}>Đã nộp</TableHead>
                  <TableHead className={O_TIEU_DE}>Trạng thái</TableHead>
                  <TableHead className={`${O_TIEU_DE} text-right`}>Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ky.data ?? []).map((k) => (
                  // Hiệu ứng rê chuột tự viết đã BỎ — `TableRow` mang sẵn
                  // `transition-colors hover:bg-muted/50`, đúng thứ dòng này vốn tự vẽ.
                  <TableRow key={k.period_key}>
                    <TableCell className={`${O_BANG} font-medium tabular-nums`}>
                      {formatPeriod(k.period_key)}
                    </TableCell>
                    <TableCell className={`${O_BANG} tabular-nums text-sec`}>{ngay(k.start_date)}</TableCell>
                    <TableCell className={`${O_BANG} tabular-nums text-sec`}>{ngay(k.end_date)}</TableCell>
                    <TableCell className={`${O_BANG} tabular-nums text-sec`}>
                      {formatDateTime(k.due_at)}
                    </TableCell>
                    <TableCell className={`${O_BANG} tabular-nums`} data-testid={`da-nop-${k.period_key}`}>
                      {luoi.data && tongDauMoi
                        ? `${soDaNop(luoi.data, k.period_key)}/${tongDauMoi}`
                        : '—'}
                    </TableCell>
                    <TableCell className={O_BANG}>
                      {/* `variant="secondary"` chứ không `outline`: hai màu nền dưới đây giữ NGUYÊN
                          và ô này vốn KHÔNG có viền — variant `outline` sẽ cấp `border-border` và
                          vẽ thêm một đường viền chưa từng có. `secondary` để nguyên
                          `border-transparent` của lớp nền Badge, còn `bg-secondary` của nó bị chính
                          `bg-*` dưới đây gỡ khỏi chuỗi (tailwind-merge), nên vẫn đúng MỘT utility
                          background-color. */}
                      <Badge
                        variant="secondary"
                        className={`rounded-md ${
                          k.is_open
                            ? 'bg-success-bg text-success-foreground'
                            : 'bg-muted text-secondary-foreground'
                        }`}
                      >
                        {k.is_open ? 'Đang mở' : 'Đã đóng'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`${O_BANG} text-right`}>
                      {/* MỘT kiểu nút cho cả hai chiều, CỐ Ý — bản đầu tô "Mở kỳ" bằng nền primary
                          khiến hai nút đậm nhất trang lại nằm ở hai kỳ lịch sử đã đóng mà không ai
                          cần mở lại. Màu nhấn chỉ dùng cho việc NÊN LÀM (luật Lát 6), mà mở/đóng kỳ
                          đều là quyết định của quản trị, không phải gợi ý của giao diện.
                          Mở kỳ KHÔNG hỏi lại (chỉ thêm quyền cho đơn vị, không lấy đi gì); đóng kỳ
                          thì hỏi, vì nó chặn lối vào của 22 đầu mối. Bất đối xứng đó là CÓ Ý. */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={doiKy.isPending}
                        onClick={() =>
                          k.is_open
                            ? setDangHoiDong(k)
                            : doiKy.mutate({ period_key: k.period_key, is_open: true })
                        }
                      >
                        {k.is_open ? 'Đóng kỳ' : 'Mở kỳ'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
