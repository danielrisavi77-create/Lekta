# Plan popravaka Repair Enginea (iz audita 2026-07-25)

Prati [AUDIT_REPAIR_ENGINE_2026-07-25.md](AUDIT_REPAIR_ENGINE_2026-07-25.md). Svaki zadatak nosi
RE-ID iz audita. Cilj plana: redoslijed koji maksimizira ucinak na korisnika uz minimalan rizik od
regresije, s tvrdim golden gateom na svakom koraku.

## Nacela (vrijede za SVAKI zadatak)

1. **Golden prvi.** xml-patch.ts, fixers.ts, run-level.ts, paragraph-cleanup.ts i heading-case.ts su
   zasticeni sloj (CLAUDE.md). Prije izmjene: snimi golden baseline (`npm test -- -u`), pa NAPISI test
   koji dokazuje ZATECENO (krivo) ponasanje, tek onda mijenjaj. Nakon izmjene golden netaknutih
   putanja mora ostati bit-identican; novi test prelazi iz crvenog u zeleni.
2. **Jedan nalaz = jedan commit, svaki zelen.** Definition of Done svakog koraka: `npm run check`
   zelen (tsc + vitest + vite build). Ne commitaj crveno.
3. **Bez sirenja opsega.** Ne izmisljaj pravila (bodovana pravila samo iz sluzbenih izvora). Fix
   rjesava tocno nalaz, ne "usput jos i...".
4. **Codex drugo misljenje** (`/codex:review`) prije commita netrivijalnih izmjena parsera/patchera;
   `/codex:adversarial-review` za monetizacijske i XML-korupcijske fixeve.
5. **Redoslijed unutar faze slobodan; faze idu redom** jer kasnije faze ovise o test-mrezi i
   zajednickim primitivima iz ranijih.

## Zajednicki primitivi (napravi jednom, koristi vise puta)

Vise nalaza dijeli isti korijen. Rijesi primitiv, pa ga uvezi, umjesto N zakrpa:

- **P-A: `resolveDefaultParagraphStyleId(stylesXml)`** (novo, xml-patch.ts). Vrati styleId stila s
  `w:default="1"` type=paragraph, pa fallback "Normal", pa `findStyleByIdOrName` po imenu. Koriste ga
  patchDefaultSpacing / patchDefaultParagraphSpacing / patchDefaultAlignment / patchDefaultFont korak
  3. Rjesava RE-03, sudjeluje u RE-21/RE-08. **Ovo je najvazniji primitiv.**
- **P-B: self-closing alternacija u regexima** (RE-24). maskElement, findStyleBlock,
  findStyleByIdOrName petlja, korak-2 heading regex i korak-3 Normal rPr match prosiri sa
  `<tag\b[^>]*/>|<tag\b[^>]*>[\s\S]*?</tag>`. Foundacijski, ide PRIJE ostalih xml-patch fixeva.
- **P-C: upsert u OTVARAJUCI tag** (RE-02). upsertChild grana "dodaj atribut koji fali" mora ciljati
  otvarajuci tag, ne kraj cijelog elementa. Foundacijski.
- **P-D: `FORBIDDEN_CONTENT` prosirenje** (RE-01, RE-11, RE-12, RE-13). Jedan regex + jedan pPr-guard
  pokriva jednadzbe, tracked-changes, comment-range markere, leader-tab, pBdr/shd/numPr.
- **P-E: `FixerOutput.reason`** (RE-36, RE-41). Dodaj polje razloga ('already-ok' | 'no-target' |
  'unsupported-structure' | 'invalid-params') u FixerOutput i ApplyFixersResult.skipped; omogucuje
  postene UI poruke bez jos jedne runde pogadanja.
- **P-F: in-flight guard** (RE-20). Jedan obrazac (disable-first + zastavica) za oba gumba serverskog
  panela.

---

## Faza 0: Test-mreza (preduvjet za sve ostalo)

**Cilj:** golden gate mora STVARNO pokrivati fixere koje cemo mijenjati; danas 4 od 16 ne pokriva.

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 0.1 | RE-29 | tests/repair-golden.test.ts | Dopuni SYNTHETIC_PARAMS/paramsForFixer za empty-paragraph, heading-format, footnote-typography, heading-case; regeneriraj snapshot. Sad su ta 4 fixera u golden matrici. | M |
| 0.2 | RE-43 | tests/ (novi) | check-fixer-map tripwire: analiziraj sinteticki docx, assertaj da je SVAKI naslov iz CHECK_TITLES prisutan u result.checks[].title (spreci tihi drift mape). | S |
| 0.3 | - | tests/fixtures/docx/ | Dodaj 2-3 realne fixture koje motor danas lose obraduje: LibreOffice izlaz (stil "Standard"), hrvatski Word (stil "Naslov1"), rad s formulama. Snimi baseline. Ovo su regresijski svjedoci za Fazu 2. | M |

**DoD:** golden suite aktivan za svih 16 fixera, tripwire zelen, nove fixture commitane. Bez ovoga
Faza 2 nema mrezu.

## Faza 1: Zaustavi gubitak podataka i korupciju (P0 + sigurnost brisanja)

**Cilj:** nijedan popravak vise ne smije trajno unistiti sadrzaj. Male, izolirane, visoke ozbiljnosti.

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 1.1 | RE-01 | paragraph-cleanup.ts | P-D: diskvalificiraj odlomak s `<m:oMath`/`<m:oMathPara` (jednadzba). P0 gubitak. | S |
| 1.2 | RE-12 | paragraph-cleanup.ts | P-D: dodaj w:del/w:ins/w:delText/w:moveFrom*/w:moveTo*/commentRangeStart/End u FORBIDDEN_CONTENT (tracked-changes, komentari). | S |
| 1.3 | RE-11 | paragraph-cleanup.ts | Diskvalificiraj prazan odlomak s `<w:pBdr`/`<w:shd` (fill!=auto)/`<w:numPr` u pPr (potpisne linije, oznake). | S |
| 1.4 | RE-13 | paragraph-cleanup.ts | P-D: dodaj w:tab (ili samo uz w:leader) u FORBIDDEN_CONTENT. | S |
| 1.5 | RE-14 | paragraph-cleanup.ts | Front-matter granica: zahtijevaj znamenku ((?:Heading|Naslov)[1-9]) kao parser.ts; preskoci matcheve u tablici/sdt (naslovnica se ne smije zbiti). | M |
| 1.6 | RE-02 | xml-patch.ts | P-C: upsertChild umece atribut u otvarajuci tag (upareni prazni element vise ne daje malformiran XML). | S |
| 1.7 | RE-09 | heading-case.ts | toCroatianUpper cuva hex reference `&#x[0-9a-fA-F]+;` (vise ne pise `&#X...`). | S |
| 1.8 | RE-10 | heading-case.ts | Ukloni `<w:pPrChange>` prije matchanja pStyle (demotiran naslov u track-changes nije naslov). | S |

**DoD:** golden netaknut za dobre putanje, svaki novi test (jednadzba/tracked/pBdr/tab/naslovnica/
upareni-prazni/hex/pPrChange prezive) zelen, `npm run check` zelen. Preporuka: `/codex:adversarial-review`
za 1.6 (XML korupcija).

## Faza 2: Neka STVARNO radi (razrjesavanje stilova, najveci payoff)

**Cilj:** ukloniti glavni uzrok dojma "ne radi" na LibreOffice/Google Docs/hrvatskom Wordu. Najveci
lift, najveci rizik (xml-patch.ts), zato tek nakon Faze 0.

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 2.1 | RE-24 | xml-patch.ts | **P-B** self-closing alternacija (foundacija: duplikat pPr i krivi-stil nestaju). Ide PRVI u fazi. | M |
| 2.2 | RE-23 | xml-patch.ts | withContainer podrzava self-closing RODITELJA; nikad changed:true bez stvarne izmjene (lazni "applied" + deep regresija fonta). | M |
| 2.3 | RE-22 | xml-patch.ts | patchDefaultFont korak 3 na withContainer('w:rPr', CT_STYLE_ORDER, ['w:pPr','w:rPr']) obrazac (font se upisuje UNUTAR rPr, ne pogada pPr>rPr). | M |
| 2.4 | RE-03 | xml-patch.ts, fixers.ts | **P-A** resolveDefaultParagraphStyleId: patchDefaultSpacing/ParagraphSpacing/Alignment i font korak 3 rade nad stvarnim default stilom (Standard/vlastiti), ne literalnim "Normal". **Kljucni korak.** | M |
| 2.5 | RE-21 | fixers.ts, xml-patch.ts | patchFootnoteTextSpacing na findStyleByIdOrName (razmak fusnota radi na lokaliziranom stilu, kao tipografija). | S |
| 2.6 | RE-08 | heading-case.ts, repair-items | upperCaseHeadings prima stylesXml i prepoznaje naslove po id-ili-imenu i outlineLvl (velika slova rade na "Naslov1"). | M |
| 2.7 | RE-07 | xml-patch.ts | patchFooterPageAlignment upsert w:jc u PAGE odlomak (Word izostavlja jc za lijevo); nastavi na sljedeci PAGE odlomak parta. | S |
| 2.8 | RE-16 | run-level.ts, repair-panel.ts | Inline sdt maskirati (cistiti ostatak odlomka) ILI barem brojati preskocene + dopuniti disclosure copy. | M |
| 2.9 | RE-15 | run-level.ts | Deep ne dira prored/razmak odlomaka s w:ind uvlakom >= praga (ne kvari blok-citate). | M |

**DoD:** fixture iz 0.3 (LibreOffice/hrvatski Word) sada PROLAZE prored/poravnanje/razmak/velika slova;
golden netaknut za postojece; Word matrica (scripts/word-verify) rucno potvrdi grf preskok rijesen.
`/codex:adversarial-review` za 2.1-2.4. Ovo je faza koja mijenja korisnicki dojam.

## Faza 3: Prestani sam sebi stvarati stetu i mrtve puteve

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 3.1 | RE-04 | repair-items.ts | Gate pageNumberAlignment na truthy (string "right" iz data/); string -> params.align. Ozivljava mrtav put. | S |
| 3.2 | RE-05 | repair-items.ts | introSectionItem izvede align iz profila (pageNumberAlignment "right" -> "right"); popravak vise ne unosi novi prekrsaj. | S |
| 3.3 | RE-27 | apply-fixers.ts | Validiraj skalarne parametre (Number.isFinite, whitelist val) -> NO-OP; nema vise `w:w="NaN"`. | S |
| 3.4 | RE-26 | apply-fixers.ts | try/catch po zahtjevu: fixer koji baci se preskoci (skipped), baterija nastavlja; kraj laznog 422 "invalid_docx". | S |
| 3.5 | RE-30 | xml-patch.ts | (PLAUSIBLE) Maskiraj komentare/CDATA/PI i preskoci pPrChange prije sectPr enumeracije. Potvrdi realni lanac prije diranja. | M |

**DoD:** repair-items.test dobiva profil u STVARNOM obliku iz data/ (string "right"); apply-fixers.test
dokazuje da baterija prezivi fixer koji baci i params {}. `npm run check` zelen.

## Faza 4: Server i naplata (pravi novac, zaseban rizik)

**Cilj:** zatvoriti monetizacijske rupe i dvostruke potrosnje. Odvojeno jer dira Edge + migracije.

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 4.1 | RE-17 | repair-docx/index.ts (+migracija) | Slot trositi TEK nakon uspjeha s changelog>0, ili refund RPC pri 422/nula-izmjeni. | M |
| 4.2 | RE-18 | repair-docx/index.ts | Otisak derivirati iz UPLOADANOG docx-a na Edge (ili provjeriti podudarnost s meta); jedan slot vise ne popravlja bilo koju datoteku. | M |
| 4.3 | RE-20 | app.ts, P-F | Disable-first + in-flight guard za "Popravi sve" i "Nastavi svejedno" (nema dvostrukog uploada/slota). | S |
| 4.4 | RE-19 | app.ts | Serverski panel prikaze potvrdni korak za requiresConfirmation stavke prije slanja (kao lokalni). | S |
| 4.5 | RE-32 | app.ts, repair-docx | changelog:[] -> ne "Popravljeno", ne trosi free slot, ne pohranjuje posao. | M |
| 4.6 | RE-33 | repair-docx/index.ts, repair-client.ts, app.ts | 429 nosi reason; poruka ne spominje "besplatne" u placenom/IP-cap slucaju. | S |

**DoD:** `/codex:adversarial-review` obavezan (novac). Serverski put dobiva PRVE testove (danas 0):
dva klika = jedan upload; nula-izmjena ne trosi slot; slot se vraca pri padu. Migracije prate
0026+ numeriranje. Pazi na golden: server dijeli src/repair pa izmjene src/ ne smiju pasti golden.

## Faza 5: Postena povratna informacija i UX (jeftini, veliki dojam)

**Cilj:** ukloniti "izgleda kao kvar" bez diranja motora. Nizak rizik, moze i ranije kao brzi dobitak.

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 5.1 | RE-31 | app.ts | Mapirati skipped ruleId -> citljiv label (kao lokalni panel). | S |
| 5.2 | RE-36/41 | apply-fixers.ts, app.ts, repair-panel.ts | **P-E** FixerOutput.reason: odvojiti "Vec uskladjeno" od "Nije bilo moguce". | M |
| 5.3 | RE-34 | app.ts | #repairEntry copy gejtati na repairServerConfigured() (ne lagati "ne salje se"); ukloniti mrtvi innerHTML na 897. | S |
| 5.4 | RE-35 | app.ts | Serverski panel: popis stavki + deep preklopnik s disclosure recenicom (kraj skrivenog prisilnog deep). | M |
| 5.5 | RE-37 | app.ts | Success-lockout nakon popravka; uvijek prikazi sazetak; ponudi "ucitaj popravljeni za novu ocjenu". | M |
| 5.6 | RE-40 | app.ts | "Popravljeno" uvjetovati o delti recheka; posebna poruka kad delta <= 0. | S |
| 5.7 | RE-38 | app.ts | closeRepairHistory() u globalni Escape handler. | S |
| 5.8 | RE-39 | app.ts | "Moji popravci" preuzimanje: sinkroni pre-open taba (kraj tihog popup-bloka). | S |
| 5.9 | RE-42 | corpus-verify.ts | Pad korpusa ne broji seriju kao checked; propagiraj truncated (kraj laznog "sve provjereno"). | S |
| 5.10 | RE-45 | CLAUDE.md, AGENTS.md | Ispravi "bez backenda"/"ne salje se"; dodaj src/repair i supabase u Mapu datoteka; ispravi broj redaka. | S |

**DoD:** `npm run check` zelen; happy-dom testovi za nove UI grane. 5.1/5.3/5.6/5.7/5.10 su najjeftiniji
dobici na dojam i mogu ici odmah nakon Faze 1 ako se zeli brzi vidljiv pomak.

## Faza 6: Pokrivenost profila (podatkovni track, tece paralelno)

| Korak | RE | Sto | Trud |
|---|---|---|---|
| 6.1 | RE-06 | Popuni autoFixable ruleEntries za FPZG i Pravo (nosivi fakulteti) iz sluzbenih izvora; regeneriraj repair-map. Do tada: triage ne klasificira "auto" bez zapisa. | L |
| 6.2 | RE-06 | Prosiri na ostalih 203 profila bez zapisa, profil po profil (draft -> gen-profile-runtime-maps). | L |

**DoD:** za profil s font/size/spacing/margins vrijednoscu, triage.auto == broj panel stavki (drift
test). Ovo je jedini cisto podatkovni track; moze ici usporedno s Fazama 1-5 (druga osoba/sesija),
ne dira zasticeni kod.

## Faza 7: Performanse i robusnost (kad je funkcionalno stabilno)

| Korak | RE | Datoteka | Sto | Trud |
|---|---|---|---|---|
| 7.1 | RE-25 | xml-patch.ts | Balansirane raspone tbl/txbx/sdt racunati JEDNOM; ukloniti O(n^2) sken sidra. | M |
| 7.2 | RE-25 | apply-fixers.ts, repair-panel.ts | Paragraph cap na repair putu; klijentski applyFixers u Web Worker (glavna nit ostaje ziva). | M |
| 7.3 | RE-28 | zip-codec.ts, repair-panel.ts | Podigni/uskladi budzet, sijeci bombu po OMJERU; tipizirana greska -> postena "smanji slike" poruka. | M |

---

## Redoslijed i procjena

**Kriticni put (najbrzi vidljiv pomak korisniku):** Faza 0 -> Faza 1 -> Faza 2. Faza 0 je mreza,
Faza 1 zaustavlja stetu, Faza 2 rjesava glavno "ne radi". Faze 3-5 podizu dojam i zatvaraju rupe;
Faza 6 tece paralelno (podaci); Faza 7 zadnja.

**Brzi dobici (mogu odmah, nizak rizik):** 1.1-1.4 (gubitak podataka, sve S), 5.1/5.3/5.6/5.10
(postene poruke, sve S), 3.1/3.2 (ozivi poravnanje broja + prestani unositi prekrsaj, S).

**Gruba procjena truda:** Faza 0 ~1 dan; Faza 1 ~1 dan (8x S/M); Faza 2 ~2-3 dana (najzahtjevnija,
xml-patch + Word matrica); Faza 3 ~0,5 dana; Faza 4 ~1-2 dana (server + migracija + prvi serverski
testovi); Faza 5 ~1-1,5 dan; Faza 6 zaseban podatkovni napor (dani-tjedni, paralelno); Faza 7 ~1 dan.

**Prijedlog prve tri isporuke:**
1. Faza 0 (mreza) + Faza 1.1-1.4 (P0 gubitak podataka) u jednoj seriji commita.
2. Faza 2.1-2.4 (razrjesavanje stilova, srce "ne radi").
3. Faza 3 + Faza 5 brzi dobici (poravnanje, postene poruke).
