# Audit Repair Enginea, 2026-07-25

Adversarijalni audit automatskog popravka .docx radova (src/repair/**, wiring u src/ui/**,
serverski put supabase/functions/repair-docx). Proveden multi-agentnom orkestracijom po
docs/AUDIT_REPAIR_ENGINE_PROMPT.md: 16 dimenzija, 15 findera, adversarijalna verifikacija svakog
nalaza kroz tri lece (reprodukcija kodom, ECMA-376 / ponasanje pravog Worda, dokumentirana namjera),
Word/fixture matrica na pravom Wordu (COM), i dva kruga loop-until-dry.

Brojke verifikacije (kumulativno kroz sve krugove): 141 CONFIRMED, 18 OBOREN, 4 PLAUSIBLE presude nad
216 kandidatskih nalaza; nakon deduplikacije po (datoteka, tvrdnja) ostaje 2 P0, ~24 distinktnih P1
i ~40 distinktnih P2, plus dugi rep P3 poboljsanja. Audit je READ-ONLY: nijedna datoteka u src/,
tests/, data/, supabase/ nije mijenjana; jedini zapis je ovaj izvjestaj. Repro skripte zive u
scratchpad/audit/ (npx vite-node).

---

## 1. Sazetak

Motor je arhitektonski zdrav i na dobrom ulazu radi tocno: Word matrica potvrduje da SVI izlazi
(4 fixture para + worst-case) otvaraju pravi Word bez "Word je popravio dokument" dijaloga, da se
mijenjaju iskljucivo document.xml i styles.xml (nijedan part se ne gubi ni dodaje), i da je
idempotencija savrsena (drugi prolaz = nula izmjena). Problem nije u onome sto motor napravi, nego u
onome sto tiho NE napravi: na dokumentima koji nisu "cisti Word engleski" najzeljeniji popravci
(prored, poravnanje, razmak, velika slova naslova, fusnote) redovito zavrse kao tihi no-op, a
provjera ostane crvena i nakon platenog popravka. Glavni uzrok je krutost razrjesavanja stilova:
fixeri tvrdo ciljaju styleId "Normal" / "Heading{n}" / "FootnoteText", dok analiza isti dokument cita
dinamicki (w:default="1", ime stila, outlineLvl), pa se popravak i provjera razilaze na LibreOffice,
Google Docs i lokaliziranom hrvatskom Wordu (stil "Naslov", "Standard"). Drugi veliki uzrok je
pokrivenost podataka: 205 od 395 profila (52%), ukljucivo SVI FPZG i SVI Pravo profili (nosivi
fakulteti proizvoda), nemaju nijedan autoFixable ruleEntry, pa panel za njih ne nudi nista iako
besplatni triage iste nalaze broji kao "mozemo popraviti". Treci uzrok je posteno izvjestavanje:
sirovi interni slugovi umjesto labela, "0 izmjena" prikazano kao "Popravljeno", nula-izmjena trosi
besplatni slot i pohranjuje posao, kartica tvrdi "ne salje se na posluzitelj" dok serverski put
uploada, poruka o limitu spominje "besplatne popravke" i u placenom modu, a popravak numeriranja sam
unosi novi prekrsaj (centrirano umjesto desno). Uz to postoje dvije prave klase korupcije na rubnim
ulazima (brisanje odlomka ciji je jedini sadrzaj jednadzba; umetanje atributa u zatvarajuci tag kod
uparenih praznih elemenata) i dvije monetizacijske rupe (slot se trosi prije popravka i ne vraca; otisak
se racuna iz klijentske meta, ne iz uploadane datoteke). TOP 5 nalaza: (1) P0 gubitak jednadzbi kroz
empty-paragraph-fixer; (2) P1 tihi no-op proreda/poravnanja/razmaka na svim ne-"Normal" dokumentima;
(3) P1 mrtav put poravnanja broja stranice (gate `=== true` vs podatak "right") i popravak koji sam
unosi novi prekrsaj; (4) P1 52% profila bez ijednog autoFixable pravila; (5) P1 brisanje vizualno
nepraznih odlomaka (potpisne linije, tracked-changes, oznake komentara). TOP 3 uzroka nezadovoljstva:
kruto razrjesavanje stilova, rupa u pokrivenosti profila, i neiskrena/nepotpuna povratna informacija
u UI-u.

---

## 2. Nalazi, rangirano

Severity: P0 korupcija/gubitak dokumenta ili podataka; P1 popravak ne radi ili radi krivo na realnim
radovima; P2 nepostena/kriva poruka korisniku ili UX rupa; P3 poboljsanje. Status je konacna presuda
adversarijalne verifikacije. "Repro" navodi skriptu u scratchpad/audit/ (osim gdje je lanac koda).

### P0

| ID | Dimenzija | Datoteka | Tvrdnja | Status / repro | Fix (kratko) | Trud |
|---|---|---|---|---|---|---|
| RE-01 | D4 | [paragraph-cleanup.ts:107](../src/repair/paragraph-cleanup.ts#L107) | empty-paragraph-fixer tiho brise odlomak ciji je JEDINI sadrzaj blok-jednadzba (OMML m:oMath): FORBIDDEN_CONTENT nabraja samo w: elemente, hasVisibleText cita samo `<w:t>`, a tekst jednadzbe zivi u `<m:t>`. Univerzalan (svi profili), LIVE na klijentu i serveru. Trajni gubitak sadrzaja isporucen kao uspjeh. | CONFIRMED, eq-loss.ts: 3 uzastopne jednadzbe -> ostane 1; blank+jednadzba -> jednadzba obrisana | U qualifiesAsOrphanedEmpty diskvalificiraj `<m:oMath`/`<m:oMathPara` (run-level.ts:142 ih vec stiti u deep ciscenju) | S |
| RE-02 | D1 | [xml-patch.ts:301](../src/repair/xml-patch.ts#L301) (H-1) | upsertChild pri dodavanju atributa koji fali koristi `/\s*\/?>$/` nad CIJELIM elementom, pa kod uparenog praznog oblika (`<w:rFonts w:cs="Calibri"></w:rFonts>`) atribut zavrsi u ZATVARAJUCEM tagu: XML nije well-formed, dokument korumpiran. Dostizno kroz sve styles.xml upsert fixere. | CONFIRMED, d1-repro.ts: `</w:rFonts w:ascii="...">`. Napomena: Word matrica pokazuje da CISTE fixture (schema-valjan ulaz) NE dolaze do grane; okida je docx iz tudjih generatora ili rucno editiran | Umetati atribut iskljucivo u OTVARAJUCI tag (izdvoji `^<name\b[^>]*?\/?>`, umetni prije `>`), ostatak konkateniraj | S |

### P1 (distinktni klasteri)

| ID | Dimenzija | Datoteka | Tvrdnja | Status / repro | Fix (kratko) | Trud |
|---|---|---|---|---|---|---|
| RE-03 | D2/D8 | [xml-patch.ts:513](../src/repair/xml-patch.ts#L513), [fixers.ts:288](../src/repair/fixers.ts#L288) | Prored/poravnanje/razmak (i dio fonta) tvrdo ciljaju styleId "Normal"; nema docDefaults backstopa. Na LibreOffice/Google Docs dokumentu (default stil "Standard", w:default="1") i base i deep tiho NO_OP-aju, pa provjere ostaju crvene nakon platenog "uskladi sve". NAJVECI uzrok dojma "ne radi". | CONFIRMED, EMPIRIJSKI: Word matrica MX-2, fixture grf (nema stil Normal) preskace prored (jednostruki, trazi 1.5) i poravnanje (svih 6 odlomaka jc=left, trazi both); repro-libreoffice-defaults.ts potvrduje sva tri | Razrjesavaj default paragraph stil dinamicki (w:default="1", pa "Normal", pa ime), kao sto analiza vec radi; ili upisi i w:pPrDefault backstop | M |
| RE-04 | D8 | [repair-items.ts:245](../src/ui/repair-items.ts#L245) (H-7 srodno) | Cijeli put "Polozaj broja stranice" je MRTAV za sve stvarne profile: gate trazi `profile.pageNumberAlignment === true` (boolean), a svi profili u data/ nose STRING "right"; analiza gate-a truthy pa check postoji i upozorava. Fixer je LIVE na serveru ali nedostizan. | CONFIRMED mjerenjem data/ (verified-profiles + legal-departments: samo "right", 0 boolean true) + repro-gates.ts | Gate na truthy; string proslijedi u params.align | S |
| RE-05 | D2/D8 | [repair-items.ts:409](../src/ui/repair-items.ts#L409) (H-5) | section-insert (numeriranje od Uvoda) umece podnozje s CENTRIRANIM brojem (align:'center'), a SVI profili koji tu stavku nude (checkPageNumberStartAtIntro) istodobno traze broj DESNO (pageNumberAlignment "right"); popravak sam proizvodi novi prekrsaj na recheku. | CONFIRMED, d2-repro.ts/d7-repro.ts: footer dobije jc=center; analyza prijavi warn | align izvedi iz profila (pageNumberAlignment==="right" -> "right") | S |
| RE-06 | D8 | [data/profiles/repair-map.json](../data/profiles/repair-map.json) | 205/395 profila (52%), ukljucivo SVI FPZG i SVI Pravo, nemaju nijedan autoFixable ruleEntry pa buildRepairableItems za njih ne nudi font/velicinu/prored/margine/format/poravnanje; besplatni triage ih broji kao "auto" i nudi gumb "Otvori mogucnost popravka" koji vodi na panel bez te stavke. | CONFIRMED mjerenjem (coverage-measure.mjs: 205 bez zapisa) + triage-vs-panel.ts (triage.auto=4, panel=0) | Popuni autoFixable ruleEntries za FPZG/Pravo iz sluzbenih izvora; do tada triage ne smije klasificirati "auto" bez zapisa | L |
| RE-07 | D8 | [xml-patch.ts:1037](../src/repair/xml-patch.ts#L1037) (H-7) | patchFooterPageAlignment je patch-only nad w:jc, a Word IZOSTAVLJA w:jc za lijevo poravnanje, pa najcesci prekrsaj (broj lijevo, trazi se desno) ne moze popraviti; k tome odustaje od CIJELOG parta na prvom PAGE odlomku bez w:jc. | CONFIRMED, d2-repro3.ts/repro-h7.ts. Nekonzistentno s patchDefaultAlignment koji w:jc STVARA | upsert w:jc u pPr PAGE odlomka (postojeca upsertChild infrastruktura); nastavi na sljedeci PAGE odlomak | S |
| RE-08 | D5 | [heading-case.ts:44](../src/repair/heading-case.ts#L44) | Velika slova naslova (jedini zahvat u tekst, uz privolu) prepoznaje naslove SAMO po literalnom styleId "Heading{n}", dok analiza i preview detektiraju po imenu (heading/naslov) i outlineLvl; na "Naslov1"/"heading1"/outlineLvl radovima popravak tiho ne napravi NISTA, a preview obeca promjenu. | CONFIRMED, d5-heading-case-repro.ts: "Naslov1" -> applied:false, a headingCaseSuggestions vraca izmjenu | Proslijedi stylesXml i izgradi skup styleId-jeva kao findStyleByIdOrName; prihvati outlineLvl | M |
| RE-09 | D5 | [heading-case.ts:16](../src/repair/heading-case.ts#L16) | toCroatianUpper stiti imenovane i decimalne XML reference, ali HEKSADECIMALNU `&#x161;` uppercasea u `&#X161;` (veliko X nije valjan XML CharRef): izlaz malformiran, Word otvara kroz "repair". | CONFIRMED, d5-heading-case-repro.ts + xmldom: "entity not matching Reference production" | Prosiri split regex na `&#x[0-9a-fA-F]+;` | S |
| RE-10 | D5 | [heading-case.ts:49](../src/repair/heading-case.ts#L49) | Prvi `<w:pStyle>` u chunku odlomka moze biti STARI stil iz `<w:pPrChange>` (track changes): odlomak demotiran iz Heading1 u obican tekst dok su revizije ukljucene tretira se kao naslov i cijelo tijelo ide u velika slova, izvan opsega privole. | CONFIRMED, d5-heading-case-repro2.ts | Ukloni `<w:pPrChange>...</w:pPrChange>` prije matchanja pStyle; ogranici na prvi pPr | S |
| RE-11 | D4 | [paragraph-cleanup.ts:151](../src/repair/paragraph-cleanup.ts#L151) | Prazan odlomak s VIDLJIVIM svojstvima odlomka (w:pBdr donji rub = potpisna linija, w:shd traka, w:numPr oznaka) kvalificira se kao "osirotjeli prazan" i BRISE se: qualifiesAsOrphanedEmpty gleda samo sadrzaj runova i `<w:t>`, nikad w:pPr svojstva. | CONFIRMED, d4-repro.ts (pBdr, shd, numPr) | Diskvalificiraj odlomak s `<w:pBdr`/`<w:shd` (fill != auto)/`<w:numPr` u pPr | S |
| RE-12 | D4 | [paragraph-cleanup.ts:107](../src/repair/paragraph-cleanup.ts#L107) | Odlomci s tracked-changes (w:del/w:delText, w:ins) i s markerima raspona (w:commentRangeStart/End, w:moveFrom/ToRangeStart/End) tretiraju se kao prazni i brisu: revizija/anotacija tiho nestaje ili ostaje osirotjeli marker (malformiran review markup). Cest slucaj: mentorov recenzirani rad. | CONFIRMED, repro.ts + repro_b.ts: commentRangeStart obrisan, ostaje nesparen End | Dodaj w:del/w:ins/w:delText/w:moveFrom*/w:moveTo*/commentRange* u FORBIDDEN_CONTENT | S |
| RE-13 | D4 | [paragraph-cleanup.ts:106](../src/repair/paragraph-cleanup.ts#L106) | Odlomak sa samo `<w:tab/>` uz tab-stop s leaderom (potpisna linija "Potpis: ......") brise se: w:tab nije u FORBIDDEN_CONTENT, iako je w:ptab (isti vizualni slucaj) svjesno pokriven 2026-07-20. | CONFIRMED, d4-repro.ts R2 | Dodaj w:tab u FORBIDDEN_CONTENT (ili samo kad pPr ima w:leader) | S |
| RE-14 | D4 | [paragraph-cleanup.ts:201](../src/repair/paragraph-cleanup.ts#L201) | Front-matter zastita naslovnice puca na hrvatskom Wordu: granica zone hvata prvi pStyle koji SADRZI "Heading"/"Naslov", pa stil naslova "Naslov" (Title)/"Podnaslov" NA naslovnici (i Heading u tablicnoj naslovnici) zavrsi zonu na sredini; prazni odlomci ispod naslova se kolabiraju i naslovnica se zbije (regresija koju je zona trebala rijesiti). | CONFIRMED, d4-repro.ts R1: removed=5 od 6 | Zahtijevaj znamenku ((?:Heading|Naslov)[1-9]) kao parser.ts; preskoci matcheve u tablici/sdt | M |
| RE-15 | D3 | [run-level.ts:221](../src/repair/run-level.ts#L221) | Deep stripLineSpacing skida namjerni jednostruki prored s uvucenih blok-citata i potpisa (direct w:line=240 auto uz w:ind): deep AKTIVNO kvari ispravan element (dugi citat postane 1,5). Zastita postoji za exact/atLeast, ne za auto+uvlaka. | CONFIRMED, run-level repro F | Preskoci strip proreda/razmaka za odlomke s w:ind lijevom uvlakom >= praga | M |
| RE-16 | D3 | [run-level.ts:277](../src/repair/run-level.ts#L277) (H-6) | Odlomak s inline `<w:sdt>` (Zotero/Mendeley citatne kontrole) preskace se CIJELI u deep ciscenju, ukljucujuci ne-sdt tekst; UI bezuvjetno obecava "Tekst pisan drugim fontom uskladit ce se" i ne otkriva preskok. Prevalencija nemjerljiva na fixturama (0 sdt). | CONFIRMED mehanizam, d3-runlevel-probe.ts | Inline sdt maskirati kao m:oMath (cistiti ostatak odlomka); ili brojati preskocene + dopuniti copy | M |
| RE-17 | D11 | [repair-docx/index.ts:338](../supabase/functions/repair-docx/index.ts#L338) (H-13) | Slot naplate se u placenom modu potrosi (consume_slot_and_bind) PRIJE applyFixers i NIKAD ne vraca: pao popravak (422) ILI uspjeh s nula izmjena oboje spale slot bez ijedne izmjene. Nema refund RPC-a. | CONFIRMED, redoslijed koda + grep (nema slots_used-1) | Trositi slot tek nakon uspjeha s changelog>0, ili dodati refund RPC | M |
| RE-18 | D11 | [repair-docx/index.ts:272](../supabase/functions/repair-docx/index.ts#L272) | Otisak za naplatni gate racuna se iz meta.parsedStructure (klijentski JSON), a popravlja se neovisno uploadana .docx: jedan placeni slot omogucuje besplatan popravak BILO KOJE druge datoteke iste vrste rada replayem meta. Za razliku od generate-reporta (gdje se izlaz gradi iz istog payloada). | CONFIRMED, repro-h13-slot.ts korak 4 | Derivirati otisak iz UPLOADANOG docx-a na Edge, ili provjeriti podudarnost | M |
| RE-19 | D10 | [app.ts:1339](../src/ui/app.ts#L1339) (H-9) | Serverski panel primjenjuje section-insert-intro (umetanje prijeloma sekcije) bez potvrdnog koraka koji stavka izricito trazi (requiresConfirmation), suprotno K6 dizajnu i lokalnom panelu koji potvrdu trazi na svakoj primjeni. | CONFIRMED lancem koda (renderServerRepairPanel nigdje ne cita requiresConfirmation) | Prikazati isti potvrdni okvir kao lokalni panel prije slanja | S |
| RE-20 | D10 | [app.ts:1335](../src/ui/app.ts#L1335) | "Popravi sve jednim klikom" onemogucuje se tek NAKON awaita (ensureAccessToken), pa dvostruki klik pokrece dva paralelna uploada: FREE_MODE trosi 2/10 dnevnih, placeni mod 2 slota (novac); dva odgovora se utrkuju oko istog summary. Isti nedostatak i na gumbu "Nastavi svejedno" (tier_mismatch). | CONFIRMED lancem koda | btn.disabled=true na sam pocetak go(); in-flight zastavica za sve ulaze | S |
| RE-21 | D2/D8 | [fixers.ts:536](../src/repair/fixers.ts#L536) | footnoteSpacingFixer razrjesava stil fusnota SAMO po tocnom "FootnoteText", dok footnoteTypographyFixer koristi id-ili-ime; na lokaliziranom radu (styleId "Fusnota") tipografija fusnota se popravi a razmak NE, pa check "Razmak prije i poslije fusnota" ostane crven. | CONFIRMED, d-footnote-style-divergence.ts | patchFootnoteTextSpacing na findStyleByIdOrName (kao patchFootnoteTypography) | S |
| RE-22 | D1 | [xml-patch.ts:470](../src/repair/xml-patch.ts#L470) | patchDefaultFont korak 3 predaje applyToRPr cijeli `<w:rPr>...</w:rPr>` kao njegov SADRZAJ, pa rFonts/sz koji fale zavrse IZVAN rPr-a (schema-nevaljano dijete w:style/pPr); naivni first-match moze pogoditi pPr>rPr umjesto stilskog rPr pa font na Normal tiho ne djeluje. | CONFIRMED, d1-repro2.ts (A2/A3) | Korak 3 na withContainer('w:rPr', CT_STYLE_ORDER, ['w:pPr','w:rPr']) kao patchHeadingFormat | M |
| RE-23 | D1/D2 | [xml-patch.ts:343](../src/repair/xml-patch.ts#L343) | Self-closing `<w:rPrDefault/>` (ili drugi self-closing roditelj): withContainer fallback vrati changed:true BEZ izmjene bloka, pa fontFixer prijavi applied:true + changelog "Font: ... -> Times New Roman" a styles.xml ostane netaknut; jos gore, found.fontName=true otkljuca deep koje skida run rFonts BEZ backstopa -> dokument regresira na default font uz potvrdu "uspjeh". | CONFIRMED, d1-repro.ts/d2-repro.ts | Prosiri self-closing RODITELJA u kontejner; nikad changed:true bez stvarne izmjene | M |
| RE-24 | D1 | [xml-patch.ts:199](../src/repair/xml-patch.ts#L199), [:505](../src/repair/xml-patch.ts#L505) | maskElement i findStyleBlock koriste samo upareni oblik `<tag>...</tag>` i ne pokrivaju SELF-CLOSING pojavu: self-closing `<w:rPr/>` u pPr proguta `</w:pPr>` (duplikat pPr), a self-closing `<w:style/>` prije Normal/FootnoteText navede patch na susjedni stil (kvari tijelo). Emitiraju ih minimizatori/LibreOffice. | CONFIRMED, r3-mask-selfclose.ts (2x pPr), r4-selfclosing-block.ts (krivi stil) | Svaki `<tag>...</tag>` regex prosiriti alternacijom sa self-closing oblikom | M |
| RE-25 | D15 | [xml-patch.ts:924](../src/repair/xml-patch.ts#L924), [apply-fixers.ts:168](../src/repair/apply-fixers.ts#L168) | Skeniranje sidra po tekstu (isBodyLevelPosition rezanje cijelog prefiksa po odlomku) je O(n^2): ~10s na 4000 odlomaka; najcesci okidac je "Sadrzaj"/"Uvod" u tablici gdje fix ionako zavrsi NO_OP. Repair put nema NIKAKAV cap na broj odlomaka (analiza ima 300000). | CONFIRMED, repro-anchor.ts: n=1000/2000/4000 -> 0.5/2.1/~10s (kvadratno) | Izracunaj balansirane raspone JEDNOM (kao balancedRanges); dodaj paragraph cap na repair putu; klijent u Web Worker | M |
| RE-26 | D7 | [apply-fixers.ts:211](../src/repair/apply-fixers.ts#L211) | applyFixers nema try/catch po zahtjevu (suprotno vlastitom "fail-safe" dizajnu): fixer koji baci obara CIJELU bateriju, server mapira u 422 invalid_docx, UI optuzi korisnikov dokument, a propadnu i svi valjani popravci. Dostizno: alignment-fixer s params bez "val". | CONFIRMED, d7-repro2.ts: TypeError iz escapeXmlAttr | Omotati runFixer u try/catch: throw -> skipped.push + nastavi | S |
| RE-27 | D7 | [apply-fixers.ts:96](../src/repair/apply-fixers.ts#L96) | runFixer krsi vlastiti kontrakt "nedostajuci parametri = NO-OP": paper-size s {} upise `w:w="NaN"`, line-spacing `w:line="NaN"`, oba kao USPJESAN popravak (schema-nevaljan doc isporucen kao popravljen). Server prihvaca params:{} za svaki zivi fixer. | CONFIRMED, d7-repro2.ts | Validirati skalarne parametre (Number.isFinite, whitelist za val) -> NO-OP | S |
| RE-28 | D6 | [zip-codec.ts:43](../src/repair/zip-codec.ts#L43) | Default budzet 64MB ukupno dekomprimirano odbija realne radove pune slika kao "moguca zip-bomba", iako ih analiza prihvaca (200MB/entry). Lokalni panel salje file bez granice velicine; korisnik dobije genericko "popravak nije uspio". | CONFIRMED, repro-zip-codec.ts CASE A (69MB baca). Napomena: prvotni okvir "server INERT" je OBOREN (server je LIVE po defaultu) | Podigni/uskladi budzet, sijeci bombu po OMJERU kompresije, baci tipiziranu gresku -> postena poruka "smanji slike" | M |
| RE-29 | D14 | [repair-golden.test.ts:49](../tests/repair-golden.test.ts#L49) | Golden harness tiho preskace 4 od 16 fixera (empty-paragraph, heading-format, footnote-typography, heading-case) na SVIM dokumentima (paramsForFixer default:null), a Record<FixerId> koji je to trebao prisiliti je mrtav jer tests/ nisu type-checkani (tsconfig include: ["src"]). Fixer koji je 2026-07-20 imao P0 regresiju (spojene naslovnice) i dalje nije u golden matrici. | CONFIRMED, grep + snapshot | Dopuni SYNTHETIC_PARAMS/paramsForFixer za 4 fixera; razmotri tsconfig.tests | M |
| RE-30 | D1 | [xml-patch.ts:788](../src/repair/xml-patch.ts#L788) | patchSectionPageNumbering i addFooterReferenceToSection enumeriraju `<w:sectPr>` nad SIROVIM XML-om, brojeci i sectPr ugnjezden u `<w:pPrChange>` ili u komentaru: fantomski sectPr pomakne indeks pa prednja sekcija dobije krivu shemu, a pgNumType/footerReference se umetne u komentar/reviziju. Srodni K6/K7 primitivi vec maskiraju komentare. | PLAUSIBLE (jedan verifikator obara realni lanac pozivatelja lecom a; drugi potvrduje mehanizam) | Maskirati komentare/CDATA/PI i preskociti pPrChange prije enumeracije | M |

### P2 (izbor; puni popis u scratchpad/audit/p012.md)

| ID | Datoteka | Tvrdnja | Status | Fix |
|---|---|---|---|---|
| RE-31 | [app.ts:1361](../src/ui/app.ts#L1361) | "Nije primijenjeno:" ispisuje SIROVE ruleId slugove (empty-paragraphs-universal, section-insert-intro) umjesto citljivih labela; lokalni panel iste mapira | CONFIRMED | Mapirati skipped ruleId -> item.label iz closurea |
| RE-32 | [app.ts:1361](../src/ui/app.ts#L1361) | Kad su svi fixeri no-op, serverski panel kaze "Popravljeno na serveru (0 izmjena)", nudi preuzimanje bit-identicne datoteke, pohrani posao i (FREE_MODE) potrosi 1 besplatni popravak; lokalni panel isti slucaj posteno javlja "nista nije mijenjano" | CONFIRMED | Special-case changelog.length===0; ne trositi slot ni pohranjivati |
| RE-33 | [app.ts:1395](../src/ui/app.ts#L1395) (H-11) | 429 poruka tvrdi "Dnevni limit BESPLATNIH popravaka", ali 429 stize i iz placenog moda (decideReportAccess) i iz IP-capa gdje korisnik osobno nije potrosio nista | CONFIRMED | Server vrati reason u 429; klijent bira tekst; ili neutralno "previse popravaka u 24 h" |
| RE-34 | [app.ts:911](../src/ui/app.ts#L911) | Ulazna kartica tvrdi "Automatski popravci na ovom uredaju ... ne salje se na posluzitelj", ali s shipanim defaultom (repairEndpoint postavljen) vodi na serverski panel koji UPLOADA. Copy na app.ts:897 je usto mrtav (odmah pregazen) | CONFIRMED | Gejtati tekst na repairServerConfigured(); ukloniti mrtvi innerHTML |
| RE-35 | [app.ts:1340](../src/ui/app.ts#L1340) (H-10) | Serverski put PRISILNO ukljucuje deep i salje SVE stavke (i neprekrsene) bez per-stavka izbora i bez i jedne rijeci u copyju; lokalni panel ima checkboxe i deep preklopnik s disclosure recenicom | CONFIRMED | Dodati popis stavki + deep preklopnik (default ON) s istom disclosure recenicom |
| RE-36 | [app.ts:1361](../src/ui/app.ts#L1361) | skipped[] mijesa "vec je uskladjeno" (no-op jer je vrijednost na cilju) i "ne mogu popraviti"; uredan rad u "uskladi sve" toku dobije popis krivnji koji izgleda kao kvar | CONFIRMED | FixerOutput/ApplyFixersResult prosiriti razlogom (already-ok vs cannot-fix); UI ih odvojiti |
| RE-37 | [app.ts:1406](../src/ui/app.ts#L1406) | Nakon uspjeha glavni prikaz (score, kartice, tablice) ostaje na IZVORNOM dokumentu, gumb se vraca na "Popravi sve", privola ostaje kvacnuta, nema success-lockouta -> korisnik zakljuci da nista nije napravljeno i klikne opet (drugi upload, drugi slot) | CONFIRMED | Trajno success stanje gumba; uvijek prikazi sazetak; ponudi "ucitaj popravljeni za novu ocjenu" |
| RE-38 | [app.ts:197](../src/ui/app.ts#L197) | Modal "Moji popravci" se ne moze zatvoriti Escapeom: closeRepairHistory nije u globalnom Escape handleru (svih 10 ostalih modala jest) | CONFIRMED | Dodati closeRepairHistory() u Escape granu |
| RE-39 | [app.ts:411](../src/ui/app.ts#L411) | Preuzimanje iz "Moji popravci" radi a.click() TEK NAKON awaita (signRepairDownload), bez a.download i s target=_blank: popup-blokiran otvor tiho ne uspije (isti obrazac koji serverski panel izrijekom izbjegava) | CONFIRMED | Sinkroni pre-open taba pa postavi location; ili isti-tab a.download |
| RE-40 | [app.ts:1361](../src/ui/app.ts#L1361) | "Popravljeno na serveru (N izmjena)" je hardkodiran uspjeh izracunat PRIJE recheka; kad recheck pokaze PAD spremnosti (deep na neprekrsene stavke), panel istovremeno tvrdi "Popravljeno" i prikazuje negativan delta | CONFIRMED | Formulaciju uvjetovati o delti; posebna poruka kad delta <= 0 |
| RE-41 | [apply-fixers.ts:215](../src/repair/apply-fixers.ts#L215) | skipped[] nosi samo ruleId bez razloga (empirijski: ttf prored je "vec uredno", grf prored je "ne mogu"), pa su korisniku identicni ishodi | CONFIRMED (Word matrica) | FixerOutput.reason + propagacija |
| RE-42 | [corpus-verify.ts:244](../src/citations/corpus-verify.ts#L244) | Potpuni pad korpusne baze tiho postaje "sve provjereno, nista nije pronadjeno": catch po seriji radi checked+=slice.length, pa checked===total, truncated=false, UI kaze "Provjereno je svih N, nijedan nije prepoznat" | CONFIRMED, repro-corpus-checked.ts | U catch ne brojati seriju kao checked; propagirati truncated |
| RE-43 | [check-fixer-map.ts:20](../src/analysis/check-fixer-map.ts#L20) | CHECK_TITLES <-> naslov provjere <-> fixer mapa nema drift-tripwire: izmjena naslova na strani MAPE tiho otkaci fixer od provjere uz zelen suite (triage.test dijelom pokriva, ali ne sve naslove) | CONFIRMED (djelomicno; jedan verifikator obara puni doseg) | analyze-docx UVOZI naslove iz mape (jedan izvor); ili tripwire test |
| RE-44 | [app.ts:1253](../src/ui/app.ts#L1253) | renderRepairSection veze bajtove iz TRENUTNOG selectedDocx uz REZULTAT stare analize: promjena datoteke bez ponovne analize + re-render -> popravak nad novom datotekom s parametrima/imenom stare | PLAUSIBLE | Usporedi selectedDocx.name+size s r.file; kod nesklada trazi ponovno ucitavanje |
| RE-45 | [claude.md:13](../CLAUDE.md#L13) | CLAUDE.md/AGENTS.md tvrde "dokument se ne salje na posluzitelj" i "bez backenda", a repo ima zivi Supabase backend (33 migracije) na koji se pri popravku uploada; Mapa datoteka ne spominje src/repair ni supabase/ | CONFIRMED (P2/P3 drift) | Azurirati oba doca; ispraviti broj redaka app.ts (771 -> 1456) |

P3 rep (99 nalaza, scratchpad/audit/p3.md): rucni chunked base64 sporiji od native; O(n*m) deep na tablicama; toBase64 memorijski rasipno; razni kozmeticki copy i changelog-postenje detalji.

---

## 3. Zasto dojam da ne radi (rang uzroka gapa obecanje vs ponasanje)

1. KRUTO RAZRJESAVANJE STILOVA (RE-03, RE-08, RE-21, RE-16). Analiza cita default paragraph stil,
   naslove i fusnote DINAMICKI (w:default="1", ime stila, outlineLvl), a fixeri ih ciljaju LITERALNO
   ("Normal", "Heading{n}", "FootnoteText"). Posljedica: na svemu sto nije "cisti Word engleski"
   (LibreOffice "Standard", Google Docs, hrvatski Word "Naslov1", fakultetski predlozak s vlastitim
   stilom) prored, poravnanje, razmak, velika slova i fusnote tiho NO_OP-aju, a ista provjera ostane
   crvena i nakon platenog "uskladi sve". Empirijski dokazano na fixturi grf pravim Wordom (Word
   matrica MX-2). Ovo je najveci pojedinacni izvor dojma "platio sam, nista se nije promijenilo".

2. RUPA U POKRIVENOSTI PROFILA (RE-06). 52% profila, ukljucivo nosive FPZG i Pravo, nema nijedan
   autoFixable ruleEntry. Besplatni triage tim korisnicima kaze "ovo mozemo popraviti" i nudi gumb,
   a panel iza njega je prazan. Rjesenje je podatkovno (popuniti ruleEntries), ne kod.

3. NEISKRENA I NEPOTPUNA POVRATNA INFORMACIJA (RE-31, RE-32, RE-33, RE-34, RE-36, RE-37, RE-40, RE-41).
   Sirovi slugovi umjesto labela, "0 izmjena = Popravljeno", nula-izmjena trosi slot i pohranjuje
   posao, kartica tvrdi "ne salje se na posluzitelj", poruka o limitu spominje "besplatne" i u
   placenom modu, uspjeh se oglasi i kad spremnost padne, glavni prikaz se ne osvjezi. Svaki detalj
   sam po sebi malen, zajedno stvaraju dojam nepouzdanog proizvoda.

4. POPRAVAK KOJI SAM UNOSI PREKRSAJ ILI JE MRTAV (RE-04, RE-05, RE-07). Poravnanje broja stranice je
   mrtvo za sve profile (gate === true vs podatak "right"), a numeriranje od Uvoda umece centrirani
   broj koji isti profil odmah oznaci kao prekrsaj (traze desno). Korisnik vidi "Spremnost 85 -> 82".

5. STRUKTURNI RASKORAK PROVJERE I POPRAVKA za prazne odlomke (RE, repair-items.ts:123). Analiza broji
   SVE prazne odlomke (prag 18%, ukljucivo usamljene, u tablicama, slikovne), fixer kolabira samo
   nizove >= 2 izvan zasticenih zona. Na najcescem obrascu (jedan Enter izmedju odlomaka) stavka se
   ponudi pa zavrsi kao "Nije primijenjeno".

Cetiri od pet uzroka su popravljivi u kodu S/M trudom; drugi je podatkovni zadatak (L).

---

## 4. Predlozeni testovi (najvazniji)

- paragraph-cleanup.test.ts: odlomci s blok-jednadzbom (m:oMath) prezive (RE-01); prazan s
  pBdr/shd/numPr prezivi (RE-11); w:del/w:delText, commentRangeStart, moveFromRangeStart prezive
  (RE-12); `<w:tab/>` s leaderom prezivi (RE-13); naslovnica s pStyle "Naslov"/"Podnaslov" + tablicna
  naslovnica ne razbiju se (RE-14).
- xml-patch.test.ts: upareni prazni `<w:sz></w:sz>` ne dobije atribut u zatvarajucem tagu (RE-02);
  self-closing `<w:rPrDefault/>` -> kontejner ili posten no-op (RE-23); self-closing `<w:rPr/>` u pPr
  daje tocno jedan `<w:pPr>` (RE-24); self-closing `<w:style/>` ne procuri u susjedni stil (RE-24);
  default stil "Standard" (w:default="1") dobiva prored/poravnanje/razmak/font (RE-03); PAGE odlomak
  bez w:jc dobiva w:jc=right (RE-07); Normal s rPr bez rFonts upise font UNUTAR rPr (RE-22).
- heading-case.test.ts: styleId "Naslov1"/"heading1"/outlineLvl -> applied:true (RE-08);
  toCroatianUpper cuva `&#x161;` (RE-09); pPrChange stari stil ne cini odlomak naslovom (RE-10).
- run-level.test.ts: uvuceni blok-citat s jednostrukim proredom ostaje netaknut (RE-15); inline sdt
  citat: cisti se ostatak odlomka (RE-16).
- apply-fixers.test.ts: fixer koji baci ne rusi bateriju (RE-26); svaki od 16 fixera s params {} =
  applied:false, bit-identican XML (RE-27); no-op zbog "vec ciljno" razlicit od no-opa "nema atributa"
  (RE-36/RE-41).
- repair-items.test.ts: profil s pageNumberAlignment:"right" (oblik iz data/) nudi stavku (RE-04);
  introSectionItem s pageNumberAlignment:"right" daje align:"right" (RE-05); drift test da svaki
  profil s font/size/spacing/margins vrijednoscu ima repair zapis (RE-06).
- Serverski panel (danas 0 testova): dva brza klika = jedan upload (RE-20); requiresConfirmation
  stavke ne ulaze u requests bez potvrde (RE-19); changelog:[] ne prikazuje "Popravljeno" (RE-32).
- repair-golden: dopuniti 4 fixera u SYNTHETIC_PARAMS/paramsForFixer (RE-29); check-fixer-map tripwire
  (RE-43); zip-codec: realan velik media docx prolazi defaulte (RE-28).

---

## 5. Oboreni nalazi (provjereno, NIJE problem, da se ne otkriva ponovno)

- H-12 (`<\div>` u source-check-view.ts:63): OBOREN izvrsenom reprodukcijom. buildSourceCheckHtml daje
  uravnotezen HTML u svim granama; literalni `<\div` je odsutan u izlazu, XSS povrsina drzi. Moja
  prvotna sumnja iz pripreme audita bila je KRIVA (upravo zato se verificira).
- Idempotencija: OBOREN na Word matrici. Drugi prolaz svih 5 uzoraka = nula izmjena, bit-identicno.
- STORED putanja zip-codeca "bez ijednog testa": OBOREN. Svih 8 realnih fixtura je 100% STORED, pa je
  ta grana zapravo najpokrivenija.
- Vise D15 nalaza (256MB OOM na Edge za 20MB media-docx; toBase64 memorija) SPUSTENO s P1/P2 na P3
  vjernom reprodukcijom lifecyclea: peak ne probija granicu na realnom ulazu.
- footer-page-fixer "tamni" na serveru (DARK_FIXERS): OBOREN kao bug, dokumentirana namjera
  (index.ts:72-80 eksplicitno objasnjava).
- Manualni cron za 30-dnevnu retenciju "suprotno fail-closed obrascu": OBOREN, dokumentirana namjera
  + presedan u repou.
- H-2 (heading-theme hAnsi-only): mehanizam stvaran ali spusten na P3 kozmeticki (lece b+c).
- Redoslijed FIXER_IDS vs produkcijski redoslijed: PLAUSIBLE/uzak P3; sidra su re-derivirana po tekstu
  pa produkcijska interakcija ne kvari rezultat.

---

## 6. Dokazni artefakti

Sve repro skripte zive u `scratchpad/audit/` (pokretanje: npx vite-node <skripta>). Kljucne:
eq-loss.ts (RE-01), d1-repro.ts / d1-repro2.ts / d2-repro.ts (RE-02/RE-22/RE-23), d4-repro.ts
(RE-11/RE-13/RE-14), repro.ts + repro_b.ts (RE-12), d5-heading-case-repro.ts / repro2.ts
(RE-08/RE-09/RE-10), run-level probe F (RE-15), d3-runlevel-probe.ts (RE-16), repro-h13-slot.ts
(RE-17/RE-18), d7-repro.ts / d7-repro2.ts (RE-05/RE-26/RE-27), repro-h7.ts / d2-repro3.ts (RE-07),
repro-libreoffice-defaults.ts (RE-03), repro-gates.ts / coverage-measure.mjs / triage-vs-panel.ts
(RE-04/RE-06), r3-mask-selfclose.ts / r4-selfclosing-block.ts (RE-24), repro-anchor.ts (RE-25),
repro-zip-codec.ts (RE-28), repro-corpus-checked.ts (RE-42). Word matrica: scratchpad/audit/matrix/
(ulazi, -p1/-p2 izlazi, JSON logovi, check-worst-case.ps1 25/25).

---

## Dispozicija hipoteza H-1 do H-14

| H | Ishod | Gdje |
|---|---|---|
| H-1 | CONFIRMED (P0) | RE-02 |
| H-2 | OBOREN kao P0/P1, ostaje P3 kozmeticki | sekcija 5 |
| H-3 | CONFIRMED (P2/P3): korak 2 patchDefaultFont ne puni before/after -> prazan changelog redak | dio changelog-postenje |
| H-4 | CONFIRMED (P3): pageNumberingFixer beforeLabel uvijek "nije postavljeno" i kad je pgNumType postojao | changelog-postenje |
| H-5 | CONFIRMED (P1) | RE-05 |
| H-6 | CONFIRMED (P1, mehanizam) | RE-16 |
| H-7 | CONFIRMED (P1); multi-part nastavak djelomicno oboren | RE-07 |
| H-8 | CONFIRMED (uzrok "dojma ne radi" za numeriranje): visesekcijski rad bez prijeloma tocno na Uvodu ne dobiva ni K4 ni K6 popravak | sekcija 3, RE-05 kontekst |
| H-9 | CONFIRMED (P1) | RE-19 |
| H-10 | CONFIRMED (P2) | RE-35 |
| H-11 | CONFIRMED (P2) | RE-33 |
| H-12 | OBOREN (ne-bug) | sekcija 5 |
| H-13 | CONFIRMED (P1) | RE-17 |
| H-14 | CONFIRMED (P2/P3): REPAIR_ENGINE.md se referencira iz koda (fixers.ts, repair-panel.ts) a ne postoji; + CLAUDE.md drift | RE-45 |

---

## Dodatak A: Inventar motora (sazeto)

16 fixera (FIXER_IDS, apply-fixers.ts). Mijenjaju iskljucivo document.xml i styles.xml (+ K5/K6 dodaju
word/footerN.xml uz content-types/rels). Klijentski put (repair-panel.ts) i serverski put
(repair-docx/index.ts) dijele ISTU jezgru src/repair/apply-fixers. Deep varijantu imaju font,
line-spacing, alignment, paragraph-spacing, footnote-spacing. Auto (bez rizika za sadrzaj): margins,
paper-size, font, font-size, line-spacing, alignment, paragraph-spacing, footnote-spacing,
page-number-alignment. Assisted (traze potvrdu / mijenjaju strukturu ili tekst): page-numbering,
section-insert (K6, LIVE), toc-field (K7, LIVE), heading-format, footnote-typography, heading-case
(jedini zahvat u tekst), footer-page (tamni, samo unutar section-insert kompozita). Univerzalne stavke
(ne vezane za ruleEntry): prazni odlomci, razmak odlomka, numeriranje, razmak fusnota, poravnanje
broja stranice, naslovi, fusnote-tipografija. Tok: analiza -> repair-items (params IZ profila) ->
panel -> apply-fixers -> (server: consent/tier/entitlement ili FREE_MODE) -> changelog -> recheck ->
diff. Rupe u pokrivenosti vidljive iz inventara: 4 od 16 fixera nisu u golden matrici (RE-29);
serverski panel nema nijedan test; page-number-alignment fixer je LIVE ali nedostizan (RE-04).

## Dodatak B: Word/fixture matrica (pravi Word, COM)

Uzorci: grf/ttf/fer/pmf fixture (4 dijela) + worst-case (make-worst-case.ps1, 15 dijelova). Zahtjevi:
11 pravila iz scripts/word-verify/repair.mts, deep ukljucen.

- Pass 1 primijenjeno/preskoceno: worst-case SVIH 11; fixture 4-5 pravila (margine/format/font/naslovi,
  ttf+fer i velika-slova). Preskoceno je vecinom LEGITIMAN no-op (tijelo vec ima 360/both; nema
  footnotes.xml; zasticeni odlomci se ne brisu). PROBLEMATICAN tihi skip: grf prored (jednostruki,
  trazi 1.5) i grf poravnanje (svih 6 jc=left, trazi both) preskoceni jer styles.xml nema stil
  "Normal" -> patchNormalParagraphProps NO_OP, a deep gatean na result.found (RE-03, MX-2).
- Promijenjeni partovi: iskljucivo document.xml i styles.xml; slike/theme/footnotes/settings
  bit-identicni (worst-case 13/15).
- Idempotencija: savrsena (drugi prolaz nula izmjena na svih 5).
- Word validacija (OpenAndRepair=false): svi ulazi i izlazi otvaraju se bez greske i bez oporavka;
  check-worst-case.ps1 25/25.

Zakljucak matrice: na cistom Word ulazu motor je ispravan i siguran; problemi se manifestiraju na
ulazu koji odstupa od "Word + stil Normal" (RE-03) i u tihom preskoku bez postene poruke (RE-41).
