# Autonomni kontroler: runbook

Kontroler je deterministicki Python program (`scripts/autonomy/`, samo standardna biblioteka) koji
svakih 60 minuta skupi signale, vodi red zadataka u SQLite-u i, kad je to dopusteno, pokrece postojeci
runner `scripts/agents/cli.mjs` pa provjere iz `npm run release:check`. Nista ovdje ne poziva model niti
pise na GitHub sam od sebe: to rade adapteri s vlastitim identitetom, koji su zadano iskljuceni.

Trenutacni nacin: **observe**. `publisherEnabled=false`. Nijedan modelski ni udaljeni write poziv se ne
izvodi dok vlasnik ne promijeni konfiguraciju IZVAN repozitorija i ne potvrdi profil naplate.

## Sto zivi gdje

| sto | gdje | napomena |
| --- | --- | --- |
| kod kontrolera | `scripts/autonomy/*.py` | policy, store, signals, worker, gate, publisher, report, cli |
| testovi | `scripts/autonomy/tests/` | `python -m unittest discover -s scripts/autonomy/tests -t . -p 'test_*.py'` (91 testova, ~20 s) |
| CI | `.github/workflows/autonomy-tests.yml` | standardni runner, bez tajni; vlasnik ga dodaje u required checkove |
| predlozak konfiguracije | `config/autonomy.example.json` | bez tajni; kopira se izvan repozitorija |
| efektivna konfiguracija | `%LOCALAPPDATA%\Lekta\autonomy\autonomy.json` (`LEKTA_AUTONOMY_HOME`) | agent je ne moze mijenjati iz worktreea |
| baza, status, artefakti | `LEKTA_AUTONOMY_HOME`: `autonomy.sqlite`, `status.md`, `status.json`, `doctor.json`, `last-tick.json`, `artifacts/` | izvan repozitorija |
| profil naplate | `LEKTA_AUTONOMY_HOME\billing-profile.json` | pise ga ISKLJUCIVO `doctor --write-profile` |
| kljuc provjerivaca | `LEKTA_AUTONOMY_HOME\verifier.key` | HMAC kljuc; radnik ga nema |
| inbox rucnih signala | `LEKTA_AUTONOMY_HOME\inbox\*.json` | JSON objekt ili popis u obliku signala (kind, location, symptom, source_revision, observed_at) |

## Naredbe

Iz korijena POUZDANE instalacije (pregledani checkout, ne kandidatov worktree):

```powershell
$env:LEKTA_AUTONOMY_HOME = "$env:LOCALAPPDATA\Lekta\autonomy"
python -m scripts.autonomy.cli doctor
python -m scripts.autonomy.cli status
python -m scripts.autonomy.cli tick --dry-run
python -m scripts.autonomy.cli tick
python -m scripts.autonomy.cli pause --reason "razlog"
python -m scripts.autonomy.cli resume
python -m scripts.autonomy.cli report
```

- `doctor`: verzije alata, prijave (Codex, Claude, gh), API kljucevi u okolini (samo imena), Word COM,
  disk i RAM, valjanost konfiguracije, OS izolacija. Nikad ne ispisuje vrijednost tokena.
  `--write-profile` zapisuje profil naplate; `subscription_verified` dolazi iz stvarnog `auth status`
  izlaza, a `extra_credits_disabled` i `model_included` postoje SAMO uz vlasnikove zastavice
  `--attest-extra-credits-disabled` i `--attest-models gpt-5.6-sol,sonnet`. Bez toga
  `billing_allowed` je False i nema modelskog poziva.
- `tick --dry-run`: skupi signale, ispise sto BI uslo u red; ne upisuje, ne uzima lease, ne zove model,
  ne otvara PR.
- `tick`: u `observe` upisuje signale i staje. U `propose` i `auto_low_risk` uzima najvise jedan posao
  (dnevni limit 3, 2 pokusaja po zadatku) i vodi ga planning -> implementing -> reviewing -> verifying ->
  ready_to_publish -> publishing, svaku fazu biljezi prije i poslije. `waiting_quota` i `needs_login` ne
  trose pokusaj, a od 2026-09-13 ni `no_ready_plan_task`, `implement_unsafe`, `provider_unusable` ni
  `no_tool_use` (vidi nize). Dnevni slot posla vraca samo ishod u kojem provider NIJE ni pokrenut.

### Sto se trazi prije ijednog poziva modela (od 2026-09-13)

- **Ciljni zadatak mora biti razrjesiv i `ready`.** Signal ga nosi u `scope.planTask` (oblik `T` + dvije
  znamenke); kontroler ga trazi u `docs/agents/tasks.json`, koji cita SAMO za citanje i nikad ne mijenja.
  Zadatak mora biti `ready` i sve ovisnosti `done`. Bez toga faza zavrsava kao `needs_human` uz razlog
  `no_ready_plan_task: ...`, BEZ poziva modela i bez potrosenog pokusaja. Do tog datuma je kontroler slao
  `planTask or "T00"` bez ijedne provjere: T00 je `done`, pa je plan trosio poziv modela, a implementacija
  je odmah padala u `prepareJob` na `T00 must be ready`. Signal iz CI-ja nema `planTask`, pa se ciljni
  zadatak zada kroz `inbox` izvor (`<home>/inbox/*.json`, `scope: {"planTask": "T17"}`).
- **Faza pregleda se tvrdi iz kontrolerove evidencije, ne iz reda.** Kontroler pamti tko je implementirao
  zadatak u ISTOM ticku i prosljedjuje to `scripts/agents/cli.mjs prepare` kroz nove, strogo opcionalne
  opcije `--override-status in_review --override-implementer <agent>`. `prepareJob` ih primjenjuje samo u
  `review` grani; `implement` i dalje cita sirovi status iz reda, pa override nije put kojim bi se zaobisla
  provjera spremnosti. Pravilo "pregled trazi drugog providera" i dalje vrijedi. Bez tih opcija je rucni tok
  `npm run agents prepare/run` nepromijenjen. Kad kontroler nema zapis o implementatoru (npr. tick koji nije
  sam odradio implementaciju), pregled je `blocked` uz `implementer_unknown`; implementator se ne pogadja,
  jer bi pogodak mogao biti isti provider kao recenzent i tiho ugasiti pravilo o drugom provideru.
  Ciljni zadatak koji je napisan u obliku koji red ne poznaje (`t17` i `T17 ` se ISPRAVLJAJU, `T7` i `T017`
  ne, jer bi to bilo pogadjanje) razlikuje se u razlogu: `planTask 'T7' nije u obliku Tnn`, a ne "signal nema
  planTask". Ispravak inbox datoteke se PRIMJENJUJE: isti otisak signala uz izmijenjen `scope` osvjezava zapis
  zadatka i vraca ga iz `needs_human` u red, pa sljedeci tick radi po ispravljenom cilju. Zadatak u `blocked`
  se time NE budi, a od 2026-09-13 ni onaj koji ceka covjeka iz razloga koji ispravak signala ne rjesava:
  budi se samo zaustavljanje na koje ispravak ODGOVARA (`no_ready_plan_task`), dok `PR ceka ljudski merge`,
  `dokaz nepotpun`, `commit_failed` i zaustavljanje bez zapisanog razloga ostaju gdje jesu. Inace bi dopisan
  `paths` unos u istoj inbox datoteci pokrenuo isti posao drugi put, uz tri nova poziva modela i drugi push.
  Budjenje pritom vraca `attempts` na nulu: bez toga zadatak sa `attempts` na stropu postane `queued` koji
  `claim` vise ne uzima (`attempts < max`) i nestane iz svakog upozorenja. Za taj slucaj `status.json` sada
  nosi `queuedOverAttemptLimit` i upozorenje `queued iznad stropa pokusaja: n`. Dnevni slot posla (`maxNewJobsPerDay`) se pritom VRACA, jer ga nije potrosio nijedan poziv
  modela; bez toga tri crvena workflowa iz izvora `ci` pojedu dan i posao s ispravnim `planTask` nikad ne
  dodje na red. Slot se ne vraca cim je provider u tom poslu jednom pokrenut.
- **Agent s pravom pisanja se ne pokrece u dijeljenom stablu.** Faza `implement` je popravkom iznad prvi put
  postala DOSTIZNA, a kontroler posao priprema kroz `prepare` (bez `--execute`), pa ga tri preduvjeta iz
  `scripts/agents/cli.mjs` ne bi dotaknula. Kontroler ih zato provjerava sam: vlastito radno stablo, feature
  grana, cisto stablo. Promasaj je `blocked` uz `implement_unsafe: ...`, prije poziva modela i bez potrosenog
  pokusaja.

  Tri stvari o tom gardu koje je izmjerila tek provjera 2026-09-13, i koje su sve tri bile kvar:

  1. **Mjeri se prije PLANA, ne prije implementacije.** Inace posao koji nikako ne moze proci svejedno plati
     puni poziv modela i dnevni slot, a uz `maxNewJobsPerDay=3` to je do tri uzaludna poziva dnevno.
  2. **Cistoca se trazi samo na PRVOJ fazi posla.** Poslije nje stablo prlja sam kontroler (implementacija
     pise datoteke), pa bi ista provjera oborila pregled vlastitog posla. Preostala dva preduvjeta vrijede na
     svakoj fazi.
  3. **`workerRepoPath` je izricit kljuc konfiguracije** (`config/autonomy.example.json`, zadano `null`).
     Deklarirano stablo smije biti i ZASEBAN KLON na feature grani, ne samo povezan `git worktree`; gard je
     prije usporedjivao `--git-dir` s `--git-common-dir` i odbijao klon, koji je posve siguran. Nedeklariran
     `workerRepoPath` znaci cwd, dakle instalacijski checkout koji Task Scheduler drzi na masteru, i taj se
     kao radnikovo stablo NE priznaje. Stanje se sada vidi unaprijed: `doctor.workerRepo` (staza, je li
     deklarirano, razlog blokade) i upozorenje `implementacija blokirana: ...` u `status.json`, umjesto da se
     saznaje iz prvog `blocked` ticka.
- **Kontroler commita SAMO ono sto je sam napisao, i to imenovanim stazama.** Commit ide POSLIJE pregleda a
  PRIJE klasifikacije; snimka promjena (`git status --untracked-files=all`) uzima se u tom istom koraku PRIJE
  commita, pa klasifikacija, verifikacija i objava i dalje vide sto je implementacija napisala (bez
  `--untracked-files=all` git novu mapu sazme u jedan redak `src/`, pa bi kontrolna datoteka u njoj prosla
  neprimijecena). Bez ikakvog commita se kontroler zakljuca poslije TOCNO jednog posla: nizvodni lanac mjeri
  necommitane promjene, nista ih ne sprema, a gard od sljedeceg posla trazi cisto stablo. Isto vrijedi za
  posao koji zavrsi PRIJE kraja (pregled odbio, kvota, blokada): ono sto je implementacija vec napisala
  sprema se jednako, uz `unfinished: true` u dnevniku.

  TRI OGRADE, i nijedna nije kozmetika. Izvedba od 2026-09-19 koja ih nije imala je ODBACENA jer je mjereno
  radila upravo stetu koju CLAUDE.md zabranjuje: posao odbijen PRIJE ijedne faze isao je kroz isti put, a
  `git add -A` je commitao covjekov necommitani rad pod kontrolerovom porukom, u zadanoj konfiguraciji
  (`workerRepoPath: null`) na master granu instalacijskog checkouta. Gard "cisto stablo" bi se time sam
  izlijecio i vise nikad ne bi okinuo.

  1. **Nikad `git add -A` ni `git commit` bez `--only`.** Commitaju se tocno staze iz snimke
     (`git add -- <staze>` pa `git commit --only ... -- <staze>`), pa tudja necommitana ILI vec stagirana
     datoteka ostaje izvan commita. Staza koja izlazi iz radnog stabla (apsolutna, `..`) je odbijena.
  2. **Sprema se samo ako je stablo na POCETKU posla bilo cisto i ako je faza `implement` stvarno pokrenuta.**
     Inace je ishod `skipped` uz razlog, nijedna git naredba koja pise se ne izvrsi, i stablo ostaje
     netaknuto. Radno stablo koje je gard proglasio necistim ostaje netaknuto i na drugom, i na svakom
     sljedecem ticku.
  3. **Pad ili odbijanje commita nisu uspjeh.** `failed` i `skipped` na kraju posla su `needs_human` uz
     `commit_failed: ...`; posao NE ide u objavu. Commit ne gura nista na daljinu, `git push` ostaje
     iskljucivo u izdavacu.
- **Svaki posao ima VLASTITU granu, a dokaz pokriva sve sto bi objava gurnula.** Grana `autonomy/<8 znakova
  id-a zadatka>` reze se od osnovice (`origin/<baseBranch>`, pa lokalni `<baseBranch>`) neposredno prije faze
  `implement`, dakle prije jedine faze koja pise i dok je stablo jos cisto. Grana istog zadatka koja vec
  postoji (drugi pokusaj) se PREUZIMA, ne reze ponovo, jer bi `checkout -B` tiho odbacio ono sto je raniji
  pokusaj spremio.

  Druga crta obrane: `changedPaths` u dokazu i u klasifikaciji nije samo radno stablo nego UNIJA radnog
  stabla i `git diff <osnovica>...HEAD`. Bez toga je (izmjereno 2026-09-19) posao koji je pregled ODBIO
  ostavljao commit na dijeljenoj grani, sljedeci posao je klasificirao i verificirao samo svoju snimku, a
  `git push` bi gurnuo oboje; `controlFilesChanged` bi ostao prazan i u nacinu `auto_low_risk` bi na master
  otisla izmjena `.github/` koju nijedna klasifikacija nije vidjela.

  Osnovica koja se ne moze razrijesiti je fail-closed: klasifikacija je `needs_human` uz `base_unresolved`,
  nikad `auto_low_risk`. Grana koja se ne moze preuzeti je `blocked` uz `job_branch_failed: ...`, bez
  potrosenog pokusaja.
- **Codex koji je zavrsio uz odbijen exec je `blocked`, ne uspjeh.** Kad se pojavi potpis neupotrebljive
  izvrsne okoline (`apply deny-read ACLs`, `Failed to create unified exec process`), verdict je `blocked` uz
  razlog `provider_unusable: codex sandbox`, i pokusaj se ne trosi. Trazi se u STDERRU (ondje su
  `codex_core::tools::router` redci iz izmjerenog artefakta) i u STDOUT NDJSON-u, ali ondje samo u `error`
  stavkama, dakle u greskama koje javlja sam CLI. Modelova poruka se preskace, jer model koji radi bas na tom
  kvaru istu frazu doslovno napise; izlaz naredbi se preskace, jer ovaj repozitorij frazu sada i sadrzi (ovaj
  runbook), pa bi agent koji ga tijekom plana procita inace bio proglasen blokiranim. Sandbox koji odbija
  svaki exec ionako ne moze proizvesti izlaz naredbe. Provjera ide prije `classify_stream` i prije parsiranja,
  jer model u tom stanju uredno posalje `turn.completed` (izmjereno 2026-09-13, artefakt
  `26ba9cf7-.../planning-f8994dab`).
- **Plan i pregled bez ijednog uspjesnog citanja ili izvrsavanja nikad nisu `needs_verification`.** Mehanizam
  ima vlastiti brojac (`successful_tool_calls` u rezultatu radnika): broje se dovrsene NDJSON stavke koje nisu
  proza ni greska i koje nisu pale. Nula je `blocked` uz `no_tool_use: ...` i ne trosi pokusaj. Time je
  pokriven i oblik iz istog stvarnog loga koji nema poznat potpis (`timed out negotiating with the code-mode
  host`).

  GRANICA, da ne ostane precutna: brojac se moze izmjeriti samo iz codex NDJSON-a. Claude `-p --output-format
  json` vraca jedan sazetak bez popisa alata, pa je za njega brojac `None`, NEPOZNAT, i ne blokira nista;
  Claude kao recenzent (agent `opus`) tako i dalje moze proci vakuumski. Faza `implement` se ovim brojacem ne
  mjeri: promjenu datoteka dokazuju vrata provjere, ne popis poziva alata.
- `pause`: trajno (prezivi restart i novi proces); novi claim je nemoguc dok `resume` ne prodje.
  `resume` ne ponistava `needs_login`, `billing_unknown` ni zamrzavanje objava nakon povrata.
- `status` i `report`: `status.json` i `status.md` (zadnji poll, aktivni posao, brojaci, upozorenja
  poput `needs_login: claude`, `waiting_quota`, `Word unavailable`, `billing_unknown`). Bez procjene
  cijene tokena.

## Instalacija rasporeda (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\autonomy\install-windows.ps1 -RepoPath C:\put\do\pregledanog\checkouta
```

Task Scheduler: jedan primjerak (`MultipleInstances IgnoreNew`), svakih 60 min, u prijavljenoj
interaktivnoj sesiji (Word to trazi), apsolutna staza instalacije, bez povlacenja koda pri startu.
Uklanjanje: `scripts\autonomy\uninstall-windows.ps1` (brise samo zadatak, ne bazu ni dokaze).

Provjera nakon instalacije i nakon restarta racunala: `schtasks /Query /TN "Lekta Autonomy Tick" /V /FO LIST`,
pa `python -m scripts.autonomy.cli status` (zadnji poll mora napredovati) i `doctor` (prijave i Word).

**Neprovedeno u ovoj sesiji:** stvarna registracija zadatka, restart racunala i obnova Word sesije nisu
izvedeni (zahtijevaju vlasnikovu odluku o instalacijskoj stazi i budnom stroju). Zapisano kao
neprovedena provjera, ne kao prolaz.

## Ovlasti i izolacija (stanje)

- Radnik dobiva okolinu bez `ANTHROPIC_*`, `OPENAI_*`, `GITHUB_*`, `GH_*`, `NETLIFY_*`, `SUPABASE_*`
  varijabli (`worker.scrubbed_env`). Postavljen `ANTHROPIC_API_KEY` uz Claude poziv je `blocked`.
- Fable je iskljucen iz autonomnog rasporeda (`fableEnabled=false`, `SUBSCRIPTION_EXCLUDED_AGENTS`).
- Kandidat koji dira kontrolne datoteke (kontroler, CI, ratcheti, golden snimke, `package.json`,
  `netlify.toml`, `data/`, `supabase/`, upute agentima) je `needs_human`; promocija odbija svaki
  manifest s `controlFilesChanged`.
- OS izolacija radnika i izdavaca NIJE dokazana (isti Windows korisnik). Zato je `publisherEnabled=false`
  i `DefaultAdapters.publish` vraca `publisher_not_configured`. Priprema zakrpi i PR-ova moze ici u
  `propose`; produkcijska objava ostaje blokirana dok izdavac ne dobije zaseban identitet i token izvan
  radnikova dosega.

## Odvojen identitet izdavaca (preduvjet za `publisherEnabled: true`)

Izdavac (`scripts/autonomy/remote.py`) cita token iz DATOTEKE `LEKTA_AUTONOMY_HOME\publisher-token`, nikad iz
okoline procesa: radnikova okolina je ociscena od `GITHUB_*` i `GH_*` varijabli pa kandidatov kod token ne vidi.
Token mora pripadati ODVOJENOM GitHub identitetu (machine user ili fine-grained PAT ogranicen na ovaj repo, prava:
Pull requests read/write, Contents read/write, Metadata). Vlasnikov osobni `gh` login se NE koristi.

```powershell
Set-Content -NoNewline "$env:LOCALAPPDATA\Lekta\autonomy\publisher-token" "<token odvojenog identiteta>"
Set-Content -NoNewline "$env:LOCALAPPDATA\Lekta\autonomy\netlify-token" "<Netlify PAT>"
Set-Content -NoNewline "$env:LOCALAPPDATA\Lekta\autonomy\netlify-site"  "<site id>"
python -m scripts.autonomy.cli doctor   # publisher.githubTokenPresent; samo otisak, nikad vrijednost
```

Bez tih datoteka `publish` vraca `publisher_not_configured` i zadatak zavrsava kao `needs_human` s pripremljenom
granom. I s tokenom, merge se dogadja SAMO u `auto_low_risk` nacinu uz potpun dokaz, zelene obvezne provjere na
aktualnom headu i nepomaknut master; `propose` otvara PR i staje. Uklanjanje datoteke odmah gasi izdavaca.

## Dokaz i objava

- `gate.verify_candidate` pokrece `npm run release:check` (kroz ubrizgani runner), cita
  `docs/generated/RELEASE_PROOF.json`, racuna `treeDigest` iz `git ls-tree -r <kandidat>` (isti algoritam kao
  `scripts/release-proof-core.mjs`, izmjereno identican otisak) i slaze potpisan manifest.
- Pouzdani loader (`gate.load_evidence`) SAM racuna `signature_verified`, `hashes_verified`,
  `policy_current`; polja iz datoteke se ignoriraju. `promotion_allowed` trazi sve to, `complete:true`,
  `proofComplete:true`, svjez `treeDigest`, tocan `candidateSha`, nula kontrolnih datoteka i `pass` na
  svakoj obveznoj razini (`requiredReleaseTiers`: check, conformance, slow, ux, strict-open, word, word-worst).
  `skipped`, `unavailable` i nedostajuca razina su `unknown` i blokiraju.
- Izdavac (`publisher.publish_verified`): idempotency kljuc iz (repo, candidateSha, policyVersion); prvo
  cita udaljeno stanje (pad izmedju mergea i lokalnog zapisa ne ponavlja objavu), zatim zastitu grane,
  obvezne checkove na aktualnom headu, pomak mastera (`stale_base`), dnevni limit objava, pa merge s
  ocekivanim headom. Nedostupan API je `unknown`, nikad uspjeh.
- Nadzor (`observe_deployment`) i povrat (`rollback_verified`): jedan povrat na zadnji verificirani
  kompatibilni artefakt, smoke poslije, pa `publish_frozen` dok vlasnik ne razjasni uzrok. Migracije
  baze i backend se ne vracaju automatski.

## Postupno ukljucivanje (Zadatak 8)

| korak | uvjet za prijelaz | stanje |
| --- | --- | --- |
| observe | najmanje 24 h i 3 uspjesna polla bez AI/write akcija; deduplikacija i odsutnost privatnih podataka dokazane u testovima (`test_signals`, `test_store`) | raspored jos nije instaliran; 24 h promatranja nije proslo |
| propose | 3 stvarna mala zadatka do PR-a s neovisnim pregledom; simulacije pada procesa, isteka prijave, quota limita, pomaka mastera, missing Word, stale proof i rollbacka | simulacije POSTOJE kao testovi (`test_worker`, `test_cli`, `test_publisher`, `test_gate`); stvarni zadaci nisu izvedeni |
| auto_low_risk | samo `autoLowRiskPathPrefixes` (docs/, src/ui/, src/routes/, tests/ux/), do 5 datoteka i 200 redaka, izdavac s odvojenim identitetom | nije aktivno; `publisherEnabled=false` |

Prijelaz se radi promjenom `mode` u efektivnoj konfiguraciji izvan repozitorija, nikad u agentovu patchu.
