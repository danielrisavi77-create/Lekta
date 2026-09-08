# UPUTE → PROFIL — od PDF-a Uputa do profila fakulteta

> Alati: `scripts/upute_u_profil.py` (kandidati, skica, usporedba), `scripts/provjeri_dijelove.py`
> (opseg po dijelovima, nalaz 9). Profil se i dalje **potvrđuje ručno**; alat samo skraćuje čitanje.

## Tijek za agenta

```bash
K=<KATEDRA_SKILL>
# 1. Upute → kandidati (PDF: pdftotext -layout → pypdf → pdfplumber; .docx; .txt s \f kao stranicom)
python3 $K/scripts/upute_u_profil.py Upute.pdf --out .katedra/upute/kandidati.json
# 2. ČOVJEK čita kandidate: svaki nosi citat (≤300 zn.), lokator (str. N, odl. M), confidence, pravilo.
#    Sukobe i sve < 0.7 potvrđuje ili odbacuje; ono što alat nije vidio upisuje ručno u skicu.
# 3. skica profila (samo kandidati ≥ 0.7 koji prolaze _schema.json; ostalo u napomene + sidecar)
python3 $K/scripts/upute_u_profil.py Upute.pdf --profil-skica .katedra/upute/skica.json \
    --fakultet <slug> --naziv "<puni naziv>" [--tip diplomski] [--stil vancouver]
# 4. razriješeni profil (samostojni put; nalazi su savjetodavni dok profil nije u registryju)
python3 $K/scripts/profile_resolver.py --fakultet <slug> --profil-datoteka .katedra/upute/skica.json \
    --tip diplomski --profile-out .katedra/resolved_profile.json --provenance-out .katedra/resolved_profile.provenance.json
# 5. provjere nad radom
python3 $K/scripts/check_rules.py rad.docx --profil .katedra/resolved_profile.json        # font, prored, ukupni opseg …
python3 $K/scripts/provjeri_dijelove.py rad.docx --profil .katedra/resolved_profile.json  # Uvod ≥ N riječi, udio, sažetak ≤ N zn., podsekcije, redoslijed, razmak_pt
```

Kad ručni profil već postoji, `--usporedi references/fakulteti/<slug>.json` ispisuje što se slaže, razlikuje
i nedostaje (i strožu mjeru bez `redoslijed`/`obavezan` iz popisa). To je test detektora, ne potvrda profila.

## Što alat radi

* Detektori (regex + heuristike, hrvatski): font i veličina, prored, margine, opseg u stranicama/riječima
  po tipu rada, **opseg po dijelovima** („Uvod … najmanje 3000 riječi", „Sažetak … do 1800 znakova",
  „ne smije prelaziti trećinu" → `udio_max` 0.3333), podsekcije dijela (popis iza dvotočke ili
  „predzadnji/zadnji odjeljak"), stil citiranja (ključne riječi + oblik citata `(1)` / `[1]` /
  `(Prezime, 2020)`), numerirani popis obaveznih dijelova (s oznakama „nije obavezna", „po potrebi"),
  numeracija stranica, razmak odlomaka, poravnanje, natpis iznad/ispod tablice, izvor ispod,
  spomen u tekstu, provjera izvornosti/Turnitin, broj primjeraka, obrana.
* Skica: `status` uvijek `nepotvrdeno`; provenance po pravilima sheme — `locator` „str. N, odl. M — „citat"",
  `type: explicit`, `confidence` kandidata; `izvor.dokument` = ime datoteke + oznaka NEPOTVRĐENO.
* Shema ima `additionalProperties: false`, pa `_kandidati_za_potvrdu` **ne ide u profil**: odbijeni
  kandidati stoje u `napomene` kao `[ZA POTVRDU] …` i u sidecaru `<skica>.kandidati_za_potvrdu.json`.

## Što alat NE radi

* **Ne izmišlja.** Bez doslovnog citata nema kandidata; vrijednost koju Upute ne spominju ne ulazi ni s
  najnižim confidenceom. Ako stil citiranja nije nađen, skica se ne može sastaviti bez `--stil` (shema ga
  traži) i ta vrijednost dobiva `type: derived` s izričitom napomenom da nije iz Uputa.
* **Ne potvrđuje.** Confidence je pouzdanost detekcije, ne potvrda pravila. Skica ne podiže status,
  ne ulazi u `index.json` i ne prolazi `faculty_scale_gate.py`. Nalazi nad radom iz takvog profila
  su ⚠️ [za potvrdu] (pravilo 18), nikad ❌.
* Ne čita tablice/slike u PDF-u ni sken bez OCR-a; proturječne navode ne razrješava (oba idu na potvrdu).

## Kako profil poslije ulazi u registry

1. Čovjek otvori Upute na svakom lokatoru iz `provenance.rules`, ispravi vrijednosti, upiše `aliasi`,
   `izvor.url`/`datum_dokumenta`, podigne `confidence` na ono što je stvarno provjereno.
2. Datoteka ide u `references/fakulteti/<slug>.json`; `status` smije postati `potvrdeno` samo uz
   pročitani izvornik (ne sažimač, ne skica).
3. `python3 scripts/profile_registry.py` regenerira `index.json`; `faculty_scale_gate.py` odlučuje
   o admisiji (`pilot`/`production`) — bez toga profil ostaje samostojni (`--profil-datoteka`).
4. Što shema ne nosi (Vancouver interpunkcija, font tablica, MeSH …) ostaje u `napomene` i fakultetskoj skripti.
