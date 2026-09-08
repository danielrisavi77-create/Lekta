# PIPELINE ZA AUDIT ZAVRŠNIH / DIPLOMSKIH RADOVA
### Ponovljivi proces, checklista i katalog zamki — izveden iz stvarnog rada

> Cilj: od sirovog rada + izvorne građe doći do provjerenog, jezično čistog i tehnički ispravno formatiranog dokumenta, **bez ijedne izmišljene tvrdnje i bez izgubljenog citata**.

---

## 0. NAČELA (vrijede kroz cijeli proces)

1. **Izvor istine > dojam.** Svaka brojka u radu mora postojati u građi. Ako je nema — označi kao ograničenje, ne dopunjuj procjenom.
2. **Sve verificiraj neovisno.** I kad ti agent/skripta kaže „sve OK", provjeri sam (npr. skup citata prije i poslije izmjene mora biti identičan).
3. **Ne izmišljaj.** Nema godine? Ne upisuj. Nema podatka? Napiši da nedostaje.
4. **Transparentnost o granicama.** Ako render/alat ne radi, reci to i provjeri na razini strukture (XML), ne šuti i ne blefiraj.
5. **Odvoji pogreške od stila.** Jasne pogreške ispravi odmah; stilske zahvate (ton) radi tek uz potvrdu.
6. **Čuvaj cjelovitost pri svakoj izmjeni.** Nakon svakog zahvata: citati, brojke, polja, validacija.

---

## 1. PRIKUPLJANJE GRAĐE

**Trebaš:**
- Sam rad (.docx).
- SVU izvornu građu: izvješća, glavni/izvedbeni projekt, seminarski, fotodokumentacija, tablice, sirovi podaci — sve na što se rad poziva.

**Zamke i rješenja:**
- **Google Drive konektor preuzima max ~10 MB.** Veći ZIP (npr. 69 MB) → ne ide kroz konektor. Rješenje: traži korisnika da **priloži datoteku izravno u chat** (upload nema taj limit) ili da priloži ključne dokumente pojedinačno.
- Cloud/sandbox često **blokira izravno preuzimanje** (curl/wget na Google domene → HTTP 000). Ne inzistiraj — traži upload.
- Ako je građa ZIP: raspakiraj i inventariziraj (`unzip -l`), pa izvuci tekst svakog dokumenta.

**Ekstrakcija teksta (pouzdano):**
```bash
pandoc rad.docx -t plain -o rad.txt          # čitljiv tekst rada
pdftotext -layout izvjesce.pdf izvjesce.txt   # PDF izvješća/projekt
unzip -q rad.docx -d unpacked/                # za rad na XML-u
```
> Za PDF s oštećenim tekstualnim slojem (skenirano/loš font) — **potvrdi brojke vizualno sa stranica** (Read PDF po stranicama), ne vjeruj samo `pdftotext`.

---

## 2. KONTEKST I PRAVILA CITIRANJA

1. **Identificiraj fakultet/odjel** iz naslovnice.
2. **Nađi službene upute** za citiranje/oblikovanje (pravilnik, predložak, repozitorij). 
   - Ako ustanova **nema jedinstveni propisani stil** (česti slučaj na veleučilištima) → stil de facto propisuje mentor. Numeričko (IEEE) `[1]` citiranje je legitimno za tehničke radove.
   - Ključni kriterij tada nije „koji stil" nego **dosljednost**.
3. **Detektiraj stil koji rad koristi**: numerički `[1]` (IEEE) vs autor-godina (Harvard/APA). Prilagodi sve provjere tom stilu.
4. Ako ustanova nema javna pravila → **preporuči korisniku da mentor potvrdi stil** (formalnost, ali skida rizik).

---

## 3. FAZA A — INTEGRITET I TEHNIČKA PRIPREMA

**Cilj:** doći do pouzdanog teksta i popisa polja, prije bilo kakve analize.

- **Tekst vadi s `python-docx`, ne regexom po XML-u.** Regex `<w:t>…</w:t>` lako povuče markup (npr. iz `rsidP="008B0D4A"` dobiješ lažni „4A", iz atributa lažne navodnike). `python-docx` daje čist tekst runova i ćelija.
- **Inventar polja** (`fldChar`, `instrText`): TOC, PAGEREF, REF, SEQ. Zabilježi ih — pri kasnijim izmjenama ih NE smiješ razbiti.
- **Provjeri Wordove artefakte re-savea** (ako je korisnik otvarao/spremao u Wordu):
  - Runovi se **razbiju** (ista riječ podijeljena na `<w:r>` fragmente) → substring pretraga po XML-u zakaže.
  - `_GoBack` bookmark zna presjeći riječ (kod nas: „iz kasnijih **i**|_GoBack|**vješća**" = tipfeler „ivješća" umjesto „izvješća").
  - Word **omota SADRŽAJ u content control (SDT)** i prepiše `TOC \o "1-2"` → `"1-3"`, s pravim PAGEREF poljima.
- **Provjeri znakove**: 0 „�" (replacement char), hrvatski dijakritici prisutni.

---

## 4. FAZA B — CITIRANJE I BIBLIOGRAFIJA

**Interna konzistentnost (programski):**
```
- Sve definirane reference u LITERATURI (npr. [1]–[33]), bez rupa u numeraciji
- Svaka referenca barem jednom citirana u tekstu (nema „siročadi")
- Svaki citat u tekstu ima referencu (nema citata bez definicije)
- Format citata dosljedan: [1], [1, 3], [19–22]
```
> Skripta: raširi raspone (`[19–22]`→19,20,21,22), usporedi skup definiranih vs citiranih.

**Redoslijed (IEEE):** reference se numeriraju **redom prvog pojavljivanja**. Ako rad grupira (npr. primarna građa [18]–[22] citirana u uvodu prije [3]) → ili prenumeriraj, ili **objasni tematsko grupiranje jednom rečenicom** u metodologiji.

**Format svake jedinice (dosljednost je važnija od „savršenog" IEEE):**
| Tip | Na što paziti |
|---|---|
| Knjiga | autor, naslov, izdanje, mjesto: nakladnik, godina |
| Poglavlje/zbornik | „u:" urednik, stranice |
| Članak | časopis, vol., br., stranice, godina, **DOI** ako postoji |
| Norma (HRN EN) | puna oznaka + godina + naziv + izdavač (HZN); provjeri točnu oznaku/godinu u katalogu |
| Web | naslov, URL, **datum pristupa** (dosljedan format) |
| Neobjavljeno (projekt, izvješće) | autor/tvrtka, vrsta, mjesto, godina, „neobjavljeno" |
- Imena dosljedno (prezime-inicijal ili inicijal-prezime — jedno kroz cijeli popis).
- Crveni flag: **„bez godine"** kad je godina zapravo poznata → nađi je ili traži korisnika, ne izmišljaj.

---

## 5. FAZA C — TEHNIČKA ISPRAVNOST

- **Aritmetika**: provjeri sve što se može izračunati (površina = a×b, broj panela × pokrivna širina = površina krova, broj okvira × raster ≈ duljina). Kod nas: 36×18 + 36×12 = 1080 m² ✓; 36×12 m + 108×6 m = 144 panela ✓.
- **Nesklad brojki koji rad ne pomiruje** je nalaz (npr. „13 okvira" vs „33 stupa" — ne dijeli se s 13×2 → treba rečenica objašnjenja).
- **Norme**: točno navedene i ispravno primijenjene na kontekst (ne citiraj normu koja ne pokriva taj detalj).
- **Granica dokaza**: rad ne smije tvrditi ono što građa ne dokazuje (požarna otpornost bez elaborata, moment pritezanja bez zapisnika…). Ako tvrdi — flag.

---

## 6. FAZA D — CROSS-CHECK S IZVORNOM GRAĐOM ⚑ (najvrjednije)

**Postupak:**
1. Napravi **checklistu svake ključne tvrdnje/brojke** iz rada (dimenzije, profili, količine, oprema, sidra, vijci, datumi, tvrtke, oznake projekta).
2. Za svaku potvrdi u konkretnom izvoru (tjedno izvješće 0X, završno izvješće, projekt, seminar, foto).
3. Označi: potvrđeno / odstupa / nema u građi.

**Kad se izvori međusobno RAZLIKUJU** (čest slučaj):
- Rad **mora izričito deklarirati** razliku i obrazložiti izbor.
- Pravilo prvenstva: **kasnija/izvedbena izvješća > rani nacrti**; **fotografija ambalaže/oznake > tekstualni prepis**. (Kod nas: sidra „16/200" vs „M16×300" → foto ambalaže FBN II 16/200, ukupno 318 mm presudila.)
- Ako rad NEKI nesklad ne deklarira (npr. visine 5,5/7 vs 4,5/6,5) → to je nalaz.
- Pazi na **skrivene atribucije**: „podatak X iz izvješća 05" a zapravo piše u izvješću 04 → ispravi izvor.
- **Nazivi tvrtki / uloge**: ime koje se pojavi samo u zaglavlju/referenci a nigdje u tekstu (kod nas „SKELIN MONT d.o.o.") → objasni ulogu ili ukloni.

---

## 7. FAZA E — JEZIK, STIL, TIPOGRAFIJA

**Ponavljanja (mjeri, ne procjenjuj):**
- Prebroji početke rečenica (npr. „Tjedno izvješće 0X navodi…" — kod nas 22×) i glagole atribucije („navodi" ~49×). Cilj: razbij obrazac, variraj uvode (prema…, iz izvješća proizlazi…, zabilježeno je…, u zagradu na kraj rečenice).
- **Hedžing** o dokumentaciji koja nedostaje („nije priložen/dostavljen/potvrđen") — ako se ponavlja u svakom potpoglavlju, **koncentriraj jednom** (npr. u tablicu ograničenja), dalje kratko „(v. Tablicu 2)".
- Ponavljajući „motivi" (ista misao 5×) → reci jednom, dalje skraćeno.

**Ritam:** raspodjela duljine rečenica; nizovi prekratkih „staccato" rečenica → spoji poneku veznikom, „udarnu" kratku zadrži na 2–3 ključna mjesta.

**Gramatika/pravopis:** padeži, sklonidba brojeva, interpunkcija; **oprez — tipfeler zna biti skriven razbijenim runovima** (traži po kontekstu, ne samo po cijeloj riječi).

**Hrvatska tipografija (checklist):**
| Provjera | Ispravno |
|---|---|
| Navodnici | **„…"** (otvarajući U+201E, zatvarajući U+201D). NE „…" (U+201C je njemački!) i NE ravni `"` |
| Crtice | en-crtica **–** za raspone (2019–2024, 16–22 mm) i umetnute rečenice; ne spojnica `-` |
| Množenje | znak **×** (80 × 80 mm), ne slovo „x" |
| Decimale | zarez (4,50 m), ne točka |
| Jedinice | razmak broj–jedinica (40 t, 100 mm, 230 bar); idealno **NBSP** da ne prelamaju red |
| Kut vs temperatura | 10° (bez razmaka) ali 20 °C (s razmakom) |
- Provjeri **dosljednost zapisa istog** (npr. „M20 × 60 mm" u tekstu vs „M20×60" u tablici → ujednači).

**Terminologija:** isti pojam = isti zapis (podrožnica, autodizalica, sendvič-panel); ne miješaj sinonime za isti element bez definicije (spojna vs priključna ploča).

---

## 8. FAZA F — STRUKTURA I FORMATIRANJE (Word-mehanika)

**Naslovi i sadržaj:**
- Naslovi moraju koristiti **prave stilove** (Heading 1/2/3) s outline razinama.
- SADRŽAJ = **TOC polje** (`TOC \o "1-2" \h \z \u`), ne ručno tipkano. Isto POPIS TABLICA/SLIKA = **Table of Figures polja** (`TOC \c "Tablica"` / `"Slika"`).
- Postavi **`<w:updateFields w:val="true"/>`** u `settings.xml` (schema-pozicija: prije `compat/rsids/mathPr`, ne na početku) → Word osvježi pri otvaranju.

**Natpisi i reference:**
- Natpisi tablica/slika = **SEQ auto-numeracija** (`SEQ Tablica \* ARABIC`), ne ručni brojevi.
- Spomeni u tekstu = **REF unakrsne reference** na bookmark natpisa (number-only bookmark oko SEQ polja → gramatički čisto: „u Tablici {REF}").
- Natpis tablice **iznad**, slike **ispod**; „Izvor:" linija dosljedna.

**Tablice — česti uzroci „praznina" i „zaključanosti":**
- `<w:pageBreakBefore/>` na **natpisu prikaza** = prisilni prijelom → velika praznina + tablica „prikovana" (ne može se pomaknuti). **Ukloni** ga; caption stil neka ima `keepNext` (ostane uz tablicu). Na **naslovu poglavlja** je suprotno: većina fakulteta ga propisuje, pa ondje nije nalaz — provjeri `prijelom_pred_poglavljem` u profilu prije nego dirneš išta.
- `tblLayout w:type="fixed"` = kruti stupci → prebaci na **`autofit`** za slobodno uređivanje.
- Provjeri stvarno zaključavanje: `documentProtection`, `<w:permStart>`, `<w:lock>` u SDT-u, **plutajuće tablice** `<w:tblpPr>`, `trHeight hRule="exact"`. Kod nas ničega nije bilo — problem su bili prijelomi.

**Fontovi (kad se traži jedan font posvuda, npr. Arial):**
- Ne gledaj samo Normal stil! Provjeri **theme** (`major`/`minorFont` u `theme1.xml` — Calibri/Cambria znaju „probijati" kroz `majorHAnsi`/`minorHAnsi`), **docDefaults**, stilove naslova (Title/Heading koriste `majorHAnsi`), Caption (nasljeđuje `minorHAnsi`), footer.
- Najrobusnije: postavi theme major/minor na traženi font **I** eksplicitno u docDefaults + Heading/Title/Caption stilove. Provjeri i `stylesWithEffects.xml` (legacy kopija).

**Uvlačenje odlomaka:**
- Uvlaka prvog retka dolazi iz **stila Normal** (`<w:ind w:firstLine="…">`) i primjenjuje se na sve što nema vlastiti override — **uključujući ćelije tablica**.
- Ako se traži „bez uvlake": Normal `firstLine="0"`. ALI ako odlomci nemaju razmak iza (`after`), maknuta uvlaka ih **stopi** → dodaj `after` (npr. 120) na prozne odlomke da ostanu odvojeni.

---

## 9. FAZA G — ISPRAVCI (kako, a da ništa ne slomiš)

**Redoslijed:** jasne pogreške odmah → stilske izmjene tek uz potvrdu tona.

**Uređivanje proze koja je razbijena u runove (Word re-save):**
- Radi na razini **cijelog odlomka**: uzmi puni tekst odlomka (python-docx), prepiši, pa **zamijeni sve runove jednim novim runom**, uz očuvanje `<w:pPr>`.
- **NIKAD ne kolabiraj runove odlomka koji sadrži polje** (REF/SEQ) — uništio bi polje. Takve odlomke preskoči ili rekonstruiraj tekst-prije + polje + tekst-poslije.
- Escape `& < >` u novom tekstu; koristi `<w:t xml:space="preserve">`.

**Delegiranje teškog prepisivanja (subagent):**
- Daj STROGA pravila: sačuvaj svaki `[XX]` (isti skup), svaku brojku/mjeru/normu/tvrtku/datum; ne dodaji tvrdnje; zadrži registar i tipografiju.
- **Verificiraj sam prije primjene**: za svaki odlomak usporedi skup citata original vs rewrite (mora biti identičan) + provjeri prisutnost ključnih tokena. Odbaci sve što ne prođe.

---

## 10. VERIFIKACIJA I ISPORUKA (nakon SVAKE runde)

```
✔ XSD validacija (validate.py --original)         → struktura ispravna
✔ fldChar begin == separate == end                → polja uravnotežena
✔ citati: definirano = citirano, 0 siročadi/rupa  → referenciranje čisto
✔ ključne brojke/činjenice i dalje prisutne        → ništa izgubljeno
✔ cross-check spot (sporne vrijednosti stoje)      → sadržaj vjeran građi
✔ tipografija (navodnici, ×, zarez) očuvana
✔ prethodni popravci netaknuti (font, prijelomi, uvlake)
```
- **Render ako može** (LibreOffice `--convert-to pdf`) za vizualnu potvrdu. Ako sandbox ubija soffice (događa se) → provjeri na razini XML-a i **budi iskren** da nema pixel-rendera. Ne šalji pandoc-PDF kao „dokaz fonta" (pandoc ignorira fontove i prikazuje serif → zavara).
- **Verzioniraj** isporuku jasnim imenom; reci korisniku da otvori baš tu datoteku i **Ctrl+A → F9** za osvježavanje polja.

---

## KATALOG ZAMKI (što nas je konkretno ugrizlo)

| Zamka | Simptom | Rješenje |
|---|---|---|
| Drive 10 MB limit | ZIP se ne preuzima | traži upload u chat |
| Sandbox blokira Google/curl | HTTP 000 | ne preuzimaj izravno |
| LibreOffice pada u sandboxu | prazan PDF, „exit 1" i na praznom fajlu | verificiraj na XML-u, budi iskren |
| Regex po XML-u | lažni tokeni („4A", 6152 navodnika) | koristi python-docx |
| Word re-save: split runovi | substring pretraga zakaže | radi po odlomku / traži po kontekstu |
| `_GoBack` presiječe riječ | skriveni tipfeler („ivješća") | traži oko bookmarka |
| Word omota TOC u SDT | `TOC \o "1-2"`→`"1-3"`, PAGEREF | očekivano; sačuvaj SDT |
| pandoc dvostruki razmaci | lažni „172 double-space" | ignoriraj (artefakt tabova/polja) |
| pandoc reordering natpisa | „2…Tablica" u pregledu | artefakt; XML je ispravan |
| pandoc ignorira fontove | serif u pregledu | ne koristi za font-dokaz |
| `pageBreakBefore` na natpisu prikaza | praznina + „zaključana" tablica | ukloni; caption `keepNext` |
| `pageBreakBefore` na naslovu poglavlja | nije greška — propisano formatiranje | ostavi; `--strip-breaks` je opt-in |
| hrvatski APA „(Čavlek i sur., 2011.)" | citat s točkom iza godine | `CITE_AY_RE` mora dopustiti `\d{4}\.?` prije `)` |
| narativni citat „Faulkner (2001.)" | 60–70 % citata nevidljivo | provjeri i narativni oblik, ne samo zagradni |
| sklonidba i višečlana prezimena | „Albersa", „van Heiningen", „TUI AG" kao siročad | usporedi po osnovi, ne po golom nizu |
| „1.465 milijuna" | lažna prijava decimalne točke | granica `(?![\w])` iza mjerne jedinice |
| theme Calibri/Cambria | „naslovi nisu Arial" | promijeni theme + docDefaults + stilove |
| Normal `firstLine` | uvučene i ćelije tablica | Normal `firstLine=0` + dodaj `after` |
| updateFields krivo pozicioniran | schema greška (`zoom` unexpected) | umetni prije `compat/rsids/mathPr` |
| globalni toggle-state za navodnike | jedan nesparen `"` (npr. inč-oznaka 12") zarazi sve navodnike do kraja dokumenta | resetiraj state PO ODLOMKU (v. `apply_safe_fixes.fix_quotes_by_paragraph`); prijavi neparne odlomke |
| substring-match nakon normalizacije razmaka | "40 t" lažno potvrđen jer se poklopi s nepovezanim "40 tvrtke" preko granice rečenice | `cross_check.py` sad ispisuje ±40 znakova konteksta oko svakog pogotka — uvijek pogledaj prije nego proglasiš potvrđenim |
| neprihvaćene tracked changes / komentari | brojanje citata/brojki nepouzdano (obrisan tekst zna ostati u ekstrakciji, umetnut zna nedostajati) | `check_fields.py` javlja `w:ins`/`w:del`/komentare; prihvati sve prije audita (`docx` skillov `accept_changes.py`) |
| fiksni domenski rječnik (samo čelik/krovišta) | za druge inženjerske radove skripte ne nalaze ništa korisno | `domains/` paketi (celik/elektro/strojarstvo/it) + auto-detekcija + generički frekvencijski fallback |
| citiranje samo IEEE `[N]` pretpostavljeno | autor-godina radovi (FPZG i sl.) potpuno nepokriveni | `check_citations_authoryear.py` + `common.detect_citation_style` auto-izabire stil |
| ćelije tablica zalijepljene IZA body-ja prije LITERATURA splita | citat samo u tablici → lažno „siroče"; redak tablice `[5] oznaka` → lažna referenca | split računaj SAMO na body, ćelije/fusnote dodaj u `used_text` NAKON splita |
| fusnote dodane u tekst PRIJE splita | fusnote uvijek padnu iza naslova literature → citati u fusnotama nevidljivi (baš Chicago slučaj) | isto — split na body, fusnote u `used_text` |
| `[2020]` (godina u uglatoj zagradi) | broji se kao IEEE citat #2020 → lažni „citat bez reference" | brojevi >999 nisu citati — prijavi posebno kao vjerojatnu godinu |
| globalna zamjena U+201C→U+201D | ispravan engleski “…” par (Abstract) postane ”…” — tiho | pretvaraj samo u odlomku koji sadrži i „ (U+201E) |
| `x`→`×` na hex literalima | `0x41` → `0 × 41` — tiho kvarenje (IT domena) | alternacija koja hex literal prepozna i preskoči |
| kratica štićena substring-replaceom | `"st."` proguta točku SVAKE -ost imenice na kraju rečenice → iskrivljena statistika rečenica | štiti kraticu samo kao samostalnu riječ (lookbehind na ne-slovo) |
| `w:spacing` postoji i u `rPr` (razmak slova) | uvjet `"<w:spacing" in p` ubaci `w:after` u rPr → XSD-nevaljan dokument | umeći isključivo unutar `<w:pPr>` spana, na schema-ispravno mjesto |
| non-greedy `<w:p\b.*?</w:p>` | ugniježđeni `</w:p>` textboxa prereže odlomak → tekst iza textboxa tiho preskočen | depth-aware iteracija top-level paragrafa (`top_level_paragraph_spans`) |
| `styleId="Normal".*?firstLine` non-greedy | kad Normal NEMA firstLine, regex doskoči do PRVOG SLJEDEĆEG stila (Heading!) i promijeni njega | mijenjaj isključivo unutar `<w:style styleId="Normal">…</w:style>` bloka |
| `\b` iza ne-word znaka (`%`, `°`) u regexu jedinica | `45 %` i `10°` NIKAD ne matchaju (mrtva grana) | završna granica `(?!\w)` umjesto `\b` |

---

## ALATI / NAREDBE (cheat-sheet)

```bash
# ekstrakcija
pandoc rad.docx -t plain -o rad.txt
pdftotext -layout src.pdf src.txt
unzip -q rad.docx -d unpacked/ && find unpacked -type l -delete

# docx skill helperi (apsolutne putanje)
python3 /root/.claude/skills/docx/scripts/merge_runs.py unpacked/        # spoji fragmentirane runove
python3 /root/.claude/skills/docx/scripts/office/validate.py out.docx --original rad.docx
python3 /root/.claude/skills/docx/scripts/office/soffice.py --headless --convert-to pdf out.docx
python3 /root/.claude/skills/docx/scripts/accept_changes.py rad.docx out.docx   # prihvati tracked changes

# rebuild
(cd unpacked && zip -qXr ../out.docx .)
```
- Čist tekst + tipografija: **python-docx** (paragraphs + tables), plus `common.load_supplementary_text`
  za fusnote/endnote/header/footer (python-docx `.paragraphs` ih ne pokriva).
- Provjere: `check_citations.py` (IEEE skup citata) / `check_citations_authoryear.py` (autor-godina,
  heuristika), `check_fields.py` (balans `fldChar` + tracked changes/komentari), `numbers_inventory.py`
  (aritmetika brojki, domenski paket auto-detektiran preko `domains/`), `cross_check.py` (tvrdnja vs
  izvor, s kontekstom oko pogotka), `check_overlap.py` (doslovno preklapanje bez oznake citata —
  n-grami), `check_repetition.py` (ponavljanja/ritam).
- `generate_report.py` pokreće sve gornje, razvrstava nalaze (Kritično/Srednje/Kozmetičko po
  ključnim riječima) i sprema Markdown (+ opcionalno JSON) — koristi za finalnu isporuku umjesto
  ručnog kopiranja terminal ispisa.

---

## SAŽETI TIJEK (TL;DR)

**Građa → Ekstrakcija → Kontekst/pravila → A Integritet → B Citati → C Tehnika → D Cross-check → E Jezik/tipografija → F Formatiranje → G Ispravci → Verifikacija → Isporuka.**
Nakon svake izmjene: **validacija + citati + brojke + polja.** Jasne pogreške odmah, stil uz potvrdu, ništa izmišljeno, sve neovisno provjereno.


---

## v1.3 — nalazi koje faza B i faza C nisu hvatale

Sve niže prošlo je postojeće provjere jer one gledaju **postoji li** referenca, a ne **pokriva li
stranica tvrdnju**, odnosno **zbraja li se** skup, a ne **odakle svaka kategorija dolazi**.

### Faza B — tri pin-cite nalaza (`check_citations_authoryear.pin_cite_nalazi`)

| Nalaz | Uvjet | Zašto |
|---|---|---|
| `PIN_CITE_RASPON` | stranica u citatu jednaka rasponu jedinice u popisu | „(Klarin, 2009: 89–96)" znači „negdje u ovom tekstu", ne pin-cite |
| `PIN_CITE_RUB` | stranica je prva ili zadnja stranica jedinice | često znak da je podatak preuzet iz sažetka ili zaključka; u ciklusu iz kojega je nastalo šest od trinaest izvora bilo je citirano samo tako, uključujući mentorovu knjigu |
| `PIN_CITE_PONOVLJEN` | isti (autor, godina, stranica) uz dvije različite tvrdnje | jedna stranica ne može biti izvor za dva različita nalaza |

Uz njih ostaje ručna provjera koju stroj ne može: **stoji li na navedenoj stranici ono za što je
citirana**. U istom ciklusu jedan je citat vodio na stranicu 27, a tvrdnja je bila na stranici 23
— i to u mentorovu vlastitom tekstu, gdje stranica 23 tvrdi suprotno.

### Faza C — zbroj kategorija (`numbers_inventory.zbroj_kategorija`)

Kad niz brojeva u rečenici tvori cjelinu (N = a + b + c + d), alat to prijavljuje **i kad se
zbroj slaže**, jer se pita nešto drugo: ima li svaka kategorija vlastitu uputnicu i dolaze li sve
iz istoga izvora s navedenim danom presjeka.

Slučaj iz kojega je nastalo: kategorija je bila podignuta s 19 na 21 upravo toliko da zbroj izađe
na 161 nakon što je peta kategorija (dva predmeta u ponovljenom suđenju) ispuštena. Recenzent je
provjerio da se zbraja, da postoci daju 100,0 %, i proglasio prikaz ispravnim. **Unutarnja
dosljednost bila je postignuta falsificiranjem.**

Alat vraća i `ima_uputnicu: false` kad u rečenici nema uputnice — to je najjači pojedinačni signal.
