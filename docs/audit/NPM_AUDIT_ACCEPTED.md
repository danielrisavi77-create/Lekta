# npm audit: prihvaceni dev-only rizici

Datum odluke: 2026-07-12. Odluka: **PRIHVATITI + dokumentirati** (bez izmjene ovisnosti).

## TL;DR

`npm audit` prijavljuje **20 ranjivosti** (1 critical, 1 high, 14 moderate, 4 low).
**Sve su iskljucivo u DEV ovisnostima.** Produkcijski audit je cist:

```bash
npm audit --omit=dev --audit-level=high   # => found 0 vulnerabilities
```

Produkcijski bundle (statificki `dist/` na Netlifyju) NE sadrzi nijednu od pogodenih
ovisnosti. Nijedan napadacki put nije dostupan u nasem workflowu (v. nize). Zato su
prihvacene kao poznati dev-only rizik, a ne blokiraju launch.

## Dva klastera

### A) vitest lanac (6 vuln, ukljucuje critical + high)
`vitest`, `vite`, `@vitest/mocker`, `esbuild`, `vite-node`.

- **CRITICAL (vitest):** "When Vitest UI server is listening, arbitrary file can be
  read and executed." Pogadja `vitest --ui`. **Mi nikad ne pokrecemo UI** - CI i
  lokalni gate vrte `vitest run` (bez `--ui`). Povrsina ne postoji.
- **HIGH (vite):** path-traversal u optimized-deps `.map` handlingu vite DEV servera +
  launch-editor NTLMv2 na Windowsu. Pogadja `npm run dev` (lokalni dev server), ne
  produkcijski build. Netlify servira staticke datoteke; dev server nije izlozen.
- Popravak trazi **vitest 2 -> 4** (major). Uz prisutan `netlify-cli` to zahtijeva
  `--legacy-peer-deps` (peerOptional `@opentelemetry/api` napetost s netlify otel
  lancem), sto uvodi trajnu fragilnost svakog buduceg `npm install`. Nesrazmjerno
  dev-only riziku bez izlozenosti.

### B) netlify-cli lanac (14 vuln, sve moderate/low)
`netlify-cli`, `@netlify/*`, `@opentelemetry/*`.

- `netlify-cli` je rucni deploy alat: **ne poziva se ni iz jednog npm skripta**, nije
  u bundleu, ne koristi se u CI-ju.
- `npm audit fix` predlaze **downgrade** `netlify-cli 26 -> 24.0.1` (crvena zastava:
  vratio bi CLI unatrag zbog tranzitivnih OTel advisoryja koji ne uticu ni na sto).

## Zasto ne "npm audit fix"

`npm audit fix` (non-breaking) rjesava **0 od 20** (dry-run i dalje 20). Sve trazi
major bumpove (vitest 2->4 ili netlify-cli downgrade), a nijedan ne mijenja izlozenost
jer je rijec o dev tooling povrsinama koje ne koristimo.

## Vec postojece zastite

- `.github/workflows/security-audit.yml` vrti `npm audit --omit=dev --audit-level=high`
  (produkcijske ovisnosti moraju ostati 0; dev sum se namjerno izostavlja).
- `.github/dependabot.yml` ima `ignore: netlify-cli` (dominira lockfileom, dize se rucno).

## Kad ovo revidirati

- Ako `npm audit --omit=dev` ikad prijavi > 0 -> odmah rijesiti (to bi bila prava,
  produkcijska ranjivost).
- Ako pocnemo koristiti `vitest --ui` ili izlagati dev server -> critical/high postaju
  relevantni; tada napraviti vitest 2->4 migraciju.
- Alternativa koja cisti klaster B odjednom: izbaciti `netlify-cli` iz devDependencies
  i deployati preko `npx netlify-cli`. Time nestaje i OTel peer napetost pa vitest 4
  postaje cist install. Odluka odgodjena (mijenja deploy workflow).

## Re-verifikacija

```bash
npm audit --omit=dev --audit-level=high   # mora ostati: found 0 vulnerabilities
npm audit                                  # dev sum; usporedi klastere s gornjim popisom
```
