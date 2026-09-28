# Verifikacija claude-opus-5-5 kao implementatora

Datum: 28. 9. 2026. Odluka vlasnika (opcija 1), brief koordinatora lekta-32. Postupak je
`docs/agents/ROUTING.md`, odjeljak "Kako dodati novi model". Baza je master `b6eaebf`, a Claude
Code CLI je verzija 2.1.283. Poziv je išao iz cloud sesije na pretplati: u okolini nije bilo ni
`ANTHROPIC_API_KEY`, ni `ANTHROPIC_AUTH_TOKEN`, ni `CLAUDE_API_KEY`, a alat odbija raditi ako
postoji bilo koji od njih.

Ovaj PR mijenja samo `status` modela u `verified`. Routing uloga i effort se ne mijenjaju.
Prebacivanje implementatora i spuštanje efforta su zaseban PR nakon ove tablice i riječi
vlasnika.

## 1. Doctor

`agents doctor` je dosad provjeravao samo postoji li CLI. Novi `doctor --model <id>` stvarno
pozove model kroz pretplatu. Poziv prolazi kad su ispunjena tri uvjeta:

- izlaz zadovoljava runnerov `parseResult` (`subtype: success`, `is_error: false`);
- odgovor je točno `OK`;
- traženi model ima izlazne tokene u `modelUsage`.

Zadnji uvjet je strož od runnerovog `modelMatches`. CLI uz traženi model zove i pomoćni
`claude-haiku-4-5`, a `modelMatches` bi prihvatio bilo koji pogodak u `modelUsage`.

Doslovan izlaz:

```text
$ node scripts/agents/cli.mjs doctor --model claude-opus-5-5
claude-opus-5-5: ok | exit 0 | subtype success | modelUsage [claude-haiku-4-5-20251001, claude-opus-5-5] | claude-opus-5-5 outputTokens 4 | 2026 ms
```

## 2. Fixture

U repozitoriju nije postojao fixture kojim su verificirani postojeći modeli. Zato je napisan
jedan mali implement zadatak s determinističkim ishodom, `node scripts/agents/cli.mjs
model-fixture --model <id> --effort <razina>`:

- **Zadatak:** funkcija `rimskiUBroj` (kanonski rimski broj od 1 do 3999 u cijeli broj, sve
  ostalo baca `RangeError`). Uz nju ide 5 testova u `node:test` i privremena mapa izvan
  repozitorija.
- **Ugovor izlaza:**
  - runnerov `parseResult`;
  - traženi model ima izlazne tokene;
  - `structured_output` preko `--json-schema` odgovara povratu koji runner traži od
    implementatora: `scope`, `changes`, `testsRun`, `risks`, `nextStep`.
- **Ocjenjivač ne vjeruje modelu.** Prije mjerenja vraća izvorni test, sam pokreće
  `node --test` i broji iz TAP sažetka. Izmijenjen test znači pad. Bilježi i slaže li se
  tvrdnja modela o testovima sa stvarnim ishodom.
- **Alati:** `Read`, `Edit`, `Write` i `Bash(node --test *)`, najviše 15 koraka,
  `--permission-mode dontAsk`.
- **Runovi:** jedan po jedan, nikad paralelno.

| Model | Effort | Ugovor (`parseResult` i tokeni modela) | Shema izlaza | Test netaknut | Ciljani testovi | Tvrdnja = stvarnost | Izlazni tokeni | Trajanje | Koraci |
|---|---|---|---|---|---|---|---|---|---|
| `claude-opus-5-5` | medium | da | da | da | 5/5 | da | 1194 | 14,3 s | 5 |
| `claude-opus-5` | high | da | da | da | 5/5 | da | 1967 | 32,0 s | 7 |

Vrijeme runova (UTC): `claude-opus-5-5` u 01:13:43, `claude-opus-5` u 01:14:07. Nakon runova je
čitanje rezultata CLI-ja izdvojeno u zajedničku funkciju `runClaude`, zbog jscpd ratcheta.
Logika je ista, što potvrđuju testovi i četiri mutacije. Doctor je nakon toga ponovljen uživo:
`claude-opus-5-5: ok | exit 0 | subtype success | modelUsage [claude-haiku-4-5-20251001,
claude-opus-5-5] | claude-opus-5-5 outputTokens 4 | 2047 ms`.
`modelUsage` u oba runa sadrži traženi model i pomoćni `claude-haiku-4-5-20251001`.

Za orijentaciju, CLI u JSON-u ispisuje i `total_cost_usd`: 0,084 USD za `claude-opus-5-5`
medium i 0,152 USD za `claude-opus-5` high. To je procjena CLI-ja po cjeniku, ne naplata. Poziv je
išao kroz pretplatu, pa je stvarni trošak potrošena kvota (`quotaNotDollars` u configu).

## 3. Status

Oba modela prolaze na svim kriterijima. `claude-opus-5-5` zato dobiva `status: "verified"` i
`verifiedAt: "2026-09-28"` u `config/agent-routing.json`.

Tri garda ovisila su o tome da je baš `claude-opus-5-5` neverificiran:

- `tests/agent-routing-config.test.ts`;
- `tests/select-route.test.ts`;
- dva bloka u `tests/gate-mutations.test.ts`.

Sada svaki u kopiju configa ubacuje eksplicitan sintetički model `claude-neverificiran-test` sa
`status: "unverified"`. Provjera je jednako stroga i više ne ovisi o tome postoji li trenutno
neki neverificiran model u stvarnom configu.

## 4. B1 mjerenje

B1 (brief koordinatora, grana `wf/opus55-b1-routing`) prebacuje implementatora na
`claude-opus-5-5`: effort `medium` izvan zaštićenih staza i `high` na zaštićenima, umjesto
dosadašnjeg `xhigh`. Isti `model-fixture` (ne čita routing config) ponovljen je po jednom za
obje razine, jedan po jedan, iz cloud sesije na pretplati.

| Model | Effort | Ugovor | Shema izlaza | Test netaknut | Ciljani testovi | Tvrdnja = stvarnost | Izlazni tokeni | Trajanje | Koraci | Vrijeme (UTC) |
|---|---|---|---|---|---|---|---|---|---|---|
| `claude-opus-5-5` | medium | da | da | da | 5/5 | da | 1382 | 15,9 s | 5 | 09:06:49 |
| `claude-opus-5-5` | high | da | da | da | 5/5 | da | 1318 | 15,0 s | 5 | 09:07:12 |

Medium prolazi fixture, pa se effort spušta kako je predloženo. Na ovom zadatku high nije
skuplji od mediuma: razlika od 64 tokena i 0,9 s je unutar raspona dvaju medium runova (1194 u
odjeljku 2 i 1382 ovdje). Mjerenje zato potvrđuje samo da obje razine prolaze. Ne pokazuje
uštedu mediuma i ne pokazuje da je high na zaštićenim stazama potreban; to ostaje odluka
politike, ne izmjereni učinak.

## Što ovo ne dokazuje

- **Ovo je jedan run po modelu** na malom zadatku. Omjer tokena i trajanja (oko 0,6 i 0,45) je
  jedno mjerenje, ne prosjek. Za odluku o spuštanju efforta vrijedi ponoviti fixture nekoliko
  puta, ili dodati i veći zadatak iz stvarnog reda.
- **Zadatak ne pokriva zaštićena područja** (repair, citations, docx, security, supabase), ni
  rad unutar repozitorija s punim gateom.
- **Verifikaciju je izvela sesija koja i sama radi na `claude-opus-5-5`.** Ishod ne ovisi o
  sudu modela, jer ocjenjivač je deterministički i sam pokreće izvorne testove. Ipak, drugi
  provider može ponoviti isti `model-fixture` i usporediti.
