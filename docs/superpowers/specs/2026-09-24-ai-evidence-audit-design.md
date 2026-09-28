# Dizajn: dokazni AI-audit fakultetskih pravila

## Svrha i granice

Aktualni cilj programa je dovesti svih 407 fakultetskih profila na razinu A. Razina A dodjeljuje se samo profilu s valjanim, dopuštenim i svježim dokazom na stvarnom DOCX-u; sintetički prolaz ne može sam podići profil na A. Razina B je međukorak, ne završni kriterij. Bez stvarnog dokaza profil ne smije prijeći iznad B, a ako ne ispunjava uvjete za B ostaje niže. Tri pravna profila izvan fakultetskog registra prikazuju se i prate odvojeno, izvan nazivnika fakultetskog cilja. Ovaj dizajn zamjenjuje ljudsku potvrdu pravila provjerljivim AI-dokaznim lancem. Ne mijenja značenje razina: B i dalje traži službena pravila, deterministički popravak i prolaz na generiranom dokumentu; A traži i dokaz na dopuštenom stvarnom radu.

Audit se provodi po pravilu, ne samo po profilu. Jedno pravilo bez potpunog lanca ostaje nebodovano, a profil ne doseže B ako mu zbog toga nedostaje obvezna pokrivenost. Neslaganje, dvosmislen modalitet/opseg ili nedostupan službeni izvor znače `insufficient`, ne ljudski red čekanja i ne automatsko prihvaćanje.

## Utvrđeno postojeće stanje

- `approveFromAi` već traži tri prolaza (`extract`, `quote-check`, `refute`), ali još traži `approver`, zapisuje ljudski `verified` ledger red i odbija neslaganje prema ručnoj provjeri.
- `AiEvidence` trenutačno sadrži prolaze i sažetak, ali ne veže strojno vrijednost, opseg, modalitet i rezultat testa uz snapshot izvora.
- Aktualni `completion-ledger.json` broji 410 profila: A 38, B 300, C 8, D 42, E 48. Svih osam C profila imaju sintetički prolaz i fakultetske popravke, a `owner-bulk-approval` je njihov preostali ljudski blocker.
- Četiri korištena službena snapshotova postoje i njihov SHA-256 odgovara registru. EFFECTUS-ove službene [upute iz 2025.](https://effectus.com.hr/wp-content/uploads/2025/03/Upute-za-pisanje-strucnih-seminarskih-zavrsnih-i-diplomskih-radova.pdf) i [izmijenjeni pravilnik iz 2026.](https://effectus.com.hr/wp-content/uploads/2026/04/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2026.pdf) pokazuju zašto se aktualnost mora provjeravati, a ne zaključiti iz stare interne potvrde. To samo po sebi ne dokazuje da se ijedna ciljna vrijednost promijenila.

## Odabrani pristup

Sačuvati postojeći AI-prolaz kao pripremu semantičke procjene, ali bodovanje vezati uz zaseban, strukturiran artefakt koji deterministički validator provjerava. Samo `agree: true`, tri prolaza ili tekstualni sažetak nisu dokaz.

Svaki artefakt pravila nosi:

1. Identitet: `profileId`, `ruleId`, `sourceId`, službeni URL, datum dohvaćanja, lokator stranice/odjeljka te SHA-256 stvarnog lokalnog snapshota.
2. Tvrdnju: doslovni citat iz snapshota, izdvojenu ciljnu vrijednost, modalitet i opseg, svaki vezan uz citat/lokator.
3. Usporedbu: vrijednost iz audita mora strukturno odgovarati `RuleEntry.value`; opseg i modalitet moraju odgovarati poljima pravila. Citat se mora pronaći u sadržaju snapshotova nakon samo dokumentiranog normaliziranja završetaka redaka i ponovljenih razmaka, bez uklanjanja dijakritike ili promjene riječi.
4. Izvršni dokaz: ID testa/provjere, točnu naredbu ili naziv provjerljivog postupka, ishod, vrijeme izvođenja, ulazni i izlazni hash. Za profil B to je ponovljiv generirani closed-loop dokaz; za A to je postojeći dokaz stvarnog DOCX-a s pravima korištenja, pseudonimizacijom, hashovima i provjerom nepromijenjenog vidljivog teksta.
5. Trag AI-audita: uloge prolaza, identitet/model/verzija dostupna u izvođenju, kratki zaključak i hash ulaza/izlaza. Ne pohranjuje se skriveno rezoniranje.

Zaseban validator neovisno provjerava strukturu, snapshot hash, službeni autoritet, citatno podudaranje, vrijednost i vezu s izvršnim dokazom. Uloge AI prolaza same po sebi ne računaju se kao neovisna potvrda: dokazni lanac dodatno mora sadržavati strojno provjeren izvor i hashiran rezultat izvršnog testa ili DOCX oraclea. Opseg/modalitet bez jasnog tekstualnog uporišta ili uz proturječne prolaze ostaje nebodovan. Promjena snapshotova poništava vezu `verifiedHash` i zahtijeva novi audit.

Dokaz se pohranjuje uz pojedino pravilo u privatnom `data/profiles/<unit>/drafts/*.json` polju `aiEvidence`; ne ulazi u javnu runtime projekciju. Referenca na test mora razrješavati manifest koji je proizveo postojeći closed-loop/oracle harness, s ulaznim i izlaznim hashovima. Ručno sastavljen JSON koji sam sebe proglašava prolaznim nije izvršni dokaz.

## Stanja i posljedice

- Potpun, dosljedan AI-dokazni artefakt postavlja pravilo u `verified` uz `confirmedVia: ai-evidence-audit`; ledger bilježi `ai-confirmed` s akterom `ai-evidence-audit`. Ljudski `approver` i ljudski `verified` ledger zapis nisu uvjet.
- Nepotpun, zastario ili proturječan artefakt ne mijenja bodovani status i bilježi konkretan razlog. Ne šalje se na ručnu provjeru.
- Profil može prijeći na B samo kad njegova potrebna pravila, deterministički popravak i generirani dokument prolaze postojeća vrata.
- Profil može prijeći na A samo preko stvarnog, dopuštenog DOCX dokaza. AI-audit ili sintetički test ne smiju sami podići A.
- Postojeći `owner-bulk-approval`, `ai-1pass-batch` i `ai-3pass-batch` zapisi ne postaju automatski dokazni AI-auditi. Svaki se mora ponovno dokazati novim artefaktom.

## Testiranje i gardovi

- Test-first promjena `verification-actions`: potpuni dokaz prihvaća se bez `approver`; manjkajući citat, krivi hash, nepodudarna vrijednost, opseg/modalitet, neuspjeli test ili `agree: false` odbacuju se.
- Test za `verification-gate` i `completion-ledger`: samo valjan artefakt uklanja `bulk-pending`; neispravan dokaz nikad ne podiže razinu.
- Baseline i negativne mutacije dokazuju da validator prihvaća čisti primjer i hvata svaki navedeni kvar, uključujući `ai-evidence-audit` bez artefakta.
- Integracijski test za svih trenutačnih osam C profila provjerava da rezultat proizlazi iz svakog pojedinačnog pravila i dokaznog zapisa, a ne iz same oznake profila.
- Prije dovršetka: ciljani testovi, mutacijski gardovi, regenerirani completion ledger i završni izolirani `npm run check`. O stvarnim DOCX dokazima izvještava se odvojeno od sintetičkih.

## Granice prvog implementacijskog paketa

Ovaj prvi paket ne izmišlja pravila, ne proširuje profilne vrijednosti bez službenog izvora, ne snižava kriterije A/B i ne označava profil A bez stvarnog dopuštenog DOCX dokaza. Ne prikuplja dokumente bez postojeće privole i pravne osnove. Nakon uklanjanja ljudskog audita kao softverskog gatea, program se nastavlja svježim radnim popisom za svaki profil ispod A: nedostajuća bodovana pravila rješavaju se samo iz službenih izvora, nedostajući popravci samo deterministički, a nedostajući A dokaz samo kroz dopušteni stvarni korpus. Nedostupan izvor, fixer, dokument ili pravo korištenja ostaje eksplicitna prepreka; nikad se ne pretvara u prolaz.

## Odabrane granice implementacije

- `aiEvidence` ostaje u privatnim profilnim nacrtima; javni profilni paket ne dobiva audit tekst, snapshot sadržaj ni pojedinosti korpusa.
- Izvršni dokaz dolazi iz postojećeg harness manifesta i provjerava se prema hashovima; validator ne prihvaća samoprijavljeni `pass` bez razrješive izvedbe.
- Migracija se vodi svježim worklistom svih pravila označenih `owner-bulk-approval`, a ne tvrdokodiranim brojem osam. Osam trenutačnih C profila prvi su ciljni skup, bez masovnog prihvaćanja.
- Promjena službenog snapshota označava pravila za novu AI provjeru. Za izvor bez stabilnog snapshota ili s nejasnom primjenjivošću pravilo ostaje nebodovano dok dokaz ne bude potpun; ljudski audit nije rezervni gate.
