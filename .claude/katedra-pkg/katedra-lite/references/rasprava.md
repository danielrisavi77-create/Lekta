# RASPRAVA — poglavlje koje razlikuje četvorku od petice

> Učitaj kad rad ima vlastite nalaze. Do v1.3 Katedra ovo poglavlje nije spominjala
> nijednom riječi, a ono je jedino mjesto na kojem se dokazuje da je autor razumio što je
> našao.

Rezultati kažu **što** je nađeno. Rasprava kaže **što to znači i zašto je tako.**
Rad koji ih spoji u jedno poglavlje uvijek izgubi drugo: opis nalaza istisne tumačenje,
jer je opis lakši.

---

## 1. Što rasprava NIJE

| Nije | Zašto se ipak piše | Što umjesto |
|---|---|---|
| ponovljeni rezultati drugim riječima | najlakše je puniti prostor | jedna rečenica po nalazu, pa odmah literatura |
| drugi pregled literature | teorijski okvir je već napisan, pa se prepisuje | citira se **samo** ono što se s nalazom izravno sudara ili slaže |
| popis onoga što bi se još moglo istražiti | zvuči skromno i pametno | preporuke idu u zaključak, i to konkretne |
| obrana rada od zamišljenih prigovora | strah od komisije | jedno kontratumačenje, ozbiljno uzeto (§4) |

Test: ako se odlomak rasprave dade pročitati bez ijednog citata i ništa se ne izgubi, to
nije rasprava nego produžetak rezultata.

---

## 2. Četiri poteza po nalazu

Svaki nalaz prolazi ista četiri koraka, ovim redom. Ne miješaj nalaze u istom odlomku.

**1. Nalaz, jednom rečenicom, s brojkom i mjestom.**
> „Udio obnovljivih izvora porastao je za 27,4 postotna boda, dok je ukupna potrošnja
> ostala nepromijenjena (tablica 4)."

**2. Smjesti ga u literaturu.** Tri su moguća odnosa i svaki se piše drukčije:

| Odnos | Formulacija | Što mora slijediti |
|---|---|---|
| slaže se | „Nalaz je u skladu s…" | zašto je slaganje informativno, a ne očekivano |
| ne slaže se | „Suprotno nalazu X (2019, str. 44)…" | **objašnjenje razlike**, ne samo konstatacija |
| nadopunjuje | „X pokazuje A za velike sustave; ovaj nalaz pokazuje da…" | granica na kojoj se dva nalaza dodiruju |

**3. Objasni mehanizam.** Ovo je korak koji se najčešće preskoči. Ne „razlika je vjerojatno
zbog konteksta" — nego koji konkretno element konteksta, i kako djeluje.

| Ne piši | Piši |
|---|---|
| „Razlika se može objasniti specifičnostima hrvatskog konteksta." | „Razlika je u regulaciji: X mjeri tržišta s obveznim otkupom, gdje cijena ne prenosi signal potražnje; ovdje ga prenosi, pa rast udjela ne povlači rast potrošnje." |
| „Rezultat je u skladu s očekivanjima." | „Rezultat potvrđuje očekivanje iz poglavlja 2, i to na mjestu gdje je bilo najslabije potkrijepljeno — u razdoblju bez subvencija." |

**4. Izvedi implikaciju, s ogradom.** Što iz ovoga slijedi za struku, politiku ili teoriju,
i pod kojim uvjetom prestaje vrijediti.

---

## 3. Kad se nalaz ne slaže s literaturom

Neslaganje je **vrjednija građa od slaganja** i ne skriva se. Redom se provjeravaju četiri
objašnjenja, i u tekst ide ono koje se dade potkrijepiti:

1. **Mjeri se drugo.** Različita operacionalizacija istog pojma → nalazi nisu usporedivi.
   Najčešće, i najlakše provjerljivo: usporedi operacionalizacijske tablice.
2. **Mjeri se drugdje ili drugad.** Kontekst ili razdoblje se razlikuju na način koji je
   teorijski relevantan.
3. **Metoda daje drukčiju osjetljivost.** Manji uzorak, drugi postupak, druga razina analize.
4. **Nalaz iz literature ne stoji.** Zadnja opcija, i traži više od jedne suprotne
   opservacije. Studentski rad ju smije iznijeti, ali kao pitanje, ne kao presudu.

Ono što se **ne** radi: prešućivanje suprotnog izvora. `claim_ledger.py` odnos
`contradicts` **čuva, ne briše** — izvor koji proturječi ostaje u ledgeru upravo zato da
bi se u raspravi morao adresirati.

```bash
python3 <KATEDRA_SKILL>/scripts/claim_ledger.py report \
    --claims ./.katedra/claims.jsonl --evidence ./.katedra/evidence.jsonl
```

---

## 4. Kontratumačenje — obavezno, jedno, ozbiljno

Prije zaključka rasprave stoji odlomak koji odgovara na pitanje: **kako bi netko tko se ne
slaže s tezom protumačio iste podatke?**

Pravila:

- kontratumačenje mora biti **najjača** verzija protivnog čitanja, ne slamnata lutka;
- odgovor na njega mora biti **iz podataka**, ne iz uvjerenja;
- ako se na njega ne može odgovoriti, to se kaže — i teza se suzi.

To je isti materijal koji `reviewer_simulation.py` proizvodi kao deterministic lens, i isti
koji u modu 5 postaje pitanje komisije br. 3 („suprotna interpretacija", `obrana.md` §3).
Rad koji ga ima napisanog ulazi u obranu s pripremljenim odgovorom umjesto s improvizacijom.

---

## 5. Granica prema alatima

`consistency_check.py` gradi claim graph **unutar rada** i nalazi proturječja među
poglavljima. To je korisno i pokreće se, ali **nije rasprava**:

```bash
python3 <KATEDRA_SKILL>/scripts/consistency_check.py \
    --claims ./.katedra/claims.jsonl --out ./.katedra/consistency.json
```

Ono što nijedan alat u paketu ne radi jest odnos **mojeg nalaza prema tuđem nalazu iz
literature**. To je razlog zašto je `rasprava` u `references/dijelovi.json` upisana kao
razina `rucno`: postupak je propisan, provjeru radi čovjek. Zapis koji bi tvrdio `strojno`
proizveo bi lažni osjećaj pokrivenosti — gori od priznatog izostanka.

---

## 6. Kako se rasprava spaja sa zaključkom

Dvije su najčešće greške zrcalne:

- **rasprava koja zaključuje** — zaključak nema što reći pa ponavlja;
- **zaključak koji tumači** — tumačenje dolazi prekasno, poslije sažimanja.

Podjela koja radi:

| Rasprava | Zaključak |
|---|---|
| nalaz po nalaz | svi nalazi zajedno |
| u dijalogu s literaturom | u dijalogu s **istraživačkim pitanjem iz uvoda** |
| implikacija po nalazu, s ogradom | odgovor na pitanje, izrijekom, istim riječima kao pitanje |
| kontratumačenje | doprinos, ograničenja, što dalje |

```bash
python3 <KATEDRA_SKILL>/scripts/check_argument.py ./rad.docx \
    --profil ./.katedra/resolved_profile.json --json ./.katedra/arg.json
```

Zaključak koji ne odgovara na pitanje iz uvoda je najčešći razlog zašto formalno uredan rad
dobije četvorku — a najčešći razlog zašto zaključak ne odgovara jest to što je rasprava
odgovor već potrošila.

---

## 7. Prije nego poglavlje proglasiš gotovim

- [ ] svaki nalaz ima svoja četiri poteza, u tom redoslijedu
- [ ] nijedan odlomak nije opis rezultata bez citata
- [ ] svako neslaganje s literaturom ima objašnjenje mehanizma, ne konstataciju
- [ ] `contradicts` veze iz ledgera su adresirane, nijedna prešućena
- [ ] kontratumačenje postoji, u najjačoj verziji, s odgovorom iz podataka
- [ ] nijedna brojka iz rasprave ne odstupa od one u rezultatima (`model.json`, pravilo 13)
- [ ] zaključak nije unaprijed potrošen
- [ ] `dijelovi.py --set rasprava=napravljeno`
