# Opseg i metodologija audita

Datum: 16. srpnja 2026.
Auditor: Claude (multi-agent orkestracija, 12 findera + 5 adversarijalnih verifiera + sinteza).

## Stanje repozitorija u trenutku audita

- Glavni repo HEAD: `dcfbc6f49e038f3c66096b921eb097e5fd705507` (`dcfbc6f`).
- Ugniježđeni `lekta-pipeline/` HEAD: `36174c94bca4a2a91ab61f2b9f3659f13ab0369e` (`36174c9`), radno stablo čisto.
- Radno stablo glavnog repoa: 35 tracked promjena + ~20 untracked stavki (necommitano). Sve `file:line` reference u ovom auditu vrijede za radno stablo na dan 2026-07-16, ne za bilo koji commit.

## Preduvjet: zeleno stanje (verificirano prije audita)

| Provjera | Naredba | Rezultat |
| --- | --- | --- |
| Glavni gate | `npm run check` (tsc --noEmit && vitest run && vite build) | exit 0, 129/129 test datoteka passed |
| Python pipeline | `python -m pytest -q` (u lekta-pipeline/) | exit 0, 131 passed |
| DOCX smoke | `npm run docx-smoke` | exit 0 |

`artifacts/` i `dist/` (output docx-smoke i build) su gitignorirani; verifikacija nije zaprljala radno stablo.

## Necommitane tematske grupe (kontekst za nalaze)

1. Revert K4/K5 repair fixera (pageNumberingFixer, footerPageFixer) uz regeneraciju 3 golden snapshota i brisanje 2 kolokirana testa.
2. Uklonjen Codex launcher (5 datoteka + npm script).
3. Uklonjen academic-repository/rights inventory podsustav (2 CI workflowa + 6 Python datoteka + overrides).
4. Novi `m4_corpus` preflight tier + CORPUS_* kodovi.
5. Redizajn demo videa: obrisani committani `public/assets/demo.mp4|webm`, dodani untracked `demo-{720,1080,1440}.{mp4,webm}`; `index.html` referira `demo-1080.*`.
6. 4 sigurnosna dokumenta (SECURITY_AUDIT.md, THREAT_MODEL.md, SECURITY_REMEDIATION_PLAN.md, SECURITY_TEST_PLAN.md), 14.7.2026.
7. Privremene dev skripte `_preflight_*.mts` + `vite.dev-preflight.config.mts` ("ne commitati", nisu gitignorane).
8. Sitni cleanup analize (uklonjen introParagraphIndex izlaz).
9. Ugniježđeni `lekta-pipeline/` repo + untracked `data/sources/algebra/algebra-pravilnik-2025.pdf`.

## Veličine untracked binarnih artefakata

- Demo video (6 datoteka): 720p 1,4/1,7 MB, 1080p 2,5/2,6 MB, 1440p 3,6/3,7 MB (ukupno ~15,5 MB), namijenjeni commitu.
- `lekta-pipeline/` baze (ignorirane unutar ugniježđenog repoa): korpus.db 1,4 GB, korpus-50k.db 166 MB, korpus-sample.db 13 MB.
- `data/sources/algebra/` 380 KB (PDF pravilnik).

## Metodologija

- Wave 1: 12 finder agenata (D1-D12), striktno read-only, standardizirani format nalaza (severity, file:line, dokaz, reprodukcija, preporuka, veza na LEKTA-SEC-xx).
- Dedup: globalni ID-jevi AUD-NN, grupiranje po domeni.
- Wave 2: 5 adversarijalnih verifiera po domeni (TS kod, sigurnost, Supabase, Python, data/testovi/docs). Svaki nalaz dobiva verdikt CONFIRMED / PLAUSIBLE / REJECTED uz korekciju severityja.
- Wave 3: sinteza s delta usporedbom prema SECURITY_AUDIT.md (14.7.).

## Što NIJE pokriveno (granice audita)

- Bez pristupa Supabase/Netlify/Lemon Squeezy dashboardima: RLS na živoj bazi, Auth konfiguracija, aktivnost pg_cron jobova, produkcijski HTTP headeri i tajne nisu potvrđeni iz repoa (samo iz koda i migracija).
- Bez slanja stvarnih dokumenata, bez izvršavanja napada (PoC su statička analiza/reasoning).
- Dinamička analiza ograničena na postojeće testove i statičko čitanje; nije rađen živi penetration test.
