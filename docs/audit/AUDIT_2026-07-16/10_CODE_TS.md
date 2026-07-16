# TypeScript kod: analiza, parser, citati, UI (D1-D4)

Klijentska analiticka jezgra, citatni engine i UI/monetizacija. Ovdje su korektnosni bugovi koji izravno utjecu na tocnost nalaza (glavno vrijednosno obecanje proizvoda).

Nalaza u ovoj skupini: 16.

### AUD-01 — Prored zapisan kao 'exact'/'atLeast' (u tockama) usporedjuje se s omjerom iz profila (1.5), pa vizualno ispravan dokument tvrdo pada na provjeri prореda

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **CONFIRMED**
- Lokacija: `src/analysis/analyze-docx.ts:51`
- Dokaz: parser.ts:163 `line = rule === 'auto' ? v / 240 : v / 20;` (auto vraca omjer, exact/atLeast vraca TOCKE); analyze-docx.ts:51 `const spVal=Number(dominantSpacing.value),spOk=...||near(spVal,profile.spacing,strict)` gdje je profile.spacing=1.5
- Reprodukcija: Dokument s <w:spacing w:line="480" w:lineRule="exact"/> (vizualno ~dvostruki prored za 12pt): readPPr vraca line=480/20=24, dominantSpacing.value="24". near(24, 1.5, 0.12)=false pa 'Prored osnovnog teksta' dobije status 'fail', earned 1/6 i error issue 'Prored nije uskladjen s profilom' iako je dokument formalno u redu.
- Preporuka: U readPPr zadrzi i lineRule; u auditu za lineRule='exact'/'atLeast' ne usporedjuj s omjerom nego preracunaj u omjer preko dominantne velicine fonta (npr. line_pt / (size_pt*1.2)) ili tretiraj kao 'nije pouzdano ocitljivo' (pass/unknown) umjesto fail.
- Verifikacija: parser.ts:163 `line = rule==='auto' ? v/240 : v/20` returns POINTS for exact/atLeast but a ratio (v/240) for auto; analyze-docx.ts:51 compares spVal against profile.spacing (a 1.5 ratio) via near(spVal,profile.spacing,strict). A doc with lineRule=exact/atLeast yields e.g. 480/20=24, near(24,1.5) false -> hard 'fail' on 'Prored osnovnog teksta' with detail '24.00' vs 1.5. Logic confirmed. Kept Medium: real false-fail, but exact/atLeast spacing is uncommon vs auto multiples in student work.

### AUD-02 — Pad workera TIJEKOM analize (OOM na velikom/zlonamjernom docx-u) klasificira se kao infrastrukturni pad pa se ista analiza ponovi INLINE na glavnoj niti i moze zamrznuti karticu

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **PLAUSIBLE** | Veza: LEKTA-SEC-03
- Lokacija: `src/analysis/analyze-docx-client.ts:108`
- Dokaz: w.onerror (:80) -> `done(()=>reject(new WorkerInfraError(...)))`; analyzeDocxOffThread (:107-111) `catch(e){ if(!(e instanceof WorkerInfraError)) throw e; workerBroken=true; ...}` pa se (:115) pokrene `analyzeDocx` inline. Nema razlike izmedju 'worker skripta se nije ucitala' i 'worker je umro obradjujuci dokument'.
- Reprodukcija: Dokument ciji document.xml se dekomprimira ispod 200MB capa, ali cije DOM stablo (xmldom) potrosi vise RAM-a nego worker ima -> worker OOM/terminate -> onerror -> WorkerInfraError -> workerBroken=true -> analyzeDocx se ponovi na glavnoj niti i zamrzne/OOM-a UI. Time se izgubi glavna korist izolacije u worker.
- Preporuka: Zapamti je li primljen ijedan 'progress' (ili 'analiza je zapoceta') od workera; ako je worker umro NAKON pocetka analize, tretiraj kao gresku analize (ne infra) i NE ponavljaj inline. Inline fallback dopusti samo za pad prije prvog progressa (spawn/ucitavanje).
- Verifikacija: The control flow is confirmed: analyze-docx-client.ts:80-83 turns any worker onerror into WorkerInfraError; :107-111 sets workerBroken and :115 re-runs analyzeDocx inline on the main thread. Genuine analysis errors DO travel as messages (worker.ts:25-26 -> onmessage type:'error' -> plain Error, re-thrown). The unverifiable part is browser-dependent: whether an OOM/terminate DURING parsing fires onerror (-> misclassified as infra, retried inline, defeating worker isolation) or dies silently (-> promise hangs). If it fires, the freeze is real; chains with AUD-05 (post-parse guard). Kept Medium because it undermines the worker-isolation security control, but PLAUSIBLE due to the browser-behavior assumption.

### AUD-04 — Tema-fontovi (asciiTheme/hAnsiTheme) se ne razrjesavaju pa dokument u Wordovom zadanom fontu (Calibri) daje dominantFont=null i glavna provjera fonta prolazi s punim bodovima

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **CONFIRMED**
- Lokacija: `src/docx/parser.ts:150`
- Dokaz: readRPr (:150) `const font = attr(fonts,'w:ascii')||attr(fonts,'w:hAnsi')||attr(fonts,'w:cs');` ne cita w:asciiTheme/w:hAnsiTheme; analyze-docx.ts:49 `fontOk = ...||!dominantFont.value||...` pa null font -> pass 8/8.
- Reprodukcija: Dokument spremljen bez rucne promjene fonta (rFonts w:asciiTheme="minorHAnsi", tekst Calibri, bez w:ascii): svi runovi daju rp.font=undefined, fontMap prazan, dominantFont.value=null. 'Dominantni font' -> status pass, earned 8/8, detalj 'Font nije moguce pouzdano ocitati' iako je dokument u Calibriju umjesto Times New Roman -> lazni prolaz na kljucnoj provjeri.
- Preporuka: U readRPr dodaj fallback na w:asciiTheme/w:hAnsiTheme i razrijesi temu iz word/theme/theme1.xml (majorFont/minorFont) ili barem oznaci temu-font kao 'nepotvrdjeno' i ne dodjeljuj puni broj bodova kad font nije eksplicitan.
- Verifikacija: parser.ts:150 reads only w:ascii/w:hAnsi/w:cs, never w:asciiTheme/w:hAnsiTheme. A document left in Word's default theme font (Calibri, rFonts w:asciiTheme='minorHAnsi' with no w:ascii) yields font=undefined for every run, empty fontMap, dominantFont.value=null. analyze-docx.ts:49 `fontOk = ...||!dominantFont.value||...` then passes with earned 8/8 and detail 'Font nije moguce pouzdano ocitati'. Genuine false-negative on a scored, high-weight check for a non-compliant (Calibri) document. Medium confirmed.

### AUD-09 — Narativne autor-godina citatnice s prezimenom koje pocinje dijakritikom (C/C/S/Z/Dj) nikad se ne prepoznaju jer je JS \b ASCII

- Severity (finder -> konacni): High -> **Medium** | Verdikt: **CONFIRMED**
- Lokacija: `src/citations/author-year.ts:37`
- Dokaz: const narr=/\b([\p{Lu}][\p{L}'’\-]{2,})(?:\s+(?:i|and|&)\s+[\p{Lu}][\p{L}'’\-]{2,})?\s*\(((?:18|19|20)\d{2}[a-z]?)\)/gu;  -- vodeci \b je ASCII pa ne matcha granicu ispred Č/Š/Ž/Đ/Ć
- Reprodukcija: node: matchAll(narr) na "Prema Čović (2019)." => 0 matcheva; na "Prema Marković (2019)." (ASCII M) => 1; na "Prema Pušić (2015)." (dijakritika u sredini) => 1. Parentetski oblik "(Čović, 2019)" radi (koristi \p{Lu}, ne \b), pa je pogodjen SAMO narativni oblik. Nizvodno u src/analysis/analyze-docx.ts:79 izostala narativna citatnica proizvodi lazno upozorenje 'Literatura → citirano' (izvor Čović 2019 se prikaze kao necitiran) i smanjuje bodove ispravno napisanom radu.
- Preporuka: Zamijeni vodeci \b Unicode-svjesnom granicom, npr. lookbehind (?<![\p{L}\p{N}]) ili grupom (?:^|[^\p{L}\p{N}]) uz 'u' flag (isti obrazac vec koristi ORG_KEYWORDS u src/tools/citation.ts). Dodaj golden/regresijski test s narativnim citatom prezimena Čović/Šimić/Žagar.
- Verifikacija: author-year.ts:37 narrative regex begins with ASCII `\b` before `[\p{Lu}]`. Before a diacritic-initial surname (Č/Ć/Š/Ž/Đ) both the preceding space and the letter are non-ASCII-word, so `\b` matches nowhere in 'Prema Čović (2019)' -> 0 narrative matches, while 'Marković (2019)' (ASCII M) matches. Parenthetical extraction (line 29) uses \p{Lu} not \b so '(Čović, 2019)' still works. Confirmed and consistent with the documented '\b is ASCII' gotcha. Downgraded from High to Medium: only the narrative form is affected and the downstream effect is the warn-level 'Literatura -> citirano' uncited penalty (analyze-docx.ts:79, -1 each), not a hard fail; parenthetical citations of the same author still resolve.

### AUD-03 — decompressionBudgetBytes ignorira coarsePointer pa dodirni uredaji bez navigator.deviceMemory (iOS Safari, svi Firefox) dobivaju puni 200MB dekompresijski budzet koji OOM-guard treba stegnuti

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-03
- Lokacija: `src/analysis/memory-budget.ts:36`
- Dokaz: uploadCapBytes (:24) koristi coarsePointer: `if (opts.coarsePointer || (dm!==null && dm<=4)) return 20*MB;` ALI decompressionBudgetBytes (:37-41) prima samo deviceMemory i vraca null kad je dm nedostupan; app.ts:460 `maxDecompressedBytes:decompressionBudgetBytes(deviceMemoryGb())` (bez coarsePointer).
- Reprodukcija: iOS Safari / mobilni Firefox: navigator.deviceMemory je undefined, pointer:coarse=true. effectiveUploadCap()=20MB (stegnuto), ali settings.maxDecompressedBytes=decompressionBudgetBytes(null)=null pa ZipReader koristi 200MB. 20MB .docx s deflate bombom u document.xml napuha se do 200MB + DOM ~1GB i sruси karticu na tocno onim uredajima koje budzet stiti.
- Preporuka: Proslijedi i coarsePointer u decompressionBudgetBytes i vrati stegnuti budzet (npr. 100-150MB) kad je coarsePointer=true bez obzira na deviceMemory; app.ts uskladi poziv (decompressionBudgetBytes({deviceMemory,coarsePointer})).
- Verifikacija: memory-budget.ts:36-42 decompressionBudgetBytes takes ONLY deviceMemory and returns null when it is absent; app.ts:460 calls it as decompressionBudgetBytes(deviceMemoryGb()) with no coarsePointer, while uploadCapBytes (memory-budget.ts:24, app.ts:549) does honor coarsePointer. So on Safari/Firefox (deviceMemory undefined) the ZipReader keeps the full 200MB budget even on coarse-pointer devices. Confirmed gap. Downgraded to Low: the 200MB streaming cap still bounds allocation (no gigabyte runaway), deviceMemory is unavailable on those engines regardless of device power, so the missed tightening is a modest hardening margin, not a new attack surface.

### AUD-05 — Cijeli DOM se gradi iz document.xml velicine do 200MB PRIJE provjere MAX_ANALYZE_PARAGRAPHS, pa je paragraf-cap post-parse i ne sprjecava OOM tijekom parsiranja

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-03
- Lokacija: `src/analysis/analyze-docx.ts:46`
- Dokaz: analyze-docx.ts:44 `const doc=parseXml(docText,...)` (izgradi cijeli DOM), tek :46 `const _bodyParas=els(doc,'w:p');if(_bodyParas.length>MAX_ANALYZE_PARAGRAPHS)throw...` -> guard radi nakon sto je DOM vec u memoriji.
- Reprodukcija: document.xml s ~250000 praznih <w:p/> (ispod 300000 capa) ali velicine ~150MB: parseXml alocira DOM visestruko veci od 150MB prije nego se broj odlomaka provjeri; na slabijem uredaju to sруси prije nego guard baci gresku.
- Preporuka: Prije parseXml procijeni velicinu/broj odlomaka jeftino (npr. brojanje '<w:p' u stringu ili duljina docText) i odbij prevelik ulaz prije DOM izgradnje; MAX_ANALYZE_PARAGRAPHS zadrzi kao sekundarni guard.
- Verifikacija: analyze-docx.ts:44 builds the full DOM via parseXml(docText) before :46 checks els(doc,'w:p').length against MAX_ANALYZE_PARAGRAPHS(300000). The paragraph cap is therefore post-parse and cannot prevent OOM during parsing of a large (<=200MB) valid document.xml. Confirmed. Low: the 200MB decompression cap is the primary guard; the paragraph cap is a secondary defense against pathological valid XML, and the finder's own note acknowledges this ordering.

### AUD-06 — w:outlineLvl='9' (Wordov 'Body Text', bez outline razine) tumaci se kao naslov razine 10 i onecisti hijerarhiju i broj naslova

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `src/docx/parser.ts:214`
- Dokaz: headingLevel (:214) `if(Number.isFinite(pProps.outline))return pProps.outline+1;` uz readPPr (:164) `outline: ol ? Number(attr(ol,'w:val')) : null`. OOXML val=9 znaci tijelo teksta (nije naslov), ali daje 9+1=10.
- Reprodukcija: Odlomak tijela teksta s <w:pPr><w:outlineLvl w:val="9"/></w:pPr> i bez Heading stila: headingLevel vraca 10 pa se odlomak broji kao naslov (ulazi u headings, 'Hijerarhija naslova', broj naslova, 'jumps' detekciju) iako nije naslov.
- Preporuka: Tretiraj outline razine >=9 kao 'nije naslov' (vrati null); mapiraj samo val 0-8 na razine 1-9.
- Verifikacija: parser.ts:214 `if(Number.isFinite(pProps.outline))return pProps.outline+1` with :164 `outline: ol ? Number(attr(ol,'w:val')) : null`. OOXML outlineLvl val=9 means 'Body Text' (no outline level) but yields 9+1=10, so a body paragraph with explicit <w:outlineLvl w:val='9'/> is counted as a heading (pollutes headings[], hierarchy, jump detection). Confirmed. Low: requires an explicit outlineLvl=9 on a non-Heading paragraph, which Word does not normally emit for body text; real but uncommon. Fix: guard outline < 9.

### AUD-07 — Nedostajuci atributi margina/velicine stranice tiho postaju 0 (Number(null)/567) i lazno se prijavljuju kao odstupanje

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `src/analysis/analyze-docx.ts:47`
- Dokaz: analyze-docx.ts:47 `margins: m?{top:Number(attr(m,'w:top'))/567,...}` i `page: sz?{w:Number(attr(sz,'w:w'))/567,...}`. attr vraca null kad atribut fali, Number(null)=0.
- Reprodukcija: w:pgMar prisutan ali bez w:top (ili w:pgSz bez w:w): margina/dimenzija se procita kao 0.00 cm, pa margin audit prijavi '1. sekcija: top 0.00 cm' odnosno format stranice lazno odstupa od A4, iako Word nije zapisao tu vrijednost (implicitna).
- Preporuka: Kad je pojedini atribut null, tretiraj tu dimenziju kao neocitanu (preskoci iz usporedbe) umjesto da je koerciraS u 0; koristi attr(...)!=null gate prije dijeljenja.
- Verifikacija: analyze-docx.ts:47 `margins:{top:Number(attr(m,'w:top'))/567,...}` and `page:{w:Number(attr(sz,'w:w'))/567,...}`; attr returns null for a missing attribute and Number(null)=0, so a pgMar/pgSz missing one attribute reads as 0.00 cm/0 and the margin/A4 audit falsely flags it. Confirmed as a coercion edge. Low: Word reliably writes all four pgMar sides and both pgSz dimensions, so this only bites hand-edited/generated docx.

### AUD-10 — Kvadraticni backtracking u firstSentence rastavljacu recenica (bulk parser referenci) bez ogranicenja duljine ulaza -> zamrzavanje preglednika (self-DoS)

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `src/citations/parse-reference.ts:46`
- Dokaz: const re = /([^\s][^.?!]*?[^\s.?!])([.?!])\s+/g;  -- lijena *? uz preklapajuce klase; splitReferences (l.33) i parseReference nemaju cap na duljinu pojedine reference
- Reprodukcija: node timing na jednoj referenci bez .?! terminatora: "ab " ponovljeno 16000 puta (~48k znakova) -> reFirst.exec ~6.8 s; rast je kvadratican (8k znakova ~2.5 s, 4k ~0.7 s). parseApa (l.573/577) zove firstSentence na svakoj referenci; korisnik/napadac zalijepi jedan dugacak redak bez praznog retka -> splitReferences vrati jedan element -> hang taba. Za usporedbu, legalni engine ima MAX_FOOTNOTE_TEXT=20000 cap, bulk parser nema nikakav.
- Preporuka: Uvedi cap na duljinu pojedine reference (npr. slice na ~3000 znakova prije parsiranja, analogno MAX_FOOTNOTE_TEXT), ili prepisi firstSentence/splitAtSentence u linearni prolaz (skeniranje terminatora bez lijenog *? preko cijelog ostatka).
- Verifikacija: parse-reference.ts:46 firstSentence uses `/([^\s][^.?!]*?[^\s.?!])([.?!])\s+/g`; on input with no .?! terminator the lazy scan retries from each start position to end -> O(n^2), and splitReferences (:33) plus parseReference impose no per-reference length cap (unlike legal-citation.ts MAX_FOOTNOTE_TEXT=20000). A single pasted long line without blank-line separators is one element, so parseApa runs firstSentence on the whole blob and the tab hangs. Quadratic confirmed. Downgraded Medium->Low: purely client-side self-DoS in the bulk citation tool (user pastes their own text), no cross-user or server impact.

### AUD-11 — Provjera 'neuvedenih kratica' u pravnom enginu lazno pozitivno oznacava rimske brojeve i ceste velika-slova tokene (XIV, OECD, ISBN, ECLI)

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `src/citations/legal-citation.ts:28`
- Dokaz: const acrRe=/\b(?:Čl\.|čl\.|članak|st\.|stavak|toč\.|točka)?\s{0,4}\d{0,6}\.?\s{0,4}([A-ZČĆŽŠĐ]{2,10})(?:-(?:a|u|om|ima))?\b/g;  ... filtar preskace samo ['eu','esljp','vsrh','usrh','nn','sl']
- Reprodukcija: node replika: "Zbornik radova, vol. XIV, str. 45." => ['XIV']; "OECD, Report 2019..." => ['OECD']; "Presuda ECLI:EU:C:2019:325" => ['ECLI']; "...ISBN 978-953..." => ['ISBN']. Svi generiraju upozorenje 'Kratica X nije pronađena uz obrazac dalje u tekstu' i snizavaju bodove provjere 'Propisi i uvedene kratice', iako nisu pravni akronimi.
- Preporuka: Suzi detekciju: zahtijevaj da se kandidat-kratica pojavljuje u kontekstu pravnog akta (uz Zakon/Uredba/Pravilnik/Odluka) ili prosiri skip-listu (rimski brojevi, OECD, UN, ISBN, DOI, ECLI, COM), te rimske brojeve obradi zasebno. Zadrzi upozorenje kao 'info' dok se ne suzi.
- Verifikacija: legal-citation.ts:28 acrRe `([A-ZČĆŽŠĐ]{2,10})` with a skip list of only ['eu','esljp','vsrh','usrh','nn','sl']. Any 2-10 uppercase run not in that list (roman numerals 'XIV', 'OECD', 'ISBN', 'ECLI' in 'ECLI:EU:C:...') is captured and, if not introduced via 'dalje u tekstu:', pushed as a 'lawAcronym' problem lowering 'Propisi i uvedene kratice'. Confirmed false positives. Low: only in legal-notes mode and only when such tokens appear inside footnotes; deduped by acronym.

### AUD-12 — Demo video referira netrackane /assets/demo-{720,1080,1440}.* dok su committani demo.mp4/webm obrisani, pa cist CI build servira pokvaren video

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **PLAUSIBLE**
- Lokacija: `index.html:1370`
- Dokaz: <source src="/assets/demo-1080.webm" type="video/webm"><source src="/assets/demo-1080.mp4" type="video/mp4">  // korektorski.ts:53-57 dodatno referira demo-720/1440. git ls-tree HEAD public/assets = samo demo-poster.jpg, demo.mp4, demo.webm; git cat-file -e HEAD:public/assets/demo-1080.mp4 => MISSING from HEAD
- Reprodukcija: git clone (ili CI checkout) commita dcfbc6f -> vite build kopira public/ -> dist/assets nema demo-1080.* (untracked u radnom stablu, ?? u git status). Ucitavanje /video sekcije: poster se prikaze, ali <video> ne moze reproducirati (404 na oba <source>). demo.mp4/webm koji SU u HEAD vise se nigdje ne referiraju.
- Preporuka: Committati demo-720/1080/1440.{webm,mp4} (ili ih dodati u LFS/CI artefakt korak) prije deploya, ili vratiti reference na jos-committane demo.mp4/webm. Dodati build/CI provjeru da svaki /assets/ referenciran u index.html i korektorski.ts postoji u git tree.
- Verifikacija: Working-tree inconsistency confirmed: index.html:1370 and korektorski.ts:53-57 reference /assets/demo-{720,1080,1440}.*, but `git ls-tree HEAD public/assets` shows only demo-poster.jpg, demo.mp4, demo.webm, and the demo-*.mp4/webm are untracked (?? in status) while demo.mp4/webm are deleted in the working tree. However the finder's repro is imprecise: index.html is itself Modified (uncommitted), so a clean checkout of dcfbc6f restores HEAD's index.html which references the still-tracked demo.mp4/webm and would build fine. The genuine risk is a pending commit: if index.html/korektorski.ts are committed without `git add`-ing the untracked video files, the deployed video 404s. Downgraded to Low: not broken in any committed state today, a commit-hygiene hazard.

### AUD-14 — Nakon zavrsetka reprodukcije kontrolna traka postaje opacity:0 ali ostaje u tab-redu (fokus na nevidljive kontrole)

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `src/ui/korektorski.ts:95`
- Dokaz: v.addEventListener('ended', () => { stage?.classList.remove('ks-playing', 'ks-vc-on'); showEnd(true); });  // ks-vc-on maknut -> .ks-vctrl{opacity:0}, ali ctrl.hidden se NE vraca na true (postavljen na false u 'play' handleru, red 91)
- Reprodukcija: Tipkovnicom: pusti demo do kraja -> pojavi se zavrsni overlay (#ksVideoEnd). Pritiscima Tab fokus prolazi kroz nevidljive gumbe kontrolne trake (play, seek, glasnoca, brzina, kvaliteta, fullscreen) iza overlaya jer je uklonjen samo vizualni opacity, a `hidden` atribut i dalje false. Krsi WCAG 2.4.7 (fokus mora biti vidljiv).
- Preporuka: U 'ended' handleru vratiti ctrl.hidden=true (ili primijeniti display:none preko klase) kad se prikaze zavrsni overlay, ili staviti kontrolnu traku u inert dok je end-overlay aktivan.
- Verifikacija: CSS index.html:1030 `.ks-vctrl{opacity:0}`, :1031 `.ks-video-stage.ks-vc-on .ks-vctrl{opacity:1}`, :1032 `.ks-vctrl[hidden]{display:none}`. korektorski.ts:91 play handler sets ctrl.hidden=false; :95 ended handler removes 'ks-vc-on' (bar -> opacity:0) but never restores ctrl.hidden=true. So after playback ends the control bar is visually invisible yet still display:flex and in the tab order behind the z7 end overlay, so keyboard Tab reaches invisible controls (WCAG 2.4.7). Confirmed Low.

### AUD-15 — Izbornici brzine/kvalitete videa (role=menu / menuitemradio) nemaju aria-checked na aktivnoj stavci

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `index.html:1383`
- Dokaz: <div class="ks-vc-list" role="menu"><button type="button" data-speed="1" class="on" role="menuitemradio">1×</button>...  // aktivno stanje samo preko CSS klase .on (boja/bold), bez aria-checked; korektorski.ts:153/167 toggle-a samo class 'on'
- Reprodukcija: Screen reader korisnik otvori izbornik Brzina/Kvaliteta: sve stavke se citaju kao 'menu item radio' bez naznake koja je odabrana (aria-checked izostaje), pa se trenutna brzina/kvaliteta ne moze percipirati. Uz to nema arrow-key navigacije koju role=menu ocekuje (stavke su dohvatljive samo Tabom).
- Preporuka: Postaviti aria-checked="true"/"false" na svaki menuitemradio i azurirati ga u click handlerima (korektorski.ts uz class 'on'). Opcionalno dodati roving tabindex + strelice za punu menu semantiku, ili prebaciti na jednostavniji radiogroup uzorak.
- Verifikacija: index.html:1383/1387 speed and quality menus use role='menu' with role='menuitemradio' buttons whose active state is only the CSS class 'on' (:1056 color/bold); no aria-checked is present. korektorski.ts:153 and :167 toggle only classList 'on', never aria-checked. A screen reader announces 'menu item radio' with no selected indication, and there is no arrow-key handler for the role=menu (items are Tab-only). Confirmed accessibility gap, Low.

### AUD-08 — Inline fallback na glavnoj niti koristi nativni preglednicki DOMParser dok worker i golden korpus koriste @xmldom/xmldom, pa fallback putanja nije pokrivena golden snapshotima

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `src/analysis/analyze-docx-client.ts:115`
- Dokaz: analyze-docx.worker.ts:14 `installXmlDomParser()` (xmldom); analyze-docx-client.ts:115 inline `const {analyzeDocx}=await import('./analyze-docx')` koristi globalni (nativni) DOMParser u pregledniku; golden snimljen xmldom-om (xml-dom-install.ts komentar).
- Preporuka: Ili instaliraj xmldom i na inline (glavnoj-niti) putanji radi determinizma, ili dokumentiraj/testiraj poznata razmimoilazenja (npr. namespace/whitespace) izmedju nativnog DOMParsera i xmldom-a; barem dodaj smoke test inline putanje nad golden fixturom.
- Verifikacija: worker.ts:14 installXmlDomParser() (xmldom, same as golden per xml-dom-install.ts); analyze-docx-client.ts:115 inline fallback dynamically imports analyze-docx which uses the ambient DOMParser (native browser parser on the main thread). Golden snapshots are recorded with xmldom, so the native-DOMParser fallback path is genuinely uncovered by golden. Accurate Info observation; no correctness defect demonstrated.

### AUD-13 — Hardkodiran zivi Supabase URL + anon kljuc + waitlist endpoint u produkcijskom bundleu (DEFAULT_PRODUCTION_CONFIG)

- Severity (finder -> konacni): Low -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `src/ui/app.ts:80`
- Dokaz: supabaseUrl:'https://zrrjttizjyfcxmcpgzml.supabase.co',supabaseAnonKey:'eyJhbGciOiJIUzI1NiI...exp 2036...',waitlistEndpoint:'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/faculty-request'
- Reprodukcija: Otvori bilo koju produkcijsku stranicu -> View Source / bundle sadrzi zivi projekt URL + anon JWT + faculty-request endpoint. Za razliku od setup/QA modala, ovo NIJE unutar <!-- dev-only --> regije koju reze scripts/strip-dev-only.mjs, pa se salje svim posjetiteljima i waitlist je ozicen po defaultu (enabled fallback ne gasi supabaseUrl/anonKey/waitlistEndpoint).
- Preporuka: Anon kljuc je javan po dizajnu (RLS ga stiti) pa nije procurela tajna, ali: (1) potvrdi da faculty-request ima RLS + rate-limit jer je pozivljiv s ugradjenim kljucem od strane bilo koga; (2) premjesti URL/kljuc/endpoint u build-time env injekciju (import.meta.env) umjesto hardkodiranja u izvor, da rotacija ne trazi izmjenu koda; (3) uskladi s 'Lokalna obrada' porukom (dokument se ne salje, ali zivi backend je defaultno spojen).
- Verifikacija: app.ts:80 DEFAULT_PRODUCTION_CONFIG hardcodes the live supabaseUrl, an anon JWT (exp 2099), and waitlistEndpoint, outside any dev-only stripped region, so they ship in the production bundle. Factually confirmed. Downgraded Low->Info: the Supabase anon/publishable key is designed to be public and is protected by RLS (per Supabase guidance), and the project URL/endpoint are inherently client-visible for any client app; this is expected exposure, not a leaked secret. Note also enabled:false in the same default.

### AUD-16 — Teaser/paywall granica je iskljucivo prezentacijska: puna analiza (svi nalazi i provjere) ostaje u currentResult u memoriji

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `src/ui/app.ts:763`
- Dokaz: function renderIssues(...){...const visible=gated?all.slice(0,TEASER_SAMPLE):all...}  // paywallGateActive() (red 609) samo skracuje PRIKAZ; komentar red 604: 'Granica je proizvodna, ne DRM: sav izracun je lokalan.'
- Reprodukcija: Uz konfiguriran reportEndpoint (paywall aktivan) analiziraj rad -> UI prikaze samo 2 nalaza. U konzoli `currentResult.issues` / `currentResult.checks` vraca kompletan popis bez placanja.
- Preporuka: Namjerno i ispravno za trenutni model (placena vrijednost = serverski potvrdjen izvjestaj bez ziga + garancija, oboje gejtano serverski u report-client.ts/slot-logic.ts). Zadrzati pravilo da se klijentski gate NIKAD ne koristi kao pristupna kontrola za stvarno placeni sadrzaj; ako se ikad uvede sadrzaj koji smije vidjeti samo platitelj, mora doci s servera, ne iz lokalne analize.
- Verifikacija: app.ts:763 renderIssues `visible=gated?all.slice(0,TEASER_SAMPLE):all` and :762 renderCheckTable render only a summary when paywallGateActive(), while currentResult retains the full issues/checks arrays in memory; the teaser JSON exports (:768) are watermarked summaries but currentResult in the console holds everything. Accurately described and explicitly intentional ('Granica je proizvodna, ne DRM: sav izracun je lokalan'). Confirmed as a correct characterization; Info, by-design, not a defect.

