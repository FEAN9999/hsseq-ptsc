// Lỗi tại chỗ, không màn trắng (D12): thông điệp + nút "Thử lại" ngay trong khung nội dung.
export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-hair bg-surface rounded-tile p-8 text-center text-soot text-table">
      {message}
      <div className="mt-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center h-[26px] px-2.5 rounded-input border border-hair bg-surface text-xs font-medium text-ink transition-colors duration-[120ms] hover:bg-mutedbg"
        >
          Thử lại
        </button>
      </div>
    </div>
  )
}
