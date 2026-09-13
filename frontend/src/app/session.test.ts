// frontend/src/app/session.test.ts
//
// Giữ đúng phép ghép F5 (task-17-fix-brief.md): GET /auth/me trả `org_unit` NGANG HÀNG `user`,
// không lồng trong. Test này phải đỏ nếu ai đó lỡ nhét `org_unit` trở lại bên trong `user`.
import { beforeEach, describe, expect, it } from 'vitest'
import { useSession } from './session'

beforeEach(() => useSession.getState().logout())

const NGUOI_DUNG = { id: 1, email: 'u01@ptsc.local', full_name: 'Nguyễn Văn A', position: 'Trưởng phòng' }
const DON_VI = { id: 2, code: 'MC', name: 'PTSC M&C' }

describe('useSession', () => {
  it('login() giữ orgUnit là trường RIÊNG, KHÔNG lồng trong user', () => {
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, ['dashboard.view'])
    const s = useSession.getState()
    expect(s.token).toBe('tok')
    expect(s.user).toEqual(NGUOI_DUNG)
    expect(s.orgUnit).toEqual(DON_VI)
    // Đo đúng thứ brief cảnh báo: user KHÔNG được mang theo field org_unit ăn theo.
    expect((s.user as unknown as Record<string, unknown>).org_unit).toBeUndefined()
  })

  it('login() đổi permissions dạng mảng thành Set', () => {
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, ['report.edit', 'report.submit'])
    const p = useSession.getState().permissions
    expect(p).toBeInstanceOf(Set)
    expect(p.has('report.edit')).toBe(true)
    expect(p.has('report.submit')).toBe(true)
  })

  it('logout() xoá sạch token, user, orgUnit, permissions', () => {
    useSession.getState().login('tok', NGUOI_DUNG, DON_VI, ['dashboard.view'])
    useSession.getState().logout()
    const s = useSession.getState()
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
    expect(s.orgUnit).toBeNull()
    expect(s.permissions.size).toBe(0)
  })
})
