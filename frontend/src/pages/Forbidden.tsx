// Trang 403 — tài khoản đăng nhập nhưng không đủ quyền xem route hiện tại.
export function Forbidden() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="text-center max-w-sm">
        <div className="text-kpi font-medium text-sec">403</div>
        <h1 className="text-pageTitle font-medium text-ink mt-2">Không có quyền truy cập</h1>
        <p className="text-table text-sec mt-2">Tài khoản của bạn không có quyền xem trang này.</p>
        <a
          href="/"
          className="inline-flex items-center justify-center h-8 px-3.5 mt-5 rounded-input bg-cyan border border-cyanEdge text-white text-table font-medium no-underline transition-colors duration-[120ms] hover:bg-cyanEdge"
        >
          Về trang chủ
        </a>
      </div>
    </div>
  )
}
