---
name: rad-audit
description: "Motor audita akademskog rada u .docx-u, faze A–G: integritet, citati, brojke, cross-check s izvornom građom, jezik, Word polja, ispravci. Aktiviraj na 'audit rada', 'provjeri citate/literaturu', 'usporedi rad s izvorima', 'zašto je tablica zaključana'. Ne aktiviraj kao kopilot: u projektu s .katedra/ zove ga katedra-lite mod 4 kroz engine.py. (Zadnje: R14/R15/R16 stvarno implementirani nakon što je provjera tvrdnji pokazala da su bili samo opisani; parafraza.py, brojke_iz_rasprave.py, faza E2 lektura.) Od v1.9.10 i: metapodaci (docProps/), uputnice na prikaze, aritmetika u tablicama, statističko izvještavanje (p naspram opisa), hipoteze i presude, tvrdnja naspram izvora koji je citiran, postojanje bibliografske jedinice. v1.9.40."
---

# Rad-audit — pipeline za provjeru akademskih radova

## 0.0 DVA ULAZA — utvrdi koji je prije wizarda

Ovaj skill radi u dva načina. Kod je isti, razlikuje se **tko vodi razgovor**.

```bash
cat .katedra/stanje.json 2>/dev/null | head -1 || echo "SOLO"
```

| uvjet | način | ponašanje |
|---|---|---|
| nema `.katedra/`, korisnik je tražio provjeru rada | **SOLO** | vodiš wizard (0.1–0.5), ti isporučuješ izvještaj |
| postoji `.katedra/stanje.json` **ili** je pozvan `engine.py` iz Katedre | **MOTOR** | **preskoči cijelu sekciju 0** |

**U načinu MOTOR:**

- Wizard se **ne pokreće**. Opseg, tip rada, citatni stil i profil fakulteta dolaze iz `.katedra/stanje.json` — ništa od toga ne pitaj ponovno.
- Izvještaj ide u `.katedra/audit.md` i `.katedra/nalazi.json`, ne u chat. Katedra ga spaja sa svojim nalazima (teza, stil, geometrija) i isporučuje jednom.
- Odobrenje za fazu G traži **Katedra**, ne ti.
- Ograničenja (npr. nema izvorne građe) upiši u JSON, ne samo ispiši.

Praktično: `python3 generate_report.py rad.docx --json .katedra/nalazi.json` je
cijeli ugovor. Katedra ne poziva pojedinačne skripte mimo `engine.py`, a ti ne
pretpostavljaš da si sam u razgovoru.

### Ugovor prema Katedri — `scripts/engine_contract.json`

Katedra od verzije s `rad_audit_contract.py` (CONTRACT_VERSION `"1"`) ne poziva
motor bez **deklariranog manifesta**. Bez njega `engine.py --provjeri` javlja
„nedostaje engine_contract.json", odbija pokrenuti faze A–G i pada u smanjeni
opseg — a to je tiho gubljenje faze D, koja je jedina strojna provjera tvrdnji
prema izvornoj građi.

Manifest je `scripts/engine_contract.json`. Pokazuje na `scripts/katedra_adapter.py`,
koji `generate_report.py` poziva **nepromijenjenog** i samo prevodi oblik izlaza:

| što Katedra traži | što `generate_report.py` daje | tko premošćuje |
|---|---|---|
| `findings` kao **popis** | rječnik grupiran po težini | adapter (izvorna grupacija ostaje pod `findings_by_severity`) |
| `contract_version`, `engine`, `engine_version`, `capabilities` | ne postoje | adapter |
| `counts`, `phase_exit_codes` | ✅ već postoje | — |

**Ne mijenjaj `generate_report.py` da bi zadovoljio ugovor.** Adapter postoji
upravo zato da oblik izlaza za Katedru i samostalni SOLO izlaz ostanu razdvojeni.

`engine_version` nije semantička verzija nego otisak sadržaja skripti motora
(`0.0.0-undeclared+<sha8>`), jer ovaj skill verziju ne deklarira u frontmatteru.
Kad se skripte promijene, otisak se promijeni — to je namjerno.

Sposobnosti u manifestu potvrđene su **izvođenjem**, ne čitanjem koda:
`audit.report-json.v1` (izlaz `generate_report.py --json`),
`hr.citations.author-year.v1` i `hr.typography.numbers.v1`
(`tests/test_all.py`, skupine R13 i R8), `hr.citations.vancouver.v1`
(skupina R16, 9 testova + HKS-FZS rad sa 75 referenci), te
`safe-fixes.preserve-page-breaks.v1` (`apply_safe_fixes.py` nad stvarnim radom:
prijelomi, sekcije, odlomci, broj riječi i broj stranica nepromijenjeni).
Ako dodaješ novu sposobnost u manifest, prvo je dokaži testom — Katedra
manifestu vjeruje na riječ i neće provjeravati izvorni kod umjesto tebe.

Provjera da lanac radi:

```bash
python3 <KATEDRA_SKILL>/scripts/engine.py --provjeri
# ✅ contract v1 · engine 0.0.0-undeclared+<sha8> · rad-audit
```

**Nikad oba intakea.** Ako je korisnik već odgovarao na Katedrina pitanja, tvoja
su odgovorena. Dupli wizard je najbrži način da rad izgleda neozbiljno.

## 0. ULAZNI PROTOKOL (RadPilot v1) — SAMO U NAČINU SOLO

**Prvi output ovog skilla je wizard, ne pipeline i ne objašnjenje pipelinea.** Ne pokreći nijednu skriptu prije nego znaš opseg i imaš datoteke.

### 0.1 Guard — spriječi dupli intake

- Postoji blok `STANJE-RADA` (v. 0.4) ili je rad **već priložen** i opseg jasan? → **PRESKOČI wizard**, potvrdi jednom rečenicom i kreni na fazu A.
- Intake već odradila **katedra-lite** (v. 0.0)? → ne ponavljaj ga.
- Inače → 0.2.

### 0.2 Prva poruka (točno ovaj format)

> 🔍 **Audit rada** — pipeline A–G. Što provjeravam?
>
> 1️⃣ **Puni audit** (A–G) — integritet, citati, brojke, cross-check, jezik, formatiranje
> 2️⃣ **Citati i literatura** (faza B)
> 3️⃣ **Cross-check s izvorima** (faza D) — tvrdnje u radu vs. izvorna građa
> 4️⃣ **Jezik, stil, tipografija** (faza E)
> 5️⃣ **Word formatiranje i polja** (faza F) — SADRŽAJ, natpisi, praznine, „zaključane" tablice
>
> Odgovori brojem (default: 1) i priloži datoteke iz popisa ispod.

### 0.3 Datoteke — reci točno što uploadati

- 📄 **Rad u .docx** — **OBAVEZNO**. PDF ne prolazi: skripte čitaju .docx, iz PDF-a nema polja, stilova ni tracked changesa.
- 🗂️ **SVA izvorna građa** (izvješća, projekt, seminar, podaci, PDF-ovi literature) — **OBAVEZNO za fazu D**. Bez nje cross-check ne postoji i to moram deklarirati u izvještaju.
- 📜 **Upute fakulteta** (PDF) — bez njih provjeravam **dosljednost**, ne **usklađenost s pravilima**. Razlika mora biti jasna korisniku.
- 📝 **Komentari mentora** na raniju verziju, ako postoje.

Fali obavezna stavka → upozori **jednom**, navedi točno što se gubi, i pitaj želi li svejedno nastaviti u smanjenom opsegu. Građa veća od ~10 MB preko Drive konektora → traži upload ZIP-a u chat.

### 0.4 Sažetak + STANJE (ispiši prije prve skripte)

```
STANJE-RADA
mod: audit
opseg: <A-G|B|D|E|F>
tip: <seminarski|zavrsni|diplomski>
datoteke: rad<✅|❌> gradja<✅|❌> upute<✅|❌>
citatni-stil: <auto-detektiran: IEEE|Vancouver|autor-godina>
domena: <celik|elektro|strojarstvo|it|generic>
ogranicenja: <npr. nema izvorne građe → faza D preskočena>
```

### 0.5 Pravila intakea

- Intake gotov u **≤ 2 poruke**, numerirane opcije, bez zida teksta.
- Ništa se ne pita dvaput; ono što je već priloženo ili rečeno se samo potvrđuje.
- Nakon sažetka pokreni pipeline **bez čekanja odobrenja** za dijagnostiku (skripte su read-only). Odobrenje traži samo za **izmjene dokumenta** (faza G i `apply_safe_fixes.py`).

### 0.6 Isporuka i predaja (handoff)

- Kraj audita: izvještaj razvrstan **Kritično / Srednje / Kozmetičko** (`generate_report.py`) + tablica **„RUČNO PROVJERI"** (sve [PROVJERI STR.], pretpostavke za mentora, pravila fakulteta).
- Traži se prepisivanje većih dijelova → **katedra-lite mod 3** (poboljšanje; za FPZG učitava
  `references/glas_fpzg.md`), uz identičan skup citata i brojki.
- Rad ne postoji ili je tek u planu → **katedra-lite mod 1** (plan).
- Nakon audita ponudi pripremu obrane (**katedra-lite mod 5**).
- Aliasi `fpzg-skill-pisanje`, `plan-i-program`, `radpilot` više ne postoje kao samostalni skillovi.

---

> **Doktrina (rujan 2026.).** Ništa se u ovaj SKILL.md ne upisuje kao gotovo prije
> nego što postoji test koji to izvodi. Tri uzastopna unosa (R14, R15, R16) opisivala
> su popravke s izmjerenim brojkama, a u kodu ih nije bilo: `HEADING_RE` nije znao
> „Izvori i literatura", toggle navodnika i dalje je davao `„tekst„`, riječ
> `vancouver` nije se pojavljivala nigdje. Prije svake zakrpe pokreni
> `python3 <KATEDRA>/scripts/zakrpa.py --provjeri-tvrdnje <korijen skilla>` — uspoređuje
> sposobnosti iz manifesta, tvrdnje o broju testova i oznake kvarova s onim što
> test-suite stvarno sadrži. Changelog bez testa je fikcija, a fikcija u SKILL.md je
> gore od nedostajuće značajke: sljedeća sesija je ne provjerava.

Provjera radova u fazama A–G, uz **željezna načela**: izvor istine > dojam; sve verificiraj neovisno; ne izmišljaj; jasne pogreške ispravi odmah, stil tek uz potvrdu tona; nakon SVAKE izmjene ponovno provjeri citate/brojke/polja/validaciju.

Puni proces s objašnjenjima i katalogom zamki: **`references/pipeline.md`** (pročitaj ga prvi put).
Brza tipografska pravila: **`references/typography_hr.md`**.

## Kada što

- „Napravi audit rada" → prođi cijeli pipeline (dolje), na kraju izvještaj + (uz potvrdu) ispravci.
- „Provjeri citate/literaturu" → faza B.
- „Usporedi rad s izvorima" → faza D (traži izvornu građu ako je nema).
- „Sredi formatiranje / zašto je tablica zaključana / prazna" → faza F.
- „Jezik/stil" → faza E (za teško prepisivanje delegiraj subagentu uz stroga pravila, pa verificiraj sam).

## Alati (skripte, ovise samo o `python-docx`)

Sve su read-only osim što ti daju nalaze. Pokreni pojedinačno ili sve odjednom:

```bash
cd scripts
python3 audit_all.py rad.docx --sources izvori_folder/   # objedinjeni ispis u terminal
python3 generate_report.py rad.docx --sources izvori_folder/   # ISTO + spremljen .md izvještaj
                                                                 # razvrstan Kritično/Srednje/Kozmetičko
                                                                 # (--json izvjestaj.json za strojnu obradu)
# ili pojedinačno:
python3 check_citations.py rad.docx      # B: IEEE [N] — definirano/citirano, siročad, rupe, redoslijed;
                                          #    broji i citate u TABLICAMA i FUSNOTAMA; [2020] (godina u
                                          #    zagradi) se prijavi posebno, ne broji kao citat
python3 check_citations.py rad.docx vancouver   # B: Vancouver (N) — brojanje, rupe u numeraciji, siročad,
                                          #    citat bez reference, rastući redoslijed;
                                          #    decimale „158 (77,8)" i svezak(broj) „53(3-4)" nisu citati
                                          #    NE provjerava FORMAT navoda (razmak iza zareza, en-crtica u
                                          #    rasponu, položaj prema interpunkciji, „i sur." nakon 6 autora)
                                          #    — v. „Poznati opseg”; do v1.9.4 je SKILL.md to tvrdio, kod nije radio
python3 check_placeholders.py rad.docx     # A2: [TREBA IZVOR], [DOPUNITI], [PROVJERI STR.] u tijelu,
                                          #     ćelijama, FUSNOTAMA, endnotama, zaglavljima i podnožjima
python3 osvjezi_contract.py [--upisi]     # uskladi engine_contract.json s otiskom koda (zove ga test_all)

# ── faze dodane u v1.9.5–1.9.10; sve ih zove generate_report.py, ali se
#    pokreću i pojedinačno kad želiš samo jednu ────────────────────────────
python3 provjeri_metapodatke.py rad.docx  # A4: docProps/ — ostavljeni predlošci („Student", „PC"),
                                          #     tragovi alata, app.Company, lokalne putanje, autori
                                          #     praćenih izmjena, dc:creator naspram naslovnice.
                                          #     --postavi upisuje u NOVU datoteku; rsid i povijest
                                          #     izmjena NE dira (v. docstring)
python3 check_uputnice.py rad.docx        # F2: „prikazano u Tablici 3" mora pogađati prikaz koji
                                          #     postoji, i svaki prikaz mora biti uveden rečenicom
python3 check_tablice.py rad.docx         # C4: redak Ukupno naspram zbroja, postoci koji ne daju
                                          #     100, n iz natpisa naspram zbroja stupca
python3 check_statistika.py rad.docx      # C3: p ≥ α opisan kao značajan i obrnuto, p = 0,000,
                                          #     p izvan [0,1], test koji se nigdje ne imenuje
python3 check_hipoteze.py rad.docx        # G1: dobiva li svaka postavljena hipoteza izričitu
                                          #     presudu; NE presuđuje je li presuda točna
python3 mapa_izvora.py rad.docx --izvori izvori/ --izgradi izvori/mapa.json
                                          #     prijedlog mape ključ citata → datoteka izvora
python3 check_tvrdnja_izvor.py rad.docx --izvori izvori/
                                          # D2: brojka mora biti u izvoru koji TA rečenica citira;
                                          #     „pripisano krivom izvoru" je najteži nalaz ovdje
python3 check_reference_exists.py rad.docx --izvori izvori/ [--strogo]
                                          # B2: građa / identifikator (DOI, ISBN, URL) / službena
                                          #     oznaka / NEPOTVRĐENA jedinica
python3 propagacija.py --rukopis .katedra/poglavlja --docx rad.docx
                                          # E3: je li izmijenjena vrijednost stigla u sve tablice i
                                          #     grafikone; traži rukopis, pa NIJE dio audita gotova
                                          #     .docx-a nego moda 3
python3 tests/test_bolesni.py             # rad S POGREŠKAMA mora pasti + negativna kontrola
python3 check_citations_authoryear.py rad.docx  # B: autor-godina (Prezime, 2020) — HEURISTIKA, čitaj docstring;
                                                 #    fusnote/endnote uključene u "citirano"
python3 check_fields.py    rad.docx      # A/F: fldChar balans, TOC/REF/SEQ, pageBreak, autofit, zaštita,
                                          #      NEPRIHVAĆENE IZMJENE/komentari
python3 check_typography.py rad.docx     # E: navodnici „…", ×, –, zarez, jedinice, NBSP
python3 check_repetition.py rad.docx     # E: početci rečenica, fraze, ritam, atribucijski glagoli
python3 <KATEDRA_LITE>/scripts/provjeri_zamke_proze.py rad.docx
                                          # E: spojene rečenice (zarez+veliko), interpunkcijski tik
                                          #    (dvotočka/duga crtica), ponovljen kostur odlomka,
                                          #    stopa i raspon u različitim jedinicama, brojka iz
                                          #    popisa literature bez odjeka, kvantifikator uz citat
python3 numbers_inventory.py rad.docx [--domain celik|elektro|strojarstvo|it|generic]
                                          # C: broj+jedinica po grupama (šira lista jedinica, uklj. V/Hz/%/°)
                                          #    + DETEKCIJA SUKOBA: isti pojam s više različitih vrijednosti
                                          #    iste jedinice → ⚠ (domena auto-detektirana ako --domain nema)
python3 cross_check.py rad.docx izvori_folder/ [--domain ...]   # D: nalaze li se tvrdnje u izvorima
                                                                  #    (ispisuje kontekst oko svakog pogotka)
python3 check_overlap.py rad.docx izvori_folder/   # D: doslovno preklapanje (verbatim-copy) BEZ oznake citata
python3 parafraza.py stari.docx novi.docx --poglavlja "1. UVOD:2. CILJ"
                                          # E/D: koliko je nova verzija STVARNO drukčija od stare
                                          #      (8-grami po poglavlju, prag 20 %); za mentorov
                                          #      zahtjev „smanji podudarnost" — NE zamjenjuje Turnitin
python3 brojke_iz_rasprave.py rad.docx    # C: svaka brojka o vlastitom uzorku u Raspravi/Zaključku
                                          #    mora postojati u Rezultatima ili tablicama; brojka s
                                          #    citatom u istoj rečenici pripisana je literaturi;
                                          #    + zaokruživanje p naspram stvarnih vrijednosti
python3 extract_text.py rad.docx         # čist tekst (python-docx, bez XML smeća)
```

Stil citiranja (IEEE `[N]` vs Vancouver `(N)` vs autor-godina) se auto-detektira (`common.detect_citation_style`)
u `audit_all.py`/`generate_report.py` — pokreće se odgovarajuća skripta. Domena rada (za
`numbers_inventory.py`/`cross_check.py`) se auto-detektira preko `domains/` paketa (celik,
elektro, strojarstvo, it; fallback = generički frekvencijski). `--domain`/override po potrebi.
⚠️ **Biomedicinskog paketa nema.** Rad o palijativnoj skrbi detektiran je kao `celik`
(96 bodova) i dobio podsjetnik na aritmetiku krovnih panela te lažni sukob `'stup' + %`
(iz „stupanj"). Dok `domains/biomed.py` ne postoji, za sestrinstvo, medicinu i srodno
zadaj `--domain generic` ručno.

**Automatski sigurni ispravci** (jedina skripta koja MIJENJA dokument):
```bash
python3 apply_safe_fixes.py rad.docx out.docx            # navodnici, ×, autofit, updateFields
python3 apply_safe_fixes.py rad.docx out.docx --fonts arial --no-indent   # + Arial + bez uvlake
python3 apply_safe_fixes.py rad.docx out.docx --strip-breaks   # + ukloni pageBreakBefore (v. niže)
python3 apply_safe_fixes.py rad.docx --dry-run           # samo prikaži što bi promijenio
```
⚠️ `pageBreakBefore` se **ne uklanja po defaultu**. Većina fakulteta (EFZG i sl.) **propisuje** prijelom prije svakog poglavlja, pa bi tiho uklanjanje prekršilo formalni zahtjev. `--strip-breaks` koristi tek kad si provjerio profil fakulteta (`prijelom_pred_poglavljem`) i kad je prijelom na **natpisu prikaza**, ne na naslovu poglavlja.
Radi samo unutar vidljivog teksta i strukturnih atributa — NE kolabira runove, NE dira polja.
Zaštite od tihog kvarenja (sve verificirano testovima):
- navodnici PO ODLOMKU (reset stanja na svakom top-level `<w:p>`, depth-aware — tekst iza
  inline textboxa se NE preskače); inč-oznake (12", 6") se preskaču; odlomci s neparnim
  brojem navodnika se prijavljuju za ručnu provjeru;
- U+201C se pretvara u hrvatski zatvarajući U+201D SAMO u odlomku koji sadrži i „ —
  engleski "…" par (Abstract!) ostaje netaknut i prijavi se u ispisu;
- hex literali (0x41) se NE pretvaraju u "0 × 41";
- `--no-indent` ubacuje razmak isključivo u `<w:pPr>` (nikad u run-level `rPr` gdje
  `w:after` nije dopušten po schemi), a firstLine=0 mijenja SAMO stil Normal.
Uvijek nakon toga: `validate.py out.docx --original rad.docx`. Sadržajne pogreške (tipfeleri,
stil, cross-check) NISU auto — njih riješi ručno/subagentom uz verifikaciju.

Za izvore u PDF-u prvo: `pdftotext -layout izvor.pdf izvor.txt` (skripte čitaju .txt/.md/.docx).
Za XSD validaciju, prihvaćanje tracked changes i render koristi **docx skill** (apsolutne putanje):
```bash
python3 /root/.claude/skills/docx/scripts/office/validate.py out.docx --original original.docx
python3 /root/.claude/skills/docx/scripts/merge_runs.py unpacked/   # spoji fragmentirane runove nakon Word re-savea
python3 /root/.claude/skills/docx/scripts/accept_changes.py rad.docx out.docx   # prihvati SVE tracked changes
                                                                                  # (obavezno ako check_fields.py javi
                                                                                  #  "NEPRIHVAĆENE IZMJENE/komentare")
```

## Tijek (A–G)

1. **Prikupi građu** — rad + SVU izvornu građu. Drive konektor vadi ~10 MB; veći ZIP → traži upload u chat.
2. **Kontekst/pravila** — koji fakultet; ima li propisani stil (često nema → dosljednost + potvrda mentora). Stil ([N] vs autor-godina) auto-detektira `common.detect_citation_style` (vidi ispod), ali potvrdi da ima smisla za konkretni rad.
3. **A. Integritet** — `extract_text.py` (NE regex po XML-u), `check_fields.py`, te
   **`check_placeholders.py` iz `katedra-lite`** (`[IME PREZIME]`, `[DOPUNITI]`,
   `[TREBA IZVOR]`, `[PROVJERI STR.]`). Ta je provjera postojala, ali je nije bilo u ovom
   lancu, pa je rad s placeholderom na naslovnici prolazio audit — nađeni su čitanjem, ne
   alatom. Alat koji se ne pokreće jednak je alatu koji ne postoji.
   Pazi i na Word artefakte: split runovi, `_GoBack` presiječe riječ (skriveni tipfeler), TOC omotan u SDT. `check_fields.py` sad javlja i **neprihvaćene tracked changes/komentare** — ako ih ima, prvo pokreni `docx` skillov `accept_changes.py`, inače su brojanje citata/brojki i tekstualna analiza nepouzdani.
4. **B. Citiranje** — `check_citations.py` za IEEE `[N]` ili `check_citations_authoryear.py` za autor-godina (auto-izabrano u `audit_all.py`/`generate_report.py`; autor-godina provjera je HEURISTIKA — ključ je prvi-autor+godina, ne pun popis autora, pazi na 2020a/2020b). Fusnote/endnote se pretražuju preko `common.load_supplementary_text`. Uz to ručno: format svake reference (knjiga/članak/norma/web/neobjavljeno; DOI; datum pristupa; „bez godine" = crveni flag).
5. **C. Tehnika** — `numbers_inventory.py` (domena rada se auto-detektira preko `domains/` — celik/elektro/strojarstvo/it/generic; `--domain` override) + ručno aritmetika (površina, paneli, raster×okviri) i granica dokaza.
6. **D. Cross-check** — `cross_check.py rad.docx izvori/` (sad ispisuje ±40 znakova konteksta oko svakog pogotka — provjeri ga, substring-match zna dati lažni pozitivac preko granice rečenice) + `check_overlap.py rad.docx izvori/` (doslovno preklapanje BEZ oznake citata — akademska čestitost, ne cross-check sadržaja). Kad se izvori sukobe: rad mora DEKLARIRATI razliku; prednost kasnijim/izvedbenim izvješćima i fotografiji oznake. Pazi na skrivene atribucije i imena tvrtki koja se javljaju samo u zaglavlju.
7. **E. Jezik/tipografija** — `check_repetition.py`, `check_typography.py`. Razbij obrazac „izvješće navodi", koncentriraj hedžing, spoji staccato. Tipfeler može biti skriven razbijenim runom.
8. **F. Formatiranje** — SADRŽAJ/POPISI kao **TOC polja**, natpisi kao **SEQ**, spomeni kao **REF**; makni `pageBreakBefore` **samo s natpisa prikaza** (praznine/„zaključano") — na naslovu poglavlja je najčešće propisan pa ostaje, tablice `autofit`; fontovi dosljedni (theme + docDefaults + stilovi); uvlaka iz Normal `firstLine` (+ `after` da se odlomci ne stope); `updateFields=true`.
9. **G. Ispravci** — jasne pogreške odmah; stil uz potvrdu. Uređuj po CIJELOM odlomku, ali **nikad ne kolabiraj runove odlomka s poljem** (REF/SEQ). Escape `& < >`, `xml:space="preserve"`.
10. **Verifikacija** — nakon svake runde: XSD validacija, fldChar balans, citati, ključne brojke, cross-check spot, tipografija; render ako soffice radi (ako pada u sandboxu — provjeri na XML-u i budi iskren; NE šalji pandoc-PDF kao dokaz fonta). Za predaju korisniku spremi razvrstan izvještaj s `generate_report.py`.

## Poznati opseg (pročitaj prije nego zaključiš da nešto "ne radi")

- `check_citations.py` pokriva numeričke stilove IEEE `[N]` i (od v1.9) Vancouver `(N)`
  — drugi argument `ieee|vancouver`, inače se bira po tekstu; za autor-godina koristi
  `check_citations_authoryear.py` (sve je ožičeno kroz auto-detekciju stila u
  `audit_all.py`/`generate_report.py`). Vancouver NE provjerava format same reference
  (skraćeno ime časopisa, redoslijed polja) ni citate u eksponentu — samo ovalne zagrade.
  Autor-godina provjera je heuristika (v. docstring skripte) — čitaj kao popis za ručnu
  provjeru, ne kao konačnu presudu poput IEEE brojčane provjere.
- `numbers_inventory.py`/`cross_check.py` domenski paketi pokrivaju celik/elektro/
  strojarstvo/it + generički fallback. Za jako specifičnu domenu koja ne odgovara nijednom
  paketu, dodaj novi u `domains/__init__.py` (isti oblik: label/keywords/claim_patterns) —
  automatski se uključuje u auto-detekciju.
- `check_overlap.py` hvata blisko-doslovno podudaranje (n-grami), ne parafrazu/sinonime —
  nije Turnitin-razina alata. Preklapanje samo znači "provjeri je li ovo označeno kao citat",
  ne "ovo je plagijat".
- Nijedan alat ne provjerava žive URL-ove/DOI (mrtvi linkovi) — to je ručna provjera ili
  zahtijeva mrežni pristup izvan ovog read-only pipelinea.
- Nijedan alat ne provjerava **sadrži li izvor tvrdnju** koja mu se pripisuje. `verify_sources.py`
  odgovara samo na „postoji li izvor". Na jednom radu je tvrdnja pripisana knjizi koja
  postoji i uredno prolazi provjeru, a te tvrdnje u njoj nema. Egzistencija nije sadržaj.
- Broj stranice koji je vratio sažetak dokumenta nije mjerenje nego hipoteza: dva dohvata
  istog PDF-a dala su 445 i 446–447 za isti odlomak, a točna je bila 446. Stranica smije doći
  samo iz `pdftotext`/OCR nad datotekom s vidljivim zaglavljima, iz mehaničkog popisa
  zaglavlja, ili iz sekundarnog izvora koji doslovno navodi primarni tekst sa stranicom.
  Ako stranice PDF-a teku 1–N, to je otisak, a ne svezak — brojevi se ne izvode računom.

## Samo-testiranje skripti

Nova/izmijenjena logika (navodnik-fix, autor-godina, tracked changes, domenski
paketi, cross-check kontekst, verbatim-copy, **R13 hrvatski citatni oblici**) ima
regresijske testove:
```bash
cd scripts/tests && python3 test_all.py    # gradi fixture, poziva skripte, provjerava ishode
```
Pokreni ovo nakon bilo koje izmjene u `scripts/` prije nego se pouzdaš u rezultat na stvarnom radu.

**R13 — hrvatski citatni oblici (kolovoz 2026.).** Pet zakrpa nađenih na obranjenom
FPZG radu: lokator stranice iza godine (`(Becker, 2007: 45)`), sufiks `2013a/2013b`
kao dio identiteta, popis literature s punim imenom umjesto inicijala, čestice u
prezimenu (`Van der Zwan` → ključ `zwan` s OBJE strane) i institucionalni autor s
malom riječi u imenu (`Europska komisija`, `easyJet plc`). Sve pet imaju isti oblik:
alat je bio kalibriran na jedan dijalekt, pa je rad koji radi nešto drukčije — ali
ispravno — prijavljivao kao pogrešan. Mjereno na stvarnom radu: neprepoznatih redaka
popisa **19 → 13**, prepoznatih referenci **52 → 57**, „citat bez reference"
**2 lažna → nijedan**.

**R14 — naslov popisa i padež stranog prezimena (opisano u kolovozu 2026., IMPLEMENTIRANO u rujnu).**
`HEADING_RE` nije poznavao naslov **„Izvori i literatura"**, a kad naslov ne prođe, popis
ostaje prazan i **svaki** citat ispada „citat bez reference" — na FPZG seminarskom radu
svih 12, uz posve uredan popis. Hrvatski padež usto guta završno -y (`Lipsky` → `Lipskom`),
pa je skidanje nastavka davalo `lipsk`, a popis nosi `lipsky`.

⚠️ **Ovaj je unos od kolovoza do rujna 2026. stajao ovdje kao gotov, a koda nije bilo.**
Provjereno: `HEADING_RE.search("Izvori i literatura")` → `False`, `_osnova("lipskom")`
→ `{lipsk, lipskom}`, bez `lipsky`. Popravljeno tek sada: `HEADING_RE` se dijeli s
`common.LIT_HEADING_RE` (obuhvaća i „POPIS CITIRANE LITERATURE"), a `_osnova` uz goli
korijen vraća i oblike sa završnim y/i/j/e. Testovi: skupina R14.

**R15 — toggle navodnika koji ne vidi već otvoreni navodnik (opisano u kolovozu 2026., IMPLEMENTIRANO u rujnu).**
`apply_safe_fixes.py` vodi zamjenu togglom koji broji samo **ravne** navodnike, pa je u
odlomku već otvorenom hrvatskim `„` jedini preostali ravni `"` tretiran kao otvaranje:
`„Neovisno življenje„`.

⚠️ **I ovaj je unos stajao kao gotov bez koda.** Provjereno na `fix_quotes_by_paragraph`:
`state_open = True` postavljalo se bezuvjetno na početku odlomka, a izlaz je i dalje bio
`Program „Neovisno življenje„ i pojam ”drugi navod„`. Popravljeno tek sada: stanje se za
svaki ravni navodnik čita iz **cijelog prefiksa** odlomka uz već obavljene zamjene
(otvoreno je ako je `„` više nego `”`). Mjereno na tom odlomku: `„…„` i `”…„` → `„…”` i
`„…”`. Testovi: skupina R15.

**R16 — Vancouver `(N)` dijalekt (opisano u rujnu 2026., IMPLEMENTIRANO isti mjesec).**
HKS-FZS diplomski (75 referenci, 132 navoda u ovalnim zagradama) detektirao se kao
`unknown, 0 citata`: IEEE checker je javljao „popis nije prepoznat", a autor-godina
checker izmislio citat iz „Recommendation Rec(2003)24" — **1 lažni kritični nalaz, 132
stvarna citata neprovjerena**, a stvarna pogreška (sedam citata izvan rastućeg
redoslijeda) nije prijavljena jer ta grana nikad nije došla do izvršavanja.

⚠️ **Prva verzija ovog unosa tvrdila je „`common.detect_citation_style` sada zna
`vancouver`" i „Mjereno: kritično 1 → 0, popis 75/75, 101/101 testova".** Ništa od toga
nije postojalo: `grep -c -i vancouver common.py check_citations.py` → `0` i `0`,
`check_citations.py` primao je samo `sys.argv[1]`, suite je imao 63 testa (ne 78), a
manifest nije sadržavao `hr.citations.vancouver.v1`. Tri takva unosa zaredom (R14, R15,
R16) razlog su doktrine na vrhu ovog dokumenta i provjere `zakrpa.py --provjeri-tvrdnje`.

Stvarno stanje nakon implementacije: `detect_citation_style` vraća i `vancouver`,
`check_citations.py` prima drugi argument `ieee|vancouver` i u Vancouveru čita popis kao
numeriranu listu `1. Autor…`; provjerava siročad, citat bez reference i **redoslijed prvog
pojavljivanja, koji sada ulazi u ocjenu** (prije je bio samo ispis, pa je rad s prekršenim
redoslijedom prolazio kao „interno konzistentno"). Nisu citati: svezak(broj) `53(3-4)`,
godina `(2003)`, te `158 (77,8)` kao n (%) **u ćelijama tablica** — u prozi ista zaštita
ubija stvaran citat iza broja (`0,53 (21)`), pa se ondje odbacuje samo zagrada zalijepljena
uz znamenku. Mjereno na tom radu: kritično **1 → 0**, srednje **13 → 7**, popis **75/75**,
citirano **0 → 75**, testovi **63/63 → 76/76**. Ne pokriva: citate u eksponentu, format
polja same reference.

Poznato ograničenje: marka pisana samo malim slovima (`touristik aktuell`) u
narativnom položaju strukturno se ne razlikuje od proze i ne prepoznaje se. Zagradni
oblik i redak popisa literature se prepoznaju, pa se takav izvor prijavi kao SIROČE
(⚠️ ručna provjera) — siguran smjer, jer bi popravak prozu pretvorio u citate.

## Zlatna pravila pri uređivanju .docx

- Tekst uvijek preko **python-docx**, ne regexom po `<w:t>` (povlači markup: lažni „4A" iz rsid, lažni navodnici iz atributa).
- Odlomak s poljem = **ne diraj runove**; rekonstruiraj tekst-prije + polje + tekst-poslije ili preskoči.
- Delegiraš prepisivanje subagentu → traži JSON {original, rewrite}, pa SAM provjeri da je skup citata `[XX]` po odlomku identičan i da su tehnički tokeni prisutni; odbaci sve što ne prođe.
- `updateFields` u `settings.xml` umetni PRIJE `footnotePr`/`endnotePr` (dakle i prije
  `compat/rsids/mathPr`). Ranija formulacija „prije compat" bila je točna ali nepotpuna:
  umetanje iza `endnotePr` proizvodi dokument koji pada XSD validaciju, jer `CT_Settings`
  traži redoslijed … `updateFields`, `hdrShapeDefaults`, `footnotePr`, `endnotePr`, `compat` …
  Pravilo koje je točno ali nepotpuno gore je od nikakvog, jer se čita kao provjereno.