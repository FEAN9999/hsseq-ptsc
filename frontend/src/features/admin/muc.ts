// frontend/src/features/admin/muc.ts
//
// MỘT nguồn duy nhất cho ba mục nhóm "Quản trị nền tảng": quyền nào mở mục nào, mục nào dẫn đi đâu,
// và mục đó TÊN GÌ. Hai nơi đọc nó — `components/Sidebar.tsx` (dựng mục nav) và
// `components/AppShell.tsx` (vệt breadcrumb) — đúng cùng lý do `features/reports/nhanTrang.ts` ra
// đời ở Lát 6: hai chỗ viết tên trang một cách độc lập là hai chỗ có thể nói hai tên khác nhau, và
// người dùng là người phát hiện ra.
//
// Ba QUYỀN ĐỘC LẬP, không gộp thành một cờ "là quản trị": seed có `template.manage`, `org.manage`,
// `user.manage` riêng biệt, nên một vai chỉ giữ `user.manage` là cấu hình hợp lệ và phải chỉ thấy
// đúng một mục.
import { LayoutTemplate, Network, Users, type LucideIcon } from 'lucide-react'

export const MUC_QUAN_TRI: readonly { quyen: string; to: string; nhan: string; Icon: LucideIcon }[] = [
  { quyen: 'template.manage', to: '/admin/templates', nhan: 'Mẫu báo cáo', Icon: LayoutTemplate },
  { quyen: 'org.manage', to: '/admin/org', nhan: 'Tổ chức', Icon: Network },
  { quyen: 'user.manage', to: '/admin/users', nhan: 'Người dùng', Icon: Users },
]
