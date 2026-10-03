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

## Azuriranje 2026-09-30

PR #236 zatvorio je tada poznati dug punog grafa: Vitest/Vite i Netlify alatni lanac bili su
nadogradjeni tako da je `npm audit --audit-level=high` izmjerio **0 high/critical**, a
`data/security/npm-audit-ratchet.json` spusten je na 0 bez aktivnih iznimki. Time su ranije
iznimke A i B zatvorene; tablice iznad ostaju povijesni zapis odluke iz 9. rujna, ne aktualno stanje.

## Novi vanjski advisory 2026-10-02: node-forge / Netlify tooling

Dana 2. listopada 2026. `security-audit` je poceo padati bez promjene dependency grafa.
Isti cache kljuc izveden iz `package-lock.json`
`646dced83ea0188d187d0458af58f85ebe0b3fe14d9a0d08ba83b8e04f7f57ac`
bio je 30. rujna zelen s 0 high/critical, a 2. listopada npm audit prijavljuje sest high
identiteta:

- `@netlify/dev`
- `@netlify/images`
- `ipx`
- `listhen`
- `netlify-cli`
- `node-forge`

Svi vode na isti tranzitivni uzrok:
`netlify-cli 27.10.2 -> @netlify/images 2.0.1 -> ipx 3.1.1 -> listhen 1.10.1 -> node-forge 1.4.0`.

Izvorni nalaz je GHSA-86w9-cpqp-85rv / CVE-2026-85393, RSA PKCS#1 v1.5 signature-verification
bypass u `node-forge`. Na dan ove odluke:

- `netlify-cli 27.10.2` je aktualni npm latest;
- `node-forge 1.4.0` je aktualni npm latest;
- upstream popravak postoji kao otvoreni `digitalbazaar/forge#1152`, s testom i planiranim
  CHANGELOG unosom za 1.4.1, ali nije spojen niti objavljen;
- `npm audit fix --force` predlaze downgrade Netlify CLI-ja na 23.x, sto nije prihvatljiv
  sigurnosni popravak bez zasebne kompatibilnosne validacije;
- produkcijski graf `npm audit --omit=dev --audit-level=high` ostaje **0**.

### Reachability i mitigacija

`node-forge` ulazi kroz `listhen`, koji ga koristi u razvojnom HTTP listeneru za HTTPS /
self-signed certificate funkcionalnost. Kanonski Lektin local-repair release put koristi
Netlify naredbe `status`, `build` i `deploy`; ne koristi `netlify dev --https`.
Do zakrpe je zato zabranjeno uvoditi ili koristiti Netlify lokalni HTTPS dev server u
release procesu.

Ovo nije tvrdnja da je ranjivost uklonjena. To je vremenski ograniceno prihvacanje dev-tool
rizika uz cist produkcijski graf.

### Privremena ratchet odluka

| polje | vrijednost |
| --- | --- |
| vlasnik | Daniel Risavi |
| advisory | GHSA-86w9-cpqp-85rv / CVE-2026-85393 |
| zahvaceni ratchet identiteti | `@netlify/dev`, `@netlify/images`, `ipx`, `listhen`, `netlify-cli`, `node-forge` |
| produkcijski graf | 0 high/critical, mora ostati blokirajuci |
| sljedeci pregled | 2026-10-05 |
| istek | 2026-10-09 |
| kriterij uklanjanja | objavljen `node-forge >=1.4.1` ili Netlify izdanje koje vise ne vuce ranjivi lanac; zatim puni audit 0 i ratchet natrag na 0 |

Ako upstream zakrpa izadje prije 9. listopada, iznimka se uklanja odmah; rok nije razlog za cekanje.

