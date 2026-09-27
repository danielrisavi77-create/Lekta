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
Zato vrijedi sve od navedenog, i svaka stavka ima svoj razlog:

- **Workflow nema `pull_request` ni `pull_request_target` trigera.** Pokrece ga samo `push` na
  `master` ili `release/**` i rucni `workflow_dispatch`; oba traze pravo pisanja.
- **Job ima uvjet** `github.event.repository.fork == false && github.repository == 'danielrisavi77-create/Lekta'`.
- **Porijeklo commita:** prije ijednog koraka koji izvrsava kod iz stabla provjerava se da je
  commit na nekoj grani ovog repozitorija. SHA iz fork PR-a se odbija.
- **Nula tajni i token samo za citanje** (`permissions: contents: read`).
- **Gard:** `tests/ci-workflow-triggers.test.ts` (`findSelfHostedProblems`) rusi CI ako BILO KOJI
  drugi workflow zatrazi `self-hosted`, ako se doda fork trigger, makne fork uvjet, prosiri token
  ili spomene `secrets.`. Mutacije su u `tests/gate-mutations.test.ts`.

Gard stiti samo datoteke u repou. Netko moze u fork PR-u dodati VLASTITI workflow s
`runs-on: self-hosted`. Zato je obvezna i postavka repozitorija:

1. GitHub, repozitorij Lekta, **Settings > Actions > General**.
2. Pod "Approval for running fork pull request workflows from contributors" odaberi
   **Require approval for all external contributors**.
3. Nikad ne odobravaj run fork PR-a koji dira `.github/workflows/`, a da ga nisi procitao.

Stroj:

- Runner radi pod **obicnim korisnickim racunom bez administratorskih prava**.
- Na tom racunu nema osobnih dokumenata, spremljenih lozinki ni prijava (preglednik, OneDrive)
  koje ne smiju procuriti.
- Runner ne dobiva nikakve tajne; ne dodaji ih ni kao varijable okoline na stroju.

## 2. Priprema stroja

1. Instaliraj **Node.js 24** (https://nodejs.org, LTS instalacijski paket).
2. Instaliraj **Git for Windows** (https://git-scm.com). Nakon instalacije dodaj
   `C:\Program Files\Git\bin` u PATH korisnika (Postavke sustava > Varijable okruzenja > Path).
   Workflow koristi `bash` iz te mape; preflight korak javlja gresku ako ga nema.
3. Provjeri Word iz PowerShella (prijavljen kao korisnik runnera):

   ```powershell
   powershell -c "(New-Object -ComObject Word.Application).Version"
   ```

   Ocekivano: broj verzije, npr. `16.0`. Otvori Word jednom rucno i zatvori sve dijaloge prvog
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
3. **Ne instaliraj runner kao Windows servis.** Servis radi u izoliranoj sesiji 0, u kojoj
   Microsoft ne podrzava automatizaciju Officea; Word COM ondje visi ili pada bez poruke. Runner
   mora raditi u prijavljenoj korisnickoj sesiji:
   - Task Scheduler > Create Task; okidac **At log on** za korisnika runnera;
   - akcija `C:\actions-runner\run.cmd`, "Start in" `C:\actions-runner`;
   - "Run only when user is logged on"; bez "Run with highest privileges";
   - po zelji ukljuci automatsku prijavu tog korisnika nakon ponovnog pokretanja stroja.
4. Na stranici **Settings > Actions > Runners** runner mora biti **Idle** (zeleno).

## 4. Pokretanje

- **Automatski:** svaki push na `master` ili `release/**` vrti cetiri Word razine
  (`npm run release:check -- --only=word,word-worst,word-corpus,word-toc`, oko 10 minuta).
- **Rucno:** Actions > word-proof > Run workflow:
  - `ref`: grana, tag ili commit (zadano `master`);
  - `razine`: `word` (cetiri Word razine) ili `sve` (puni `npm run release:check`, oko 70 minuta).
- **Rezultat:** artefakt `word-proof-<run id>` sadrzi `docs/generated/RELEASE_PROOF.json` i puni
  log. Uz `word` dokaz je `partial: true`; potpun (`complete: true`) moze biti samo uz `sve`.
  Artefakt se ne commita automatski: koordinator ga usporedjuje s lokalnim dokazom i odlucuje.

## 5. Kad nesto ne radi

| Simptom | Znacenje |
| --- | --- |
| Job stoji na **Queued** | nijedan runner s oznakama `self-hosted, windows, word` nije Idle (stroj ugasen, runner nije pokrenut, korisnik nije prijavljen) |
| Preflight pada na `New-Object -ComObject Word.Application` | Word nije instaliran ili aktiviran za tog korisnika, ili ceka dijalog prvog pokretanja |
| Preflight pada na `Get-Command bash` | `C:\Program Files\Git\bin` nije u PATH-u korisnika runnera |
| "Commit ... nije ni na jednoj grani" | `ref` pokazuje na commit izvan ovog repozitorija (npr. fork PR); namjerno odbijeno |
| Job skipped | pokrenut je u forku ili drugom repozitoriju; namjerno |
