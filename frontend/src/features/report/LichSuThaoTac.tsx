// frontend/src/features/report/LichSuThaoTac.tsx
//
// Tab "Lịch sử thao tác" của mockup 04 — đọc `GET /reports/{id}/history`.
//
// Endpoint này dùng CÙNG phạm vi với trang xem báo cáo (backend/app/api/reports.py nói rõ: KHÔNG
// đòi `audit.view`), nên người nộp cũng xem được lịch sử báo cáo của chính mình. Vì vậy tab không
// gác quyền — gác thêm ở FE là tự bịa ra một luật backend không có.
//
// KHÔNG in tên người thao tác: audit chỉ trả `actor_id`, và đường tra tên (`GET /users`) thì gác
// sau `user.manage` — người nộp không gọi được. In "bởi #7" là một con số không ai tra được, in
// tên bịa thì tệ hơn. Cái audit trả lời chắc chắn là LÚC NÀO và VIỆC GÌ.
//
// Dòng `seed_import` có `before = null` và `after = {"note": ...}` — hình dạng KHÁC hẳn dòng
// chuyển trạng thái. Đọc thẳng `before.state` là nổ ở đúng dòng đầu tiên của 63/66 báo cáo demo,
// nên mọi phép đọc ở đây đều qua `?.`.
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { api } from '../../api/client'
import { Card, CardContent } from '../../components/ui/card'
import { InlineError } from '../../components/ui/InlineError'
import { SkeletonDong } from '../../components/ui/SkeletonDong'
import { formatDateTime } from '../../lib/format'
import type { ChuyenTrangThai } from './ReportForm'

interface DongLichSu {
  id: number
  action: string
  actor_id: number | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

/** Việc do loader fixture ghi, không phải một transition nào của workflow — nên không tra được
 *  trong `mau.transitions`. */
const TEN_RIENG: Record<string, string> = {
  seed_import: 'Nạp từ file tổng hợp',
}

function chu(o: Record<string, unknown> | null, khoa: string): string | null {
  const v = o?.[khoa]
  return typeof v === 'string' && v !== '' ? v : null
}

export function LichSuThaoTac({ id, chuyen }: { id: number; chuyen: ChuyenTrangThai[] }) {
  const ds = useQuery({
    queryKey: ['report', String(id), 'history'],
    queryFn: () => api.get<DongLichSu[]>(`/reports/${id}/history`),
  })

  // Tên tiếng Việt của việc lấy từ CHÍNH bảng transitions của mẫu — cùng nguồn với chữ trên nút ở
  // chân trang, nên "Trả lại" trên nút và "Trả lại" trong lịch sử không thể lệch nhau.
  const ten = (ma: string): string =>
    TEN_RIENG[ma] ?? chuyen.find((c) => c.action_code === ma)?.name_vi ?? ma

  if (ds.error && ds.data === undefined) {
    return <InlineError message="Không tải được lịch sử" onRetry={() => ds.refetch()} />
  }
  if (ds.isLoading) return <SkeletonDong rows={4} />
  if (ds.data !== undefined && ds.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-sm text-secondary-foreground">
          Báo cáo này chưa có thao tác nào được ghi lại.
        </CardContent>
      </Card>
    )
  }

  return (
    // Card không có `asChild` — nó luôn dựng ra <div>, nên KHÔNG thể tự làm <ol> (mất
    // role="list", ca `findByRole('list')` sẽ đỏ). Card bọc NGOÀI, <ol> giữ nguyên bên trong;
    // `py-0` bỏ đệm dọc mặc định của Card để các <li> (đã tự có border-b/px-4 py-3) sát mép trên
    // dưới, đúng hình chữ nhật liền khối của bản cũ thay vì lùi vào trong theo đệm Card.
    <Card className="py-0">
      <ol className="m-0 list-none p-0 [&>li:last-child]:border-b-0">
        {(ds.data ?? []).map((d) => {
          const ghiChu = chu(d.after, 'decision_note') ?? chu(d.after, 'note')
          const tuTrangThai = chu(d.before, 'state')
          const denTrangThai = chu(d.after, 'state')
          return (
            <li key={d.id} className="flex gap-3 border-b border-border px-4 py-3">
              <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-sm font-medium text-foreground">{ten(d.action)}</span>
                  {/* Chỉ in vệt trạng thái khi CÓ CẢ HAI đầu — dòng seed không có `before`, in
                      "→ approved" một mình thì không nói được nó đi từ đâu. */}
                  {tuTrangThai !== null && denTrangThai !== null && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {tuTrangThai} → {denTrangThai}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-xs tnum text-sec">
                    {formatDateTime(d.created_at)}
                  </span>
                </div>
                {ghiChu !== null && (
                  <p className="mt-1 mb-0 text-sm whitespace-pre-wrap text-secondary-foreground">{ghiChu}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
