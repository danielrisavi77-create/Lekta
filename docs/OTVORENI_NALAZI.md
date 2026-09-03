# Otvoreni nalazi

Popis mjesta na kojima je kvar IZMJEREN ili osnovano posumnjan, a nitko ga ne drzi. Nije plan rada
nego zaliha: tko ima prostora, uzima s vrha i javi da je uzeo.

Sastavljeno 2026-09-03. Svaka stavka nosi kako je utvrdjena, da se ne mora ponavljati mjerenje.

---

## A. Blokira granu prema masteru

Grana je 60+ commita ispred zelenog mastera i CI joj je CRVEN. Merge bi upravo sada porusio master.

### A1. `globSync` trazi Node 22, a `engines` deklarira `>=20`  (POTVRDJENO)

    scripts/gen-profile-rules-server.mts:18   import { globSync } from 'node:fs'
    tests/profile-rules-server.test.ts:15     isto

`node:fs.globSync` postoji od Node 22. `package.json` kaze `{"node":">=20"}`, a CI vrti matricu 20 i
24, pa grana 20 pada. Lokalno se ne vidi jer je stroj na Node 24: klasicno "radi kod mene".

Popravak je izbor, ne mehanika: ili zamjena za `fast-glob`/rucni obilazak, ili podizanje `engines` na
`>=22` uz izmjenu CI matrice. Drugo je krace ali suzava podrzane verzije.

### A2. Dvije pass-regresije `structure.heading.hierarchy`  (IZMJERENO)

    local-13-zavrsni, local-27-zavrsni

Preostatak nakon `6fa30bfc` (neidempotentnost 7 -> 0) i `fef95ad1` (oba `-diplomski` slucaja).
Luk je provjeren nad ISTOM populacijom (45 dokumenata, 7 dopustenih commitanih + 38 lokalnih):

    cist HEAD    11 padova   7 neidempotentnih   4 regresije
    6fa30bfc      4 pada     0                   4
    fef95ad1      2 pada     0                   2

Polaziste za sljedeceg: zbirna polja izvjestaja NE razlikuju regresirajuce od cistih dokumenata
unutar istog profila (broj unosa se preklapa, `droppedEntryCount` nula svugdje, `secondPassNoOp`
isti). Uvjet je u strukturi naslova samog dokumenta. Usporedi par unutar `fpzg-politologija-zavrsni`,
jedan koji regresira i jedan koji ne; sve zajednicko time otpada bez dodatnog prolaza.

Mjeri se s `LEKTA_LOCAL_CORPUS=1`, izoliran worktree, junction na `node_modules` I na
`tests/fixtures/docx-local` (gitignoriran; bez njega mjeris drugu populaciju a nista ne pukne).
Prvo provjeri `documentCount == 45`.

### A3. Ustajali testovi nakon izdvajanja stila  (mjerila druga sesija)

`29828b46` je izdvojio inline `<style>` iz `index.html` u `src/shared/page.css` (288 KB -> 85 KB), a
tri testa jos greppaju `index.html`: `scoring-change-note`, `contrast-tinted-surfaces`,
`a11y-batch-2026-07-18`. Provjereno je da novi CSS sadrzi sve sto testovi traze, dakle testovi gledaju
krivu datoteku; nije kvar proizvoda.

### A4. `tests/deploy-manifest.test.ts:43` deep-equal raskorak (24 stavke)

Vjerojatno ustajao artefakt uz `a7ea8dcf`. Nije potvrdjeno.

### A5. UX gate: tri pada kontrasta u pravom pregledniku

Izmjereni omjeri 1.23 (`#e1e5e7` na `#fdfcf5`), 1.5 i 2.25 na naslovnici. Nije utvrdjeno je li
posljedica izdvajanja stila ili commita `a173d231` / `b2aa1abe`.

---

## B. Tiha steta, ne blokira

### B1. `.gitattributes` nema pravilo za `.snap`  (POTVRDJENO)

Tri golden snimke (`docx-golden`, `repair-golden`, `synthetic-golden`) NAKON svakog prolaza izgledaju
izmijenjene u `git status`, a sadrzaj im je bajt-identican; razlika je samo CRLF. Danas je na to
naletjelo najmanje tri sesije, a jedna je zamalo commitala "osvjezene" golden snimke.

Popravak je jedan redak u `.gitattributes`. Presedan postoji (`-text` za hunspell affix).

### B2. Commitani korpus ne mjeri ucinkovitost popravka  (POTVRDJENO)

`docs/generated/repair-real-corpus.json`: 7 dopustenih fixtura, **0 ciljanih provjera**. Njegove
tvrdnje `failCount 0` i `passRegressionCount 0` su vakuumski istinite. Isti kod nad stvarnim radovima
daje 94 ciljane provjere, 4 pada, 4 regresije.

Vidljivost je rijesena (`5c0afa13`: `scope.measuresRepairEffectiveness`), ali POKRIVENOST nije. Dok
je tako, jedina mjera koju CI vrti ne moze vidjeti regresiju popravka. Stvarni radovi ne mogu u git,
pa je rjesenje anonimizirana fixtura koju profil stvarno cilja.

### B3. `pilot-set.json` je RUCNO odrzavano zrcalo generiranog artefakta

Nijedna skripta ga ne pise, a `tests/pilot-set.test.ts` trazi da se slaze s `profile-claims.json`.
Kad se generirana strana pomakne, pilot se raziđe i gate padne, a osvjeziti ga moze samo covjek koji
se sjeti. Danas se to dogodilo jednom.

### B4. Pet projekcija bez screeninga (ratchet u `tests/projection-registry-coverage.test.ts`)

`citation-dossiers`, `reconcile-programs`, `repair-gap`, `scored-value-drift`, `worklist`. Svaka ima
drift test, nijedna nije u `PROJECTIONS`, pa joj se ustajalost vidi tek na punom prolazu. Registracija
trazi da se za svaku utvrde IZVORI; kriv popis izvora daje laznu sigurnost, pa se radi jedna po jedna.

### B5. Drift test upucuje na nepostojecu naredbu  (POTVRDJENO)

Poruka trazi `npm run repair-real-corpus-backlog`; ta skripta ne postoji. Citatelja salje u prazno.
Drzi ga ratchet od jednog u istom testu.

---

## C. Komercijalno, izvan koda

### C1. `data/legal/provider.json`: `oib` i `phone` su prazni  (POTVRDJENO)

Bez njih naplata ne moze ici. Podatak je vlasnikov, ne moze ga izvesti nijedna sesija.

### C2. Proizvodi bez `mor_product_id`

Prijavljeno u handoffu: svih 20 proizvoda ima `null`, pa `create-checkout` vraca
`409 product_not_mapped`. Nisam nasao datoteku na ocekivanim stazama, dakle NEPOTVRDJENO; treba
locirati izvor prije nego se planira.

### C3. Cjenik je dominiran

Prijavljeno: `slot_zavrsni` 9,99 / 120 dana je strogo losiji od `pass_zavrsni` 9,99 / 180 dana.
Nepotvrdjeno mojim mjerenjem.

---

## D. Poznato i svjesno odgodjeno

### D1. Backlog 7: `scripts/` i `tests/` nisu u `tsconfig.json`

Odgodjeno odlukom vlasnika 2026-08-30, uz izmjerene brojke (126 gresaka, nula u `src/`). Vrijedi
napomenuti da bi to uhvatilo A1: `globSync` uvoz je u `scripts/` i `tests/`, dakle upravo u
direktorijima koje `tsc` ne gleda.

### D2. `docs/generated/DEPLOY_DRIFT.md` je necommitan od jutros

Nitko ga nije pogledao. Ne znam je li nalaz ili artefakt prolaza.
