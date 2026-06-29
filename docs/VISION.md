# VISION.md Â· Lekta

Sjeverna zvijezda proizvoda. CLAUDE.md kaÅ¾e KAKO se radi u repou; ovaj dokument kaÅ¾e Å TO gradimo i zaÅ¡to. Kad je odluka nejasna, vrati se ovamo.

## Jedna reÄenica

Lekta ti prije predaje toÄno kaÅ¾e je li tvoj rad tehniÄki spreman, prema stvarnim pravilima tvog fakulteta, i toÄno Å¡to popraviti.

## Lane i granice

Lekta provjerava Äetiri stvari: oblikovanje, strukturu, citiranje i administrativnu spremnost za predaju. To je cijeli proizvod i cijela vrijednost.

Lekta nikada ne ocjenjuje kvalitetu sadrÅ¾aja rada, ne piÅ¡e rad umjesto korisnika i ne zamjenjuje mentora, knjiÅ¾niÄara, lektora ni sluÅ¾bene fakultetske upute. Svaki pokuÅ¡aj Å¡irenja u "ocjenjujemo sadrÅ¾aj" izbacuje nas iz obranjivog lanea i ruÅ¡i povjerenje. Fokus je strategija, ne ograniÄenje.

## KorisniÄki put

Mobile-first, od radne verzije do predane mape, bez trenja:

1. Kontekst: fakultet, studij, vrsta rada, citatni stil. Pametni default po proÅ¡lom odabiru.
2. Upload .docx ili .pdf. Analiza je trenutna i lokalna u pregledniku.
3. Rezultat: jedan score spremnosti, razbijen po kategorijama, plus lista problema poredana po prioritetu (P0 do P3) s konkretnom uputom "Å¡to i gdje popraviti".
4. Re-check petlja: popraviÅ¡, ponovno uploadaÅ¡, vidiÅ¡ napredak. Ovo je srce proizvoda i prirodna retencija, jer se rad piÅ¡e iterativno.
5. Spremnost za predaju: kad je sve zeleno, dobijeÅ¡ rok i postupak predaje za taj fakultet, plus izvoz izvjeÅ¡taja (PDF ili HTML).

## Engine i pravila (moat)

Svako bodovano pravilo je granularno. `ruleEntries` su autorski izvor istine, `effectiveRules` je kompajlirano. Svako pravilo je sljedivo do sluÅ¾benog izvora i datuma verifikacije. Coverage matrica javno pokazuje Å¡to je pokriveno i koliko.

Posljedica: dodavanje fakulteta je dodavanje podataka, ne pisanje koda. To je razlika izmeÄu alata i platforme, i ujedno mehanizam Å¡irenja na nova trÅ¾iÅ¡ta.

Provjere kad su potpuno realizirane:
- Oblikovanje: font, veliÄina, prored, margine, poravnanje.
- Struktura: hijerarhija naslova, sadrÅ¾aj (TOC), brojevi stranica, obvezni dijelovi, udjeli sekcija.
- Citiranje: autor-godina engine plus pravni engine (fusnote, op. cit., Ibid., predmeti).
- Elementi: naslovi tablica i slika, oblik poveznica.
- Spremnost: rokovi, procedura, metapodaci dokumenta.

## Arhitektura kad je gotova

- Frontend: modularni Vite plus TypeScript (monolit razbijen u parser, audite, citatne enginee, UI). Golden testovi pokrivaju parser nad realnim dokumentima, pa refactor ne lomi ponaÅ¡anje.
- Privatnost po dizajnu: parsiranje dokumenta ostaje u pregledniku. Za samu analizu datoteka ne mora napustiti ureÄaj.
- Backend (Supabase): auth, registar profila serviran i verzioniran (ne hardkodiran u buildu), narudÅ¾be i stvarno plaÄanje, analitika, GDPR retencija.
- Opcionalno kasnije: Guidelines Ingestion Engine koji iz sluÅ¾benih PDF uputa generira nacrt profila, uz obaveznu ljudsku verifikaciju prije objave.

## UX i UI

Jezik dizajna: premium, mobile-first, jasna hijerarhija, ozbiljan ali pristupaÄan, jer je publika studenti pred stresnom predajom. Score i prioriteti Äitljivi su u jednom pogledu.

Ekrani: onboarding (kontekst u tri dodira), analizator (drag-drop, trenutni feedback), dashboard rezultata (score, kategorije, prioritizirani problemi s konkretnom uputom), spremnost za predaju (rok plus checklist), povijest verzija (napredak kroz draftove), postavke i profil. Stanja praznog ekrana, uÄitavanja i greÅ¡ke su dizajnirana, ne improvizirana. GreÅ¡ka kaÅ¾e Å¡to je poÅ¡lo po zlu i kako popraviti, u glasu suÄelja.

## Monetizacija

- Besplatno: jedan ograniÄen check (score plus top problemi) kao kuka.
- Po dokumentu: puni izvjeÅ¡taj, za panik prije predaje.
- Pretplata: neograniÄeni re-checkovi, svi fakulteti, povijest, izvozi.
- B2B kasnije: licence za fakultete, katedre i mentore (bulk provjera, institucijski profili).

Cijene prilagoÄene hrvatskom studentu, model skalabilan na svijet.

## Retencija i rast

Re-check petlja vraÄa korisnika prirodno. Podsjetnici na rokove drÅ¾e korisnika u aplikaciji u sezoni predaje, koja ima snaÅ¾ne godiÅ¡nje pikove. Referral je organski, student Å¡alje studentu. TAM raste dodavanjem fakulteta, svaki novi profil je novo trÅ¾iÅ¡te bez novog koda.

## Globalna skalabilnost

Profil plus pravilo je mehanizam Å¡irenja. Hrvatsko trÅ¾iÅ¡te je predloÅ¾ak: dodaÅ¡ jezik (i18n) i citatne stilove kao profile (APA, MLA, Chicago, IEEE) i isti engine radi za bilo koje sveuÄiliÅ¡te. "Gotovo za Hrvatsku" doslovno znaÄi "spremno za bilo koje trÅ¾iÅ¡te".

## Definicija "gotovo"

- Svi FPZG i Pravo profili verificirani, `sourcePage` popunjen.
- Golden testovi pokrivaju parser nad realnim dokumentima.
- Backend Å¾iv, sa stvarnim plaÄanjem.
- Mobile-first UI shipan.
- Coverage matrica bez praznina za ciljane studije.

## Tri rizika koja lome proizvod

1. NetoÄno pravilo jednog fakulteta ruÅ¡i povjerenje u cijeli alat. Verifikacija izvora nije polish nego srÅ¾.
2. Scope creep u "ocjenjujemo sadrÅ¾aj" gubi obranjivi lane.
3. Fragilan .docx parser tiho krivo Äita stvarne dokumente bez Å¡iroke fixture pokrivenosti.

## Sjeverna zvijezda, ponovljeno

Student otvori Lektu pred predaju, u tri dodira odabere kontekst, uploada rad, dobije jasan score i prioritiziranu listu popravaka, iterira do zeleno, i preda mirno. Svako pravilo je toÄno i sljedivo do izvora. Novi fakultet je novi redak podataka, ne novi kod.
