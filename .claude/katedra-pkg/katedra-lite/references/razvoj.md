# Razvoj i održavanje Katedre (NE učitava se tijekom rada sa studentom)

> Ovo je referenca za onoga tko MIJENJA Katedru, ne za vođenje rada. U modu 1–6 se
> ne otvara. Stajala je u `SKILL.md`, dakle u svakom razgovoru, i trošila kontekst
> na sadržaj koji student nikad ne treba.

## Routing contract evals i benchmark — samo u razvojnom checkoutu

`eval_runner.py`, `benchmark_runner.py`, `agent_policy.py`, `interaction_policy.py` i
`originality_eval.py` **nisu u isporučenom paketu od v1.3**. Razlog je da `tests/` i
`evals/` ionako nisu isporučeni, pa su te skripte bez svojih gold-setova bile mrtve —
nijednu nije pozivao runtime, a nezavisni audit (`docs/audit.md`, Q16) preporučio je
brisanje `benchmark_runner.py` i `agent_policy.py` izrijekom.

U razvojnom checkoutu one i dalje postoje i vrijede ista pravila kao prije:

* prije promjene frontmatter triggera, intake logike ili routing tablice pokreni
  `eval_runner.py --lane all` nad `evals/triggers/cases.jsonl` i `evals/workflows/cases.jsonl`;
* cross-version routing benchmark (`benchmark_kind=deterministic_contract`) koristi frozen
  `evals/benchmark/v1_vs_v2_contract.json` i **nije LLM/model benchmark**;
* default arhitektura je **single orchestrator**. Više agenata / swarm nije dopušten samo
  zato što je tehnički moguć: policy je u `evals/benchmark/agent_policy.json` i traži
  materijalni accuracy gain, najmanje dva oporavljena gold slučaja, **0 regresija**, te
  deklarirane cost/latency omjere unutar budžeta. B18 v1→v2 benchmark uspoređuje dvije
  single-orchestrator verzije i **nije dokaz za swarm**.

Ograničenje koje audit imenuje, i koje ostaje otvoreno: gold set za routing bio je kuriran
**iz implementacije matchera**, a ne iz frontmatter opisa koji host stvarno čita, pa je taj
lane samopotvrdan. Prije nego se na njega osloni ijedna odluka, slučajeve treba generirati iz
citiranih fraza u opisu.

### Nova provjera koju razvoj mora pokrenuti (v1.3)

Registar dijelova mora ostati u koraku sa stvarnim profilima:

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --sij --profil <resolved>.json --tip <tip>
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --status
```

Redak „⚠️ profil traži dijelove koje registar ne poznaje" je **blokirajući nalaz za
maintainera**, ne za studenta: znači da os dijelova zaostaje za profilom. Pokreni ga nad
svakim admitiranim profilom kad se doda fakultet ili overlay.

### Faculty scale-out gate

Novi fakultet/profil **ne postaje podržan samo dodavanjem `<slug>.json`**. Production registry
čita `_support_catalog.json`; admission se dobiva samo nakon readiness gatea:

```bash
python3 <KATEDRA_SKILL>/scripts/faculty_scale_gate.py \
  --fakultet <slug> --tier <pilot|production> --as-of YYYY-MM-DD --json
```

Prije `--admit` moraju proći schema, routing, provenance, `evals/quality/faculty_cases.jsonl`
i B18 core benchmark ako postoji (bez njega gate prolazi uz ⚠ „admisija bez benchmarka”, kvar 32). `production` dodatno zahtijeva `status: potvrdeno` i fresh provenance.
Nakon PASS-a, admission/regeneration je **maintainer-only** postupak u writable source checkoutu, ne runtime mutacija instaliranog skilla:

```bash
python3 <KATEDRA_SKILL>/scripts/faculty_scale_gate.py \
  --fakultet <slug> --tier production --as-of YYYY-MM-DD --admit
python3 <KATEDRA_SKILL>/scripts/profile_registry.py --write
```

Promjena base profila ili pripadnog overlaya mijenja bundle hash i čini admission stale dok se gate ponovno ne pokrene.
**Zakrpa profila = ponovna admisija, u istom potezu.** U instaliranom paketu gate se ne može ponoviti
(`evals/` nije u paketu — ni benchmark ni cases), pa zakrpa ide s:

```bash
python3 <KATEDRA_SKILL>/scripts/profile_registry.py --write --bez-admisije   # hash osvježen, tier → advisory (kvar 32)
```

`advisory` znači: profil je u registryju, ali nitko mu nije ponovio gate. Vraća se na `pilot`/`production`
samo kroz `faculty_scale_gate.py --admit` u izvornom checkoutu. `profile_registry.py --check` je skupina u `bin/testovi.sh`.
Trenutno: **EFZG = advisory**, **FPZG = advisory** (bundle promijenjen u v1.9.3, gate nije ponovljen).

U svakoj isporuci navedi izvor: *„margine 25/25/30/25 mm (Upute za izradu diplomskog rada, str. 6)"*. **Zahtjev bez provenancea ne postoji.**
Production profil/overlay ima `provenance.default` i po potrebi `provenance.rules` keyed JSON Pointerom.
Najbliži pointer pobjeđuje; npr. `/format/odlomak/min_redaka` može biti `derived` i imati niži confidence od ostalih pravila iz istog dokumenta.

**Precedencija pravila** (jače nadjačava slabije):

1. Pisana uputa mentora ili katedre koju je korisnik priložio
2. Profil sa `status: potvrdeno`
3. Profil sa `status: nepotvrdeno` → koristi, ali svako pravilo označi **za potvrdu**
4. Ništa od navedenog → web search službenih uputa, pa defaulti iz 0.8 uz deklaraciju

**Zastarjelost.** Freshness je zaseban signal i **nikad automatski ne mijenja** `status: potvrdeno|nepotvrdeno`. Prije oslanjanja na profil provjeri provenance:

```bash
python3 <KATEDRA_SKILL>/scripts/provenance_report.py \
  --fakultet "<slug/naziv/alias>" --tip <tip> \
  --as-of YYYY-MM-DD --max-age-days 365 --json
```

`stale`, `unknown` ili `untracked` ide u „RUČNO PROVJERI"; potom, ako imaš web, provjeri postoji li nova službena uputa. Revalidation ažurira provenance tek nakon stvarne provjere izvora, nikad tijekom samog reporta.

**Dohvat službenih uputa.** Stranica fakulteta zna raditi HTTP 302 na Google Drive; WebFetch tada vraća samo navigaciju i izgleda kao da uputa ne postoji. Slijedi redirect, izvuci `fileId` i dohvati preko Drive konektora. Kad je dokument interno nedosljedan (npr. tekst upućuje na „PRILOG 2", a stvarni prilog je „PRILOG 1"), **mjerodavni su prilozi**, ne referenca u tekstu.

**Obavezna polja profila za stil i prijelom** (`references/fakulteti/<slug>.json`):

```json
"odlomak": { "min_redaka": 5, "max_redaka": 12 },
"prijelom_pred_poglavljem": true
```

`odlomak` čita `check_paragraphs.py` — bez toga nema praga za geometriju. `prijelom_pred_poglavljem: true` znači da `pageBreakBefore` na Heading 1 **nije** nalaz; bez toga audit prijavljuje propisano formatiranje kao grešku, a `apply_safe_fixes.py` bi ga (prije zakrpe) tiho uklonio.

Profil je **jedini izvor** citatnog stila, opsega, margina i obaveznih dijelova. Sve što o formatu piše u `references/pisanje.md` vrijedi samo kad profila nema.

### Servis `service/` (katedra-verifier)

HTTP servis za Katedra app, u korijenu paketa: rukopis (`ManuscriptV1`) → privremeni `.katedra/`
projekt → `build_docx.py` → `gate.py --faza … --json` → `VerificationResultV1`. Bez modela, bez
trajnog stanja; forma se ne provjerava (`gate.py --iskljuci`, forma je Lekta). Upute i ugovor:
`service/README.md`. Testovi: `service/tests` — skupina „servis: katedra-verifier” u
`bin/testovi.sh`; oni koji dižu FastAPI traže paket `fastapi`, bez njega su preskočeni i imenovani
(`-rs`), ne prolaze tiho. Docker slika kopira cijeli paket (`service/Dockerfile`).

`gate.py` ima dva imenovana izuzeća, oba s razlogom u `gate.json`: `--dopusti-preskok korak=razlog`
(korak kojemu fali ulaz smije ostati nepokrenut) i `--iskljuci korak=razlog` (korak se namjerno ne
pokreće; stanje `iskljuceno`, ne blokira; kvar 152). Nepoznato ime je u oba slučaja kod 2.

