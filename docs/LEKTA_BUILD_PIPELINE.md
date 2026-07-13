# LEKTA_BUILD_PIPELINE.md

Izvedbeni pipeline: kako izgraditi sve iz [LEKTA_PRODUCT_ROADMAP.md](LEKTA_PRODUCT_ROADMAP.md)
i [LEKTA_IMPLEMENTATION_BACKLOG.md](LEKTA_IMPLEMENTATION_BACKLOG.md), dio po dio.
Datum: 2026-07-13. Status stupac se azurira kako koraci prolaze.

## 0. Pravila izvodjenja (vrijede za SVAKI korak)

1. Jedan korak = jedna fokusirana sesija = jedan commit (ili mali niz commita istog koraka).
2. Korak je gotov tek kad je `npm run check` zelen (tsc + vitest + vite build). Repair i
   parser koraci dodatno: golden testovi zeleni, bez izmjene baselinea osim svjesno
   snimljenog novog.
3. Redoslijed unutar tracka K je obavezan (svaki korak ovisi o prethodnom gateu); trackovi
   K (kod), O (vlasnik) i D (odluke/podaci) teku PARALELNO.
4. Parser/repair/citation koraci prolaze `/codex:adversarial-review` prije commita
   (CLAUDE.md konvencija); nalazi su advisory, gate ostaje check + golden.
5. `src/ui/app.ts` se dira minimalno (git-race pravilo): novi kod ide u zasebne module,
   app.ts dobiva najvise mount/hook poziv.
6. Nijedan korak ne smije oslabiti postojece sigurnosne maske repair enginea (oMath,
   track-changes, w:sdt, balancedRanges, backstop no-op).
7. Svaki korak koji mijenja javni copy postuje: hrvatski, bez em/en crtica, tvrdnje o
   privatnosti ogranicene na automatsku provjeru.
8. Ako korak otkrije da je pretpostavka iz backloga kriva: STOP, azuriraj backlog dokument,
   pa nastavi. Dokumentacija i kod ne smiju divergirati.

## 1. Vizualni pregled ovisnosti

```
TRACK K (kod, sekvencijalno):
K0 --> K1 --> K2 --> K3 --> K4 --> K5 --> K6 --> K7 --> K8 --> K9* --> K10 --> K11 --> K12 --> K13 --> K14
                                                          ^
TRACK O (vlasnik, paralelno):  O1 --> O2 --> O3 ----------+--> O4 --> O5 (GO-LIVE gate: K8+K9+O4)
TRACK D (odluke i podaci):     D1, D2 (prije K8), D3 (u K0), D4 (prije K11 imenovanja)
* K9 je jedini K korak koji ceka track O (staging okruzenje).
```

## 2. TRACK K: kodni koraci

### K0. Stabilizacija grane i baseline (preduvjet svega)
- Backlog: (novo, iz plana tjedan 1). Trajanje: 0,5-1 dan. Status: GOTOVO 2026-07-13
- Sto: push `redesign-korektorski-stol` na origin; pricekati zeleni CI (grana nikad nije
  prosla CI, ukljucivo repair Feature B); odluka D3 (merge u master sada ili nakon K1);
  zabiljeziti baseline metrike iz analitike (posjete, upload rate, repair download rate).
- Datoteke: nema kodnih izmjena; git + CI + biljeska u ovom dokumentu.
- Ulazni gate: nema. Izlazni gate: CI zelen na grani; baseline brojke zapisane.
- Rizik: CI otkrije env razliku (memorija: vitest 2.1.9 na Node 24 kolektira 0 testova,
  koristiti vite-node ako se pojavi); rjesava se prije K1.
- IZVJESTAJ: redesign grana mergeana u master i pushana (D3 = merge odmah, odradjeno
  paralelnom sesijom); CI zelen na ce013a1 (redesign), b58b2df (nav fix koji je ujedno
  zatvorio nav dio BL-03) i cae6243 (docs). Baseline metrike: klijentska analitika je
  INERTNA (endpoint prazan), pa je baseline moguc samo iz Netlify dashboarda (vlasnicki
  korak; zabiljeziti tjedne brojke prije deploya K1).

### K1. Paket A: istina o proizvodu (BL-01 + BL-02 + BL-03)
- Trajanje: 1-2 dana. Status: GOTOVO 2026-07-13
- IZVJESTAJ: FAQ + JSON-LD prepisani na istinu (obje pojave, sync ocuvan), hero-lead i
  korak 03 najavljuju popravak s novim Wordom, "Nije provjera plagijata" u trust-row prvog
  ekrana, meta description na stvarnu pokrivenost (30+ ucilista). Nav dio BL-03 vec rijesen
  commitom b58b2df (paralelna sesija). Gate: npm run check zelen; dist sadrzi nove
  stringove, negacija uklonjena, oba JSON-LD bloka valjana. Isticanje repair panela
  odgodjeno za K3 (tamo panel dobiva score prije/poslije).
- Sto: FAQ + JSON-LD prestaju negirati AutoFix; "nije provjera plagijata" u prvi ekran;
  meta/OG stvarna pokrivenost (33 institucije); vratiti nav linkove (Usporedba, Alati).
- Datoteke: index.html (JSON-LD blok :29, FAQ :1489, hero, nav); seo/head regresijski test.
- Ulazni gate: K0. Izlazni gate: check zelen; grep potvrdjuje da nijedan javni tekst ne
  negira popravak; JSON-LD prolazi Rich Results test; rucni pregled 375px/1440px, obje teme;
  DEPLOY na produkciju (prvi javni ishod pipelinea).
- Napomena: formulacija ne smije obecati strukturne popravke koji jos ne postoje
  ("dodajemo postupno").

### K2. Golden repair harness (BL-08) : GATE ZA SVE FIXERE
- Trajanje: 2-3 dana. Status: GOTOVO 2026-07-13
- Sto: nova suite tests/repair-golden.test.ts; za svaku realnu fixturu pokrenuti svih 5
  fixera + deep varijante i snapshotirati changelog + kljucna XML svojstva izlaza (sectPr,
  docDefaults, Normal); dodati 1-2 nove fixture s viselijecnim sekcijama (trebaju K4-K6).
- Datoteke: tests/repair-golden.test.ts (novo), tests/fixtures/docx/ (+2 fixture).
- Ulazni gate: K1. Izlazni gate: suite pada na bilo kakvu promjenu ponasanja postojecih
  fixera; postupak snimanja novog baselinea dokumentiran u testu; check zelen.
- Rizik: nizak; cisto aditivno.
- IZVJESTAJ: harness snima matricu 8 dokumenata (6 realnih fixtura + 2 sinteticka) x 5
  fixera x {shallow, deep, kombinirano}; po slucaju: params (izvedeni iz profila istim
  paramsForCheck kao zivi repair-items, ili fiksni za sintetiku), applied, changelog
  labeli, skipped, noOpBitIdentican i XML markeri izlaza (docDefaults, Normal, SVE sectPr
  sekcije s pgSz/pgMar/pgNumType, brojaci izravnog formatiranja). Dvije nove fixture su
  DETERMINISTICKI sinteticki .docx u izvoru (tests/helpers/synthetic-docx.ts,
  single/multi-section, bez pgNumType, s deep backstopima) umjesto neprozirnog binarnog
  fixtura, reusabilne za K4-K6. Tvrdi asserti uz snapshot: bit-identican no-op i
  idempotencija (ponovna primjena = no-op) na sintetici. Baseline: 28 stvarnih primjena,
  14 no-op, pgNumType null u svima (ciljno stanje K4). Gate: npm run check zelen (1639
  testova); postojeci docx-golden i synthetic-golden snapshoti NETAKNUTI. Snimanje novog
  baselinea: npm test -- -u.

### K3. Repair re-check petlja: score prije -> poslije (BL-04)
- Trajanje: 3-4 dana. Status: CEKA
- Sto: nakon uspjesnog applyFixers automatski analizirati popravljene bajtove kroz postojeci
  analyze-docx-client (worker, isti memorijski capovi); render "prije -> poslije" (ukupno +
  4 kategorije) u repair panelu; zapis u povijest kao re-check istog fingerprinta, ne novi
  dokument; pad ponovne analize NIKAD ne blokira download.
- Datoteke: src/ui/repair-panel.ts (glavnina), src/analysis/analyze-docx-client.ts (minimalni
  export ako treba), tests (panel + usporedba rezultata).
- Ulazni gate: K2. Izlazni gate: check + golden zeleni; docx-smoke rucno; demo video
  materijal "68 -> 84" snimljen; deploy.
- Rizik: dvostruka analiza na slabom uredjaju (ne paralelno s prvom analizom; isti capovi).

### K4. Fixer pgNumType nad postojecim sekcijama (BL-06)
- Trajanje: 2-3 dana. Status: CEKA
- Sto: novi fixer krpa w:pgNumType (start=1, fmt lowerRoman/decimal) po sekcijama prema
  profilu (checkId page-numbers vec postoji u rule-compileru); dokument bez sekcija =
  bit-identican no-op s objasnjenjem u panelu.
- Datoteke: src/repair/fixers.ts, xml-patch.ts, repair-items.ts, scripts/gen-*maps (repair
  mapa), testovi + golden.
- Ulazni gate: K3 (panel vec prikazuje prije/poslije pa novi fixer odmah dokaziv).
- Izlazni gate: check + golden (ukljucivo nove fixture sa sekcijama); Word i LibreOffice
  otvaraju izlaz bez upozorenja (rucna matrica); /codex:adversarial-review odradjen; deploy.

### K5. Footer PAGE polje: prosirenje engine politike (BL-07b) : NAJTEZI KORAK
- Trajanje: 4-5 dana. Status: CEKA
- Sto: umetanje footer parta (footerN.xml + rels + [Content_Types].xml + w:footerReference
  u sectPr) s PAGE poljem; prvo prosirenje apply-fixers politike izvan
  document.xml/styles.xml: nove maske, nova backstop pravila, eksplicitni popis partova
  koje engine smije dirati.
- Datoteke: src/repair/apply-fixers.ts (politika), xml-patch.ts, zip-codec.ts (novi part
  flow), fixers.ts, opsezni novi testovi.
- Ulazni gate: K4 + eksplicitno odobrenje (mijenja politiku enginea). Izlazni gate: golden
  na svim fixturama; original s ispravnim footerima = bit-identican no-op; Word/LO matrica;
  adversarial review; NE deploya se sam (ide zajedno s K6).

### K6. Umetanje sekcije prije Uvoda + korisnikova potvrda (BL-07c)
- Trajanje: 3-4 dana. Status: GOTOVO 2026-07-13 (commit f7b7c1c, CI zelen, DARK)
- IZVJESTAJ: novi kompozitni section-insert-fixer za JEDNOSEKCIJSKI rad. Nova primitiva
  insertSectionBreakBeforeParagraph (xml-patch.ts) umece <w:p><w:pPr><w:sectPr>..</w:pPr></w:p>
  prije Uvoda; koordinatni sustav = analyzeDocx introParagraphIndex (n-ti <w:p> == n-ti
  els(doc,'w:p')), MASKIRA komentare/CDATA/PI da <w:p u komentaru ne pomakne indeks, guardovi
  tbl/txbxContent/sdtContent balans + pPrChange (zivi sectPr) + sectPrChange no-op. Marker
  nosi pgSz/pgMar zavrsnog sectPr + <w:titlePg/> (naslovnica bez broja). Kompozit REUSE K4
  (patchSectionPageNumbering [{0,rimski,1},{1,arapski,1}]) + K5 (footerPageFixer, glavnu Word
  nasljedjuje). OPSEG v1: samo cist jednosekcijski rad (backstop preSectPr.length===1; odbija
  i docx s postojecim titlePg/header/footerReference; visesekcijski deferiran). Panel trazi
  potvrdu lokacije prije SVAKE strukturne primjene (bez latch flaga; escapeHtml). Adversarial
  review (Workflow 4 lens-a, 7->5 nalaza fixano: titlePg na glavnoj sekciji, comment drift,
  pPrChange, sdtContent, confirm latch), golden regeneriran, check + CI zeleni.
  DARK: SECTION_INSERT_LIVE=false; app.ts zove flag-gated introSectionRepairableItem, nikad
  jezgru. PREOSTAJE (vlasnik, izlazni gate): rucna Word/LibreOffice matrica na izlazu fixera
  (golden dokazuje samo XML-transform, ne realnu Word valjanost) -> SECTION_INSERT_LIVE=true
  -> DEPLOY K5+K6 ZAJEDNO + landing/FAQ + SEO (K13).
- Sto: umetanje w:p/w:pPr/w:sectPr prije odlomka Uvoda (sidro: postojeca detekcija
  checkPageNumberStartAtIntro); panel trazi potvrdu lokacije prije primjene; kombinirano s
  K4+K5 daje kompletno "numeriranje od Uvoda".
- Datoteke: src/repair/fixers.ts, repair-panel.ts (potvrda), testovi + golden (min 4
  realna dokumenta bez sekcija).
- Ulazni gate: K5. Izlazni gate: end-to-end na realnim radovima (dokument bez sekcija ->
  rimski/arapski od Uvoda); check + golden; adversarial review; DEPLOY K5+K6 zajedno;
  landing/FAQ azuriran (sada je istina); SEO stranica "numeriranje stranica od uvoda"
  moze u K13.
- Rizik: najveci UX rizik pipelinea (semanticka odluka o mjestu prijeloma): zato potvrda
  po stavci + backstop.

### K7. TOC polje s dirty flagom (BL-09)
- Trajanje: 2 dana. Status: GOTOVO 2026-07-13 (commit e4ce6f5, CI zelen, DARK)
- IZVJESTAJ: novi toc-field-fixer umece ZIVO TOC polje (fldChar begin/instrText " TOC \\o "1-3"
  \\h \\z \\u "/separate/placeholder/end, w:dirty na begin) neposredno IZA naslova "Sadrzaj";
  Word ga regenerira pri otvaranju. Rucno utipkane stavke se NE brisu (nedestruktivno; preporuka
  za brisanje u afterLabel). analyze-docx details += sadrzajParagraphIndex + hasTocField. SIDRO se
  RE-DERIVIRA iz trenutnog documentXml po tekstu (sectionName), NE iz anal-time indeksa (adversarial
  HIGH: empty-paragraph/section-insert u istoj bateriji pomicu indekse). documentHasTocField usidren
  na gramatiku field koda (instrukcija pocinje s TOC): hvata split-run instrText, ne lazira na "toc"
  u HYPERLINK URL-u, fixer ne duplicira polje (idempotentan). Adversarial review (Workflow 3 lens-a,
  7->5 nalaza): HIGH stale-index -> re-derivacija; MEDIUM split-run + LOW HYPERLINK -> field-grammar
  detekcija; MEDIUM updateFields (LibreOffice/Docs ne osvjezavaju polje na otvaranju -> placeholder)
  + LOW nested-Sadrzaj divergencija DOKUMENTIRANI. Testovi: src/repair/toc-field.test.ts (27).
  DARK: TOC_FIELD_LIVE=false; app.ts zove flag-gated tocFieldRepairableItem. check + CI zeleni.
  PREOSTAJE (vlasnik, izlazni gate): rucna Word/LibreOffice provjera (regenerira li Word TOC na
  otvaranju, bez upozorenja) -> TOC_FIELD_LIVE=true -> deploy (moze uz K5/K6 matricu). NAPOMENA:
  isti stale-index rizik tinja u K6 section-insert (empty-paragraph prije njega u bateriji);
  rijesiti/provjeriti prije SECTION_INSERT_LIVE flipa (K6 koristi anal-time introParagraphIndex).
- Sto: umetanje TOC polja (w:fldSimple ili sdt, "TOC \\o 1-3 \\h", w:dirty) na mjesto
  postojeceg naslova Sadrzaj; rucni sadrzaj se NE brise (samo preporuka u panelu).
- Ulazni gate: K6. Izlazni gate: Word pri otvaranju izracuna TOC; no-op ako polje postoji;
  check + golden; deploy.

### K8. Predfinancijsko ciscenje (BL-12 + BL-13)
- Trajanje: 1-2 dana. Status: CEKA
- Sto: cijene rucnih usluga iz JEDNOG izvora (products tablica; klijent fallback);
  stari Netlify narudzbeni tok ukloniti ili jasno odvojiti s vlastitom privolom.
- Datoteke: src/catalog/products-catalog.ts, app.ts pricing render (minimalno), index.html,
  supabase seed.
- Ulazni gate: K7 + odluka D2 (stvarne cijene). Izlazni gate: nijedna cijena na dva mjesta;
  promjena cijene bez deploya (set_product_price); check zelen.

### K9. Paywall staging smoke (BL-14) : CEKA TRACK O
- Trajanje: 2 dana. Status: CEKA
- Sto: skripta/scenarij: teaser -> checkout sandbox -> webhook simulacija -> entitlement ->
  unlock -> re-check unutar slota; na Supabase stagingu.
- Ulazni gate: K8 + O4 (staging s tajnama). Izlazni gate: cijeli placeni lijevak zelen;
  refund runbook provjeren. Ovo je zadnji kodni gate za GO-LIVE (O5).

### K10. ZIP submission paket (BL-15, Paket C)
- Trajanje: 3-4 dana. Status: CEKA
- Sto: buildSubmissionPackage(checklist, files) u novom src/submission/package-builder.ts
  (cista funkcija); ZIP = popravljeni/originalni docx + PDF + izjava + metadata Word po
  checklisti profila + README.txt s preostalim rucnim koracima; gumb u submission tabu.
- Ulazni gate: K3 (moze i ranije, jedina tvrda ovisnost je repair download koji vec
  postoji); planiran nakon K9 da sezona krene s naplatom. Izlazni gate: unit builder +
  zip round-trip; ZIP se otvara u Exploreru i 7-zip; rucna provjera paketa za 3 pilot
  fakulteta; deploy (Submission Ready SKU isporuciv).

### K11. Podatkovna tocnost checkliste (BL-16 + BL-11)
- Trajanje: 2 dana + podatkovni rad. Status: CEKA
- Sto: submission.requiresPdfA kao polje profila (migracija FPZG hardkoda iz app.ts);
  preflight retrigger kad se PDF doda nakon analize; imenovanje datoteka po namingRule
  gdje D4 podaci postoje.
- Ulazni gate: K10 + D4 (verificirana pravila imenovanja/PDF-A po fakultetima).
- Izlazni gate: profil bez PDF/A zahtjeva ga ne trazi; zamjena PDF-a odmah azurira tab.

### K12. Playwright e2e temelj (BL-17)
- Trajanje: 3 dana. Status: CEKA
- Sto: playwright config + 3 scenarija (upload fixture -> score; repair -> download ->
  valjani zip; demo bez uploada) + CI job na PR.
- Ulazni gate: K10 (pokriva i paket). Izlazni gate: zeleno lokalno i u CI; flaky < 1/20.

### K13. SEO alati val 2 (BL-18)
- Trajanje: 2-3 dana po alatu. Status: CEKA
- Sto: standalone stranice na postojecim motorima: numeriranje-stranica (K4-K6 motor),
  word-cistac (repair teaser), provjera-naslovnice (title-pages data); konverzijski
  obrazac "popravljeno X, nadjeno jos Y, popravi sve za Z EUR".
- Ulazni gate: K6 (za numeriranje alat) + K9 (da CTA vodi u zivu naplatu).
- Izlazni gate: canonical/OG/JSON-LD po postojecem generator obrascu; u sitemapu; interno
  linkanje s alati.html; check zelen.

### K14. Dug i higijena (BL-05, BL-10, BL-20, BL-21)
- Trajanje: kontinuirano nakon K13. Status: CEKA
- Sto: fixer razmaka odlomaka/uvlaka (BL-05); cistac teksta (BL-10, prvi w:t zahvat, nova
  klasa zastita); CLAUDE.md/VISION ispravci (BL-20); effectiveRules wiring pa migracija
  rules -> ruleEntries profil po profil (BL-21, TEK uz dokaz nula-diffa).
- Ulazni gate: K2 harness za fixere; faithfulness + golden za BL-21.

## 3. TRACK O: vlasnicki koraci (paralelno, runbook GO_LIVE_NAPLATA.md)

- O1. Supabase produkcijski projekt + db push migracija 0001-0018 + products seed.
  Moze poceti ODMAH. Status: CEKA
- O2. Lemon Squeezy: MoR racun, proizvodi, mor_product_id mapiranje, MOR_WEBHOOK_SECRET,
  sandbox checkout test. Ulaz: O1. Status: CEKA
- O3. Vanjski preduvjeti: pravni subjekt, Resend DPA (EU regija) ako se pale podsjetnici,
  PITR backup, odluka o garancijskom tekstu. Paralelno s O1/O2. Status: CEKA
- O4. Staging + produkcijski config: endpointi (report, checkout, guarantee) u
  konfiguraciju, rebuild, deploy na Netlify. Ulaz: O2 + K8. Status: CEKA
- O5. GO-LIVE odluka: pali se naplata. Ulaz: O3 + O4 + K9 zelen. Cilj: tjedan 8 plana
  (pocetak jesenskog vala). Status: CEKA

## 4. TRACK D: odluke i podaci (blokiraju pojedine K korake)

- D1. lekta-pipeline pozicioniranje (BL-19): Expert alat / institucijski / odvojen brand /
  pauza; uskladiti m3/m4 s odlukom "bez istojezicnog plagijata". Ne blokira nijedan K
  korak; blokira BILO KAKVU integraciju pipelinea. Status: CEKA
- D2. Stvarne cijene rucnih usluga (39/69/99 vs 49): potrebno prije K8. Status: CEKA
- D3. Merge strategija redesign grane: u K0. Status: CEKA
- D4. Podatkovni rad: verificirati pravila imenovanja datoteka i PDF/A zahtjeve po
  fakultetima (za K11); ide postojecim verifikacijskim pipelineom (izvor, sourcePage,
  snapshot). Status: CEKA

## 5. Kontrolne tocke (milestones)

| Milestone | Uvjet | Ocekivano (plan) |
|---|---|---|
| M1: Landing govori istinu | K1 deployan | tjedan 1 |
| M2: AutoFix dokaziv brojkom | K3 deployan | tjedan 3 |
| M3: Numeriranje od Uvoda zivo | K6 deployan | tjedan 6 |
| M4: GO-LIVE naplate | O5 (K8+K9+O4) | tjedan 8 |
| M5: Submission Ready isporuciv | K10 deployan | tjedan 9 |
| M6: Kvaliteta osigurana | K12 u CI | tjedan 11 |
| M7: Rast ukljucen | K13 u sitemapu | tjedan 12-13 |

## 6. Kako se pipeline izvodi u praksi

Svaki K korak se pokrece kao zasebna sesija nalogom oblika: "izvedi korak K<N> iz
LEKTA_BUILD_PIPELINE.md". Sesija: (1) procita korak + povezani BL zapis, (2) provjeri
ulazni gate, (3) implementira, (4) provede izlazni gate (check, golden, review), (5)
commita, (6) azurira Status stupac ovog dokumenta (CEKA -> GOTOVO + datum + commit hash).
Korak koji ne prodje gate se NE commita; umjesto toga se azurira backlog s naucenim.

Tocke gdje je potrebno eksplicitno odobrenje vlasnika prije pocetka: K5 (mijenja politiku
repair enginea), K8 (cijene, D2), O5 (go-live). Sve ostalo tece po redoslijedu bez pitanja.
