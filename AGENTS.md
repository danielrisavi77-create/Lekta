# AGENTS.md - Lekta

Kratka mapa za agente. Always-on kontekst je resurs; detaljna pravila citaj samo kada su
relevantna za zahvat.

## Obavezni izvori po potrebi

- Multi-provider routing, billing, context i usage: `docs/agents/ORCHESTRATION.md`.
- Detaljne projektne invarijante i povijesni razlozi: `docs/agents/PROJECT_RULES.md`.
- Red zadataka: `docs/agents/tasks.json`; kriteriji: `docs/agents/development-plan.md`.
- Repair: `src/repair/CLAUDE.md`.
- Citati: `src/citations/CLAUDE.md`.
- DOCX/OOXML: `src/docx/CLAUDE.md`.
- Supabase/Edge/migracije: `supabase/CLAUDE.md`.
- Autonomy/verifikacija: `scripts/autonomy/CLAUDE.md`.
- Operativne naredbe: `docs/agents/README.md`.

Za netrivijalan zahvat prvo odredi domenu i ucitaj samo relevantne odjeljke. Ne citaj cijeli
`PROJECT_RULES.md` ni povijesne incidente po navici.

## Projekt

Lekta je Vite + TypeScript strict aplikacija za lokalnu analizu akademskih DOCX dokumenata prema
verificiranim pravilima. Placeni repair i dio lifecyclea koriste Supabase. Lekta ne generira i
ne prepravlja akademski sadrzaj; repair je deterministicki formalni zahvat.

## Tvrdi gate

Svaka promjena prije tvrdnje da je gotova mora proci:

```bash
npm run check
```

Bez Dena gate pada. `npm run master-ci` zasebno mjeri master i nije zamjena za lokalni gate.
Domenski golden, mutation, strict-open, Word, security i release gateovi ostaju obavezni kada ih
scoped pravila traze. Modelova tvrdnja da je test prosao nije dokaz.

## Git i izolacija

- Jedan pisac po radnom stablu.
- Paralelni agenti smiju citati; paralelno pisanje u isto stablo nije dopusteno.
- Implementacija ide u vlastiti worktree ili zaseban klon na feature grani.
- Ne koristi `git add -A`, `git add .`, `git commit --amend` ni siroki commit koji moze pokupiti tudji rad.
- Ne pripisuj autorstvo bez git dokaza.
- Modelski success ne mijenja sam red zadataka, ne mergea i ne deploya.

## Ključne invarijante

- Privatni/proprietary/security-sensitive podaci ne smiju u javni bundle.
- Ne izmisljaj fakultetska pravila, citate, stranice izvora, production stanje ni rezultate testova.
- Parser/citation/repair promjena mora imati dokaz koji grize; novi guard bez negativne kontrole nije dokaz.
- Bodovana vrijednost mora biti vezana uz verificirani dokaz; studentski rad nije izvor pravila.
- Nepoznat ili nedostupan servis daje unknown/blocked, nikad lazni pass.
- Migracije idu kroz `supabase db push`, ne MCP `apply_migration`.

## AI orchestration

Ne pozivaj Claude, Codex i Grok na svaki zadatak. Jedan provider je primarni; drugi se ukljucuje
samo za cross-provider review, autorizirani fallback ili eksplicitni zahtjev.

SuperGrok se u ovom repozitoriju koristi kroz `grok login` u subscription profilu. `XAI_API_KEY`
je u tom profilu zabranjen jer bi prebacio Grok na API naplatu. Isto nacelo vrijedi za odgovarajuce
API credentiale drugih providera. Tocan ugovor je `docs/agents/ORCHESTRATION.md`.

## Završna provjera

Navedi tocni HEAD/base, stvarni opseg, pokrenute naredbe i svjeze rezultate te neizvedene provjere.
Ako obavezni gate nije izveden, rezultat je neprovjeren, ne zelen.
