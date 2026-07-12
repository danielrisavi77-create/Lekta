# LEKTA_PRODUCT_ROADMAP.md

Razvojni plan proizvoda na temelju audita stvarnog stanja
([LEKTA_CURRENT_STATE_AUDIT.md](LEKTA_CURRENT_STATE_AUDIT.md)) i konkurentske provjere
([LEKTA_COMPETITIVE_POSITIONING.md](LEKTA_COMPETITIVE_POSITIONING.md)).

Datum: 2026-07-13. Uskladjeno s fiksiranim odlukama A/B/C iz
[roadmap/CO_PILOT_STRATEGY.md](roadmap/CO_PILOT_STRATEGY.md) i launch gateom iz
[audit/LAUNCH_BLOCKERS.md](audit/LAUNCH_BLOCKERS.md). Definicija gotovog svake stavke:
`npm run check` zelen; za parser/repair izmjene dodatno golden testovi.

Kljucna korekcija specifikacije: `LEKTA_STRATESKI_AUDIT_I_PLAN.md` predlaze "Faza 1 = stvarni
AutoFix temelj". Audit pokazuje da AutoFix temelj (engine, 5 fixera, download, prije/poslije
changelog, sigurnosni sloj) VEC POSTOJI. Zato redoslijed ovdje pocinje s (0) uskladjivanjem
komunikacije s proizvodom, (1) strukturnim AutoFix v2, (2) aktivacijom naplate, pa (3)
submission paketom. Gradi se ono cega nema, ne ono cega ima.

---

## Faza 0: Istina o proizvodu (tjedan 1; slozenost S)

Cilj: javna komunikacija prestaje negirati postojeci AutoFix i prestaje sutjeti o plagijatu.

Funkcionalnosti:
- F0.1 FAQ + JSON-LD: odgovor "Moze li aplikacija automatski ispraviti Word?" prepisati na
  istinu (automatski popravak oblikovanja postoji i besplatan je u ovoj fazi; strukturni
  popravci stizu). Dokaz raskoraka: index.html:29 i index.html:1489.
- F0.2 Hero i sekcija "Kako radi": AutoFix kao drugi stup poruke ("provjeri pa popravi"),
  repair panel promovirati iz cetvrtog taba u vidljivi ishod analize.
- F0.3 "Nije provjera plagijata" recenica u prvi ekran (hero ili trust-row), imenovati
  Turnitin (P0-06a nastavak; danas postoji samo ispod folda).
- F0.4 Meta/OG i marquee azurirati s FPZG+Pravo na stvarnu pokrivenost (33 institucije);
  vratiti izgubljene nav linkove (Usporedba, Alati) u KS nav.

Ovisnosti: nema. Rizik: nizak (copy + DOM, bez enginea). Ocekivani ucinak: konverzija
posjetitelj -> upload raste jer je obecanje jace ("dobit ces popravljen Word", ne samo
"dobit ces dijagnozu"); SEO FAQPage prestaje aktivno sakrivati glavni diferencijator.
Kriterij zavrsetka: nijedan javni tekst ne tvrdi da automatskog popravka nema; check zelen;
rucna provjera na produkciji nakon deploya.

## Faza 1: Strukturni AutoFix v2 (tjedni 2-6; slozenost XL, razbijena na M/L korake)

Cilj: zatvoriti jaz iz AutoFix matrice tamo gdje je lokalno izvedivo s prihvatljivim rizikom.
Redoslijed po omjeru vrijednost/rizik iz matrice (audit, poglavlje 3):

- F1.1 (L) Repair re-check petlja: nakon primjene fixera automatski ponovno analizirati
  popravljeni dokument U MEMORIJI i prikazati score prije -> poslije. Sve komponente postoje
  (analyzeDocx prima bytes, repair vraca bytes). Ovo je dokaz vrijednosti AutoFixa i srce
  retencije.
- F1.2 (M) Fixer: razmak odlomaka i uvlacenje prvog retka (before/after=0, firstLine) po
  profilu; prosirenje postojece patch politike, nizak rizik.
- F1.3 (XL -> 3 koraka) Sekcijsko-numeracijski paket (najtrazenija operacija, "numeriranje
  od Uvoda"):
  a) (M) pgNumType fixer nad POSTOJECIM sekcijama (start=1, fmt lowerRoman/decimal);
  b) (L) footer PAGE polje: umetanje/popravak footera + rels + ContentTypes (prosirenje
     apply-fixers politike izvan document.xml/styles.xml, novi sigurnosni testovi);
  c) (L) umetanje prijeloma sekcije prije Uvoda (semanticko sidro: postojeca detekcija
     checkPageNumberStartAtIntro vec locira odlomak Uvoda) uz obaveznu korisnikovu potvrdu
     lokacije.
- F1.4 (M) TOC polje s dirty flagom: umetanje automatskog sadrzaja koji Word izracuna pri
  otvaranju; rucno tipkani sadrzaj se NE brise, samo se oznaci preporukom.
- F1.5 (M) Cistac teksta: dvostruki razmaci + prazni odlomci s pragom i zastitama (prvi
  fixer koji dira w:t; nova klasa zastita + golden repair fixture).
- F1.6 (S) Imenovanje datoteke pri downloadu po pravilu profila, gdje pravilo postoji
  (podatkovna praznina se popunjava usporedo u data sloju).

NE gradi se u ovoj fazi (svjesno): Heading auto-primjena i numbering.xml (semanticki rizik,
ostaje "prijedlog po stavci"), umetanje naslovnice/izjave u tudji dokument (docx merge
konflikti; generatori ostaju zasebni), finalni PDF i PDF/A (lokalno neizvedivo vjerno).

Ovisnosti: F1.3b/c traze prosirenje sigurnosne politike apply-fixers (maske, backstop) i
golden repair testove nad realnim fixturama PRIJE zahvata (pravilo iz CLAUDE.md). Rizik:
srednji do visok (ostecenje dokumenta), ublazen postojecim backstopom (bit-identican no-op
na sumnju) i novim golden testovima. Ocekivani ucinak: "popravi cijeli dokument" postaje
istinita ponuda za najcesce tehnicke greske; izravna osnova za placeni paket.
Kriterij zavrsetka: svaki novi fixer ima (1) golden repair test nad realnom fixturom,
(2) test da Word otvara izlaz bez upozorenja (docx-smoke), (3) changelog stavku u panelu.

## Faza 2: Aktivacija naplate (tjedni 5-8, paralelno s repom Faze 1; slozenost M kod + owner)

Cilj: "free daje sve" prestaje; teaser/full granica i AutoFix gating postaju zivi.

Funkcionalnosti:
- F2.1 (owner, runbook postoji) GO_LIVE_NAPLATA koraci 1-9: Supabase projekt, migracije,
  products tablica s cijenama, Lemon Squeezy MoR, webhook tajna, endpointi u config.
- F2.2 (S) Konsolidacija cijena rucnih usluga: jedan izvor istine (products tablica);
  klijentski PACKAGES 39/69/99 vs premium_human 49 uskladiti prije go-livea.
- F2.3 (S) Uklanjanje ili jasno odvajanje starog Netlify narudzbenog toka bez naplate.
- F2.4 (M) Post-aktivacijski paket: paywall smoke na stagingu (checkout sandbox, webhook
  potpis, entitlement, unlock), e2e test place putanje (vidi F4.1), refund runbook.
- F2.5 (S) Copy tranzicija: "besplatno u soft-launchu" nestaje; teaser eksplicitno uokviren
  kao besplatna provjera kompatibilnosti (PaperCheck uzorak); Thesis Pass kao flagship
  (odluka C).

Ovisnosti: LAUNCH_BLOCKERS launch gate (svi code-doable P0/P1 zatvoreni; ostali su vlasnicki:
pravni subjekt, MoR, DPA, PITR). Faza NE ovisi o Fazi 1, ali konverzija je bitno jaca ako se
pali nakon F1.1 (score prije/poslije kao prodajni argument). Rizik: srednji (prvi novac,
reputacija); ublazen garancijom vezanom na tocnost pravila i re-check besplatno unutar slota.
Ocekivani ucinak: prvi prihod; validacija cijene; podaci za konverzijski lijevak.
Kriterij zavrsetka: prva stvarna kupnja end-to-end (checkout -> webhook -> entitlement ->
unlock -> garancijski prozor) na produkciji; refund proces dokumentiran i testiran.

## Faza 3: Submission Ready paket (tjedni 8-11; slozenost M)

Cilj: od "provjerenog dokumenta" do "predajnog paketa" (trokut dokument/datoteke/administracija
iz specifikacije, sekcija 6.2).

Funkcionalnosti:
- F3.1 (M) ZIP submission paket: popravljeni .docx + PDF + izjava + metadata Word po
  checklisti profila u jedan ZIP (writeZip postoji u zip-codec.ts:185; datoteke vec u
  memoriji: selectedDocx/selectedPdf/selectedMetadataDocx).
- F3.2 (S) PDF/A kao podatkovno polje profila (submission.requiresPdfA) umjesto FPZG
  hardkoda; checklist uputa za Word "PDF/A compliant" izvoz + preporuka validatora.
- F3.3 (S) PDF preflight retrigger kad se PDF doda/zamijeni NAKON analize (stale prikaz bug).
- F3.4 (M) Administrativna checklista po fakultetu prosirena podatkovno (rokovi vec postoje
  u src/submission; obrasci i koraci predaje po profilu gdje su verificirani).
- F3.5 (S) Javni standalone alat "PDF preflight" i "Fakultetska checklista" (SEO ulazi koji
  koriste postojece motore).

Ovisnosti: F3.1 ovisi o Fazi 1 minimalno (paket vrijedi i s postojecih 5 fixera). Rizik:
nizak. Ocekivani ucinak: opravdava Submission Ready cijenu (12,99-29,99 EUR sloj); nitko na
trzistu nema admin sloj. Kriterij zavrsetka: korisnik s jednim klikom preuzima ZIP koji
prolazi rucnu provjeru referade za barem 3 pilot fakulteta.

## Faza 4: Dokazivanje vrijednosti i rast (tjedni 11-13 pa kontinuirano; slozenost M)

Cilj: povjerenje i distribucija (specifikacija, faza 4), bez novih velikih sustava.

Funkcionalnosti:
- F4.1 (M) Playwright e2e sloj: upload -> worker -> rezultat -> repair download; paywall
  putanja; CI na granama (zatvara najvecu rupu kvalitete).
- F4.2 (M) SEO alati val 2: numeriranje stranica (uputa+alat), Word cistac, provjera
  naslovnice kao standalone stranice s konverzijskim CTA ("popravljeno X, jos Y problema
  nadjeno, popravi sve za Z EUR": obrazac iz specifikacije, sekcija 7).
- F4.3 (S) Javna coverage matrica kao landing sekcija (baza 344 profila kao dokaz).
- F4.4 (S) Prije/poslije galerija iz F1.1 rezultata + testimoniali iz sezone predaje.
- F4.5 (M) Partner kanal: lektori (oni odbijaju tehnicki dio; obostrana preporuka) i
  kopirnice (uvez kao checkpoint), po nalazu konkurentske analize.
- F4.6 (odluka, ne kod) lekta-pipeline pozicioniranje: Expert/institucijski alat iza privole
  ILI odvojeni proizvod; uskladiti m3/m4 roadmap s odlukom "bez istojezicnog plagijata";
  do odluke NE integrirati u web proizvod.

Ovisnosti: F4.2 ovisi o Fazi 1 fixerima; F4.4 o F1.1. Rizik: nizak.
Kriterij zavrsetka: organski promet iz SEO alata mjerljiv; e2e sloj u CI; partner pilot s 2+
lektora.

## Prioritizacijska matrica (16 funkcija, ocjene 1-5)

Kriteriji: KV korisnicka vrijednost, TD trzisna diferencijacija, MN mogucnost naplate,
SEO potencijal, TI tehnicka izvedivost (5 = lako), BI brzina implementacije (5 = brzo),
PR privatnost (5 = potpuno lokalno), RD rizik ostecenja dokumenta (5 = nema rizika),
OV ovisnost o vanjskim servisima (5 = nema), DO dugorocna obrambena vrijednost.

| # | Funkcija | KV | TD | MN | SEO | TI | BI | PR | RD | OV | DO | Zbroj |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | F0 istina o proizvodu (AutoFix copy + plagijat ograda) | 5 | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 3 | 45 |
| 2 | F1.1 repair re-check petlja (score prije/poslije) | 5 | 5 | 5 | 2 | 4 | 4 | 5 | 4 | 5 | 4 | 43 |
| 3 | F1.3 numeriranje od Uvoda (sectPr paket) | 5 | 5 | 5 | 5 | 3 | 2 | 5 | 2 | 5 | 5 | 42 |
| 4 | F2 aktivacija naplate (owner + kod) | 4 | 2 | 5 | 1 | 4 | 4 | 4 | 5 | 2 | 4 | 35 |
| 5 | F3.1 ZIP submission paket | 4 | 5 | 4 | 2 | 5 | 4 | 5 | 4 | 5 | 4 | 42 |
| 6 | F1.4 TOC polje s dirty flagom | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 3 | 5 | 4 | 41 |
| 7 | F1.5 cistac teksta (razmaci, prazni odlomci) | 4 | 3 | 3 | 4 | 4 | 3 | 5 | 3 | 5 | 3 | 37 |
| 8 | F1.2 fixer razmaka odlomaka i uvlaka | 3 | 3 | 3 | 2 | 4 | 4 | 5 | 3 | 5 | 3 | 35 |
| 9 | F4.2 SEO alati val 2 (standalone stranice) | 3 | 3 | 3 | 5 | 4 | 3 | 5 | 4 | 5 | 3 | 38 |
| 10 | F4.1 Playwright e2e | 2 | 1 | 2 | 1 | 4 | 3 | 5 | 5 | 4 | 4 | 31 |
| 11 | F3.4 admin checklista po fakultetu (podaci) | 4 | 5 | 4 | 3 | 4 | 3 | 5 | 5 | 5 | 5 | 43 |
| 12 | Heading stilovi auto-primjena | 4 | 4 | 4 | 3 | 2 | 1 | 5 | 1 | 5 | 4 | 33 |
| 13 | Umetanje naslovnice u rad (docx merge) | 3 | 4 | 3 | 2 | 1 | 1 | 5 | 1 | 5 | 3 | 28 |
| 14 | Finalni PDF u pregledniku | 3 | 3 | 3 | 2 | 1 | 1 | 5 | 2 | 3 | 2 | 25 |
| 15 | PDF/A konverzija lokalno | 2 | 3 | 2 | 2 | 1 | 1 | 5 | 3 | 2 | 2 | 23 |
| 16 | lekta-pipeline integracija u web | 3 | 4 | 4 | 2 | 3 | 2 | 2 | 5 | 2 | 4 | 31 |

Citanje matrice: vrh liste (45-41) je tocno redoslijed faza 0-1 plus admin checklista i ZIP
paket; dno (28-23) su stvari koje specifikacija nabraja ali ih NE treba graditi sada
(potvrdjuje odluke iz pozicioniranja). Naplata (35) ima nizi zbroj zbog vanjskih ovisnosti,
ali je jedina stavka koja donosi prihod pa ide paralelno, ne po zbroju.

## Redoslijed implementacije (sazetak)

1. Faza 0 (tjedan 1): istina o proizvodu.
2. Faza 1 (tjedni 2-6): F1.1 pa F1.2 pa F1.3a-c pa F1.4 pa F1.5/F1.6.
3. Faza 2 (tjedni 5-8, paralelno): naplata (owner koraci mogu poceti odmah).
4. Faza 3 (tjedni 8-11): submission paket.
5. Faza 4 (tjedni 11-13+): dokazivanje vrijednosti, e2e, SEO val 2, partneri.

Detaljna razrada zadataka s acceptance kriterijima:
[LEKTA_IMPLEMENTATION_BACKLOG.md](LEKTA_IMPLEMENTATION_BACKLOG.md).
Tjedni raspored i metrike: [LEKTA_90_DAY_PLAN.md](LEKTA_90_DAY_PLAN.md).
