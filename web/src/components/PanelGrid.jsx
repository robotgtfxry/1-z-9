import Hearts from './Hearts.jsx'

// Wizualizacja 9 paneli w siatce 3x3. Podglad LEDow + imie + zycia.
export default function PanelGrid({ panels = [], seats = [], size = 'md', highlight = [] }) {
  return (
    <div className={`panel-grid ${size}`}>
      {Array.from({ length: 9 }).map((_, p) => {
        const sec = panels[p] || [{}, {}, {}]
        const seat = seats.find(s => s.seat === p)
        const hi = highlight.includes(p)
        const out = seat?.user_id && (seat.lives ?? 3) <= 0
        return (
          <div key={p} className={`pgrid-cell ${hi ? 'hi' : ''} ${out ? 'out' : ''}`}>
            <div className="pgrid-lights">
              {[0, 1, 2].map(s => {
                const x = sec[s] || {}
                const c = x.on ? `rgb(${x.r},${x.g},${x.b})` : '#26262e'
                return <div key={s} className="pgrid-led" style={{ background: c, boxShadow: x.on ? `0 0 12px ${c}` : 'none' }} />
              })}
            </div>
            <div className="pgrid-label">
              <span className="pgrid-num">{p + 1}</span>
              <span className="pgrid-name">{seat?.name || '—'}</span>
            </div>
            {seat?.user_id && <Hearts lives={seat.lives ?? 3} size={size === 'lg' ? 'md' : 'sm'} />}
          </div>
        )
      })}
    </div>
  )
}
