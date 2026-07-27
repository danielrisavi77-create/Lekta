# Prompt: potpuni adversarijalni audit Repair Enginea

Kako pokrenuti: zalijepi sadrzaj ovog dokumenta kao poruku u Claude Code sesiju u ovom repozitoriju
(ili napisi "pokreni audit iz docs/AUDIT_REPAIR_ENGINE_PROMPT.md, ultracode"). Kljucna rijec
"ultracode" ukljucuje multi-agentnu orkestraciju; bez nje audit ide sporije, u jednoj niti.

---

## Uloga i cilj

Provedi POTPUNI adversarijalni audit Repair Enginea (automatski popravak .docx radova), s ciljem da
se pronadje SVAKA greska, svako mjesto gdje popravak tiho ne radi ili radi krivo na realnim radovima,
svaki nesklad izmedju onoga sto UI obecava i onoga sto motor stvarno napravi, te svako smisleno
poboljsanje. Vlasnik NIJE posve zadovoljan kako popravak radi u praksi: dio audita je i dijagnoza
ZASTO (gap analiza obecanje vs ponasanje), ne samo lov na bugove.

Audit je READ-ONLY: nista se ne mijenja u src/, testovima ni podacima. Fixevi idu tek nakon audita,
svaki kao zaseban, odobren task uz golden gate.

## Opseg (sve datoteke su obavezno procitane, ne samo grep)

Jezgra motora (dijeli ju klijent i server):
- src/repair/zip-codec.ts (zip citac/pisac, zip-bomb budzet)
- src/repair/xml-patch.ts (1243 retka, regex OOXML patcheri: margine, format, font/docDefaults/Normal/
  Heading teme, prored, poravnanje, razmaci, fusnote, pgNumType po sekcijama, footer part flow,
  umetanje sekcije prije Uvoda, TOC polje, poravnanje broja stranice, re-derivacija sidra po tekstu)
- src/repair/run-level.ts (deep ciscenje izravnog formatiranja)
- src/repair/paragraph-cleanup.ts (kolabiranje praznih odlomaka, front-matter zona, prilozi)
- src/repair/heading-case.ts (velika slova naslova, JEDINI zahvat u tekst)
- src/repair/fixers.ts (registar fixera, changelog oznake, deep kombiniranje, kompozitni section-insert)
- src/repair/apply-fixers.ts (zip -> zahtjevi -> re-encode SAMO promijenjenih partova)

Wiring i UI:
- src/analysis/check-fixer-map.ts (checkId <-> naslov provjere <-> fixerId)
- src/ui/repair-items.ts (gradnja RepairableItem iz profila + checkova, univerzalne stavke,
  SECTION_INSERT_LIVE / TOC_FIELD_LIVE zastavice, sectionNumberingTargets)
- src/ui/repair-panel.ts (lokalni panel: checkboxi, deep toggle, potvrdni korak, recheck)
- src/ui/app.ts: renderRepairSection, renderServerRepairPanel, renderTextItemsSection,
  repairReferencesFrom, scrollToRepairPanel, repair history funkcije (oko linija 1220-1410 i 400-415)
- src/ui/repair-diff.ts + src/ui/repair-diff-model.ts (prikaz "sto je popravljeno")
- src/ui/source-check-view.ts (prikaz provjere izvora uz popravak)

Klijent-server i server:
- src/report/repair-client.ts, src/report/repair-contract.ts, src/report/repair-history.ts
- supabase/functions/repair-docx/index.ts (auth, consent, tier mismatch, LIVE_FIXERS, FREE_MODE
  rate-limit po korisniku I po IP-u, entitlement/slot, applyFixers, storeRepairJob, korpus paralelno)
- supabase/functions/cleanup-orphan-repairs, delete-repair-job, _shared/ (cors, hash-ip)
- migracije vezane uz repair_jobs (0026 nadalje, ukljucivo 30-dnevno brisanje anonimnih, 0033)

Testovi i harness:
- src/repair/*.test.ts, tests/repair-client.test.ts, tests/repair-diff*.test.ts,
  tests/repair-golden.test.ts, tests/repair-history.test.ts, tests/docx-golden.test.ts + fixtures
- scripts/word-verify/* (PRAVI Word na ovom stroju + python-docx; repair.mts provlaci docx kroz
  stvarni motor; check.ps1 / make-worst-case.ps1)
- scripts/emit-repair-samples.mjs

Dokumentacija (za provjeru drifta, ne kao izvor istine):
- docs/GO_LIVE_REPAIR.md, docs/LEKTA_BUILD_PIPELINE.md (K4-K7), docs/UX_PRINCIPLES.md, CLAUDE.md

## Tvrda pravila

1. READ-ONLY. Smijes pisati iskljucivo: izvjestaj audita, jednokratne repro skripte u scratchpad,
   te pomocne .docx uzorke u scratchpad. Nista u src/, tests/, data/, docs/ osim finalnog izvjestaja.
2. Nalaz bez reprodukcije ne postoji. Svaki CONFIRMED mora imati ili (a) minimalni XML/docx ulaz +
   tocan poziv + krivi izlaz (izvedeno vitest snippetom ili vite-node skriptom u scratchpadu), ili
   (b) potpun lanac file:line koraka s ulaznim uvjetima koje je moguce ispuniti realnim dokumentom.
   Nalaz koji se ne da reproducirati ostaje PLAUSIBLE i tako se i oznacava.
3. Adversarial verify: svaki nalaz neovisno pokusaj OBORITI kroz tri lece:
   (a) reprodukcija kodom (stvarno izvrsi), (b) ECMA-376 / ponasanje pravog Worda (scripts/word-verify
   je dostupan, Word JE instaliran na stroju), (c) dokumentirana namjera (komentari "POZNATA
   OGRANICENJA", "svjesno deferirano", "namjerno"). Nalaz koji preziv i sve tri lece je CONFIRMED.
4. Svjesna, dokumentirana ogranicenja NISU bugovi. ALI: postaju nalaz kategorije "poboljsanje" ako
   (a) proturjece poruci koju korisnik vidi u UI-u, ili (b) pokrivaju cest realan slucaj pa je
   ogranicenje glavni razlog da popravak "ne radi" iz perspektive korisnika. Takve rangiraj visoko.
5. Ne preuzimaj tudje zakljucke: sve polazne hipoteze iz ovog prompta (dolje, oznaka H-*) tretiraj
   kao NEPROVJERENE. Potvrdi ili obori svaku, s dokazom.
6. npm run check na pocetku i na kraju mora biti zelen (dokaz da audit nista nije dirao).
7. Parser/citation sloj NIJE u opsegu osim tocaka dodira (details.* polja koja repair-items cita).

## Faze

FAZA 1, mapa i inventar: procitaj sve iz opsega. Izgradi tocan inventar: popis svih 16 fixera,
za svaki: sto patcha, koje garde ima, je li idempotentan, ima li deep varijantu, kako se nudi u UI
(teaser/placeno/univerzalno/flag), kako putuje na server, koji ga testovi pokrivaju. Vec ovdje
zabiljezi rupe u pokrivenosti.

FAZA 2, nalazi po dimenzijama: za svaku dimenziju D1-D16 (dolje) zaseban fokusiran prolaz.
U ultracode nacinu: jedan finder po dimenziji, paralelno.

FAZA 3, adversarial verifikacija: svaki nalaz kroz tri lece iz pravila 3. U ultracode nacinu:
verifikatori paralelno, po nalazu.

FAZA 4, prakticni dokaz na realnim dokumentima: provuci tests/fixtures/docx/* i worst-case uzorke
(scripts/word-verify/make-worst-case.ps1, make-fixtures.ps1) kroz scripts/word-verify/repair.mts.
Provjeri: (a) netaknuti partovi bit-identicni, (b) izlaz otvara Word bez "repair" upozorenja
(check.ps1), (c) sva trazena pravila STVARNO primijenjena mjereno Wordom, ne nasim parserom,
(d) idempotencija: drugi prolaz istog popravka daje nula izmjena.

FAZA 5, sinteza i rang: dedupliciraj, rangiraj, napisi izvjestaj.

Loop-until-dry: nakon FAZE 3 pokreni jos jedan krug findera nad modulima gdje je gustoca nalaza
najveca; stani tek kad 2 kruga zaredom ne daju nista novo.

## Dimenzije i polazne hipoteze (H-* = neprovjereno, dokazi ili obori)

D1, XML ispravnost (xml-patch.ts):
- H-1: upsertChild dodavanje atributa koristi regex /\s*\/?>$/ nad CIJELIM elementom; kod uparenog
  praznog oblika (npr. <w:sz></w:sz> bez w:val) atribut bi se ubacio u ZATVARAJUCI tag i dao
  malformiran XML. Utvrdi moze li realan ili rubni dokument doci do te grane.
- H-2: patchDefaultFont korak 2 (uklanjanje asciiTheme s Heading stilova) preskace samo kad postoji
  w:ascii; stil sa SAMO w:hAnsi="X" eksplicitnim zavrsi s mijesanim fontom (ascii iz docDefaults,
  hAnsi X). Provjeri i sto Word tada renderira za hrvatske dijakritike.
- escapeXmlAttr potpunost; setTagAttribute i insertIntoSectPr redoslijed po CT_SectPr; maskiranje
  (maskElement duljine, NUL placeholderi u run-level); paragraphOwnsSectPr i pPrChange split;
  documentHasTocField lazni pozitivi/negativi; findParagraphEndAfterMatch preskakanje ugnjezdenih.

D2, semantika fixera i changelog postenje (fixers.ts):
- H-3: fontFixer moze vratiti applied:true s PRAZNIM beforeLabel/afterLabel kad je promijenjen samo
  heading-theme (korak 2), pa UI prikaze prazan redak "->". Reproduciraj.
- H-4: pageNumberingFixer beforeLabel uvijek tvrdi "nije postavljeno" i kad je pgNumType POSTOJAO s
  drugim vrijednostima; changelog tada laze o zatecenom stanju.
- H-5: footerPageFixer default align je 'right', sectionInsertFixer default 'center'; provjeri je li
  nekonzistentnost namjerna i sto stvarno zavrsi u dokumentu za svaku ulaznu kombinaciju.
- combineDeep spajanje parts.documentXml; footnoteSpacingFixer rucno prepisani merge; NO_OP putanje
  vracaju li bas ULAZNE parts (aliasing).

D3, deep ciscenje (run-level.ts):
- H-6: odlomci koji sadrze <w:sdt> (inline citation kontrole, ceste kod Zotero/Mendeley korisnika)
  se preskacu CIJELI; procijeni na realnim fixturama koliko tijela rada deep tada uopce ne dira i
  je li to vidljivo korisniku (obecanje "uskladit ce se s fontom profila").
- w:szCs se namjerno ne dira: posljedice za dominantni font/velicinu u analizi poslije popravka;
  tablice (font se dira, prored ne): moze li to POGORSATI score nakon popravka; rStyle skip;
  SIZE_TOLERANCE (3 hp) rubovi; balancedRanges nad malformiranim XML-om.

D4, prazni odlomci (paragraph-cleanup.ts):
- frontMatterRange heuristika: prvi Heading unutar TABLICE naslovnice; APPENDIX_HEADING_RE lazni
  pozitivi ("Prilog ovoj tezi je..." kao pocetak obicnog odlomka); FORBIDDEN_CONTENT potpunost
  (w:tab? mc:Fallback? w:object bez drawing?); interakcija s markerom kojeg je section-insert upravo
  umetnuo (nested-sectPr guard); brojanje u changelogu (paragraphsRemoved vs runsCollapsed, oznake).

D5, velika slova naslova (heading-case.ts):
- TOC cache: nakon promjene teksta naslova, postojeci (ne-zivi) sadrzaj pokazuje stari oblik; nudi
  li se toc-field-fixer u tom slucaju i sto vidi korisnik. Entiteti, ugnjezdeni w:p, fusnotne
  reference unutar naslova, isAlreadyUpper s brojevima/kraticama.

D6, zip-codec.ts:
- ZIP64 (odbija li se cisto ili tiho krivo cita), data-descriptor (flag bit 3), duplicirana imena
  entryja (zadnji pobjedjuje?), EOCD spoofing kroz komentar, STORED entry, determinizam izlaza,
  2x memorijski peak vs Edge 256MB s base64 odgovorom (racun s 20MB ulazom).

D7, apply-fixers.ts pipeline:
- Redoslijed zahtjeva kako ih slaze app.ts (empty-paragraph PRIJE section-insert/toc-field): dokazi
  da su SVA sidra otporna (re-derivacija po tekstu) i da nijedan fixer ne cita anal-time indeks
  nakon mutacije. skipped[] izvjestavanje (ruleId vs label u UI). ENGINE_ADDABLE_PART maska.
  footnotesXml '' vs undefined. Sto se dogodi s zahtjevom nepoznatog fixerId-a (server ga filtrira,
  lokalni put ne: default grana runFixera).

D8, korelacija check <-> fixer (check-fixer-map.ts, repair-items.ts):
- H-7: patchFooterPageAlignment radi patch-only nad w:jc, a Word IZOSTAVLJA w:jc kad je poravnanje
  lijevo; dakle najcesci prekrsaj (broj lijevo, trazi se desno) fixer NE MOZE popraviti i stavka
  zavrsi u "Nije primijenjeno". Provjeri i slucaj vise footer partova (prvi bez jc vraca NO_OP za
  cijeli part, nastavlja li se na sljedeci part ili odustaje).
- H-8: sectionNumberingTargets trazi prijelom TOCNO na odlomku prije Uvoda; visesekcijski rad s
  prijelomom drugdje ne dobiva NIKAKAV popravak numeriranja (ni K4 ni K6). Procijeni koliko je to
  cest slucaj u fixturama/realnim radovima; ovo je vjerojatno velik dio dojma "ne radi".
- CHECK_TITLES bajt-za-bajt vs makeCheck naslovi u analyze-docx.ts (dijakritika!); autoFixable
  ruleEntries pokrivenost po profilima (koliko od 372 profila uopce ima ijednu autoFixable stavku,
  izmjeri skriptom nad data/); paramsForCheck vs stvarni oblik profila (justify undefined, paperSizes).

D9, lokalni panel (repair-panel.ts): requiresConfirmation tok, deep toggle default ON, recheck
  poslije preuzimanja, ocuvanje panela kroz re-render (repairPanelNode), escapeHtml svugdje.

D10, serverski panel (app.ts renderServerRepairPanel):
- H-9: stavka section-insert-intro ima requiresConfirmation + confirmationText ("Provjeri da je to
  tocno mjesto pocetka Uvoda"), ali serverski panel NEMA potvrdni korak: "Popravi sve jednim klikom"
  je primjenjuje bez potvrde lokacije. To proturjeci dizajnu K6 ("najveci UX rizik pipelinea").
- H-10: deep je na serverskom putu PRISILNO ukljucen (_SERVER_DEEP_FIXERS uvijek salje deep:true),
  bez opt-outa koji lokalni panel ima; nema ni per-stavka checkboxa, sve neprekrsene dimenzije se
  takodjer primjenjuju bez izbora. Procijeni je li to namjerno ("jedan klik") i je li korisniku
  receno; predlozi minimalan granularni UI ako nije.
- H-11: poruka za 429 kaze "Dnevni limit BESPLATNIH popravaka", a 429 stize i iz placenog moda
  (decideReportAccess rate_limited); poruka tada laze.
- H-12: src/ui/source-check-view.ts:63 sadrzi `<\div>` (u template literalu to je OTVARAJUCI <div>,
  ne zatvarajuci </div>): neuravnotezen HTML u sazetku. Potvrdi i provjeri vizualni ucinak.
- XSS povrsina: matchedTitle/where/url iz korpusa su VANJSKI podaci (harvestani naslovi), changelog
  labeli u repair-diff; provjeri escapeHtml/safeHref na SVAKOM mjestu umetanja. AbortController tok,
  tier_mismatch petlja (go(true)), dvostruki klik na "Popravi" (btn disabled prije await?).

D11, server (repair-docx/index.ts):
- H-13: u placenom modu slot se trosi (consume_slot_and_bind) PRIJE applyFixers; ako popravak padne
  (422 invalid_docx), utvrdi gubi li korisnik slot ili ga recheck putanja po otisku vraca.
- FREE_MODE rate-limit: regresijski provjeri sve tri ranije popravljene greske (rate_limited retci
  se NE broje, generate-report statusi se NE broje, 'free' se pise TEK nakon uspjeha) i potrazi
  cetvrtu; IP cap nad dijeljenim izlazima; content-length spoofing (clen lagan, stvarna velicina
  se mjeri poslije formData); LIVE_FIXERS vs klijentske zastavice (sinkronizacija); heading-case
  zahtjev SERVER prima bez ikakve dodatne potvrde (LIVE je): rucno skrojen zahtjev mijenja tekst
  tudjeg... zapravo vlastitog dokumenta, procijeni je li to prihvatljiva granica; storeRepairJob
  fail-open i poruka u UI (jobId null); corpusPromise bez awaita kod ranih izlaza (Deno lifecycle);
  cleanup-orphan-repairs i delete-repair-job konzistentnost sa storage putanjama.

D12, privatnost, pravno, copy vs stvarnost:
- Panel tvrdi "ne diraju se sadrzaj, citati ni argument", a heading-case (uz kvacicu) upravo mijenja
  tekst: je li formulacija uz kvacicu dovoljno jasna. meta bez doslovnog teksta (references iznimka
  dokumentirana): potvrdi da NISTA drugo tekstualno ne curi (parsedStructure headings su naslovi!
  procijeni je li to u skladu s obecanjem). consentVersion tok, anonimna retencija 30 dana (0033
  cron postoji i radi?), GDPR tekstovi vs repair pohrana.

D13, realna Word/LO valjanost (FAZA 4 gore): izvrsiti, ne samo procitati.

D14, testna pokrivenost: za svaku CONFIRMED/PLAUSIBLE hipotezu koja nema test, predlozi tocan test
  case (datoteka, ime testa, ulaz, ocekivanje). Posebno: grane iz H-1, H-3, H-7; mutacijska proba
  na 3-5 kljucnih garda (rucno izokreni uvjet u glavi, postoji li test koji bi pao).

D15, performanse: 20MB docx, tisuce odlomaka; insideRanges O(n*m); regex backtracking nad
  patoloskim XML-om (dugacki atributi, duboko ugnjezdenje); Edge memorija: bajtovi ulaza + parts
  stringovi + izlaz + base64 + storage upload paralelno, izracunaj peak za 20MB dokument.

D16, dokumentacijski drift:
- H-14: kod referencira REPAIR_ENGINE.md (fixers.ts, repair-panel.ts), a ta datoteka NE POSTOJI u
  repou; utvrdi kamo je nestala i sto jos na nju pokazuje.
- GO_LIVE_REPAIR.md vs stvarne zastavice (FREE_MODE, SECTION_INSERT_LIVE=true, TOC_FIELD_LIVE=true,
  DARK_FIXERS), CLAUDE.md, komentari "NACRT (NIJE deployano)" u deployanom kodu.

## Izlazni format

Napisi docs/AUDIT_REPAIR_ENGINE_<YYYY-MM-DD>.md sa:
1. Sazetak (10 recenica): stanje motora, top 5 nalaza, top 3 uzroka nezadovoljstva.
2. Tablica nalaza, rangirana po ozbiljnosti:
   - ID, dimenzija, severity, status (CONFIRMED/PLAUSIBLE/OBOREN), file:line, tvrdnja (1 recenica),
     reprodukcija (ili razlog zasto je PLAUSIBLE), predlozeni fix (1-2 recenice), procjena truda.
   - Severity: P0 = korupcija/gubitak dokumenta, novca ili podataka; P1 = popravak ne radi ili radi
     krivo na realnim radovima; P2 = nepostena/kriva poruka korisniku, UX rupa; P3 = poboljsanje.
3. Posebna sekcija "Zasto dojam da ne radi": rang lista uzroka gapa izmedju obecanja UI copyja i
   stvarnog ponasanja, svaki s dokazom i prijedlogom (moze biti i "promijeni copy", ne samo kod).
4. Sekcija "Predlozeni testovi" (iz D14).
5. Sekcija "Oboreni nalazi" (sto je provjereno i NIJE problem, da se ne otkriva ponovno).
6. Dokazni artefakti (repro skripte) ostaju u scratchpadu; u izvjestaju samo njihove kljucne linije.

Na kraju u chatu: sazetak izvjestaja + potvrda da je npm run check zelen i da nista u src/ nije
mijenjano (git status).

## Ne-ciljevi

- NE primjenjuj nijedan fix, ni "ocit" (ni H-12).
- NE regeneriraj golden snapshote, NE diraj fixture.
- NE audiraj parser/citation/scoring osim tocaka dodira s repairom.
- NE salji nikakav stvarni korisnicki dokument nikamo; svi uzorci su sinteticki ili postojece fixture.
