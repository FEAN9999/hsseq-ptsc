// frontend/src/pages/QuanTriToChuc.tsx
//
// `/admin/org` — "Tổ chức" (Lát 8). CHỈ ĐỌC: `GET /org-units` là endpoint duy nhất backend có cho
// sơ đồ tổ chức, không có đường nào thêm/sửa/xoá đơn vị. Mockup 09 vẽ nút "Thêm đơn vị" — không
// dựng, vì bấm vào không có gì xảy ra.
//
// `GET /org-units` trả CÂY theo `parent_id`. Seed hiện KHÔNG gán `parent_id` cho đơn vị nào
// (backend/app/api/org.py nói thẳng điều đó), nên hôm nay cây ra PHẲNG — 35 nút gốc. Trang này vẫn
// dựng đệ quy theo `children` chứ không giả định phẳng: hình dạng phẳng là DỮ LIỆU hiện tại, không
// phải hợp đồng. Và khi nó phẳng thì màn hình nói ra, thay vì để người quản trị tự hỏi vì sao sơ đồ
// tổ chức trông như một danh sách.
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Building2, Check, Factory, HardHat } from 'lucide-react'

import { api } from '../api/client'
import { Badge } from '../components/ui/badge'
import { TieuDeQuanTri, VungDuLieu } from '../features/admin/khung'

interface NutToChuc {
  id: number
  code: string
  name: string
  type: string
  is_reporting: boolean
  children: NutToChuc[]
}

// Bốn loại đơn vị của seed (backend/app/seed/__init__.py: ORG_UNITS). Loại LẠ vẫn hiện được —
// rơi về chính chuỗi mã, không nuốt mất một dòng chỉ vì bảng này chưa biết tên tiếng Việt của nó.
const TEN_LOAI: Record<string, string> = {
  corp: 'Tổng công ty',
  dept: 'Ban',
  member_unit: 'Đơn vị thành viên',
  project_board: 'Ban dự án',
}
const ICON_LOAI: Record<string, typeof Building2> = {
  corp: Building2,
  dept: Briefcase,
  member_unit: Factory,
  project_board: HardHat,
}

function demNut(ds: NutToChuc[]): { tong: number; dauMoi: number; coCay: boolean } {
  let tong = 0
  let dauMoi = 0
  let coCay = false
  const di = (nut: NutToChuc) => {
    tong += 1
    if (nut.is_reporting) dauMoi += 1
    if (nut.children.length > 0) coCay = true
    nut.children.forEach(di)
  }
  ds.forEach(di)
  return { tong, dauMoi, coCay }
}

function Nut({ nut, cap }: { nut: NutToChuc; cap: number }) {
  const Icon = ICON_LOAI[nut.type] ?? Building2
  return (
    <>
      <div
        className="flex items-center gap-2.5 border-b border-border px-3 py-2 text-sm transition-colors duration-[120ms] hover:bg-muted/50"
        // Thụt lề theo CẤP, tính bằng style vì số cấp không giới hạn — một bảng lớp Tailwind
        // `pl-3/pl-8/pl-13…` sẽ cạn ngay khi cây sâu hơn số lớp đã khai.
        style={{ paddingLeft: `${12 + cap * 20}px` }}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="w-16 shrink-0 font-mono text-xs text-sec">{nut.code}</span>
        <span className="min-w-0 flex-1 truncate">{nut.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{TEN_LOAI[nut.type] ?? nut.type}</span>
        {/* Chỉ hiện khi CÓ cờ: một hàng chip "không" cạnh mỗi đơn vị không báo cáo chỉ làm 13 dòng
            còn lại ồn hơn mà không nói thêm gì.

            Nền TRUNG TÍNH, không phải `bg-success-bg`: "là đầu mối báo cáo" là một THUỘC TÍNH của
            đơn vị, không phải một kết quả tốt. Bản đầu tô xanh và 22 trên 35 dòng cùng sáng lên —
            màu thành công lặp 22 lần vừa nói sai nghĩa vừa át mất chính thứ nó định làm nổi. */}
        {nut.is_reporting && (
          <Badge variant="outline" className="rounded-md text-sec">
            <Check />
            Đầu mối
          </Badge>
        )}
      </div>
      {nut.children.map((con) => (
        <Nut key={con.id} nut={con} cap={cap + 1} />
      ))}
    </>
  )
}

export function QuanTriToChuc() {
  const cay = useQuery({
    queryKey: ['org-units'],
    queryFn: () => api.get<NutToChuc[]>('/org-units'),
  })

  const dem = cay.data ? demNut(cay.data) : null

  return (
    <div>
      <TieuDeQuanTri
        tieuDe="Tổ chức"
        phuDe={dem === null ? null : `${dem.tong} đơn vị · ${dem.dauMoi} đầu mối báo cáo`}
      />

      <VungDuLieu q={cay} soDong={10}>
        {dem !== null && !dem.coCay && (
          <p className="mb-3 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-secondary-foreground">
            Chưa đơn vị nào được gán đơn vị cha, nên sơ đồ đang phẳng — {dem.tong} đơn vị cùng một
            cấp.
          </p>
        )}
        <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
          {/* `[&>*:last-child]:border-b-0` — dòng cuối không cần gạch dưới vì đã có viền khung.
              Đặt ở khung thay vì tính "tôi có phải dòng cuối không" trong `Nut`: với một cây đệ
              quy, "dòng cuối" là dòng cuối của CẢ cây, không phải phần tử cuối của một mảng con. */}
          <div className="[&>*:last-child]:border-b-0">
            {(cay.data ?? []).map((nut) => (
              <Nut key={nut.id} nut={nut} cap={0} />
            ))}
          </div>
        </div>
      </VungDuLieu>
    </div>
  )
}
