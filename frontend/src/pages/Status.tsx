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
import { useRef } from 'react'
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
  // task-26-fix-6.md W1 [LỖI HÀNH VI] — RÚT RA THÀNH TÊN, không nhân đôi vị ngữ: điều kiện này giờ
  // có HAI nơi cần (`enabled` và `thuLai`), và hai bản sao của cùng một vị ngữ là cách cửa thứ tám
  // ra đời. Một tên, một nguồn chân lý.
  const tkBat = tu !== undefined && den !== undefined

  const tk = useQuery({
    queryKey: ['status', TEMPLATE, tu, den],
    queryFn: () => api.get<StatusOut>(`/status?template=${TEMPLATE}&from=${tu}&to=${den}`),
    enabled: tkBat,
    placeholderData: keepPreviousData,
  })

  const saoChep = useCopyMissing()

  // task-26-fix-4.md T1 [LỖI HÀNH VI] — cửa THỨ BẢY, và là lần thứ BA liên tiếp một cửa mới sinh ra
  // TỪ bản vá của cửa trước (vòng 1 vá `loading`, vòng 2 vá một nhánh trạng thái, vòng 3 vá bằng cờ
  // boolean `tkTungCoDuLieu`). Gốc rễ người soát vòng 3 đặt tên, và là thứ bản vá này chữa:
  //
  //   MỘT CỜ trả lời được "CÓ NÊN thay màn không" nhưng KHÔNG trả lời được "VẼ CÁI GÌ". Nên mọi
  //   nhánh còn hỏi `tk.data` vẫn là một cửa: vòng 3 dạy nhánh 2 ngừng tin `tk.data`, nhánh 4 vẫn
  //   hỏi đúng vị ngữ ấy, và toàn bộ khác biệt hành vi của vòng 3 chỉ là đẩy người dùng từ
  //   `InlineError` sang skeleton quay CÂM — mất luôn chữ giải thích lẫn nút Thử lại, một bước LÙI.
  //
  // Vá bằng GIÁ TRỊ, không bằng thêm một cờ/một nhánh nữa: giữ BẢN DỮ LIỆU TỐT CUỐI CÙNG rồi render
  // từ nó. Khi ấy "tôi đã có dữ liệu chưa?" được trả lời bằng việc THẬT SỰ CÓ dữ liệu, không bằng
  // một vị ngữ diễn giải — và cả bốn nhánh dưới đây được suy lại từ CHÍNH `data` đó, không nhánh nào
  // còn hỏi `tk.data` nữa. Vì sao `tk.data` nói dối: TanStack v5 chỉ áp `placeholderData`/
  // `keepPreviousData` khi query ở trạng thái `pending`; khi `den` đổi ở NỀN (Q1 vòng 1) rồi query
  // của queryKey MỚI lỗi TRƯỚC KHI kịp thành công một lần, trạng thái sang `error` và `tk.data` RƠI
  // VỀ `undefined` dù một khoảnh khắc trước `keepPreviousData` vừa hiện đúng lưới cũ.
  // `duLieuCuoi.current` CHỈ được gán, không bao giờ bị xoá trong một lần mount (rời trang rồi quay
  // lại là mount mới, ref reset — không "nhớ dai" qua lần mount khác).
  //
  // task-26-fix-6.md W1 [L-1b] — `periods.length > 0`: ref này là "bản TỐT cuối cùng", và một thân
  // rỗng hợp lệ (`200 {periods:[],units:[]}`) KHÔNG phải bản tốt. Nó `!== undefined` nên nếu không
  // chặn, ref nuốt luôn và **bản tốt không bao giờ quay lại** trong cả lần mount — mọi lỗi về sau
  // rơi về một bảng trống thay vì lưới thật. Thân rỗng vẫn hiển thị BÌNH THƯỜNG khi nó là câu trả
  // lời của CHÍNH queryKey đang xem (`data` ưu tiên `tk.data`); chỉ là nó không được nhận vai "bản
  // để rơi về". Một mẫu chưa có kỳ nào thì lần lỗi kế tiếp cho skeleton — đúng bằng lúc chưa có gì.
  const duLieuCuoi = useRef<StatusOut | undefined>(undefined)
  if (tk.data !== undefined && tk.data.periods.length > 0) duLieuCuoi.current = tk.data
  const data = tk.data ?? duLieuCuoi.current

  // Gọi lại CẢ HAI nguồn — dùng chung cho `InlineError` (chưa có dữ liệu) và băng dữ liệu-cũ (đã có
  // dữ liệu): hai màn hình khác nhau nhưng cùng một lối thoát cho người dùng.
  const thuLai = () => {
    ky.refetch()
    // task-26-fix-6.md W1 [CHẶN]: `refetch()` của TanStack v5 VẪN CHẠY dù `enabled:false` — nó là
    // lệnh mệnh lệnh, không hỏi lại `enabled`. Ở cảnh không-còn-kỳ-mở (U1 vòng 5 vừa làm băng và
    // nút này với tới được), `tu`/`den` là `undefined`, chuỗi mẫu dựng ra `…&from=undefined&to=
    // undefined` NGUYÊN VĂN; backend lọc kỳ bằng SO SÁNH CHUỖI nên `'2026-09' >= 'undefined'` là
    // FALSE ⇒ **200 với thân RỖNG** ⇒ lưới biến mất bằng ĐÚNG MỘT CÚ BẤM vào đường thoát duy nhất
    // màn hình đang mời. (Vòng này cũng siết `from`/`to` thành `pattern=YYYY-MM` ở
    // `backend/app/api/status.py` ⇒ 422; nhưng chặn ở đây là chặn ở NGUỒN: không có tham số thì
    // không có lượt gọi nào để mà đúng hay sai, và FE không được phụ thuộc vào việc BE vừa siết.)
    if (tkBat) tk.refetch()
  }

  // LUẬT (không đổi từ vòng 2):
  //   MỌI NHÁNH THAY CẢ MÀN HÌNH PHẢI HỎI "TÔI ĐÃ CÓ DỮ LIỆU CHƯA?" TRƯỚC — skeleton, câu trạng
  //   thái, InlineError, tất cả. CHỈ 403 được thay VÔ ĐIỀU KIỆN, vì nó là KẾT LUẬN (quyền không đủ
  //   không tự khỏi bằng tải lại), không phải trạng thái tạm.
  // (task-26-fix-5.md — sửa một chỗ bình luận nói dối về mã, có từ trước vòng 4 và vòng 4 chép lại:
  // câu trên từng ghi "CHỈ 403/404", nhưng mã KHÔNG có nhánh 404 riêng — 404 hôm nay đi đường
  // `InlineError` như mọi lỗi khác, tức nó KHÔNG được miễn. Cùng bệnh "chứng nhận bằng chữ" mà cả
  // Task 26 đang chữa, nên không để lại.)
  //
  // task-26-fix-4.md T3: vòng 2 chứng nhận SAI dòng 2 của bảng này bằng ĐỌC ĐIỀU KIỆN; vòng 3 viết
  // lại cả bảng theo lối dựng-cảnh, làm được ba dòng, rồi vẫn chứng nhận dòng 4 bằng suy luận trên
  // giấy ("skeleton mà ref===true là vô lý, hai điều kiện loại trừ nhau") — người soát ĐO ĐƯỢC CẢ
  // HAI CÙNG ĐÚNG. Nên từ vòng này mỗi dòng phải NÊU TÊN ca test có thật, và dòng nào không dựng nổi
  // cảnh thì phải viết ra là không dựng nổi, không được chứng nhận:
  //
  //   1. 403 — MIỄN hỏi dữ liệu, đúng luật (kết luận, không phải trục trặc tạm).
  //      Cảnh "đã có lưới rồi 403 tới ở NỀN" → PHẢI thay cả trang: ca `'S2: 403 tới Ở NỀN…'`.
  //      Cảnh lần tải đầu: ca `'403 (thiếu status.view) hiện đúng câu…'`.
  //   2. InlineError — hỏi `data === undefined` (không còn hỏi `tk.data`).
  //      Cảnh CHƯA có lưới → PHẢI hiện: ca `'CHỈ GET /status hỏng (periods lành)…'` và ca
  //      `'CHỈ /templates/FM01/periods hỏng…'` (một ca cho mỗi nguồn, carry C13 mục 1).
  //      Cảnh ĐÃ có lưới, lỗi nền CÙNG queryKey → KHÔNG được chạm: ca `'đang xem lưới, rời tab rồi
  //      quay lại gặp 502…'`. Cảnh ĐÃ có lưới, queryKey ĐỔI rồi query mới lỗi (cửa thứ bảy) → KHÔNG
  //      được chạm: ca `'S1/[H-1]…'` — đo ở trạng thái LẮNG, dưới đúng chính sách retry sản xuất.
  //   3. "Chưa có kỳ nào đang mở" — hỏi `data === undefined` VÀ `den === undefined`.
  //      Cảnh CHƯA có lưới, không kỳ nào mở → PHẢI hiện: ca `'không kỳ nào đang mở…(Q2/[B-2])'`.
  //      Cảnh ĐÃ có lưới, `/periods` đổi thành "không kỳ nào mở" ở NỀN → KHÔNG được chạm: ca
  //      `'R1/[H-1]…'` (it.each, HAI cảnh riêng).
  //      Vế `den === undefined` một mình cũng có ca riêng canh (trước vòng này bỏ nó đi vẫn 718/718
  //      xanh — [M-39]): ca `'T5/[M-39]: /periods về TRƯỚC, /status còn treo…'`.
  //   4. skeleton — hỏi `data === undefined`.
  //      Cảnh riêng của nó (lần tải ĐẦU) → PHẢI hiện: ca `'lần tải đầu tiên CÓ hiện skeleton…'` và
  //      ca `'T5/[M-39]…'` (chỉ `/periods` về, `/status` còn bay).
  //      Cảnh "ĐÃ có lưới rồi X ở nền" → KHÔNG được chạm: ĐO THẬT, không suy luận — ca `'S1/[H-1]…'`
  //      khẳng định `queryByTestId('skeleton') === null` ở trạng thái CUỐI (chính khẳng định này ĐỎ
  //      trên mã vòng 3), cộng ca `'Q1/[B-1]…'` và ca `'R3: đổi kỳ ở NỀN…'` pha 1. Lý do nhánh này
  //      nay thật sự không thể chạm tới sau khi đã có lưới — và lần trước lời tương tự là SAI: hồi
  //      đó nhánh hỏi `tk.data` (biến mất được), nay nó hỏi `data`, mà `duLieuCuoi.current` chỉ được
  //      GÁN, không bao giờ bị xoá trong một lần mount. Lời giải thích đó KHÔNG phải chứng nhận —
  //      ba ca vừa nêu mới là chứng nhận.
  //   (B5/[T7] — thân render chính từng `throw` khi BE trả `periods: []` cho mã 200: xem chỗ vá ở
  //   dòng phạm vi bên dưới.)
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
  // khi dữ liệu cũ còn nguyên KHÔNG được xoá màn hình đang đúng. task-26-fix-4.md T1: vị ngữ nay là
  // `data === undefined` — "thật sự không có gì để vẽ", không phải một cờ diễn giải.
  if (loi && data === undefined) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <InlineError message="Không tải được dữ liệu" onRetry={thuLai} />
      </div>
    )
  }

  // task-26-fix-1.md Q2 + task-26-fix-2.md R1: `is_open` là cột boolean quản trị đặt tay
  // (templates.py:113), "không kỳ nào đang mở" là trạng thái CSDL BÌNH THƯỜNG (giữa hai kỳ, hoặc
  // mẫu vừa seed chưa mở kỳ nào) — không phải tình huống không thể xảy ra. Nhưng nó KHÔNG chỉ xảy
  // ra lúc tải lần đầu: `/templates/FM01/periods` có thể làm mới Ở NỀN, trong lúc người dùng ĐANG
  // ĐỌC lưới (dữ liệu còn nguyên nhờ `keepPreviousData` của Q1), rồi trả về danh sách không còn
  // kỳ nào `is_open` (quản trị đóng hết kỳ trước khi mở kỳ mới — hai thao tác, không nguyên tử; hoặc
  // một lượt 200 thân rỗng). `data === undefined` bắt buộc: lưới đang đúng không được thay bằng
  // câu giải thích chỉ vì `/periods` vừa đổi — đúng luật chung nêu ở đầu cụm nhánh. Vẫn đặt TRƯỚC
  // nhánh skeleton (khác nhánh đó — chờ MỘT LẦN rồi xong — tình huống này KHÔNG tự hết bằng chờ).
  // Vế `den === undefined` cũng bắt buộc, và nó KHÔNG thừa: bỏ đi thì trong lúc `/periods` đã về mà
  // `/status` còn bay, màn hiện "Chưa có kỳ nào đang mở" trong khi kỳ đang mở hẳn hoi ([M-39]).
  if (data === undefined && ky.data !== undefined && den === undefined) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <p className="mt-4 text-table text-sec">Chưa có kỳ nào đang mở để hiển thị tình trạng nộp</p>
      </div>
    )
  }

  if (data === undefined) {
    return (
      <div>
        <TieuDe>Tình trạng nộp · {TEMPLATE}</TieuDe>
        <div data-testid="skeleton" className="mt-4">
          <Skeleton rows={10} />
        </div>
      </div>
    )
  }

  // Đang vẽ lưới từ BẢN CŨ (hoặc số mới vừa tải hỏng) — xem băng thông báo ngay dưới tiêu đề.
  // task-26-fix-5.md U1 [LỖI HÀNH VI]: vế thứ BA (`den === undefined`) là nhánh CÂM của chính luật
  // vòng 4 đặt ra ngay dưới đây. Khi `/periods` làm mới ở NỀN rồi trả về "không kỳ nào đang mở"
  // (quản trị đóng hết kỳ, hoặc một lượt 200 thân rỗng), `den` mất ⇒ `enabled:false` ⇒ `tk` ở
  // `pending` MÃI ⇒ `keepPreviousData` áp KHÔNG NGỪNG ⇒ `tk.data` vẫn CÓ, và không lượt gọi nào lỗi
  // ⇒ `loi === null`. Hai vế đầu cùng im, nên lưới cũ nằm đó câm VĨNH VIỄN trong một lần mount —
  // không lượt gọi nào còn chạy để tự khỏi. Ba cảnh đo được: đóng hết kỳ · `/periods` trả `[]` ·
  // `/periods` rỗng kèm `/status` lỗi. Ca `'U1 mặt DƯƠNG…'` khoá vế này.
  const duLieuCu = loi !== null || tk.data === undefined || den === undefined
  const kyDau = data.periods[0]
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
      {/* task-26-fix-4.md T1: giữ được lưới rồi mà IM LẶNG là một lỗi KHÁC — người dùng đọc số cũ
          tưởng là số mới. Lưới còn → phải nói ra là số liệu đang cũ, và phải có đường thử lại (đúng
          thứ bản vá vòng 3 lấy mất khi đổi InlineError thành skeleton câm). Băng này chỉ hiện khi
          bản đang vẽ KHÔNG phải bản vừa tải thành công: có lỗi ở một trong hai nguồn, hoặc đang
          phải rơi về `duLieuCuoi.current`. Trong lúc tải BÌNH THƯỜNG (keepPreviousData giữ lưới cũ,
          chưa lỗi gì) thì KHÔNG hiện — đó là chờ, không phải hỏng. */}
      {duLieuCu && (
        <div
          data-testid="bang-du-lieu-cu"
          className="flex items-center justify-between gap-4 mb-5 border border-hair bg-mutedbg rounded-tile px-4 py-2.5 text-table text-soot"
        >
          {/* task-26-fix-6.md [V-1b]: băng phải nói ĐÚNG chuyện đang xảy ra. Ở cảnh `den === undefined`
              không có gì hỏng cả — `/periods` vừa về 200 và nói rõ không còn kỳ nào đang mở. Đổ cho
              "không tải được" là dạy người dùng đi tìm sai chỗ (mạng? máy chủ?) trong khi thứ họ cần
              biết là kỳ đã đóng. `den === undefined` xét TRƯỚC vì nó là nguyên nhân CỤ THỂ hơn: ở
              cảnh đó `tk` đang tắt nên không lượt gọi `/status` nào đang hỏng để mà nói. */}
          <span>
            {den === undefined
              ? 'Không còn kỳ nào đang mở — đang hiện bản của lần tải gần nhất'
              : 'Không tải được số liệu mới — đang hiện bản của lần tải gần nhất'}
          </span>
          <button
            type="button"
            onClick={thuLai}
            className="inline-flex items-center justify-center h-[26px] px-2.5 rounded-input border border-hair bg-surface text-xs font-medium text-ink transition-colors duration-[120ms] hover:bg-mutedbg whitespace-nowrap"
          >
            Thử lại
          </button>
        </div>
      )}
      {/* task-26-fix-4.md T7 [C-1b, đo được ở CẢ vòng 2 lẫn vòng 3 mà hai lần đều xếp "không chặn"]:
          `/status` trả `{periods: [], units: []}` với mã 200 (BE trục trặc, hoặc mẫu chưa có kỳ nào)
          làm `data.periods[0]` là `undefined` -> `formatPeriod` gọi `.split` trên `undefined` ->
          TypeError, KHÔNG ErrorBoundary nào trong src/ đỡ -> TRẮNG MÀN, kiểu hỏng tệ nhất trong
          danh sách. Canh mảng rỗng trước khi lấy `[0]`: không có kỳ nào thì không có "phạm vi" để
          nói, ẩn hẳn dòng — không bịa ra chữ mới. */}
      {/* task-26-fix-5.md U1, vế thứ hai — QUYẾT ĐỊNH + LÝ DO: ở nhánh câm trên, màn hình không chỉ
          im lặng, nó còn PHÁT BIỂU SAI ("đến 09/2026 (kỳ đang mở)" khi 09/2026 vừa bị đóng).
          Băng thông báo một mình CHƯA đủ: băng nói "bản của lần tải gần nhất" — đúng cho phần LƯỚI,
          nhưng `ky.data` là dữ liệu TƯƠI (lượt `/periods` vừa về 200), nên nhãn "(kỳ đang mở)" là
          một khẳng định mà trang VỪA BIẾT là sai, không phải một mẩu của bản cũ. Nhãn đó chỉ đúng
          khi kỳ cuối của BẢN ĐANG VẼ đúng bằng kỳ đang mở hiện giờ — dùng thẳng phép so đó, nên nó
          cũng tự đúng ở cảnh cửa-thứ-bảy (bản cũ kết ở 09/2026 trong khi kỳ mở đã là 10/2026).
          Đây là một bước đi XA HƠN bản vá một-vế người soát đã đo; ghi ra để người phán xử đảo
          ngược được nếu thấy băng là đủ. */}
      {kyDau !== undefined && (
        <p className="text-sec text-table mb-5">
          Từ {formatPeriod(kyDau)} (kỳ đầu có dữ liệu) đến {formatPeriod(kyCuoi)}{' '}
          {kyCuoi === den ? '(kỳ đang mở)' : '(kỳ cuối có dữ liệu)'}
        </p>
      )}
      {/* task-26-fix-1.md Q5 (Phần D2 báo cáo soát): CHỈ khôi phục nửa ĐẦU dòng "Chú giải" mockup —
          nửa sau (liệt màu từng trạng thái) dư thừa thật vì mỗi chip đã tự mang chữ của nó, bỏ đúng.
          Nửa đầu là CHÌA KHOÁ DUY NHẤT trên toàn màn cho ký hiệu viền rỗng/đặc — không có dòng này,
          người xem thấy hai chip cùng đọc "Đã duyệt", một rỗng một đặc, không một chữ nào giải
          thích vì sao (nặng hơn: Chip.tsx KIND_BG.missing cũng bg-transparent, nên có tới HAI loại
          chip nền trong suốt trên màn, chỉ khác màu viền). Dùng <Chip> THẬT (không phải hình vẽ) để
          mẫu ví dụ tự động khớp đúng hành vi outline thật của StatusGrid.tsx, không lệch nếu Chip.tsx
          đổi cách vẽ outline sau này. */}
      {/* task-26-fix-2.md R2: testid CHỈ để ca test khoanh đúng phạm vi (`within`) hai chip chú
          giải — tách khỏi chip cùng chữ "Đã duyệt" trong lưới — không phải hành vi/hiển thị. */}
      <p data-testid="chu-giai" className="flex items-center gap-1.5 text-sec text-table mb-5">
        <Chip kind="approved" outline /> viền rỗng = nạp từ file tổng hợp ·{' '}
        <Chip kind="approved" /> đặc = nộp trên hệ thống
      </p>
      <StatusGrid periods={data.periods} units={data.units} />
    </div>
  )
}
