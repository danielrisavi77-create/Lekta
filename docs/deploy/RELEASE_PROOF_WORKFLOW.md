# Dokaz izdanja: cista ovjera i proof-only commit

Postupak kojim se dobije objava za koju se moze dokazati STO je objavljeno i STO je nad tim
izmjereno. Izvor je odjeljak 8 dokumenta `docs/agents/plan-do-live-2026-09-12.md` ("Release proof
bez stalnog samoponistavanja"); ovdje je usaglasen s onim sto skripte STVARNO rade nakon reza T19
(2026-09-13).

Javna objava je zakljucana i radi se rucno iz cistog worktreea (vidi
`netlify-auto-publishing-locked` u biljeskama). Ovaj dokument opisuje samo dokazni lanac, ne
Netlify konfiguraciju.

## Zasto postoji koka i jaje

Dokaz (`docs/generated/RELEASE_PROOF.json`) je i sam datoteka u repozitoriju. Kad bi se svjezina
mjerila usporedbom `proof.commit` s HEAD-om, dokaz bi zastario cim se commita. Zato nosi OTISAK
STABLA bez same datoteke dokaza (`treeDigest`, vidi `scripts/release-proof-core.mjs`), pa je jedina
dopustena promjena poslije ovjere upravo ta jedna datoteka. Svaka druga promjena pracene datoteke
cini dokaz `stale`, i to je namjerno: dokaz vrijedi za stablo nad kojim je pecen, ne za ono sto je
kasnije doslo.

## Sto zaustavlja objavu

Pet stanja, i svako od njih je pad, ne upozorenje, cim je gate tvrd (`LEKTA_REQUIRE_RELEASE_PROOF=1`,
sto `netlify.toml` postavlja):

| # | Stanje | Tko ga hvata | Poruka sadrzi |
|---|---|---|---|
| a | `dist/build-info.json` nedostaje, nije JSON ili nema 40-znamenkasti commit | `verify-deploy-dist`; `verify-release-proof` BEZ `--proof-only` | `dist/build-info.json ne postoji` |
| b | `dist/build-info.json` nosi commit koji NIJE onaj koji se gradi | isto | `artefakt nema identitet builda` |
| c | dokaz je `stale` ili `unknown` | `verify-deploy-dist`, `verify-release-proof` (uvijek) | `ZASTARJELO` / `NE ZNAM` |
| d | praceni izvor promijenjen poslije ovjere (otisak stabla se razisao) | isto | `ZASTARJELO` |
| e | obavezna razina bez zapisanog prolaza u `results[]` | isto | `obavezne razine bez zapisanog prolaza` |

Uz zivu stranicu dolazi i sesti, koji se ne moze izmjeriti na build stroju: OBJAVLJENA verzija nije
ona koja se tvrdi. To hvata `post-deploy-smoke` uz `--strict-commit` (korak 7).

Slucajevi (a) i (b) padaju UVIJEK, i bez tvrde zastavice: ondje se ZNA da je artefakt kriv. Slucajevi
(c) do (e) su bez zastavice glasno upozorenje, jer razvojni CI (`dist-gate` u `.github/workflows/check.yml`)
namjerno gradi bez obaveznog dokaza: dokaz trazi Word, pa se pece lokalno, ne na svakom pushu. Ta
razlika izmedju razvojnog CI-ja i release gatea je namjerna i cuva je `tests/release-gate-wiring.test.ts`.

JEDINA IZNIMKA za (a) i (b) je zastavica `--proof-only` u koraku 5, i to zato sto se ondje mjeri
stablo, a ne artefakt: `dist/build-info.json` nastaje tek u koraku 6, pa bi puni gate u koraku 5 uvijek
padao iz razloga koji s pitanjem tog koraka nema veze. Zastavica SUZUJE na dokaz: (c), (d) i (e) i dalje
padaju, ispis glasno kaze da identitet artefakta nije mjeren, a `verify-deploy-dist` je ODBIJA, pa se ne
moze uvuci u lanac objave. Oba smjera mjeri `tests/release-gate-cli.test.ts`.

Jos jedno pravilo o ispisu: zavrsni redak nikad ne tvrdi `OK` kad postoji ijedan nalaz, ni u mekom modu.
Mekoca je odluka o strogosti, ne potvrda dokaza; uz nalaz zavrsni redak glasi `NIJE POTVRDJENO`.

## Postupak, osam koraka

1. **Dovrsi sve namjeravane promjene** izvora, pravila, generatora, konfiguracije, plana i statusa.
   Provjere i pregled po uputama repozitorija moraju proci PRIJE commita.
2. **Commitaj taj sadrzaj.** Provjeri cist worktree (`git status --porcelain` prazan) i zabiljezi
   kandidat SHA. Necist worktree se upisuje u dokaz kao `dirtyWorkingTree: true` i gate ga odbija.
3. **U Windows/Word okruzenju izvrti puni `npm run release:check`.** Word razine (`word`,
   `word-worst`) su obavezne i drugdje se biljeze kao `unavailable`, sto NIJE prolaz. Spremi stvarne
   izlazne kodove i verzije alata.
4. **Pregledaj `git diff`.** Ocekivana promjena pracene datoteke smije biti SAMO
   `docs/generated/RELEASE_PROOF.json`. Ako se promijenilo jos nesto (generirani artefakt,
   projekcija), prvo to razrijesi i commitaj, pa PONOVI ovjeru: dokaz pecen nad starim stablom vise
   ne vrijedi.
5. **Commitaj samo datoteku dokaza** (`git commit --only docs/generated/RELEASE_PROOF.json`) i
   potvrdi svjezinu bez ponovne visesatne gradnje:

   ```powershell
   npm run release:proof-gate -- --proof-only
   $env:LEKTA_REQUIRE_RELEASE_PROOF = "1"; npm run release:proof-gate -- --proof-only
   ```

   Prva je MEKA: nalaz je upozorenje i izlaz je 0, ali zavrsni redak tada glasi `NIJE POTVRDJENO`,
   nikad `OK`. Druga je TVRDA: i `ZASTARJELO` i `NE ZNAM` su pad.

   `--proof-only` je ovdje obavezan, i to nije ustupak nego tocnost: `dist/build-info.json` nastaje
   tek u koraku 6, pa bi puni gate u ovoj tocki uvijek pao na slucaju (a), uz poruku koja salje u
   krivom smjeru (`npm run build-info nije prosao?`). Ako je `dist/` preostao od ranije gradnje, pao
   bi na (b), jer taj artefakt nosi commit PRIJE proof-only commita koji si upravo napravio. Pitanje
   ovog koraka je samo je li otisak stabla jos isti, i zastavica mjeri tocno to: (c), (d) i (e) i dalje
   padaju. Identitet artefakta se mjeri u koraku 6, gdje artefakt postoji; `verify-deploy-dist` ovu
   zastavicu odbija, pa se preskakanje ne moze prosiriti na objavu.

   Dokaz smije upucivati na PRETHODNI commit istog sadrzaja; to je valjano samo uz istu dokazanu
   `treeDigest` vrijednost, i tocno to gornja naredba mjeri.
6. **Produkcijsku gradnju izvedi uz** `DEPLOY=1`, `LEKTA_REQUIRE_RELEASE_PROOF=1` i ispravan
   `LEKTA_SITE_ORIGIN`, kroz jedan lanac:

   ```powershell
   node scripts/build-production.mjs
   ```

   `build-info` korak u tom lancu upisuje `dist/build-info.json`, a zavrsni `verify-deploy-dist`
   provjerava da taj zapis nosi SHA stabla koje se stvarno gradi, ukljucujuci proof-only commit iz
   koraka 5. `npm run build` sam ne izradjuje generirane stranice i ne prolazi kroz gate.

   Tek POSLIJE ovog koraka ima smisla i puni gate bez zastavice (`npm run release:proof-gate`), jer
   artefakt tada postoji; on je u lancu ionako vec prosao, pa je to samo brza ponovna provjera.
7. **Nakon promocije potvrdi objavljenu verziju**, iz checkouta stvarno objavljenog izdanja:

   ```powershell
   $lektaReleaseSha = git rev-parse HEAD
   npm run post-deploy-smoke -- --require-build-info --expect-commit $lektaReleaseSha --strict-commit
   ```

   Tri zastavice, tri razlicite tvrdnje, i nijedna ne zamjenjuje drugu:

   - `--expect-commit <sha>` sam po sebi je PERIODICKI NADZOR (cron salje `github.sha` mastera).
     Neslaganje je upozorenje, izlaz 0. Tako je namjerno: zakljucana objava zaostaje za masterom, a
     stalna crvena bi se naucila ignorirati.
   - `--require-build-info` cini 404 na `build-info.json` padom. Hvata objavu stariju od
     `write-build-info`, ali NIKAD krivi sha.
   - `--strict-commit` je provjera KONKRETNE objave: drukciji sha je pad, i nepoznat identitet je pad.
     Bez nje "strogi smoke odbija pogresnu verziju" ne bi bilo istina.

   HTTP 200 bez ove provjere nije dokaz da je objavljeno zeljeno izdanje.
8. **Ako pilot ili zavrsna provjera promijene sadrzaj**, vrati se na pocetak potrebne ovjere.
   Promjena se NE pokriva starim potpisom.

## Naredbe koje ovaj lanac koristi

| Naredba | Sto odgovara |
|---|---|
| `npm run release:check -- --dry-run` | Popis razina i njihova dostupnost; nista se ne pokrece. |
| `npm run release:check` | Vrti sve razine i pece `docs/generated/RELEASE_PROOF.json`. |
| `npm run release:proof-gate -- --proof-only` | SAMO dokaz izdanja (c, d, e), bez identiteta artefakta; jedina koja radi PRIJE gradnje (korak 5). |
| `npm run release:proof-gate` | Dokaz izdanja I identitet artefakta, bez ostalih provjera `dist/`; trazi vec izgradjen `dist/` (poslije koraka 6). |
| `npm run tier2-freshness` | Je li Tier 2 (Word) dokaz uopce potrebno ponoviti. |
| `node scripts/build-production.mjs` | Stvarni produkcijski lanac (korak 6). |
| `npm run post-deploy-smoke -- ...` | Provjera zive instalacije (korak 7). |

## Sto ovaj dokument NE pokriva

- **`ux-dist` kao obavezna razina.** Danas je `required: false` (Playwright nad `dist/` kroz
  `vite preview`), dok se ne izmjeri stabilnost. Obaveznih razina je sedam, ne osam.
- **`extraction` probe.** Ostaje posebno imenovan sigurnosni dokaz, `required: false` od 2026-09-06
  (staging Supabase se na besplatnom planu sam pauzira). Ne smije se presutno vratiti u obavezni
  svaki-build gate; obrazlozenje i put natrag stoje uz razinu u `scripts/release-tiers.mjs`.
- **Netlify konfiguracija i sama promocija.** Objava je zakljucana i radi se rucno.

Kad se bilo koja od te tri stavke promijeni, ovaj dokument se mijenja s njom: koraci 3, 5 i 7 tada
vise ne opisuju stvarno ponasanje skripti.

## Gdje su dokazi da ovo grize

- `tests/release-gate-core.test.ts` - svih pet negativnih slucajeva nad stvarnim datotekama i pravim
  git stablom, svaki uz baseline.
- `tests/release-gate-cli.test.ts` - iste tvrdnje kroz PRAVE procese (`node scripts/...`), pa se mjeri
  izlazni kod i poruka, ne samo povratna vrijednost.
- `tests/post-deploy-smoke-strict-commit-cli.test.ts` - strogi i blagi mod nad pravim lokalnim
  posluziteljem, oba smjera.
- `tests/gate-mutations.test.ts` - mutacije `objava/*` i `nadzor/*`.
- `tests/release-gate-wiring.test.ts` - da lanac objave zove PUNI gate (bez `--proof-gate-only` i bez
  `--proof-only`), da cron nadzor ostaje blag, i da ovaj dokument i `docs/quality/release-readiness.md`
  ne propisuju dvije razlicite naredbe za isti korak.
