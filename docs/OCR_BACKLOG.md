# OCR i nedohvatljivi izvori (backlog)

Port sesija (2026-07-02) pokrila je ~29 fakulteta i 106 profilnih celija (597 scored pravila).
Preostali izvori su blokirani ISKLJUCIVO okolinom, ne nedostatkom truda. Nista nije izmisljeno:
skenirani PDF-ovi bez tekstualnog sloja ne mogu proci adversarijalnu grep-provjeru citata, pa su
izvori preskoceni (found:false) umjesto da se nagadaju vrijednosti.

## A. Skenirani izvori u repozitoriju - RIJESENO (OCR odradjen 2026-07-02)

OCR lanac je instaliran i skenirani in-repo izvori su OCR-ani skriptom
`python scripts/ocr_pdf.py <pdf>` (PyMuPDF rasterizacija 300 DPI + tesseract hrv+eng;
ne treba ocrmypdf ni Ghostscript). Kvaliteta hrvatskog OCR-a je vrlo visoka (cista
dijakritika). VAZAN nalaz: vecina ovih PDF-ova NIJE bila skenirana - imali su tekstualni
sloj, a prosla ih je sesija krivo oznacila skeniranima jer `pdftotext` uopce nije mogao
pokrenuti (greska putanje), ne zbog nedostatka teksta.

| Izvor | Stvarno stanje | Ishod nakon OCR/pdftotext |
|---|---|---|
| `fsb/fsb-pravilnik-radovi-2018.pdf` | tekstualni sloj | proceduralni Pravilnik, NEMA pravila oblikovanja; FSB ostaje advisory (format dolazi iz jedne katedre, ne faculty-wide) |
| `grad/grad-pravilnik-zavrsni-diplomski.pdf` | skeniran (OCR) | proceduralni, bez format pravila |
| `grad/grad-upute-radovi-2024.pdf` (89 str.) | skeniran (OCR) | izrijekom DELEGIRA tehnicko oblikovanje na Predlozak (grad-predlozak-2024, vec izvor); stil citiranja je studentov izbor -> margine/paper-size ostaju advisory |
| `grf/grf-pravilnik-diplomski-2012.pdf` | skeniran (OCR) | sadrzi punu format-spec IDENTICNU prilogu 3 (.doc) koji grf-diplomski vec koristi -> redundantna potvrda |
| `grf/grf-pravilnik-poslijediplomski.pdf` | tekstualni sloj | doktorski/proceduralni; doktorski pokriven DR.SC.-08 |
| `fkit/fkit-pravilnik-2023.pdf` | skeniran (OCR) | maticni cl. 9: A4, 12 pt, prored 1,5 (zavrsni i diplomski); 3 scored pravila po vrsti REPOINTANA s garbled Izmjene 2025 na cist verbatim citat (vrijednosti nepromijenjene) |

Neto: jedino stvarno poboljsanje je FKIT (cisci izvor/citat, ista pokrivenost). Za FSB/GRAD/GRF
OCR je DOKAZAO da nema dodatnih scored pravila (delegiraju ili su proceduralni). OCR tekst je
spremljen kao provenance uz izvore: `<izvor>.ocr.txt`.

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

## Instalacija OCR alata (Windows) - INSTALIRANO 2026-07-02

Instalirano u ovoj sesiji:
1. Tesseract 5.4.0: `winget install --id UB-Mannheim.TesseractOCR --source winget` (user-vidljivo na `C:\Program Files\Tesseract-OCR`).
2. `hrv.traineddata` + `eng.traineddata` (tessdata_best) u `%LOCALAPPDATA%\tessdata` (postavi `TESSDATA_PREFIX` ili ostavi da skripta sama nadje).
3. PyMuPDF: `pip install --user pymupdf` (rasterizator; zamjenjuje Ghostscript+ocrmypdf).

Preporuceni put (bez ocrmypdf/Ghostscript):

```
python scripts/ocr_pdf.py data/sources/<fac>/<izvor>.pdf    # -> <izvor>-ocr.txt (hrv+eng, 300 DPI)
```

`scripts/ocr-source.mjs` (ocrmypdf varijanta) ostaje kao alternativa ako se instalira ocrmypdf+Ghostscript.

## Postupak porta nakon OCR-a

1. OCR skeniranog PDF-a: `python scripts/ocr_pdf.py <izvor>.pdf` -> `<izvor>-ocr.txt`.
2. Procitaj `.txt`, izvuci IMPERATIVNA pravila s DOSLOVNIM citatom + lokatorom (isti standard kao workflow). Ako izvor delegira/procedura je - `found:false`, ne izmisljaj.
3. Izvor je najcesce vec registriran (snapshotPath = originalni PDF + hash); spremi i `<izvor>.ocr.txt` kao provenance. Dodaj scored ruleEntries u agregirani draft `data/profiles/<fac>/drafts/<fac>.json` (glavne vrste) ili fan-out draft, s ledger unosima u port-specu.
4. `node scripts/port-faculty.mjs discovery/port-specs/<fac>.json` -> `npm run check` -> commit.
