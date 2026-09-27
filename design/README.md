# Lekta — Design System (DesignSync bundle)

## Što je Lekta

Lekta je klijentska web aplikacija (Vite + TypeScript, bez frontend frameworka) koja u
pregledniku analizira `.docx` akademske radove (diplomski, završni, seminarski) i provjerava
oblikovanje, strukturu, opseg i citiranje prema službenim, već objavljenim pravilima
fakulteta (trenutno FPZG i Pravni fakultet u Zagrebu). Sama ANALIZA je uvijek lokalna:
dokument se pritom ne šalje ni na jedan poslužitelj.

Proizvod ima i plaćeni sloj: automatski popravak oblikovanja (kad ga korisnik naruči,
dokument ide na server SAMO za popravak), narudžbe i pretplate, te GDPR pravne stranice.
"Bez backenda" vrijedi isključivo za samu analizu, ne za proizvod u cjelini.

Ciljana publika je dvojna: pojedinačni student koji predaje rad, i (dugoročno) fakultet
kao institucionalni kupac koji odobrava alat za cijelu katedru ili odsjek.

## Vizualni identitet: "Korektorski stol"

Metafora je fizički stol pod lampom noću, na kojem leže listovi papira koje korektor
pregledava. Tamna radna ploha ("radna lampa") je zadano stanje; svjetla tema ("danje
svjetlo") je alternativa koju korisnik uključi ručno. Sadržaj uvijek živi na "papiru"
(svijetla ploha u OBJE teme), stol je okvir oko njega.

Dva glasa i jedan gost, strogo po funkciji (odluka 2026-09-19, zamjenjuje prijašnja četiri:
Newsreader, Inter Tight, IBM Plex Mono, Source Serif; vidi handoff Z7, opcija a):

- **Instrument Serif** (display serif, samo 400 + kurziv) GOVORI: naslovi, presuda, dugi
  opisi, brojka u prstenu, cijena, tekstualne veze u kurzivu, korektorska bilješka na
  faksimilu. Nikad za gumbe, oznake ni brojeve u tablici.
- **Geist Mono** OZNAČAVA I MJERI: gumbi, navigacija, eyebrow, kodovi pravila (npr.
  `page.margins`), brojevi, izmjereno → pravilnik, koraci, meta redovi, podnožje. Nikad za
  rečenice duže od jednog retka.
- **Georgia** (sistemski, ne učitava se) glumi TUĐI RAD: tekst korisnikova dokumenta u
  faksimilu i isječak pravilnika. Sloj "poslije" koristi Times New Roman jer ga pravilnik
  traži. Nikad u sučelju.

## Tvrda pravila boje (ne kršiti u novim komponentama)

1. **Crvena je jedini brand akcent.** Koristi se za CTA, logo-marku, aktivna stanja i
   presudu "blokira". Nikad se ne koristi kao proizvoljna dekorativna boja (pozadina
   sekcije, ukrasni obrub, itd.).
2. **Zelena, jantarna i plava postoje ISKLJUČIVO za presudu nalaza** (popravljivo/čisto =
   zelena, treba doradu = jantarna, treba ručnu provjeru = plava). Ne koriste se dekorativno
   nigdje drugdje na stranici.
3. **Nikad `border-left` akcent na karticama.** Presuda (kritično/važno/info) mora ići u
   boju eyebrow teksta i/ili malu točku (dot), nikad u obojeni rub kartice. Ovo je namjerno
   normativno pravilo: postojeći produkcijski `result-visuals.css` trenutno KRŠI ga na
   `.cockpit-finding`, `.cockpit-hero__copy` i `.outlook__tile` (svi imaju `border-left`
   po tonu). Ovaj dizajn-sustav predlaže ispravljen, dosljedan oblik za buduće kartice —
   nije snimka trenutnog stanja koda.

## Radiusi

- **2px svugdje**: papir, kartice, gumbi, polja, pečat. Gumb je pečat, pa dijeli rub s papirom
  (odluka 2026-09-19; zamjenjuje prijašnje "8–10px na gumbima"). Produkcijski kod ima 2px do
  14px ovisno o datoteci; 2px je ciljano stanje.
- **999px (pill)** samo za značke, korake (01 Nalazi …) i čipove "gdje u dokumentu".
- **50 %** samo za prsten ocjene, točke presude i gumbe ← →.

## Tvrdo pravilo proizvoda: Lekta nikad ne generira niti ne prepravlja sadržaj rada

Ovo nije samo tekstualna smjernica nego arhitektonska činjenica cijelog proizvoda, i mora
biti vidljivo i u dizajnu komponenti:

- Lekta smije mjeriti, provjeravati i determinističkim putem popravljati FORMU (font,
  prored, margine, numeraciju, format citata i slično).
- Lekta nikad ne piše, ne prepravlja i ne ocjenjuje rečenice, argumentaciju ili sadržaj
  rada — ni preko AI modela, ni na ikoji drugi način.
- Kartica automatskog popravka zato UVIJEK eksplicitno nabraja i što popravlja (forma) i
  što izričito NE radi (sadržaj, argumentacija), umjesto da to ostavi podrazumijevanim.
- Copy i marketing nikad ne obećavaju "AI piše umjesto tebe" niti bilo koju formulaciju
  koja sugerira generiranje sadržaja.

## Prilagodba prikaza (korisničke postavke)

Korisnik može prilagoditi PRIKAZ, ne RASPORED. Panel "Prilagodi prikaz" (kartica
`state-display-settings.html`) nudi: osvjetljenje (lampa / dan / kao sustav), pismo za čitanje
(Newsreader, sistemski serif, sistemski sans, pismo za disleksiju), veličinu teksta (3 koraka),
gustoću (3 koraka), pojačan kontrast i manje pokreta. Sprema se u pregledniku (`localStorage`),
nikad u dokument. Ne postoji pomicanje elemenata ni slobodan izbor boja: crvena ostaje jedini
akcent u svakoj kombinaciji, a raspored je isti za sve korisnike da novi korisnik odmah zna što
napraviti.

## Jedan score

Rezultat analize je JEDNA ocjena (prsten s brojem od 0 do 100) i JEDNA presuda u prirodnom
jeziku (npr. "Nije spremno za predaju"). Sažetak kategorija je uvijek SEKUNDARAN prikaz
ispod glavne presude, nikad zamjena za nju, i nikad se ne prikazuje bez nje. Kartica nalaza
i grupa nalaza postoje da objasne ZAŠTO je ocjena takva, ne da je udvostruče drugom bojom.

## Jezik pečata (interakcija)

Primarna radnja je PEČAT: crvena, jedna po ekranu; hover je podigne, pritisak utisne, učitavanje
je tinta koja putuje donjim rubom, uspjeh ostaje kao nagnuti otisak. Sekundarna je POTPIS
(tanka tinta), tekstualna veza je BILJEŠKA (kurziv serifa s crtom koja se iscrta), sporedno je
TIHI. Riješeni nalaz se prekriži rukom, ne oboji zeleno. Presuda nosi pečat dolje desno, nikad
preko teksta. Bilješke na faksimilu stoje u žlijebu izvan stranice i pokazuju točno mjesto
(zagrada, oval, krug), nikad proizvoljnu strelicu.

## Copy pravila

- Hrvatski jezik s punom dijakritikom (č, ć, š, ž, đ) u svom sadržaju kartica.
- Bez em (—) i en (–) crtica u tekstu; koristi se zarez, dvotočka, zagrade ili nova rečenica.
- Ton je precizan i tehnički, ne prodajno-uzbuđen: "Nema automatskih tehničkih blokatora",
  ne "Sjajno, sve je savršeno!".

## Struktura ovog paketa

- `tokens.json` — primitivni → semantički → komponentni tokeni, s vrijednostima doslovno
  prepisanim iz `src/shared/design-system.css` (dark + light tema) i `result-visuals.css`.
  Sadrži i popis pretpostavljenih/nepotvrđenih vrijednosti na kraju datoteke.
- 17 samostalnih HTML kartica (svaka s `@dsCard` komentarom kao prvim retkom), grupirane u:
  **Tokeni** (boje, tipografija, razmaci/radiusi), **Osnove** (gumbi, papir, traka
  povjerenja, navigacija, podnožje), **Rezultat** (prsten ocjene, kartica nalaza, grupa
  nalaza, sažetak kategorija, presuda, kartica automatskog popravka), **Stanja** (banner
  privole, toast/inline greška, panel "Prilagodi prikaz") i **Cjenik** (kartica paketa).

## Izvori (za buduće ažuriranje ovog paketa)

- `src/shared/design-system.css` — primitivni tokeni, obje teme (redci ~20–147).
- `src/ui/results/result-visuals.css` — `--ck-*` komponentni tokeni, prsten ocjene, kartica
  nalaza, sažetak kategorija, presuda, kartica popravka/izgleda ("outlook").
- `src/routes/shared/route-shell.css` — header/footer/topbar NOVIJIH ruta. **Napomena:**
  ova datoteka definira vlastitu, odvojenu paletu (`--route-*`) koja se ne poklapa nužno s
  `design-system.css` (npr. `--route-red` #9d2f29/#e36a60 nasuprot `--red` #C4372E/#E4573D).
  Ovaj paket koristi `design-system.css` kao izvor istine jer je tako izričito zadano;
  razilaženje dviju paleta nije riješeno ovim paketom i vrijedi ga naknadno uskladiti u kodu.
- `src/routes/intake/intake.css` — papir na ulaznom ekranu (`/`), trake povjerenja.
- `src/shared/page-chrome.css` i `src/shared/page-app.css` — gumbi, navigacija, footer,
  cjenik (`.price-card`), banner privole (`.consent-banner`), toast.
- `index.html`, `rad/index.html` — stvarni markup loga, navigacije i podnožja.

## Vrijednosti koje NISU nađene u CSS-u pa su pretpostavljene

Popisano i u `tokens.json` pod `unresolved_or_assumed`, sažeto:

1. **Skala razmaka** (`--space-1..8`) ne postoji u repozitoriju kao imenovani token. Skala
   u `tokens.json` (4/8/12/16/24/32/48/64px) je pretpostavljena iz promatranih gap/padding
   vrijednosti (npr. `.45rem`, `.7rem`, `8px`, `14px`, `24px`, `44px` min-target), ne
   izvedena iz jednog izvora.
2. **Tipografska ljestvica veličina** nije jedan token-set nego zbir vrijednosti po
   komponenti (uglavnom `clamp()` i `rem`); ljestvica prikazana u kartici "Tipografija" je
   sastavljena ručno iz stvarno korištenih vrijednosti, ne iz jedne skale u kodu.
3. **Pravilo "8–10px na gumbima"** je eksplicitna norma iz ovog zadatka, ne opis postojećeg
   stanja: proizvodni kod ima gumbe s radius 2px (`page-chrome.css` KS override), 8px, 9px
   (`intake-cta`), 12px (`page-chrome.css` osnovni `.btn`) i 13px, ovisno o datoteci.
4. **`border-left` na karticama** (kritično/nalaz) je u repozitoriju TRENUTNO prisutan u
   kodu (`.cockpit-finding`, `.cockpit-hero__copy`, `.outlook__tile`); ovaj paket ga
   namjerno NE preslikava jer je zadatak izričito tražio da se ta praksa ne ponavlja u
   novom dizajn-sustavu. Ako se dizajn-sustav ikad koristi za retroaktivno usklađivanje
   koda, to je poznata razlika koju treba svjesno riješiti, ne previd.
5. **`--route-*` paleta** u `route-shell.css` nije uključena u `tokens.json` jer se ne
   poklapa s `design-system.css`; navedena je samo kao napomena za buduće usklađivanje.
