# Dokumentacija i higijena (D12)

Konzistentnost i svjezina dokumentacije: mojibake, duplikati, nedostatak README, zastarjele tvrdnje.

Nalaza u ovoj skupini: 9.

### AUD-57 — lekta-pipeline/ je ugnijezdjeni git repozitorij (vlastiti .git), untracked i nije ni submodule ni u .gitignore

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **CONFIRMED**
- Lokacija: `lekta-pipeline/.git/HEAD:0`
- Dokaz: Postoji `lekta-pipeline/.git/HEAD` (vlastiti repo). Git status ga prikazuje kao `?? lekta-pipeline/` (untracked). Root `.gitignore` (redovi 1-28) ne sadrzi `lekta-pipeline/`. Istovremeno je taj Python servis nosivi dio proizvoda (SECURITY_AUDIT.md ga vise puta citira: `lekta-pipeline/lekta_pipeline/server/app.py`, `docx_loader.py`).
- Reprodukcija: `git add -A` u rootu bi za lekta-pipeline/ stvorio embedded-repo gitlink (git ispisuje 'warning: adding embedded git repository') umjesto da prati sadrzaj; klon glavnog repoa taj poddirektorij ne bi dobio, a CI koji ga ocekuje bi pao.
- Preporuka: Odluci namjeru: ili registriraj kao pravi `git submodule add`, ili spoji u glavni repo (obrisi ugnijezdjeni .git i commitaj sadrzaj), ili ga eksplicitno dodaj u .gitignore ako je namjerno izvan verzioniranja. Nemoj ga ostaviti kao untracked embedded repo.
- Verifikacija: Potvrdjeno (uska varijanta AUD-43): lekta-pipeline/.git/ postoji (vlastiti repo), git status '?? lekta-pipeline/', root .gitignore ne sadrzi 'lekta-pipeline/'. 'git add -A' bi stvorio embedded-repo gitlink umjesto pracenja sadrzaja; klon ga ne bi dobio. Realan supply/build footgun.

### AUD-56 — CLAUDE.md (kanonski operativni vodic) je cijeli dvostruko-kodirani UTF-8 mojibake, a krsi i vlastito pravilo o crticama

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `CLAUDE.md:3`
- Dokaz: Red 1 `# CLAUDE.md â ThesisReady`; red 3 `Operativni vodiÄ za rad... ProÄitaj prije bilo kakve izmjene`; red 5 `## Å to je ovo`; red 9 `sluÅ¾benim profilima`, `ne Å¡alje na posluÅ¾itelj`. Klasican double-encoded UTF-8 (č->Ä, ž->Å¾, Š->Å ). Ironicno: BOOTSTRAP.md sam upozorava da je 'kopija u ovom repou mojibake', a CLAUDE.md to i jest.
- Reprodukcija: Otvori CLAUDE.md u UTF-8 pregledniku: `â`, `Ä`, `Å¾`, `Å ` umjesto `-`, `č/ć`, `ž`, `Š`. Isti mojibake u docs/PRE_LAUNCH_CHECKLIST.md (red 1 `# Lekta Â· Pre-launch checklist`, red 6 `preporuÄeno`, red 14 `entitlement â puni izvjeÅ¡taj`). AGENTS.md je za razliku od CLAUDE.md cist (obican `-`), pa dvije datoteke koje bi po CLAUDE.md:141 morale biti u sinkronu vizualno divergiraju.
- Preporuka: Ponovno kodiraj CLAUDE.md i docs/PRE_LAUNCH_CHECKLIST.md iz double-encoded (CP1252->UTF-8) natrag u cist UTF-8; zamijeni sve `â` znakom `-` ili `:` prema vlastitom pravilu 'bez em i en crtica' (CLAUDE.md:122). Dodaj .gitattributes s `*.md text` i CI provjeru koja odbija bajtove sekvence tipicne za mojibake.
- Verifikacija: CLAUDE.md:1 'M-CM-" ThesisReady' (cat -v) = dvostruko-kodirani em-dash; AGENTS.md:1 cist '- '. PRE_LAUNCH_CHECKLIST.md:13 'oznaÄeni' takodjer mojibake. Kanonski vodic je necitljiv i divergira od AGENTS.md koji bi po CLAUDE.md morao biti u sinkronu. Potvrdjeno, ali kozmeticki utjecaj -> Low.

### AUD-58 — Dvije razlicite datoteke SECURITY_AUDIT.md s razlicitim datumima, shemama ID-eva nalaza i zakljuccima, bez uzajamne reference

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `SECURITY_AUDIT.md:3`
- Dokaz: Root `SECURITY_AUDIT.md:3` 'Datum: 14. srpnja 2026.', ocjena 58/100, nalazi `LEKTA-SEC-01..07`, presuda NO-GO. `docs/audit/SECURITY_AUDIT.md:3` 'Datum: 2026-07-10', nalazi `security-01..06`, zakljucak da je jedini stvarni jaz `send-reminders`. Root verzija referira samo SECURITY_REMEDIATION_PLAN.md, nijedan od dva audita ne spominje onaj drugi.
- Reprodukcija: Citatelj koji trazi 'sigurnosni audit' nalazi dvije datoteke istog imena u razlicitim direktorijima s nekompatibilnim numeriranjem nalaza (LEKTA-SEC-0x vs security-0x) i razlicitim presudama; nema oznake koji supersedira koji. Root set (SECURITY_AUDIT/REMEDIATION_PLAN/TEST_PLAN + THREAT_MODEL) je jos i untracked (novi od 14.7.).
- Preporuka: Zadrzi jedan autoritativni audit. Ako root (14.7.) supersedira docs/audit (10.7.), premjesti ga u docs/audit/ pod verzioniranim imenom (npr. SECURITY_AUDIT_2026-07-14.md), a stari oznaci kao superseded s poveznicom. Commitaj ili ukloni untracked root .md set; ne ostavljaj dva 'SECURITY_AUDIT.md'.
- Verifikacija: Root SECURITY_AUDIT.md:3 'Datum: 14. srpnja 2026.' (nalazi LEKTA-SEC-0x per opis). docs/audit/SECURITY_AUDIT.md:3 'Datum: 2026-07-10', nacin READ ONLY, nalazi security-0x. Dvije istoimene datoteke, nekompatibilne sheme ID-eva, bez uzajamne reference; root set untracked. Potvrdjeno, ali doc-hygiene -> Low.

### AUD-59 — BOOTSTRAP.md opisuje zavrsenu/zastarjelu bootstrap fazu i upucuje na jos zivu destruktivnu `npm run bootstrap` koja bi pregazila trenutni split

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `BOOTSTRAP.md:28`
- Dokaz: BOOTSTRAP.md:28 'To izvuce inline <script> u src/main.ts (s // @ts-nocheck)'; :30 'src/main.ts i index.html su time GENERIRANI artefakti iz prototipa'; :51-55 'Dalje' navodi kao buducnost data extraction, Option A migraciju i skidanje @ts-nocheck. U stvarnosti je src/main.ts rucno odrzavan tanki bootstrap od 11 redaka (`import './ui/app'` itd.), src/ je potpuno splitan i bez ijedne @ts-nocheck direktive (backlog 3 GOTOVO).
- Reprodukcija: Skripta i dalje postoji: package.json:8 `"bootstrap": "node scripts/split-prototype.mjs"`, scripts/split-prototype.mjs i reference/Lekta_v2_2_2_...html postoje. Pokretanje `npm run bootstrap` prema uputi regeneriralo bi src/main.ts i index.html iz prototipa i pregazilo trenutnu modularnu arhitekturu (11-redni main.ts -> @ts-nocheck monolit).
- Preporuka: Oznaci BOOTSTRAP.md kao povijesni/arhivski (npr. docs/history/) ili prepisi da odrazava zavrsen split; jasno upozori da su src/main.ts i index.html sada rucno odrzavani, a `npm run bootstrap` zastario/opasan. Razmisli o uklanjanju scripta bootstrap iz package.json ili guardu koji odbija regeneraciju preko postojeceg splita.
- Verifikacija: BOOTSTRAP.md:28-30 tvrdi da su main.ts (s @ts-nocheck) i index.html generirani; :51-55 navodi Option A/golden/skidanje @ts-nocheck kao BUDUCNOST. Stvarnost: src/main.ts je 10 redaka rucni bootstrap bez @ts-nocheck; sve navedeno je GOTOVO. Skripta 'npm run bootstrap' (package.json:8 -> scripts/split-prototype.mjs) jos postoji i pregazila bi split. Zavaravajuce + live destruktivno, ali zahtijeva namjernu radnju -> Low.

### AUD-60 — GOLDEN.md sadrzi cirilicne homoglife usred hrvatske rijeci ('zatecено')

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `docs/GOLDEN.md:5`
- Dokaz: Red 4-5: '...koji PRVO dokazuje zatecено ponasanje.' Rijec je 'zatec' (latinica) + 'ено' (cirilica: е U+0435, н U+043D, о U+043E) umjesto latinicnog 'zateceno'.
- Reprodukcija: grep/pretraga za 'zateceno' ne pronalazi ovaj citat jer su tri zavrsna slova cirilicna; kopiranje rijeci daje mijesani Unicode string.
- Preporuka: Zamijeni cirilicne е/н/о latinicnim e/n/o -> 'zateceno'. Dodaj lint (npr. provjera da .md ne mijesa cirilicu i latinicu unutar rijeci) da uhvati homoglife.
- Verifikacija: docs/GOLDEN.md:5 (cat -v) 'zatecM-PM-5M-PM-=M-PM->' = latinicno 'zatec' + cirilicni е(U+0435) н(U+043D) о(U+043E), UTF-8 D0B5/D0BD/D0BE. Homoglifi usred hrvatske rijeci; pretraga 'zateceno' promasuje. Potvrdjeno.

### AUD-61 — Repozitorij nema korijenski README.md; de-facto ulazna tocka je agentu namijenjen (i mojibake) CLAUDE.md

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `README.md:0`
- Dokaz: U rootu postoje AGENTS.md, BOOTSTRAP.md, CLAUDE.md, SECURITY_AUDIT.md, SECURITY_REMEDIATION_PLAN.md, SECURITY_TEST_PLAN.md, THREAT_MODEL.md, ali nema README.md. Jedini opisni ulaz je CLAUDE.md (namijenjen agentima) i zastarjeli BOOTSTRAP.md.
- Reprodukcija: Otvaranje repoa (ili GitHub landing) ne prikazuje pregledni README; novi suradnik nema kanonski 'sto je ovo / kako pokrenuti' ulaz osim mojibake CLAUDE.md.
- Preporuka: Dodaj kratki korijenski README.md (opis proizvoda, stack, `npm install`/`npm run dev`/`npm run check`, poveznice na CLAUDE.md, AGENTS.md, docs/**). Moze biti tanak i upucivati na docs/VISION.md.
- Verifikacija: 'ls README.md' -> No such file. U rootu su AGENTS/BOOTSTRAP/CLAUDE/SECURITY_* .md, ali nema README. Jedini opisni ulaz je (mojibake) CLAUDE.md namijenjen agentima. Potvrdjeno, Low.

### AUD-62 — CLAUDE.md navodi zastarjelu velicinu src/ui/app.ts (~517 redaka) dok je stvarno 762

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `CLAUDE.md:30`
- Dokaz: CLAUDE.md:30 'src/ui/app.ts je UI orkestrator (~517 redaka, tipiziran, VISE NIJE @ts-nocheck)'. Stvarni `wc -l src/ui/app.ts` = 762 redaka (~48% vise). CLAUDE.md:92 jos navodi 'Meta: dovrsiti split.'
- Reprodukcija: Prebroj retke src/ui/app.ts: 762, ne ~517.
- Preporuka: Azuriraj brojku (ili je izbaci; tvrde brojke redaka brzo zastare). Ako je split zavrsen, ukloni 'Meta: dovrsiti split.'; ako nije, opisi preostali dio.
- Verifikacija: CLAUDE.md:30 '~517 redaka' i :92 'Meta: dovrsiti split.' Stvarni 'wc -l src/ui/app.ts' = 771 (finder rekao 762 - njegov broj neznatno netocan, moj je 771; oba dokazuju da je ~517 zastario). Doc drift potvrdjen.

### AUD-63 — Vise preklapajucih launch/gate dokumenata s razlicitim shemama P0, bez jednog izvora istine

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `docs/PRE_LAUNCH_CHECKLIST.md:11`
- Dokaz: docs/PRE_LAUNCH_CHECKLIST.md:11-13 ima vlastiti 'Launch gate' i 'P0 iz sekcija 1 do 7'. docs/audit/LAUNCH_BLOCKERS.md koristi 'P0-01..07'. docs/roadmap/LAUNCH_CHECKLIST.md pokriva 'co-pilot luk' i referira LAUNCH_BLOCKERS + PRODUCTION_BACKLOG. PRE_LAUNCH_CHECKLIST.md ne referira ni jedan od druga dva.
- Reprodukcija: Tri dokumenta koja svi tvrde da definiraju 'sto blokira launch' s razlicitim numeriranjem P0; citatelj ne moze utvrditi koji je mjerodavan gate.
- Preporuka: Odredi jedan mjerodavni launch-gate dokument i neka ostali eksplicitno upucuju na njega (kao sto roadmap/LAUNCH_CHECKLIST vec radi). Uskladi numeriranje P0 ili u svakom dokumentu jasno ogranici opseg (npr. 'samo co-pilot dodaci').
- Verifikacija: docs/PRE_LAUNCH_CHECKLIST.md:5,11-13 vlastiti 'Launch gate' i 'P0 iz sekcija 1 do 7' bez reference na druge. docs/audit/LAUNCH_BLOCKERS.md:30-32 'P0-01..07'. docs/roadmap/LAUNCH_CHECKLIST.md:6-7 referira LAUNCH_BLOCKERS+PRODUCTION_BACKLOG. Tri preklapajuca dokumenta, razlicito numeriranje; PRE_LAUNCH ne referira druge. Potvrdjeno (djelomicni cross-ref postoji u roadmapu) -> Low.

### AUD-64 — K4/K5 repair fixeri: nekonzistentnost izmedju commit-povijesti, radnog stabla i statusa u LEKTA_BUILD_PIPELINE.md

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `docs/LEKTA_BUILD_PIPELINE.md:106`
- Dokaz: Git log ima `21fd329 feat(repair): K4 pgNumType fixer` i `c9f2a3b feat(repair): K5 footer PAGE polje`, ali radno stablo revertira oboje (M src/repair/fixers.ts bez ijedne pgNumType/footer funkcije, D src/repair/page-numbering.test.ts, D src/repair/footer-page.test.ts). Istovremeno LEKTA_BUILD_PIPELINE.md:106 (K4) i :117 (K5) jos nose 'Status: CEKA'.
- Reprodukcija: grep pgNumType|footer u src/repair/fixers.ts = 0 pogodaka, iako su K4/K5 feat commitovi u povijesti; pipeline doc status 'CEKA' ne odrazava taj lifecycle (implementirano pa revertirano u tree).
- Preporuka: Odluci sudbinu K4/K5 (dovrsiti revert i commitati ga s objasnjenjem, ili vratiti fixere) i uskladi status u LEKTA_BUILD_PIPELINE.md tako da odrazava stvarno stanje koda, a ne zastarjeli 'CEKA'.
- Verifikacija: git log ima 21fd329 (K4 pgNumType) i c9f2a3b (K5 footer); radno stablo revertira: 'M src/repair/fixers.ts' s grep pgNumType/footer = 0, 'D page-numbering.test.ts', 'D footer-page.test.ts'. LEKTA_BUILD_PIPELINE.md:106 (K4) i :117 (K5) jos nose 'Status: CEKA', ne odrazavajuci implementiran-pa-revertiran lifecycle. Potvrdjeno, Info.

