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
  trose pokusaj.
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
