# Studentski pilot

## Što provjeravamo

Student treba moći sam pronaći najvažniji formalni problem u svojem radu, razumjeti lokaciju i izvor pravila te slijediti osnovnu uputu za Word. Lokalna dijagnoza, dokazi i upute su besplatni. Plaćeni ishod je popravljeni DOCX s ponovnom analizom i pregledom stvarno primijenjenih promjena. Lekta ne piše akademski tekst i ne jamči ocjenu, prihvaćanje rada ni usklađenost sa svim zahtjevima mentora.

## Uključivanje i povratak

Za pilot build postaviti `VITE_LEKTA_STUDENT_PILOT=true`. Samo doslovna vrijednost `true` uključuje pilot; prazna ili uklonjena varijabla vraća postojeći prikaz. Ovo je javna Vite build zastavica, bez URL i localStorage načina uključivanja. Pilot ne stvara `fullReport`, `slotId` ni pravo popravka. Serverska provjera prava i plaćanja ostaje mjerodavna. Bez konfiguriranih report, checkout i repair endpointa kupnja i automatski popravak nisu dostupni; besplatna dijagnoza ostaje upotrebljiva.

Prije stvarnog staging testa treba zaseban Supabase projekt i konfigurirane endpointove, proizvode za četiri vrste rada, testni način plaćanja, webhook potvrdu te testne račune s potvrđenim pravom. Migracije se primjenjuju samo kroz `supabase db push`. Lokalni mock, prikaz cijene ili uspješan klik nisu dokaz staging kupnje. Povratak na flag-off zahtijeva novi build bez zastavice i provjeru dotadašnjeg zaključavanja nalaza.

## Prvih deset sesija

Pozvati dobrovoljne studente pred predajom završnog ili diplomskog rada, iz barem dva verificirana profila i s različitim iskustvom u Wordu. Tehničku probu najprije raditi na sintetičkim dokumentima; stvarni rad samo uz studentov pristanak. Bez objašnjavanja gumba zadati: odaberi fakultet i vrstu rada, provjeri dokument, vlastitim riječima objasni prvi važni nalaz, pronađi izvor, zatim izaberi ručni postupak ili popravak. U zasebnom zadatku student iz citatnog, naslovničkog ili literaturnog alata dolazi na stvarni intake i provjerava da su fakultet, studij i vrsta rada ostali ispravni.

Kad testni checkout i serverski popravak zaista rade, student treba objasniti što kupuje, provjeriti cijenu prema vrsti rada, izvršiti testnu kupnju, preuzeti DOCX, otvoriti ga u Wordu i protumačiti usporedbu prije i poslije. Bilježiti vrijeme do prvog shvaćenog nalaza, traženu pomoć, pogrešno tumačenje pravila ili cijene, neriješene blokatore i razlog odustajanja. Nakon pokušaja pitati za koji bi konkretan rezultat platio i što mu prije kupnje još nedostaje. Izjavljena namjera nije kupnja.

Početne hipoteze, koje nisu izmjereni rezultati: najmanje 8 od 10 sudionika samostalno dovrši dijagnozu i objasni jedan prioritetni nalaz; svih 10 razumije da se plaća popravljeni dokument; nitko ne zamijeni ručnu potvrdu sa strojno potvrđenim popravkom. Nulti dopušteni ishodi su gubitak autorskog teksta i pristup tuđoj datoteci. Točnost treba mjeriti prema neovisno ljudski potvrđenim očekivanim rezultatima, po `check.id` i profilu, uz precision, recall, lažne nalaze i udio neprovjerivih pravila. Broj zelenih testova nije mjera točnosti nalaza.

## Mjerenje i granice podataka

Postojeći agregatni događaji alata su `tool_view`, `tool_copy`, `tool_download` i `tool_to_analyzer_click`. U radnom prostoru postoje `file_selected`, `profile_completed`, `analysis_completed`, `finding_jump`, `repair_plan_opened`, `purchase_completed`, `repair_completed` i `repair_download_started`. Potonji označuje početak preuzimanja, ne potvrdu spremanja na disk. `purchase_completed` u klijentu treba usporediti sa serverski potvrđenim plaćanjem; sama klijentska oznaka nije financijski dokaz. Pregled točnog dokaza pojedinog nalaza i završeno spremanje DOCX-a još nisu zasebno instrumentirani. Stoga trenutačno nije moguće tvrditi povezani puni lijevak od alata do dokaza i uspješnog preuzimanja.

Događaji se šalju samo uz postojeću privolu. `src/ui/telemetry.ts` dopušta ograničena polja, a alati šalju samo događaj, putanju i vrijeme. Ne slati ime, naslov, isječak ni puni tekst rada u analitiku. Bez povezivog identiteta i privole izvještavati o agregatima po jasno zadanom vremenskom prozoru; reload i dvostruki klik nisu novi korisnici. Posjet iz dobrovoljne analitike nije ukupan broj posjetitelja. HTTP pogreška ili nepotvrđen webhook nisu konverzija.

Na istim dopuštenim dokumentima i službenim pravilima usporediti rezultat s ručnim Word postupkom i alatima koje studenti već koriste. Mjeriti formalnu točnost, otvaranje i ispravnost Word izlaza, očuvanje vidljivog teksta, vrijeme i jasnoću dokaza. Pilot od 20 do 30 osoba otkriva razloge kupnje ili odustajanja, ali ne daje stabilnu tržišnu stopu. Ovaj protokol je priprema: sudionici nisu kontaktirani, razgovori i stvarne kupnje nisu provedeni.
