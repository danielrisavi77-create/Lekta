# Bootstrap: prototip -> Vite/TypeScript app

Repo je scaffoldan (Vite + TypeScript, build gate, docs, profili, rule-compiler).
Puni runtime (DOCX parser, auditi, Legal Citation Engine, UI, narudzbe) zivi u
single-file prototipu kao jedan veliki inline `<script>`. Po dogovoru se taj kod
NE prepisuje rucno nego se generira iz tvog izvornog prototipa, da ostane
byte-faithful (kopija u ovom repou je mojibake i lossy, vidi nize).

## Koraci

1. Stavi pristinu, ispravno UTF-8 kodiranu single-file verziju prototipa u repo kao:

   ```
   reference/prototype.html
   ```

   (To je tvoj `Lekta_v2_2_2_Full_Institutional_Coverage_Matrix.html` s cijelim JS-om
   unutar jednog `<script>` bloka. Skripta prvo gleda `reference/prototype.html`, pa
   kao fallback `reference/Lekta_v2_2_2_Full_Institutional_Coverage_Matrix.html`.)

2. Generiraj Vite izvore:

   ```bash
   npm install
   npm run bootstrap     # scripts/split-prototype.mjs
   ```

   To izvuce inline `<script>` u `src/main.ts` (s `// @ts-nocheck`) i prepise
   `index.html` tako da ucitava `/src/main.ts` kao ES modul. `src/main.ts` i
   `index.html` su time GENERIRANI artefakti iz prototipa.

3. Provjeri i pokreni:

   ```bash
   npm run check         # tsc --noEmit && vitest run && vite build
   npm run dev           # http://localhost:5173
   ```

   U dev modu: klikni "Pokreni demo" -> renderira se score, kategorije i tabovi.
   `?qa=1` u URL-u otvara QA konzolu (dijagnostika registra profila).

## Zasto split umjesto rucnog porta

- Vjernost: prototip ima ~2500 linija gustog JS-a (veliki registri profila,
  parser, citation engine). Rucno prepisivanje uvodi suptilne greske koje tiho
  lome parser; deterministicki split je byte-faithful.
- Encoding: tekst koji je bio dostupan pri scaffoldu je dvostruko kodiran
  mojibake (`Â·`, `OtkljuÄaj`, `Å¾`), i hrvatski `c/c/d` su djelomicno izgubljeni.
  Tvoja izvorna datoteka je ispravna; nju koristimo kao izvor istine.

## Dalje (CLAUDE.md backlog)

Nakon bootstrapa: data extraction iz `src/main.ts` u `data/**`, Option A
`ruleEntries` migracija (rule-compiler je vec tu), golden harness u
`tests/fixtures/docx/`, pa modularizacija `src/main.ts` (skidanje `@ts-nocheck`).
