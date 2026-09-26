# Repair Engine

Ove upute vrijede za `src/repair/**`. Globalna pravila iz root `CLAUDE.md` i dalje vrijede.

## Granica proizvoda

Popravak je deterministican. Nema modela ni prompta. Recept je niz
`{ fixerId, ruleId, params }`, a fakultetske razlike dolaze iz podataka profila.

Vidljivi autorski tekst mora ostati isti prije i poslije Word `Fields.Update()`.
Smiju se mijenjati stilovi, polja, sidra, numeracija i OOXML relacije. Namjerne
iznimke su samo:

- `heading-case-fixer`
- `croatian-typography-fixer`
- kanonizacija DOI-ja
- `toc-field-fixer`, jer Word izvodi sadrzaj iz stvarnih naslova
- `required-section-fixer`, samo za propisani natpis iz verificiranog pravila, uz potvrdu

Preporuka bez fakultetskog pravila smije biti ponudena samo kao `violated:false`,
`recommended:true`, bez `matchKeys`, bez utjecaja na ocjenu i bez umetanja novog teksta.
Pisanje ili prepravljanje recenica i generiranje sadrzaja ostaje zabranjeno.

## Autoritet parametara i identitet provjere

- Klijent gradi zahtjev preko `src/ui/repair-items.ts`.
- Za poznat `(profileRef, ruleId)` ciljanu vrijednost izvodi server preko
  `src/repair/param-authority.ts`; klijentova se vrijednost ignorira.
- Klijentov `params` vrijedi samo kad fakultetsko pravilo ne postoji, a odgovor to
  mora oznaciti kroz `paramSources`.
- Identitet provjere je `check.id`, ne lokalizirani naslov. `check-fixer-map.ts`
  zato mora ostati kljucan po `checkId`.
- Jedinstvene granice dokumenta zive u `src/repair/docx-budget.ts`. Analiza i
  popravak nemaju iste mogucnosti, pa se jaz izrazava kroz `docxCapability()`.

## Sastavljanje profila

Analiza cita rezultat `composeAnalysisProfile`, ovim redom: baseline ili profil,
lagani rad, overlay katedre, normalizacija zastavica, mentorov override, zatim
scored/advisory demotija. Demotija ide zadnja.

Specificniji izvor stiti dimenziju samo ako je stvarno propisuje vrijednoscu ili
ukljucenom boolean zastavicom. Gola ili iskljucena zastavica nije propis. Roditelj
i podprovjere stite se zajedno.

## Isporuka i backend tok

- `detectPassRegressions` ide prije preporuke za preuzimanje.
- Uz regresiju je izvorni dokument glavna ponuda; popravljeni ostaje dostupan kao
  sporedan izbor. Dokument se nikad ne zarobljava.
- Dokument ide na server samo za popravak. `source-check` je zaseban usporedni poziv.
- Pozadinska pohrana koristi `EdgeRuntime.waitUntil`. Dok je `storagePending`, UI
  ne smije tvrditi da je dokument spremljen.
- Promasaj u korpusu nikad nije dokaz da izvor ne postoji.

## Generirani artefakti

`docs/REPAIR_RECIPE.md` i `data/generated/repair-params-by-profile.json` generiraju
se naredbom `npm run repair-recipe`. Ne uredjuj ih rucno. Regeneracija ide samo u
cistom izoliranom stablu, a izvor i izvedeni artefakt ulaze u isti commit.

## Obvezna provjera

Za svaku promjenu fixera treba ciljani regresijski test i dokaz idempotencije kroz
DVIJE primjene; druga mora biti no-op. Test vidljivog teksta cita spojeni tekst
odlomka, ne sirovi XML.

`npm run check` daje samo Tier 0. Prije deploya repair motora pokreni:

```bash
npm run verify:strict-open:repaired
npm run tier2-freshness
npm run verify:word
npm run verify:word:worst
npm run verify:word:corpus
npm run verify:word:toc
```

Sve cetiri Word razine su obvezne u dokazu izdanja; `verify:word:toc` je i izravni dokaz za `toc-field-fixer`.
`verify:strict-open` bez `:repaired` provjerava ulazne fixture i nije dokaz motora.
Preskocena Windows razina nije prolaz.

Postojeci Word oracle je u `scripts/word-verify/`. Ne zamjenjuj ga vlastitim.
`@xmldom/xmldom` nije strogi parser: neispravan XML moze prihvatiti bez iznimke.
Test isporuke mora izricito tvrditi `integrityFailure === null`, jer odbijeni
popravak vraca ulazne bajtove i prazan changelog.

## Ključni gardovi

- `tests/repair-param-authority.test.ts`
- `tests/repair-delivery-order.test.ts`
- `tests/check-fixer-map.test.ts`
- `tests/repair-package-integrity.test.ts`
- `tests/repair-golden.test.ts`
- `tests/composed-profile.test.ts`
- `tests/conformance/composed.test.ts`

Netrivijalna promjena trazi adversarijalni pregled drugog alata prije commita.
