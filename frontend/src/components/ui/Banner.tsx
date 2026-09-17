import type { ReactNode } from 'react'

export type BannerKind = 'warning' | 'danger' | 'gray' | 'offline'

// Màu theo tokens.css: .b-warn/.b-danger/.b-gray/.b-offline.
// b-warn viền #f59e0b (warningEdge, F3) — khác --warning dùng cho chữ.
const KIND_CLASS: Record<BannerKind, string> = {
  warning: 'bg-warning-bg border-warning text-warning-foreground',
  danger: 'bg-destructive-bg border-destructive text-destructive',
  gray: 'bg-muted border-border text-secondary-foreground',
  offline: 'bg-destructive border-destructive text-white',
}

export function Banner({ kind, children }: { kind: BannerKind; children: ReactNode }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border rounded-md px-3.5 py-2.5 mb-3 text-sm ${KIND_CLASS[kind]}`}
    >
      {children}
    </div>
  )
}
