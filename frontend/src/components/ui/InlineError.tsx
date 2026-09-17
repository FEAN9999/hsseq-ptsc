// Lỗi tại chỗ, không màn trắng (D12): thông điệp + nút "Thử lại" ngay trong khung nội dung.
export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-border bg-card rounded-xl p-8 text-center text-secondary-foreground text-sm">
      {message}
      <div className="mt-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center h-[26px] px-2.5 rounded-md border border-border bg-card text-xs font-medium text-foreground transition-colors duration-[120ms] hover:bg-muted"
        >
          Thử lại
        </button>
      </div>
    </div>
  )
}
