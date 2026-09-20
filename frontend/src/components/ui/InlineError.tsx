import { Button } from './button'
import { Card, CardContent } from './card'

// Lỗi tại chỗ, không màn trắng (D12): thông điệp + nút "Thử lại" ngay trong khung nội dung.
export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="py-4 text-center text-sm text-secondary-foreground">
        {message}
        <div className="mt-2.5">
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
