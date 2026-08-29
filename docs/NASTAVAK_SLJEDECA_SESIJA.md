# Primopredaja: stvarni DOCX korpus (2026-08-24)

## Stanje u jednoj recenici

Korpus je narastao s 52 na 102 mjerena dokumenta, sva cetiri pada su popravljena (0 padova, 0
regresija, 0 ne-idempotentnih), a `npm run check` je crven ISKLJUCIVO zbog artefakata koje
invalidiraju commitovi PARALELNE sesije, ne zbog ovog posla.

## Sto je napravljeno

| faza | sadrzaj |
| --- | --- |
| F0 | mjerenje: `pass` je dostizan, korelacija po `check.id`, istinit nazivnik, `deep` kao u sucelju |
| F3 | "djelomicno popravljeno": jedan izvor tvrdnje i brojki za panel i serverski put |
| F2 | LibreOffice traka: prava `soffice` konverzija, kontrola 100/100, gard provenijencije |
| F1 | `corpus-ingest`: pseudonimizacija, privola, izvedene znacajke, 246 radova izvan repozitorija |

Novi moduli: `src/repair/repair-outcome.ts`, `src/corpus/{pseudonymize,docx-features}.ts`,
`scripts/corpus-ingest.mts`, `scripts/corpus-gen/{libreoffice,scenarios}.mjs`.

## Cetiri popravljena kvara motora, sve nasao STVARNI korpus

1. **Popravak je tvrdio izmjenu koje nema** kad tijelo rada nije u stilu `Normal` (`BodyText`,
   `NormalWeb`, `Standardno`). Tri sloja: stil tijela se nije krpao, deep ciscenje je preskakalo
   cijeli odlomak, a poravnanje se nije naslijedilo. Vidi `REAL_CORPUS_TESTING.md`.
2. **Zapis literature je postajao `Heading1`.** Zapis pocinje brojem kao poglavlje i stane u 180
   znakova, pa je bio predodabran kandidat. Referenca bi usla u SADRZAJ rada.
3. **Naslovnicka oznaka je postajala `Heading1`.** "ZAVRSNI RAD" je oznaka vrste rada, ne naslov.
4. **Razine naslova su preskakale hijerarhiju** jer su se izvodile iz ranga velicine fonta.

Uz to: **lazna `toc.coverage` regresija** vise ne demotira ispravno popravljen dokument
(`dropStaleFieldRegressions`, uvjetovano zivim TOC poljem oznacenim za osvjezavanje).

Ono sto je tjednima bilo zavedeno kao "drugi prolaz nije no-op" bio je SIMPTOM kvara 2, ne
zaseban problem.

## ZASTO GATE NIJE ZELEN (tocna dijagnoza, 2026-08-24)

Zadnje stanje: **4472 od 4476 testova prolazi**. Padaju `docx-golden`, `synthetic-golden`,
`real-corpus` i `completion-ledger`.

Uzrok NIJE ovaj posao nego NECOMMITANE izmjene paralelne sesije u radnom stablu:

    M data/profiles/verified-profiles.json
    M data/profiles/verified-profiles-heavy.json
    M data/profiles/closed-loop-ratchet.json

Ta datoteka nosi pravila po kojima motor boduje. Dok se mijenja, mijenjaju se i rezultati analize,
pa golden snapshoti i korpusni artefakti odlutaju pri svakom pokretanju.

**Golden NIJE ponovno pregradjen namjerno.** Pregradnja bi u MOJE snapshote upisala TUDJE
necommitane izmjene pravila, tocno ono pred cim upozorava CLAUDE.md ("tudji rad zavrsi pod tvojom
porukom"). Kad paralelna sesija commita svoje izmjene profila, lanac se vraca u red ovako:

    npx vitest run tests/docx-golden.test.ts tests/synthetic-golden.test.ts -u
    npx vite-node scripts/repair-real-corpus.mts
    npm run repair-faculty-matrix
    npx vite-node scripts/generate-real-corpus-backlog.mts
    npm run completion-ledger

Sve ostalo je vec vraceno u red u ovoj sesiji: `closed-loop` (svjez izracun daje TOCNO potpisan
ratchet 332/40/35, dakle potpis je bio ispravan a izvjestaj ustajao), `coverage-report`,
`verification-worklist`, `scored-value-drift`, `profile-rules-server`, `repair-recipe`,
`repair-coverage`, `profile-runtime-maps`, `repair-param-authority`.

## Sto je ranije blokiralo gate (rijeseno)

Paralelna sesija je tijekom rada commitala niz promjena bodovanja (`feat(bodovanje): ...`,
`chore(artefakti): cijeli lanac pregradjen`). Svaka takva promjena invalidira profilno izvedene
artefakte. Zadnje stanje: `4461 od 4467` testova prolazi, a padaju:

| test | tko ga vraca u red |
| --- | --- |
| `closed-loop-report` | **VLASNIK**: `npm run closed-loop` pa RUCNI potpis u `data/profiles/closed-loop-ratchet.json` (ratchet smije samo u korist `pass`) |
| `coverage-report` | paralelna sesija (`scored-coverage`) |
| `scored-value-drift` | paralelna sesija (`npm run scored-value-drift`) |
| `verification-worklist` | paralelna sesija (`npm run worklist`) |

`closed-loop-ratchet.json` NAMJERNO nije diran: on trazi ljudski potpis, a strojno prepisivanje bi
poništilo upravo onu zastitu zbog koje postoji.

**Redoslijed regeneracije** (nauceno na tezi nacin, `gen-profile-runtime-maps` se lako previdi):

    npx vite-node scripts/gen-profile-runtime-maps.mts   # advisory-map + repair-map
    npm run repair-recipe                                 # pece i profile-rules-server
    npm run repair-coverage
    npm run worklist
    npx vite-node scripts/repair-real-corpus.mts
    npm run repair-faculty-matrix
    npx vite-node scripts/generate-real-corpus-backlog.mts
    npm run completion-ledger

## Korpus

- 246 pseudonimiziranih radova u `C:/Users/PC/LektaCorpus/corpus`, keyring odvojen, privola u
  `_consent.json` (`scope: local-testing`).
- Mjeri se preko `LEKTA_CORPUS_SOURCE`; bez te varijable sve radi kao prije i ostaje reproducibilno.
- 245/246 prolazi Tier 1; jedini pad je kvar U IZVORNOM dokumentu (nema `png` Default u
  `[Content_Types].xml`).

## Sto ostaje

1. **196 od 246 radova nema prepoznat profil.** Automatika pokriva 50 kroz 7 profila; ostalima
   treba rucna dodjela ili bolja detekcija naslovnice.
2. ~~**`evaluateHeadingHierarchy` prolazi vakuumski**~~ **RIJESENO 2026-08-24** (odluka vlasnika).
   Petlja je kretala od `i=1`, pa prvi naslov nije prolazio nikakvu provjeru; uz to je dokument BEZ
   ijednog naslova takodjer dobivao 6/6. Izmjereno na sva 246 rada ovog korpusa PRIJE zahvata:
   45 dokumenata nema nijedan naslov, a 36 nema nijednu razinu 1 i svejedno je dobivalo pune bodove,
   dakle **81 od 246 (33%)** je imalo 6 besplatnih bodova za hijerarhiju koja nije provjerena.
   Popravak ne mijenja pravilo nego ga prestaje preskakati na prvom clanu (razina prije prvog
   naslova je 0); dokument bez naslova sada vraca 0/0, isti oblik koji `auditHeadingRules` vec
   koristi. Golden se pomaknuo na TOCNO jednoj fixturi (`grf-diplomski-neuskladjen`, koja doslovno
   nema naslove): 6/6 -> 0/0, ocjena 56 -> 53. Gard: `tests/heading-hierarchy-vacuum.test.ts`,
   8 slucajeva, obje grane dokazane mutacijom.
3. **Pseudonimizacija nije dokaziva potpunost.** 76 od 246 dokumenata nema nijedan prepoznat pojam
   (`vacuous: true`); uz `scope: local-testing` to je prihvatljivo, uz siri scope nije.
4. **Moderni Word.** Sve je Word 2010; `w15`/`w16` dijelove ovaj stroj ne moze proizvesti.
5. **`.env.corpus` sadrzi zivi Supabase `service_role` kljuc u cistom tekstu.** Rotacija je jedini
   pravi lijek i moze ju izvesti samo vlasnik.
6. F4 (ledger pokrivenosti po mrezi profil x vrsta rada x vrsta dokumenta), F5 (Word/LibreOffice
   oracle vodjen manifestom), F6 (PDF traka, strogo ogradjena).
