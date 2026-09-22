# Lekta AI Orchestration

Ovaj dokument je kanonski ugovor za koordinaciju Codexa, Claude Codea i Grok CLI-ja.
Root `AGENTS.md` i `CLAUDE.md` cuvaju projektna pravila i host-specific bootstrap, ali
ne smiju definirati drukciji raspored providera, billing ili review pravila od ovog dokumenta.

## Temeljno pravilo

Jedan zadatak ima jednog primarnog providera. Drugi provider se ukljucuje samo kada:
- domena izricito trazi neovisni/adversarijalni pregled;
- implementacija ide u review i review mora biti cross-provider;
- primarni provider je blokiran ili nedostupan, a fallback je dopusten politikom;
- vlasnik izricito trazi dodatno misljenje.

Ne pozivaj Claude, Codex i Grok na svaki prompt. Vise prolaza istim providerom nije neovisna provjera.

## Provideri i aliasi

Jedini strojni izvor aliasa/provider/model/role podataka je `config/agent-providers.json`.
Node `scripts/agents/core.mjs` i Python autonomy sloj ucitavaju isti registry:
- Codex: `astra` (koordinator), `sol` (implementator)
- Claude Code: `fable` (koordinator), `opus`, `sonnet` (implementatori)
- Grok CLI: `grok` (koordinator/reviewer), `build` (implementator)

Model ID je operativni detalj runnera. Prihvat rada se temelji na stvarno prijavljenom modelu,
alatima, diffu i gate dokazima, ne na samom trazenom aliasu.

## Faze

`plan`
: read-only analiza. Zadani autonomni izbor je Codex/Astra dok konfiguracija ne odredi drukcije.

`implement`
: jedan pisac u cistom izoliranom worktreeu ili zasebnom klonu na feature grani.
Zadani autonomni izbor je Claude/Sonnet.

`review`
: read-only pregled drugog providera od implementatora. Isti CLI provider se odbija.

`verify/publish`
: nisu modelske presude. Gateovi, CI, Word oracle i publisher ostaju odvojeni deterministicni koraci.

## Context policy

Hostovi vec automatski ucitavaju vlastite root upute. Runner zato NE smije svakom pozivu ponovno
narediti citanje svih root dokumenata.

Root `AGENTS.md` je namjerno kratka mapa. Detaljne invarijante preseljene su u
`docs/agents/PROJECT_RULES.md`, pa always-on context ne nosi cijelu povijest projekta.

Minimalni context za modelski poziv:
1. ovaj dokument;
2. tocni zapis zadatka i odgovarajuci odjeljak `development-plan.md`;
3. samo relevantni odjeljak/odjeljci `PROJECT_RULES.md` i scoped `CLAUDE.md` za putanje koje se stvarno diraju;
4. relevantni diff, log ili dokaz.

`docs/agents/README.md` je runbook za covjeka/operatora, ne obavezni prompt context.
Ne citaj cijeli `PROJECT_RULES.md` ni povijesne incidente po navici.

## Billing i usage

Poziv svakog providera trosi njegov vlastiti allowance ili billing izvor. Orkestrator mora biljeziti
stvarni provider/model i usage koji provider prijavi.

Podrzani runner profili:
- `budget`: rucni nacin; Claude zahtijeva eksplicitan `--budget-usd`; drugi provideri koriste vlastiti racun.
- `subscription`: fail-closed autonomni profil za ukljucene Codex/Claude modele; API credentiali su zabranjeni.
- `included_account`: samo Grok aliasi; smije se koristiti u autonomiji tek kad je vlasnik izricito potvrdio
  da je taj xAI model ukljucen u racun i kad `XAI_API_KEY` nije u okolini.

Autonomija nikad ne smije sama preci s ukljucenog allowancea na API naplatu ili paid credits.

## Normalizirani provider rezultat

Svaki adapter mora vratiti:
- `ok`
- `reportedModels[]`
- `usage.inputTokens`
- `usage.cachedInputTokens`
- `usage.cacheWriteInputTokens`
- `usage.outputTokens`
- `usage.reasoningOutputTokens`
- `usage.totalTokens`
- `usage.costUsd`
- `usage.modelCalls`

Nepoznato polje je `null`, ne nula. Nula je stvarna izmjerena nula.

Codex: usage se cita iz zadnjeg `turn.completed.usage`.
Claude: usage se agregira iz dostupnog `usage` i `modelUsage`.
Grok: usage se cita iz `usage`, `modelUsage` i `total_cost_usd`.

## Usage ledger

Rucni runner append-only zapisuje `.artifacts/agents/usage.jsonl`.
Autonomni kontroler zapisuje isti normalizirani usage u rezultat faze i svoj SQLite/event trag.

Ledger sluzi za mjerenje, ne za billing presudu. Ne zapisuj prompt, studentski dokument, token ni tajnu.

## Routing

Router je deterministicki dok ne postoji dovoljno vlastitih podataka za kvalitetno ucenje.

Redoslijed:
1. eksplicitni agent vlasnika/operatora;
2. sigurnosna ogranicenja billing profila i dostupnosti providera;
3. faza i uloga;
4. cross-provider review;
5. zadani fallback.

Pocetni autonomni default:
- plan -> `astra`
- implement -> `sonnet`
- review nakon Claude implementacije -> `astra`
- review nakon Codex implementacije -> `opus`, ili `grok` ako je izricito omogucen kao reviewer
- review nakon Grok Build implementacije -> `astra`

Ne uvodi "najbolji model" score dok ledger nema dovoljno usporedivih stvarnih zadataka. Kad se to uvede,
score smije koristiti samo mjerljive ishode: gate pass, review nalazi, rework, trajanje i usage; nikad
samoprocjenu modela.

## Grok contract

Minimalna verificirana Grok CLI verzija dolazi iz `config/agent-providers.json` (`grokMinVersion`, trenutno `1.0.34`).
`doctor` i stvarni `run --execute` moraju odbiti stariju/nepoznatu verziju prije modelskog poziva.
Plan/review koriste read-only sandbox; implementacija workspace sandbox. Runner ne smije automatski
spustiti sandbox na off.

Grok prompt ide kroz `--prompt-file`, ne kroz argv. Autonomni worker mora zamijeniti prompt-file
placeholder prije spawnanja i ne smije istodobno slati isti prompt na stdin.

## Cross-provider review

Provider identitet je CLI command, ne model family:
- Claude implementaciju pregledava Codex ili Grok.
- Codex implementaciju pregledava Claude ili Grok.
- Grok implementaciju pregledava Codex ili Claude.

Review ne postavlja `done`; daje nalaze i dokaz. Deterministicki gateovi i koordinator donose sljedeci prijelaz.

## Promjene ovog ugovora

Svaka promjena provider protokola mora imati test s najmanje:
- uspjesnim stvarnim/fixture formatom;
- eksplicitnim error formatom;
- model mismatchom;
- usage normalizacijom;
- billing/profile guardom;
- cross-provider guardom gdje je relevantno.

Ako Node runner i Python autonomy adapteri razlicito tumace isti provider rezultat, to je bug ovog ugovora.
