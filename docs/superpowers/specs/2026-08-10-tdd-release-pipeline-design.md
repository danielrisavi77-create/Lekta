# TDD Release Pipeline Design

**Datum:** 2026-08-10

**Opseg:** CI gateovi za PR, verification prije deploya, review i staged release

## Cilj

Uvesti reproducibilan TDD release pipeline za LEKTA koji svaki PR provjerava kroz
brzi build gate, UX, security, conformance, strict-open i puni closed-loop repair
gate, a prije objave dodatno zahtijeva Word verification i staging smoke.

## Trenutno stanje

Repozitorij već ima ove workflowe:

- `.github/workflows/check.yml` pokreće `npm run check` na Node 20 i 24 te UX gate.
- `.github/workflows/docx-strict-open.yml` pokreće Tier 1 provjeru ulaznih i
  popravljenih DOCX paketa.
- `.github/workflows/conformance.yml` pokreće punu profilnu conformance matricu.
- `.github/workflows/security-audit.yml` pokreće npm audit i gitleaks.
- Word COM provjere postoje kao ručni Windows gateovi `verify:word` i
  `verify:word:worst`.

Nedostaje zaseban CI workflow koji pokreće `npm run test:slow`, jer je taj suite
namjerno izuzet iz redovnog `npm run check` zbog trajanja.

## Dizajn

### PR gateovi

Dodaje se `.github/workflows/repair-slow.yml`:

- triggeri su `push`, `pull_request` i `workflow_dispatch`;
- koristi Node 24, `npm ci` i `npm run test:slow`;
- ima `permissions: contents: read`;
- ima timeout dovoljan za svih 398 closed-loop testova;
- ne koristi tajne, bazu ni mrežne servise osim instalacije dependencyja.

Postojeći workflowi ostaju odvojeni kako bi se rezultat svakog rizika vidio
pojedinačno. `npm run check` ostaje tvrdi lokalni gate, a `test:slow` postaje
obavezni repair gate na PR-u.

### TDD pravilo za buduće promjene

Svaki novi repair ili promjena ponašanja mora imati ovaj redoslijed:

1. napisati minimalni reprodukcijski test;
2. pokrenuti test i potvrditi očekivani RED rezultat;
3. implementirati najmanju promjenu;
4. pokrenuti ciljani GREEN test;
5. pokrenuti `npm run check` i po potrebi `npm run test:slow`;
6. provjeriti diff, reviewati i tek onda commitati.

Za postojeću promjenu pipelinea test je workflow validacija: konfiguracija mora
imati točan naziv skripte, Node verziju, dependency instalaciju, trigger i
read-only permissions. CI lint ili YAML parser mora prvo dokazati da je testni
workflow neispravan prije minimalne korekcije ako se takav test može dodati bez
novog produkcijskog ponašanja.

### Verification prije releasea

Prije mergea:

- svi PR workflowi moraju biti zeleni;
- lokalno mora proći `npm run check`;
- lokalno mora proći `npm run test:slow`;
- `npm run verify:strict-open` mora potvrditi Tier 1.

Prije deploya repair enginea na staging ili produkciju, na Windowsu se ručno
pokreću `npm run verify:word` i `npm run verify:word:worst`. Word COM provjera
ostaje ručna jer CI runner ne pruža pouzdanu instalaciju Microsoft Worda.

### Release redoslijed

1. Push grane i otvaranje draft PR-a prema `master`.
2. CI gateovi i code review.
3. Merge nakon zelenih gateova.
4. Staging deploy kroz postojeći Netlify build lanac, zatim post-deploy smoke.
5. Produkcijski deploy tek nakon potvrđenog staginga, Word verificationa i
   provjere deploy artefakta kroz `scripts/verify-deploy-dist.mjs`.

Pipeline ne uvodi automatsko preskakanje staginga niti automatsko pokretanje
produkcijskog deploya iz PR workflowa. Produkcijski deploy ostaje eksplicitna
operativna odluka vlasnika repozitorija.

## Neobuhvaćeno

- Ne mijenja se parser, audit, citation engine ni repair engine.
- Ne uvode se tajne, Supabase migracije ni novi backend endpointi.
- Ne automatizira se Word COM u GitHub Actions.
- Ne mijenja se postojeći Netlify build lanac.

## Kriteriji prihvaćanja

- `repair-slow.yml` postoji i validno poziva `npm run test:slow`.
- Workflow je read-only i radi na Node 24 nakon `npm ci`.
- `npm run check` i `npm run test:slow` prolaze lokalno.
- `npm run verify:strict-open` prolazi prije mergea.
- Word gateovi su zabilježeni prije repair deploya.
- PR, merge, staging smoke i produkcijski release slijede navedeni redoslijed.
