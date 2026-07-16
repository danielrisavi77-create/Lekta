# Izvrsni sazetak audita

## Brojevi nalaza

- Sirovih nalaza (12 findera): 64
- Nakon adversarijalne verifikacije: 58 CONFIRMED, 4 PLAUSIBLE, 2 REJECTED
- U izvjestaj ulaze 62 nalaza (CONFIRMED + PLAUSIBLE); 2 REJECTED su izbacena uz protudokaz.

| Konacni severity (bez REJECTED) | Broj |
| --- | ---: |
| Critical | 0 |
| High | 2 |
| Medium | 12 |
| Low | 41 |
| Info | 7 |

---

# Izvrsni sazetak sigurnosnog i kvalitativnog audita ThesisReady/Lekta

Datum: 16. srpnja 2026. (delta naspram baseline SECURITY_AUDIT.md od 14.7.2026, ocjena 58/100)

## 1. Ukupna ocjena spremnosti

**(a) Trenutna javna, lokalna analiza u pregledniku: CONDITIONAL GO.**
Lokalni put ne salje dokument (potvrdeno u D1), a produkcijski build drzi server endpointe iskljucenima. Uvjet ostaje isti kao 14.7.: build stvarno mora zadrzati `enabled:false` i prazne endpointe. Zadrska nije sigurnosna nego kvalitativna: engine ima potvrdene korektnosne bugove koji ruse povjerenje u nalaz (AUD-01 prored 1.5 tvrdo pada na vizualno ispravnom dokumentu, AUD-04 Calibri/theme-font daje `dominantFont=null` pa provjera fonta prolazi lazno punim bodovima, AUD-09 dijakriticki autori se nikad ne prepoznaju). To su regresije u samoj srzi proizvoda, ne blokada za objavu, ali ih treba srediti prije marketinga tocnosti.

**(b) Server-side obrada cijelih radova, cloud integritet i placanje: NO-GO.**
Od sedam baseline nalaza LEKTA-SEC-01..07, sest je i dalje otvoreno, a jedan tek djelomicno saniran (D7). U meduvremenu su dva NOVA High rizika (AUD-17 kolizija migracija koja lomi RLS/retenciju, AUD-38 OOM DoS koji zaobilazi zip-guard) pogorsala poslužiteljski profil naspram 14.7. Tri uvjeta za GO iz baselinea (atomski quota, dokaziv cron lifecycle, hardened preflight s defused XML) nisu ispunjena.

## 2. Ocjena po dimenziji

| Dim | Ocjena | Obrazlozenje |
| --- | --- | --- |
| D1 lokalna analiza | C | Bez curenja podataka, ali vise potvrdenih korektnosnih bugova (AUD-01, AUD-04) i post-parse OOM guard (AUD-05). |
| D2 citiranje | C | Dijakriticki autori nevidljivi (AUD-09) i kvadraticni ReDoS self-DoS bez ogranicenja duljine (AUD-10). |
| D4 frontend/monetizacija | C | Uglavnom info/low; paywall je iskljucivo prezentacijski (AUD-16), hardkodiran zivi Supabase (AUD-13), pokvaren CI video (AUD-12). |
| D5 Supabase migracije | D | High kolizija numeracije 0008/0009 (AUD-17) plus fail-open cron za retenciju i preflight (AUD-18, AUD-19). |
| D6 Edge funkcije | D | Bez quote na placenom integritetu (AUD-22), bez rate limita na checkoutu (AUD-23), prosiren CORS (AUD-24). |
| D7 status LEKTA-SEC | F | 6 od 7 baseline nalaza otvoreno, samo SEC-03 djelomicno; regresija naspram 14.7. |
| D8 Python pipeline | D | High OOM DoS zaobilazi zip-guard (AUD-38), fail-open SSRF granica (AUD-40), nezasticen XML parser (AUD-39). |
| D9 data integritet | C | Ugnijezdeni 1.6GB git repo (AUD-43), oslabljen .gitignore (AUD-42), ledger drift (AUD-44). |
| D10 CI/testovi | C | `passWithNoTests:true` tihi zeleni prolaz (AUD-46), bez secret scanninga/SAST (AUD-47). |
| D11 ovisnosti/bundle | B | Uglavnom low/info; tezak netlify-cli dev dependency (AUD-52), video u gitu (AUD-53). |
| D12 dokumentacija | C | Siroka doc-rot: mojibake CLAUDE.md (AUD-56), dvije razlicite SECURITY_AUDIT.md (AUD-58), nema README (AUD-61). |

## 3. Top 5 rizika

1. **AUD-17 (High, D5):** Kolizija numeracije migracija 0008/0009: Supabase preskace drugi istoimeni file pa RLS/retencija ostaje bez objekta i lomi 0015. Tiho na deployu, katastrofalno u produkciji.
2. **AUD-38 (High, D8):** `word/footnotes.xml`/`endnotes.xml` se citaju ali se ne broje u agregatni zip-cap, pa zlonamjerni docx probija memorijski guard i rusi preflight servis (OOM DoS). Vezano uz LEKTA-SEC-03.
3. **AUD-29 / AUD-22 (Medium, D6/D7, LEKTA-SEC-01):** Puni placeni integrity nema quota, idempotency ni timeout; jedan aktivan entitlement salje do 300 KB teksta vanjskim providerima po pozivu, bez gornje granice.
4. **AUD-30 / AUD-18 (Medium, D5/D7, LEKTA-SEC-02):** Fail-open pg_cron: purge sirovog teksta, forenzickog nalaza i PII otiska ovisi o cronu bez fail-closed provjere, pa migracija prolazi zeleno dok se retencija tiho ne provodi. Deklarirani rok od sedam dana nije dokaziv.
5. **AUD-43 (Medium, D9):** `lekta-pipeline/` je neregistrirani ugnijezdeni git repo s ~1.6GB baza; commit bi stvorio slomljeni gitlink ili preplavio glavni repo. Operativna mina povezana s oslabljenim .gitignore (AUD-42).

## 4. Delta LEKTA-SEC-01..07 (14.7. vs danas)

| SEC-id | Naslov | 14.7. | Danas | Dokaz (AUD) |
| --- | --- | --- | --- | --- |
| SEC-01 | Neogranicena placena integrity obrada | Otvoren | **Otvoren** | AUD-29, AUD-22: `integrity-check` full nacin bez quote/idempotency/timeout |
| SEC-02 | Retencija nije dokazivo aktivna | Otvoren | **Otvoren** | AUD-30, AUD-18, AUD-19: cron guard bez health-checka, fail-open purge |
| SEC-03 | Preflight prekoracuje racunski/mem. budzet | Otvoren | **Djelomicno saniran** | AUD-34: busy-provjera premjestena prije bufferiranja, ali timeout jos ne ubija dretvu (AUD-41) |
| SEC-04 | XML parser bez DTD/entity obrane | Otvoren | **Otvoren** | AUD-31, AUD-39: `docx_loader.py` i dalje `xml.etree` bez defusedxml/forbid_dtd |
| SEC-05 | Presirok CORS na auth funkcijama | Otvoren | **Otvoren** | AUD-33, AUD-24: pet Edge funkcija jos vraca `Allow-Origin: *` |
| SEC-06 | Checkout bez server-side rate limita | Otvoren | **Otvoren** | AUD-35, AUD-23, AUD-27: nema quote/idempotency prije LS checkouta |
| SEC-07 | CI bez secret scanninga/hardeninga | Otvoren | **Otvoren (pogorsano)** | AUD-36, AUD-32, AUD-47: samo npm audit; necommitani dev fajlovi nose HMAC placeholder |

Sazetak delte: nula potpuno zatvorenih nalaza, jedan djelomicno saniran (SEC-03), jedan efektivno pogorsan (SEC-07 jer necommitani `_preflight_*.mts` fajlovi sada nose placeholder secret i lokalne putanje). Sirina povrsine je narasla: dva nova High rizika (AUD-17, AUD-38) i operativni dug oko ugnijezdenog repozitorija (AUD-43, AUD-57).

## 5. Zakljucak

Lokalni proizvod je i dalje uvjetno objavljiv (CONDITIONAL GO), ali njegova vrijednosna obecanja tocnosti podrivaju potvrdeni engine bugovi (AUD-01, AUD-04, AUD-09) koje treba rijesiti prije bilo kakve tvrdnje o pouzdanosti nalaza. Poslužiteljski i platni put ostaje jasan NO-GO: remedijacija baseline nalaza prakticki nije napredovala (sest od sedam otvoreno), a povrsina rizika je narasla s dva nova High nalaza i necistim stanjem radnog stabla. Prije ukljucivanja placanja i cloud obrade nuzno je zatvoriti AUD-17 i AUD-38, dostaviti dokaziv cron lifecycle (SEC-02) i atomski quota (SEC-01), te urediti CI secret scanning i ugnijezdeni repozitorij.