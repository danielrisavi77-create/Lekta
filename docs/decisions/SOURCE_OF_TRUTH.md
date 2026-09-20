# Source of truth

## Profilna pravila

`ruleEntries` u `data/profiles/**/drafts/*.json` autorski su izvor istine.
Naslijedeni `rules` je agregat koji `src/profiles/rule-compiler.ts` prevodi u
`effectiveRules`. Analiza uvijek cita profil slozen kroz `composeAnalysisProfile`.

Bodovana vrijednost mora imati izvor, snapshot, lokator, doslovan citat i status
koji je cini izvedivom. `sourcePage` bez rucne potvrde ostaje `null`. Studentski
radovi nisu izvor pravila.

Usporedba zive vrijednosti i tvrdnje radi se po semantickoj osi koju engine cita.
Raskorak se biljezi u `data/verification/scored-value-drift.json`, a bodovanje se
demotira dok vlasnik ne donese presudu. Izracun raskoraka ne smije citati vlastitu
demotiju jer bi time sam izbrisao dokaz kvara.

## Slaganje profila

Kanonski redoslijed je: baseline ili profil, lagani rad, overlay katedre,
normalizacija zastavica, mentorov override, zatim scored/advisory demotija.
Specificniji izvor stiti samo dimenziju koju stvarno propisuje. Podprovjere prate
roditeljsku dimenziju u oba smjera.

## Identiteti

- Provjera: `check.id`, ne naslov.
- Javni PDF u `fieldValidation.publicSources`: PID, ne promjenjivi sha256 repozitorijskog downloada.
- Migracija: ime datoteke primijenjeno kroz `supabase db push`.
- Autor commita: ne izvodi se iz zajednickog Git identiteta ili `origin..HEAD`.

## Privatni podaci

`data/classification.json` odreduje smije li putanja u javni bundle. Posljednje
pravilo koje pogodi vrijedi. Nepoznata putanja mora srusiti build, ne dobiti
pretpostavljenu klasifikaciju.
