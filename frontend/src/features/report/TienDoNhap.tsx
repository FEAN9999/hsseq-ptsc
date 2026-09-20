// frontend/src/features/report/TienDoNhap.tsx
//
// Thẻ "Tiến độ nhập" của mockup 04: một thanh tiến độ + dải chip theo nhóm, mỗi chip là một cú
// nhảy tới nhóm đó. Thay cho cột mục lục cũ bên phải bảng.
//
// Vì sao thay chứ không thêm: mục lục cũ trả lời đúng MỘT câu ("nhóm này ở đâu"), còn dải chip trả
// lời thêm câu mà người nhập hỏi nhiều hơn hẳn — "còn nhóm nào chưa xong". Giữ cả hai là hai hàng
// điều hướng nói cùng một chuyện, trong khi bảng 53 dòng đang tranh từng pixel chiều cao.
//
// Nhóm ĐÃ ĐỦ thì chìm xuống (viền nhạt, số xám); nhóm CÒN THIẾU nổi lên bằng màu cảnh báo. Không
// tô theo "nhóm đang xem" như bản vẽ gợi ý: cuộn tới đâu sáng tới đó cần một scroll-spy, mà thứ
// người nhập cần biết khi nhìn dải này là chỗ nào còn nợ, không phải chỗ mình vừa cuộn qua.
import { ListChecks } from 'lucide-react'

import { Card, CardContent } from '../../components/ui/card'
import { Progress } from '../../components/ui/progress'
import type { TienDo } from './tienDo'
import type { NhomMau } from './GroupHeader'

export function TienDoNhap({
  sections,
  tienDo,
}: {
  /** Đúng các nhóm ĐANG hiện trong tab Chỉ tiêu, theo thứ tự của mẫu. */
  sections: NhomMau[]
  tienDo: TienDo
}) {
  const demTheoNhom = new Map(tienDo.nhom.map((n) => [n.code, n]))
  // Mẫu số 0 (mẫu báo cáo chưa khai chỉ tiêu bắt buộc nào) thì KHÔNG in "0/0 ô" kèm một thanh
  // rỗng — một thanh tiến độ không đo được gì là thứ trang trí gây hiểu nhầm.
  const coGiDeDo = tienDo.tong > 0

  return (
    // MỘT hàng ngang: nhãn · Progress `flex-1` · số. Bản vẽ (README mục 6, "Rail tiến độ") vẽ đúng
    // như thế, và nó có lý do — một thanh tiến độ chỉ đọc được khi cái nhãn nói nó đo gì đứng NGAY
    // cạnh nó. Vì vậy KHÔNG dùng `CardHeader`: `CardHeader` luôn đứng thành một khối TRÊN
    // `CardContent`, tách nhãn khỏi thanh thành hai dòng. Thẻ này có đúng một khối nội dung.
    <Card className="mb-3">
      <CardContent>
        <div className="flex items-center gap-4">
          <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
            <ListChecks className="size-4" />
            Tiến độ nhập
          </span>
          {coGiDeDo && (
            <>
              <Progress
                value={(tienDo.daNhap / tienDo.tong) * 100}
                className="h-2 flex-1"
                aria-label={`Đã nhập ${tienDo.daNhap} trên ${tienDo.tong} ô bắt buộc`}
              />
              <span className="shrink-0 font-mono text-[13px] tnum text-sec">
                {tienDo.daNhap}/{tienDo.tong} ô bắt buộc
              </span>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {sections.map((nhom) => {
            const d = demTheoNhom.get(nhom.code)
            const thieu = d !== undefined && d.tong > 0 && d.daNhap < d.tong
            return (
              <a
                key={nhom.code}
                href={`#${nhom.code}`}
                title={nhom.name_en}
                className={`inline-flex h-7 items-center gap-2 rounded-lg border px-2.5 no-underline transition-colors duration-[120ms] hover:bg-muted ${
                  thieu ? 'border-warning bg-warning-bg' : 'border-border bg-card'
                }`}
              >
                <span className="font-mono text-[11px] text-sec">{nhom.code}</span>{' '}
                <span
                  className={`whitespace-nowrap text-[12.5px] ${
                    thieu ? 'font-semibold text-warning-foreground' : 'text-secondary-foreground'
                  }`}
                >
                  {nhom.name_vi}
                </span>
                {/* Nhóm không có ô bắt buộc nào (phần đầu) thì không in "0/0" — con số đó không nói
                    gì cả, chỉ làm dải chip đọc như đang thiếu dữ liệu. */}
                {d !== undefined && d.tong > 0 && (
                  <span
                    className={`font-mono text-[11px] tnum ${
                      thieu ? 'text-warning-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {d.daNhap}/{d.tong}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
