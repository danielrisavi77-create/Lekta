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

## Audit 22. 9. 2026.

Vlasnikov audit od 22. 9. 2026. je uklopljen u `tasks.json` (T48 do T51, prosireni note na postojecim zadacima). Ovdje je samo redoslijed kojim kod treba ici, od prvog prema zadnjem:

1. Naplata, nalazi #3 i #4 (puni workflow, prije T24): webhook prihvaca samo order_created/paid i order_refunded, inbox pise prije provjere korisnika, needs_manual_link; jedno ime varijable za store ID u webhook-mor i create-checkout, uz preflight provjeru.
2. Nalaz #10 (puni workflow): ukloniti policy corpus_contributions_update_own u migraciji 0203 ili kasnije, dodati RLS test da je PATCH tudjeg zapisa odbijen.
3. Nalaz #11 (standard): unit, work i UTM parametri moraju preziviti prijelaz s pocetne stranice na /rad/.
4. Nalaz #12 (light): dijakritici u sucelju i test koji zabranjuje popis ASCII zamjena.
5. Nalaz #14 (puni workflow, docx): xmldom mora imati onError, osteceni document.xml vraca gresku umjesto ocjene.
6. Nalaz #13 (T19 follow up): staging noindex, isti build lanac kao produkcija, Node 24.

WordReplica (T51) namjerno nije u ovom redoslijedu: radi se skroz na kraju, zadnja, i za lansiranje ostaje iskljucena (REPAIR_LOCAL_ENABLED off).
