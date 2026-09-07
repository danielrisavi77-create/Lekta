# Postupak: petlja, uvjeti zaustavljanja, što kad ne konvergira

## Zašto petlja, a ne dva prolaza

Dokument ovisi o vlastitoj paginaciji na tri mjesta: brojevi u sadržaju i popisima
prikaza, prijelomi pred prikazima koji se lome, i eventualna upućivanja „v. str.".

Dva prolaza nisu dovoljna jer **umetanje prijeloma mijenja paginaciju svega ispod**. Blok
koji je u prvom mjerenju bio cijel može u drugom ispasti prelomljen, a broj stranice
izmjeren u prvom prolazu više ne vrijedi.

```
sastavi rukopis → .docx → .pdf → izmjeri → zapiši toc.json + prelomi.json
       └────────────── ponovi dok se oba ne prestanu mijenjati ──────────────┘
```

Uvjet zaustavljanja: **dva uzastopna kruga daju identičan `toc.json` i `prelomi.json`.**
Gornja granica šest krugova, pa greška. U praksi konvergira u dva.

## Redoslijed unutar kruga

1. **sastavi** — poglavlja u jedan markdown, zamijeni `{{model.*}}`, ubaci markere
2. **pandoc** → `.docx` s referentnim stilom
3. **zakrpe** — font teme, `docDefaults`, `updateFields`, prored `auto`
4. **polja** — `TOC`, `SEQ`, zabilješke, `REF`, `PAGEREF`, podnožja po sekcijama
5. **prikazi** — `keepNext`/`keepLines`/`cantSplit`; umetni prijelome iz `prelomi.json`
6. **pregled** — ista izgradnja sa statičnim sadržajem → `_pregled.docx`
7. **pdf** — `soffice --convert-to pdf` nad pregledom
8. **izmjeri** — stranice naslova i blokova → novi `toc.json`, `prelomi.json`

Koraci 3–5 rade nad gotovim `.docx`-om, ne nad markdownom, jer pandoc ne zna ni za
`keepNext` ni za polja.

## Nakon konvergencije

```
izgradi predajnu varijantu (živa polja)
pretvori u PDF
assert broj_stranica(predajna) == broj_stranica(pregled)
```

Ako assert padne, statični popis se prelio na drugu stranicu i **svi izmjereni brojevi su
pomaknuti za jedan**. Rješenje je suziti statični popis (prored 1,0, 11 pt, samo razine
1–2), ne prilagoditi assert.

## Što kad ne konvergira

Simptom: `prelomi.json` u krugovima naizmjenično dobiva i gubi isti ključ. Uzrok je blok
koji je **točno na granici** — umetanje prijeloma pred prethodni blok ga povuče gore, pa
stane, pa se prijelom ukine, pa opet ne stane.

Redom:

1. **suzi prikaz** — uži stupci, pismo natpisa 10 pt, manje unutarnje margine ćelija;
   dobitak od pola centimetra rješava oscilaciju
2. **premjesti uvodni odlomak** ispod prikaza
3. **dopusti lomljenje uz ponavljanje zaglavlja** — samo za tablicu koja objektivno ne
   stane na jednu stranicu, i **zabilježi kao odstupanje**
4. **fiksiraj ručno** — dodaj ključ u `prelomi.json` i isključi ga iz mjerenja
   (`prelomi_rucno.json`), uz komentar zašto

Nikad ne povisuj granicu krugova. Šest je više nego dovoljno; oscilacija se ne rješava
brojem pokušaja.

## Idempotentnost

Izgradnja mora biti idempotentna: isti rukopis, model i profil daju bit-za-bit isti
`.docx`. Iz toga slijedi da u dokumentu **nema vremenskih oznaka** ni slučajnih
identifikatora. Ako se dva builda razlikuju bez izmjene ulaza, negdje je ušao `datetime`
ili nedeterministički poredak rječnika.

Provjera: `sha256` dvaju builda nad istim ulazom.

## Odnos prema Katedri

| Katedra | rad-docx |
|---|---|
| profil fakulteta (`resolved_profile.json`) | čita ga, ne mijenja |
| `plan.json`, `stanje.json`, `zamjerke.json` | ne dira |
| `model.py` / `model.json` | čita `model.json` |
| `zadatak.json` | čita ga u završnoj provjeri |
| snapshot pred zahvat (`diff_versions.py`) | Katedra ga radi prije poziva |
| odstupanja | vraća ih Katedri kao popis, ne upisuje sam |

Motor **ne piše u `.katedra/`** osim izvještaja provjere. Stanje je Katedrino.

## Zavisnosti i degradacija

| Nema | Posljedica |
|---|---|
| pandoc | nema izgradnje — tvrda greška |
| LibreOffice | nema mjerenja; brojevi u sadržaju ostaju na Wordu, prikazi se ne provjeravaju → **smanjeni opseg, deklarirano** |
| Poppler | isto |
| Liberation Serif | grafikoni padaju na DejaVu Serif; vidljivo, ali ne blokira |
| profil | zadane vrijednosti (A4, TNR 12, prored 1,5, margine 2,5 cm) uz izričitu napomenu |

Smanjeni opseg se **kaže**, ne prešuti. Rad predan bez provjere prijeloma je rad za koji ne
znamo lome li se prikazi.

---

## Tri stanja petlje, i ograda protiv tihe greške

Petlja se zaustavlja kad se **sva tri** artefakta prestanu mijenjati:

| Artefakt | Što nosi | Bez njega |
|---|---|---|
| `toc.json` | stranica svakog naslova | sadržaj s pogrešnim brojevima |
| `prelomi.json` | prikazi koje treba prisiliti na jednu stranicu | tablica prelomljena na dvije |
| `natpisi.json` | stranica svakog natpisa | **prazan popis tablica i grafikona** |

Stanje se graditelju predaje **prije** izgradnje. Prijevod u njegov imenski prostor nakon
izgradnje znači da ga graditelj vidi krug zakašnjelo — a petlja koja konvergira u dva kruga
stane prije nego što ga uopće upotrijebi (`zamke.md`, kvar 20).

**Fiksna točka nije dokaz ispravnosti.** Dosljedno pogrešno mjerenje daje savršeno stabilnu
petlju i poruku „✅ stabilno". Zato mjerenje ima ogradu razasutosti: ako naslovi zauzimaju
manje od pola dokumenta, alat **pada** s dijagnozom umjesto da se stabilizira. Pravilo je
općenitije od ovog jednog slučaja: svaka mjerena veličina koja ulazi u petlju treba provjeru
nemogućeg rezultata, jer petlja tihu grešku pretvara u tvrdnju.
