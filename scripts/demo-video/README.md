# Generator demo videa (sekcija Video na landingu)

Deterministicki renderer za `public/assets/demo.{webm,mp4}` + `demo-poster.jpg`.
Scena je cista HTML/CSS animacija vodena jednom funkcijom `__seek(tSec)`, pa se
snima frame-po-frame (60 fps, 1440p) umjesto screencasta. Zato je pokret savrseno
gladak i tekst ostaje ostar na svakom DPI-ju.

## Datoteke

- `scene.html` — cijela scena (intro, 3 koraka, papir, kartice nalaza, pecat).
  Sav timeline je u `__seek(t)` na dnu; vremena su u sekundama. Fontovi su
  self-hostani iz `fonts/` (Newsreader, IBM Plex Mono, Caveat), isti kao na siteu.
- `capture.mjs` — snimi svih 1560 frameova u `frames/` (playwright + Chromium).
- `probe.mjs` — brza kontrola: par kadrova na kljucnim t vrijednostima (`probe-*.png`).

## Kako regenerirati

Trazi Node, `playwright` (`npm i playwright && npx playwright install chromium`)
i `ffmpeg` na PATH-u (ili apsolutna putanja u komandi).

```bash
node probe.mjs        # opcionalno: vizualna kontrola prije pune snimke
node capture.mjs      # ~18 min: 1560 PNG-ova u frames/

# enkodiranje (iz ovog direktorija):
ffmpeg -y -framerate 60 -i frames/%05d.png -c:v libvpx-vp9 -crf 30 -b:v 0 \
  -row-mt 1 -deadline good -cpu-used 3 -pix_fmt yuv420p -an demo.webm
ffmpeg -y -framerate 60 -i frames/%05d.png -c:v libx264 -crf 20 -preset medium \
  -pix_fmt yuv420p -movflags +faststart -an demo.mp4
ffmpeg -y -i frames/00870.png -vf scale=1280:-2 -q:v 3 demo-poster.jpg

# pa kopiraj demo.webm, demo.mp4, demo-poster.jpg u ../../public/assets/
```

`frames/`, `demo.*` i `*.png` izlazi se NE commitaju (vidi `.gitignore`); u repo
ide samo izvor (scene.html + skripte + fonts). Video ide u `public/assets/`.

## Uredjivanje scene

Tekst i tajming su u `scene.html`. Promijeni copy u markupu, a vremena pojave/nestanka
u `__seek(t)` (segmenti tipa `seg(t, a, b, ease)`). Provjeri s `node probe.mjs`
pa tek onda pokreni punu snimku.
