# Testovi, gardovi i mutacije

Ove upute vrijede za `tests/**`. Globalna pravila iz root `CLAUDE.md` ("Verifikacijska disciplina")
i dalje vrijede. Puni popis klasa kvarova je u `.claude/skills/lekta-protokol/SKILL.md`; ovdje su one
na koje pada test ili gard (4. 10. 2026: 8 od 10 PR-ova palo je u prvoj rundi pregleda na njima).

## Gard i njegova mutacija

- Svaki novi gard ima cisti baseline i mutaciju u `tests/gate-mutations.test.ts` ili domenskoj
  datoteci `tests/gate-mutations-<domena>.test.ts`. Obrazac je helper u
  `tests/helpers/<ime>.ts` koji vraca popis problema (prazan je cisto) nad tablicom scenarija; test
  tvrdi `toEqual([])`, a mutacija tvrdi tocan popis problema koji mutant izaziva (primjeri:
  `weak-machine.ts`, `supabase-mcp-guard.ts`).
- Mutacija mijenja IZVOR ili presudu, ne ulaz, fixture ni testni predikat. Mutant koji prepisuje
  rezultat nakon stvarnog poziva ne dokazuje nista. Kopija izvora za mutaciju zivi u privremenom
  direktoriju, nikad u repozitoriju.
- Gard trazi tocnu vrijednost (`=== 400`), ne "bilo koji broj", i mjeri izvrseno ponasanje, ne
  `includes()` nad tekstom izvora (zakomentiran redak i dalje "postoji").
- Gard koji se ne poziva ne stiti: provjeri i registraciju (hook matcher, npm skripta, CI korak),
  ne samo presudu. Primjer: do 2026-10-08 `tool-guard` je zabranjivao MCP `apply_migration`, ali
  matcher hooka nije ukljucivao MCP alate.

## Svojstva i generatori

- Generator mora dokazati da proizvodi ciljanu klasu ulaza (valjan OPC kostur, relacije, kvota po
  fixeru), ne samo da "dokument se promijenio".
- Svako svojstvo ima vlastitu negativnu kontrolu koja obara bas njega.
- Idempotencija se dokazuje dvama prolazima; drugi mora biti no-op (ista referenca ili isti bajtovi).

## Usporedbe i fixture

- Tekstualne usporedbe normaliziraju CR (`readTextLf` i slicni helperi); binarne fixture usporedjuju
  sirove bajtove. Repozitorij je LF (`.gitattributes`), ali Windows checkout starijih klonova nije.
- Podatke parsiraj, ne greppaj. Djelomican pad pipelinea mora oboriti mjerenje.
- Regresije se imenuju po identitetu nalaza, ne broje.
- Popravak parsera dolazi s tri do pet susjednih oblika koje popravak NE smije dirati.
- Studentski radovi sluze samo regresiji parsera.

## Pokretanje

- Vitest samo kroz `node scripts/with-gate-lock.mjs <oznaka> -- npx vitest run <datoteke>` (hook
  `cpu-discipline` odbija ostalo). Puni gate je `npm run check`.
- Zeleni izlazni kod bez retka `Test Files` nije dokaz.
- `tests/conformance/**`, `tests/ux/**` i `tests/ux-dist/**` nisu u `npm run check`; imaju vlastite
  konfiguracije i workflowove.
- Zadani timeout je 15 s, hook 30 s (`vitest.config.ts`); test koji treba vise deklarira vlastiti
  timeout uz izmjereno trajanje.
