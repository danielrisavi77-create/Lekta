---
name: release-proof
description: Okida se kad treba svjez dokaz izdanja (RELEASE_PROOF) nad aktualnim masterom, kad je dokaz ZASTARJELO ili NE ZNAM, ili prije rucne objave. Omotac oko docs/deploy/RELEASE_PROOF_WORKFLOW.md.
---

# Dokaz izdanja

Kanonski postupak je `docs/deploy/RELEASE_PROOF_WORKFLOW.md` ("Postupak, osam koraka"). Ovaj skill
ga ne zamjenjuje; kaze kada i kako ga pokrenuti i sto se ne smije tvrditi.

## Kada

- Nakon spajanja koje dira pracene datoteke: dokaz nosi otisak stabla, pa svaka takva promjena
  cini dokaz ZASTARJELO. Tako se T72 stalno vraca.
- Prije svake objave. Objavu radi samo sesija u kojoj je vlasnik izravno dao rijec, na radnoj
  stanici (`lekta-protokol`, stavka 22).

## Preduvjeti

- Windows radna stanica s Wordom. Word razine bez Worda javljaju NEPOKRIVEN, a NEPOKRIVEN nije zeleno.
- Cist worktree tocno na `origin/master`; `git status` bez izmjena pracenih datoteka.
- `npm run tier2-freshness`: treba li Word dokaz uopce ponoviti.
- `node scripts/gate-preflight.mjs --check-only`: slobodan stroj. `release:check` ide kroz gate lock.

## Tijek

1. `npm run release:check -- --dry-run`: popis razina i dostupnost.
2. `npm run release:check`: sve razine i pecenje `docs/generated/RELEASE_PROOF.json`.
3. Proof-only commit: samo datoteka dokaza (`git commit --only docs/generated/RELEASE_PROOF.json`).
4. `npm run release:proof-gate -- --proof-only` prije gradnje.
5. Dalje tocno po koracima 6 do 8 dokumenta (produkcijska gradnja, objava, `post-deploy-smoke`
   uz `--strict-commit`). Objava je vlasnikova radnja.

## Sto se ne tvrdi

- "Dokaz svjez" bez SHA nad kojim je pecen i vremena (`lekta-protokol`, stavka 21).
- "Objavljeno" bez `post-deploy-smoke --strict-commit` nad zivom stranicom.
- Prolaz razine koja je NEPOKRIVEN ili preskocena.

## Izvjestaj

SHA mastera, popis razina s ishodom (prolaz, pad, NEPOKRIVEN), commit dokaza i sto ostaje vlasniku.
