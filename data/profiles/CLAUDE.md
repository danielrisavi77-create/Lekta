# Profili i pravila

Ove upute vrijede za `data/profiles/**` i kod koji ih cita (`src/profiles/**`). Globalna pravila iz
root `CLAUDE.md` i dalje vrijede. Ugovor je u `docs/decisions/SOURCE_OF_TRUTH.md`, a postupak po
celiji u `docs/VERIFICATION_PIPELINE.md`; ovaj vodic ih ne ponavlja nego kaze sto se ovdje najcesce
pokvari. Profili i pravila su najcesca vrsta zadatka u `docs/agents/tasks.json`.

## Izvor istine

- `ruleEntries` u `data/profiles/<fakultet>/drafts/*.json` su autorski izvor. `rules` je naslijedjeni
  agregat; ne uredjuj ga rucno da bi test prosao.
- Analiza cita samo profil slozen kroz `src/profiles/compose-profile.ts`. Test koji cita sirovi
  `rules` mjeri mirror, ne proizvod.
- Identitet provjere je `check.id`, nikad hrvatski naslov.

## Bodovana vrijednost

- Bodovano pravilo ima izvor iz registra, snimku sa sha256, lokator i doslovan citat koji je podniz
  jednog odlomka snimke. Bez toga vrijednost ne boduje.
- `sourcePage` bez rucne potvrde ostaje `null`. Ne pogadjaj stranicu ni odjeljak.
- Studentski radovi nikad nisu izvor pravila, ni kao "primjer kako fakultet radi".
- Opseg: izvor za diplomske i zavrsne radove ne pokriva automatski specijalisticki ili doktorski rad
  (T76). Ako izvor ne imenuje vrstu rada, pravilo se degradira ili ostaje `identity-evidence-needed`.
- Modalitet (`obligation`, `recommendation` i ostali) stroj smije predloziti, ali ublazeni modalitet
  upisuje samo covjek (`src/citations/CLAUDE.md`).
- `status: "verified"`, `scored: true` i `verifiedBy` upisuje samo covjek. Agent draftira
  (`.claude/agents/rule-drafter.md`).
- `ocrTranscript` u registru upisuje samo vlasnik ili osoba koju imenuje.

## Raskorak i demotija

- Raskorak zive vrijednosti i tvrdnje ide u `data/verification/scored-value-drift.json`
  (`npm run scored-value-drift`); bodovanje se demotira dok vlasnik ne presudi.
- Izracun raskoraka ne smije citati vlastitu demotiju.
- Ratchetovi Upisnika smiju se samo smanjivati (`data/programs/upisnik-evidence-snapshot-ratchet.json`
  i zamrznuta osnovica u `tests/fixtures/`).

## Generirani artefakti

- Promjena drafta mijenja generirane projekcije (verified split, runtime mape, profile claims,
  completion ledger). Regeneriraj samo pogodjene, u cistom izoliranom stablu, u dva prolaza (drugi
  mora biti no-op), i commitaj izvor, artefakt i ratchet zajedno.
- Prije regeneracije drift artefakta usporedi broj provjerenih jedinica: manji broj znaci da je
  pipeline djelomicno pao, ne da je kvar nestao.

## Privatnost

- `data/**` je PROPRIETARY-DATA i ne ide u bundle; draft evidence i `verified-profiles.json` nikad u
  preglednik (`data/classification.json`, zadnje pravilo vrijedi).
- Ne uklanjaj `LEKTA-KANARINAC-*` ni top-level `kanarinac`; writeri cuvaju nepoznate top-level kljuceve.

## Prije PR-a

- `npm run verify:claims` i `npm run verify:source-hashes` uz izmjenu drafta ili registra.
- Za svaku izmijenjenu vrijednost: koji citat je dokazuje i na kojoj osi je motor cita.
- Pregled drugog providera: profili su zasticena staza (data/profiles i ruleEntries).
