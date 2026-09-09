# Autonomni razvoj: polazna tocka (Zadatak 0)

Snimka stanja 2026-09-09 prije implementacije kontrolera, prema planu "Lekta: autonomni razvoj bez
placenih Actions minuta" (Zadatak 0). Sve brojke su izmjerene na ovom stroju i ovom repozitoriju, ne
prepisane iz plana. Plan je nastao nad HEAD-om `7bdd7085`; ovaj dokument mjeri master `48c1fc9e`.

## Baza i grana

| stavka | vrijednost |
| --- | --- |
| master pri pocetku | `48c1fc9e` (merge PR #61, 2026-09-09 05:32 UTC) |
| PR #60 (`codex/agent-workflow`) | OTVOREN, draft, HEAD `6566ccf5`, baza `7bdd7085`; nije spojen |
| radna grana | `autonomy-2026-09-09` = master + merge PR #60 (`d7b94731`, bez konflikata) |
| radno stablo | izolirani worktree izvan repozitorija (`scratchpad/a-wt`), junction na `node_modules` |
| dijeljeno stablo | `docx-truthful-status` (tudja sesija), nije dirano |

PR #60 je integriran kroz merge, ne resetiran: `scripts/agents/core.mjs`, `scripts/agents/cli.mjs`,
`docs/agents/README.md`, `docs/agents/tasks.json`, `docs/agents/development-plan.md` (identican
drugom planu iz maila, do zamjene crtica) i dva vitest testa. Njegov `development-plan.md` je jedini
izvor zadataka T00 do T15; status po zadatku je u `docs/quality/lekta-plan-status.md`.

## Alati na stroju (izmjereno)

| alat | verzija | napomena |
| --- | --- | --- |
| Node | v24.14.1 | CI vrti 20 i 24 |
| npm | 11.11.0 | |
| Python | 3.12.10 (`python`), 3.14.3 (`py -3`) | kontroler koristi 3.12, samo stdlib |
| Deno | 2.9.3 | `check:edge` prolazi lokalno (25 funkcija) |
| git | 2.54.0.windows.1 | |
| Codex CLI | 0.153.4 | `codex login status`: prijavljen preko ChatGPT-a |
| Claude Code | 2.1.266 | `claude auth status`: prijavljen, `authMethod: claude.ai`, `subscriptionType: max`; nije na PATH-u u Git Bashu, jest u Pythonu (`~/.local/bin/claude.EXE`) |
| gh | 2.96.0 | prijavljen |
| Microsoft Word | 14.0 (COM) | dostupan; Tier 2 provjere su moguce |
| Playwright | 1.61.1 | |
| RAM / CPU pri mjerenju | 0,97 GB slobodno, 12 node procesa, CPU 100 % | puni `npm run check` ne ide dok stroj nije mirniji (CLAUDE.md: ispod ~1 GB nema smisla) |

Naplata: `ANTHROPIC_API_KEY` i srodne varijable NISU postavljene u okolini. Stanje dodatnih kredita na
racunima NIJE provjereno programski (nema univerzalnog API-ja); ostaje vlasnikova potvrda kroz
`doctor --attest-...`. "Naplata racuna nije potvrdjena."

## Nalazi iz plana, ponovno provjereni

| nalaz iz plana (odjeljak 2) | stanje 2026-09-09 |
| --- | --- |
| PR #60 je priprema pojedinacnog zadatka, ne servis | tocno; runner ima lock, nema reda ni oporavka. Memorija sesije: T00 je bio blokiran na oba providera, `needs_verification` i `doctor` lazno zeleni |
| lokalni lock ostaje nakon greske | tocno (namjerno, README PR-a #60); kontroler to zamjenjuje lease-om u SQLite-u |
| `ux-gate` pada na PR-u #60 | na masteru `48c1fc9e` `check` workflow je crven ISKLJUCIVO na `ux-gate`; sadrzaj loga nije procitan (gh log dohvat vratio prazno u tri pokusaja). Poznat nestabilan test: `free-tools-audit.spec.ts:694` (kontrast 4,49 uz prag 4,5), tudje podrucje (redizajn), NE popravlja se ovdje |
| `post-deploy-smoke` periodicki | run 34320334583 PADA: 27 od 28 prolazi, jedini pad je `build-info.json: HTTP 404`, jer zakljucana objava (2026-09-06) prethodi `write-build-info` iz PR-a #61. Ovo je stalna crvena bez operativnog znacenja: popravljeno u ovoj grani (`unknown` ishod, upozorenje u nadzoru, pad samo uz `--expect-commit`) |
| `verify-deploy-dist` pri neuspjeloj git usporedbi zakljucuje "nije zastarjelo" | VEC RIJESENO u PR-u #61 (D3): `treeDigest` iz `git ls-tree -r`, presude fresh/stale/unknown, `unknown` pada; test `tests/release-proof-staleness.test.ts`, mutacija `dokaz/zastarjelost-nepoznata-prolazi-kao-svjeza` |
| `release-check` `complete` polje naspram izlaznog koda | tocno; gate kontrolera (`scripts/autonomy/gate.py`) trazi `complete:true`, `commit == candidateSha`, `dirtyWorkingTree:false`, svjez `treeDigest` I svaku obveznu razinu `pass` |
| stari `RELEASE_PROOF.json` | i dalje `5fa32e5d` (2026-09-07), bez `treeDigest`: za gate je `unknown`; objava ceka vlasnikovu odluku |
| `master` ima obvezne provjere, `allow_auto_merge` iskljucen | nije ponovno mjereno preko API-ja u ovoj sesiji; izdavac kontrolera odbija merge kad zastitu ne moze procitati |
| telemetrija s privolom | nepromijenjeno; kontroler prima samo agregate (`normalize_aggregate`) |

## Sto NIJE izvedeno u Zadatku 0 i zasto

- Puni `npm run check` nad ovom granom NIJE pokrenut u trenutku pisanja: stroj je na 0,97 GB slobodnog RAM-a
  s 12 node procesa (CLAUDE.md: potpis OOM pada se lako zamijeni za nalaz). Pokrenuti su ciljani vitest
  paketi (agent-workflow, classification, npm-script-targets, gate-mutations, post-deploy-smoke) i svih 91
  Python testova. Puni gate se mjeri prije commita, kad stroj dopusti; ishod je zapisan u
  `docs/quality/lekta-plan-status.md`.
- `npm run test:ux` nije ponovljen: UX pad iz pregleda je poznat flaky kontrast test u tudjem podrucju.
- Stvarni poziv modela nije izveden: kontroler je u `observe` nacinu i `billing_allowed` je False dok
  vlasnik ne potvrdi kredite i modele.
