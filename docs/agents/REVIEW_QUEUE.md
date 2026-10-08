# Red pregleda drugog providera (oznake na PR-u)

Niti ne cekaju vlasnika za svaki pregled: stave GitHub oznaku, a jedna dugotrajna sesija na radnoj
stanici obradi red. Skripta: `scripts/agents/review-queue.mjs`, odluke: `review-queue-core.mjs`,
test: `tests/review-queue.test.ts`.

## Oznake

| Oznaka | Provider | Model |
| --- | --- | --- |
| `grok-review` | Grok CLI | `grok-4.6`, samo alati `read_file,list_dir,grep`, sandbox read-only |
| `codex-review` | Codex CLI | `gpt-6-sol`; `gpt-6.1-sol` ako delta dira `protectedPaths` |

Oznake moraju postojati u repozitoriju. Pregled mora doci od drugog providera od implementatora
(Grok za Codex/Claude kod, Codex za Claudeov kod). Na zasticenoj delti Grok je samo trece misljenje
uz Codex (`config/agent-routing.json`, `protectedReviewNote`); komentar to navodi.

## Sto sesija radi

Jedan prolaz, serijski (jedna teska provjera odjednom):

1. `gh pr list --label ...` za obje oznake; sljedeci je najnizi broj PR-a, pa provider po abecedi.
2. `git fetch origin pull/N/head`, odvojeni worktree u `..\lekta-wt\review-prN-<provider>`.
3. Delta je `zadnji pregledani commit..glava` dok je on jos predak glave, inace `merge-base..glava`.
   Zadnji pregledani commit pamti se u `.artifacts/review-queue/state.json`.
4. Provider dobije prompt iz datoteke (diff do 200 kB, opis PR-a oznacen kao podatak).
5. Izlaz se ocisti od lokalnih putanja (repo je javan) i objavi kao `gh pr review --comment`.
6. Oznaka se skida, worktree se uklanja. Oznaka vracena na vec pregledan commit samo se skida.
7. Dva uzastopna kvara na istoj kombinaciji: komentar o kvaru i skidanje oznake (nema vrtnje u krug).

Skripta odbija start ako okolina ima `XAI_API_KEY` ili `OPENAI_API_KEY`: samo pretplata
(`grok login`, `codex login`). Ne mijenja kod ni PR; nalazi su savjetodavni i potvrduju se dokazom.
Ne dira PR-ove bez oznake, pa ni ruzni red u niti "Beta: release proof i pregledi".

## Pokretanje (jednom, na radnoj stanici)

U sesiji u `C:\Users\PC\Desktop\Lekta` na `master`:

```bash
npm run agents:review-queue
```

Samo provjera bez pregleda: `npm run agents:review-queue -- --dry-run`.
Jedan prolaz pa izlaz: `npm run agents:review-queue -- --once`.
Zakljucavanje `.artifacts/review-queue/lock` sprjecava dvije petlje; ostane li nakon pada, obrisi ga.

## Stavljanje u red (niti)

```bash
gh pr edit N --add-label grok-review     # ili codex-review
```

Nova runda trazi novu oznaku nakon novog pusha.
