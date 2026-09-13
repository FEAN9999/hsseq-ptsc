// Trang 404 — route không khớp bất kỳ path nào.
export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="text-center max-w-sm">
        <div className="text-kpi font-medium text-sec">404</div>
        <h1 className="text-pageTitle font-medium text-ink mt-2">Không tìm thấy trang</h1>
        <p className="text-table text-sec mt-2">Đường dẫn này không tồn tại hoặc đã bị xoá.</p>
        <a
          href="/"
          className="inline-flex items-center justify-center h-8 px-3.5 mt-5 rounded-input bg-cyan border border-cyanEdge text-white text-table font-medium no-underline"
        >
          Về trang chủ
        </a>
      </div>
    </div>
  )
}
