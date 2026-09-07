# katedra-verifier (service/)

Deterministički verifikator koraka za Katedra app. Isti obrazac kao Lekta `workers/field-renderer`:
privatni HTTP servis u Dockeru, tajni header, bez baze, bez trajnog stanja, **bez modela**.
Jedan poziv = jedan privremeni projekt s `.katedra/` koji se briše na kraju. Tekst rada ne
ostaje na disku i ne ide u log.

## 1. Što radi

`POST /v1/verify` primi `ManuscriptV1` (Katedra app `lib/manuscript/types.ts`), profil iz Lektinog
katedra-packa, artefakte plana koje je student odobrio u appu i (opcionalno) zamjerke mentora, pa:

1. `manuscript_to_katedra.py`: Tiptap sekcije → `.katedra/poglavlja/NN-slug.md`, `sources[]` →
   `izvori.json`, meta → `stanje.json` (kroz `stanje_init.py`, ne ručno), pack hint →
   `resolved_profile.json` (status `nepotvrdeno`, provenance `katedra-pack`), `dijelovi.py --sij`,
   `zamjerke.json`, i za odobren plan: `perspective_map.py` + `plan_state.py init/import/odobri`.
2. za faze osim `plan`: `build_docx.py --rukopis` → `rad.docx` (skripte koje čitaju `.docx` to trebaju).
3. `gate.py --faza <plan|pisanje|audit|predaja> --json`, sa **skriptama forme isključenima**
   (`ISKLJUCENI_KORACI` u `app.py` → `gate.py --iskljuci korak=razlog`; forma je Lekta, ustav §1).
   Isključeni korak se ne pokreće, u `gate.json` stoji kao `iskljuceno` s razlogom i ne blokira
   (`issues[].code = gate_step_excluded`, `blocking: false`). Isporučena inačica slala je te korake
   kroz `--dopusti-preskok`, koji oprašta samo korak kojemu **fali ulaz** — s izgrađenim `rad.docx`
   forma se vrtjela, `literatura` je pukla i `audit`/`predaja` su bili `failed` (izmjereno 7. 9. 2026.).
   `evidence` od v1 dobiva ulaz iz `claims_bridge.py` (`DOPUSTENI_PRESKOCI` je prazan).
4. `gate_mapping.py`: `gate.json` → `VerificationResultV1` (`verified | needs_revision | blocked | failed`,
   `issues[]` s `code`, `step`, `message`, `blocking`). Nikad tiho: svaki korak koji nije `ok` je issue.
   Bez `gate.json` rezultat je `failed`, nikad `verified`. Isto i kad `rad.docx` nije izgrađen u fazi
   koja ga treba: koraci nad dokumentom bi se preskočili, u fazi `pisanje` su savjetni, i rezultat je
   bio `verified` uz 5 od 9 preskočenih koraka (izmjereno 7. 9. 2026.) — sada `failed` s `verifier_error`.

Redoslijed je bitan: `mod=audit` i `mod=predaja` upisuju se u `stanje.json` **tek nakon** gradnje
`rad.docx` (`stanje_init.py` odbija `mod=audit` bez gotovog rada — s pravom). Isporučena inačica ga je
postavljala prije, pa je agent `review` padao na svakom pozivu; `export` je padao na Windows konzoli
(cp1250) jer `subprocess.run` nije imao `encoding=` (katedra-lite kvar 119). Oba popravljena, testovi
sada pokrivaju sve četiri faze.

`POST /v1/build` vrati `.docx` iz istog rukopisa (za export agenta; tehničku provjeru radi Lekta).

## 2. Ugovor

```
POST /v1/verify?wait=0|1        header: x-katedra-worker-token
{
  "runId", "stepId", "agent": "intake|sources|structure|planning|writing|citation|review|export",
  "attempt": 1,
  "manuscript": ManuscriptV1,
  "profile": DoctrineProfileHint | null,        # iz appa (planirano lib/agents/pack-profile.server.ts; u repou katedra 7. 9. 2026. te datoteke još nema)
  "planApproved": bool,                          # planning korak verified + student odobrio
  "plan": { "thesis", "question", "perspectives": [{label, position, why}],
            "chapters": [{sectionId, pages, content, sources: [sourceId]}] },
  "mentorComments": [{id, author, text, location, kind, resolved, resolvedWhere, date}],
  "agentResult": AgentResultV1 | null,          # claims[] hrani strict evidence gate
  "sectionId": "s2"                              # opcionalno, chapter za claim ledger
}
-> 202 {"jobId"}  ili s wait=1 -> 200 {"status":"done","result":{...}}
GET /v1/verify/{jobId} -> {"status":"queued|running|done","result"?}
```

Faza gatea po agentu: intake/sources/structure/planning → `plan`; writing/citation → `pisanje`;
review → `audit`; export → `predaja`. `phase` u zahtjevu prepisuje.

## 3. Lokalno

```bash
pip install -r service/requirements.txt
KATEDRA_VERIFIER_TOKEN=dev python3 -m pytest -q service/tests
KATEDRA_VERIFIER_TOKEN=dev uvicorn service.app:app --port 8080
```

`bin/testovi.sh` vrti `service/tests` kao skupinu „servis: katedra-verifier”. Testovi koji dižu `app.py`
traže `fastapi`; bez njega su **preskočeni i tako ispisani** (`-rs`), ne prolaze tiho. Na stroju bez
`fastapi` skupina mjeri pretvorbu rukopisa i preslikavanje gatea, ne kraj do kraja.

Docker (iz korijena katedra-pkg): `docker build -f service/Dockerfile -t katedra-verifier .`
Deploy kao field-renderer: Cloud Run, 2 GiB, timeout 600, concurrency 1, secret `KATEDRA_VERIFIER_TOKEN`.

## 4. Što app mora poslati da gate ima smisla

Ovo je nalaz, ne mana servisa: paket odbija odobriti plan bez teze, dviju perspektiva, opisa sadržaja
i planiranih izvora po poglavlju, a `ManuscriptV1` te podatke **nema**. Zato `plan` u zahtjevu.
Izvor tih polja u appu su izlazi `structure` i `planning` agenata (doktrina ih traži u točno tom obliku);
app ih mora spremiti uz projekt (run-context payload), ne samo prikazati. Bez toga faza `pisanje`
za završni i diplomski radi u modu `novi-rad` i gate to prijavi.

## 5. v0 ograničenja (namjerna)

- `evidence` (strict evidence gate) više NIJE preskok: `claims_bridge.py` uzima `AgentResultV1.claims[].support[].quote`
  po izvoru kroz `evidence_ingest.py`, tvrdnje kroz `claim_ledger.py add/link`. Tvrdnja bez potpore blokira
  korak. Ograda: quote koji je model napisao nije dokaz da izvor to kaže; to prije ovoga provjerava
  Katedrin passage verifier (`passage-verification.ts`). Ovdje se samo prevodi u oblik gatea.
  Zahtjev bez `agentResult.claims` ostavlja korak preskočenim i on blokira — nalaz o zahtjevu, ne o servisu.
- `motor_audit` (rad-audit A do G) je isključen jer miješa formu (tipografija, polja) i sadržaj
  (citati, brojke). v1: `engine.py` s izborom faza B i C.
- Jobovi su u memoriji procesa (kao field-renderer): jedan uvicorn worker, `--concurrency 1` na
  Cloud Runu. Za više instanci status treba u Supabase (`agent_steps.last_verification`), što app
  ionako piše.
- Profil je `nepotvrdeno` po dizajnu; nijedan korak forme se ne pokreće, pa status profila ne utječe
  na rezultat.

## 6. Ožičenje u Katedra app

`worker.ts`: `verify` postaje async i dobiva run-context; poziva `POST /v1/verify?wait=1` s
`KATEDRA_VERIFIER_URL` i `KATEDRA_VERIFIER_TOKEN` (isti obrazac kao `FIELD_RENDER_WORKER_URL` u Lekti).
Rezultat: `status` i `issues` u `VerificationResultV1`; `gate` sažetak u `last_verification` (bez teksta rada).
`issues[].code` vrijednosti `gate_finding | gate_step_skipped | gate_step_excluded | gate_step_failed | verifier_error` treba
dodati u union u `contracts.ts` (koordinirano s Lektom jer `last_verification` ide u zajedničku tablicu).
