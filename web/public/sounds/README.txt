Wrzuc tu pliki mp3 z nazwami zgodnymi z lista w server/sounds.js.

Domyslnie oczekiwane pliki:
  correct.mp3     (Poprawna)
  wrong.mp3       (Bledna)
  buzzer.mp3      (Buzzer)
  applause.mp3    (Brawa)
  fanfare.mp3     (Fanfara)
  countdown.mp3   (Odliczanie)
  reveal.mp3      (Odkrycie odpowiedzi)
  timeout.mp3     (Koniec czasu)
  suspense.mp3    (Napiecie)

Chcesz dodac nowy dzwiek?
  1. Wrzuc mp3 do tego katalogu.
  2. Dopisz wpis w server/sounds.js (id, label, file, color).
  3. Restart backendu.

Skad brac dzwieki: freesound.org, pixabay.com (za darmo, sprawdz licencje).
Format: mp3 (najlepsza kompatybilnosc), 128–192 kbps wystarczy.
Dlugosc: krotkie (0.3–3 s) daja natychmiastowa reakcje; dluzsze (fanfara, brawa)
        odpalaj rzadko lub daj Stop w panelu operatora.
