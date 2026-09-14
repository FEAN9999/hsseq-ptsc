// frontend/src/pages/Status.tsx
//
// Trang /status — "Tình trạng nộp", trang CUỐI CÙNG của ứng dụng (task-26-brief.md). Lưới đơn vị ×
// kỳ (Task 13, GET /status) + nút sao chép danh sách chưa nộp. AppShell/Sidebar KHÔNG render ở đây
// — bọc ở tầng route (app/routes.tsx), giống mọi trang sau RequireAuth khác.
//
// HAI lượt gọi NỐI TIẾP (khuôn ReportDetail.tsx — hai query phụ thuộc nhau trong CHÍNH trang, không
// phải khuôn SONG SONG useSummary.ts/useUnits.ts của Dashboard.tsx, vì ở đây query thứ hai cần kết
// quả của query thứ nhất mới gọi được, đúng hình dạng baoCao→mau của ReportDetail):
// GET /status cần BA tham số bắt buộc `template`/`from`/`to`, không giá trị mặc định (carry C6) —
// `from`/`to` không được khoá cứng (carry C7, brief: "phụ thuộc DỮ LIỆU"), phải suy từ
// GET /templates/FM01/periods (đã sắp theo start_date): kỳ đầu = phần tử đầu; "kỳ đang mở" = phần
// tử CUỐI CÙNG có is_open=true — KHÔNG phải phần tử ĐẦU TIÊN có is_open=true, vì seed hiện có HAI
// kỳ cùng is_open=true (08 và 09/2026) và "kỳ đang mở" theo brief phải là kỳ MỚI NHẤT (09/2026),
// không phải kỳ open sớm nhất.
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api, ApiError } from '../api/client'
import { Chip } from '../components/ui/Chip'
import { InlineError } from '../components/ui/InlineError'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusGrid, type StatusUnit } from '../features/status/StatusGrid'
import { useCopyMissing } from '../features/status/useCopyMissing'
import { formatPeriod } from '../lib/format'

// carry C9: `template=FM01` khoá cứng CÓ CHỦ Ý ở FE, theo đúng tiền lệ useReportList.ts (Task 20)
// — gỡ khoá cứng là thay đổi TOÀN CỤC, ngoài phạm vi Task 26.
const TEMPLATE = 'FM01'

interface PeriodInfo {
  period_key: string
  is_open: boolean
}

interface StatusOut {
  periods: string[]
  units: StatusUnit[]
}

// "Kỳ đang mở" = phần tử CUỐI CÙNG (không phải đầu tiên) có is_open=true — xem bình luận đầu file.
function kyDangMo(periods: PeriodInfo[]): string | undefined {
  return periods.filter((p) => p.is_open).at(-1)?.period_key
}

function TieuDe({ children }: { children: React.ReactNode }) {
  return <h1 className="text-pageTitle font-medium text-ink">{children}</h1>
}

export function Status() {
  const ky = useQuery({
    queryKey: ['templates', TEMPLATE, 'periods'],
    queryFn: () => api.get<PeriodInfo[]>(`/templates/${TEMPLATE}/periods`),
  })

  const tu = ky.data?.[0]?.period_key
  const den = ky.data ? kyDangMo(ky.data) : undefined

  // task-26-fix-1.md Q1 [CHẶN] (carry C13 mục 2 — lớp lỗi "lỗi nền phá màn đang có dữ liệu", lần
  // thứ TƯ, qua cửa `queryKey` chứ không qua `error`): `tu`/`den` suy từ `ky.data`, nên khi
  // `/templates/FM01/periods` làm mới Ở NỀN và danh sách kỳ đổi (quản trị mở kỳ mới), `den` đổi ->
  // `queryKey` của CHÍNH query này đổi -> không có `placeholderData` thì đó là một query MỚI với
  // cache rỗng, `data` về `undefined`, nhánh skeleton nuốt mất lưới đang hiển thị. `keepPreviousData`
  // (TanStack v5, cùng công cụ Dashboard.tsx/useUnits.ts dùng cho đường đổi kỳ) giữ dữ liệu CỦA
  // queryKey CŨ hiển thị tiếp trong lúc queryKey MỚI đang tải — không ảnh hưởng lần tải ĐẦU (chưa
  // có gì để giữ) hay nhánh lỗi/403 (đó là hai đường khác, không liên quan `data`).
  const tk = useQuery({
    queryKey: ['status', TEMPLATE, tu, den],
    queryFn: () => api.get<StatusOut>(`/status?template=${TEMPLATE}&from=${tu}&to=${den}`),
    enabled: tu !== undefined && den !== undefined,
    placeholderData: keepPreviousData,
  })

  const saoChep = useCopyMissing()

  // Vòng lỗi 403 (thiếu status.view — reporter gõ thẳng URL vẫn tới được route, khuôn
  // Dashboard.tsx/ReportDetail.tsx): thay CẢ TRANG, đây là kết luận chứ không phải trục trặc tạm.
  const loi = ky.error ?? tk.error
  if (loi instanceof ApiError && loi.status === 403) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <div className="mt-4 border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">
          Bạn không có quyền xem tình trạng nộp này
          <div className="mt-2.5">
            <Link to="/reports" className="text-soot font-medium">
              Về báo cáo của đơn vị
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Lỗi NỀN không được phá màn đang có dữ liệu (C13 mục 2, khuôn ReportDetail.tsx/Dashboard.tsx):
  // `&& chưa có dữ liệu` bắt buộc — refetchOnWindowFocus bật toàn cục, một lượt làm mới nền hỏng
  // khi `data` cũ còn nguyên trong cache KHÔNG được xoá màn hình đang đúng.
  if (loi && (ky.data === undefined || tk.data === undefined)) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <InlineError
          message="Không tải được dữ liệu"
          onRetry={() => {
            ky.refetch()
            tk.refetch()
          }}
        />
      </div>
    )
  }

  // task-26-fix-1.md Q2: `is_open` là cột boolean quản trị đặt tay (templates.py:113), "không kỳ
  // nào đang mở" là trạng thái CSDL BÌNH THƯỜNG (giữa hai kỳ, hoặc mẫu vừa seed chưa mở kỳ nào) —
  // không phải tình huống không thể xảy ra. Không có nhánh này thì `den === undefined` mãi mãi giữ
  // `enabled` của `tk` ở `false`, `/status` không bao giờ được gọi, và nhánh skeleton bên dưới quay
  // VĨNH VIỄN không một chữ giải thích. Đặt TRƯỚC nhánh skeleton — khác nhánh đó (chờ MỘT LẦN rồi
  // xong), tình huống này sẽ KHÔNG BAO GIỜ tự hết bằng cách chờ.
  if (ky.data !== undefined && den === undefined) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <p className="mt-4 text-table text-sec">Chưa có kỳ nào đang mở để hiển thị tình trạng nộp</p>
      </div>
    )
  }

  if (ky.data === undefined || tk.data === undefined) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <div data-testid="skeleton" className="mt-4">
          <Skeleton rows={10} />
        </div>
      </div>
    )
  }

  const data = tk.data
  const kyCuoi = data.periods.at(-1) ?? ''
  // task-26-fix-1.md Q4: `report_id === null`, KHÔNG `state === null` — cùng nguồn chân lý
  // StatusGrid.tsx đã dùng (carry C8: report_id, không phải state, quyết định "ô bấm được"/"có báo
  // cáo"). Hai vị từ trùng nhau ở dữ liệu hiện có (cùng ra từ một hàng Report outer-join) nhưng lệch
  // nhau là CÓ THỂ — dùng khác vị từ ở hai chỗ cùng một khái niệm trên cùng một trang sẽ để lưới và
  // nút Sao chép bất đồng về đúng CÙNG một ô.
  const donViChuaNop = data.units.filter(
    (u) => u.cells.find((c) => c.period_key === kyCuoi)?.report_id === null,
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        {donViChuaNop.length > 0 && (
          <button
            type="button"
            onClick={() => saoChep(donViChuaNop.map((u) => u.name))}
            className="inline-flex items-center justify-center h-8 px-3.5 rounded-input border border-hair bg-surface text-table font-medium text-ink transition-colors duration-[120ms] hover:bg-mutedbg"
          >
            Sao chép danh sách chưa nộp ({formatPeriod(kyCuoi)})
          </button>
        )}
      </div>
      <p className="text-sec text-table mb-5">
        Từ {formatPeriod(data.periods[0])} (kỳ đầu có dữ liệu) đến {formatPeriod(kyCuoi)} (kỳ đang mở)
      </p>
      {/* task-26-fix-1.md Q5 (Phần D2 báo cáo soát): CHỈ khôi phục nửa ĐẦU dòng "Chú giải" mockup —
          nửa sau (liệt màu từng trạng thái) dư thừa thật vì mỗi chip đã tự mang chữ của nó, bỏ đúng.
          Nửa đầu là CHÌA KHOÁ DUY NHẤT trên toàn màn cho ký hiệu viền rỗng/đặc — không có dòng này,
          người xem thấy hai chip cùng đọc "Đã duyệt", một rỗng một đặc, không một chữ nào giải
          thích vì sao (nặng hơn: Chip.tsx KIND_BG.missing cũng bg-transparent, nên có tới HAI loại
          chip nền trong suốt trên màn, chỉ khác màu viền). Dùng <Chip> THẬT (không phải hình vẽ) để
          mẫu ví dụ tự động khớp đúng hành vi outline thật của StatusGrid.tsx, không lệch nếu Chip.tsx
          đổi cách vẽ outline sau này. */}
      <p className="flex items-center gap-1.5 text-sec text-table mb-5">
        <Chip kind="approved" outline /> = nạp từ file tổng hợp · <Chip kind="approved" /> = nộp trên
        hệ thống
      </p>
      <StatusGrid periods={data.periods} units={data.units} />
    </div>
  )
}
