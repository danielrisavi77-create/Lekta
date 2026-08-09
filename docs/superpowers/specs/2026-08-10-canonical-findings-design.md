# Canonical findings za rezultat DOCX analize

## Cilj

Uvesti jedan aditivni model nalaza za postojeći engine tok `checks[]` i `issues[]`,
bez rušenja starog API-ja, scorea, triagea, repair panela ili specijaliziranih
`details` analizatora.

## Opseg prve cjeline

Ova cjelina normalizira samo rezultate koji već postoje u `Check` i `Issue`
zapisima. Specijalizirani analizatori u `details`, readiness blokatori,
distribucijska analiza formata i migracija scorea ostaju zasebne cjeline.

Rezultat analize dobiva novo polje `findings`. Postojeća polja `checks`, `issues`,
`categories` i `details` ostaju nepromijenjena radi kompatibilnosti s UI-em,
workerom, reportom, repair tokom i integracijama.

## Model

Novi `CanonicalFinding` u `src/analysis/canonical-findings.ts` nosi:

- stabilni `id`,
- `checkId` ako nalaz proizlazi iz provjere, inače `null`,
- rezervirani `ruleId`, trenutno `null` dok se ne uvede policy adapter,
- kategoriju, naslov, opis i ozbiljnost,
- `status` i `measurementStatus`,
- lokacije kao konzervativni `where` zapisi bez izmišljanja paragraph sidra,
- tekstualne evidence zapise koji se na mrežnoj granici redaktiraju,
- `scored` i `scoreImpact` kao `{ earned, max } | null`,
- `blocking`, trenutno `false` jer readiness policy nije dio ove cjeline.

Jedan `Check` proizvodi jedan canonical nalaz. Njegov pripadajući `Issue`, ako
postoji, obogaćuje isti zapis. Top-level `Issue` koji se ne može upariti s
provjerom proizvodi zaseban nalaz s `checkId: null` i bez bodovnog utjecaja.

`scoreImpact` se postavlja samo za provjeru koja zadovoljava postojeći
`isScoreEligible` kriterij. Informativne i nedostupne provjere imaju `null`, pa
canonical model ne može slučajno vratiti bodove za neizmjeren rezultat.

## Identitet i kompatibilnost

Canonical adapter ne preimenuje postojeći `Check.id`. Identitet provjere je
`check:<checkId>`. Neupareni issue dobiva deterministički `issue:<slug>` ključ,
a duplikati dobivaju redni sufiks prema ulaznom redoslijedu. Triage identity,
`FindingViewModel.id` i integracijski `issueKey` ostaju zasebni adapteri dok se
ne uvede zajednički policy sloj.

UI projekcija preferira `result.findings` kad je polje prisutno, ali zadržava
legacy fallback na `issues`, čime stari testni i integracijski ulazi ostaju
valjani.

## Privatnost

Canonical evidence i detail mogu sadržavati tekstualne isječke jer ih lokalni
UI treba prikazati. Za serverski payload `sanitizeAnalysisResult` ih ne smije
slati, čak ni kada ne prepoznaje obrazac `odlomak N: tekst`; tekstualna polja
canonical nalaza zato se izostavljaju ili svode na prazne vrijednosti. Finding
ID ne smije sadržavati čitljiv slug lokacije, nego samo deterministički hash.
Lokacije u mrežnoj kopiji smiju zadržati samo sigurne numeričke oznake, primjerice
`odlomak 7`, a ostale se izostavljaju.

Canonical UI mora koristiti issue podatke kada postoje: naslov i opis problema,
`check.detail` kao izmjereni dokaz, triage lokacije, `matchKeys` za check i issue
te postojeće repair/tool/session ponašanje. Informativni `not-applicable` check
bez issuea nije otvoreni problem dokumenta; `unknown` i `ambiguous` su ograničenja
automatizirane provjere, ne dokaz greške u radu.

## Testiranje

TDD redoslijed je obavezan:

1. testovi modela i adaptera prvo moraju pasti,
2. implementirati minimalni adapter,
3. testirati rezultat direktnog analyzera,
4. testirati worker i inline fallback kompatibilnost,
5. testirati UI projekciju s canonical i legacy ulazom,
6. testirati sanitizaciju privatnih tekstualnih podataka,
7. pokrenuti ciljane testove, TypeScript, build i puni `npm run check`.

## Neobuhvaćeno

Ova promjena ne odlučuje je li nalaz blocker, ne mijenja broj bodova, ne uvodi
structured analyzer findings i ne uklanja postojeće `details` strukture.
