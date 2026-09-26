# Lekta AI Orchestration

Ovo je kanonski ugovor za koordinaciju Codexa, Claude Codea i Grok CLI-ja. Root `AGENTS.md`
i `CLAUDE.md` ne smiju definirati drukciji routing, billing ili review ugovor.

## Pravilo potrosnje

Jedan zadatak ima jednog primarnog providera. Drugi provider se ukljucuje samo za obvezan
cross-provider review, eksplicitno dopusten fallback ili izricit zahtjev. Ne pozivaj sva tri
modela na svaki prompt.

## Provideri

Strojni izvor aliasa, modela i uloga je `config/agent-providers.json`.
- Codex: `astra` koordinator, `sol` implementator.
- Claude: `fable` koordinator, `opus` i `sonnet` implementatori.
- Grok: `grok` koordinator/reviewer, `build` implementator.

## Billing

- `budget`: rucni nacin; Claude zahtijeva eksplicitan budget.
- `subscription`: autonomni/account nacin. Fable je iskljucen. Grok je ukljucen prema vlasnickoj
  odluci 2026-09-21 i koristi SuperGrok kroz `grok login`.
- `XAI_API_KEY` je zabranjen za Grok subscription poziv jer bi presao na API billing.
- `OPENAI_API_KEY` blokira Codex account put, a Anthropic API credentiali blokiraju Claude
  subscription put. Credential jednog providera ne smije blokirati drugi.

Autonomija ne smije sama preci s ukljucenog allowancea na API ili paid credits.

## Context

Host vec ucitava root upute. Modelsko slanje ne smije ponovno narediti citanje cijelog root
`AGENTS.md`, `CLAUDE.md` i runbooka.

Minimalni context:
1. ovaj dokument;
2. tocni zadatak i njegov odjeljak u development planu;
3. relevantni odjeljak `PROJECT_RULES.md` i scoped upute za dirane putanje;
4. relevantni diff/log/dokaz.

## Faze i routing

- plan: read-only; primarno `astra`.
- implement: jedan pisac u izoliranom stablu; primarno `sonnet`.
- review: read-only i mora biti drugi CLI provider od implementatora.
- verify/publish: deterministicki gateovi, ne modelska presuda.

`providerFallback=wait` je zadano: ako primarni auto-provider nije autoriziran, posao se blokira
bez poziva drugog providera. `providerFallback=authorized` smije uzeti sljedeci kandidat samo ako
je njegov provider/model vec odobren doctor profilom. Nema probe calls.

## Normalizirani rezultat i usage

Svaki adapter vraca `ok`, `reportedModels[]` i:
`inputTokens`, `cachedInputTokens`, `cacheWriteInputTokens`, `outputTokens`,
`reasoningOutputTokens`, `totalTokens`, `costUsd`, `modelCalls`.
Nepoznato je `null`, ne nula.

Rucni runner zapisuje sanitizirani append-only `.artifacts/agents/usage.jsonl`. Autonomy isti
usage sprema u run event. Ledger ne sadrzi prompt, dokument ni tajne.

## Grok

Minimalna podrzana CLI verzija dolazi iz `config/agent-providers.json`. Plan/review koriste
read-only sandbox, implementacija workspace sandbox. Prompt ide kroz `--prompt-file`, ne argv
ni stdin istodobno. Sandbox se ne spusta na off.

## Model identity

Eksplicitno prijavljen model koji ne odgovara trazenom modelu je failure. Prazan reported-model
ostaje nepoznato i ne glumi mismatch.

## Buduci quality router

Ne uvodi scorer dok nema dovoljno stvarnih mjerenja. Kasniji score smije koristiti samo gate pass,
review nalaze, rework, trajanje i usage, nikad samoprocjenu modela.
