# Racunala: radna stanica i laptop

Lekta se razvija na dva racunala s razlicitim ulogama. Cilj je da laptop ostane lagan,
a da teski alati i dalje postoje tamo gdje ima mjesta za njih.

## Uloge

| Racunalo | Sto se ovdje pokrece | Sto se ovdje ne instalira |
|---|---|---|
| Radna stanica (desktop) | Docker (field-renderer, Gotenberg, lokalni Supabase), LibreOffice headless, Word oracle iz `scripts/word-verify/`, Playwright preglednici, dugi korpusni prolazi, pomocni alati izvan repozitorija | nista nije zabranjeno |
| Laptop | Node, npm, Deno, Git, `npm run check`, uredjivanje koda | Docker, WSL disk, LibreOffice, veliki korpusi, lokalni alati izvan repozitorija |

Svako racunalo svoju ulogu biljezi u lokalnom `CLAUDE.local.md` u korijenu klona.
Ta datoteka se ne commita; iskljucuje se kroz `.git/info/exclude`.

## Pravila

1. Teska ovisnost nikad ne ulazi u `dependencies` ni `devDependencies`, jer ih `npm ci`
   uvijek instalira i na laptopu. Ide u Docker sliku, zaseban skript ili lokalnu mapu
   alata na radnoj stanici.
2. Docker slike, kontejneri, volumeni, WSL disk i pomocni alati nikad ne ulaze u repozitorij.
   U Git ide samo izvor (Dockerfile, skripta, namjerno commitan fixture) i rezultat koji gate trazi.
   Izlazi mjerenja idu u `.artifacts/`, koji je gitignored.
3. Na radnoj stanici veliki podaci (Docker, WSL, korpusi, worktreeji, pomocni alati) idu na
   disk s vise mjesta, ne na sistemski disk kad god je to moguce.
4. Skripta ili test koji treba Docker, LibreOffice, Word ili susjedni repozitorij mora na
   racunalu bez tog alata javiti NEPOKRIVEN. Ne smije tiho preskociti ni pasti tako da
   izgleda kao kvar koda.
5. Rezultat koji je laptop oznacio kao NEPOKRIVEN nije zelen. Provjera se dovrsava na radnoj
   stanici prije tvrdnje da je zadatak gotov.
6. Sva pravila iz korijenskog `CLAUDE.md` (izolirani worktree, `npm run check`,
   `npm run orphan-scan`, `git commit --only`) vrijede na oba racunala bez iznimke.

## Poznate lokalne ovisnosti gatea

- `tests/repair-runner-executable-e2e.test.ts` ocekuje klon repozitorija
  `WordReplica-Automation` u `C:\WordReplica-Automation\repo`. Bez njega test pada s
  `Cannot read properties of undefined (reading 'toString')`, sto je kvar okoline, ne koda.
  Klon je malen (oko 17 MB) i smije postojati na oba racunala.
