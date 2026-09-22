# Odluke o ovisnostima (T04)

Izmjereno 2026-09-09 (`npm audit --json` nad `package-lock.json` grane `autonomy-2026-09-09`, isti lock kao
master `48c1fc9e`): **22 high + 1 critical** u punom grafu, **0** u `--omit=dev`. Ratchet
`data/security/npm-audit-ratchet.json` stoji na 23 i CI pada na porast. Ovaj dokument ne uklanja nijedan
nalaz: on ga IMENUJE, kaze tko ga nosi, izvrsava li se u CI-ju i sto je put. Prihvacena iznimka nije
uklonjena ranjivost.

Runtime (bundle, Edge) nije pogodjen: sve dolje su razvojni alati. Nijedan ne dira dokument korisnika.

## Grupe

| grupa | paketi (23) | roditelj | izvrsava se | kompatibilna nadogradnja | odluka |
| --- | --- | --- | --- | --- | --- |
| A. Netlify CLI | `netlify-cli`, `@netlify/dev`, `@netlify/dev-utils`, `@netlify/edge-functions-dev`, `@netlify/functions-dev`, `@netlify/images`, `@netlify/redirects`, `@netlify/zip-it-and-ship-it`, `@fastify/static`, `extract-zip`, `image-size`, `ipx`, `sharp`, `toml` (14) | `netlify-cli` (izravna dev ovisnost) | lokalno (`netlify dev`, deploy pomocnici); NE u `npm run check`, NE u Netlify buildu (Netlify koristi vlastiti CLI) | samo semver-major na `netlify-cli@27.5.1` | iznimka do 2026-10-09; nadogradnja u zasebnom PR-u uz `npm run deploy:profile-rules` i `netlify dev` probu |
| B. Vitest/Vite | `vitest` (critical, GHSA-5xrq-8626-4rwp, GHSA-82fw-gwwq-j7x9), `vite` (3 GHSA) (2) | `vitest` (izravna dev ovisnost) | DA, u `npm run check` lokalno i CI; napadac treba lokalni pristup ili zlonamjeran test | samo semver-major `vitest@5.0.0` (vuce Vite 7) | iznimka do 2026-10-09; nadogradnja je zasebni PR jer mijenja test runner cijelog repozitorija (515 datoteka) i `vitest.config.ts` |
| C. Popravljivo bez majora | `@netlify/blobs`, `brace-expansion` (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895), `fast-uri` (6 GHSA), `find-my-way`, `postcss`, `svgo`, `tar` (GHSA-r292-9mhp-454m) (7) | tranzitivne, `fixAvailable: true` bez majora | mjesovito (postcss u Vite buildu, ostalo pod netlify-cli) | `npm audit fix` (BEZ `--force`) | **kandidat za sljedeci PR**: lockfile promjena, zaseban pregled, `npm run check` poslije; NIJE izvedeno u ovoj grani jer `node_modules` dijeli junction s glavnim stablom dok gate radi |

Zabranjeno: `npm audit fix --force` (lomi `hunspell-asm`, vidi memoriju `npm-audit-nanoid-override`).

## Vlasnik i istek

| polje | vrijednost |
| --- | --- |
| vlasnik odluke | Daniel Risavi |
| istek iznimki A i B | 2026-10-09; nakon toga CI ratchet ostaje na 23, ali ovaj dokument vise ne vrijedi kao prihvacena iznimka i treba novu presudu |
| kriterij zatvaranja | `npm audit --audit-level=high` = 0 uz zelen `npm run check` na Node 20 i 24, pa ratchet spusten na novu vrijednost (smije samo padati) |

## Sto je PR #61 vec napravio

Ratchet (23) u `security-audit.yml` bez `continue-on-error`, `scripts/npm-audit-ratchet.mjs --selftest`,
mutacija `supply-chain/porast-nalaza-nevidljiv`. Bez toga bi grupa C mogla narasti neopazeno.

## Azuriranje 2026-09-09 (kasnije istog dana)

- PR #63: `npm audit fix --package-lock-only`, pun graf 23 -> 14 (grupa C zatvorena).
- Grana `deps/netlify-cli-27`: `netlify-cli` 26.2 -> 27.5.2, pun graf 14 -> 7. Preostalih 7: `@netlify/dev`, `@netlify/images`, `ipx`, `sharp`, `netlify-cli` (bez objavljenog popravka i u 27.x; iznimka grupe A ostaje do 2026-10-09) te `vite`/`vitest` (grupa B, zaseban PR s vitest 5).

## Ponovna provjera 2026-09-21

Provjera je ponovljena nad trenutačnim commitiranim `package-lock.json`, bez izmjene ovisnosti:

- `npm run audit:ratchet`: puni graf ima **7 high/critical** nalaza, jednako ratchetu 7.
- `npm audit --omit=dev --json`: produkcijski graf ima **0** low, moderate, high i critical nalaza.
- Trenutačne zaključane izravno važne verzije su `netlify-cli` 27.5.2, `vitest` 2.1.9,
  `vite` 8.1.4, `@netlify/dev` 5.0.5, `@netlify/images` 2.0.1, `ipx` 3.1.1 i `sharp` 0.34.5.
- `npm run check:edge-lock -- --selftest` prolazi s 11 zaključanih modula, a
  `npm run check:edge` prolazi za svih 27 Edge funkcija.
- Lokalni toolchain je Node 24.14.1, npm 11.11.0 i Deno 2.9.3. CI provjerava Node 20 i 24,
  instalira npm 11.11.0 i koristi Deno 2.x, što je usklađeno s `packageManager`, workflowom i
  `supabase/functions/deno.json`.

Ovo nije dokaz čiste instalacije: worktree trenutačno koristi junction na zajednički
`node_modules`, a `npm ls` zato prijavljuje ekstrane pakete iz drugih stabala. Čista `npm ci`
instalacija nije pokrenuta jer je na disku ostalo približno 262 MB; taj dokaz treba ponoviti u
izoliranom stablu čim bude dostupno dovoljno prostora. TypeScript i dalje namjerno obuhvaća samo
`src/`, dok se Edge kod provjerava zasebnim Deno gateom; izvan `src/` postoji 741 TypeScript/MTS
datoteka, pa se široko proširenje obuhvata ne uvodi bez zasebnog, scoped plana.

### Pokušaj čiste instalacije 2026-09-21

Na čistom worktreeu `t41-clean`, odvojenom na commitu `a820f2a6`, pokrenut je
`npm ci --ignore-scripts`. Instalacija je prekinuta s `ENOSPC` tijekom raspakiravanja,
pa nema dokaza da je puna čista instalacija završila. Privremeni worktree je uklonjen nakon
neuspjeha. Ovaj rezultat se tretira kao **nepoznato**, ne kao prolaz; ponavljanje traži barem
veličinu zaključanog `node_modules` stabla i dodatnu pričuvu prostora.

### Dopuna nakon čišćenja prostora 2026-09-21

Nakon uklanjanja starih runtime cacheva ponovljen je puni `npm ci` u čistom dependency sandboxu koji je sadržavao samo `package.json` i `package-lock.json`. Završio je s izlaznim kodom 0, uz `added 1152 packages`, bez `ENOSPC`; `npm ls --depth=0` je pokazao zaključane verzije iz manifesta. To potvrđuje reproducibilnost instalacije ovisnosti. Puna instalacija u source worktreeu i dalje ostaje nepoznata jer je zaseban checkout ponovno iscrpio raspoloživi prostor.
### Drugi puni source pokušaj 2026-09-21

Na commitu a762a5ce kreiran je puni source worktree t41-clean2. Nakon NTFS kompresije pokrenut je puni `npm ci`; raspoloživih približno 410 MB nakon checkouta nije bilo dovoljno, instalacija je završila kodom 1 zbog `ENOSPC` i worktree je uklonjen. Puna instalacija u source worktreeu zato ostaje nepoznata; dependency sandbox iz prethodne dopune ostaje jedini potvrđeni čisti install.

### Čista produkcijska instalacija 2026-09-22

U izoliranom Git worktreeu t41-clean-prod, sa sparse skupom koji uključuje package.json i package-lock.json, pokrenut je `npm ci --omit=dev --offline`. Završio je s izlaznim kodom 0, instalirao 22 produkcijska paketa i prijavio 0 ranjivosti. `npm ls --omit=dev --depth=0` je prošao bez ekstranih ili nedostajućih produkcijskih paketa. Puni razvojni graf i dalje nije stao na ovom disku; to ne mijenja rezultat produkcijskog audita.

## Svježi advisory snapshot 2026-09-22

`npm audit --json` nad aktualnim zaključanim grafom prijavio je 1 critical, 6 high i 3 moderate. Ratchet prati 7 high/critical; produkcijski `npm audit --omit=dev --json` ostaje na 0.

Preostalih sedam high/critical čvorova i njihov neposredni put:

| čvor | aktualni advisory | node u locku i izloženost | vlasnik, mitigacija i rok |
| --- | --- | --- | --- |
| `@netlify/dev` | high, dolazi preko `@netlify/images` | `node_modules/@netlify/dev`; razvojni Netlify CLI, ne ulazi u javni bundle | Daniel Risavi; lokalni/deploy pomoćnici izvan `npm run check`; zaseban PR, rok 2026-10-09 |
| `@netlify/images` | high, dolazi preko `ipx` | `node_modules/@netlify/images`; isti razvojni CLI put | Daniel Risavi; ograničenje na lokalni CLI i zaseban upgrade pregled; rok 2026-10-09 |
| `ipx` | high, dolazi preko `sharp` | `node_modules/ipx`; tranzitivni Netlify razvojni put | Daniel Risavi; ne koristi se u runtime bundleu, upgrade Netlify CLI u zasebnom PR-u; rok 2026-10-09 |
| `sharp` | high, libvips CVE-2026-33327/33328/35590/35591 i libheif GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545 | `node_modules/sharp`; razvojni Netlify/images put | Daniel Risavi; ne dolazi u javni bundle, provjera `netlify dev` nakon upgradea; rok 2026-10-09 |
| `netlify-cli` | high, put preko `@netlify/dev` i `@netlify/images` | `node_modules/netlify-cli`; lokalni CLI i deploy pomoćnici | Daniel Risavi; ne pokretati `npm audit fix --force`, zaseban major upgrade; rok 2026-10-09 |
| `vite` | high, optimized-deps map path traversal, Windows UNC NTLM hash disclosure, Windows alternate-path fs.deny bypass i esbuild | `node_modules/vite-node/node_modules/vite` i `node_modules/vitest/node_modules/vite`; razvojni server/test put | Daniel Risavi; server nije produkcijski endpoint, upgrade Vitest 5 u zasebnom PR-u; rok 2026-10-09 |
| `vitest` | critical, UI server arbitrary file read/execute i `@vitest/mocker` path traversal, uz vite/vite-node | `node_modules/vitest`; test runner u lokalnom/CI okruženju, nije runtime bundle | Daniel Risavi; ne izlagati Vitest UI, planirani major na 5.x uz puni gate; rok 2026-10-09 |

Tri moderate čvora (`@vitest/mocker`, `esbuild`, `vite-node`) su podčvorovi iste Vitest/Vite razvojne grupe i ne uvode dodatni runtime put. Sljedeća obavezna provjera je 2026-10-01, a nova presuda mora postojati prije isteka 2026-10-09.

## Puna čista razvojna instalacija 2026-09-22

Nakon čišćenja prostora kreiran je novi izolirani source worktree na commitu
`4ed205a3`. U njemu je `npm ci --ignore-scripts --prefer-offline` završio izlazom 0,
instalirao 1154 paketa i završio audit nad 1156 paketa. `npm ls --depth=0` završio je
izlazom 0 i pokazao zaključane izravne alate, uključujući `vite@8.1.4`, `vitest@2.1.9`,
`typescript@7.0.2` i `netlify-cli@27.5.2`. U istom čistom stablu `npm audit --omit=dev`
ima 0 low, moderate, high i critical nalaza, a `npm run audit:ratchet` javlja 7
high/critical, jednako stropu. Time je ponovljiva puna razvojna instalacija potvrđena;
upozorenje o 10 nalaza odnosi se samo na razvojni graf koji je već imenovan iznimkama.