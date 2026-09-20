import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// `ComponentProps<typeof Sonner>` chứ không `ToasterProps` trần (bản CLI sinh ra): `ToasterProps`
// không khai `ref`, mà `Toast.tsx` cần ref tới `<section>` của sonner để đo dải `--toast-cao` mà
// không phải với tay ra `document`. React 19 chuyển `ref` như một prop thường nên chỉ cần mở KIỂU.
const Toaster = ({ ...props }: React.ComponentProps<typeof Sonner>) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Hai dòng dưới là của kho này, không phải của shadcn. Đặt INLINE vì cả hai phải thắng
          // biểu định kiểu sonner tự chèn vào <head> lúc nạp module (`__insertCSS`) — cùng độ đặc
          // hiệu `[data-sonner-toaster]` nên viết ở index.css là phó mặc cho thứ tự thẻ <style>.
          //
          // `height` — sonner để `<ol>` cao 0px và đặt từng toast `<li>` absolute bên trong. Hai
          // người canh của bất biến `--toast-cao` đều đo `<ol>`: `Toast.tsx` lấy
          // `innerHeight - rect.top` để công bố dải chừa, còn `lietKeLopDinh` (e2e) chỉ nhận phần
          // tử `fixed|sticky` CÓ hộp thật. Hộp 0px làm cái trước chừa thiếu nguyên chiều cao toast
          // và làm cái sau bỏ toast khỏi danh sách. `--front-toast-height` là chiều cao toast đang
          // ở trước, do chính sonner đo và ghi lên `<ol>` này (dist dòng 1165).
          height: "var(--front-toast-height)",
          // `zIndex` — mặc định của sonner là 999999999, tức toast nổi TRÊN cả hộp thoại. Ca e2e
          // `C-T24/2b` bắn tia vào tâm toast và đòi màn chắn hộp thoại che được nó. Hộp thoại /
          // sheet / tooltip / select / dropdown của kho đều `z-50`; 40 đặt toast ngay dưới chúng
          // và vẫn trên mọi nội dung trang.
          zIndex: 40,
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
