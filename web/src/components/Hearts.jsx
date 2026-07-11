// Wyswietla 3 serca; pierwsze `lives` sa pelne, reszta pusta.
// size: 'sm' | 'md' | 'lg'
export default function Hearts({ lives = 3, size = 'md' }) {
  return (
    <span className={`hearts ${size}`} aria-label={`${lives} zyc`}>
      {[0, 1, 2].map(i => (
        <svg key={i} viewBox="0 0 24 24" className={`heart ${i < lives ? 'on' : 'off'}`}>
          <path d="M12 21s-7-4.35-9.5-9C1 8.5 3 5 6.5 5c1.74 0 3.41.81 4.5 2.09C12.09 5.81 13.76 5 15.5 5 19 5 21 8.5 19.5 12 17 16.65 12 21 12 21z"/>
        </svg>
      ))}
    </span>
  )
}
