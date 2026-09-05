<!--
  Nastalo iz istrazivanja nad OVIM stablom 2026-08-23 (22 agenta, read-only).
  Prethodi mu plan "Stvarni DOCX dokaz, profil po profil"; faze F0 (mjerenje) i F3 (djelomicno
  popravljeno) su vec izvedene i `npm run check` je zelen. Ovo pokriva F1 i F2.

  ODLUKE KOJE JOS CEKAJU VLASNIKA (ne implementirati dok ne padnu):
   1. Preseljenje `tests/fixtures/docx-local/` izvan stabla (F1.8, tocka 8).
   2. Sto s prazninom "moderni Word": jedini instalirani Office je Word 2010, a i svih 38
      stvarnih radova je Word 14 (xmlns:w15 je 0/38). Ni korpus ni generator na ovom stroju
      ne mogu proizvesti w15/w16 dijelove koje pisu Word 2016+ i Microsoft 365.
   3. Alias KZ3-KZ10 umjesto K3-K10 (sudar s K0-K14 iz docs/LEKTA_BUILD_PIPELINE.md).
-->

# SPECIFIKACIJA: F1 sidecar v2 + corpus-ingest, F2 generatori korpusa pravim alatima

Datum: 2026-08-23. Status: provediva specifikacija, nije implementirana (ova sesija je read-only, nijedna datoteka nije stvorena ni izmijenjena).

---

## 0. Prethodne odluke koje moraju pasti prije prvog retka koda

### 0.1 Sudar imenskog prostora: "K3-K10" je vec zauzeto

`docs/LEKTA_BUILD_PIPELINE.md:30` definira `K0 --> K1 --> ... --> K14` kao korake build pipelinea (K8 = predfinancijsko ciscenje, K9 = paywall staging smoke, K10 = ZIP submission paket). Oznaka K3-K10 za znacajke korpusa sudarila bi se s tim u svakoj pretrazi i u svakom commit poruci.

ODLUKA: znacajke se u kodu i u sidecaru zovu imenom, ne brojem. Brojevi ostaju samo kao alias u dokumentaciji, i to s prefiksom `KZ` (znacajka korpusa):

| alias | ime u sidecaru | znacenje |
|---|---|---|
| KZ3 | `features.sections` | broj zivih sekcija |
| KZ4 | `features.elements` | tablice, slike, grafikoni i njihovi natpisi |
| KZ5 | `features.notes` | fusnote i endnote |
| KZ6 | `features.revisions` | komentari i pracene izmjene |
| KZ7 | `features.producer.family` | obitelj alata koji je zadnji spremio |
| KZ8 | `features.producer.version` | verzija i build tog alata |
| KZ9 | `features.resaveTrace` | trag ponovnog spremanja i uredjivackog vremena |
| KZ10 | `features.fields` | polja, sadrzaj (TOC) i njihova svjezina |

KZ7, KZ8 i KZ9 u izvornim nalazima nisu bili razdvojeni ("K7-K9 izvor je docProps/app.xml"). Ova specifikacija ih razdvaja na gornji nacin. Ako vlasnik misli drukcije, mijenja se tablica, ne ostatak specifikacije.

### 0.2 Dvije razlicite operacije nad istim paketom, i njihovo suprotno pravilo

- **MJERENJE (znacajke u sidecaru)**: koristi iskljucivo postojece produkcijske funkcije, i kad su nesavrsene. Ako sidecar mjeri drugim kodom nego proizvod, sidecar mjeri fikciju.
- **CISCENJE (pseudonimizacija)**: koristi namjerno SIRI skener od produkcijskog. Za brisanje osobnog podatka je propust fatalan, za mjerenje je propust samo pristranost koja se imenuje.

Konkretno: `revisionEvidence` (`src/analysis/final-document-inspector.ts:146`) hvata samo upareni oblik `<w:ins>...</w:ins>` i izmjereno nalazi 492 podudarnosti tamo gdje ima 536 zatvarajucih tagova. Za `features.revisions.productionCount` se ipak uzima bas njegov broj (jer to proizvod prijavljuje korisniku), a za ciscenje se koristi skener po ATRIBUTU (`w:author="..."` bilo gdje), koji je nadskup.

---

## F1. SIDECAR V2

### F1.1 Ugovor kompatibilnosti (tvrd, ne pregovara se)

`tests/real-corpus/harness.ts:129` (`discoverRealCorpus`) cita sidecar kao `<ime>.json` uz `<ime>.docx` i trazi tocno dva kljuca na korijenu:

```ts
if (metadata.synthetic === true || typeof metadata.profileId !== 'string' || !metadata.profileId) return [];
```

Zato sidecar v2 zadrzava `profileId` i `synthetic` na KORIJENU, doslovno tih imena i tih tipova. Sve novo ide u ugnijezdjene objekte. Postojeci harness tako nastavlja raditi bez ijedne izmjene, a `tests/fixtures/docx/*.json` (v1 sidecari, oblik `{profileId, note}`) ostaju valjani v2 dokumenti s praznim opcijskim dijelom.

Gard: `tests/sidecar-v2.test.ts` mora sadrzavati negativnu kontrolu koja dokazuje da `discoverRealCorpus` nad v2 sidecarom vraca isti unos kao nad v1.

### F1.2 Shema

```jsonc
{
  // --- v1 ugovor, NE MIJENJATI IMENA ---
  "profileId": "fpzg-politologija-diplomski",
  "synthetic": false,
  "note": "slobodan tekst, bez osobnih podataka",

  "sidecar": 2,

  // --- identitet dokumenta u korpusu ---
  "document": {
    "id": "local-01-diplomski",         // = ime .docx bez nastavka; NIKAD izvedeno iz izvornog imena
    "workType": "diplomski",            // iz WORK_TYPE registra
    "origin": "real" | "generated",     // real = studentski rad, generated = F2 generator
    "ingestRunId": "2026-08-23T10-14-02Z-7f3c",
    "ingestVersion": 1                  // verzija samog corpus-ingest algoritma
  },

  // --- zapis o dopustenju; BEZ ijednog osobnog podatka ---
  "consent": {
    "consentId": "c-2026-0042",         // opaque; puni zapis zivi IZVAN repozitorija
    "recordHash": "sha256:...",         // otisak punog zapisa u keyringu
    "scope": "local-testing" | "repo-committed" | "public-redistribution",
    "grantedAt": "2026-05-11",
    "expiresAt": "2029-05-11" | null,
    "verifiedBy": "vlasnik",
    "coversThirdParties": true          // mentor, clanovi povjerenstva, autori komentara
  },

  // --- pseudonimizacija: sto je ucinjeno i cime se to dokazuje ---
  "pseudonymization": {
    "applied": true,
    "algorithmVersion": 1,
    "saltId": "salt-2026-a",            // sam salt NIKAD nije ovdje
    "carriersCleaned": ["core.creator", "app.company", "people.author", "..."],
    "carriersRemapped": ["settings.rsid", "customXml.itemId", "w14.paraId"],
    "carriersRefused": [],              // npr. ["media.emf"] kad nema sigurnog zahvata
    "manualReviewRequired": false,
    "manualReviewedBy": "vlasnik" | null,
    "timeShiftDays": 137,               // isti pomak za SVE vremenske oznake dokumenta
    "leakScan": { "dictionaryTerms": 9, "hitsInOutput": 0 },
    "featurePreserved": true,           // vidi F1.6, vrata 3
    "intentionalFeatureDeltas": ["resaveTrace.companyPresent: true -> false"]
  },

  // --- znacajke KZ3 do KZ10; SVE iz produkcijskih funkcija ---
  "features": {
    "sections": { "stats": 2, "structure": 2, "agreement": true },
    "elements": {
      "bodyTotal": 36, "byKind": { "table": 18, "figure": 18, "chart": 0 },
      "withCaption": 30, "missingCaption": 6, "manualNumbering": 0, "sourcesMissing": 4,
      "lists": { "table": true, "figure": true, "chart": false },
      "packageTables": 18, "packageImages": 20,      // els() brojka, ukljucuje ugnijezdjene
      "autoCaptionFields": 0                          // SEQ polja
    },
    "notes": {
      "footnotes": 0, "endnotes": 0, "footnoteMarkers": 0,
      "footnotesStrict": 0, "endnotesStrict": 0,      // isti predikat na obje strane
      "footnoteRefs": 0, "endnoteRefs": 0,
      "endnotesPartPresent": true, "endnotesSeparatorsOnly": true
    },
    "revisions": {
      "hasTrackingEnabled": false,
      "hasUnacceptedRevisions": true,
      "productionCount": 492,          // summary.revisions, poznato podbrojava
      "authorNodeCount": 1201,         // skener po atributu, nadskup
      "countTrusted": false,
      "formatOnlyChanges": 266,
      "comments": 295, "commentRefs": 295,
      "peoplePartPresent": true,
      "commentSidecars": ["commentsExtended", "commentsIds", "commentsExtensible"]
    },
    "producer": {
      "family": "word" | "libreoffice" | "third-party-imitator" | "google-docs-candidate" | "unknown" | "disputed",
      "applicationRaw": "Microsoft Office Word",
      "version": "14.0000",
      "corroboration": { "rsidPresent": true, "w14": true, "w15": false, "zipDirEntries": false, "appXmlPresent": true, "appXmlEmpty": false }
    },
    "resaveTrace": {
      "templatePresent": true, "companyPresent": false, "lastModifiedByPresent": false,
      "revision": 9, "totalTimeMinutes": 412,
      "createdBeforeModified": true, "spanBucket": "1-7d", "lastPrintedPresent": false
    },
    "fields": {
      "totalFields": 1766, "toc": 3, "page": 63, "seq": 115, "ref": 108, "pageref": 1194,
      "stale": 0, "broken": 0, "errorReference": 0, "needsRender": 2,
      "hasTocField": true, "sdtTocGallery": true, "manualTocCandidates": 0,
      "tocCoverageCheck": "pass" | "warn" | "fail" | "absent"
    }
  },

  // --- za F2 generirane dokumente ---
  "provenance": {
    "tool": "word" | "libreoffice" | "google-docs" | "pages",
    "toolVersion": "14.0.7015.1000",
    "toolPath": "C:\\Program Files (x86)\\Microsoft Office\\Office14\\WINWORD.EXE",
    "os": "Windows 10 Pro 10.0.19045",
    "scenarioId": "gen-komentari-nit",
    "command": "powershell -File scripts/corpus-gen/word/gen-komentari-nit.ps1",
    "generatedAt": "2026-08-23T10:14:02Z",
    "handAuthoredParts": []             // dijelovi upisani rucno, a ne od alata; vidi F2.4
  }
}
```

Pravilo za svako polje: **prisutnost i oblik, nikad vrijednost**. `companyPresent: false` je dopusteno, `company: "HT"` nije. To vrijedi i za `note`.

### F1.3 Zapis o dopustenju i pravilo odbijanja

Puni zapis (ime studenta, kontakt, tekst suglasnosti, potpis, datum) NE ZIVI U REPOZITORIJU. Zivi u keyringu izvan stabla:

```
%LEKTA_CORPUS_KEYRING%/consents/c-2026-0042.json
%LEKTA_CORPUS_KEYRING%/keyring.json     // pseudonym id -> izvorna putanja, salt
```

Zadana vrijednost `LEKTA_CORPUS_KEYRING` je izvan repozitorija (npr. `%USERPROFILE%\.lekta-corpus`). Ingest odbija raditi ako se razrijesena putanja keyringa nalazi unutar radnog stabla.

Ovo izravno popravlja izmjereni kvar: `tests/fixtures/docx-local/_mapping.json` u kljucu `izvor` cuva izvorna imena datoteka s prezimenima, unutar stabla, i svaki alat koji cita taj JSON cita i ta imena. Direktorij jest gitignoriran (`.gitignore:82`), ali gitignore ne stiti od `git add -f`, od grepa, ni od agenta koji cita JSON.

Odbijanje ulaza (kumulativni uvjeti, svaki neispunjen znaci preskok):

1. `consentId` postoji u sidecar nacrtu ili u `--consent-map`;
2. datoteka zapisa postoji i parsira se;
3. `sha256` zapisa odgovara `recordHash`;
4. `expiresAt` je null ili u buducnosti;
5. `scope` je dovoljan za trazeno odrediste (`repo-committed` je uvjet za pisanje u `tests/fixtures/docx/`);
6. `coversThirdParties === true` ako dokument sadrzi komentare, `w:author`, ili `word/people.xml`.

Ponasanje pri odbijanju: dokument se PRESKACE, upisuje se redak u izvjestaj izvodjenja (`refused: "no-consent" | "expired" | "scope-insufficient" | "hash-mismatch" | "third-parties-not-covered"`), i **izlazni kod je razlicit od nule ako je ijedan dokument odbijen**. Nema zastavice koja to gasi. `--allow-refused` se ne implementira; ako se ikad doda, ova specifikacija je prekrsena.

---

### F1.4 Pseudonimizacija: tocan popis OOXML nositelja i redoslijed zahvata

#### Redoslijed (redoslijed je ugovor, ne stil)

**Faza 0 (bez pisanja):**
1. Provjera dopustenja (F1.3).
2. Kopiranje u radni direktorij izvodjenja (F1.7). Od ovog trenutka izvorni rad se vise ne otvara.
3. Granice: `docxCapability({fileBytes, entryCount, totalDeclaredBytes})` iz `src/repair/docx-budget.ts:70`, s ulazima `ZipReader.entryCount()` i `ZipReader.declaredUncompressedTotal()` (`src/docx/parser.ts:139`, `:138`), dakle bez ijedne dekompresije. Dokument koji se ne moze popraviti ne ulazi u korpus popravka.

**Faza 1 (ZETVA, prije ijedne izmjene):**

4. Izgradnja rjecnika identiteta iz SVIH nositelja odjednom. Ovo je najvaznije pravilo redoslijeda i slijedi iz mjerenja: u 14 od 38 radova doslovna vrijednost `dc:creator` stoji i u vidljivom tekstu naslovnice. Ako se prvo ocisti `docProps`, kljuc kojim se ta pojava u tijelu pronalazi je izgubljen, a rezultat je dokument koji izgleda anonimno u metapodacima i nosi ime na koricama.
5. Ljudska vrata nad rjecnikom: operater vidi kandidate (skracene, u konzoli), potvrdjuje, dopunjuje i uklanja lazne pogotke. Slobodan tekst komentara se ovdje presudjuje. Bez potvrde: `manualReviewRequired: true` i dokument ne moze u `tests/fixtures/docx/`.
6. Determinirana mapa pseudonima: `HMAC-SHA256(salt, normalizirana vrijednost)` skracen i preslikan u citljiv token (`AUTOR_1`, `MENTOR_1`, `ustanova.hr`). Isti izvorni niz uvijek daje isti token unutar dokumenta; salt je PO DOKUMENTU, pa ista osoba u dva rada dobiva razlicite tokene (inace pseudonimizacija sama gradi graf povezivanja).

**Faza 2 (zahvati, tocno ovim redom):**

7. Preslikavanje identifikatora (rsid, GUID, paraId, durableId).
8. Atributi identiteta (`w:author`, `w:initials`, `w15:author`, `w15:userId`).
9. Pomak vremenskih oznaka (jedan pomak za cijeli dokument).
10. `docProps`.
11. Vidljiv tekst, kroz sve dijelove koji nose tekst.
12. Mete relacija.
13. Binarni sadrzaj medija.
14. Uklanjanje dijelova (trojac: dio + relacija + Content_Types override, uvijek zajedno).

Zasto tim redom: 7 prije 8 jer preslikavanje `paraId` mora biti gotovo prije nego se dira sadrzaj koji ga referencira; 10 prije 11 jer se u koraku 11 rjecnik vise ne mijenja; 14 zadnje jer se dio smije ukloniti tek kad se zna da ga nijedan preostali `r:id` ne referencira.

**Faza 3 (vrata prihvata):** F1.6.

#### Popis nositelja

**A. `docProps/core.xml`**

| element | zahvat |
|---|---|
| `dc:creator` | token |
| `cp:lastModifiedBy` | token |
| `dc:title` | kroz rjecnik; ako sadrzi ime, token, inace ostaje |
| `dc:subject`, `dc:description`, `cp:keywords` | kroz rjecnik; neprovjeren slobodan tekst se prazni i `manualReviewRequired: true` |
| `cp:category`, `cp:contentStatus` | kroz rjecnik |
| `dcterms:created`, `dcterms:modified`, `cp:lastPrinted` | pomak za `timeShiftDays`, ISTI pomak, poredak i razmaci ocuvani |
| `cp:revision` | ostaje (broj, ne identifikator) |

**B. `docProps/app.xml`**

| element | zahvat |
|---|---|
| `Company`, `Manager`, `HyperlinkBase` | prazni se sadrzaj, element ostaje (izmjereno: Manager i HyperlinkBase su prazni u 38/38, ali su stvarni nositelji; mjerena nula nije nepostojanje) |
| `Application`, `AppVersion`, `Template` | **OSTAJE NETAKNUTO**, to je KZ7 i KZ8 |
| `TitlesOfParts` (`vt:lpstr`), `HeadingPairs` | kroz rjecnik, broj unosa i struktura ocuvani |
| `TotalTime`, `Pages`, `Words`, `Characters`, `Lines`, `Paragraphs` | ostaje (KZ9 i osnovica za KZ4) |

**C. `docProps/custom.xml`**: bijela lista po atributu `name`. Zadrzavaju se svojstva koja su trag alata (`KSOProductBuildVer`, `ICV`). Uklanja se cijelo svojstvo vezano uz racun (`GrammarlyDocumentId` je izmjeren). Pri uklanjanju se `pid` atributi preostalih svojstava renumeriraju od 2 naviste, inace paket postaje sumnjiv Wordu.

**D. `docProps/thumbnail.*`**: uklanja se dio, njegova relacija u `_rels/.rels` i override u `[Content_Types].xml`. Razlog: thumbnail je renderirana prva stranica, dakle slika naslovnice s imenima. U korpusu ga nema u 38/38, ali to je posljedica ponovnog spremanja u Wordu 2010, ne dokaz da nositelj ne postoji.

**E. Dijelovi s vidljivim tekstom**: `word/document.xml`, `word/header*.xml`, `word/footer*.xml`, `word/footnotes.xml`, `word/endnotes.xml`, `word/comments.xml`, `word/glossary/document.xml`, te tekst unutar `w:txbxContent` i `w:sdtContent` gdje god se nalazio.

Zamjena se izvodi u dva prolaza jer Word razbija ime na vise runova (rsid granice):
- prolaz 1: po pojedinom `<w:t>`, hvata cijele pogotke;
- prolaz 2: nad SPOJENIM tekstom odlomka (`paragraphText` iz `src/docx/parser.ts:383`) uz mapu pomaka po runovima; pogodak koji se proteze preko vise runova se sazima u prvi run, a ostali pogodjeni runovi dobivaju prazan `<w:t xml:space="preserve"></w:t>`.

Kriticno: run se NIKAD ne brise. Brisanje runa mijenja `rPr` populaciju iz koje se racuna dominantni font i velicina, dakle mijenja ocjenu dokumenta u korpusu.

Posebni oblici u rjecniku: JMBAG (10 znamenki, izmjeren u 8/38) se zamjenjuje pseudo JMBAG-om iste duljine; OIB (11 znamenki) isto; e-posta se zamjenjuje pseudo adresom istog oblika `ime.prezime@ustanova.hr`; telefon istom duljinom.

**F. Komentari: `word/comments.xml`, `commentsExtended.xml`, `commentsIds.xml`, `commentsExtensible.xml`**

- `w:author` i `w:initials` na `<w:comment>` u token i inicijale tokena. `w:initials` je izmjereno prisutan u 2/38, s vrijednostima "DB" i praznim nizom, ali se cisti jer je nositelj.
- `w:date` pomak, `w16cex:dateUtc` isti pomak.
- `w15:paraId`, `w15:paraIdParent`, `w16cid:durableId`, `w14:paraId` u `document.xml`: preslikavaju se DOSLJEDNO, tako da veza nit -> odlomak prezivi. Ako se `paraId` u `commentsExtended` preslika, a onaj u `document.xml` ne, struktura niti komentara je unistena, a to je bas struktura koju korpus treba testirati.
- Element `<w:comment>` se NE BRISE. Isto vrijedi za `w:commentRangeStart`, `w:commentRangeEnd`, `w:commentReference`.

**G. `word/people.xml`**

- `w15:author` u isti token kao drugdje za tu osobu.
- `w15:presenceInfo/@w15:userId`: oblik uz `providerId="AD"` je doslovno `S::<e-posta>::<GUID>` (potvrdjeno u `data/sources/rgnf/rgnf-predlozak-2022.docx`). Zamjenjuje se pseudo trojkom istog oblika.
- `@w15:providerId` (`AD` / `None`) OSTAJE: to je strukturni signal, ne identitet.
- **Dio se NE BRISE.** People.xml je izmjerena rupa (nijedno pravilo ga ne cita, nijedan fixer ga ne uklanja, rijec "people" ne postoji nigdje u repozitoriju). Ako ga ingest obrise, korpus vise nikad ne moze dokazati da je rupa zatvorena.

**H. Revizijski nositelji**: skener je po ATRIBUTU, ne po popisu elemenata. Cisti se `w:author` i `w:date` na svakom elementu koji ih nosi, ukljucujuci najmanje: `w:ins`, `w:del`, `w:moveFrom`, `w:moveTo`, `w:rPrChange`, `w:pPrChange`, `w:sectPrChange`, `w:tblPrChange`, `w:tblPrExChange`, `w:trPrChange`, `w:tcPrChange`, `w:numberingChange`, `w:cellIns`, `w:cellDel`, `w:cellMerge`, `w:moveFromRangeStart`, `w:moveToRangeStart`, `w:customXmlInsRangeStart`, `w:customXmlDelRangeStart`, `w:customXmlMoveFromRangeStart`, `w:customXmlMoveToRangeStart`. `w:tblGridChange` nema `w:author` (prosiruje `CT_Markup`, samo `w:id`) pa se ne trazi.

`w:id` ostaje. Element ostaje. Revizija se NIKAD ne prihvaca ni odbija tijekom pseudonimizacije.

**I. `word/settings.xml`**

| stavka | zahvat |
|---|---|
| `w:rsids`, `w:rsidRoot`, `<w:rsid w:val>` i svih ~97.000 `w:rsid*` atributa kroz paket | **PRESLIKAVA SE, ne uklanja** |
| `w:documentProtection` | uklanjaju se `w:hashValue`, `w:saltValue`, `w:algorithmName`, `w:edGrp`; element i `w:edit` ostaju |
| `w:attachedTemplate` | meta relacije u `settings.xml.rels` u neutralnu putanju |
| `w:mailMerge` | uklanja se cijeli element (putanja izvora podataka i upit, nema testne vrijednosti) |
| `w:docVars` | bijela lista, inace uklanjanje pojedinog `w:docVar` |
| `w:proofState`, `w:trackRevisions`, `w:updateFields` | **OSTAJE** (KZ6, KZ10) |
| `w:removePersonalInformation`, `w:removeDateAndTime` | **OSTAJE KAKVO JEST**, nikad se ne postavlja |

Zasto rsid preslikavanje, a ne uklanjanje: to je jedini sukob izmedju dviju traka i rjesava se ovako. Trakom 1 je izmjereno da rsid POVEZUJE dokumente (tri `w:rsidRoot` vrijednosti dijeli 14 od 38 radova, deset `w:rsid` vrijednosti pojavljuje se u po 7 dokumenata). Trakom 2 je izmjereno da je prisutnost `w:rsid*` najjaci strukturni oslonac za KZ7 (Word 284/285, ne-Word 1/113). Uklanjanje rsida ubija KZ7 na cijelom korpusu; zadrzavanje ostavlja graf povezivanja. Preslikavanje po dokumentu (isti broj atributa, isti oblik od 8 heksadekadskih znamenki, ista unutarnja dosljednost, druge vrijednosti) cuva prisutnost i unistava povezivanje.

**J. Relacije (`**/_rels/*.rels`)**

- `TargetMode="External"` s `file:///`, slovom diska, UNC putanjom ili `mailto:` : meta se PREPISUJE u neutralnu istog oblika. Relacija se ne brise, jer `r:id` iz dijela i dalje pokazuje na nju.
- `https` hiperveze: ostaju, osim ako je host ili putanja u rjecniku (osobni OneDrive, Drive, mapa s imenom studenta), i tada se prepisuje samo host i putanja, shema ostaje.
- Prepisivac relacija se pise nanovo i **kljuca po tocnom `Type`, nikad po podnizu**. `removeRelationshipToComments` (`src/repair/final-document-inspector-fixer.ts:119`) se NE POSUDJUJE jer je izmjereno pokvaren: hvata `Type` koji sadrzi podniz `comments` pa uklanja i relacije prema `commentsExtended`, `commentsIds` i `commentsExtensible`, a te dijelove ostavlja u zipu s ocuvanim overrideom.

**K. `word/media/*`**

- PNG: uklanjaju se `tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`. Izmjereno: 67 PNG-ova nosi `tEXt` kljuc `Software` (Matplotlib verzije).
- **`pHYs` se NE UKLANJA**: to je DPI, a `analyzeTableFigureRescue` boduje `figure.minDpi`. Uklanjanjem `pHYs` mijenja se ocjena dokumenta.
- JPEG: uklanja se APP1 (Exif), APP1 (XMP), APP13 (IPTC). `JFIF` APP0 ostaje (gustoca). Entropijski kodiran sadrzaj se ne dira, slika se NIKAD ne rekompresira.
- EMF i WMF: nema sigurnog kirurskog zahvata (nose imena uredjaja i putanje). `carriersRefused: ["media.emf"]`, `manualReviewRequired: true`. Nepokriveno automatski, i tako se imenuje.
- Imena datoteka u `word/media/` se ne mijenjaju (mete relacija).

**L. `customXml/item#.xml` + `itemProps#.xml`**

- `b:Sources` (izmjereno: korijenski element u 35/35 prisutnih): `b:Author`, `b:Last`, `b:First`, `b:Corporate` su CITIRANI autori, dakle objavljene trece osobe i legitiman bibliografski podatak o kojem ovisi citation engine. **Ostaju**, osim pojedinacnog pogotka iz rjecnika.
- `ds:datastoreItem/@ds:itemID` (35 razlicitih GUID-ova, nijedan dijeljen): preslikava se u pseudo GUID.
- Ne-bibliografski customXml (SharePoint, Zotero): pregled, pa preslikavanje identifikatora korisnika ili biblioteke.

**M. Dijelovi koji vode u odbijanje ili rucni pregled**

- `word/embeddings/*` (OLE nosi ime i punu putanju izvorne datoteke): nema sigurnog zahvata, dokument ide u rucni pregled ili se odbija. Nepokriveno.
- `word/vbaProject.bin`: dokument se odbija (makro plus autorski podaci VBA projekta).
- `word/glossary/document.xml`: prolazi isti postupak kao `document.xml`.

**N. ZIP omotnica**

- Vremenske oznake zapisa: postavljaju se na fiksnu epohu. Napomena koja mora biti u izvjestaju: to je otisak samog ingesta, i upravo je zato izmjereno da svih 38 zapisa lokalnog korpusa nosi 1980-01-01. Zbog toga se KZ7 i KZ9 osnovne stope iz TOG korpusa ne smiju citirati kao slika studentskih predaja.
- Redoslijed zapisa i metoda kompresije: ne cuvaju se bajt-identicno, jer se pakira `writeZip` iz `src/repair/zip-codec.ts:347`. Posljedica: pseudonimizirani paket nije bajt-usporediv s izvornikom. To se ne skriva, nego zapisuje.

---

### F1.5 Sto pseudonimizacija NE SMIJE dirati

Popis je normativan. Svaka stavka ima razlog, i razlog je uvijek "to je struktura koju korpus testira".

1. **Komentar se anonimizira, ne brise.** Broj komentara je KZ6. Dokument bez komentara ne moze testirati ni detekciju ni uklanjanje komentara.
2. **`w:ins` i `w:del` ostaju revizije.** Prihvacanje ili odbijanje revizija pri ciscenju pretvara dokument s pracenim izmjenama u dokument bez njih, i korpus vise ne pokriva KZ6.
3. **`word/people.xml` ostaje kao dio.** Izmjerena rupa se ne moze dokazati zatvorenom nad korpusom iz kojeg je uklonjena.
4. **`commentsExtended.xml`, `commentsIds.xml`, `commentsExtensible.xml` ostaju.** Oni su tocno oni dijelovi koje postojeci fixer ostavlja kao sirocad; korpus ih mora nositi da bi taj kvar imao regresijski test.
5. **`w:rsid*` se preslikava, ne uklanja** (KZ7 fallback, i meta za `settings.removeRevisionIds`).
6. **`Application`, `AppVersion`, `Template` ostaju** (KZ7 i KZ8 su doslovno ta polja).
7. **`w:sectPr` i `w:sectPrChange` se ne diraju** (KZ3).
8. **Spremljeni rezultat polja izmedju `separate` i `end` se ne brise.** Razlika izmedju polja sa spremljenim rezultatom i polja bez njega je status `needs-render`, dakle sam KZ10. Cisti se samo ako tekst rezultata sadrzi pogodak iz rjecnika (npr. rezultat `AUTHOR` polja).
9. **`w:vanish` i `w:specVanish` runovi ostaju skriveni runovi**; cisti se samo tekst kroz rjecnik.
10. **Prazni odlomci, `w:br`, tabulatori i razmaci ostaju tocno takvi kakvi jesu** (higijenske provjere ih broje).
11. **Stilovi, numeriranje, tema i fontTable se ne brisu**; samo se `w:name` prilagodjava kroz rjecnik ako sadrzi ime ili naziv tvrtke. Brisanje stila lomi `w:pStyle` reference.
12. **Bookmarkovi ostaju** (`PAGEREF` i `REF` polja pokazuju na njih; brisanje bookmarka pretvara zdravo polje u `broken` i lazira KZ10).
13. **NIKAD ne otvarati dokument Wordom ili LibreOfficeom kao dio pseudonimizacije.** Spremanje kroz alat prepisuje rsid, odbacuje w15 i w16 dijelove i prepisuje `docProps`, dakle unistava tocno ono sto se testira. Pseudonimizacija je iskljucivo XML kirurgija nad raspakiranim paketom.
14. **`redactParagraphQuotes` (`src/report/report.ts:191`) nije pseudonimizator.** Sluzi za skracivanje citata u izvjestaju. Ne posudjivati ga ovdje.

---

### F1.6 `scripts/corpus-ingest.mts`: ugovor i vrata

#### CLI

```
npx vite-node scripts/corpus-ingest.mts -- \
  --in  <direktorij s izvornim radovima>      \
  --out <direktorij izvodjenja>                \
  --consent-map <put do mape consentId>        \
  [--profile <profileId>]                      \
  [--dry-run]                                  \
  [--review]                                   \
  [--force-new-run]
```

`--dry-run` radi zetvu i vrata, ne pise nijedan bajt osim izvjestaja. Zastavice `--in-place`, `--overwrite` i `--skip-consent` ne postoje i ne smiju se dodati.

#### Funkcije koje se POSUDJUJU (a ne pisu nanovo)

| potreba | posuditi | put |
|---|---|---|
| lijeno citanje paketa s kapama | `ZipReader`, `.names()`, `.text()`, `.data()`, `.entryCount()`, `.declaredUncompressedTotal()` | `src/docx/parser.ts:84` |
| granice ulaza | `docxCapability`, `DOCX_MAX_*`, `repairBlockerMessage` | `src/repair/docx-budget.ts:70` |
| puni pristup bajtovima (mediji) i pakiranje | `readZip`, `writeZip` | `src/repair/zip-codec.ts:190`, `:347` |
| Tier 0 nad izlazom | `scanXmlWellFormed`, `hasAttributeAfterSlash`, `inspectDocxParts`, `comparePackages`, `checkContentTypes`, `checkRelationshipTargets`, `checkPackageStructure` | `src/repair/package-integrity.ts` |
| uklanjanje Content_Types overridea | `removeContentTypeOverride` | `src/repair/final-document-inspector-fixer.ts:123` |
| oblik rsid atributa (kao referenca za preslikavanje) | regex `/\s+w:rsid[A-Za-z]+=["'][^"']*["']/gi` | `src/repair/final-document-inspector-fixer.ts:213` |
| MJERENJE svih znacajki, headless | `analyzeFixture(file, { profileId })` | `src/analysis/golden-entry.ts:60` |
| `File` iz diska | obrazac iz `tests/real-corpus/harness.ts:204-205` (`new File([bytes], name, { type: DOCX_MIME })`) | |
| spojeni tekst odlomka, runovi, sidra | `paragraphText`, `ownRuns`, `bodyParagraphs`, `ownsNode`, `inspectFootnoteMarkers` | `src/docx/parser.ts:383`, `:379`, `:374`, `:338`, `:420` |
| otisci za dokaz | `inspectorFingerprint`, `anchorFingerprintForXml`, `sectionXmlFingerprint`, `fieldAnchorFingerprint` | odgovarajuci analitcki moduli |
| negativne kontrole u testovima | `buildDocx(spec, extraFiles)` | `tests/helpers/docx-builder.ts:330` |
| CLI kostur i argumenti | obrazac iz `scripts/probe-docx-structure.mts` | |

Sto se izricito NE posudjuje: `removeRelationshipToComments` (pokvaren, F1.4 J), kolone `toc` i `pageField` iz `probe-docx-structure.mts:109` i `:117` (jos nose zamku `\bTOC\b` i `\bPAGE\b`), `tableCaps` i `imageCaps` iz `analyze-docx.ts` (izmjereno prekobrojavaju: local-01 ima 36 sidara i 56 odlomaka koji pocinju oznakom), `revisionEvidence` kao skener za CISCENJE (nadskup je obavezan).

Dopustena iznimka od pravila "nista novo": simetricni brojac biljezaka (F1.7, KZ5), jer produkcija za fusnote i endnote koristi razlicite predikate pa simetricna brojka u proizvodu ne postoji. Iznimka se u kodu oznacava komentarom s razlogom.

#### Vrata prihvata (svako je izlazni kod, ne upozorenje)

- **Vrata 1, integritet:** `checkPackageStructure` + `scanXmlWellFormed` nad svakim XML dijelom izlaza. Kljucno: `@xmldom/xmldom` ne baca i ne stvara `parsererror` nad neispravnim XML-om, pa provjera oslonjena na `parseXml` daje lazno zeleno. Koristi se vlastiti strogi skener.
- **Vrata 2, curenje:** svaki niz iz rjecnika mora imati NULA pojava u svakom izlaznom dijelu, ukljucujuci binarne medije i imena zapisa. Trazi se i u UTF-16 obliku i u XML entitetima (`&#x...;`), jer Word zna zapisati dijakritiku entitetom.
- **Vrata 3, ocuvanje znacajki (ovo je jezgra):** `analyzeFixture` se pokrece nad ULAZOM i nad IZLAZOM, i vektor `features` mora biti IDENTICAN, osim za deklarirane namjerne razlike koje se popisuju u `intentionalFeatureDeltas`. Neprijavljena razlika je pad. Time "pseudonimizacija nije unistila strukturu koja se testira" prestaje biti namjera i postaje mjerenje.
- **Vrata 4, nepromijenjen izvor:** sha256 svake ulazne datoteke prije i poslije izvodjenja. Razlika znaci da je izvjestaj nepouzdan i izvodjenje se proglasava nevaljanim.
- **Vrata 5, dopustenje:** F1.3.

---

### F1.7 Detekcija znacajki KZ3 do KZ10

Svaka se cita iz rezultata jednog poziva `analyzeFixture`. Ingest ne otvara zip za mjerenje.

**KZ3 sekcije**
- `result.stats.sections` je KANONSKA vrijednost: nastaje iz `els(doc,'w:sectPr').filter(isLiveSectPr)` (`src/analysis/analyze-docx.ts:228`, `:311`), i to je brojka na kojoj stoje bodovane provjere i gating popravka (`sections.length !== 1` u `src/ui/repair-items.ts`), i jedina koja ima regresijski test.
- `result.details.sectionStructure.summary.sections` se zapisuje kao druga ocitanja, uz `agreement`.
- Razlika nije kozmeticka: `els` je rekurzivan pa hvata prijelom sekcije i unutar body-level `w:sdt`; `sectionNodes` gleda samo izravnu djecu `w:body` pa ga propusta. Neslaganje je zanimljiv korpusni dogadjaj i mora se zapisati, ne progutati.
- Zamka: `w:sectPrChange` nosi povijesnu kopiju `w:sectPr`. Izmjereno je nema u 38/38, pa negativna kontrola mora biti sinteticka (`buildDocx` s rucno napisanim `sectPrChange`).
- `sectionStructure[].paragraphIndex` se NE koristi kao sidro: razrjesava se po jednakosti teksta, a izmjereno je da svih 5 sidara sekcija u korpusu ima prazan tekst, pa svi dobiju indeks prvog praznog odlomka.

**KZ4 elementi i natpisi**
- Glavni izvor: `result.details.elementStructure.summary` (`total`, `byKind`, `withCaption`, `missingCaption`, `manualNumbering`, `sourcesMissing`) i `.lists`.
- Sidro je odlomak s `w:drawing` ili `w:pict`; vrsta se odlucuje po potomku (`c:chart` = grafikon, `a:blip` ili `v:imagedata` = slika; oba ili nijedan = preskok).
- `analyzeElementStructure` NAMJERNO preskace `w:txbxContent`, celije tablica, `w:sdtContent`, zaglavlja i podnozja. Sidecar zato uz njega zapisuje i `packageTables` = `result.stats.tables` i `packageImages` = `result.stats.images` (`els`, ukljucuje ugnijezdjeno). Dvije brojke, dva imena, nikad jedan zbroj.
- Automatski natpis: polje vrste `seq` iz `scanDocumentFields(parts)` (`FieldKind` je `'seq'`, ne `'sequence'`). Izmjereno postoji u 10 od 31 rada, i gotovo uvijek uz `w:pStyle w:val="Caption"`. Detekcija natpisa samo po stilu propustila bi vecinu radova, detekcija samo po tekstu prekobrojava.
- Zabranjeno: `tableCaps` i `imageCaps`.

**KZ5 fusnote i endnote**
- `result.stats.footnotes`, `result.stats.endnotes`, `result.stats.footnoteMarkers`.
- Izmjerena zamka: `word/endnotes.xml` postoji u 34 od 38 radova i u SVAKOM od njih ima tocno 2 elementa `w:endnote`, oba separatori (`w:type="separator"` s `w:id="-1"` i `w:type="continuationSeparator"` s `w:id="0"`), a stvarnih endnota je nula. Postojanje dijela je lazan signal na 34/38. Sidecar zato nosi `endnotesPartPresent` i `endnotesSeparatorsOnly` odvojeno od brojke.
- Izmjerena asimetrija: endnote se broje uz `w:id >= 1` I vidljiv tekst, fusnote samo uz `w:id >= 1`. Sidecar dodaje `footnotesStrict` i `endnotesStrict` po istom predikatu na obje strane (jedina dopustena nova funkcija u ingestu), i razlika prema produkcijskim brojkama je mjerenje te asimetrije, ne njezino skrivanje.
- Unakrsna provjera: `w:footnoteReference w:id` i `w:endnoteReference w:id` u `word/document.xml`.
- Zamka za test: `tests/helpers/docx-builder.ts` NE emitira separatore, pa `buildDocx({endnotes:[...]})` ne moze reproducirati slucaj "dio postoji, unutra samo separatori". Negativna kontrola mora ici kroz `buildDocx(spec, extraFiles)` s rucno napisanim `word/endnotes.xml`.

**KZ6 komentari i pracene izmjene**
- Dva NEOVISNA signala koja se ne spajaju: `hasTrackingEnabled` iz `word/settings.xml` (`<w:trackRevisions/>`, nalaz `tracking-enabled`) i `hasUnacceptedRevisions` (postoje revizijski elementi, nalaz `unaccepted-revisions`). Izmjereno: NIJEDAN od 38 radova nema `<w:trackRevisions/>`, ukljucujuci local-01 koji ima 348 `<w:ins` i 267 `<w:del`. Detekcija oslonjena samo na settings.xml dala bi nulu na jedinom radu koji stvarno ima neprihvacene izmjene.
- `productionCount` = `details.finalDocumentInspector.summary.revisions`, uz `countTrusted: false`. Izmjereno na local-01: regex nadje 492, a zatvarajucih tagova ima 536, jer 42 `w:ins` i 37 `w:del` su samozatvarajuci (oznake odlomka u `w:pPr/w:rPr`) pa podudarnost proguta sljedecu stvarnu reviziju.
- `authorNodeCount` = broj cvorova s atributom `w:author` kroz cijeli paket (skener iz F1.4 H). Izmjereno 1201 kroz korpus.
- `formatOnlyChanges` = `w:rPrChange` + `w:pPrChange` + ostale `*Change` obitelji (izmjereno 266 na local-01), koje produkcijski regex uopce ne trazi.
- Komentari: `summary.comments` + `commentRefs`. Zasebno `peoplePartPresent` i `commentSidecars`, jer je izmjereno da 2 od 38 radova imaju `people.xml` BEZ `comments.xml`.
- Osnovna stopa koja mora biti u izvjestaju: komentari u 2 od 38, neprihvacene izmjene u 1 od 38. KZ6 kao bodovana os djeluje na vrlo malen dio radova.

**KZ7 obitelj generatora**
Postupak je uredjen i nikad ne staje na prvom koraku:

1. Procitaj `docProps/app.xml` `<Application>` (iz nalaza `private-metadata`, dokaz s `field === 'application'`).
2. Klasificiraj PREFIKSOM, nikad jednakoscu:
   - `/^Microsoft (Office|Macintosh) Word$/` -> `word`. Izmjereno: `Microsoft Macintosh Word` u 38 od 400 datoteka, pa `=== 'Microsoft Office Word'` promasuje legitiman Word.
   - `/^LibreOffice\//`, `/^OpenOffice\.org\//`, `/^NeoOffice\//` -> `libreoffice`. Izmjerena vrijednost je `LibreOffice/25.2.3.2$Linux_X86_64 LibreOffice_project/520$Build-2`, dakle nestabilna i neusporediva doslovno.
   - `/^Microsoft Word \d+\.\d+\.\d+$/` -> `third-party-imitator`. Izmjereno 9 datoteka: nula `w:rsid`, nula `w14`, uvucen XML, `AppVersion 12.0000`. Oponasa Word 2007 i ne smije se brojati kao Word.
   - Prazan `<Properties/>` bez `<Application>` + prazan `custom.xml` + direktorijski zapisi u zipu -> `google-docs-candidate`. Izmjereno na 100 datoteka: custom.xml 100/100, direktorijski zapisi 89/100, `w:rsid` 1/100.
   - Inace -> `unknown`.
3. Strukturna potvrda je OBAVEZNA, ne opcijska: `rsidPresent` (najjaci izmjeren oslonac: Word 284/285, ne-Word 1/113), `w14`, `w15`, `zipDirEntries`, `appXmlPresent`, `appXmlEmpty`.
4. Ako se koraci 2 i 3 ne slazu, `family = "disputed"` i oba ocitanja ostaju u sidecaru. Neslaganje se nikad ne sazima u jednu oznaku.
5. `standalone="yes"` u XML deklaraciji NIJE Word marker: izmjereno Word za Mac 0 od 38, Word za Windows 206 od 247.
6. Paket bez ijednog `docProps` dijela postoji (izmjereno 2 od 400, i 12 od 17 commitanih golden fixtura nema `docProps/app.xml`). Ingest mora podnijeti potpuno odsutan app.xml, ne samo prazan.
7. **Za Apple Pages ne postoji izmjerena vrijednost.** `family` ne smije nikad poprimiti vrijednost `"pages"` na temelju nagadjanja. Pages moze zavrsiti samo u `unknown`.
8. Direktorijski zapisi (`word/`, `docProps/`) ne smiju se brojati kao dijelovi paketa; filtar je `.xml` / `.rels` / `[Content_Types].xml`, isti kao `_inspectorNames` u `analyze-docx.ts:225`.

**KZ8 verzija generatora**
- Word: `<AppVersion>` doslovno (`14.0000`), plus izvedeni `major.minor`.
- LibreOffice: verzija se parsira iz `Application` regexom `^LibreOffice\/([0-9.]+)\$`, plus `LibreOffice_project/(\S+)` za build. `AppVersion` se ne koristi za tu obitelj.
- Nepoznata obitelj: verzija je `null`, nikad pogodjena.

**KZ9 trag ponovnog spremanja**
- Samo prisutnost i izvedenice: `templatePresent`, `companyPresent`, `lastModifiedByPresent`, `lastPrintedPresent`, `revision` (broj), `totalTimeMinutes`, `createdBeforeModified`, `spanBucket`. Nikad sirova vrijednost.
- Vremenske oznake su vec pomaknute (F1.4 A), pa `spanBucket` mjeri trajanje, a ne kalendar.

**KZ10 polja i sadrzaj**
- Izvor: `result.details.fieldIntegrity.summary` (`totalFields`, `staleFields`, `brokenFields`, `errorReferenceFields`, `tocFields`, `pageFields`, `sequenceFields`, `crossReferenceFields`, `manualTocCandidates`), plus `result.details.hasTocField` (TOC polje bas u `word/document.xml`).
- `sdtTocGallery`: `<w:sdt>` s `<w:docPartGallery w:val="Table of Contents"/>`. Izmjereno u 33 od 38 radova, dok je broj `<w:instrText>TOC` instrukcija 0 do 4 po radu. "Ima TOC" i "ima jedan TOC" su razlicite tvrdnje.
- `tocCoverageCheck`: status provjere `toc.coverage` (`src/scoring/check-id-registry.ts:65`, naslov `Naslovi dokumenta ↔ sadržaj`, izvor `auditDetailedToc`). To je SADRZAJNA zastarjelost sadrzaja i pravi je KZ10 signal.
- **`w:dirty` se NE koristi kao jedini signal**: izmjereno nula pojava u 38 od 38. Znacajka vezana uz njega ne bi se nikad palila. Zivi signali su `needs-render`, `toc.coverage`, `error-reference-not-found` i `PAGEREF` na nepostojeci bookmark.
- **Zabranjeno**: `/\bTOC\b/` i `/\bPAGE\b/` nad sirovim XML-om. Obican `<w:br w:type="page"/>` zadovoljava `\bPAGE\b` jer navodnici nisu znakovi rijeci, pa je gotovo svaki rad dobivao bodove za numeriranje koje nema. Taj kvar jos zivi u `scripts/probe-docx-structure.mts:109` i `:117`.

---

### F1.8 RIZIK: ingest ne smije prepisati izvorne studentske radove

Prijedlog toka, s mehanizmima a ne obecanjima.

```
IZVOR (samo za citanje, po mogucnosti izvan repozitorija)
  %LEKTA_CORPUS_SOURCE%\...\rad.docx
        |  readFileSync, nista drugo
        v
RUN\<runId>\in\      kopija, nepromjenjiva unutar izvodjenja (sha256 zabiljezen)
        |  pseudonimizacija, XML kirurgija
        v
RUN\<runId>\work\    jedini direktorij u koji ingest pise
        |  vrata 1 do 5
        v
RUN\<runId>\out\     prihvaceni dokumenti + sidecar v2 + izvjestaj
        |  RUCNA promocija, zaseban korak, zaseban commit
        v
tests/fixtures/docx/           (samo uz consent.scope >= repo-committed)
tests/fixtures/docx-corpus/    (gitignoriran radni korpus)
```

Mehanizmi:

1. **Nema zastavice za rad na mjestu.** `--in-place` ne postoji.
2. **Provjera preklapanja putanja prije ijednog citanja.** `resolve(in)` i `resolve(out)` ne smiju biti jednaki, niti jedan roditelj drugoga. Prekrsaj je izlaz s greskom.
3. **Nijedan zapisni poziv ne prima putanju izvedenu iz `--in`.** Provodi se jednim helperom `writeInsideRun(relPath)` koji odbija apsolutne putanje i sve izvan `RUN\<runId>\`.
4. **sha256 prije i poslije** za svaku ulaznu datoteku (vrata 4). Hvata i vlastitu gresku i vanjsku promjenu tijekom izvodjenja.
5. **Ime izlazne datoteke se izvodi iz pseudonim id-a**, nikad iz izvornog imena. Mapa pseudonim id -> izvorna putanja ide u keyring IZVAN repozitorija. Time nestaje izmjereni kvar `_mapping.json` (`izvor` s prezimenima unutar stabla).
6. **`RUN\<runId>` je uvijek nov.** Postojeci nepraz direktorij se ne prepisuje; `--force-new-run` samo stvara novi podnid.
7. **Alati (F2) nikad ne otvaraju izvornik.** Word posebno: otvaranje dokumenta Wordom moze ga prepisati (autosave, novi rsid). F2 radi iskljucivo u `RUN\<runId>\work\`, i to nad kopijom kopije.
8. **Preporuka koja se navodi izricito:** `tests/fixtures/docx-local/` (38 stvarnih radova) preseliti IZVAN stabla i citati preko `LEKTA_CORPUS_SOURCE`. Gitignoriran direktorij unutar stabla je jedan `git add -f` ili jedan siroki alat udaljen od objave, a mjerenje je pokazalo da je bar jedna datoteka u njemu (`_mapping.json`) vec nosila prezimena u citljivom obliku.

---

## F2. GENERATORI KORPUSA PRAVIM ALATIMA

### F2.1 Sto je na OVOM stroju dostupno (izmjereno 2026-08-23)

| alat | status | dokaz |
|---|---|---|
| Microsoft Word 2010 | **DOSTUPNO** | `C:\Program Files (x86)\Microsoft Office\Office14\WINWORD.EXE`, ProductVersion `14.0.7015.1000`. Jedini instaliran Office (`Program Files\Microsoft Office\Office14` i `Program Files (x86)\Microsoft Office\Office14`, nema Office16). COM automatizacija je vec dokazana u repozitoriju: `scripts/word-verify/check.ps1`, `npm run verify:word`, prolaz Tier 2 zabiljezen 2026-08-17. |
| LibreOffice | **INSTALIRANO, roundtrip nije izveden** | `C:\Program Files\LibreOffice\program\soffice.exe` i `soffice.com`, ProductVersion `26.2.5.2`, buildid `cd7284b4cbbfeb507e630c1aac019f4157393acb`. U ovoj sesiji nije pokrenut. |
| Python 3.12 + python-docx 1.2.0 + lxml 6.1.1 + Pillow 12.3.0 | **DOSTUPNO** | `C:\Users\PC\AppData\Local\Programs\Python\Python312\python.exe`, import triju modula uspio. Tier 1 (`npm run verify:strict-open`) i provjera ciscenja metapodataka slika. |
| Node + vite-node | **DOSTUPNO** | postojece `npm` skripte repozitorija. |

### F2.2 Sto NIJE dostupno, i sto se zato NE SMIJE tvrditi

| alat | status | posljedica za tvrdnje |
|---|---|---|
| **Apple Pages** | **NEPOKRIVENO.** Pages postoji samo za macOS i iOS; ovaj stroj je Windows 10 Pro 10.0.19045. | Nijedan redak korpusa ne smije nositi `provenance.tool = "pages"`. LibreOffice NIJE zamjena za Pages. Za Pages se u tablici pokrivenosti pise `nepokriveno: nema macOS stroja`, nikad prazno i nikad "prolazi". |
| **Google Docs** | **NEPOKRIVENO dok se ne dokaze.** Nema lokalnog klijenta. U alatnom prostoru ove sesije postoje Google Drive konektorski alati, ali izvoz `.docx` roundtripom nije demonstriran. | Do izvedenog i zabiljezenog roundtripa se ne smije tvrditi da je Google Docs pokriven. Uz to: roundtrip znaci SLANJE dokumenta Googleu, sto je prijenos podataka koji `consent.scope` gotovo sigurno ne pokriva. **Zato Google Docs scenariji smiju koristiti iskljucivo SINTETICKI sadrzaj, nikad studentski rad.** |
| **Word 2013 i noviji (w15, w16)** | **NEPOKRIVENO.** Instaliran je samo Word 14. | Word 2010 ne pise `word/people.xml`, `commentsExtended.xml`, `commentsIds.xml`, `commentsExtensible.xml`, `w15:paraId`, `w16cid:durableId`, `w16cex:dateUtc`. Potvrdjeno posredno mjerenjem: u 38 lokalnih radova (svi Word 14) `xmlns:w15` je 0/38. **Nijedan generator na ovom stroju ne moze proizvesti te dijelove.** Fixture za njih dolazi samo iz (a) postojecih stvarnih radova (3 u `docx-local`, 1 u `data/sources/rgnf`) ili (b) rucno pisanog XML-a kroz `buildDocx(spec, extraFiles)`. Rucno pisan dio dokazuje da NAS KOD podnosi tu strukturu; NE dokazuje da je Word bas takvu proizvodi. Ta se razlika mora zapisati u `provenance.handAuthoredParts`. |
| **Word za Mac** | **NEPOKRIVENO** (nema macOS stroja). Izmjeren je otisak (`Microsoft Macintosh Word`, rsid 38/38, w14 38/38, w15 0/38) nad tudjim datotekama, ali generirati ga ne mozemo. |
| **WPS Office, OnlyOffice, Word Online** | **NEPOKRIVENO** (nisu instalirani; provjereno da nema `Program Files\WPS Office` ni `ONLYOFFICE`). Otisak WPS-a postoji u korpusu (`KSOProductBuildVer`, `ICV` u 2 od 38), ali kao zatecen podatak, ne kao nas generator. |

Pravilo pisanja izvjestaja: **nedostupan alat se imenuje kao nepokriven, nikad kao prosao, i nikad se ne izostavlja iz tablice.** Prazna celija je zabranjena; svaka celija je `pokriveno <artifactId>` ili `nepokriveno <razlog>`.

### F2.3 Matrica scenarija po alatu

Redovi su scenariji koje korpus mora nositi, stupci su alati. Popunjava se pri izvodjenju; ovdje je zadano stanje s obzirom na F2.1 i F2.2.

| scenarij | Word 2010 | LibreOffice 26.2 | Google Docs | Pages |
|---|---|---|---|---|
| S1 vise sekcija, mijesana orijentacija (KZ3) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S2 tablice i slike s automatskim SEQ natpisom (KZ4) | izvedivo | izvedivo, provjeri pise li SEQ | nepokriveno | nepokriveno |
| S3 rucni natpisi bez polja (KZ4) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S4 fusnote i endnote, ukljucujuci prazan dio sa samo separatorima (KZ5) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S5 komentari, jednostavni (`comments.xml`) (KZ6) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S6 komentari s nitima (`commentsExtended` + `commentsIds` + `commentsExtensible`) | **nepokriveno: treba Word 2013+** | izmjeri, ne pretpostavljaj | nepokriveno | nepokriveno |
| S7 `word/people.xml` s `presenceInfo` | **nepokriveno: treba Word 2013+ i AD racun** | nepokriveno | nepokriveno | nepokriveno |
| S8 pracene izmjene svih vrsta (`ins`, `del`, `move*`, `rPrChange`, `pPrChange`, `sectPrChange`) (KZ6) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S9 TOC polje, popis tablica, popis slika, neazurirano stanje (KZ10) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S10 rucno utipkan sadrzaj bez polja (KZ10) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S11 polje bez spremljenog rezultata (`needs-render`) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S12 `PAGEREF` na obrisan bookmark (`broken`) | izvedivo | izvedivo | nepokriveno | nepokriveno |
| S13 otisak generatora bez `<Application>` (KZ7) | nije primjenjivo | nije primjenjivo | **jedini izvor, nepokriveno** | nepokriveno |
| S14 paket bez ijednog `docProps` dijela (KZ7) | nepokriveno alatom | nepokriveno alatom | nepokriveno | nepokriveno |
| S15 slika s ugradjenim metapodacima (Matplotlib `tEXt`, JPEG Exif) | izvedivo (umetanjem pripremljene slike) | izvedivo | nepokriveno | nepokriveno |

Celije S6, S7, S13 i S14 su nepokrivene alatima na ovom stroju. Za njih se koristi rucno pisan dio (`buildDocx(spec, extraFiles)`) ili postojeci stvaran dokument, i to se OBAVEZNO oznacava u `provenance.handAuthoredParts`. Rucno pisan `people.xml` nikad ne smije biti opisan kao "Word proizvodi ovo".

### F2.4 Ugovor generatora

Struktura:

```
scripts/corpus-gen/
  word/<scenarioId>.ps1          # COM, po uzoru na scripts/word-verify/make-*.ps1
  libreoffice/<scenarioId>.mts   # soffice --headless --convert-to docx, ili UNO makro
  handauthored/<scenarioId>.mts  # buildDocx(spec, extraFiles)
  run-all.mts                    # orkestrator, pise coverage tablicu
```

Pravila:

1. Svaki generator pise ISKLJUCIVO u `RUN\<runId>\work\`, nikad u `tests/fixtures/**` izravno.
2. Svaki artefakt dobiva `provenance` blok iz F1.2, s doslovnom naredbom, punom putanjom alata, verzijom alata i verzijom OS-a.
3. Sadrzaj generiranih dokumenata je SINTETICKI (imena tipa `Ime Prezimenovic`, tekst iz `tests/helpers`), pa `consent` blok nosi `scope: "public-redistribution"` i generirani dokumenti se smiju commitati.
4. Word generatori se pokrecu `OpenAndRepair=false` i `Visible=false`, i orkestrator prije pokretanja provjerava da nema zaostalog `WINWORD` procesa (poznata zamka: WordReplica automatizacija drzi dva WINWORD procesa pa `verify:word` mora cekati).
5. Svaki generirani artefakt prolazi ista vrata kao ingest (F1.6), plus `npm run verify:strict-open` (Tier 1, python-docx) prije prihvata.
6. `run-all.mts` upisuje tablicu pokrivenosti iz F2.3 u `docs/generated/corpus-generators.json`, gdje je svaka celija `{"status":"pokriveno","artifactId":"..."} | {"status":"nepokriveno","reason":"..."}`.
7. Gard `tests/corpus-generators.test.ts`: svaka celija ima jedan od ta dva statusa (nikad prazno, nikad treci), svaki `pokriveno` pokazuje na postojeci artefakt sa `provenance` blokom, i svaki `nepokriveno` ima neprazan `reason`. Test pada ako se celija promijeni u `pokriveno` bez artefakta.

---

## Redoslijed izvedbe i Definition of Done

| korak | sadrzaj | DoD |
|---|---|---|
| 1 | Sidecar v2 shema + tip + validator, bez ingesta | `npm run check` zelen; `tests/sidecar-v2.test.ts` dokazuje da `discoverRealCorpus` vidi v2 sidecar isto kao v1 |
| 2 | `.gitignore` unos za `tests/fixtures/docx-corpus/` i za putanju keyringa | commitano |
| 3 | Ingest, faze 0 i 1 (dopustenje, kopija, zetva rjecnika), `--dry-run` | izvodjenje nad 38 lokalnih radova; nula pisanja izvan `RUN`; vrata 4 (sha256) prolaze |
| 4 | Ingest, faza 2 (zahvati A do N), redoslijedom iz F1.4 | vrata 1, 2 i 3 zelena na svih 38; svaka namjerna razlika znacajki deklarirana |
| 5 | Mjerenje KZ3 do KZ10 iz `analyzeFixture`, upis u sidecar | za svaki dokument sidecar v2 s punim `features` blokom |
| 6 | Preseljenje izvornog korpusa izvan stabla, brisanje `_mapping.json` iz stabla | u repozitoriju nema nijedne datoteke s izvornim imenima |
| 7 | F2 generatori: Word 2010 i LibreOffice, scenariji S1 do S5, S8 do S12, S15 | `docs/generated/corpus-generators.json` sa svim celijama popunjenim; `tests/corpus-generators.test.ts` zelen |
| 8 | F2 rucno pisani dijelovi za S6, S7, S13, S14 | `handAuthoredParts` popunjen; tablica pokrivenosti ih vodi kao rucne, ne kao alatne |

Sve tvrdnje o dostupnosti alata u ovoj specifikaciji izmjerene su na ovom stroju 2026-08-23, osim tvrdnje da Word COM automatizacija radi (to je zabiljezen prolaz iz 2026-08-17, ne mjerenje ove sesije) i tvrdnje da LibreOffice roundtrip radi (nije izvedena, samo je potvrdjena instalacija verzije 26.2.5.2).