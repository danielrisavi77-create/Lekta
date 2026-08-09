# P0: Status mjerenja u analizi DOCX-a

## Cilj

Spriječiti da se bodovi dodijele kada Lekta nije mogla pouzdano izmjeriti vrijednost. `pass` smije značiti samo izmjereno i usklađeno, dok se nečitljive vrijednosti prikazuju kao `unknown` i izostavljaju iz scorea.

## Opseg

Ova cjelina obuhvaća postojeće fail-open grane za dominantni font, veličinu osnovnog teksta, prored, poravnanje i margine. Obuhvaća i informativne provjere s `max === 0`, koje više ne smiju imati status `pass`. Ne uvodi canonical findings, readiness blokere, distribucijsku analizu formata niti refaktor ZIP konteksta.

## Dizajn

`Check` dobiva `measurementStatus` s vrijednostima `measured`, `unavailable`, `ambiguous` i `not-applicable`. Postojeće polje `evidence` ostaje radi kompatibilnosti s UI-em i starim potrošačima, ali se pri označavanju nečitljive vrijednosti postavljaju i `measurementStatus: 'unavailable'`, `status: 'unknown'`, `earned: 0` i `scored: false`.

`makeCheck()` za `max === 0` postavlja `status: 'info'`, `measurementStatus: 'not-applicable'`, `scored: false` i zadržava postojeću informativnu poruku. Bodovani izračun uključuje samo provjere sa `measurementStatus: 'measured'`; provjere s `unknown` ne ulaze ni u nazivnik ni u brojnik. Ako nema nijedne izmjerene bodovane provjere, score je `null`.

`verificationCoverage()` i dalje mjeri udio svih bodovanih provjera koje su stvarno izmjerene, uključujući nedostupne provjere u nazivniku. UI razrada scorea prikazuje samo izmjerene provjere, kako ne bi prikazala bodove za `unknown` nalaze.

## Testiranje

Testovi prvo zaključavaju promjenu na `makeCheck`, `markAssumedEvidence`, izračunu scorea i sintetičkom DOCX rezultatu. Golden normalizacija ostaje nepromijenjena za postojeće determinističke vrijednosti, a očekivanja koja su izričito dokumentirala staro fail-open bodovanje ažuriraju se na novi ugovor.

## Neobuhvaćeno

Canonical `Finding` model, readiness/blockers, score iz strukturiranih analyzera, compliance distribucije, compatibility corpus, `AnalysisContext`, jedinstveni XML parser i endnotes ostaju zasebne cjeline.
