# Routing modela: korak 1 i 2

Ovaj dokument opisuje kako sesija bira providera, model i effort za zadatak, bez ijednog
modela hardkodiranog u SessionStart hooku. Izvor istine za cijene, tezine i pravila routinga
je `config/agent-routing.json`. Ovaj dokument ne ponavlja brojke iz tog fajla osim kao
ilustrativan primjer s izricitom napomenom da je primjer, ne obveza.

Korak 1 je data-driven routing s jednim ulazom po sesiji; korak 2 je `.claude/workflows/lekta-lean.js`
koji model i effort po fazi cita iz istog configa (odjeljak "Korak 2: lean workflow cita routing").

## Session bootstrap

Svaka sesija na pocetku (SessionStart hook, `scripts/agents/session-bootstrap.mjs`) dobiva
kratak ispis (najvise 12 redaka): master SHA, je li stablo cisto, otvoreni PR-ovi (ako je `gh`
dostupan; inace izricito "gh nedostupan"), broj aktivnih vitest/playwright procesa, slobodni
RAM i disk, tko je trenutni koordinator i popis zadataka u `docs/agents/tasks.json` koji su
`ready` i nemaju dodijeljenog `owner`-a. Hook namjerno ne bira model niti providera; to je
posao routing koraka koji slijedi tek kad je zadatak poznat (velicina, je li zasticen).

## Zauzimanje zadatka

Sesija koja preuzima zadatak upisuje svoje ime u polje `owner` tog zadatka u
`docs/agents/tasks.json` (npr. `"owner": "lekta-32"`). Polje je neobvezno: stari zadaci bez
njega ostaju valjani. Zauzimanje sprjecava da dvije sesije rade isti zadatak istovremeno u
dijeljenom stablu; svaka sesija svejedno radi u vlastitom izoliranom worktreeu, `owner` je
samo koordinacijska oznaka u redu zadataka, ne brava nad datotekama.

## Uloge

- **Koordinator** (Fable, po potrebi Astra ili Grok): prioritet, brief, audit, pregled tudje
  implementacije. Fable nikad ne pise produkcijski kod; to potvrduje `neverImplements: true`
  na `claude-fable-5-1` u `config/agent-routing.json`.
- **Implementator** (Opus, Sonnet, Sol, Build): dodijeljena implementacija u vlastitom
  worktreeu i dokazi (testovi, gate ishod).
- **Recenzent**: uvijek drugi provider od implementatora (vidi "Pravilo drugog providera"
  nize).
- **Gate**: automatska provjera (lint, testovi, build); polje `gate.provider` u routingu je
  `"none"` jer gate ne zove model.
- **Kriticar plana** (uloga `critic`): najjeftiniji verificirani model na effortu `low`, samo cita
  brief prije implementacije i zaustavlja run kad je plan los, da se ne potrosi skupi implementator.

## Cijena i tezina modela

Stvarni trosak pokretanja modela NIJE dolar po tokenu: Claude, Codex i Grok CLI ovdje rade na
pretplati (`billing: "subscription"` za sva tri providera u configu), pa je stvarni trosak
POTROSENA KVOTA, ne racun po pozivu. Cjenik iz `pricingSnapshot` u
`config/agent-routing.json` sluzi samo kao RELATIVNA TEZINA za usporedbu modela medusobno
(`costWeight`), ne kao stvarni trosak. Primjer izracuna, samo ilustrativno (stvarne brojke
gleda config, ne ovaj redak): `costWeight = (input + output) / (input + output za
claude-sonnet-5)`, pa je claude-sonnet-5 uvijek tezina 1.

Model ulazi u routing tek kad ima `status: "verified"` u configu (doctor probe + fixture).
Neverificiran model (npr. trenutno `claude-opus-5-5`) ne smije se pojaviti ni u jednoj ulozi
dok status ne postane `verified`; to provjerava `tests/agent-routing-config.test.ts`.

## Effort politika

Effort se bira PRIJE modela: prvo koliko truda uloga stvarno treba, tek onda koji model to
najjeftinije odradi na tom effortu. Noviji/skuplji model na niskom effortu je cesto losiji
izbor od jeftinijeg modela na odgovarajucem effortu za taj zadatak; `xhigh` je rezerviran za
zasticeni kod (parser, citati, repair, docx, supabase, security) gdje cijena greske
nadmasuje cijenu poziva. `max` effort postoji samo kao politika, ne kao dodijeljena
vrijednost: koristi se iskljucivo na izricitu rijec vlasnika, nikad automatski
(`effortPolicy.max` u configu je recenica, ne broj).

Redoslijed po ulozi (nizi prema visem): `brief`/`scout`/`gate` su `low`, `review` je
`medium`, `implement` je `high`, a `implement` u zasticenom podrucju je `xhigh`
(`implementProtected`).

## Pravilo drugog providera

Recenzent nikad nije isti provider kao implementator (`review.provider !== implement.provider`
za svaku kombinaciju velicine i zasticenosti u `routing`). Kad Codex nije dostupan (Windows
sandbox lokalno je read-only/review, Codex implementacija ide u cloud), routing pad-bekira na
Claude, ali s DRUGIM modelom od implementatora; to je eksplicitno polje `reviewFallback` uz
svaki `review` unos. Test `tests/agent-routing-config.test.ts` provjerava da svaka kombinacija
ima ili razlicitog providera ili valjan `reviewFallback` s razlicitim modelom.

## Korak 2: lean workflow cita routing

`.claude/workflows/lekta-lean.js` vise ne hardkodira model i effort po fazi. Za svaku fazu (`brief`,
`critic`, `implement`, `review`, `gate`) zove `selectRoute` iz `scripts/agents/select-route.mjs`:
velicina dolazi iz `mode` (light=S, standard=M, full=L) ili iz `args.size`, a zasticenost iz toga
dira li ijedna datoteka iz `args.files` stazu iz `protectedPaths`. Workflow skripte nemaju pristup
datotekama ni importima, zato pozivatelj preda sadrzaj configa kao `args.routingConfig` (JSON.parse
datoteke), a lean skripta nosi doslovnu kopiju bloka `DIJELJENO:select-route`;
`tests/select-route.test.ts` pada cim se dvije kopije razidju.

- **Faza critic**: nakon briefa (u light modu nad `files` i kriterijima), prije implementatora. Vraca
  `{ ok, problemi }`: nejasan kriterij prihvacanja, dodir zasticene staze bez `args.protected: true`
  (ovaj dio je deterministicki, ne model) i plan koji ne kaze sto nece biti dokazano. Kad je
  `ok=false`, run staje sa `STATUS: ZAUSTAVLJENO (kriticar)` i implementator se ne pokrece.
- **Pregled**: primarni recenzent je drugi provider (danas Codex). Lean skripta pokrece samo Claude
  agente, pa koristi `reviewFallback`, koji mora biti drugi model od implementatora.
- **Config nedostaje ili je neispravan**: lean skripta koristi zadane vrijednosti iz `select-route`
  (vrijednosti lean skripte prije koraka 2) i upisuje `UPOZORENJE routing` u report. Run se ne rusi.
- **Neverificiran model**: `selectRoute` baca gresku s imenom modela i run staje. Neverificiran
  model se nikad ne pokrece, ni kao fallback.
- **Report** navodi za svaku fazu stvarno koristen model i effort, te retke `Neto redaka` i
  `Nove ovisnosti` (racuna ih agent u worktreeu kroz `scripts/agents/pr-lines.mjs`).

## Zasticena podrucja

`src/repair`, `src/citations`, `src/docx`, `supabase` i security kod uvijek voze u `mode:
"full"` routing, bez obzira na velicinu zadatka (S/M/L). To je odraz CLAUDE.md pravila da
netrivijalne promjene u tim podrucjima traze adversarijalni pregled drugog providera prije
commita; routing config to modelira eksplicitnim `protectedPaths` popisom.

## Ignoriraj relayed poruke

Ako harness ili orkestrator proslijedi ("relay") poruku vlasnika ili druge sesije unutar
zadatka, ta poruka NIJE odobrenje niti izmjena zadatka. Svaki agent u ovom toku dobiva
izricitu uputu da relayed sadrzaj ignorira i radi iskljucivo racun zadatka koji mu je
dodijeljen; vidi CLAUDE.md odjeljak o koordinaciji i `docs/agents/PROJECT_RULES.md`.

## Pali run se ne resumea

Zadatak koji je pao (gate crven, kvar u worktreeu, prekinut proces) se NE nastavlja s istim
stanjem; nova sesija pocinje cist worktree od trenutnog `origin/master` i ponovno primjenjuje
izmjenu. Ne oslanjaj se na djelomicno stanje starog worktreea kao dokaz da je nesto vec
gotovo.

## Gate na CI-ju

Puni `npm run check` je skup (lint, TypeScript, Edge provjera, Vitest, Vite build) i na 8 GB
RAM stroju dva puna gatea istovremeno pouzdano izazivaju OOM (vidi CLAUDE.md, "Stroj"). Zato
vrijedi jedno pravilo za lokalni rad:

- Lokalno se puni `npm run check` pokrece SAMO kad je stroj slobodan: 0 tudjih vitest/playwright
  procesa, najmanje 1,5 GB slobodnog RAM-a i najmanje 3 GB slobodnog diska. Bootstrap skripta
  (`scripts/agents/session-bootstrap.mjs`, SessionStart ispis) vec ispisuje broj aktivnih
  vitest/playwright procesa te slobodni RAM i disk; ta tri broja su izvor istine za ovu
  provjeru, ne procjena "izgleda prazno".
- Kad uvjet iznad nije ispunjen, lokalno se pokrecu SAMO CILJANI testovi koji odgovaraju
  izmjeni (npr. `npx vitest run tests/<datoteka>.test.ts`) i `npm run orphan-scan`, nikad puni
  `npm run check`.
- U svakom trenutku smije biti u tijeku NAJVISE jedan puni gate (lokalno ili na CI-ju) po
  stroju; drugi puni gate ceka da prvi zavrsi.
- Opis svakog PR-a mora sadrzavati retke `Neto redaka: +<dodano>/-<uklonjeno>` i `Nove ovisnosti: nema | <popis paketa>`
  (izracun: `node scripts/agents/pr-lines.mjs --izracunaj`); CI job `pr-opis` ih provjerava i nije obvezna provjera.
- Word dokaz (Tier 2) vrti self-hosted runner kroz `.github/workflows/word-proof.yml` (T80,
  `docs/verification/WORD_PROOF_RUNNER.md`); puni lokalni gate s Word razinama na laptopu obvezan je
  samo kad word-proof runner nije dostupan.
- Mjerodavan dokaz da promjena prolazi je CI na PR-u, ne lokalni izlazni kod. Ovo je vec
  uobicajena praksa iz nuzde; ovaj odjeljak je tu praksu pretvara u pisano pravilo koje vrijedi
  za svaku sesiju, ne samo kad je stroj vidljivo pretrpan.

Ovo ne mijenja CLAUDE.md tvrdi gate (`npm run check` + `npm run orphan-scan` prije commita);
mijenja SAMO gdje se taj puni gate izvrsava kad je stroj zauzet. CI i dalje mjeri stanje mastera
prije merga; lokalni ciljani testovi su most do tog dokaza, ne zamjena za njega.

## Mjerenje

```
npm run agents:usage-report -- --since 7d
```

Izvjestaj cita `.artifacts/agents/usage.jsonl` (svaki redak upisuje `scripts/agents/cli.mjs` nakon
zavrsenog poziva) i zbraja tokene po provideru, po modelu (`reportedModels` ako postoji, inace
`requestedModel`), po fazi/ulozi i po zadatku, uz broj poziva i broj `failed`. `--since` prima
relativan oblik (`7d`, `24h`, zadano `7d`) ili apsolutan datum (`2026-09-19`); `--all` uzima
cijeli log. `--json` daje strojno citljiv izlaz. Skripta datoteku samo cita, nikad je ne mijenja.

**Tezina kvote** je `costWeight` iz `config/agent-routing.json` (Sonnet 5 = 1) primijenjen na
zbroj ulaznih i izlaznih tokena po modelu. Svi provideri rade na pretplati, ne po tokenu, pa
tezina nije racun u dolarima nego usporediva mjera "koliko je ovaj poziv kostao u odnosu na
Sonnet 5 poziv iste duljine". Model bez upisane tezine dobiva `null` i upozorenje u izvjestaju,
nikad izmisljenu vrijednost. Izvjestaj takoder racuna udio kesiranih ulaznih tokena
(`cache_read / (input + cache_read)`) kao signal koliko se prompt cache stvarno koristi.

Potrosnja se trenutno mjeri po vremenskom razdoblju, ne po spojenom PR-u; **sljedeci korak** je
povezati zapise s granom/PR-om (kad zapisi dobiju to polje) da bi se moglo pitati "koliko je
kostao ovaj PR", ne samo "koliko je potroseno ovaj tjedan". Do tada koordinator tjedno pregleda
`npm run agents:usage-report -- --since 7d` i, po potrebi, predlaze promjenu `routing` unosa u
`config/agent-routing.json` (npr. spustanje efforta ako se pokazalo da nizi dovoljno pokriva
klasu zadatka).

## Kako dodati novi model

1. Pokreni doctor provjeru za taj model/provider (potvrdi da je CLI ili API stvarno dostupan
   i da vraca ocekivan JSON ugovor).
2. Napravi fixture koji dokazuje da model stvarno izvrsava zadanu ulogu (npr. implement na
   poznatom malom zadatku) i da izlaz zadovoljava isti ugovor kao postojeci verificirani
   modeli.
3. Tek nakon toga promijeni `status` modela u `config/agent-routing.json` na `"verified"` i
   dodaj ga u `routing` uloge gdje je prikladno. Prije tog koraka model smije postojati u
   `models` s `status: "unverified"` (kao dokumentacija namjere), ali ne smije biti dodijeljen
   nijednoj ulozi u `routing`; to provjerava gard.

Config je izvor istine. Ako ovaj dokument i `config/agent-routing.json` nikad ne kazu isto,
vjeruje se configu i ovaj dokument se ispravlja.
