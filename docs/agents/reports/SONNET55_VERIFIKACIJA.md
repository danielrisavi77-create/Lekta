# Verifikacija claude-sonnet-5-5

Datum: 3. 10. 2026. Nalog vlasnika, brief koordinatora lekta-37. Postupak je isti kao za
`claude-opus-5-5` (`docs/agents/reports/OPUS55_VERIFIKACIJA.md`, `docs/agents/ROUTING.md`,
odjeljak "Kako dodati novi model"). Baza je master `7abdffe`, a Claude Code CLI je verzija
2.1.288. Poziv je išao iz cloud sesije na pretplati. U okolini nije bilo ni
`ANTHROPIC_API_KEY`, ni `ANTHROPIC_AUTH_TOKEN`, ni `CLAUDE_API_KEY`, a alat odbija raditi ako
postoji bilo koji od njih.

Ovaj PR dodaje model u `config/agent-routing.json` sa `status: "verified"`. Dodjela ulogama nije
dio ovog PR-a.

## 1. Identifikator

Identifikator nije pogađan, nego provjeren:
- `doctor` prihvaća samo modele navedene u configu, pa prvi poziv bez unosa staje s
  `[agents] Unknown Claude model in config/agent-routing.json: claude-sonnet-5-5`;
- nakon unosa sa `status: "unverified"` CLI prihvaća `claude-sonnet-5-5`;
- `modelUsage` sadrži točno taj id.

## 2. Doctor

Poziv prolazi kad su ispunjena tri uvjeta:
- izlaz zadovoljava runnerov `parseResult`;
- odgovor je točno `OK`;
- **traženi** model, a ne samo pomoćni `claude-haiku-4-5`, ima izlazne tokene u `modelUsage`.

Doslovan izlaz (07:17:23 UTC):

```text
$ node scripts/agents/cli.mjs doctor --model claude-sonnet-5-5
claude-sonnet-5-5: ok | exit 0 | subtype success | modelUsage [claude-haiku-4-5-20251001, claude-sonnet-5-5] | claude-sonnet-5-5 outputTokens 4 | 1600 ms
```

## 3. Fixture

Fixture je isti `model-fixture` kao u verifikaciji Opusa 5.5:
- **zadatak:** implementirati `rimskiUBroj` uz 5 testova u `node:test`;
- **ocjenjivač:** vraća izvorni test i sam ga pokreće;
- **alati:** `Read`, `Edit`, `Write` i `Bash(node --test *)`, najviše 15 koraka.

Runovi su išli jedan po jedan, nikad paralelno. Kontrolni run `claude-sonnet-5` napravljen je
istog dana, odmah nakon njih.

| Model | Effort | Ugovor (`parseResult` i tokeni modela) | Shema izlaza | Test netaknut | Ciljani testovi | Tvrdnja = stvarnost | Izlazni tokeni | Trajanje | Koraci | Vrijeme (UTC) |
|---|---|---|---|---|---|---|---|---|---|---|
| `claude-sonnet-5-5` | medium | da | da | da | 5/5 | da | 1166 | 9,0 s | 6 | 07:17:28 |
| `claude-sonnet-5-5` | high | da | da | da | 5/5 | da | 1248 | 10,7 s | 6 | 07:17:39 |
| `claude-sonnet-5` (kontrola) | high | da | da | da | 5/5 | da | 1965 | 27,6 s | 8 | 07:17:52 |

`modelUsage` u svakom runu sadrži traženi model i pomoćni `claude-haiku-4-5-20251001`.

CLI ispisuje i procjenu `total_cost_usd`:

| Model | Effort | Procjena |
|---|---|---|
| `claude-sonnet-5-5` | medium | 0,045 USD |
| `claude-sonnet-5-5` | high | 0,029 USD |
| `claude-sonnet-5` | high | 0,097 USD |

To je procjena CLI-ja, ne naplata. Poziv ide kroz pretplatu (`quotaNotDollars`), pa se ta
brojka ne koristi ni kao cjenik ni kao `costWeight`.

## 4. Status

`claude-sonnet-5-5` prolazi sve kriterije na obje razine efforta. U configu dobiva:
- `status: "verified"`;
- `verifiedAt: "2026-10-03"`.

Polja `input` i `output` i unos u `costWeight` namjerno izostaju, jer za cjenik nema provjerenog
izvora. Napomena u configu to kaže. Sljedeći PR koji ga dodjeljuje ulozi treba prvo cjenik s
izvorom.

Gardovi ne ovise o tome da je baš ovaj model neverificiran. Od #212 koriste sintetički model
`claude-neverificiran-test`:
- `tests/agent-routing-config.test.ts`;
- `tests/select-route.test.ts`;
- `tests/gate-mutations.test.ts`.

Svi prolaze i s novim unosom.

## Što ovo ne dokazuje

- **Jedan run po razini, na malom zadatku.** Brojke tokena i trajanja su jedno mjerenje, ne
  prosjek.
- **Zadatak ne pokriva zaštićena područja**, ni rad unutar repozitorija s punim gateom.
- **Cjenik nije provjeren.** Bez njega ne postoji ni `costWeight`, pa usporedba troška s ostalim
  modelima u configu još nije moguća.
- **Verifikaciju je izvela Claude sesija.** Ocjenjivač je deterministički i sam pokreće izvorne
  testove. Drugi provider može ponoviti isti `model-fixture` i usporediti.
