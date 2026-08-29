# VISION.md · Lekta

Sjeverna zvijezda proizvoda. CLAUDE.md kaže KAKO se radi u repou; ovaj dokument kaže ŠTO gradimo i zašto. Kad je odluka nejasna, vrati se ovamo.

## Jedna rečenica

Lekta ti prije predaje točno kaže je li tvoj rad tehnički spreman, prema stvarnim pravilima tvog fakulteta, i točno što popraviti.

## Lane i granice

Lekta provjerava četiri stvari: oblikovanje, strukturu, citiranje i administrativnu spremnost za predaju. To je cijeli proizvod i cijela vrijednost.

Lekta nikada ne ocjenjuje kvalitetu sadržaja rada, ne piše rad umjesto korisnika i ne zamjenjuje mentora, knjižničara, lektora ni službene fakultetske upute. Svaki pokušaj širenja u "ocjenjujemo sadržaj" izbacuje nas iz obranjivog lanea i ruši povjerenje. Fokus je strategija, ne ograničenje.

## Korisnički put

Mobile-first, od radne verzije do predane mape, bez trenja:

1. Kontekst: fakultet, studij, vrsta rada, citatni stil. Pametni default po prošlom odabiru.
2. Upload .docx ili .pdf. Analiza je trenutna i lokalna u pregledniku.
3. Rezultat: jedan score spremnosti, razbijen po kategorijama, plus lista problema poredana po prioritetu (P0 do P3) s konkretnom uputom "što i gdje popraviti".
4. Re-check petlja: popraviš, ponovno uploadaš, vidiš napredak. Ovo je srce proizvoda i prirodna retencija, jer se rad piše iterativno.
5. Spremnost za predaju: kad je sve zeleno, dobiješ rok i postupak predaje za taj fakultet, plus izvoz izvještaja (PDF ili HTML).

## Engine i pravila (moat)

Svako bodovano pravilo je granularno. `ruleEntries` su autorski izvor istine, `effectiveRules` je kompajlirano. Svako pravilo je sljedivo do službenog izvora i datuma verifikacije. Coverage matrica javno pokazuje što je pokriveno i koliko.

Posljedica: dodavanje fakulteta je dodavanje podataka, ne pisanje koda. To je razlika između alata i platforme, i ujedno mehanizam širenja na nova tržišta.

Provjere kad su potpuno realizirane:
- Oblikovanje: font, veličina, prored, margine, poravnanje.
- Struktura: hijerarhija naslova, sadržaj (TOC), brojevi stranica, obvezni dijelovi, udjeli sekcija.
- Citiranje: autor-godina engine plus pravni engine (fusnote, op. cit., Ibid., predmeti).
- Elementi: naslovi tablica i slika, oblik poveznica.
- Spremnost: rokovi, procedura, metapodaci dokumenta.

## Arhitektura kad je gotova

- Frontend: modularni Vite plus TypeScript (monolit razbijen u parser, audite, citatne enginee, UI). Golden testovi pokrivaju parser nad realnim dokumentima, pa refactor ne lomi ponašanje.
- Privatnost po dizajnu: parsiranje dokumenta ostaje u pregledniku. Za samu analizu datoteka ne mora napustiti uređaj.
- Backend (Supabase): auth, registar profila serviran i verzioniran (ne hardkodiran u buildu), narudžbe i stvarno plaćanje, analitika, GDPR retencija.
- Opcionalno kasnije: Guidelines Ingestion Engine koji iz službenih PDF uputa generira nacrt profila, uz obaveznu ljudsku verifikaciju prije objave.

## UX i UI

Jezik dizajna: premium, mobile-first, jasna hijerarhija, ozbiljan ali pristupačan, jer je publika studenti pred stresnom predajom. Score i prioriteti čitljivi su u jednom pogledu.

Ekrani: onboarding (kontekst u tri dodira), analizator (drag-drop, trenutni feedback), dashboard rezultata (score, kategorije, prioritizirani problemi s konkretnom uputom), spremnost za predaju (rok plus checklist), povijest verzija (napredak kroz draftove), postavke i profil. Stanja praznog ekrana, učitavanja i greške su dizajnirana, ne improvizirana. Greška kaže što je pošlo po zlu i kako popraviti, u glasu sučelja.

## Monetizacija

- Besplatno: jedan ograničen check (score plus top problemi) kao kuka.
- Po dokumentu: puni izvještaj, za panik prije predaje.
- Pretplata: neograničeni re-checkovi, svi fakulteti, povijest, izvozi.
- B2B kasnije: licence za fakultete, katedre i mentore (bulk provjera, institucijski profili).

Cijene prilagođene hrvatskom studentu, model skalabilan na svijet.

## Retencija i rast

Re-check petlja vraća korisnika prirodno. Podsjetnici na rokove drže korisnika u aplikaciji u sezoni predaje, koja ima snažne godišnje pikove. Referral je organski, student šalje studentu. TAM raste dodavanjem fakulteta, svaki novi profil je novo tržište bez novog koda.

## Globalna skalabilnost

Profil plus pravilo je mehanizam širenja. Hrvatsko tržište je predložak: dodaš jezik (i18n) i citatne stilove kao profile (APA, MLA, Chicago, IEEE) i isti engine radi za bilo koje sveučilište. "Gotovo za Hrvatsku" doslovno znači "spremno za bilo koje tržište".

## Definicija "gotovo"

- Svi FPZG i Pravo profili verificirani, `sourcePage` popunjen.
- Golden testovi pokrivaju parser nad realnim dokumentima.
- Backend živ, sa stvarnim plaćanjem.
- Mobile-first UI shipan.
- Coverage matrica bez praznina za ciljane studije.

## Tri rizika koja lome proizvod

1. Netočno pravilo jednog fakulteta ruši povjerenje u cijeli alat. Verifikacija izvora nije polish nego srž.
2. Scope creep u "ocjenjujemo sadržaj" gubi obranjivi lane.
3. Fragilan .docx parser tiho krivo čita stvarne dokumente bez široke fixture pokrivenosti.

## Dopune: co-pilot smjer (2026-07-11)

Strateski reframe iz "provjere prije predaje" u "co-pilota kroz cijeli proces". Razrada i mapiranje
na kod: [roadmap/CO_PILOT_STRATEGY.md](roadmap/CO_PILOT_STRATEGY.md). Tri fiksirane odluke:

- Privatnost (A): analiza formata, strukture i citata ostaje lokalna i besplatna. Plagijat,
  cross-lingual i AI-detekcija su opcionalni cloud korak iza zasebne privole i placenog gatea.
  Time se linija "parsiranje ostaje u pregledniku" precizira, ne krsi: dokument napusta uredaj
  samo za integritetsku provjeru koju korisnik izricito zatrazi. Dizajn:
  [roadmap/PHASE4_CLOUD_INTEGRITY.md](roadmap/PHASE4_CLOUD_INTEGRITY.md).
- Registar (B), carve-out uz "Lane i granice": registar i jasnoca su FORMA izraza, ne argument.
  Lekta ih smije oznaciti read-only zastavicama (duga recenica, pasiv, kolokvijalizam, prvo lice
  gdje profil zabranjuje), ali ih NIKAD ne prepisuje ni ne ocjenjuje sadrzaj. Ovo je jedina iznimka
  i ne otvara "ocjenjujemo sadrzaj". Generativni writing assistant ostaje izvan opsega.
- Naplata (C): zadrzavamo naplatu po dokumentu (panic prije roka) i dodajemo Thesis Pass (jedno
  placanje, provjeravaj isti rad do obrane). Bez mjesecne pretplate za retail.

## Sjeverna zvijezda, ponovljeno

Student otvori Lektu pred predaju, u tri dodira odabere kontekst, uploada rad, dobije jasan score i prioritiziranu listu popravaka, iterira do zeleno, i preda mirno. Svako pravilo je točno i sljedivo do izvora. Novi fakultet je novi redak podataka, ne novi kod.
