# Generator demo videa (sekcija Video na landingu)

Deterministicki renderer za `public/assets/demo-{720,1080,1440}.{webm,mp4}` +
`demo-poster.jpg`, s ugradenom ambijentalnom glazbom. Scena je cista HTML/CSS
animacija vodena jednom funkcijom `__seek(tSec)`, pa se snima frame-po-frame
(60 fps, 1440p) umjesto screencasta. Zato je pokret savrseno gladak i tekst
ostaje ostar na svakom DPI-ju.

## Datoteke

- `scene.html` — cijela scena (intro, 3 koraka, papir, kartice nalaza, pecat).
  Sav timeline je u `__seek(t)` na dnu; vremena su u sekundama. Fontovi su
  self-hostani iz `fonts/` (Newsreader, IBM Plex Mono, Caveat), isti kao na siteu.
- `capture.mjs` — snimi svih 1560 frameova u `frames/` (playwright + Chromium).
- `probe.mjs` — brza kontrola: par kadrova na kljucnim t vrijednostima (`probe-*.png`).
- `ambient.filter` — ffmpeg filtergraf ambijentalne glazbe (Cadd9 pad koji "dise" +
  rijetki mekani tonovi). Tih bed (~ -25 dB), krece tek na klik na play. Zamijeni ovu
  datoteku (ili ambient.wav) da promijenis glazbu.
- `encode.mjs` — generira zvuk iz `ambient.filter`, pa enkodira 3 kvalitete x
  (webm VP9+Opus, mp4 H264+AAC) iz `frames/` + poster.

## Kako regenerirati

Trazi Node, `playwright` (`npm i playwright && npx playwright install chromium`)
i `ffmpeg` na PATH-u (ili u env `FFMPEG`).

```bash
node probe.mjs        # opcionalno: vizualna kontrola prije pune snimke
node capture.mjs      # ~18 min: 1560 PNG-ova u frames/
node encode.mjs       # zvuk + 6 video datoteka + poster (VP9 je spor, par min)

# pa kopiraj demo-*.{webm,mp4} + demo-poster.jpg u ../../public/assets/
```

Izlazi (`frames/`, `*.webm`, `*.mp4`, `*.wav`, `*.png`) se NE commitaju (vidi
`.gitignore`); u repo ide samo izvor (scene.html, skripte, ambient.filter, fonts).
Gotov video ide u `public/assets/`.

## Uredjivanje

- **Scena / tekst / tajming**: `scene.html`. Promijeni copy u markupu, a vremena
  pojave/nestanka u `__seek(t)` (segmenti tipa `seg(t, a, b, ease)`). Provjeri s
  `node probe.mjs`, pa pokreni `capture.mjs` + `encode.mjs`.
- **Glazba**: uredi `ambient.filter` (ffmpeg izraz) ili ubaci vlastiti `ambient.wav`
  (encode.mjs ga preskace generirati ako vec postoji). Za provjeru: spektrogram
  `ffmpeg -i ambient.wav -lavfi showspectrumpic=s=900x420:legend=1 spectro.png`.
- **Kvalitete / kompresija**: `Q` polje u `encode.mjs` (rezolucije + CRF). Player u
  `src/ui/korektorski.ts` (`Q_MAP`) i `index.html` (`data-q` gumbi) moraju pratiti
  iste nazive kvaliteta.
