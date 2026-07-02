# OCR i nedohvatljivi izvori (backlog)

Port sesija (2026-07-02) pokrila je ~29 fakulteta i 106 profilnih celija (597 scored pravila).
Preostali izvori su blokirani ISKLJUCIVO okolinom, ne nedostatkom truda. Nista nije izmisljeno:
skenirani PDF-ovi bez tekstualnog sloja ne mogu proci adversarijalnu grep-provjeru citata, pa su
izvori preskoceni (found:false) umjesto da se nagadaju vrijednosti.

## A. Skenirani izvori - trebaju OCR

Lokalno nema tesseract binarija (samo pytesseract wrapper). Nakon instalacije alata (vidi dno):

```
node scripts/ocr-source.mjs <put/do/skeniranog.pdf>
# -> <ime>-ocr.pdf (+ .txt); provjeri .txt pa portaj kroz port-faculty spec kao ostale
```

Poznato skenirani (iz izvjestaja workflow agenata), vec u repozitoriju kao provenance:

| Izvor | Fakultet | Sto bi otkljucao |
|---|---|---|
| `data/sources/fsb/fsb-pravilnik-radovi-2018.pdf` | FSB | faculty-wide binding pravila (FSB je sad 0 scored, sve advisory) |
| `data/sources/grad/grad-pravilnik-zavrsni-diplomski.pdf` + `grad-upute-radovi-2024.pdf` | GRAD | dodatna binding pravila uz vec portani DOCX predlozak |
| `data/sources/grf/grf-pravilnik-diplomski-2012.pdf` + `grf-pravilnik-poslijediplomski.pdf` | GRF | diplomski Prilog 3 (diplomski razina; sad pokrivena preko .doc) i doktorski |
| `data/sources/fkit/fkit-pravilnik-2023.pdf` | FKIT | maticni Pravilnik (sad samo 3 scored iz Izmjene 2025) |

Nije u repozitoriju (treba re-harvest PA OCR):

| Izvor (URL) | Fakultet | Napomena |
|---|---|---|
| https://www.rgn.unizg.hr/ (Uputa 2025 + Pravilnik 2025) | RGNF | oba skenirana; jedini tekstualni izvor (EN Instructions) je procesni |
| https://www.fhs.hr (Pravilnik o doktorskim studijima 2026) | FHS | doktorski Pravilnik skeniran (doktorski je pokriven DR.SC.-08 redizajnom) |
| Pravilnik Geofizickog odsjeka PMF | PMF (geofizika) | slikovni scan; jedini tekst je citation-style (machineCheckable:false) |

## B. Mrezno/CMS nedohvatljivi - OCR ne pomaze

| Izvor | Problem | Moguce rjesenje |
|---|---|---|
| adu.unizg.hr (Pravilnik o studiranju ADU 2023) | host obara TLS/konekciju za sve klijente | dohvat s druge mreze; ADU diplomski je ionako umjetnicki projekt (nema pisanih format-pravila) |
| pbf 2021 Prilog 1/2 (zavrsni/diplomski) | ucitava se preko potpisanog jsxr AJAX-a; direktni PDF 404, Wayback samo redirect stubovi | rucni izvoz iz preglednika (Save as PDF) pa lokalni port; trenutno pbf-diplomski koristi Wayback 2018 |
| fbf diplomski upute | iza Merlin (moodle.srce.hr) logina | dohvat s AAI prijavom; fbf trenutno ima samo specijalisticki profil |
| fer sredisnje stranice (predmet/diprad, predmet/zavrad) | HTTP 403 | drukciji User-Agent/mreza; fer diplomski/zavrsni pokriveni iz drugih izvora |

## Instalacija OCR alata (Windows)

1. Tesseract: https://github.com/UB-Mannheim/tesseract/wiki  (ili `scoop install tesseract`)
   - dodaj hrvatski: `hrv.traineddata` u `tessdata/` (provjera: `tesseract --list-langs` sadrzi `hrv`)
2. Ghostscript: `choco install ghostscript`
3. ocrmypdf: `pip install ocrmypdf`  (provjera: `ocrmypdf --version`)

Nakon toga `scripts/ocr-source.mjs` radi automatski.

## Postupak porta nakon OCR-a

1. OCR skeniranog PDF-a -> `-ocr.pdf` + `-ocr.txt`.
2. Procitaj `.txt`, izvuci imperativna pravila s DOSLOVNIM citatom + lokatorom (isti standard kao workflow).
3. Napravi `discovery/port-specs/<fac>.json` (izvor s `snapshotPath` na `-ocr.pdf` + njegov sha256) i fan-out draft.
4. `node scripts/port-faculty.mjs discovery/port-specs/<fac>.json` -> `npm run check` -> commit.
