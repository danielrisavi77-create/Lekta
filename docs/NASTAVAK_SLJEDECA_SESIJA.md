# Nastavak: sto raditi u sljedecoj sesiji

Stanje na kraju sesije 2026-08-21. Pisano tako da se moze nastaviti bez ove povijesti razgovora.

---

## 1. Zatecено stanje, bez uljepsavanja

- **Grana je `docx-truthful-status`, ne `master`.** `master` je 25 commita iza i fast-forward je
  moguc (`git merge-base --is-ancestor master HEAD` prolazi). Nije pomaknut jer je paralelna sesija
  cijelo vrijeme radila u istom radnom stablu.
- **Puni `npm run check` NIJE zeleno izmjeren na cistom stablu.** Zadnji puni run bio je crven
  (5 datoteka), od cega su dvije bile stvarne i popravljene (`worklist` i `repair-coverage` bili su
  ustajali), a tri istek vremena zbog zagusenja, sto je potvrdjeno ponovnim pokretanjem na praznom
  stroju. Poslije toga su izmjene pokrivane CILJANO, jer je paralelna sesija drzala ~20 datoteka
  nekomitirano (`demo.html`, `src/demo/**`, `app.ts`, `vite.config.ts`, `parser.ts`).
- **Prvi zadatak sljedece sesije:** provjeriti je li stablo cisto, pa tek onda `npm run check`.
  Ako je cist i zelen, `git branch -f master <sha>` (fast-forward, bez `checkout`, jer je stablo
  dijeljeno).

### Zamka koja se ponovila triput
Omotac pozadinske naredbe javlja `exited with code 0` i kad je vitest crven. **Ishod se cita iz
retka `Test Files`**, nikad iz izlaznog koda. Zato svaka duga naredba ide uz `> datoteka 2>&1` i
eksplicitan `echo EXIT=$?`.

---

## 2. Sto je ova sesija napravila

Dva alata i jedan popravak u proizvodu.

| artefakt | sto radi |
|---|---|
| `scripts/verify_rule_claims.py` | Sest mehanickih provjera TVRDNJE prije nego postane pravilo: sidro, izvod, kvalifikator, odricaj dokumenta, izbor iz skupa, odsjecen citat. |
| `scripts/audit_scored_quotes.py` | Iste provjere UNATRAG, nad 1934 pravila koja vec boduju radove. Pise `docs/generated/scored-quote-audit.json`. |
| `data/verification/known-findings.json` | Nalazi koje je vlasnik procitao i svjesno ostavio. Postoji da nov nalaz ne nestane u sumu vec odlucenih. Priznavanje je po VRSTI nalaza, pa nova vrsta na istom pravilu ostaje nova. |
| `tests/margins-title-page-section.test.ts` + izmjena u `analyze-docx.ts` | Naslovnica s vlastitim `w:sectPr` obarala je margine sa 6/6 na 0/6; sada je upozorenje (5/6). |

---

## 3. Otvoreni redovi (sve mjereno, `npm run` ekvivalent: `python scripts/audit_scored_quotes.py`)

Zadnje mjerenje: **1391 revidirano, 543 nerevidirano (format), 9 neprovjerivo (skenirano),
37 priznato, 319 s novim nalazom.**

| red | koliko | sto je vec utvrdjeno | sto ostaje |
|---|---|---|---|
| citat se NE nalazi | 188 | Uzorak procitan: uglavnom PARAFRAZA, ne izmisljen citat (`kif` ima *"Poravnano obostrano"*, profil citira *"poravnanje – obostrano"*). Nalaz o SLJEDIVOSTI, ne o bodovanju. | Odluciti je li vrijedno ispravljati citate na doslovne. Nizak prioritet. |
| brojevi ne stoje | 47 | Nije pregledano. | Isti postupak: grupirati po (izvor, citat), procitati u izvoru. |
| kvalifikator | 46 | 43 su vec obradjena i 35 ih je bilo lazno. Ostatak nije. | Grupirati i procitati; ocekivati visok udio laznih. |
| odsjecen citat | 37 | 68 obradjeno, 31 lazna, nasao stvaran kvar s marginama. | Preostalih 37 su izuzeca koja imenuju dio rada; provjeriti odrazava li ih vrijednost. |
| vrijednost je SKUP | 3 | Nije pregledano. | Najmanji red, brz. |

**Postupak koji se pokazao ispravnim** (i jedini koji treba slijediti):
1. Grupiraj nalaze po **(izvor, citat)**, ne po pravilu. 68 pravila bilo je 53 jedinice, 43 su bile 8.
2. Procitaj svaku jedinicu U IZVORU, ne u izvjestaju.
3. Ako je nalaz lazan, **suzi provjeru** umjesto da ga otpises.
4. Prije nego tvrdis kvar u proizvodu, **reproduciraj ga testom**.

---

## 4. Otvorene odluke vlasnika

1. **`ffzg-etnologija-graduate--font-size` nosi `quote: "ine 12 to"`** - krhotinu s ostecenog
   tekstualnog sloja (*"velicine"* se cita kao *"veliþine"*). Vrijednost 12 je vjerojatno tocna, ali
   citat ne dokazuje nista. Ispraviti citat ili spustiti pravilo.
2. **`pravo` (16 pravila, 7 profila)** zapisano je u registar kao "ostaje bodovano", ali odluka je
   IZVEDENA iz odluke za `unizd-turizam`, ne zasebno potvrdjena. Vidi `decidedBy` u registru.
3. **`fhs-doktorski--paper-size` = `True`** i `unidu-komunikologija-zavrsni--paper-size` = `True`,
   dakle boolean umjesto `"A4"`. Nije provjereno kako se to ponasa u bodovanju.
4. **`zvu-specijalisticki` i `pravo-doktorski-pravne-znanosti`** boduju iz akta za DRUGU vrstu rada
   (Pravilnik o zavrsnom radu, odnosno upute za diplomske i zavrsne radove).

---

## 5. Sto NE raditi ponovno

Sedam puta u ovoj sesiji prvo mjerenje bilo je krivo, a podaci ispravni. Uzrok je uvijek isti:
**profilni `quote` nije fotografija teksta nego uredan prijepis.** Konkretno, sve je vec ugradjeno u
`audit_scored_quotes.py` i ne treba ponovno otkrivati:

- dijakritika je ogoljena OCR-om (`fold()`),
- citati IZOSTAVLJAJU (`(...)`),
- interpunkcija je normalizirana (zato parovi rijeci, ne doslovan niz),
- brojevi se provjeravaju PO RECENICI, jer citat zna spojiti nesusjedne odlomke,
- mjesovit PDF (skenirani clanci + strojno pisani prilozi) NIJE citljiv dokument,
- odricaj dokumenta pada pred *"duzni ste postivati"* negdje drugdje u istom dokumentu,
- *"u ovim uputama"* je mjesna odredba, ne subjekt odricaja.

I jedna zamka u suprotnom smjeru, jednako skupa: **`src/ui/repair-panel.test.ts` je nestabilan**
(trosi 11-14 s uz prag koji je bio 15 s) i dvaput je dao lazno crven gate. Jednom je A/B usporedba iz
jednog uzorka optuzila ISPRAVNU izmjenu u `analyze-docx.ts`. Prag mu je podignut na 60 s. Prije nego
optuzis svoju izmjenu, ponovi mjerenje barem dvaput.

---

## 6. Naredbe

```bash
python scripts/audit_scored_quotes.py          # revizija bodovanih pravila
python scripts/verify_rule_claims.py <claims.json>   # provjera novih tvrdnji
npm run closed-loop                            # 407 profila; zadnje: 324 pass, 5 partial
npm run recompute-coverage                     # data/coverage/scored-coverage.json
npm run worklist                               # verifikacijski dosjei (drift guard pada bez ovoga)
npm run repair-coverage                        # docs/generated/repair-coverage.json
npm run repair-recipe                          # REPAIR_RECIPE.md + serverski autoritet
npx vite-node scripts/gen-profile-runtime-maps.mts   # advisory-map.json, repair-map.json
```

**Nakon svake izmjene profilnih podataka pregradi SVE gore**, ne samo coverage. Ova sesija je
zaboravila `worklist` i `repair-coverage` i time obojila gate u crveno.

---

## 7. Sirи kontekst

Puni plan, sa svim mjerenjima i povucenim tvrdnjama, je `docs/PLAN_POTPUNA_POKRIVENOST.md`.
Ondje su i tri odjeljka koja objasnjavaju zasto je nesto POVUCENO, jer su povlacenja jednako vazna
kao nalazi.
