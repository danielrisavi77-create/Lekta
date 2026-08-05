# AUDIT_MASTER.md, Lekta: konsolidirani audit i status

Datum konsolidacije: 28. srpnja 2026. Pregledan commit: `1329c43` (grana `audit/remediation-2026-07-16`).

## 0. Svrha ovog dokumenta

Ovo je JEDINI kanonski audit/status dokument za Lektu. Zamjenjuje 33 razasute
datoteke (9 raundova auditâ iz razdoblja 10.7. do 27.7.2026, njihove planove
remedijacije i statusne provjere) koje su obrisane iz repozitorija u istom
commitu koji uvodi ovaj dokument. Puni tekst svake obrisane datoteke ostaje
dostupan u git povijesti (`git log --follow -- <putanja>` ili `git show
<commit>:<putanja>`); popis obrisanih datoteka je u poglavlju 16.

**Pravilo održavanja od sada:** kad se napravi novi audit ili se nešto
popravi, ažuriraj OVAJ dokument (pomakni nalaz iz otvorenog u zatvoreni
registar, dodaj redak u promjenjivi zapisnik na dnu). Ne otvaraj novu
`AUDIT_*.md` ili `*_AUDIT.md` datoteku. Iznimka: dubinski, isključivo
read-only istražni materijal (sirovi nalazi prije sinteze) smije privremeno
živjeti u `docs/audit/` tijekom izrade, ali se unutar iste sesije mora
sažeti ovamo i obrisati, ne smije se akumulirati.

Ovaj dokument NE zamjenjuje forward-looking planove (`LEKTA_90_DAY_PLAN.md`,
`LEKTA_PRODUCT_ROADMAP.md`, `LEKTA_IMPLEMENTATION_BACKLOG.md`,
`docs/roadmap/CO_PILOT_STRATEGY.md`, `docs/roadmap/PHASE4_CLOUD_INTEGRITY.md`,
`docs/roadmap/LAUNCH_CHECKLIST.md`) ni operativne runbookove (`PRE_LAUNCH.md`,
`PRE_LAUNCH_CHECKLIST.md`, `GO_LIVE_*.md`, `RUNBOOK_OPS.md`) koji ostaju
zasebni jer opisuju BUDUĆI rad i vlasničke korake, ne nalaze audita. Gdje se
preklapaju, ovaj dokument upućuje na njih umjesto da duplicira sadržaj.

---

## 1. Sažetak za odluku

Lekta je tehnički zrela klijentska aplikacija: lokalna analiza radi u Web
Workeru, parser i citation engine su golden-pokriveni, `src/` je u cijelosti
tipiziran bez `@ts-nocheck`, CI (5 workflowa) vrti typecheck/testove/build/
conformance/security na svaki push. Repair Engine je u zadnja 3 dana (25 do
28.7.) prošao veliku seriju popravaka: oba P0 nalaza (gubitak OMML jednadžbi,
malformed XML kod uparenih praznih elemenata) i gotovo svi P1 nalazi iz
adversarijalnog audita od 25.7. su zatvoreni kroz 20+ ciljanih commitova s
regresijskim testovima. Ovo je najvažnija promjena od zadnjeg pisanja bilo
kojeg internog audit dokumenta i nijedan od njih to još ne odražava (vidi
poglavlje 5).

Ono što ostaje stvarno otvoreno grupira se u tri vrste:

1. **Vlasnički/pravni koraci koji ne traže kod**: OIB, adresa i voditelj
   obrade u `data/legal/provider.json` su prazni; naplata (Lemon Squeezy
   varijante, webhook, tajne) nije spojena; domena je i dalje Netlify
   poddomena. Ovo je poznato i praćeno u `docs/PRE_LAUNCH.md` i
   `docs/GO_LIVE_NAPLATA.md`, nije novi nalaz.
2. **Stvarni preostali kod nalazi** (popisani u poglavljima 5 do 9): profil
   se može tiho potvrditi bez da je studij prepoznat (poglavlje 7, sad
   RIJEŠENO), preostali nalazi na ekranu rezultata iz audita 23.7. (poglavlje
   6), analytics/error endpointi prazni (poglavlje 9), Repair Engine ima
   preostala 4 do 5 P1/P2 nalaza plus podatkovni gap od 205/395 profila bez
   `autoFixable` pravila (poglavlje 5.2).
3. **Dokumentacijski dug**, sada zatvoren ovim dokumentom.

**Preporuka nepromijenjena naspram vanjskog audita od 27.7.**: besplatna
beta može krenuti čim se zatvori kratki popis u poglavlju 14; puna naplata
čeka pravni identitet i naplatnu infrastrukturu (vlasnički koraci, kod je
spreman prema `docs/GO_LIVE_NAPLATA.md`).

---

## 2. Status po površini (GO/NO-GO)

| Površina | Status | Uvjet |
|---|---|---|
| Javna lokalna analiza (bez naplate) | **CONDITIONAL GO** | Zatvoriti poglavlje 14 (P0 popis) |
| Besplatni server-side repair (beta, `REPAIR_FREE_MODE=true`) | **CONDITIONAL GO** | Isto + potvrditi rate limit slojeve (poglavlje 9) |
| Naplaćeni repair (produkcija) | **NO-GO** | Pravni identitet + Lemon Squeezy infrastruktura (vlasnički, kod gotov) |
| Rokovi/podsjetnici e-mailom | **NO-GO (inertno)** | Domena + Resend DPA/regija (vlasnički) |
| Cloud integritet (plagijat/AI-detekcija) | **Nije pokrenuto** | Faza 4, namjerno posljednja (`docs/roadmap/PHASE4_CLOUD_INTEGRITY.md`) |

---

## 3. Oznake korištene u ovom dokumentu

Preneseno iz izvornih audita radi razumljivosti povijesnih ID-jeva (AUD-\*,
RE-\*, LEKTA-SEC-\*, BL-\*, ux-\*, itd. i dalje se pojavljuju kao referenca).

- **Prioritet**: P0 (blokira launch površinu), P1 (jezgra iskustva/prihoda),
  P2 (kvaliteta), P3 (kozmetika/nice-to-have).
- **Verdikt nalaza**: CONFIRMED (dokazano čitanjem koda), PLAUSIBLE
  (vjerojatno, nije 100% reproducirano), REJECTED (provjereno, nije problem).
- **Status u ovom dokumentu**: OTVORENO / RIJEŠENO (s dokazom, commit ili
  file:line) / DJELOMIČNO / ODLUKA (čeka vlasnika) / BY-DESIGN (namjerno) /
  ODBAČENO (verificirano kao ne-problem).

---

## 4. P0, kriticno otvoreno, danas

| ID | Opis | Izvor | Dokaz stanja |
|---|---|---|---|
| PRAVNI IDENTITET | `data/legal/provider.json`: `oib`, `address`, `privacyController` prazni; `contactEmail` je Gmail adresa | Vanjski audit 27.7. + `docs/PRE_LAUNCH.md` sekcija C | Potvrđeno čitanjem datoteke 28.7., blokira svaku ozbiljnu B2C naplatu |

Napomena: RESULT-02, RESULT-03 i RESULT-05 su RIJEŠENI 28.7.; RESULT-01 i RESULT-04 (izvorno P0) su DJELOMIČNO ili
potpuno adresirani, sve u poglavlju 6. LEKTA-SEC-01/02 (izvorno High) su
RIJEŠENI, vidi poglavlje 8. RE-01/RE-02 (izvorno P0, gubitak sadržaja) su
RIJEŠENI, vidi poglavlje 5.1. Ovo je najkraći P0 popis otkad postoji audit
povijest za ovaj projekt.

---

## 5. Repair Engine, pregled

Repair Engine je bio predmet zasebnog adversarijalnog audita 25.7.2026.
(`AUDIT_REPAIR_ENGINE_2026-07-25.md`, 16 dimenzija, 216 kandidata, 141
CONFIRMED) i pripadnog plana faza (`PLAN_REPAIR_REMEDIATION_2026-07-25.md`,
Faze 0 do 7). Nijedan od ta dva dokumenta nije ažuriran otkad je izvršenje
plana krenulo, pa je slika u njima danas netočna. Ovo poglavlje je
rekonstruirano iz `git log` (25. do 28.7., grana `audit/remediation-2026-07-16`)
i izravne provjere koda, ne iz teksta plana.

### 5.1 P0 (gubitak sadržaja/korupcija), oba RIJEŠENA

| ID | Opis | Commit | Dokaz |
|---|---|---|---|
| RE-01 | `empty-paragraph-fixer` brisao odlomak čiji je jedini sadržaj OMML jednadžba (`m:oMath`/`m:oMathPara`, tekst u `<m:t>` ne `<w:t>`) | `16cb20b` | `src/analysis/paragraph-cleanup.ts` sad eksplicitno štiti `m:oMath(Para)?`; regresijski testovi u `paragraph-cleanup.test.ts` (blok, inline i 3 uzastopne jednadžbe) |
| RE-02 | `upsertChild` mogao upisati atribut u ZATVARAJUĆI tag kod uparenog praznog elementa (`<name></name>`), dajući malformed XML | `089cd11` | `src/repair/xml-patch.ts`, komentar i grananje eksplicitno referenciraju RE-02: atribut ide isključivo u otvarajući tag |

### 5.2 P1, status po ID-ju

| ID | Opis | Status | Commit |
|---|---|---|---|
| RE-03 | Prored/poravnanje/razmak tvrdo ciljali literalni "Normal" stil, no-op na LibreOffice/Google Docs/hrvatski Word | RIJEŠENO | `6705276` |
| RE-04 | Poravnanje broja stranice mrtvo (gate `=== true` umjesto stringa) | RIJEŠENO | `2c14199` |
| RE-05 | Umetanje numeracije od Uvoda unosilo novi prekršaj poravnanja | RIJEŠENO | `05390a3` |
| RE-06 | 205/395 profila (uklj. SVI FPZG i Pravo) nemaju nijedan `autoFixable` ruleEntry | **OTVORENO** (podatkovni zadatak, veliki opseg) | nema commita; Faza 6 plana |
| RE-07 | `patchFooterPageAlignment` nije radio kad Word izostavlja `w:jc` | RIJEŠENO | `55572a3` |
| RE-08 | Velika slova naslova prepoznavala samo literalni "Heading{n}" | RIJEŠENO | `80a46eb` |
| RE-09 | `toCroatianUpper` kvario heksadecimalne XML entitete | RIJEŠENO | `e71b1b7` |
| RE-10 | Naslov unutar `w:pPrChange` (track changes) tretiran kao živi | RIJEŠENO | `083272b` |
| RE-11 | Prazan odlomak s vidljivim `pBdr`/`shd`/`numPr` (potpisne linije) brisan | RIJEŠENO | `c1388f5` |
| RE-12 | Odlomci s tracked-changes/comment markerima brisani kao "prazni" | RIJEŠENO | `20458c9` |
| RE-13 | `<w:tab/>` s leaderom (potpisna linija) brisan | RIJEŠENO | `0f7be85` |
| RE-14 | Front-matter zaštita naslovnice pucala na "Naslov"/"Podnaslov" stilu | RIJEŠENO | `6f93136` |
| RE-15 | Deep čišćenje skidalo prored s uvučenih blok-citata | RIJEŠENO | `be325c8` |
| RE-16 | Odlomak s inline `w:sdt` (Zotero/Mendeley) preskočen cijeli u deep čišćenju | RIJEŠENO | `e045587` |
| RE-17 | Plaćeni slot trošen prije `applyFixers`, nije se vraćao na pad/nula-izmjenu | RIJEŠENO | `94e28a2` (Faza 4) |
| RE-18 | Otisak naplatnog gatea iz klijentske meta, ne uploadane datoteke | RIJEŠENO | `94e28a2` |
| RE-19 | Serverski panel primjenjivao section-insert bez traženog potvrdnog koraka | RIJEŠENO | `94e28a2` |
| RE-20 | Dvoklik na "Popravi sve" mogao pokrenuti dva paralelna uploada | RIJEŠENO | `94e28a2` |
| RE-21 | `footnoteSpacingFixer` razrješavao stil fusnota samo po točnom "FootnoteText" | RIJEŠENO | `fffae27` |
| RE-22 | `patchDefaultFont` korak 3 mogao upisati font izvan `rPr` | RIJEŠENO | `058a6f9` |
| RE-23 | Self-closing `w:rPrDefault` davao lažni `applied:true` bez izmjene | RIJEŠENO | `5d19abf` |
| RE-24 | `maskElement`/`findStyleBlock` nisu pokrivali self-closing oblik | RIJEŠENO | `ae26f71` |
| RE-25 | O(n²) skeniranje sidra po tekstu (~10s na 4000 odlomaka) | **OTVORENO** | nema commita; Faza 7.1/7.2 |
| RE-26 | `applyFixers` nije imao try/catch po fixeru, jedan pad ruši cijelu bateriju | RIJEŠENO | `689247c` |
| RE-27 | `runFixer` upisivao `NaN` u XML za prazne parametre | RIJEŠENO | `fac26a8` |
| RE-28 | Zip-codec default budžet 64MB odbijao realne radove pune slika | **OTVORENO** | nema commita; Faza 7.3 |
| RE-29 | Golden harness tiho preskakao 4/16 fixera | **OTVORENO** | nema commita; Faza 0.1 |
| RE-30 | `patchSectionPageNumbering` mogao brojati fantomski `sectPr` unutar `pPrChange`/komentara (PLAUSIBLE, ne CONFIRMED) | **OTVORENO** | nema commita; Faza 3.5 |
| RE-31, 34, 35, 37, 38, 39, 40, 42, 45 | Poštenje UX povratne informacije (labele, Escape zatvara modal, download bez popup-blocka, itd.) | RIJEŠENO | `55fa66e` (Faza 5) |
| RE-32, RE-33 | Vezano uz server/naplatu | RIJEŠENO | `94e28a2` |
| RE-36, RE-41 | Razdvajanje "već usklađeno" od "nije bilo moguće" | **DJELOMIČNO** (9/16 fixera dobilo signal, `xml-patch.ts` nije dirano) | `55fa66e`, vidi commit napomenu |
| RE-43 | `CHECK_TITLES`/fixer mapa bez tripwire testa | RIJEŠENO | `e059ce3` |
| RE-31..45 ostatak (P2 izbor iz izvornog auditnog dokumenta) | Sirovi slugovi u UI, "0 izmjena"="Popravljeno" i sl. | Većina RIJEŠENA kroz `55fa66e`, provjeri pojedinačno prije oslanjanja | `55fa66e` |
| ~99 P3 nalaza | Bili u `scratchpad/audit/p3.md`, nikad uneseni u čitljiv korpus | **NEPOZNATO**, ne postoji izvor za provjeru | N/A |

**Zaključak za ovo poglavlje**: rizik profil Repair Enginea je danas
bitno bolji nego što bilo koji postojeći dokument tvrdi. Preostaje: RE-06
(najveći, podatkovni: proširiti `autoFixable` pokrivenost profila),
RE-25/RE-28/RE-29 (performanse i test-mreža), RE-30 (nizak rizik, PLAUSIBLE),
i verifikacija da RE-36/RE-41 doista pokrivaju preostalih 7/16 fixera.
`docs/AUDIT_REPAIR_ENGINE_2026-07-25.md` i `docs/PLAN_REPAIR_REMEDIATION_2026-07-25.md`
su obrisani jer je njihov sadržaj prenesen ovamo; za pun izvorni tekst
nalaza (RE-31..45 P2 opisi, metodologija D1-D16) vidi git povijest.

### 5.3 Kritični put popravka (arhitektura, 28.7.)

Commit `1329c43` (danas) izdvojio je provjeru izvora (`source-check`) u
zaseban, usporedan Edge poziv (ne blokira upload), a pohranu u "Moji
popravci" prebacio u `EdgeRuntime.waitUntil` (`storagePending` na
klijentu). Ovo NE zatvara nijedan RE-ID iz gornje tablice, riječ je o
odvojenoj arhitekturnoj promjeni (kritični put/latencija), dokumentiranoj u
memoriji projekta i generiranom `docs/REPAIR_RECIPE.md`.

---

## 6. Ekran rezultata (UX), preostalo

Izvor: `docs/audit/RESULT_EXPERIENCE_AUDIT_2026-07-23.md` (stvarna analiza
jedne fixture u Chromiumu). Djelomično adresirano commitom `ff660d7`
(25.7., "preuzimanje kao izričit gumb, prilozi na novoj stranici, 'Zašto
<ocjena>?', popravci pregleda dokumenta").

| ID | Opis | Prioritet | Status |
|---|---|---|---|
| RESULT-01 | Ocjena (score) izgleda kao izjava o spremnosti za predaju | P0 | **RIJEŠENO (28.7., nadograđeno na `ff660d7`).** `renderPhaseTwoResultViews` (vec u `ff660d7`, ali dokumentacija to nije znala do danas) vodi tekstom "Što prvo napraviti" i statusom "Nije spremno za predaju / Tehnička ocjena NE potvrđuje spremnost" ODVOJENO od broja; live-testirano. Otkriven i popravljen usput: "Zašto \<ocjena\>?" transparentni raspis je od `ff660d7` bio TIHO NEVIDLJIV (Phase Two je prepisivao cijeli `#resultGuide` i brisao ga bez traga greške); sad je vraćen kao jedini pisac istog elementa, vidi poglavlje 6a |
| RESULT-02 | Ručna promjena statusa nalaza sakrije kritičan nalaz bez undo | P0 | **RIJEŠENO (28.7.)**: `src/ui/finding-view-model.ts` odvaja `open`/`confirmed`/`ignored` (nikad tiho "riješeno"); `confirmed` NE nestaje iz `topFindings` (samo `ignored` se izdvaja, uz eksplicitan razlog koji korisnik upisuje); oba statusa imaju "Poništi" (`data-finding-reopen`). Ovo je bilo vec izgradjeno u WIP-u iz `ff660d7`, samo dokumentacija nije stigla do toga. Dodano 28.7.: `ignored` sad ima isti tretman kao `confirmed`, toast + on-card napomena da se ocjena ne mijenja i da je nalaz izdvojen iz tri najvažnija koraka (`wireFindingCards` u `app.ts`, `finding-status-note` u `finding-view-model.ts`); testovi u `tests/finding-view-model.test.ts` |
| RESULT-03 | "Automatski popravi" ne radi ono što obećava | P0 | **RIJEŠENO (28.7.), live-testirano.** Nova korelacija nalaz→popravak preko `matchKeys` (naslov checka/issuea): svaka `RepairableItem` u `src/ui/repair-items.ts` sad nosi `matchKeys` (naslov(i) checka čiju povredu popravlja), `FindingViewModel` nosi isto (`issue.title` + upareni `check.title`, `src/ui/finding-view-model.ts`). Nova čista funkcija `pickTargetItem(matchKeys, items)` (jedinično testirana, uklj. integracijski test sa stvarnim `pageNumberingRepairableItem`) nalazi točno onu stavku koja odgovara kliknutom nalazu. `data-finding-repair` sad prosljeđuje `finding` u `scrollToRepairPanel(r, finding)` (`app.ts`), koja: (a) kad je stavka nađena u već-mountiranom panelu (`data-rule-id` atribut na `<li>`/text-item redu), scrolla je u vidokrug, dodaje jednokratni highlight (`.lekta-repair-panel__item--target`, `repair-panel.css`), prisilno je označi (SAMO glavne stavke, ne one koje mijenjaju autorov tekst) i pomiče fokus na nju uz toast "Otvoren je popravak za: \<label\>."; (b) kad stavka NE postoji za ovaj dokument, honest toast umjesto tihog slijetanja na nepovezanu stavku: "Ovaj popravak trenutno nije ponuđen kao automatska stavka za ovaj dokument. Pogledaj cijeli popis ispod." **Live-testirano Playwrightom** (`fer-diplomski-prazni-odlomci.docx`): klik na "Provjeri rimsku i arapsku numeraciju" danas ispravno prepoznaje da ovaj dokument nema detektabilan split sekcija za numeriranje i prikazuje upravo tu honest poruku (umjesto da tiho označi nepovezanu "pretvori Sadržaj u TOC polje" stavku, kako je radilo prije popravka). Uspješan match-i-highlight put dokazan jedinično (`tests/repair-items.test.ts`, `tests/finding-view-model.test.ts`), DOM/vizualni dio dokazan čitanjem+buildom (live-dokazivanje kroz sve tipove nalaza ometano nestabilnošću dev servera zbog paralelne sesije koja je istovremeno mijenjala `data/profiles/**`, nevezano uz ovaj kod) |
| RESULT-04 | Desktop faksimil gubi prekidač Čitljivo/Faksimil zbog CSS-a (sticky zoom traka prekriva) | P0 | RIJEŠENO (`ff660d7`, `#previewZoomBar` više nije sticky, z-index popravljen) |
| RESULT-05 | Profilni izvor izgleda kao dokaz za SVAKI nalaz na kartici | P0 | **RIJEŠENO** (vec u WIP-u iz `ff660d7`, potvrdjeno citanjem koda 28.7.): `finding.source` se u `findingCardHtml` prikazuje SAMO kad `source.exact===true`; `buildFindingViewModels` danas taj flag postavlja uvijek na `false` (nema jos podatkovnog modela za izravnu vezu pravilo->izvor), pa se izvor NIKAD ne ponavlja po karticama; profilni kontekst (ista poveznica koju je audit uhvatio) prikazuje se JEDNOM, u `#profileNote` prije popisa nalaza (`updateProfile()`), ne po nalazu. Regresijski test vec postoji: `tests/finding-view-model.test.ts` provjerava `not.toContain('Kontekst profila')` na kartici. Nije dodan tekst "izvor nije povezan" na svaku karticu (audit preporuka) jer bi to danas znacilo isti redak na SVIM karticama (exact je uvijek false), sto ponovno uvodi gustocu/duplikat koju RESULT-06 kritizira; namjeran izbor da se blok jednostavno izostavi dok ne postoji stvaran per-pravilo izvor |
| RESULT-06..11 | 4 sloja dupliciranog sadržaja; mobilni prvi ekran bez jasne akcije; CTA nazivi zavaravaju; metapodaci pomiješani s greškama; status/score bez jasnog odnosa; serverski popravak dolazi nakon poruke o privatnosti | P1 | **RIJEŠENO, live-testirano 28.7.** Svih 6 je već bilo riješeno kroz "Fazu 2/3" (`renderPhaseTwoResultViews`/`renderPhaseThreeRepairEntry`), bačenu kao WIP u `ff660d7` (25.7., 2 dana nakon audita), samo dokumentacija nikad nije uhvatila taj commit. Vidi poglavlje 6a za dokaz po stavci i za čišćenje mrtvog koda otkriveno usput |

Vanjski audit od 27.7. (poglavlje 6.5 i 6.7 tog dokumenta) neovisno je
potvrdio istu klasu problema (gusto sučelje, AutoFix CTA trenje) ali
opisao KONKRETAN AutoFix CTA bug (drugi klik potreban za otvaranje panela)
koji **više nije reproducibilan**: `scrollToRepairPanel` (`src/ui/app.ts`)
danas u jednom pozivu otvara detalje, skrola i fokusira gumb, na PRVI klik
(commit `576b87e`, 20.7., prije reviewanog commita vanjskog audita). Postoji
mrtav, nikad ožičen gumb `data-triage-repair` u `src/ui/triage-view.ts`
(funkcija `triagePanelHtml` se nigdje ne importa), koji nije taj problem.

### 6a. RESULT-06..11: dokaz po stavci, čišćenje mrtvog koda, 3 usput otkrivene i popravljene regresije

Live-testirano Playwrightom (`fer-diplomski-prazni-odlomci.docx`) protiv
`renderPhaseTwoResultViews`/`renderPhaseThreeRepairEntry` u `src/ui/app.ts`:

- **RESULT-06** (4 sloja duplikata): stari "Plan ispravaka" tab trajno skriven
  (`$('#tabbtn-action')?.classList.add('hidden')`); jedan objedinjeni popis
  nalaza s 7 filtera (Problemi dokumenta/Blokatori/Dorade/Ručna provjera/
  Ograničenja analize/Ručno provjereno/Zanemareno).
- **RESULT-07** (mobilni ekran bez CTA): "Što prvo napraviti" + jedan primarni
  CTA (`guideOpenPreview`/`guideOpenPriority`).
- **RESULT-08** (zavaravajući "Otvori označeni pregled"): CTA sad glasi
  "Otvori označeno mjesto u dokumentu" SAMO kad postoji `anchored` nalaz.
- **RESULT-09** (metapodaci pomiješani s greškama): `#issueCountLabel`
  ispisuje "N problema dokumenta, M ograničenja analize" odvojeno; potvrđeno
  live da filter "Ograničenja analize" prikazuje isključivo `kind:'limitation'`.
- **RESULT-10** (status/score bez odnosa): `#resultReadiness` dobiva raspis
  "X blokatora, Y dorada, Z ručnih provjera" uz status spremnosti.
- **RESULT-11** (server-repair skriven do klika): tekst "Dokument se pritom
  šalje na server radi popravka i pohranjuje dok ga ne obrišeš" stoji na
  samom `#repairEntry` CTA-u, prije ijednog klika (`renderPhaseThreeRepairEntry`,
  RE-34).

**Čišćenje mrtvog koda (isti prolaz, `src/ui/app.ts`):** tri sloja renderiranja
su postojala usporedno (stari `renderResultGuide`/`renderActionPlan`/
`renderIssues`, posredni `renderUnifiedActionPlan`/`renderUnifiedIssues`, i
stvarni `renderPhaseTwoResultViews`), pri čemu su prva dva sloja bila
BEZUVJETNO pregažena trećim na svakom renderu (pisala u DOM, odmah izbrisano).
Uklonjeno: sve 5 starih/posrednih funkcija, njihovi pozivi iz `renderTriage`/
`refreshFindingViews`/`renderResult`, mrtva `_triageFilter` varijabla (nikad
čitana), i dva zastarjela `#issueFilters` onclick ožičenja koja su referencirala
uklonjene funkcije. `renderTriage` sveden na `renderReadinessHeader + renderPhaseTwoResultViews`.

**3 regresije otkrivene i popravljene TIJEKOM ovog čišćenja** (sve su bile
tiho aktivne već od `ff660d7`, 25.7., ne od danas):
1. `#resultGuide` počinje s `class="hidden"` u `index.html`; stara
   `renderResultGuide` je to čistila, `renderPhaseTwoResultViews` nikad nije
   imala svoj `classList.remove('hidden')`. Bez ovog popravka bi cijeli
   "Što prvo napraviti" blok ostao NEVIDLJIV usprkos ispravnom innerHTML-u
   (uhvaćeno live testom, ne statičkim čitanjem).
2. "Zašto \<ocjena\>?" (`scoreBreakdownHtml`) i "Podijeli ocjenu" (`shareScore`,
   `guideShareScore`) su živjeli isključivo u staroj `renderResultGuide`, koja
   je pisala u `#resultGuide` PRIJE nego ga `renderPhaseTwoResultViews`
   bezuvjetno prepiše: oba obilježja su bila tiho nevidljiva otkad je Faza 2
   uvedena. Sad su ugrađena izravno u `renderPhaseTwoResultViews`.
3. `suggestTool` (naslovnica/izjava/literatura/kartice/citat CTA po nalazu,
   `src/ui/tool-suggestions.ts`) je bio ožičen ISKLJUČIVO u staroj
   `renderActionPlan`, koja je pisala u `#actionPlan` unutar trajno skrivenog
   `#tab-action`: CTA je bio nedohvatljiv i PRIJE ovog čišćenja. Otkriveno
   preko `tests/tool-suggestions.test.ts` source-tripwirea (koji je ispravno
   pao kad je `renderActionPlan` uklonjena). Preseljeno u
   `finding-view-model.ts` (`FindingViewModel.tool`, računa se u
   `buildFindingViewModels` preko novog `settings`/`selection` konteksta na
   `FindingResultInput`), prikazano u `findingCardHtml` na SVAKOM mjestu gdje
   se nalazi renderiraju (triage, svi nalazi), umjesto samo u mrtvom planu.
   Live-testirano: 7 `.action-tool` CTA-ova ispravno prikazano na stvarnom
   dokumentu, uklj. parametriziranu naslovnicu (`?fakultet=fpzg&razina=diplomski&smjer=...`).

Testovi: `tests/finding-view-model.test.ts` (+2 nova, `tool` polje),
`tests/tool-suggestions.test.ts` (source-tripwire premješten na
`finding-view-model.ts`). `npm run check` zelen (vidi promjenjivi zapisnik).

---

## 7. Poznati preostali UX nalazi izvan ekrana rezultata

| ID | Opis | Prioritet | Status |
|---|---|---|---|
| Potvrda profila (novi, 27.7.) | `applyDetectedContext` (`src/ui/app.ts`): kad `ctx.program` nije prepoznat (null), select ostaje na alfabetski prvom programu (`populatePrograms`), ali kod je BEZUVJETNO postavljao `_profileConfirmed=true`, gaseći `needsProfileConfirmation` gate koji bi inače tražio potvrdu za verificirani profil | **P1** | **RIJEŠENO (28.7.)**: novi eksportirani `isConfidentDetection(ctx)` u `src/ui/profile-detect.ts` vraća `true` samo kad je `ctx.program` stvarno prepoznat; `applyDetectedContext` sad postavlja `_profileConfirmed=isConfidentDetection(ctx)`. Regresijski testovi u `tests/profile-detect.test.ts` (pozitivan slučaj, slučaj "fakultet prepoznat, program nije", `null` ulaz). `npm run check` zelen (196 datoteka, 2768 testova) |
| ux-02 / ux-07 (Jak default profil, nesklad limita) | Default FPZG/Politologija/Diplomski; auto-detekcija samo za unizg; dropzone tvrdi 50MB dok mobilni cap je 20MB | P2 | DJELOMIČNO (BL-P0-05-8 potvrda profila i BL-P0-05-9 graduirani prikaz limita po uređaju su odrađeni prema `AUDIT_STATUS_2026-07-11.md`; gornji "Potvrda profila" nalaz koji je otvarao istu rupu za slučaj neprepoznatog studija je sad RIJEŠEN) |
| ux-01 | Nigdje se eksplicitno ne kaže da Lekta NIJE provjera plagijata | P1 | OTVORENO, nema poznatog popravka teksta |
| accessibility-03..14 (12 preostalih P2/P3) | Težina nalaza samo bojom, forced-colors fokus, modal nije inert, nema axe u CI, tablica bez scope, spinner bez reduced-motion, ARIA menu desink, mali touch ciljevi, nizak kontrast fokusa, preskok h-razina, dropzone ugniježđena interaktivnost, tema bez aria-pressed | P2/P3 | OTVORENO (accessibility-01 skip-link i accessibility-02 fokus/najava nakon analize su RIJEŠENI, `BL-P1-01`/`BL-P1-02`) |
| performance-02, 03, 04, 06, 07, 08 | Draftovi+source-registry (1,45MB) samo za advisory listu; DOCX/PDF motor eager na landingu; nema prekid analize; nema immutable cache za `/assets/*`; font subseting; cijela datoteka u memoriji | P2/P3 | OTVORENO (`performance-01`, glavni chunk 2,4MB/369KB gzip, je RIJEŠEN light/heavy splitom, danas ~97KB gzip) |
| `docs/audit/PERFORMANCE_OPTIMIZATION_PLAN_2026-07-24.md` (bundle lazy-load plan) | Cilj: smanjiti glavni bundle 20 do 35KB gzip lazy-loadanjem legal-content, repair-history, preflight-panel, repair-panel, repair-client, auth/session, checkout | P2 | DJELOMIČNO: `repair-client`, `repair-history`, `auth/session`, `checkout`, `preflight-panel` su danas lijeno učitani (`src/ui/app.ts`, `loadRepairClient`/`loadRepairHistoryClient`/`loadAuthClient`/`loadCheckoutClient`, dinamički `import('../preflight/preflight-panel')`); `repair-panel` i `legal-content` NISU (statički import na vrhu `app.ts`) |
| seo-01..08 | Nekonzistentan default origin u 2 generatora (`lekta.hr` vs `lektahr.netlify.app`), tanki near-duplicate citatne stranice, tool stranice bez canonical/og:url, nema og:image, favicon samo na indexu, sitemap higijena | P1/P2/P3 | seo-01 (origin) DJELOMIČNO (BL-P0-01-4 origin-guard riješen za live deploy; ostaje footgun za build bez env varijable); seo-07 (404 stranica) RIJEŠEN (`public/404.html`); ostali OTVORENO |
| Broj "mogućih problema" vs broj trijažnih nalaza (npr. "15 vs 14") | `findingsFor()`/`metricIssues` (UI) broji iz `result.issues`; `src/analysis/triage.ts:buildTriage()` neovisno broji `counts.total` iz `result.checks` vlastitim `isFinding()` predikatom | P2 | DJELOMIČNO: uzrok koji je zabilježio interni audit 23.7. (advisory stavke ulazile u isti broj) je RIJEŠEN (`findingKind()` u `src/ui/finding-view-model.ts` ih danas isključuje kao `kind:'limitation'`), ali arhitektura i dalje ima DVA neovisna brojača bez garancije podudaranja; mismatch je i dalje moguć |

---

## 8. Sigurnost, preostalo

Root `SECURITY_AUDIT.md` (14.7., shema `LEKTA-SEC-01..07`) bio je aktualni
izvor istine i zamijenio je stariji `docs/audit/SECURITY_AUDIT.md` (10.7.,
shema `security-*`). Oba su obrisana, status ovdje.

| ID | Opis | Prioritet | Status |
|---|---|---|---|
| LEKTA-SEC-01 | `integrity-check` "full" bez kvote/idempotency/timeouta | High | RIJEŠENO (AUD-22/29) |
| LEKTA-SEC-02 | Retencija (pg_cron) nije bila dokazivo aktivna | High | RIJEŠENO (AUD-18/19/30, fail-closed) |
| LEKTA-SEC-03 | Preflight može premašiti CPU/mem budžet | Medium | DJELOMIČNO (busy-check + concurrency guard riješeno; CPU kill dretve ostaje "needs-decision") |
| LEKTA-SEC-04 | XML parser bez DTD/entity obrane | Medium | RIJEŠENO (AUD-31/39, `_xml_root` DOCTYPE/ENTITY guard) |
| LEKTA-SEC-05 | Preširok CORS (`*`) na autenticiranim funkcijama | Medium | RIJEŠENO (AUD-24/33, `corsHeadersFor` allowlist) |
| LEKTA-SEC-06 | Checkout bez server rate limita | Low | RIJEŠENO (AUD-23/35, dnevni cap) |
| LEKTA-SEC-07 | CI bez secret scanning/SAST | Low | RIJEŠENO (AUD-47, gitleaks job u `security-audit.yml`) |
| security-04 (stariji, 10.7.) | `verify_jwt` nije zakovan po funkciji u configu | P3 | OTVORENO |
| security-06 (stariji) | Purge RPC-ovi (`purge_old_report_generations`, `purge_faculty_request_ip`) nisu revocani od public/anon | P3 | OTVORENO (posljedica danas bezopasna, RLS odbija promjenu) |
| P0-02b (dependencies-01, `LAUNCH_BLOCKERS.md`) | 8 Edge funkcija uvozi `@supabase/supabase-js` s `esm.sh` bez pina/`deno.lock` | P1 | Status nepoznat u ovom prolazu, treba provjeru `supabase/functions/*/index.ts` importa i postoji li `deno.lock`; ovo je jedini P0-02 podnalaz koji nijedan naknadni dokument ne potvrđuje kao zatvoren |

### 8.1 Novi production audit, 4.8.2026.

Ovo su nalazi izravno provjereni na produkcijskom projektu
`zrrjttizjyfcxmcpgzml`, ne samo iz lokalnog koda.

| ID | Opis | Prioritet | Status i dokaz |
|---|---|---|---|
| PROD-01 | Klijent iz `repairEndpoint` izvodi `/source-check`, ali funkcija nije deployana | P1 | **RIJEŠENO**: `source-check` je deployan kao production Function, `verify_jwt=true`, a `OPTIONS https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/source-check` sada vraća 200. |
| PROD-02 | Produkcijski `send-reminders` je stari, javno okidljiv deploy | P1 | **RIJEŠENO**: deployana je lokalna verzija s `isCronAuthorized` i `REMINDER_CRON_SECRET`; neautorizirani POST sada vraća 401. Generirana je nova cron tajna, spremljena samo u Supabase secrets, a postojeći cron poziv je ažuriran da je šalje. |
| PROD-03 | Produkcijski `send-reminders` ne podržava novih pet razina podsjetnika | P1 | **RIJEŠENO**: produkcijska shema sada ima svih pet markera (`30d`, `14d`, `7d`, `72h`, `1d`), insert policy provjerava da su svi prazni, a `send-reminders` je deployan u verziji 8. |
| PROD-04 | Produkcijski `create-checkout` zaostaje za lokalnim server-side tier gateom | P1 prije naplate | **RIJEŠENO**: deployana je lokalna verzija s `checkoutMismatch`/`tier_mismatch`; bundling je dodatno popravljen eksplicitnim `.ts` importima. Endpoint bez JWT-a vraća 401. |
| PROD-05 | Produkcijska baza i repo nisu jedan reproducibilan migration source of truth | P1 operativno | **POTVRĐENO, OTVORENO**: produkcija ima 56 zapisa u `supabase_migrations.schema_migrations`, repo ima 38 lokalnih migracija; produkcija dodatno sadrži `academic_suite`, `completion_app`, `jobs` i `record-completion-check` objekte koji nisu u ovom repozitoriju. Treba odlučiti je li Supabase projekt namjerno dijeljen i dokumentirati granicu ili ga razdvojiti. |
| PROD-06 | Supabase Security Advisor i dalje vidi higijenske rizike | P2 | **POTVRĐENO, neujednačene težine**: `generate_referral_code` i `purge_old_report_generations` imaju mutable `search_path`; `pg_net` je u `public`; Auth zaštita od procurjelih lozinki je isključena. `increment_job_view` je javno izvršiva SECURITY DEFINER funkcija, ali pripada tablici `jobs` iz drugog sustava i nije dio Lekta koda. |
| PROD-07 | Staging preflight funkcije imaju hardkodirani production origin | P2 staging | **LOKALNO RIJEŠENO, DEPLOY ODGOĐEN**: `preflight-start` i `preflight-result` sada čitaju `ALLOWED_ORIGIN` kao zarezom odvojenu listu, uz production fallback. Staging backend je pauziran, pa se deploy radi pri ponovnom uključivanju staginga. |

Status nakon sanacije 4.8.2026.: PROD-01 do PROD-04 su riješeni i potvrđeni production smoke testom. PROD-05 ostaje otvoren kao širi migration drift. PROD-06 je djelomično riješen: production funkcijama `generate_referral_code` i `purge_old_report_generations` postavljen je `search_path = public`, a purge RPC-u opozvan je public EXECUTE; preostaju `pg_net`, leaked-password zaštita i javna funkcija iz drugog sustava. Leaked-password zaštita je provjerena, ali Supabase je odbija na trenutnom planu, dostupna je na Pro planu i višem. PROD-07 je lokalno riješen, a deploy čeka ponovno uključivanje staginga.

Production end-to-end test 4.8.2026.: anonimna sesija 200, `source-check` 200, `repair-docx` 200 sa stvarnom promjenom (`changelogCount=1`), zapis `storagePending` postao vidljiv u povijesti nakon čekanja, brisanje je vratilo 200, a naknadna provjera potvrdila je nula redaka i nula Storage objekata. Vraćeni DOCX prošao je `strict-open` i otvorio se Microsoft Wordom s `OpenAndRepair=false`.

`npm audit`: 20 ranjivosti (1 critical, 1 high, 14 moderate, 4 low), SVE u
dev-only lancima (`vitest`/`vite`/`esbuild` i `netlify-cli`). Produkcijski
`npm audit --omit=dev --audit-level=high` = 0. **Odluka (14.7., potvrđena
16.7.): prihvaćeno, ne popravljati**, jer nijedan napadački put nije dostupan
u workflowu (vitest UI se nikad ne pokreće, `netlify-cli` nije u nijednom
npm skriptu). Re-verificiraj ako `npm audit --omit=dev` ikad prijavi > 0,
ili ako se počne koristiti `vitest --ui`.

---

## 9. Operativno: analytics, error monitoring, rate limit, backup

| Stavka | Status | Dokaz |
|---|---|---|
| `analyticsEndpoint`, `errorEndpoint`, `reportEndpoint`, `checkoutEndpoint` | Prazni u `DEFAULT_PRODUCTION_CONFIG` (`src/ui/app.ts`) | Potvrđeno 28.7.; poznato i praćeno (`docs/PRE_LAUNCH.md` D, `docs/PRE_LAUNCH_CHECKLIST.md` sekcija 8) |
| `paymentProvider` u istom configu | **RIJEŠENO (28.7.)**: default promijenjen sa zastarjelog `'stripe'` na `'lemonsqueezy'` (uskladjeno s podatkom da je Lemon Squeezy stvarni MoR), na sva 3 mjesta gdje se defaultira (`DEFAULT_PRODUCTION_CONFIG`, `productionStatus()`, `openSetup()`). Napomena: `paymentProvider` nije bio mrtav kod kako je izvorno opisano, aktivno grana `buildPaymentUrl()` (Stripe vs Lemon Squeezy vs generic query params) za legacy `PACKAGES` rucni narudzbeni tok; taj tok ostaje izvan opsega ove izmjene (vidi BL-12/BL-13 za konsolidaciju/uklanjanje) | `src/ui/app.ts` |
| `repairEndpoint` | Aktivan (živi Supabase URL) | `src/ui/app.ts` |
| Production Edge deploy | **RIJEŠENO za obuhvaćene funkcije**: `source-check` v1, `send-reminders` v8 i `create-checkout` v8; smoke testovi: 200/401/401 | Production audit 4.8., PROD-01 do PROD-04 |
| Production migration schema | **DJELOMIČNO RIJEŠENO**: reminder schema je primijenjena kroz Supabase managed migration endpoint i potvrđena s pet markera; širi drift produkcijske baze i repozitorija ostaje PROD-05 | Production audit 4.8., PROD-03, PROD-05 |
| Rate limit na `repair-docx` | **RIJEŠENO (28.7.)**: file-size limit i dvostruki dnevni cap i dalje postoje, plus tri nova sloja: (1) kill switch `REPAIR_DISABLED` (isti obrazac kao `preflight-start`), (2) `ConcurrencyGate` best-effort limit paralelnih teskih zahtjeva PO IZOLATU (`REPAIR_MAX_CONCURRENT`, default 4, 503 `{error:'busy'}`; honestno dokumentirano da NIJE globalno atomican, isto ogranicenje kao vec postojeci per-user TOCTOU), (3) globalna dnevna storage-kvota (`REPAIR_STORAGE_DAILY_CAP`, default 500 `repair_jobs` redaka/24h) koja preskace pohranu (ne sam popravak) kad je dosegnuta, fail-open isto kao postojeci null-storage slucajevi. Odluke izdvojene u `src/report/repair-limits.ts` (ciste, jedinicno testirane: `tests/repair-limits.test.ts`), DB/env glue u `index.ts`. Provjereno `deno check` (0 novih gresaka naspram baselinea, 12 pred-postojecih DOM-tip gresaka iz `helpers.ts` nepromijenjeno) jer Supabase MCP i `tsc` scope ne pokrivaju ovaj direktorij | `supabase/functions/repair-docx/index.ts`, `src/report/repair-limits.ts` |
| `REPAIR_FREE_MODE` | Postoji kao flag, gate preskače naplatu ali čuva auth/consent/rate-limit; trenutni operativni mod (besplatna beta strategija) | `supabase/functions/repair-docx/index.ts`, `supabase/migrations/0029_repair_gen_status_free.sql`; stvarna vrijednost na živom Supabase projektu nije provjeriva iz repozitorija (dashboard postavka) |
| CI | 5 aktivnih workflowa: `check.yml` (gate na svaki push/PR + Playwright), `conformance.yml`, `docx-smoke.yml`, `security-audit.yml` (npm audit + gitleaks, i tjedni cron), `training-pipeline.yml` (manual) | `.github/workflows/*`; vanjski audit od 27.7. koji tvrdi da CI ne postoji je ZASTARIO (ili je testirao stariju živu deploy verziju) |
| Retencija, korisnički tekst | Dosljedan: "dok je ne obrišeš... kod prijave bez e-maila najviše 30 dana" na svim mjestima (`app.ts`, `src/legal/legal-content.ts`); server provodi (`cleanup-orphan-repairs`, `ANON_RETENTION_DAYS=30`) | Uskladeno od commita `71c8631` (19.7.), prije vanjskog audita 27.7. koji tvrdi suprotno, taj nalaz je ZASTARIO |
| Retencija za e-mail prijavljene korisnike | OTVORENO ("sada: neograničeno" po `docs/PRE_LAUNCH.md`) | |
| PITR i uptime monitor | Vlasnička radnja, status neizvjestan iz repozitorija | `docs/RUNBOOK_OPS.md` |
| Ugniježđeni git repo `lekta-pipeline/` (1,6GB) | ODLUKA (AUD-43/AUD-57), čeka izbor submodule/.gitignore/spajanje; trenutno stanje radnog stabla (28.7.) ponovno pokazuje `lekta-pipeline/` kao untracked, provjeri da odluka nije regresirala | `git status` |
| `debug.log` u working tree (28.7.) | Neobrisana skitnica datoteka, nisko prioritetno čišćenje | `git status` |
| `netlify-cli`/`supabase` teške dev-ovisnosti | ODLUKA (AUD-52), operativni/deploy rizik, namjerno nije uklonjeno | |
| Demo video 15,95MB u gitu | ODLUKA (AUD-53/AUD-12), čeka LFS/CDN izbor | |

---

## 10. Pravni i komercijalni blokatori

- **Pravni identitet prazan** (poglavlje 4). Blokira svaku naplatu.
- **Cjenovnik, rekoncilijacija (novo u ovom dokumentu)**: postoje DVA odvojena
  proizvoda s vlastitim cijenama, ne konflikt kako je prvotno izgledalo:
  - Automatski repair (`src/report/pricing.ts`, `PRICING_TIERS`): seminarski
    3,99 €, završni 5,99 €, diplomski 9,99 €, doktorski 24,99 €. Ovo se
    poklapa s `docs/GO_LIVE_REPAIR.md` i je BLIZU (ne identično) preporuci
    vanjskog audita od 27.7. (6,99/7,99/11,99/24,99 €). Starija tablica u
    `docs/MONETIZATION_AND_ANTI_ABUSE.md` (3/5/10/19 do 25 €) je nacrt,
    superseded je stvarnim `pricing.ts`.
  - Ručna ljudska usluga (`PACKAGES` u `src/ui/app.ts`, legacy Netlify
    obrazac): formatiranje 39 €, "Predaja bez panike" 69 €, premium 99 €.
    Zaseban `premium_human` proizvod u `src/catalog/products-catalog.ts` (49 €)
    preklapa se konceptno s ovim paketima; `LEKTA_IMPLEMENTATION_BACKLOG.md`
    (BL-12, BL-13) već identificira potrebu konsolidacije i uklanjanja starog
    obrasca. Ovo OSTAJE otvoreno, ali je poznat, praćen zadatak, ne novi nalaz.
  - Preporuka vanjskog audita da se automatska cijena testira agresivnije
    (osnivačka cijena, vremenski ograničena) je vrijedna razmatranja kad se
    naplata uključi, ali ne mijenja da je `pricing.ts` već razumno postavljen.
- **Ručna usluga nema operativni okvir**: opseg, rok, revizije, refund
  politika za PACKAGES (39/69/99 €) nisu dokumentirani nigdje u repozitoriju.
  Ovo JEST nov, konkretan gap koji je vanjski audit (poglavlje 8.5) točno
  pogodio; vrijedi riješiti prije nego se ta ponuda aktivno promovira.
- **Domena**: i dalje `lektahr.netlify.app`, blokira e-mail (Resend traži
  verificiranu domenu), i sputava SEO/brand autoritet. Poznato,
  `docs/PRE_LAUNCH.md` sekcija A.
- **Fiskalizacija/eRačun 2026.**: spomenuto u vanjskom auditu kao razlog za
  konzultaciju s računovođom prije prve žive naplate; nema internog traga da
  je ovo provjereno, treba dodati na `docs/GO_LIVE_NAPLATA.md` checklistu.

---

## 11. Vanjski marketinški/UX/go-live audit (27.7.2026.): rekoncilijacija

Vanjski audit (commit `deee9fde`, jedan dan prije ovog pregleda) dao je
vrijedan vanjski pogled, ali dio njegovih nalaza o STANJU KODA bio je
zastario već u trenutku pisanja (izgleda da je testiran stariji živi deploy,
ne sadržaj navedenog commita). Sažetak provjere svih njegovih 12 provjerljivih
tvrdnji o kodu:

| Tvrdnja vanjskog audita | Verdikt danas |
|---|---|
| Config prazan (checkout/analytics/error/report), `paymentProvider:'stripe'` | **TOČNO**, vidi poglavlje 9 |
| `data/legal/provider.json` prazan (OIB/adresa/voditelj obrade), Gmail kontakt | **TOČNO**, vidi poglavlje 4 |
| Automatska detekcija profila tiho odabire pogrešan/prvi studij | **TOČNO**, novi potvrđeni nalaz, vidi poglavlje 7 |
| AutoFix CTA treba drugi klik da otvori panel | **VIŠE NIJE TOČNO**, popravljeno commitom `576b87e` prije reviewanog commita |
| Retencija nedosljedna ("do brisanja" vs "30 dana") | **VIŠE NIJE TOČNO**, uskladeno od `71c8631` (19.7.), prije reviewanog commita |
| Nema CI-ja osim npm audit workflowa | **VIŠE NIJE TOČNO**, 5 aktivnih workflowa |
| Rate limit/file-size/concurrency/kill switch za repair nepotvrđeni | **DJELOMIČNO TOČNO**, vidi poglavlje 9 (2 od 5 mehanizama postoje) |
| "15 vs 14" broj problema neobjašnjen | **DJELOMIČNO TOČNO**, vidi poglavlje 7, uzrok djelomično popravljen, arhitekturni rizik ostaje |
| Sitemap `.html` vs extensionless nesklad | **NIJE REPRODUCIRANO**, sitemap i navigacija dosljedno koriste `.html` |
| `src/ui/app.ts` ~1300-1530 redaka, monolitan | **TOČNO**, danas 1613 redaka, poznat i praćen zadatak (CLAUDE.md backlog #3) |
| Ne postoji kanonski `GO_LIVE_STATUS.md` | **BILO TOČNO**, ovaj dokument je odgovor na taj nalaz |

### Što je vanjski audit donio NOVO i vrijedno (nije bilo u internim dokumentima)

1. **Konkretan popis analitičkih događaja** (`landing_view`,
   `analyzer_opened`, `upload_completed`, `profile_suggested`,
   `profile_changed`, `analysis_completed`, `result_viewed`,
   `repair_cta_clicked`, `repair_panel_viewed`, `server_consent_given`,
   `checkout_started`, `purchase_completed`, `repair_started/succeeded/failed`,
   `repaired_doc_downloaded`, `recheck_completed`, `support_opened`,
   `refund_requested`) s ciljanim pragovima konverzije po koraku. Interni
   dokumenti su prepoznali da analytics fali, ali nisu imali ovu razinu
   detalja. Preporuka: usvojiti ovaj popis kad se `analyticsEndpoint` ozici.
2. **SEO long-tail popis ključnih riječi** (margine diplomskog FPZG, rokovi
   obrane po fakultetu, "je li diplomski spreman za predaju", itd.) i
   koncept programatskih landing stranica po profilu
   (`/pravila/<fakultet>/<vrsta-rada>`). Nadopunjuje postojeći SEO backlog
   (BL-18) konkretnim primjerima.
3. **Ručna usluga, operativni okvir** (poglavlje 10 iznad), pogodio pravu
   rupu.
4. **Launch dashboard, jedna stranica metrika** za tjedan lansiranja
   (posjetitelji, otvoreni analizatori, uploadi, dovršene analize,
   promijenjeni auto-profili, verificirani vs generički profili, AutoFix
   klikovi, repair panel view, checkout start/success, prihod/AOV, repair
   success, download rate, refund rate, storage/function trošak). Korisna
   praktična lista za operativni sastanak, nema internog ekvivalenta.
5. **Tržišna veličina/ekonomika** (DZS 31.237 diplomiranih 2024., scenariji
   2/5/10% penetracije, Lemon Squeezy 5%+0,50€ naknada primijenjena na
   raspon cijena). Novi vanjski kontekst, ne postoji u internim dokumentima,
   koristan ulaz u odluku o cijeni.
6. **Pozicioniranje**: "hrvatski preflight za akademske radove" kao interni
   okvir kategorije. Komplementarno postojećem `docs/LEKTA_COMPETITIVE_POSITIONING.md`,
   ne proturječi mu.

### Već pokriveno u postojećem 90-dnevnom planu (ne duplicirati)

`docs/LEKTA_90_DAY_PLAN.md` (13.7.) je već postojeći tjedan-po-tjedan
launch plan vezan uz jesenski predajni val, s pragovima uspjeha i stop-loss
pravilima. `docs/LEKTA_PRODUCT_ROADMAP.md` i `docs/LEKTA_IMPLEMENTATION_BACKLOG.md`
su njegova strateška/taktička podloga, s AutoFix re-check petljom kao
najviše rangiranom stavkom (43/45 bodova u prioritizacijskoj matrici).
Vanjski audit predlaže sličan redoslijed (dokaži AutoFix, onda naplata) ali
BEZ znanja da ovaj plan postoji. Prije pokretanja bilo koje nove
"30-dnevne" inicijative iz vanjskog audita, provjeri poklapa li se s
postojećim planom umjesto da se paralelno izvodi.

---

## 12. Poznate namjerne odluke (BY-DESIGN, nisu bug)

- Hardkodiran javni anon ključ za Supabase u klijentskom configu (AUD-13):
  namjerno, anon ključ je dizajniran za javnu izloženost, RLS je stvarna
  granica.
- Teaser gate za integrity/preflight je prezentacijski, ne sigurnosni
  (AUD-16).
- `m4_corpus` (interni korpus podataka) već ispravno skriven iz javnog
  builda (AUD-37).
- `performance-05` (JSON stringify eksperiment): implementirano pa VRAĆENO
  jer je pogoršalo transfer za hrvatsku dijakritiku. Namjerna odluka, ne
  propust.
- `npm audit`: prihvaćeno stanje dev-only ranjivosti, vidi poglavlje 8.

## Odbačeni nalazi (verificirano kao NE-problem)

- AUD-21: RPC revoke `from public` bio dovoljan, nije bio problem.
- AUD-51: tvrdnja da je `NPM_AUDIT_ACCEPTED.md` zastario, odbačena nakon
  reverifikacije (brojke 20/1/1/14/4 su i dalje točne).
- `architecture-01` (10.7.): placeholder stub bez sadržaja, nema dokaziva
  nalaza.
- `seo-01` (10.7.): tvrdnja da je pogrešan origin "već utisnut u commitani
  dist" je osporena, `dist/` je u `.gitignore`, živi Netlify deploy dobiva
  ispravan origin preko env varijable; ostaje kao latentni footgun za build
  bez te varijable (npr. Cloudflare Pages), ne kao aktivna šteta.

---

## 13. Što ovaj dokument NE pokriva

Nepromijenjeno naspram svih prijašnjih audit rundi: Netlify/Supabase/Resend/
Lemon Squeezy administracijski dashboardi, produkcijske tajne, stvarni status
RLS-a/rate limita/kvota/backupa na živim projektima, knjigovodstvena/porezna
struktura, stvarni checkout tijek (endpoint prazan), mobilni fizički uređaji,
ponašanje popravljenog docx u desktop Wordu nakon deploya. Sve stavke koje
ovise o tome tretiraj kao "treba potvrditi", ne kao dokazano riješeno ili
dokazano nepostojeće.

---

## 14. Preporučeni sljedeći koraci

Redoslijed usklađen s postojećim `LEKTA_90_DAY_PLAN.md`, ne zamjenjuje ga.

**Novi production audit, prije šire beta upotrebe:**
- Deployati `source-check`, zatim redeployati `send-reminders` s cron tajnom i
   primijeniti migraciju 0036. Prije uključivanja naplate redeployati
   `create-checkout` i provjeriti serverski `tier_mismatch`.
- Uvesti deployment gate koji uspoređuje live Edge funkcije i migration history
   s repo verzijom. Trenutni `npm run check` ne može otkriti da je live funkcija
   starija ili da je live baza bez lokalne migracije.
- Odlučiti je li produkcijski Supabase namjerno dijeljen s drugim sustavom.
   Ako jest, dokumentirati vlasništvo i security boundary; ako nije, razdvojiti
   projekte prije naplate.

**Odmah, prije bilo kakvog šireg besplatnog puštanja:**
1. ~~Popraviti "Potvrda profila" nalaz~~ RIJEŠENO 28.7., vidi poglavlje 7.
2. ~~RESULT-02 i RESULT-05~~ RIJEŠENO 28.7., vidi poglavlje 6 (oboje su
   se pokazala vecim dijelom vec izgradjena u ranijem WIP-u, ostao je samo
   mali asimetrican gap na "zanemari" putanji, sad zatvoren).
3. ~~Ponovno testirati RESULT-03~~ RIJEŠENO 28.7., vidi poglavlje 6: nalaz→popravak
   korelacija (`matchKeys`/`pickTargetItem`) + honest fallback kad stavka ne postoji.
4. ~~Ukloniti `paymentProvider:'stripe'`~~ RIJEŠENO 28.7., vidi poglavlje 9
   (default promijenjen na `'lemonsqueezy'`; polje samo nije bilo mrtvo kako je opisano).

**Prije naplate (vlasnički, kod je spreman):**
5. Pravni identitet, `docs/GO_LIVE_NAPLATA.md`.
6. RE-06 profilna pokrivenost `autoFixable` pravila (najveći preostali
   Repair Engine zadatak, podatkovni; u tijeku, druga sesija).
7. ~~Concurrency limit i storage-quota/kill switch za `repair-docx`~~ RIJEŠENO
   28.7., vidi poglavlje 9.
8. `analyticsEndpoint`/`errorEndpoint` uz popis događaja iz poglavlja 11.1.

**Kad postoji kapacitet, niži prioritet:** RE-25/28/29/30, preostali
accessibility/SEO/performance P2/P3 (poglavlje 7), operativni okvir za
ručnu uslugu (poglavlje 10).

---

## 15. Zatvoreno, kompaktni povijesni zapisnik

Grupirano po auditnoj rundi radi sljedivosti; puni file:line dokazi su u
git povijesti obrisanih izvornih dokumenata (poglavlje 16).

- **10 do 12.7.2026.** (9-dimenzijski audit: architecture, data-flow,
  routes, dependencies, security, ux, accessibility, seo, performance,
  sintetiziran u `LAUNCH_BLOCKERS.md` P0-01..07, izvršen kroz
  `PRODUCTION_BACKLOG.md`, verificiran u `AUDIT_STATUS_2026-07-11.md`):
  gotovo sve P0/P1/P2/P3 stavke GOTOVO. Ostaci: seo-01 origin footgun
  (djelomično), routes/seo P2/P3 higijena (djelomično), vidi poglavlje 7.
- **14.7.2026.** (`SECURITY_AUDIT.md` root, LEKTA-SEC-01..07): svih 7
  RIJEŠENO ili DJELOMIČNO, vidi poglavlje 8.
- **16.7.2026.** (`AUDIT_2026-07-16/`, 62 nalaza AUD-01..64, 12 findera + 5
  adversarijalnih verifiera): 50+ nalaza RIJEŠENO kroz 8 remedijacijskih
  batcheva (`REMEDIATION_LOG.md`), uklj. oba High nalaza (AUD-17 kolizija
  migracija 0008/0009, AUD-38 OOM DoS preko footnotes/endnotes). Preostalo:
  AUD-52 (netlify-cli/supabase devDeps), AUD-53/AUD-12 (demo video), AUD-43/
  AUD-57 (ugniježđeni `lekta-pipeline/` repo), sve ODLUKA (vlasnička), vidi
  poglavlje 9.
- **23.7.2026.** (Result Experience audit): djelomično adresirano
  commitom `ff660d7` (25.7.), vidi poglavlje 6.
- **24.7.2026.** (Bundle lazy-load plan): djelomično izvršeno, vidi
  poglavlje 7.
- **25. do 28.7.2026.** (Repair Engine adversarijalni audit + izvršenje):
  oba P0 i gotovo svi P1 RIJEŠENI kroz 20+ commitova, vidi poglavlje 5.
  Ovo je najveći pojedinačni remedijacijski poduhvat u povijesti projekta.
- **27.7.2026.** (Vanjski marketinški/UX/go-live audit): rekoncilirano u
  poglavlju 11.

---

## 16. Izvori spojeni u ovaj dokument (obrisani, puni tekst u git povijesti)

```
docs/AUDIT_REPAIR_ENGINE_2026-07-25.md
docs/AUDIT_REPAIR_ENGINE_PROMPT.md
docs/LEKTA_CURRENT_STATE_AUDIT.md
docs/PLAN_REPAIR_REMEDIATION_2026-07-25.md
docs/audit/ACCESSIBILITY_AUDIT.md
docs/audit/AUDIT_BRIEF.md
docs/audit/AUDIT_STATUS_2026-07-11.md
docs/audit/CURRENT_ARCHITECTURE.md
docs/audit/DATA_FLOW.md
docs/audit/LAUNCH_BLOCKERS.md
docs/audit/NPM_AUDIT_ACCEPTED.md
docs/audit/PERFORMANCE_AUDIT.md
docs/audit/PERFORMANCE_OPTIMIZATION_PLAN_2026-07-24.md
docs/audit/RESULT_EXPERIENCE_AUDIT_2026-07-23.md
docs/audit/ROUTE_INVENTORY.md
docs/audit/SECURITY_AUDIT.md
docs/audit/SEO_AUDIT.md
docs/audit/THIRD_PARTY_DEPENDENCIES.md
docs/audit/UX_AUDIT.md
docs/audit/AUDIT_2026-07-16/00_SCOPE.md
docs/audit/AUDIT_2026-07-16/01_EXECUTIVE_SUMMARY.md
docs/audit/AUDIT_2026-07-16/02_FINDINGS.md
docs/audit/AUDIT_2026-07-16/10_CODE_TS.md
docs/audit/AUDIT_2026-07-16/11_SECURITY.md
docs/audit/AUDIT_2026-07-16/12_SUPABASE.md
docs/audit/AUDIT_2026-07-16/13_PIPELINE_PY.md
docs/audit/AUDIT_2026-07-16/14_DATA.md
docs/audit/AUDIT_2026-07-16/15_TESTS_CI.md
docs/audit/AUDIT_2026-07-16/16_DOCS_HYGIENE.md
docs/audit/AUDIT_2026-07-16/17_DEPS_PERF.md
docs/audit/AUDIT_2026-07-16/README.md
docs/audit/AUDIT_2026-07-16/REMEDIATION_LOG.md
SECURITY_AUDIT.md
SECURITY_REMEDIATION_PLAN.md
SECURITY_TEST_PLAN.md
THREAT_MODEL.md
```

Prilog A (skraćena metodologija sigurnosnog testiranja iz obrisanog
`SECURITY_TEST_PLAN.md`, zadrži se za buduće runde): staging projekt +
sintetički računi + canary tekst `LEKTA-AUDIT-CANARY-2026`, nikad stvarni
radovi. Automatizirane provjere: RLS po tablici (anon/vlasnik/drugi
korisnik), izvještaj s promijenjenim `slotId`/`userId`/entitlementom
(očekuje 401/403/402), webhook loš potpis/replay/paralelni isti order, OTP
limit, preflight privola/replay/malformed DOCX (magic/DTD/entity/zip bomba),
integrity paralelni teaser+full, retencija canary teksta nakon roka,
lokalnost (instrumentirani fetch/XHR/beacon/WebSocket), XSS payload u
nazivu/profilu/bibliografiji, HTTP security headeri. Ručna provjera:
Supabase RLS/Storage/tajne, Auth redirect/SMTP/rate-limit/CAPTCHA, cron
izvršenja, Netlify deploy postavke, Lemon Squeezy test event.

Prilog B (skraćen threat model iz obrisanog `THREAT_MODEL.md`): granice
sustava su (1) neprijavljeni korisnik → Netlify statička app → lokalni
parser/Worker, (2) prijavljeni korisnik+JWT → Supabase Edge → Auth/Postgres/
RLS → Lemon Squeezy/Resend, (3) preflight uz posebnu privolu → HMAC
propusnica → Python/Cloud Run → Supabase+bibliografski API-ji, (4) integrity
uz posebnu privolu → Integrity Edge → embedding/AI provider. Najosjetljivija
imovina: DOCX/PDF radovi i puni tekst integrity provjere (vrlo visoka
povjerljivost), JWT/webhook/HMAC/service-role tajne (vrlo visoka
povjerljivost i integritet). 5 obveznih produkcijskih dokaza prije
lansiranja: (1) screenshot/API dokaz RLS+Auth redirect+SMTP+CAPTCHA+rate
limit, (2) dokaz da pg_cron purge/reminder jobovi rade s alertom na
preskok, (3) staging test s dva računa da se ne može čitati/mijenjati/
brisati tuđe, (4) mrežni canary test da lokalni DOCX ne napušta preglednik
bez preflight privole, (5) opterećenje unutar sigurnih granica za
preflight/integrity.
