# Korektorski stol+ naslovnica i analizator

## Status

Predlozen smjer: interaktivni korektorski stol.

Ova specifikacija pokriva samo `index.html`, njegovu naslovnicu i analizator. Admin i verification stranice nisu u opsegu.

## Cilj

Prvi ekran mora istodobno objasniti vrijednost proizvoda i pokazati proizvod u radu. Korisnik mora u prvih nekoliko sekundi razumjeti da moze odmah ucitati rad, da se analiza odvija lokalno i da ce dobiti konkretan pregled spremnosti za predaju.

Vizualni dojam treba biti urednicki i akademski: papir, tinta, crvena korektura i dubina. Efekti ostaju lagani, kontrolirani i brzi.

## Ne cilja se

- ne mijenja se analiza dokumenta, parser, audit, citation engine ni profilno bodovanje
- ne salje se dokument na novi endpoint
- ne uvodi se Three.js, WebGL ni nova chart biblioteka
- ne dodaju se izmisljeni rezultati, povijest ni scoreovi
- ne mijenja se tekst rada korisnika

## Preporucena kompozicija

### Prvi ekran

Hero postaje dvostupna scena podijeljena na jasnu radnu zonu i dokaz proizvoda.

Lijevi stupac:

- mali urednicki kicker s lokalnom analizom
- naslov koji govori o mirnijoj predaji, s jednom naglasenom crvenom rijeci
- kratko objasnjenje bez tehnickog zargona
- primarna akcija `Ucitaj rad` koja vodi fokus na stvarni dropzone
- sekundarna akcija `Pogledaj kako radi` koja ponavlja demo
- tri kompaktna dokaza: lokalno, bez racuna, stvarne provjere

Desni stupac:

- velika papirna pozornica dimenzionirana za desktop i fluidno smanjena na mobitelu
- donji papirni slojevi za dubinu
- dokument s naslovom, tekstnim linijama, zaglavljem i brojem stranice
- sken-linija koja prolazi kroz dokument
- korektorske oznake koje se pojavljuju kao dio demonstracije
- odvojeni score panel i mali statusni post-it
- kontrola `Ponovi demonstraciju`

Demo se automatski pokrece jednom nakon ulaska u hero. Nakon zavrsetka ostaje u finalnom, citljivom stanju. Ponovno pokretanje je eksplicitno i dostupno tipkovnicom.

### Prijelaz u stvarni analizator

Klik na primarnu akciju ne otvara novi vizualni svijet. Fokus se pomice na postojeci analizator, a papirna pozornica ostaje vizualni jezik proizvoda.

Analizator dobiva tri jasno citljiva faze:

1. kontekst rada i fakultetski profil
2. odabir dokumenta i priprema
3. obrada i rezultat

Postojeci wizard rail, dropzone, progress view i result view ostaju funkcionalni izvori istine. Dorada mijenja njihovu hijerarhiju, ritam i vizualne prijelaze, ne poslovnu logiku.

### Rezultat

Rezultat se prikazuje kao radni dashboard:

- score ring ostaje primarni signal
- kategorije koriste stvarne vrijednosti iz rezultata analize
- severity distribucija broji postojece issue zapise
- prioritetni sljedeci koraci koriste postojeci triage i status
- metrike rijeci, citata, izvora i stranica prikazuju se samo ako ih rezultat stvarno sadrzi

Nijedan grafikon ne smije imati placeholder vrijednost u stvarnom rezultatu. Demo vrijednosti smiju se koristiti samo unutar jasno oznacene demonstracijske pozornice.

## Motion i interakcije

- demo se pokrece jednom, s kratkim ulazom dokumenta, skenom, oznakama i scoreom
- `Ponovi demonstraciju` vraca pozornicu u pocetno stanje i ponovno je pusta
- hover tilt je ogranicen na desktop pointer uredaje
- pointermove ne smije mijenjati layout, samo transform i sjenu
- fokus je vidljiv na svim kontrolama
- `prefers-reduced-motion: reduce` prikazuje finalno stanje bez animacija i zadrzava kontrolu za citljivost
- escape, tab navigacija i mobilni touch ne smiju biti blokirani
- tijekom obrade postoji jasna progress poruka i aria live podrucje

## Responsive ponasanje

Desktop koristi dvije kolone i veliku papirnu pozornicu. Na sirini ispod 980px kolone se slazu okomito. Na mobitelu redoslijed je:

1. kicker i naslov
2. primarna akcija
3. dokazi povjerenja
4. papirna demonstracija
5. analizator

Demo ne smije uzrokovati horizontalni scroll, skok visine stranice ni skrivanje CTA akcije. Na mobitelu se dekorativni slojevi smanjuju, ali dokument, score i status ostaju vidljivi.

## Tehnicka izvedba

- markup ostaje u `index.html` gdje je vec prisutna hero demo struktura
- zajednicki tokeni i reduced-motion pravila ostaju u `src/shared/premium.css`
- interakcija ponavljanja i faze demonstracije ostaju u postojecem hero demo modulu ili malom UI modulu, bez dodirivanja analizatora
- stvarni rezultat povezuje se samo kroz postojeci view model u `src/ui/app.ts`
- SVG i CSS primitive koriste postojece ikone i fontove
- ne dodaje se runtime dependency

## Stanja

Hero i analizator moraju imati konzistentne vizualne varijante za:

- pocetno stanje bez dokumenta
- fokus na CTA ili dropzone
- odabrani dokument
- obradu
- uspjesan rezultat
- upozorenje ili nepotpun profil
- gresku u ucitavanju ili analizi
- reduced-motion finalno stanje

Stanje greske mora ostati informativno i ne smije koristiti crvenu animaciju kao jedini signal.

## Testovi i prihvatni kriteriji

- `npm run check` se pokrece kao zavrsni gate
- TypeScript i production build prolaze
- Playwright provjerava desktop i mobilni prvi ekran
- Playwright provjerava automatski demo i gumb za ponovno pokretanje
- Playwright provjerava keyboard fokus i reduced-motion
- axe nema novih critical ili serious problema
- hero nema layout skok nakon ucitavanja
- primarna akcija vodi fokus na stvarni dropzone
- finalni demo nije predstavljen kao stvarni rezultat dokumenta
- rezultatni grafikoni odgovaraju postojecim vrijednostima view modela
- vizualna provjera se radi u svijetloj i tamnoj temi

## Redoslijed implementacije

1. hero kompozicija i papirna pozornica
2. automatska jednokratna animacija i replay kontrola
3. CTA fokus i prijelaz prema analizatoru
4. staged analizator i result dashboard polish
5. responsive, reduced-motion i accessibility provjere
6. screenshot pregled i testni gate
