# Lekta Visual System v2

## Design direction

Lekta treba djelovati kao pouzdan, fizi?ki korektorski stol za akademski rad: ozbiljan i miran u jeziku, taktilan u povr?inama, s karakterom u detaljima i jasnim korektorskim signalima. Vizual ne smije izgledati kao generi?ki AI dashboard niti kao marketin?ka stranica koja skriva stvarno stanje dokumenta.

Polazna to?ka su postoje?e funkcije i postoje?i tamni desk, papir, lokalni fontovi i crveni korektorski akcent. Redizajn je sloj prezentacije i arhitekture stranica, ne nova analiza.

## Reference and reading

Vizualni smjer je provjeren kroz zasebne desktop i mobilne reference za intake, Results Cockpit, Alate i povjerenje. Referentne slike su kori?tene kao kompozicijski input, a produkcijski UI ostaje code-native kako se ne bi pove?ao bundle niti uvele ilustrativne tvrdnje.

Klju?na zapa?anja:

- Intake mora u prvom viewportu pokazati samo u?itavanje, privatnost i jedan jasan sljede?i korak.
- Rezultati moraju redom pokazati status, prioritetne nalaze, sljede?u radnju i tek onda napredne detalje.
- Jedan primarni indikator je dovoljan. Tehni?ka ocjena i spremnost za predaju moraju biti semanti?ki odvojene.
- Papir, rubovi, registri, korektorske oznake i kontrolirana asimetrija daju karakter bez zatrpavanja ekrana.
- Motion je event-driven: ulazak ekrana, promjena stanja, otvaranje detalja i uspje?an upload. Nema beskona?nih animacija preko cijele stranice.
- Mobile je isti proizvod, ne smanjena desktop verzija: prioriteti ostaju vidljivi, a napredni sadr?aj se spu?ta iza eksplicitne kontrole.

## Product dials

- DESIGN_VARIANCE: 5/10, dovoljno karaktera kroz papir, margine i korektorske oznake, ali bez eksperimentiranja koje smanjuje povjerenje.
- MOTION_INTENSITY: 4/10, kratki ulazi i potvrde stanja, bez stalnog gibanja.
- VISUAL_DENSITY: 3/10 za intake i trust stranice, 5/10 za Results Cockpit, 4/10 za operativne i admin stranice.

## Page modes

### Intake mode

Landing ulaz ostaje minimalan i funkcionalno usmjeren na upload. Header je lagan, upload desk je dominantan, a Saznaj vi?e i alati su sekundarni izlazi. Tekst mora zadr?ati stvarne granice sustava, uklju?uju?i .docx i stvarni limit od 20 MB.

### Results mode

Rezultati su Results Cockpit. Gornji sloj daje dokument i profilni kontekst. Sredi?nji blok daje readiness halo ili po?teni broj provjerenih pravila kada profil nije bodovan. Desno ili ispod njega korisnik dobiva otvorene nalaze s odgovorima na: ?to nije u redu, za?to, gdje i ?to napraviti. Kategorije, DNA rada i napredne kontrole ostaju dostupne, ali vi?e ne natje?u se s prioritetnim nalazima.

### Trust and learn-more mode

Saznaj vi?e koristi editorialni narativ s tri provjerljive tvrdnje: dokument ostaje na ure?aju tijekom lokalne analize, pravila dolaze iz slu?benih izvora kada su dostupna i svaki nalaz ima obja?njenje. Ograni?enja su informativni blok, ne hero poruka.

### Tools mode

Alati koriste indeks korektorskog stola. Jedan istaknuti alat mo?e biti ve?i, a ostali ostaju pregledni i lako skenabilni. Ne uvoditi generi?ki grid jednakih kartica kada hijerarhija alata nije jednaka.

### Archive, workspace and operational modes

Moji radovi, workspace, admin, verifikacija, legalni sadr?aj i pomo? koriste istu tipografiju, povr?ine, fokus-stanja i navigaciju, ali zadr?avaju vlastitu funkcionalnu gusto?u. Operativne stranice ne dobivaju dekor koji ote?ava rad.

## Shared visual system

Koristiti postoje?e lokalne fontove i shared design tokens:

- Newsreader za velike naslove i rezultate koji trebaju djelovati uredni?ki.
- Inter Tight za navigaciju, kontrole, obja?njenja i kratke UI poruke.
- IBM Plex Mono za tehni?ke oznake, brojke i statusne metapodatke.
- Caveat samo kao rijedak korektorski detalj, nikada za klju?ne informacije.
- postoje?e --desk, --paper, --paper-ink, --red, statusne boje i motion/a11y varijable.

Povr?ine trebaju biti slojevite, ali plitke: paper grain i rub mogu biti CSS-only, s minimalnim shadowom. Izbjegavati nove gradijente ljubi?aste boje, velike radius kartice, backdrop-filter ovisnost i ponavljanje istog podatka u vi?e vizualnih oblika.

## Accessibility and performance

- Svaka glavna akcija zadr?ava postoje?i keyboard i screen-reader naziv.
- Fokus je vidljiv i kontrastan; touch targeti su najmanje 44px.
- prefers-reduced-motion mora ugasiti transformacije i prijelaze koji nisu nu?ni.
- Ne uvoditi nove biblioteke ili velike slike za dekoraciju.
- Dekorativni slojevi ne smiju blokirati pointer events niti promijeniti ?itljivost.
- CSS selectors trebaju biti ograni?eni na page mode ili component root kako se legacy stranice ne bi slu?ajno promijenile.

## Scope boundaries

Ovaj redizajn ne mijenja parser, citat engine, audit, scoring, repair recepte, profile compile, Supabase tokove, classification guard ni sadr?aj rada. Ne dodaje content generation. Sve postoje?e rute, akcije, stanja gre?ke, upload, preview, repair i napredne provjere ostaju dostupni.

## Acceptance criteria

1. Novi korisnik u prvih nekoliko sekundi razumije gdje u?itati rad i ?to ?e se dogoditi.
2. Na rezultatima je jasno ?to je pogre?no, za?to je va?no i ?to korisnik treba napraviti.
3. Jedna primarna akcija dominira svakim klju?nim stanjem; sekundarne akcije ostaju dostupne.
4. Desktop, tablet i mobile imaju istu hijerarhiju, bez horizontalnog overflowa.
5. Postoje?e funkcije i URL-ovi ostaju operativni.
6. Nema novih privatnih podataka u javnom bundleu niti promjene sigurnosne granice.
7. Nema kontinuirane page-wide animacije; reduced-motion i focus pona?anje ostaju ispravni.
8. npm run check prolazi prije zavr?ne predaje, a browser smoke provjera pokriva intake, learn-more, tools i results.
