interface TileProps {
  label: string
  value: number | null
  unit: string
  danger?: boolean
  flash?: boolean
}

// Giải phẫu cố định (D18): nhãn 12/500 chữ hoa · số 40/500 tnum · đơn vị 11px.
// Không icon, không %, không sparkline, không dòng phụ.
export function Tile({ label, value, unit, danger, flash }: TileProps) {
  const isMissing = value === null
  const isDanger = Boolean(danger) && !isMissing
  const mutedClass = isDanger ? 'text-danger' : 'text-sec'

  const rootClass = [
    'rounded-tile border py-4 px-5',
    isDanger ? 'bg-dangerBg border-danger' : 'bg-surface border-hair',
    flash && 'flash',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass}>
      <div className={`text-tableHead uppercase tracking-[0.02em] font-medium ${mutedClass}`}>{label}</div>
      {isMissing ? (
        <div className="text-kpi font-medium tnum text-sec" aria-label="chưa có dữ liệu">
          —
        </div>
      ) : (
        <>
          <div className={`text-kpi font-medium tnum ${isDanger ? 'text-danger' : 'text-ink'}`}>
            {value.toLocaleString('vi-VN')}
          </div>
          <div className={`text-[11px] ${mutedClass}`}>{unit}</div>
        </>
      )}
    </div>
  )
}
