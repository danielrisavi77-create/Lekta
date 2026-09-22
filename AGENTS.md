# AGENTS.md - Lekta

Kratka mapa za agente. Nemoj pretvarati ovaj dokument ponovno u enciklopediju: always-on
kontekst je skup resurs. Detaljna pravila su u repo dokumentima ispod.

## Obavezni izvori po potrebi

- Multi-provider routing, billing, context i usage: `docs/agents/ORCHESTRATION.md`.
- Detaljne projektne invarijante i povijesni razlozi: `docs/agents/PROJECT_RULES.md`.
  Citaj samo relevantne odjeljke, ne cijeli dokument po navici.
- Red zadataka: `docs/agents/tasks.json`; kriteriji: `docs/agents/development-plan.md`.
- Repair: `src/repair/CLAUDE.md`.
- Citati: `src/citations/CLAUDE.md`.
- DOCX/OOXML: `src/docx/CLAUDE.md`.
- Supabase/Edge/migracije: `supabase/CLAUDE.md`.
- Autonomy/verifikacijske skripte: `scripts/autonomy/CLAUDE.md`.
- Operativne naredbe za agente: `docs/agents/README.md`.

Za netrivijalan zahvat prvo odredi domenu i ucitaj samo njena pravila. Ako zadatak prelazi
vise domena, kombiniraj relevantne scoped upute. Ne citaj povijesne incidente bez razloga.

## Projekt

Lekta je Vite + TypeScript strict klijentska aplikacija za lokalnu analizu akademskih DOCX
dokumenata prema verificiranim pravilima. Placeni repair, narudzbe i dio lifecyclea koriste
Supabase backend. Ovo nije Next.js projekt.

Lekta ne generira i ne prepravlja akademski sadrzaj. Repair je deterministicki formalni zahvat;
iznimke koje smiju dirati vidljivi tekst i njihove oracle provjere definirane su u
`docs/agents/PROJECT_RULES.md` i scoped repair uputama. Ne prosiruj tu granicu napamet.

## Tvrdi gate

Svaka promjena prije tvrdnje da je gotova mora proci:

```bash
npm run check
```

`npm run check` ukljucuje lint, TypeScript, Edge/Deno provjeru, Vitest i build. Bez Dena gate
pada; ne preskaci ga. `npm run master-ci` zasebno mjeri stanje mastera i nije zamjena za lokalni
gate radnog stabla.

Domenski gateovi ostaju obavezni kada ih scoped pravila traze, ukljucujuci golden DOCX testove,
strict-open, Word oracle, security ili release provjere. Modelova tvrdnja da je test prosao nije dokaz.

## Git i izolacija

- Jedan pisac po radnom stablu.
- Paralelni agenti smiju citati; paralelno pisanje u isto stablo nije dopusteno.
- Implementacija ide u vlastiti worktree ili zaseban klon na feature grani.
- Ne radi `git add -A`, `git add .`, `git commit --amend` ni siroki commit koji moze pokupiti tudji rad.
- Ne pripisuj autorstvo sesiji bez git dokaza.
- Ne mijenjaj red zadataka, merge, deploy ili produkciju samo zato sto modelski korak kaze success.
- Cross-provider review pravilo je u `docs/agents/ORCHESTRATION.md`.

## Ključne invarijante

- Privatni/proprietary/security-sensitive podaci ne smiju u javni Vite bundle.
- Ne izmisljaj fakultetska pravila, citate, stranice izvora, production stanje ni rezultate testova.
- Parser/citation/repair promjena mora imati dokaz koji grize; za osjetljive domene koristi golden/
  mutation/oracle provjere propisane detaljnim pravilima.
- Bodovana vrijednost mora biti vezana uz verificirani dokaz; studentski rad nije izvor pravila.
- Dokument se salje na server samo u tokovima koji to izricito dopustaju; ne prosiruj upload granicu.
- Nepoznat ili nedostupan servis daje unknown/blocked, nikad lazni pass.
- Novi guard bez negativne kontrole ili mutacije nije dokazana zastita.
- Idempotencijski ugovor mjeri najmanje dva prolaza kada scoped pravilo to zahtijeva.

Detalji, iznimke, brojevi guardova i incidenti koji su doveli do ovih pravila zive u
`docs/agents/PROJECT_RULES.md`; nemoj ih duplicirati ovdje.

## AI orchestration

Ne pozivaj Claude, Codex i Grok na svaki zadatak. Jedan provider je primarni; drugi se ukljucuje
samo kada cross-provider review, rizik, dostupnost ili eksplicitni zahtjev to opravdavaju.

Autonomija mora biti fail-closed za billing. API credential jednog providera ne smije autorizirati
ni blokirati drugi provider, a nijedan provider ne smije sam preci s ukljucenog allowancea na API
naplatu. Tocan ugovor je `docs/agents/ORCHESTRATION.md`.

## Završna provjera

Prije tvrdnje da je zadatak gotov navedi:
- tocni HEAD/base i stvarni opseg promjene;
- naredbe koje su stvarno pokrenute i njihove svjeze rezultate;
- relevantne CI/golden/oracle dokaze;
- neizvedene provjere i preostale rizike.

Ako obavezni gate nije izveden ili je okolina bila nedostupna, rezultat je neprovjeren, ne zelen.
