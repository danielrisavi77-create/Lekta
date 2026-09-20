# Lekta — backlog orkestratora

**Vlasnik:** Grok Bot / Lekta Orchestrator (van T00–T47 implementacijskih sesija)  
**Datum:** 2026-09-20  
**Svrha:** pokriti posao koji `plan-do-live` / `tasks.json` **ne** tretira kao stalan: higijenu, PR triage, drift i slijepe točke.  
**Granica:** ne dira staging, migracije, Edge deploy, naplatu ni grane na kojima već netko aktivno piše (T18→T23 lanac).

## Aktivni ugovor

1. Postojeći program do livea ostaje u `docs/agents/tasks.json` i `docs/agents/plan-do-live-2026-09-12.md`.
2. Ovaj dokument je **dopuna**, ne treći sustav statusa produkta.
3. Orkestrator predlaže i radi higijenu/review; merge/deploy samo uz eksplicitni OK vlasnika (ili već dani standing order).

## Track A — Higijena plana

| Stavka | Status | Bilješka |
|---|---|---|
| T19 → `done` nakon PR #89 | u ovom PR-u | merge `701e122c` |
| Bilješka u AUDIT_MASTER / statusu za T19 rez 1 | pending | jedan red, bez dupliciranja cijelog plana |
| Nakon svakog bitnog mergea: sync `tasks.json` | standing | orkestrator |

## Track B — Vrt open PR-ova

Prioritet (ne P0 lanac):

| PR | Namjera | Status |
|---|---|---|
| #95 Dizajn-sustav (Z1–Z7) | review → merge ili lista blockerа | triage |
| #93 Autonomni kontroler | review; ne blokira live | triage |
| #88 / #40–#42 Dependabot | T41-adjacent; siguran bump | triage |
| #85, #59, stari draftovi | close ili rebase | kasnije |

## Track C — Drift radar

Ponavljajuće, samo report (bez deploya):

- javni `/build-info.json` vs `origin/master` SHA
- `RELEASE_PROOF` fresh/stale/unknown
- Edge „repo vs deployed“ za kritične funkcije (kad ima pristup)
- gitleaks fingerprint drift na PR granama

## Track D — Slijepe točke (nema T-paketa)

1. **Koordinacija sesija** — tko drži koju granu / worktree (AGENTS.md zahtijeva, nema boarda).
2. **Lekta ↔ Katedra ustav kao gard** — zabranjeni smjer istine / sadržaj u Lekti.
3. **Iskrenost copyja** — lokalna analiza vs backend claimovi.
4. **WordReplica / Academic IR ugovor** — dodirne točke, ne novi proizvod.
5. **Portfolio sync** — Maturiraj, katedra-pkg, pisac-editor (izvan T16–T47).
6. **Proizvodne SKU odluke** — T23 mapira; orkestrator bilježi nelogičnosti za vlasnika.
7. **„Što Lekta nije“** — acceptance za ograničenja proizvoda.

## Track E — Namjerno ne

Novi framework, novi agent sustav, pisanje sadržaja, 407 fakulteta, konkuriranje T18/T20/T21 sesijama.

## Ritam

- **Dnevno (rutina):** portfolio digest + GitHub alarmi.
- **Tjedno:** 1–2 PR triage; gap memo ako ima novo što T-plan ne vidi.
- **Nakon mergea:** sync ovog dokumenta + `tasks.json` gdje treba.

## Stanje 2026-09-20

- Spojeno: katedra-pkg #51 (Lite 2.0), Lekta #89 (T19 rez 1).
- T18+ rade **druge sesije** — orkestrator ne ulazi bez OK.
- Maturiraj #4 otvoren (billing RLS) — nije P0; čeka.
