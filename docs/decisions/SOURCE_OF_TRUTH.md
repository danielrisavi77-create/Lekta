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

## Obvezujuci dokazi Upisnika

Obvezujuca odluka mora imati doslovan citat iz registrirane snimke izvora, uz
provjeren sha256 snimke. HTML se cita samo iz vidljivog teksta po odlomcima, PDF kroz unpdf,
DOCX kroz readZip i XML parser, a DOC/DOT kroz word-extractor. Vanjski CSS i klase
se ne racunaju: element skriven samo klasom iz stylesheeta smatra se vidljivim. Nepodrzana vrsta
snimke i citat koji nije podniz jednog odlomka su problem. Koristi se `unpdf` 1.7.0, koji
nema `engines` ogranicenje (1.8.x trazi Node >=22); isti tekst stvarnih snimki izmjeren je na
Node 20 i 24, kao u CI matrici.

Gard citata stiti od gresaka agenata: izmisljenog citata, citata iz krivog dokumenta,
spajanja preko odlomaka te ocito skrivenog ili obrisanog teksta. Ne stiti od namjerno
konstruiranog sadrzaja koji vara parser. Poznata ogranicenja su CSS escapei i komentari
u inline `style`, klase i vanjski CSS, `opacity:0`, DOCX teme i uvjetno oblikovanje.

Skenirani PDF ima lokalno proizveden pratitelj `.snapshot-ocr.txt`. Prvi redak je
`# snapshotHash: <sha256 snimke>`, drugi `# ocrTextHash: <sha256 tijela>` (tijelo s
LF zavrsecima). Lokalni preduvjeti su tesseract 5.4, hrv/eng tessdata i PyMuPDF;
`scripts/ocr-snapshot.mjs` poziva `scripts/ocr_pdf.py`. OCR se ne pokrece u CI-ju.

Strojni OCR je pomocni tekst, ne dokaz: zaglavlje veze pratitelja uz PDF, ali ne
dokazuje da je tijelo tocan prijepis. Citat iz skena vrijedi samo kad je covjek
prijepis usporedio sa snimkom i u zapis registra upisao
`ocrTranscript: { textHash, verifiedBy, verifiedAt }` s istim hashem tijela. Bez
toga je ishod nepoznat i odluka ne prolazi. Stari `-ocr.txt` i `.ocr.txt` nisu
vezani uz snimku i nikad nisu dokaz.

Granica povjerenja registra (odluka 2026-10-04): `ocrTranscript` upisuje samo vlasnik ili
covjek kojeg vlasnik imenuje, nakon sto je prijepis usporedio sa snimkom. `verifiedBy` je ime
te osobe, nikad ime modela ili sesije. Agenti `ocrTranscript` ne upisuju i ne mijenjaju; zapis
ulazi samo kroz PR u kojem je vidljiv u diffu registra i prolazi pregled drugog providera. Gard
provjerava samo da potvrda postoji i da hash tijela odgovara; tko ju je dao, provjerava pregled.

Neregistrirani URL-ovi ostaju u
`data/programs/upisnik-evidence-snapshot-ratchet.json`; strop je 380 zapisa
i smije se samo smanjivati. Novi obvezujuci dokazi bez snimke i zastarjeli
ratchet zapisi zaustavljaju provjeru. Svaki ratchet zapis mora biti u zamrznutoj
osnovici `tests/fixtures/upisnik-snapshot-ratchet-baseline.json`; osnovica se
ne prosiruje i smije se samo smanjivati zajedno s ratchetom.
