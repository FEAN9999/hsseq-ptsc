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
      {/* text-[12px] (KHÔNG phải text-tableHead — token đó dành cho <th> bảng, ép line-height 1.2)
          để nhãn kế thừa line-height 1.45 của body, đúng mockup .tile .lbl chỉ đặt font-size */}
      <div className={`text-[12px] uppercase tracking-[0.02em] font-medium ${mutedClass}`}>{label}</div>
      {isMissing ? (
        // mt-1.5 = 6px, đúng mockup .tile .val{margin-top:6px} (nhãn → số)
        <div className="text-kpi font-medium tnum text-sec mt-1.5" aria-label="chưa có dữ liệu">
          —
        </div>
      ) : (
        <>
          <div className={`text-kpi font-medium tnum mt-1.5 ${isDanger ? 'text-danger' : 'text-ink'}`}>
            {value.toLocaleString('vi-VN')}
          </div>
          {/* mt-0.5 = 2px, đúng mockup .tile .unit{margin-top:2px} (số → đơn vị) */}
          <div className={`text-[11px] mt-0.5 ${mutedClass}`}>{unit}</div>
        </>
      )}
    </div>
  )
}
