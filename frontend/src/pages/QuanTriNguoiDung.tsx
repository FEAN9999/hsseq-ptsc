// frontend/src/pages/QuanTriNguoiDung.tsx
//
// `/admin/users` — "Người dùng" (Lát 8). CHỈ ĐỌC, và nói thẳng điều đó: mockup 09 vẽ nút "Mời tài
// khoản", nhưng mời người dùng kéo theo đặt mật khẩu và gửi thư — hai đường chưa tồn tại ở backend.
// Một nút chết trên màn phân quyền là chỗ tệ nhất để hứa suông.
//
// Bảng này TRẢ LỜI đúng một câu hỏi vận hành: "ai được làm gì, ở đơn vị nào". Nên cột Vai mang theo
// PHẠM VI của vai (`user_role.scope_org_unit_id`) chứ không chỉ tên vai — phạm vi mới là thứ quyết
// định người này đụng được báo cáo của ai, và nó có thể KHÁC đơn vị ghi trên tài khoản (xem
// docstring `CurrentUser` ở backend/app/api/deps.py).
import { useQuery } from '@tanstack/react-query'

import { api } from '../api/client'
import { O_BANG, O_TIEU_DE, TieuDeQuanTri, VungDuLieu } from '../features/admin/khung'

interface VaiCuaNguoi {
  code: string
  name: string
  /** `null` = không giới hạn phạm vi (toàn Tổng công ty). */
  scope: { code: string; name: string } | null
}

interface NguoiDung {
  id: number
  email: string
  full_name: string
  position: string | null
  active: boolean
  org_unit: { code: string; name: string } | null
  roles: VaiCuaNguoi[]
  permission_count: number
}

function HuyHieuVai({ vai }: { vai: VaiCuaNguoi }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
      {vai.name}
      {/* Phạm vi chỉ hiện khi CÓ. `null` nghĩa là "toàn Tổng công ty" với admin/viewer — in thêm
          chữ đó vào 2 trong 24 dòng là làm ồn cột này mà không thêm thông tin nào: cột Đơn vị ngay
          bên trái đã nói họ thuộc PTSC. */}
      {vai.scope && <span className="font-mono text-[11px] text-muted-foreground">{vai.scope.code}</span>}
    </span>
  )
}

export function QuanTriNguoiDung() {
  const ds = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<NguoiDung[]>('/users'),
  })

  const soVai = ds.data ? new Set(ds.data.flatMap((n) => n.roles.map((v) => v.code))).size : null
  const soKhoa = ds.data?.filter((n) => !n.active).length ?? 0

  return (
    <div>
      <TieuDeQuanTri
        tieuDe="Người dùng"
        phuDe={
          ds.data === undefined
            ? null
            : `${ds.data.length} tài khoản · ${soVai} vai` +
              (soKhoa > 0 ? ` · ${soKhoa} đã khoá` : '') +
              '. Danh sách chỉ để xem — cấp và thu hồi vai vẫn làm trực tiếp trên CSDL.'
        }
      />

      <VungDuLieu q={ds} soDong={10}>
        <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={O_TIEU_DE}>Tài khoản</th>
                <th className={O_TIEU_DE}>Đơn vị</th>
                <th className={O_TIEU_DE}>Vai</th>
                <th className={`${O_TIEU_DE} text-right`}>Quyền</th>
              </tr>
            </thead>
            <tbody>
              {(ds.data ?? []).map((n) => (
                <tr key={n.id} className="transition-colors duration-[120ms] hover:bg-muted/50">
                  <td className={`${O_BANG} py-2`}>
                    {/* KHÔNG có avatar viết tắt (mockup 09 vẽ một cái). Quy ước viết tắt của app là
                        hai chữ đầu của email — đúng cho ô tài khoản ở chân sidebar, nơi chỉ có MỘT
                        người. Ở đây nó gộp `u01@`…`u09@` thành cùng một chữ "U0" trên chín dòng
                        khác nhau: một ký hiệu nhận dạng mà không nhận dạng được ai là nhiễu đội lốt
                        thông tin. Tên + email đã đủ phân biệt. Dựng lại được khi tài khoản mang tên
                        người thật, bằng một quy ước viết tắt khác. */}
                    <span className="flex items-center gap-2.5">
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-medium">{n.full_name}</span>
                        <span className="truncate text-xs text-muted-foreground">{n.email}</span>
                      </span>
                      {/* Tài khoản bị khoá vẫn nằm trong danh sách — ẩn nó đi là giấu mất lý do
                          một người "đăng nhập không được". Backend từ chối token của họ ngay
                          (deps.current_user), nên đây là một sự thật cần thấy, không phải rác. */}
                      {!n.active && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          Đã khoá
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={O_BANG}>
                    {n.org_unit ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-sec">{n.org_unit.code}</span>
                        <span className="text-secondary-foreground">{n.org_unit.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={O_BANG}>
                    {n.roles.length === 0 ? (
                      // Không vai = không quyền nào. Người này đăng nhập được nhưng mọi trang đều
                      // 403 — một cấu hình có thật và khó đoán từ phía người dùng, nên gọi tên nó.
                      <span className="text-muted-foreground">Chưa gán vai</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1">
                        {n.roles.map((v) => (
                          <HuyHieuVai key={v.code} vai={v} />
                        ))}
                      </span>
                    )}
                  </td>
                  <td className={`${O_BANG} text-right tabular-nums text-sec`}>
                    {n.permission_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </VungDuLieu>
    </div>
  )
}
