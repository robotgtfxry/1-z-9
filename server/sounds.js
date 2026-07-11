// Lista dostepnych dzwiekow. Pliki mp3 wrzucasz do web/public/sounds/
// pod nazwami z pola "file". Mozesz swobodnie dodawac/usuwac wpisy —
// frontend czyta te liste z /api/sounds i renderuje tablice przyciskow.

export const SOUNDS = [
  { id: 'correct',   label: 'Poprawna',   file: 'correct.mp3',   color: '#2d6a4f' },
  { id: 'wrong',     label: 'Bledna',     file: 'wrong.mp3',     color: '#a63d40' },
  { id: 'buzzer',    label: 'Buzzer',     file: 'buzzer.mp3',    color: '#d9a03a' },
  { id: 'applause',  label: 'Brawa',      file: 'applause.mp3',  color: '#3a86ff' },
  { id: 'fanfare',   label: 'Fanfara',    file: 'fanfare.mp3',   color: '#f5c518' },
  { id: 'countdown', label: 'Odliczanie', file: 'countdown.mp3', color: '#8338ec' },
  { id: 'reveal',    label: 'Odkrycie',   file: 'reveal.mp3',    color: '#06b6d4' },
  { id: 'timeout',   label: 'Koniec czasu', file: 'timeout.mp3', color: '#7a4a20' },
  { id: 'suspense',  label: 'Napiecie',   file: 'suspense.mp3',  color: '#4a4a5a' },
]
