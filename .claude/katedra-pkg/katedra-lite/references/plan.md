# MOD 1 — PLAN I PROGRAM

> Prvi sadržajni odgovor u svakom novom radu. Nijedno poglavlje završnog ili
> diplomskog ne piše se dok plan nije izrađen i odobren (`plan_odobren: true`).


## Datoteke koje trebam (mod 1 i 2)

Popis prikaži odmah uz potvrdu moda. Za svaku stavku koju nema neka napiše „nemam X” →
to je **ograničenje**, ne blokada.

- 📜 Upute fakulteta za pisanje radova (PDF) — *nemaš? nalazim ih web searchom*
- 📄 Word predložak / naslovnica fakulteta
- 🗂️ Postojeći sadržaj, draft ili bilješke — *aktivira gap-analizu*
- 📚 Literatura koju već imaš (PDF-ovi) — *citati s točnom stranicom umjesto [PROVJERI STR.]*
- 📊 Izvorna građa: izvješća, projekti, podaci — *izvor istine*
- 📝 Prošli rad s komentarima mentora — *ide u `.katedra/zamjerke.json`*

Fali obavezna stavka → upozori **jednom**, navedi što se gubi, pitaj želi li nastaviti
u smanjenom opsegu.

## Četiri formalne odluke

Postavljaju se **nakon** razrješenja profila i **samo za ono što profil ostavlja
otvorenim**; ako profil propisuje, pitanje se preskače i vrijednost se uzima iz profila.

1. **Numeracija stranica** — od naslovnice ili od Uvoda?
2. **Sadržaj** — živo Wordovo polje ili statični popis? *(zadano: živo polje)*
3. **Tablice** — bez boje, sivo, rozo-sivo, plavo, zeleno? *(dodaj „zebra” za naizmjenične retke)*
4. **Unakrsne reference** na tablice i grafikone — da ili ne? *(zadano: da)*

Sve četiri mijenjaju **paginaciju**, a promjena paginacije poništava stilski prolaz. Zato
su jeftine u intakeu i skupe nakon isporuke: u sesiji u kojoj su nastale, sve četiri su
bile sadržaj drugog kruga revizije.

```bash
python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set numeracija=od-uvoda \
  --set sadrzaj=zivo-polje --set tablice_boja=rozo-sivo --set unakrsne_reference=da
```

---

Ako korisnik traži „samo počni pisati": izradi barem **skraćeni plan** i reci zašto.
Plan od jednog dana redovito otkrije razloge zbog kojih rad ne bi dobio ciljanu
ocjenu — nema teze, kriva struktura, formalni propusti, prazna literatura. Jeftinije
ih je naći prije pisanja nego poslije.

---

## 1. Istraži prije nego napišeš ijedan redak plana

### 1.1 Službene upute fakulteta su zakon

Prvo razriješi profil kroz `scripts/profile_resolver.py` (faculty/programme/work type overlayi). Nema canonical profila/overlaya → web search službenih
uputa: margine, font, prored, opseg, struktura, obvezni dijelovi, citiranje, hodogram
predaje. **U planu navedi izvor svakog zahtjeva** — „margine 2,54 cm (Upute, str. 6)".
Zahtjev bez izvora ne postoji.

Zamke pri dohvatu: stranica fakulteta zna raditi 302 na Google Drive i WebFetch tada
vrati samo navigaciju; slijedi redirect i dohvati preko Drive konektora. Kad je
dokument interno nedosljedan, **mjerodavni su prilozi**, ne referenca u tekstu.

Lokalne varijante citiranja su stvarne i važne. EFZG ima vlastitu hrvatsku APA-u:
zarez iza zagrade s godinom, bez završne točke, popis bez uvlačenja. Generički APA
predložak ondje proizvodi nalaz na svakoj jedinici.

### 1.2 Gap-analiza ako postoji materijal

Dostavljeni sadržaj ili draft prođi red po red: numeracija, dupli naslovi, odsječeni
naslovi, nedostajući obvezni dijelovi (engleska naslovnica, izjava o čestitosti,
životopis), format literature, struktura naspram pravila (broj poglavlja, podjednake
duljine potpoglavlja).

Traži i ono što se ne vidi: ručno tipkan sadržaj umjesto TOC polja, zvanje mentora
koje treba provjeriti, poglavlje bez ijednog vlastitog prikaza.

### 1.2a Izmjeri dva obranjena rada sa svojeg odsjeka

Profil nosi ono što Upute pišu; obranjeni rad pokazuje što je **prošlo**. Skini dva rada
iz repozitorija ustanove i izmjeri ih:

```bash
python3 <KATEDRA_SKILL>/scripts/primjerci.py upisi rad.docx --vrsta <tip> \
    --izvor "repozitorij <ustanova>, odsjek <X>, obranjen 2025."
```

Razlika prema profilu **nije kršenje** nego opservacija (željezno pravilo 17), a dva rada
koja se međusobno slažu jači su dokaz od jednoga. Protokol: `references/primjerci.md`.

### 1.2b Zabilježi pretragu DOK traje

Kriteriji uključivanja i isključivanja pišu se **prije** pretrage; kriterij smišljen nakon
što se vidi što je nađeno nije kriterij nego opravdanje.

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py init --pitanje "…" --razdoblje "…" \
    --ukljuci "…" --iskljuci "…"
python3 <KATEDRA_SKILL>/scripts/pretraga.py upit --baza Hrčak --upit "…" \
    --pogodaka 34 --zadrzano 6
```

Baze, građenje upita, snowball, zasićenje i plan čitanja po ulogama:
`references/istrazivanje.md`. Zapis ide u metodologiju (za pregledni rad to **jest**
metoda) i u odgovor na obrani.

### 1.3 Verificiraj podatke prije nego uđu u plan

Svaka brojka u planu ima primarni izvor. Literaturu provjeri alatom:

```bash
python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./literatura.md --json ./.katedra/izvori.json
```

Izvor sa statusom `conflict` ili `invalid` ne ulazi u plan dok se problem ne razriješi. `unverified` nije dokaz nepostojanja: označi ga za ručnu provjeru i ne predstavljaj ga kao `verified`. Označi otvoreni pristup (OA) — student
koji ne može doći do teksta ne može ga ni citirati s točnom stranicom.

### 1.4 Aktualiziraj vremenski okvir

Ako tema ima vremensku dimenziju, provjeri postoje li noviji podaci nego što ih draft
koristi. Rad koji može **ex post testirati** umjesto nagađati skače s opisnog na
analitički — to je razlika između 3 i 5.

---

### 1.5 Perspective map — prije strukture završnog/diplomskog

Za **završni i diplomski** prije izrade/uvesti strukture napravi project-local
`.katedra/perspectives.json`. Cilj nije nabrojati autore nego prije outlinea eksplicitno
mapirati najmanje dvije međusobno različite argumentacijske perspektive: što tvrde,
zašto su relevantne i koji `source_id`/`evidence_id` ih može poduprijeti.

```bash
python3 <KATEDRA_SKILL>/scripts/perspective_map.py init \
  --topic "..." --question "..."
python3 <KATEDRA_SKILL>/scripts/perspective_map.py add \
  --label "Institucionalna" --position "..." --why "..."
python3 <KATEDRA_SKILL>/scripts/perspective_map.py add \
  --label "Bihevioralna" --position "..." --why "..."
python3 <KATEDRA_SKILL>/scripts/perspective_map.py validate --work-type diplomski
```

`plan_state.py import` za završni/diplomski mora biti **nakon** ovog koraka; bez spremnog
perspective mapa PLAN GATE blokira uvoz strukture. Seminarski/esej mogu koristiti mapu,
ali dvije perspektive nisu obavezni preduvjet.

## 2. Struktura dokumenta — sekcije 0–11

Sve su obavezne za završni i diplomski.

**0. Zaglavlje + izvršni sažetak.** Naslov, student (JMBAG), mentor s točnim zvanjem,
ustanova, ciljana ocjena, datum. Zatim 3–5 razloga zašto trenutno stanje NE nosi
ciljanu ocjenu i kako ih plan rješava. Razloge **ne pogađaj**: ako postoji ijedan draft,
pokreni `scripts/rubrika.py` i uzmi popis „drži ga" — to su ti razlozi, izvedeni iz
artefakata umjesto iz dojma (`references/rubrika.md`). Brutalno iskreno — ovo je jedini dio plana
koji korisnik pročita dvaput.

**1. Formalni zahtjevi iz službenih izvora.** Tablica tehničkih zahtjeva (jezik i
lice, margine, font, prored, poravnanje, naslovi, numeracija rimski→arapski, odlomci,
opseg, citiranje). Obvezna struktura s ✅/❌ statusom. Format naslovnice (obje ako
fakultet traži i englesku). Hodogram predaje s realnim trajanjima — Turnitin, uvez i
referada troše 10–14 dana i to se redovito zaboravi.

**2. Gap-analiza** (ako postoji materijal). Tablica mjesto → problem → ispravak.

**3. Analitička jezgra — TEZA.** Jedna obranjiva tvrdnja koja se provlači kroz sva
poglavlja i eksplicitno dokazuje pred kraj rada. Uz nju tablica empirijskih dokaza
(podatak + izvor). Po mogućnosti i sekundarna ili kritička teza.

Test je jednostavan: **može li se s tezom ne složiti?** „Pandemija je utjecala na
turoperatore" nije teza. „Oporavak je vrijednosni, ne volumni — prihod je premašio
2019. dok je broj gostiju ostao ispod" jest, jer se može osporiti podacima.
Bez teze rad je deskriptivan, a deskriptivan rad ne nosi peticu.

**4. Revidirana struktura s budžetom stranica.** Tablica poglavlje → naslov →
stranice → uloga. Poštuj pravila fakulteta (broj poglavlja, podjednake duljine,
razina potpoglavlja). Ispravljen puni sadržaj. Nova potpoglavlja označi i obrazloži
jednom rečenicom.

**Tablicu strukture OBAVEZNO ogradi.** `plan_state.py import` je heuristika: prepoznaje
retke `| 2.1 | Naslov | 2 | … |`. Bez ograde pokupi i hodogram iz sekcije 9
(`| 1 | Odobrenje plana | 9 dana |`) i stavke iz popisa provjera, pa uveze izmišljena
poglavlja — u praksi je to potrošilo pet krugova ispravljanja.

```markdown
<!-- STRUKTURA:POCETAK -->

| Pogl. | Naslov | Str. | Uloga u argumentu |
|---|---|---|---|
| 1. | UVOD | 1 | predmet, cilj, teza, metode |
| 2. | TEORIJSKI OKVIR | 4 | pojmovi i mjerila |
| 2.1 | Pojam i značajke | 2 | |

<!-- STRUKTURA:KRAJ -->
```

Numeracija `N.` i `N.N` unutar ograde rezervirana je **isključivo** za poglavlja rada.
Hodogram, popis isporuka i „ručno provjeri" ostaju izvan ograde i numeriraju se slovima
(`| A | … |`) ili crticama, da ih ni slučajno ne bi netko kasnije obuhvatio ogradom.

**5. Program pisanja po potpoglavljima.** Za SVAKO potpoglavlje: stranice, što točno
ide unutra, kojim izvorima. Legenda: `[P]` postojeći, `[D]` dodatni, `[E]`
empirijski/primarni. **Ovo je jezgra plana** — pisanje poslije postaje izvršavanje,
ne izmišljanje. Sekcija 5 se prepisuje u `plan.json` i po njoj radi `plan_state.py next`.

**6. Plan tablica, grafikona i slika.** Numerirani popis s poglavljem i izvorom.
Ciljaj vlastite izračune („Izvor: autorov izračun prema…") — vrednuju se znatno više
od preuzetih. Rad bez ijedne vlastite tablice čita se kao seminar.

**7. Literatura.** Status postojećeg popisa (što ostaje, što se ispravlja — format,
DOI, abecedni red po hrvatskoj kolaciji). Dodatna literatura mapirana **po
poglavljima**, sva verificirana, s DOI/OA oznakama i jednom rečenicom zašto je koja
obvezna. Ukupan broj + plan rezanja ako mentor traži uže. Pravilo: svaki izvor s
popisa citiran barem jednom, i obratno.

**8. Metodološka upozorenja.** Tablica brojki i tvrdnji koje se NE smiju koristiti
bez ograde: promjene definicija KPI-jeva, neusporedive računovodstvene osnove
(npr. pretkonverzijska godina prije IFRS 16), medijski nepotvrđeni podaci,
preklapajući zbrojevi koji se ne smiju zbrajati. Uz svaku — postupak.
**Ovo mentor koji poznaje temu prvo provjeri.**

**9. Hodogram izrade — unatrag od roka.** Faza → isporuka → trajanje → datum.
Uključi mentorove komentare (2–3 dana po krugu) i administrativni rep (10–14 dana).
Označi kritični put; obično je to odobrenje plana.

**10. Pitanja korisniku prije početka.** Numerirano, samo ono što stvarno mijenja
plan: odobrenje mentora, točan rok, zvanje mentora, posebni zahtjevi, status prijave teme.

**11. Popis isporuka.** Što korisnik dobiva i u kojem formatu: plan (.md/.docx),
prijava teme, Excel „brojka → izvor" za obranu, grafikoni .png 300 dpi, rad .docx po
uputama.

### Tri artefakta koja mod 1 zapisuje, a mod 6 čita

**`.katedra/zadatak.json` — komponente koje uputa izrijekom traži.** Zapiši ih **dok je
uputa pred očima**. Između moda 1 i moda 6 prođu tjedni; uputa se zaboravi, a rad koji
prođe sve formalne provjere a izostavi traženu komponentu pada na sadržaju (željezno
pravilo 14).

```json
{
  "predmet": "Upravljanje poslovnim rizicima",
  "izvor_upute": "uputa nositelja predmeta, listopad 2022. (fotografija)",
  "komponente": [
    { "naziv": "identifikacija rizika u djelatnosti",
      "igle": ["IDENTIFIKACIJA RIZIKA", "identifikacija rizika"] },
    { "naziv": "kvantitativna analiza", "igle": ["KVANTITATIVNA ANALIZA"] },
    { "naziv": "obvezna literatura kolegija", "igle": ["Andrijanić"] }
  ],
  "obavezni_dijelovi_rada": ["sažetak", "ključne riječi", "sadržaj", "literatura"],
  "predaja": { "rok_dana_prije_ispita": 15, "kanal": "e-mail nositelju",
               "naziv_datoteke": "prezime i ime; <predmet> – pristupni rad" }
}
```

Zapis je i mjesto gdje **nedosljednost same upute** ostaje vidljiva: u sesiji u kojoj je
nastao, subjekt e-maila iz upute navodio je drugi predmet. Takvo se ne izglađuje u tišini
nego iznosi korisniku.

**`.katedra/razina.json` — razina rada i čitatelj.** Zadaj ju **prije nego napišeš ijedan
redak strukture**: ona određuje omjer teorije i analize u sekciji 4 i očekivani doprinos u
sekciji 3.

```bash
python3 <KATEDRA_SKILL>/scripts/razina.py --tip <tip>
python3 <KATEDRA_SKILL>/scripts/razina.py --postavi <razina> --citatelj <tko> --tema-poznata da|ne
```

Ako je čitatelj `nositelj`, obvezna literatura kolegija ide u sekciju 7 i u
`.katedra/zadatak.json` — nositelj prvo provjeri je li upotrijebljena, ne je li navedena.
Protokol: `references/razina.md`.

**`.katedra/dijelovi.json` — os dijelova, zasijana iz profila.** Čim je profil razriješen:

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --sij \
    --profil ./.katedra/resolved_profile.json --tip <tip>
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --status --opsirno
```

Tablicu **stavi u plan, sekciju 1**, uz obveznu strukturu s ✅/❌. Ovo je jedini trenutak u
kojem izostanak dijela stoji ništa: dio koji se otkrije tjedan pred rok košta krug s
mentorom, a dio koji se otkrije u referadi košta rok. Dijelovi razine `nepokriveno` idu
u sekciju 10 (pitanja korisniku) ili u RUČNO PROVJERI — v. `references/dijelovi.md`.

Ako rad ima vlastito istraživanje, **metodologiju planiraj sada, ne pri pisanju**:
`references/metodologija.md`. Uzorak koji je krivo odabran ostaje krivo odabran — to je
jedino poglavlje koje se ne može popraviti nakon prikupljanja podataka.

**`.katedra/model.json` — ako plan predviđa vlastiti izračun.** Postavi `model.py` **u modu
1**, ne pri pisanju: brojka koja jednom uđe u prozu ručno, ostaje tamo i nakon što se model
promijeni. Metodologija je u `rad-docx/references/brojke.md`, predložak u
`rad-docx/assets/model_predlozak.py` — Katedra ih po pravilu 10 ne kopira.

---

## 3. Skaliranje po tipu rada

| Tip | Sekcije | Ciljana duljina plana |
|---|---|---|
| Seminarski / esej | 0, 1 (kratko), 3, 4, 5, 7, 9 (kratko) | 2–4 stranice |
| Završni | sve 0–11 | 8–12 stranica |
| Diplomski | sve 0–11, sekcija 8 proširena | 12–18 stranica |

Postojeći draft → sekcija 2 je obavezna u svim slučajevima.

---

## 4. Nakon izrade plana

1. Za završni/diplomski prvo potvrdi `.katedra/perspectives.json` preko
   `perspective_map.py validate`. Na **fresh** projektu, ako `.katedra/plan.json` još ne postoji,
   prije uvoza obavezno napravi machine-state kostur s tezom i budžetom:
   `python3 <KATEDRA_SKILL>/scripts/plan_state.py init --teza "..." --budzet <N>`.
   Tek zatim uvezi izrađenu strukturu:
   `python3 <KATEDRA_SKILL>/scripts/plan_state.py import plan.md`. Parser je heuristika i
   mora se pogledati. Uvoz čita **samo** područje između `<!-- STRUKTURA:POCETAK -->` i
   `<!-- STRUKTURA:KRAJ -->`; ako ograde nema, javlja upozorenje i traži strukturu u cijelom
   dokumentu — tada hodogram i popisi mogu ući kao poglavlja. Ako `plan.json` već postoji,
   **ne ponavljaj `init`** jer bi resetirao stanje.
2. PLAN GATE provjerava tezu, strukturu/potpoglavlja, sadržaj, planirane izvore i spreman
   perspective map. Neuspješan gate **ne smije** postaviti `odobren=true`.
3. Standardno odobrenje: `python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri --actor user`.
   Ako je korisnik unaprijed izričito autorizirao „full auto", koristi
   `python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri --actor full-auto`. **Full auto ne
   preskače gate**; samo bilježi tko je autorizirao prijelaz nakon što gate prođe.
4. Tek nakon `PLAN GATE PASS` sinkroniziraj state:
   `python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set plan_odobren=true`. Izravni
   `--set plan_odobren=true` prije machine approvala mora biti odbijen.
5. Prelazak u mod 2 (`references/pisanje.md`):
   `python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set mod=pisanje`. Za završni/diplomski
   ovaj prijelaz mora biti blokiran dok plan nije odobren. **Bez novog intakea.**

Svako odstupanje od plana tijekom pisanja zapiši:

```bash
python3 <KATEDRA_SKILL>/scripts/plan_state.py odstupanje --sto "spojena 4.2 i 4.3" --zasto "isti misaoni potez"
```

Nikad tiho. Plan koji se tiho razilazi s radom prestaje biti plan i postaje alibi.


---

## Tijek moda — sažeto

> Ovo je bilo u routeru (`SKILL.md` § 2) do v1.7.
> Tijek jednog moda ne treba biti u datoteci koja se učitava u svakoj poruci.

`plan.md`: perspective map → `plan_state.py init` (ako `.katedra/plan.json` još ne postoji) → PLAN I PROGRAM → `plan_state.py import` → PLAN GATE. Prije `odobri`, za završni/diplomski preporuči (ne blokiraj) `grill_me.py pitanja` — v1.1 sokratski stress-test, v. `references/grill_me.md`. Checkpoint: `plan_state.py odobri`; full auto zadržava isti gate i samo bilježi actor. Zatim sinkroniziraj `plan_odobren=true` i prijeđi u mod 2.
