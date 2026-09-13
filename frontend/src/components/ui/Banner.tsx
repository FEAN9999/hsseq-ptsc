import type { ReactNode } from 'react'

export type BannerKind = 'warning' | 'danger' | 'gray' | 'offline'

// Màu theo tokens.css: .b-warn/.b-danger/.b-gray/.b-offline.
// b-warn viền #f59e0b (warningEdge, F3) — khác --warning dùng cho chữ.
const KIND_CLASS: Record<BannerKind, string> = {
  warning: 'bg-warningBg border-warningEdge text-warning',
  danger: 'bg-dangerBg border-danger text-danger',
  gray: 'bg-mutedbg border-hair text-soot',
  offline: 'bg-danger border-danger text-white',
}

export function Banner({ kind, children }: { kind: BannerKind; children: ReactNode }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border rounded-input px-3.5 py-2.5 mb-3 text-table ${KIND_CLASS[kind]}`}
    >
      {children}
    </div>
  )
}
