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

## Track F: dizajn-paket (design/handoff/ALIGNMENT.md), pitanja gdje nalog i kod proturjece

Pravilo vlasnika 2026-09-22: kad nalog i kod proturjece, kod se ne mijenja nego se pitanje zapisuje ovdje.
Grana: `design/pack3` (iz mastera 4c9b1400). Zapisuje orkestrator dizajn-paketa.

| # | Zadatak | Nalog kaze | Kod kaze | Sto je napravljeno | Pitanje za vlasnika |
|---|---|---|---|---|---|
| F1 | Z1 | "Nepoceto: Z1" (Stanje nakon synca) | `route-shell.css` na masteru vec zadovoljava provjeru iz Z1 (nula hex literala osim komentara, nema Georgia ni ui-monospace, nema tvrde offset sjene); PR #95, commit c51c8fee | Nista; Z1 tretiran kao gotov | Treba li Sync ponovo procitati route-shell.css, ili nalog pod Z1 misli na nesto drugo? |
| F2 | Z24 naspram Z11 | Jedna cijena: popravak 9,99 EUR po dokumentu, `slots_total 1`, `slot_window_days 7`; institucija na upit; migracija `products` | `src/report/pricing.ts` (izvor koji Z11 ucvrscuje) nosi cijene PO VRSTI RADA: seminarski 3,99 / zavrsni 5,99 / diplomski 9,99 / doktorski 24,99 EUR, prozor 7 ili 14 dana; racun na stolu (Z11) crta cijenu po vrsti rada; `packages.json` je Z11 vec obrisao | Z11 prenesen na pack3 bez izmjene; Z24 NE zapocet | Vrijedi li jedna cijena za sve vrste rada (i doktorski 9,99)? Ako da, tko pise migraciju `products` (prefiks od 0200, `supabase db push`) i kad? |
| F3 | Z8 pager | "Nalaz 1 od 6" doslovno iz predloska | `tests/desk-mount.test.ts` i `tests/desk-view.test.ts` prikivali "N / M" | ODLUCENO (orkestrator): natpis promijenjen na "od", dva testa PRIKAZA prilagodjena; modeli netaknuti | Potvrda da je to bio ispravan smjer (testovi su mjerili prikaz, ne model) |
| F4 | Z6 | Panel nudi gustocu i velicinu teksta | Gustoca nema tokene (Z4 odbijen mjerenjem, 25 %); velicina teksta jedva djeluje jer je 436 px naspram 17 rem deklaracija u page-app.css | Obje kontrole izostavljene/uklonjene, zabiljezeno u PR #95 | Migracija px -> rem u page-app.css kao zaseban zadatak, ili kontrole ostaju vani? |

