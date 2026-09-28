# Word dokaz na vlastitom Windows stroju (self-hosted runner, T80)

GitHubovi runneri nemaju Microsoft Word, pa se Tier 2 razine (`verify:word`, `verify:word:worst`,
`verify:word:corpus`, `verify:word:toc`) i puni `RELEASE_PROOF` dosad vrte samo rucno na laptopu.
Workflow `.github/workflows/word-proof.yml` ih vrti na vlasnikovom drugom Windows racunalu
(Word aktiviran, stalno upaljeno), registriranom kao GitHub self-hosted runner s oznakama
`self-hosted, windows, word`.

Dok runner nije registriran, job stoji u stanju **Queued** (ceka stroj s tim oznakama). To nije
greska i ne blokira merge: `word-proof` nije obvezna provjera.

## 1. Sigurnost: repo je javan

GitHub izricito upozorava da self-hosted runner na javnom repozitoriju moze izvrsiti tudji kod.
**Granica pristupa stroju su postavke repozitorija iz odjeljka 6, ne workflow ni gard.** Workflow
i gard samo smanjuju rizik:

- Workflow ima samo `push` na `master` i `release/**` te rucni `workflow_dispatch`; oba traze
  pravo pisanja. Nema `pull_request`, `pull_request_target`, `workflow_call` ni drugih trigera.
- Job ima uvjet `github.event.repository.fork == false && github.repository == 'danielrisavi77-create/Lekta'`.
- **Porijeklo commita:** prvi korak nakon checkouta, prije ijednog koraka koji izvrsava kod iz
  stabla. Uz rucno pokretanje commit mora biti TOCAN trenutni vrh `origin/master` ili
  `origin/release/*`; povijesni commit, vraceni commit, tag ili SHA iz fork PR-a se odbijaju.
  Uz push commit mora biti bas commit tog pusha na `master` ili `release/*`.
- Nula eksplicitno proslijedjenih tajni i token samo za citanje (`permissions: contents: read`,
  `persist-credentials: false`). To nije potpuna izolacija: kod koji se izvrsi na stroju vidi
  datoteke i varijable okoline korisnika runnera.
- **Gard** `findSelfHostedProblems` u `tests/ci-workflow-triggers.test.ts` rusi CI ako:
  - `word-proof.yml` odstupi od tocno propisanog oblika (trigeri, grane bez tagova, `runs-on`,
    doslovni `if`, token, rijec `secrets` u bilo kojem obliku, redoslijed provjere porijekla);
  - BILO KOJI job u bilo kojem drugom workflowu ima `runs-on` koji nije jedna GitHub-hosted oznaka
    (`ubuntu-latest` i slicno). Gola `word`, `windows`, `self-hosted`, izraz `${{ ... }}` i runner
    grupa padaju. Mutacije su u `tests/gate-mutations.test.ts`.

Gard vidi samo datoteke u repou. Fork PR moze donijeti VLASTITI workflow koji cilja stroj, a
suradnik s pravom pisanja moze pokrenuti izmijenjenu verziju workflowa sa svoje grane. Zato
vrijedi odjeljak 6.

Stroj:

- Runner radi pod **obicnim korisnickim racunom bez administratorskih prava**.
- Na tom racunu nema osobnih dokumenata, spremljenih lozinki ni prijava (preglednik, OneDrive)
  koje ne smiju procuriti.
- Runner ne dobiva nikakve tajne; ne dodaji ih ni kao varijable okoline na stroju.

Odstupanje, prihvaceno 2026-09-27: runner `DESKTOP-LJMIVR9` radi pod vlasnikovim osobnim racunom
`Daniel`, na kojem su aktivne Claude prijave (u runu 36336507818 preflight je zabiljezio 14
`claude.exe` procesa). Kod koji se izvrsi na runneru vidi te prijave i datoteke racuna. Vlasnik je
2026-09-27 izravno odlucio da runner ostaje na tom racunu i prihvatio rizik; granica ostaju mjere 1
do 4 iz odjeljka 6. Administratorska prava racuna nisu provjerena. Iznimka vrijedi do lansiranja
(go/no-go 19. 10. 2026.), nakon toga ponovna odluka (T81); vlasnik je to izravno potvrdio 27. 9. 2026.

## 2. Priprema stroja

1. Instaliraj **Node.js 24** (https://nodejs.org, LTS instalacijski paket).
2. Instaliraj **Git for Windows** (https://git-scm.com) tako da je `git` u PATH-u korisnika
   runnera. **WSL / bash nisu potrebni**: `setup-deps` na Windowsu koristi `powershell`
   (WindowsApps `bash.exe` bez WSL-a pada s `WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED`).
   Dodaj i `C:\Program Files\Git\usr\bin` u PATH korisnika runnera: `actions/cache` na Windowsu
   pakira kroz Gitov `tar.exe -z`, koji trazi `gzip` iz te mape. Bez nje kes se nikad ne sprema
   (`gzip: command not found`, `Failed to save`), pa svaki run iznova vrti `npm ci`. S njom je run
   36346047897 spremio `node_modules` kes, a run 36348083630 ga je pogodio i preskocio `npm ci`.
   Nakon promjene PATH-a runner treba ponovno pokrenuti.
3. Provjeri Word iz PowerShella (prijavljen kao korisnik runnera). Primjer sam gasi Word, da ne
   ostavi proces:

   ```powershell
   $w = New-Object -ComObject Word.Application; try { $w.Version } finally { $w.Quit() }
   ```

   Ocekivano: `14.0` (Word 2010, referentni oracle na kojem su nastali svi Tier 2 dokazi). Otvori Word jednom rucno i zatvori sve dijaloge prvog
   pokretanja (licenca, privatnost), inace ih COM automatizacija ceka zauvijek.
4. Iskljuci spavanje i hibernaciju: Postavke > Sustav > Napajanje > Zaslon i spavanje > Nikad.
5. Za razine `sve` workflow sam instalira Deno, Python 3.12, `lxml` i Playwright chromium.
   Za zadani `word` nista od toga ne treba.

## 3. Registracija runnera

1. GitHub, repozitorij Lekta, **Settings > Actions > Runners > New self-hosted runner**,
   operativni sustav **Windows**, arhitektura **x64**. Stranica prikazuje naredbe i jednokratni token.
2. U PowerShellu, kao OBICAN korisnik:

   ```powershell
   mkdir C:\actions-runner; cd C:\actions-runner
   # preuzmi i raspakiraj paket tocno kako pise na GitHub stranici (Invoke-WebRequest + Expand-Archive)
   .\config.cmd --url https://github.com/danielrisavi77-create/Lekta --token <TOKEN_SA_STRANICE> --labels self-hosted,windows,word --unattended
   ```

   Token vrijedi kratko i sluzi samo za registraciju; ne sprema se nigdje.
3. Provjeri verziju runnera: `.\config.cmd --version` mora biti **2.327.1 ili novija**
   (`actions/checkout@v7` i `actions/setup-node@v7` je traze). Runner se inace sam azurira.
4. **Ne instaliraj runner kao Windows servis.** Servis radi u izoliranoj sesiji 0, u kojoj
   Microsoft ne podrzava automatizaciju Officea; Word COM ondje visi ili pada bez poruke. Runner
   mora raditi u prijavljenoj korisnickoj sesiji:
   - Task Scheduler > Create Task; okidac **At log on** za korisnika runnera;
   - akcija `C:\actions-runner\run.cmd`, "Start in" `C:\actions-runner`;
   - "Run only when user is logged on"; bez "Run with highest privileges";
   - po zelji ukljuci automatsku prijavu tog korisnika nakon ponovnog pokretanja stroja.
5. **Korisnik mora ostati prijavljen.** Zakljucavanje zaslona (Win+L) je u redu; odjava gasi
   runner i sve njegove procese.
6. Na stranici **Settings > Actions > Runners** runner mora biti **Idle** (zeleno).

## 4. Pokretanje

- **Automatski:** svaki push na `master` ili `release/**` vrti cetiri Word razine
  (`release:check --only=word,word-worst,word-corpus,word-toc`, pozvan izravno kroz `node` jer
  npm.ps1 na Windowsu proguta `--`; oko 10 minuta; uz
  checkout i `npm ci` bez kesa prvi run traje oko 30 minuta, a timeout joba je 60 minuta).
- **Rucno:** Actions > word-proof > Run workflow, s workflowom s grane `master`:
  - `ref`: `master` ili `release/<ime>`; mora biti tocan trenutni vrh te grane;
  - `razine`: `word` (cetiri Word razine) ili `sve` (puni `npm run release:check`, oko 70 minuta).
- **Rezultat:**
  - `word-proof-<run id>`: `RELEASE_PROOF.json` i `sazetak.txt`. Objavljuje se SAMO kad je dokaz
    nastao u tom runu za taj commit (commit jednak HEAD-u, `createdAt` nakon pocetka runa). Uz
    `word` dokaz je `partial: true`; potpun (`complete: true`) moze biti samo uz `sve`.
  - `word-proof-FAILED-<run id>`: samo `sazetak.txt`, kad svjezeg dokaza nema.
  - Sazetak sadrzi samo retke razina i ishoda, s redaktiranim putanjama i korisnickim imenom.
    Puni log NIJE u artefaktu (artefakte javnog repoa moze preuzeti svaki prijavljeni korisnik):
    ostaje na stroju u `%LOCALAPPDATA%\lekta-word-proof\logs\<run id>.log`.
  - Artefakt se ne commita automatski: koordinator ga usporedjuje s lokalnim dokazom i odlucuje.

## 5. Kad nesto ne radi

| Simptom | Znacenje i postupak |
| --- | --- |
| Job stoji na **Queued** | nijedan runner s oznakama `self-hosted, windows, word` nije Idle (stroj ugasen, runner nije pokrenut, korisnik odjavljen) |
| "Word vec radi u sesiji runnera" | u sesiji je otvoren Word (zaostali proces ili tvoj dokument). Run nista ne gasi: spremi i zatvori Word, u Task Manageru provjeri da nema `WINWORD.EXE`, pa pokreni ponovno |
| Job **cancelled** nakon isteka timeouta | koraci ciscenja i spremanja kesa se nisu izvrsili: u Task Manageru provjeri i zatvori `WINWORD.EXE`, inace sljedeci run staje u preflightu; sljedeci `npm ci` opet ide bez kesa |
| "Word proces iz ovog runa nije zavrsio" | automatizacija je zapela; zatvori `WINWORD.EXE` u Task Manageru prije sljedeceg runa |
| Preflight pada na `New-Object -ComObject Word.Application` | Word nije instaliran ili aktiviran za tog korisnika, ili ceka dijalog prvog pokretanja |
| Preflight pada na `git --version` | Git for Windows nije u PATH-u korisnika runnera |
| "Ovisnosti" svaki put vrti `npm ci`; u Post koraku `gzip: command not found` | `C:\Program Files\Git\usr\bin` nije u PATH-u korisnika runnera (odjeljak 2, korak 2); dodaj i ponovno pokreni runner |
| `Ovisnosti` pada s `WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED` | Stari `setup-deps` zvao je `bash`; na masteru mora biti verzija s `shell: powershell` na Windowsu |
| "nije tocan vrh origin/master ni origin/release/*" | `ref` pokazuje na stari commit, tag ili commit izvan ovog repozitorija; namjerno odbijeno |
| Job skipped | pokrenut je u forku ili drugom repozitoriju; namjerno |

## 6. Preostali rizik i mjere (Codex F1, F2, F4 na #162)

Tri rizika kod ne moze zatvoriti:

- **F1:** fork PR moze donijeti vlastiti workflow koji cilja stroj; gard ga ne vidi jer nije u repou.
- **F2:** `workflow_dispatch` pokrece verziju workflowa s grane koju odabere pokretac, pa suradnik
  s pravom pisanja moze pokrenuti izmijenjenu verziju bez provjera. Isto vrijedi za izmijenjeni
  workflow pushan na `release/**`.
- **F4:** `npm ci` i `release:check` izvrsavaju `package.json` i kod odabrane grane, ukljucujuci
  lifecycle skripte ovisnosti.

Zato runner u javnom repou stite **postavke**, i sve ove mjere moraju biti ukljucene PRIJE
registracije runnera:

1. **Jedini suradnik s pravom pisanja je vlasnik** (Settings > Collaborators).
2. **Settings > Actions > General**, "Approval for running fork pull request workflows from
   contributors": **Require approval for all external contributors**. Nikad ne odobravaj run fork
   PR-a koji dira `.github/`, `package.json` ili `package-lock.json` a da ga nisi procitao.
3. **Branch protection** (Settings > Branches) za `master` i `release/**`: PR obvezan prije
   mergea, ukljucen "Do not allow bypassing the above settings" (enforce admins).
4. **Rucni `workflow_dispatch` pokrece samo vlasnik**, i to samo s workflowom s grane `master`.
5. **Dugorocno:** izvrsavanje preseliti u zaseban PRIVATNI repozitorij koji prima samo provjereni
   SHA iz ovog repoa (uz T63). Tek tada je granica tehnicka, a ne organizacijska.

Vlasnik odlucuje hoce li se runner registrirati prije mjere 5, uz mjere 1 do 4.

Stanje 2026-09-27 prema koordinatoru lekta-32 (provjereno GitHub API-jem u 13:40, u sesiji
izvrsitelja NIJE neovisno provjereno): jedini suradnik s pravom pisanja je vlasnik; `master` ima
branch protection (PR obvezan, enforce admins, 6 obveznih provjera); odobrenje fork PR workflowa za
sve vanjske suradnike je ukljuceno; `release/**` dobiva ruleset (PR obvezan, bez force pusha i
brisanja). Vlasnik je 2026-09-27 odlucio da se #162 spaja uz mjere 1 do 4, a mjera 5 ostaje
biljeska u T80.

Word na runneru je 14.0 (Word 2010), isti kao na stroju lokalnog `RELEASE_PROOF` (T72); Word 2013 i
noviji nisu pokriveni ni na jednom stroju (vidi `docs/superpowers/specs/2026-08-23-real-docx-corpus-f1-f2.md`).
Prvi zeleni run: 36336507818 (commit 7e15d9ac), samo cetiri Word razine, sve PROLAZ.
