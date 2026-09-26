# Studentski pilot

## Što provjeravamo

Student treba moći sam pronaći najvažniji formalni problem u svojem radu, razumjeti lokaciju i izvor pravila te slijediti osnovnu uputu za Word. Lokalna dijagnoza, dokazi i upute su besplatni. Plaćeni ishod je popravljeni DOCX s ponovnom analizom i pregledom stvarno primijenjenih promjena. Lekta ne piše akademski tekst i ne jamči ocjenu, prihvaćanje rada ni usklađenost sa svim zahtjevima mentora.

## Uključivanje i povratak

Za pilot build postaviti `VITE_LEKTA_STUDENT_PILOT=true`. Samo doslovna vrijednost `true` uključuje pilot; prazna ili uklonjena varijabla vraća postojeći prikaz. Ovo je javna Vite build zastavica, bez URL i localStorage načina uključivanja. Pilot ne stvara `fullReport`, `slotId` ni pravo popravka. Serverska provjera prava i plaćanja ostaje mjerodavna. Bez konfiguriranih report, checkout i repair endpointa kupnja i automatski popravak nisu dostupni; besplatna dijagnoza ostaje upotrebljiva.

Prije stvarnog staging testa treba zaseban Supabase projekt i konfigurirane endpointove, proizvode za četiri vrste rada, testni način plaćanja, webhook potvrdu te testne račune s potvrđenim pravom. Migracije se primjenjuju samo kroz `supabase db push`. Lokalni mock, prikaz cijene ili uspješan klik nisu dokaz staging kupnje. Povratak na flag-off zahtijeva novi build bez zastavice i provjeru dotadašnjeg zaključavanja nalaza.

## Staging preduvjeti za plaćeni popravak

Provjereno 2026-09-24: Supabase projekt `Lekta staging` je `ACTIVE_HEALTHY`; migracije su evidentirane do `0203`, a svih 28 Edge funkcija je aktivno. To potvrđuje da staging backend radi, ali ne i da je tok kupnje spreman. U `public.products` svih 23 aktivnih proizvoda imaju prazan `mor_product_id`; jedina dva mapirana proizvoda su neaktivna. Zato trenutačno ne pokretati checkout i ne tumačiti prikaz cijene kao kupovinu koja se može dovršiti.

Netlify site `lekta-staging` je odvojen od produkcije (`https://lekta-staging.netlify.app`). Dana 2026-09-24 staging varijable su postavljene samo u kontekst `deploy-preview`: `VITE_LEKTA_ENV=staging`, staging `VITE_LEKTA_SUPABASE_URL`, javni staging publishable ključ u `VITE_LEKTA_SUPABASE_ANON_KEY` i `VITE_LEKTA_STUDENT_PILOT=true`; vrijednost ključa nije zapisana niti ispisana. Supabase `ALLOWED_ORIGIN` spremljen je 2026-09-24 u 17:20 UTC. Prethodni OPTIONS test dopustio je i stabilni staging origin i `https://student-pilot-20260924--lekta-staging.netlify.app`; svježi ponovljeni OPTIONS test trenutačno nije dostupan jer PowerShell `curl.exe` ne može dosegnuti konfigurirani lokalni proxy. Preview adresa trenutno vraća `Site not found`, a Netlify Deploys UI vraća `Unauthorized`; nije objavljen novi build. Kandidat je na commitu `65b16c05b83772a4dea2cf2d26b91168e9becfb2`, dok je `docs/generated/RELEASE_PROOF.json` vezan uz stariji commit `e9dcc52a0ec0203ac2c71ff9ea5b7e2a2d998abf`; dokaz je zastario i ne smije odobriti deploy. `netlify.toml` sadrži produkcijski `LEKTA_SITE_ORIGIN`, zato staging build mora eksplicitno zadati staging vrijednosti i proći release gate prije deploya. Ne zapisivati tajne u repozitorij ni logove.

Prije plaćenog testa potvrditi sve sljedeće na ciljanom stagingu, neposredno prije testa:

1. Iz `netlify status` potvrditi site `lekta-staging`, a iz konfiguracije builda staging URL i staging publishable ključ. Provjeriti da javni URL nije produkcijska domena i da se dokument obrađuje samo na očekivanom backendu.
2. Za svaki testirani SKU odabrati aktivan zapis `products` za točan `kind`, `audience`, `work_type` i `slots_total`, te postaviti njegov stvarni Lemon Squeezy variant ID u `mor_product_id`. Potvrditi da je provider u testnom načinu i da checkout za taj variant vraća testnu, a ne naplativu sesiju.
3. Potvrditi webhook potpis s staging tajnom, idempotentnost ponovljenog događaja i serversko izdavanje prava tek nakon potvrđenog testnog plaćanja. Provjeriti da je besplatni repair bypass isključen (`REPAIR_FREE_MODE` nije `true`) kako besplatni prolaz ne bi lažno dokazao plaćeni pristup.
4. Koristiti sintetički DOCX i testni račun A s testnim pravom. Račun B bez prava ne smije moći pokrenuti ni preuzeti popravak A. Provjeriti privatno preuzimanje, ponovnu analizu, zapis promjena i otvaranje popravljenog dokumenta u Wordu uz očuvan vidljivi tekst.
5. Usporediti checkout variant, cijenu, vrstu rada i izdano pravo. Testni webhook mora dovršiti kupnju; klik, klijentski događaj ili lokalni mock nisu dokaz. Zabilježiti referencu testnog događaja bez spremanja dokumenta ili osobnih podataka u analitiku.

Trenutačni stabilni staging URL učitava aplikaciju, ali pilot preview još nije objavljen i njegov URL vraća `Site not found`. Ne provoditi checkout. Siguran plaćeni popravak ostaje blokiran dok aktivni proizvodi ne budu mapirani na testne varijante te dok testni webhook, potvrđeno testno plaćanje i izolacija računa A/B ne budu provjereni.

## Prvih deset sesija

Pozvati dobrovoljne studente pred predajom završnog ili diplomskog rada, iz barem dva verificirana profila i s različitim iskustvom u Wordu. Tehničku probu najprije raditi na sintetičkim dokumentima; stvarni rad samo uz studentov pristanak. Bez objašnjavanja gumba zadati: odaberi fakultet i vrstu rada, provjeri dokument, vlastitim riječima objasni prvi važni nalaz, pronađi izvor, zatim izaberi ručni postupak ili popravak. U zasebnom zadatku student iz citatnog, naslovničkog ili literaturnog alata dolazi na stvarni intake i provjerava da su fakultet, studij i vrsta rada ostali ispravni.

Kad testni checkout i serverski popravak zaista rade, student treba objasniti što kupuje, provjeriti cijenu prema vrsti rada, izvršiti testnu kupnju, preuzeti DOCX, otvoriti ga u Wordu i protumačiti usporedbu prije i poslije. Bilježiti vrijeme do prvog shvaćenog nalaza, traženu pomoć, pogrešno tumačenje pravila ili cijene, neriješene blokatore i razlog odustajanja. Nakon pokušaja pitati za koji bi konkretan rezultat platio i što mu prije kupnje još nedostaje. Izjavljena namjera nije kupnja.

Početne hipoteze, koje nisu izmjereni rezultati: najmanje 8 od 10 sudionika samostalno dovrši dijagnozu i objasni jedan prioritetni nalaz; svih 10 razumije da se plaća popravljeni dokument; nitko ne zamijeni ručnu potvrdu sa strojno potvrđenim popravkom. Nulti dopušteni ishodi su gubitak autorskog teksta i pristup tuđoj datoteci. Točnost treba mjeriti prema neovisno ljudski potvrđenim očekivanim rezultatima, po `check.id` i profilu, uz precision, recall, lažne nalaze i udio neprovjerivih pravila. Broj zelenih testova nije mjera točnosti nalaza.

## Mjerenje i granice podataka

Postojeći agregatni događaji alata su `tool_view`, `tool_copy`, `tool_download` i `tool_to_analyzer_click`. U radnom prostoru postoje `file_selected`, `profile_completed`, `analysis_completed`, `finding_jump`, `repair_plan_opened`, `purchase_completed`, `repair_completed` i `repair_download_started`. Potonji označuje početak preuzimanja, ne potvrdu spremanja na disk. `purchase_completed` u klijentu treba usporediti sa serverski potvrđenim plaćanjem; sama klijentska oznaka nije financijski dokaz. Pregled točnog dokaza pojedinog nalaza i završeno spremanje DOCX-a još nisu zasebno instrumentirani. Stoga trenutačno nije moguće tvrditi povezani puni lijevak od alata do dokaza i uspješnog preuzimanja.

Događaji se šalju samo uz postojeću privolu. `src/ui/telemetry.ts` dopušta ograničena polja, a alati šalju samo događaj, putanju i vrijeme. Ne slati ime, naslov, isječak ni puni tekst rada u analitiku. Bez povezivog identiteta i privole izvještavati o agregatima po jasno zadanom vremenskom prozoru; reload i dvostruki klik nisu novi korisnici. Posjet iz dobrovoljne analitike nije ukupan broj posjetitelja. HTTP pogreška ili nepotvrđen webhook nisu konverzija.

Na istim dopuštenim dokumentima i službenim pravilima usporediti rezultat s ručnim Word postupkom i alatima koje studenti već koriste. Mjeriti formalnu točnost, otvaranje i ispravnost Word izlaza, očuvanje vidljivog teksta, vrijeme i jasnoću dokaza. Pilot od 20 do 30 osoba otkriva razloge kupnje ili odustajanja, ali ne daje stabilnu tržišnu stopu. Ovaj protokol je priprema: sudionici nisu kontaktirani, razgovori i stvarne kupnje nisu provedeni.
