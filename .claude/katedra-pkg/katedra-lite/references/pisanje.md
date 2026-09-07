# MOD 2 i 3 — PISANJE I POBOLJŠANJE

> Mod 2 piše po odobrenom planu. Mod 3 popravlja postojeći tekst i vodi ga
> `references/stil_pipeline.md`. Zajedničko im je sve ispod.

---

## 0. Prije prve rečenice — gdje tekst živi

**Markdown je izvor istine, `.docx` je izvedeni artefakt.** Poglavlja se pišu u
`.katedra/poglavlja/NN-naziv.md`, jedno po datoteci, a dokument se iz njih
SASTAVLJA. Ne piši poglavlje u razgovor pa neka ga student prekopira, i ne upisuj
ga izravno u `.docx`.

```bash
python3 <KATEDRA_SKILL>/scripts/rukopis.py init            # kostur iz plana.json
python3 <KATEDRA_SKILL>/scripts/rukopis.py status          # koliko je napisano
python3 <KATEDRA_SKILL>/scripts/build_docx.py --fakultet <slug> --tip <tip> \
    --rukopis --out ./rad.docx --provjeri
```

Zašto tako: upis u markdown je običan zapis datoteke — verzionira se u gitu, diff
se vidi, a prekinuta sesija nastavlja se ondje gdje je stala. Upis u `.docx` bi za
svako poglavlje morao naći mjesto u tuđem XML-u i ne razbiti unakrsne reference, a
to puca na svakom ručnom oblikovanju.

**Cijenu reci studentu izrijekom, ne prešuti je:** ono što dotjera rukom u Wordu
gubi se pri sljedećem sastavljanju. Word je za čitanje i mentora; pisanje ide kroz
rukopis. Ako student inzistira na Wordu kao izvoru istine, to je legitimno — ali
tada se poglavlja ne generiraju nego se dokument samo provjerava i popravlja
(`check_rules.py`, `fix_rules.py`).

Konvencije rukopisa (iste kao u skillu `fpzg-diplomski`, pa se isti rukopis može
predati i njemu): `# Naslov` je poglavlje, `## ` potpoglavlje, `**podebljano**` i
`*kurziv*`, `- ` i `1. ` popisi, `> ` blok-citat, markdown tablica s natpisom
IZNAD i retkom `Izvor:` ISPOD, `[[PB]]` prijelom stranice. Redoslijed poglavlja
dolazi iz broja u imenu datoteke — bez njega bi abeceda stavila zaključak pred uvod.

## 0b. Tko radi dokument

**Prvo pitaj tko radi dokument.** Za fakultet koji ima vlastiti skill za izradu
(FPZG → `fpzg-diplomski`) dokument radi TAJ skill — on zna kućni stil, unakrsne
reference, popise prikaza i grafikone. Katedrin generator je rezerva:

```bash
python3 <KATEDRA_SKILL>/scripts/vjestine.py --sposobnost izrada.docx --fakultet <slug>
```

Granica i razlog: `references/vjestine.md`. Dvije skripte koje rade `.docx` postoje
namjerno; ono što ne smije postojati je nezapisana granica među njima.

Katedra do audita nije proizvodila `.docx`, samo ga je ocjenjivala: student je
dokument slagao ručno, a alat mu je poslije govorio što nije u redu. Šest od
četrnaest blokirajućih stavki iz `references/predaja.md` §2 su čisto mehaničke i
jeftinije ih je proizvesti ispravno nego naknadno prijavljivati.

```bash
python3 <KATEDRA_SKILL>/scripts/build_docx.py --fakultet <slug> --tip <tip> \
  --tema "..." --autor "..." --mentor "..." --godina 2026 \
  --plan ./.katedra/plan.json --out ./rad.docx --provjeri
```

Dobiva se naslovnica s podacima iz stanja, izjava, sažetak/summary, **sadržaj kao
Wordovo POLJE** (ne natipkan popis), rimska numeracija do Uvoda pa arapska od 1,
prijelom pred poglavljem ako ga profil traži, i primjer prikaza s ispravnim
sklopom natpis + tablica (`cantSplit`) + „Izvor:". Poglavlja dolaze iz
`plan.json` ako je predan.

`--provjeri` odmah pokrene `check_rules.py` nad vlastitim izlazom. Ako to padne,
ili generator ne poštuje profil ili ga provjera krivo čita — u oba slučaja se ne
nastavlja dalje.

**Student i dalje piše sadržaj.** Kostur ne piše nijednu rečenicu rada: sve
sadržajne pozicije su uglate zagrade koje `check_placeholders.py` pred predajom
mora naći praznima.


## 1. Kako se piše (mod 2)

### 1.1 Nikad „gdje smo stali"

```bash
python3 <KATEDRA_SKILL>/scripts/plan_state.py next
```

Vraća prvo potpoglavlje sa `status: nije-napisano`, s planiranim opsegom, sadržajem
i izvorima. To je dovoljno da se odmah piše. `nastavi rad` ne znači pitanje korisniku
nego ovaj poziv.

Nakon svakog potpoglavlja:

```bash
python3 <KATEDRA_SKILL>/scripts/plan_state.py mark 4.2 --status napisano --rijeci 820
```

### 1.2 Jedno potpoglavlje po ciklusu

Piši potpoglavlje → self-check (§4) → upiši status → tek onda sljedeće. Pisanje tri
poglavlja odjednom uvijek daje tekst koji se u drugom poglavlju počne ponavljati, a
u trećem izgubi tezu.

### 1.3 Struktura odlomka

Svaki odlomak nosi **jednu ideju** i ima:

1. tematsku rečenicu — o čemu je odlomak
2. objašnjenje pojma — što znači, kako funkcionira
3. primjer ili razradu — konkretno, kontekstualizirano
4. referencu, ako se iznosi tvrdnja koja traži potkrjepu
5. mini zaključak ili prijelaz — što iz ovoga slijedi

Ne staj na razini definicije. Definicija bez implikacije, ograničenja ili usporedbe
je enciklopedijski unos, a ne akademski tekst.

Geometrija odlomka dolazi iz profila fakulteta (`format.odlomak`), a provjerava se
u stvarnom prijelomu, ne procjenom po znakovima:

```bash
python3 <KATEDRA_SKILL>/scripts/profile_resolver.py --fakultet "<alias>" --tip <tip> --profile-out .katedra/resolved_profile.json
python3 <KATEDRA_SKILL>/scripts/check_paragraphs.py ./rad.docx --profil .katedra/resolved_profile.json
```

### 1.4 Struktura rada

**Uvod**: kontekst i relevantnost, istraživačko pitanje, cilj, teza, kratki pregled
strukture poglavlja — šest elemenata, i svi moraju biti tu. **Razrada**: logička
poglavlja, teorija povezana s analizom — ne dva odvojena bloka koji se nikad ne sretnu.
**Zaključak**: sažetak nalaza, direktan odgovor na istraživačko pitanje iz uvoda,
implikacije i preporuke.

Zaključak koji ne odgovara na pitanje iz uvoda je najčešći razlog zašto formalno
uredan rad dobije četvorku. Drugi najčešći razlog jest da je odgovor već potrošen u
raspravi — v. `references/rasprava.md` §6.

**Poglavlja koja imaju vlastiti protokol.** Ne piši ih iz ovoga poglavlja:

| Poglavlje | Protokol | Zašto zaseban |
|---|---|---|
| Metodologija | `references/metodologija.md` | osam odjeljaka; piše se u modu 1, ne kad se dođe do njega po redu |
| Rasprava | `references/rasprava.md` | četiri poteza po nalazu; jedino mjesto gdje se nalaz sudara s literaturom |
| Summary / ključne riječi (EN) | `references/engleski.md` | prevodi se iz **gotovog** hrvatskog sažetka, nikad paralelno |

Popis svih dijelova rada i onoga tko ih provjerava: `references/dijelovi.md`.
Nakon svakog gotovog dijela upiši status:

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --set <dio>=napravljeno
```

### 1.5 Karta premještanja — kad mentor traži hrpu strukturnih pomaka

Zamjerke tipa „ovo pripada u poglavlje 3, ne 2" rijetko dolaze pojedinačno — obično ih je
odjednom šest do deset. Izvođenje jedne po jedne, redoslijedom iz dokumenta, stvara novu
zbrku: premještanje #3 mijenja kontekst koji je #1 već pretpostavljao. Prije nego što se
dirne ijedan odlomak, napravi kartu premještanja:

```bash
python3 <KATEDRA_SKILL>/scripts/zamjerke.py grupiraj --po mjesto
```

Iz toga se vidi obrazac (npr. „četiri zamjerke traže da se poglavlje 2 preseli u 4") koji se
rješava jednim prolazom kroz strukturu, ne kroz izolirana uređivanja koja se međusobno
poništavaju. Kod opsežnog restrukturiranja često je jeftinije poglavlje prepisati iz
`.katedra/poglavlja/*.md` iznova, s odlukom o mjestu svakog dijela unaprijed, nego raditi
kirurgiju nad postojećim odlomcima — v. §0 o rukopisu kao izvoru istine.

---

## 2. Citiranje

Format dolazi iz profila (`citiranje.u_tekstu`), ne iz navike. Tablica je samo
ilustracija — **dijalekt i oblik u tekstu uvijek dolaze iz `resolved_profile.json`
(`citiranje.stil`, `citiranje.u_tekstu`), nikad iz ove tablice**; kad se tablica i profil
razlikuju, profil ima pravo, a tablica se ispravlja (v1.9: red FPZG je nosio `str.`, a
profil `fpzg.json` traži dvotočku bez „str." — `(Becker, 2007: 9)`).

| profil | u tekstu | u popisu |
|---|---|---|
| `autor-godina` (FPZG) | `(Lindblom, 1959: 81)` — **dvotočka** pred stranicom, bez „str.", godina bez točke | s uvlakom, `Prezime, Ime (Godina) Naslov. Mjesto: Nakladnik.` |
| `apa-hr` (EFZG) | `(Čavlek, 1998., str. 41)` | bez uvlake, **zarez** iza godine, bez završne točke |
| `ieee` | `[1]`, `[2, 3]`, `[4]–[6]` | brojčani popis prema redoslijedu citiranja |
| `vancouver` (HKS-FZS, MEF) | `(12)`, `(12, 15)`, `(12–15)` — ovalne zagrade, en-crtica u rasponu, razmak iza zareza, prije interpunkcije | `1. Autor A, Autor B. Naslov. Časopis. 2020;12(3):45–50.`, „i sur." nakon 6 autora, po redoslijedu prvog pojavljivanja |
| `legal-footnote` | nadredni broj fusnote | fusnota može sadržavati literaturu, propis, sudsku odluku ili EU akt |

Pravila koja vrijede svugdje:

- **Točan locator uz specifičnu tvrdnju.** Za literaturu je to najčešće stranica; za pravne izvore članak/stavak/točka ili oznaka odluke prema uputama fakulteta.
- Citat ide **odmah uz tvrdnju**, ne na kraj odlomka.
- `(ibid.)` se ne koristi u tekstu.
- **Stranica koja postoji, ali nije potvrđena → `[PROVJERI STR.]`**, i završi u tablici
  „RUČNO PROVJERI". To je PRIVREMENO stanje: lokator čeka provjeru iz same datoteke.
- **Izvor koji stranicu uopće nema se locira po odlomku** — `(Autor, godina: odl. 3)`,
  odnosno `(N, odl. 3)` u numeričkim dijalektima. To je TRAJNO stanje i gotov lokator:
  `[PROVJERI STR.]` ondje ne stoji jer nema što čekati. Vrijedi za mrežne izvještaje,
  HTML članke, institucijske objave i svaki `.txt`/`.md` bez tiskanog prijeloma.
- Tvrdnja koje nema u priloženoj građi → `[TREBA IZVOR]`. **Ništa se ne izmišlja.**

Dozvoljeni izvori su konkretne bibliografske jedinice: recenzirani članci, knjige i
monografije, službeni dokumenti institucija te relevantni datasetovi/statistike. HRČAK i
JSTOR mogu hostati konkretan rad; **Google Scholar je discovery servis, ne izvor**. Ako je
članak pronađen preko Scholara, u bibliografiji se navodi članak, a discovery kanal se po
potrebi bilježi kao `discovered_via: google_scholar`.

Kod `legal-footnote` profila first-class su i propisi, sudske odluke i EU akti. B10 ih
tipizira (`law`, `regulation`, `court_decision`, `eu_act`); B11 provjerava identitet i
source-quality metadata. Citation parser sam ne potvrđuje da izvor postoji.

`verify_sources.py` koristi stabilne semantičke statuse:

- `verified` — automatika je potvrdila identitet/lokator u deklariranom scopeu;
- `unverified` — automatika nema dovoljno dokaza ili je provider nedostupan; **nije dokaz da izvor ne postoji**;
- `conflict` — postoji kontradiktoran dokaz (npr. DOI vodi na očito drugo djelo); blokira do razrješenja;
- `invalid` — negativno potvrđen/nevaljan source entity; blokira do ispravka ili zamjene.

Quality taxonomy: **A/B/C/D/E/X** = A primarni/službeni/peer-reviewed · B akademski
sekundarni · C institucionalni izvještaj · D reputabilni kontekstualni/novinarski · E
samo discovery · X neprihvatljiv ili kontradiktoran. Klasa se automatski dodjeljuje samo
kad postoje dovoljni dokazi; inače ostaje `needs_classification`.

```bash
python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./literatura.md
python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./literatura.md --discovered-via "Google Scholar" --json ./.katedra/izvori.json
```

`conflict` i `invalid` ne ulaze u rad dok se problem ne razriješi. `unverified` ide u
**RUČNO PROVJERI** (npr. hrvatska knjiga bez Crossref zapisa, katalog NSK/Hrčak/službeni
katalog), ali se ne briše samo zato što automatika nije pronašla potvrdu.

### 2.0b Produbljivanje bez izmišljanja

Zamjerka „ovo poglavlje je plitko, produbi" ne rješava se izmišljanjem detalja (datuma,
brojki članaka, imena studija) da tekst zvuči uvjerljivije. Prvo provjeri već citirane izvore
u poglavlju — autor citiran za jednu tvrdnju često ima i druge, dobro poznate nalaze koji
izravno produbljuju istu temu bez novog izvora (npr. Cook i sur. 2005 već citiran za
definiciju kompleksne traume redovito nudi i tipologiju domena oštećenja iz istog rada). Tek
ako produbljenje traži nešto čega nema u `izvori.json`, stavi `[TREBA IZVOR]` i idi dalje —
ne izmišljaj broj da praznina ne bude vidljiva. Brojevi propisa, članaka i NN-oznaka posebno
su rizični jer zvuče provjerljivo dok sjećanje o točnom broju vara: „iz sjećanja" ide pod
`[PROVJERI ČL.]` / `[PROVJERI NN BR.]` (vokabular: `references/intake.md` § 0.7b), nikad kao
gotova tvrdnja. Rad koji tiho nosi krivi broj NN je gora šteta od rada koji priznaje da nešto
nije provjereno — primjena željeznog pravila 2 na najčešću strukturnu zamjerku mentora.

### 2.1 Page-level evidence i Claim Ledger

`verify_sources.py --json .katedra/izvori.json` svakom izvoru dodjeljuje stabilni
`source_id`. Kad je PDF/TXT/MD stvarno dostupan, ingestiraj ga iz korijena projekta:

```bash
python3 <KATEDRA_SKILL>/scripts/evidence_ingest.py ./izvori/autor2024.pdf \
  --source-id src_... --source-verification ./.katedra/izvori.json \
  --out ./.katedra/evidence.jsonl
```

Svaka izvučena jedinica ima `evidence_id` i locator `page + passage + char range`.
Tvrdnju zapiši i zatim poveži samo s dokazom koji je stvarno podupire:

```bash
python3 <KATEDRA_SKILL>/scripts/claim_ledger.py add \
  --claims ./.katedra/claims.jsonl --text "…" --chapter 2.1
python3 <KATEDRA_SKILL>/scripts/claim_ledger.py link \
  --claims ./.katedra/claims.jsonl --evidence ./.katedra/evidence.jsonl \
  --claim-id clm_... --evidence-id ev_... --relation supports
python3 <KATEDRA_SKILL>/scripts/claim_ledger.py validate \
  --claims ./.katedra/claims.jsonl --evidence ./.katedra/evidence.jsonl
```

**Izvor bez tiskane paginacije.** `page_label` je TISKANA oznaka stranice, ne redni broj
koji bi alat sam dodijelio. Kad je izvor `.txt`/`.md` bez prijeloma stranice ili PDF bez
oznaka, `evidence_ingest.py` upisuje `page_label: null` i `passage: N` — i tu ne nedostaje
ništa. Redni broj koji bi alat izmislio student bi prepisao u citat, a čitatelj ga ne bi
mogao naći ni u jednom otisku; zato je `null` točan podatak, a ne rupa.

```
$ evidence_ingest.py assets/fixture_izvor_bez_paginacije.txt --source-id src_test --out ev.jsonl
[evidence → ev.jsonl] dodano 5 passage(s), zamijenjeno 0, source=src_test
$ grep -c 'page_label": null' ev.jsonl
5
```

Odlomak je stabilna jedinica: granice se izvode iz praznih redaka u normaliziranom tekstu,
ne iz prijeloma retka, pa dva ingesta iste datoteke daju iste granice i isti `evidence_id`.
Citat po odlomku zato je provjerljiv jednako kao citat po stranici, i evidence gate ga
prihvaća bez iznimke. `[PROVJERI STR.]` na takvom izvoru je nalaz o doktrini, ne o izvoru.

`contextualizes` nije isto što i `supports`; `contradicts` se čuva, ne briše.
`claim_ledger.py report` samo opisuje ledger. Prije nego claim uđe u tekst, napravi
**Source Analysis Matrix** i strict evidence gate:

```bash
python3 <KATEDRA_SKILL>/scripts/evidence_gate.py \
  --claims ./.katedra/claims.jsonl --evidence ./.katedra/evidence.jsonl \
  --sources ./.katedra/izvori.json --policy strict --out ./.katedra/evidence_gate.json
```

`unsupported`, `conflicted`, `contradicted` i evidence iz `conflict/invalid` izvora blokiraju
strict gate. `advisory` je samo dijagnostika.

---

### 2.1 B13 rewrite safety gate

Prije izmjene cijelog `.docx` dokumenta napravi strict evidence gate i snapshot. Nakon rewritea
ne prihvaćaj datoteku bez oba safety checka:

```bash
python3 <KATEDRA_SKILL>/scripts/evidence_gate.py \
  --claims ./.katedra/claims.jsonl --evidence ./.katedra/evidence.jsonl \
  --sources ./.katedra/izvori.json --policy strict
python3 <KATEDRA_SKILL>/scripts/diff_versions.py --snapshot ./rad.docx --biljeska "prije rewritea"
python3 <KATEDRA_SKILL>/scripts/verify_rewrite.py ./rad_prije.docx ./rad_poslije.docx \
  --zahvat stil --profil ./.katedra/resolved_profile.json \
  --evidence-gate --require-snapshot
```

Za privremene tekstualne fragmente bez dokument-snapshota koristi `--evidence-gate`;
`--require-snapshot` je gate za stvarnu izmjenu dokumenta.

## 3. Stil

Formalan analitički ton, treće lice, bez kolokvijalizama. Precizni pojmovi
(„institucionalni okvir", „normativni okvir") umjesto praznih apstrakcija. Logički
konektori između rečenica i odlomaka. Umjereno duge, argumentacijski bogate rečenice —
ni telegrafske ni nerazumljive.

**Zabranjene prazne fraze:** „kroz povijest", „od davnina", „u današnje vrijeme",
„neupitno je da", „svima je poznato", „od kada postoji čovječanstvo".

**Zabranjeni prazni šavovi:** „Nadalje", „Osim toga", „Također" — zauzimaju mjesto
veze, a ne nose je.

U tekstu rada nema bullet lista. Povezani odlomci. Liste su dopuštene samo u
meta-komentarima i uputama, nikad u samom radu.

### 3.0 Prije prve rečenice: razina i glas autora

**Prvo razina.** Ona odlučuje koji se pojam definira, a koji pretpostavlja:

```bash
python3 <KATEDRA_SKILL>/scripts/razina.py
```

Šest obveza iz ispisa (SMIJE SE PRETPOSTAVITI / DEFINIRAJ / PRETPOSTAVI / OMJER /
DOPRINOS / REČENICA) ulaze u pisanje jednako obvezujuće kao kućni stil. Niža razina nije
lošiji rad nego rad koji više objašnjava i manje tvrdi — ništa u njoj ne dopušta manje
izvora ni slabiju provjeru. Puni protokol i sudari: `references/razina.md`.

### 3.0a Prije prve rečenice: pročitaj glas autora

Ako postoji `.katedra/stil_autora.json`, njegov popis `izbjegavaj` obvezuje jednako kao
kućni stil fakulteta (v. `references/stil_autora.md`). Nema smisla pisati konstrukciju
koju je autor prošli put ručno brisao.

**Konstrukcije koje se ne pišu jer ih autori dosljedno brišu ili kvare:**

| Ne piši | Piši | Zašto |
|---|---|---|
| apozicija između dviju en crtica: „na pet sektora – vojni, politički i okolišni – od kojih…" | „na pet sektora: vojni, politički i okolišni. Svaki od njih…" | autor ju je pokušao pojednostaviti dvotočkom, izgubio zatvornu crticu i ostavio otvorenu apoziciju |
| ograde: „doduše", „svakako", „zapravo", „dakako" | rečenica bez ograde | ne nose značenje; autori ih brišu prvo |
| polja na naslovnici kojih nema u profilu ni u uzoru („Kolegij:") | samo ono što profil ili uzorak mentora izrijekom traže | dodano „jer koristi", obrisano pri prvom čitanju |

Pravilo iza tablice: **konstrukcija koju autor mora popraviti prilika je da nešto pokvari.**
Tri od pet ručnih zahvata na jednom eseju bile su tipografske regresije — spojnica umjesto
en crtice u rasponu stranica, dvotočka bez razmaka, spojnica u rasponu godina koja je
razbila slaganje natpisa s popisom grafikona. Nijednu od njih autor ne bi napravio da mu
rečenica nije smetala.

### 3.0b Sažetak se piše zadnji i provjerava protiv rada

Sažetak nastaje rano i poslije se ne dira, a rad se u međuvremenu mijenja. Prije predaje
provjeri izrijekom:

* **broj poglavlja iz sažetka = broj naslova prve razine.** Na jednom je radu sažetak
  tvrdio „pet cjelina koje zauzimaju šest poglavlja", a rad ih je imao osam;
* **nijedna tvrdnja sažetka ne smije biti opovrgnuta u tijelu.** Isti je sažetak nudio
  terminal za ukapljeni plin kao dokaz da je anticipacija bila moguća, dok ga je šesto
  poglavlje u međuvremenu razložilo u suprotno;
* svaka rečenica sažetka koja imenuje nalaz mora imati parnjaka u zaključku.

Mentor sažetak čita prvi. Aritmetička netočnost na prvoj stranici skuplja je od bilo koje
u tijelu rada.

Strojno: `python3 <KATEDRA_SKILL>/scripts/provjeri_sazetak.py ./rad.docx --tablica`. Alat
mjeri ono što se dade izmjeriti (broj poglavlja, pojmove, brojke, ključne riječi, parnjaka
u zaključku), a **proturječje ne vidi** — za to ispisuje paritetnu tablicu: svaka tvrdnja
sažetka uz dva mjesta u tijelu koja govore o istome, s brojem poglavlja. Duge se rečenice
sažetka pritom razlažu na tvrdnje, jer bi inače pogodak uvijek padao na prvu i najčešću.

### 3.1 Radni modovi

- **SEMINAR** — 1.500–3.000 riječi, 2–4 poglavlja razrade, 5–10 izvora, fokus na jednom problemu.
- **DIPLOMSKI** — opseg po uputama, dubinska teorija + empirija, metodološki odjeljak, 30+ izvora, koherentnost argumenta kroz cijeli rad.
- **BRUTAL PRECISION** — maksimalna ekonomičnost, svaka rečenica nosi argumentacijsku vrijednost. Za sažetke, recenzije i zahtjevne sekcije.

Deklariraj mod u sažetku prije prvog odlomka.

---

## 4. Self-check nakon svakog potpoglavlja

Prije nego što potpoglavlje proglasiš napisanim:

- [ ] Je li **strict evidence gate PASS** za claimove koji ulaze u ovo potpoglavlje (Source Analysis Matrix bez `unsupported/conflicted/contradicted`)?
- [ ] Je li svaka tvrdnja objašnjena i kontekstualizirana, a ne samo iznesena?
- [ ] Jesu li citati u formatu iz profila, s točnom stranicom?
- [ ] Razvija li se argument, ili se samo nižu informacije?
- [ ] Ima li svaki odlomak tematsku rečenicu i prijelaz?
- [ ] Je li izbjegnuta generička frazeologija (§3)?
- [ ] Nosi li potpoglavlje tezu iz plana, ili je otišlo svojim putem?
- [ ] Je li `provjeri_jezik.py` čist od ❌ nalaza (pravopis i gramatika)?
- [ ] Je li ijedan pojam definiran **suprotno razini** — poznat pojam objašnjen ili uži pojam pretpostavljen (`razina.py`)?
- [ ] Jesu li **otvorene zamjerke mentora** za ovo mjesto riješene?

```bash
python3 <KATEDRA_SKILL>/scripts/extract_comments.py --otvorene .katedra/zamjerke.json
```

**Zatvaranje zamjerki, ne samo bilježenje.** `extract_comments.py` zamjerke OTVARA;
zatvaranje ide kroz `scripts/zamjerke.py`, ne ručnim uređivanjem `zamjerke.json` — ručni upis
ne ostavlja trag zašto je nešto proglašeno riješenim:

```bash
python3 <KATEDRA_SKILL>/scripts/zamjerke.py resolve z23 --status rijeseno \
    --napomena "Dodan odlomak o posljedicama tjelesnog zlostavljanja, poglavlje 3.1."
python3 <KATEDRA_SKILL>/scripts/zamjerke.py provjeri
```

Treći status, `djelomicno`, je za zamjerke adresirane, ali s odlukom koju alat ne smije
donijeti umjesto autora (npr. „treba li sekundarno referiranje" je studentska odluka).
`provjeri` vraća izlazni kod 1 dok god išta ostaje `otvoreno` — koristi kao blokirajuću
provjeru prije mod 6.

Nakon većeg bloka (poglavlje i više):

```bash
python3 <KATEDRA_SKILL>/scripts/check_ai_style.py ./ch4.md
python3 <KATEDRA_SKILL>/scripts/check_argument.py ./rad.docx --profil ./.katedra/resolved_profile.json
```

---

## 5. Poboljšanje postojećeg teksta (mod 3)

**Ne kreći prepisivati prije mjerenja.** „Zvuči robotski" nije jedna mana nego četiri
neovisne, a popravljanje jedne kvari drugu. Cijeli postupak, pragovi i predložak za
delegiranje su u **`references/stil_pipeline.md`** — obavezno pročitaj prije zahvata.

Kratko: izmjeri → ukloni tikove → poveži → prelomi predugo → geometrija odlomaka.
Nakon svakog koraka ponovno izmjeri i pokreni `verify_rewrite.py` s odgovarajućim
`--zahvat --profil ../.katedra/resolved_profile.json`, kako bi se očuvao upravo deklarirani citatni stil. **Nikad sve odjednom.**

Dijagnoza prije prijedloga, prijedlog prije prepisivanja. Prepisivanje bez potvrde
tona je najbrži način da tekst postane točan i mrtav.

---

## 6. Isporuka

Na kraju svake veće isporuke — tablica **„RUČNO PROVJERI"**:

| što | gdje | zašto |
|---|---|---|
| sva `[PROVJERI STR.]` | popis mjesta | stranica nije potvrđena iz izvora |
| sva `[TREBA IZVOR]` | popis mjesta | tvrdnja nema potporu u građi |
| pretpostavke za mentora | | odluke koje je Katedra donijela sama |
| pravila fakulteta sa `status: nepotvrdeno` | | treba potvrditi iz službenih uputa |
| otvorene zamjerke | `zamjerke.json` | još nisu vidljivo riješene u tekstu |

Tekst gotov → mod 4 (`references/audit.md`). Odstupanja od plana upiši prije toga:
`plan_state.py odstupanje --sto … --zasto …`.

**Kad korisnik traži vizualni prikaz svega što je promijenjeno** (npr. „obojaj crveno što si
promijenio") — to nije `diff_versions.py`, koji radi interni tekstualni sažetak i ne
proizvodi dokument za čitanje:

```bash
python3 <KATEDRA_SKILL>/scripts/revizije.py redline rad_prije.docx rad_poslije.docx redline.docx
```

Rezultat je treći `.docx`: izbrisan tekst crven i precrtan, dodan/izmijenjen tekst crven bez
precrtavanja, bojano izravno preko fonta (ne Wordov `<w:ins>`/`<w:del>`, čija boja ovisi o
recenzentu). Premješteni odlomci pojavljuju se dva puta (brisanje na starom mjestu, dodavanje
na novom) — očekivano ponašanje diffa na razini teksta, ne bug; reci to korisniku uz isporuku.

> Backward compatibility: ako rad ima samo faculty-level pravila i nema programme/work-type/
> course/mentor overlaya, dopušten je i izravni poziv
> `check_paragraphs.py ../rad.docx --profil ../references/fakulteti/<slug>.json`.
> Za RFIR i druge specifične kontekste koristi resolved profil iz `profile_resolver.py`.


---

## Tijek moda — sažeto

> Ovo je bilo u routeru (`SKILL.md` § 2) do v1.7.
> Tijek jednog moda ne treba biti u datoteci koja se učitava u svakoj poruci.

`pisanje.md`. `nastavi rad` = uzmi prvo potpoglavlje iz `plan.json` sa `status: nije-napisano` (`python3 <KATEDRA_SKILL>/scripts/plan_state.py next`), ne pitaj gdje smo stali. Self-check nakon svakog potpoglavlja, pa upiši status i broj riječi.

---

## Redoslijed zahvata nad tekstom je lanac ovisnosti, ne preporuka

Empirijski utvrđeno na stvarnom radu; obrnuti redoslijed je razbio numeraciju i
tražio ponavljanje cijelog kruga.

```
renumeracija literature
        ↓            (markdown nosi KONAČNE brojeve citata)
zamjena / skraćivanje teksta
        ↓
tipografija
        ↓
naslovnice
        ↓
sekcije i numeracija stranica
        ↓
Wordova polja (TOC, SEQ, REF)
```

Zamjena teorijskog dijela mora ići **poslije** prenumeriranja literature: ako se
tekst zamijeni prije, novi tekst nosi stare brojeve citata i numeracija se raspadne.
Isto vrijedi nizvodno — polja se osvježavaju zadnja jer ovise o svemu iznad.

