# Agent path scope v1

Ovaj sloj sprjecava da implementatorska sesija proizvoljno siri zahvat izvan putanja koje joj je
koordinator dodijelio. To je preduvjet za buduci globalni lease sustav, ali NIJE jos globalni lock
izmedju laptopa, radne stanice i Claude clouda.

## Ugovor zadatka

Zadatak u `docs/agents/tasks.json` moze imati neobavezni `workScope`:

```json
{
  "id": "T99",
  "status": "in_progress",
  "owner": "lekta-03",
  "workScope": {
    "read": ["src/routes/**"],
    "write": ["src/ui/results/**", "tests/ux/results-mobile.spec.ts"],
    "forbidden": ["supabase/**", ".github/**"]
  }
}
```

Podrzane su samo dvije vrste zapisa:

- tocna relativna putanja, npr. `src/ui/app.ts`
- cijelo podstablo sa zavrsnim `/**`, npr. `src/ui/results/**`

Siri globovi poput `src/*/app.ts`, apsolutne putanje i `..` nisu dopusteni. Time je presjek dva
write scopea deterministicki i konzervativan.

## Aktivni pisci i konflikt

`scripts/agents/task-scope.mjs` smatra `in_progress` zadatke aktivnim piscima. Dva aktivna
zadatka ne smiju imati preklapajuci `workScope.write`. `in_review` je read-only faza i ne drzi
write scope.

Provjera:

```bash
npm run agents:scope-audit
```

Ishodi:

- izlaz 0: nema konflikata ni aktivnih ownera bez write scopea
- izlaz 1: nema konflikta, ali postoji aktivni legacy zadatak s ownerom bez `workScope.write`
- izlaz 2: nevaljan scope ili stvarni write/write konflikt

Red zadataka dodatno prolazi istu provjeru kroz `validateQueue`, pa runner odbija aktivni konflikt
prije modelskog poziva.

## PreToolUse zastita

Repo registrira `scripts/hooks/task-scope-guard.mjs` na Claude Code `Edit|Write` alatima.

Stroga implementatorska sesija pokrece se s:

```bash
LEKTA_ROLE=implementer LEKTA_TASK_ID=T99 LEKTA_SCOPE_ENFORCED=1 LEKTA_CHECKLIST=/put/T99.md claude
```

Na PowerShellu postavi iste varijable kroz `$env:` prije pokretanja `claude`.

Kad je `LEKTA_TASK_ID` postavljen:

1. zapis unutar `workScope.write` prolazi;
2. zapis koji pogodi `forbidden` uvijek pada;
3. zapis izvan `write` pada s porukom da se zatrazi `SCOPE EXPANSION`;
4. zapis izvan korijena worktreea pada.

Ako je `LEKTA_SCOPE_ENFORCED=1`, nedostajuci `workScope.write` takoder blokira. Bez te zastavice
legacy zadatak dobiva upozorenje i prolazi, kako rollout ne bi zaustavio postojece sesije.

## SCOPE EXPANSION

Implementator ne siri zahvat sam. Ako tijekom rada otkrije da mora dirati dodatnu putanju:

1. staje prije izmjene te putanje;
2. javlja orkestratoru putanju i razlog;
3. orkestrator provjerava ovisnosti i aktivne write scopeove;
4. tek nakon promjene `tasks.json` implementator nastavlja.

To odvaja otkrivanje potrebe od ovlasti za promjenu.

## Granica v1

`tasks.json` je Git snapshot. Lokalni hook cita kopiju u vlastitom worktreeu. Zbog toga v1 NE
moze garantirati da laptop, radna stanica i cloud u istom trenutku vide najnoviju dodjelu. Stari
checkout moze imati zastarjeli scope.

Zato je v1 obrana od nekontroliranog sirenja scopea i detektor konflikata, a ne distribuirani lock.

## Sljedeca faza: globalni lease

V2 treba centralni control plane izvan produkcijskih podataka Lekte s najmanje:

- session id i heartbeat
- task id, owner i base SHA
- read/write leaseovi s istekom
- atomic claim/release
- provjera presjeka prije claima
- eventovi `TASK_IMPLEMENTED`, `TASK_BLOCKED`, `SCOPE_EXPANSION_REQUESTED`
- fail-closed ponasanje kad centralno stanje nije dostupno za novi write lease

Lokalni `workScope` ostaje ugovor zadatka i nakon uvodenja globalnog storea; globalni lease samo
dokazuje da je taj scope trenutno ekskluzivno rezerviran.
