# STIL — trostupanjski pipeline i mjerljivi pragovi

> Za mod 2 (pisanje) i mod 3 (poboljšanje). Alat: `scripts/check_ai_style.py`,
> `scripts/check_paragraphs.py`, `scripts/verify_rewrite.py`.


## Datoteke koje trebam (mod 3)

📄 tekst ili draft (**OBAVEZNO**) · 📝 komentari mentora · 📜 upute fakulteta

Neprihvaćene Track Changes prihvati **prije** čitanja (`revizije.py prihvati`) — inače
python-docx tiho preskače `<w:ins>`/`<w:del>` i dijagnoza čita krnj tekst.

---

---

## 0. Zašto jedan prolaz ne radi

„Zvuči robotski" nije jedna mana nego četiri neovisne, a **popravljanje jedne
kvari drugu**. Izmjereno na stvarnom radu od 9.000 riječi kroz četiri stanja:

| stanje | kohezija /1000 | medijan rečenice | ≥35 riječi | dojam |
|---|---|---|---|---|
| izvorno | 6,1 | 19 | 14 % | AI-tikovi: „Time se…", „Riječ je o…" |
| nakon uklanjanja tikova | **6,1** | 19 | 14 % | **niz nepovezanih tvrdnji** |
| nakon dodavanja kohezije | 17,4 | **25** | **27 %** | **zadihano, preteško** |
| nakon lomljenja rečenica | 20,3 | 23 | 13 % | ✅ |

Pouka: uklanjanje fraza bez zamjene kohezije daje tekst **gori od originala** —
točan, ali mrtav. Zato se radi u koracima, i **nakon svakog se mjeri**.

---

## 1. Pragovi

`check_ai_style.py` mjeri četiri dimenzije. Pragovi za početke rečenica i glagole
atribucije skaliraju se po ~3.000 riječi (jedno poglavlje).

| dimenzija | prag | što znači kršenje |
|---|---|---|
| kohezija | **15–22** veznika /1000 riječi | ispod: nepovezane tvrdnje · iznad: provjeri medijan |
| raznolikost veznika | **≥20 različitih**, nijedan >2,5/1000 | malo različitih = mehanički šavovi |
| medijan rečenice | **20–24 riječi** | ispod: staccato · iznad: zadihano |
| sd duljine rečenice | **≥8** | mala varijanca = pisano po kalupu |
| najdulja rečenica | **≤45 riječi** | — |
| udio ≥35 riječi | **≤18 %** | preteško |
| udio ≤10 riječi | **≤15 %** | staccato |
| isti početak rečenice | **≤3 po poglavlju** | monotonija |
| isti glagol atribucije | **≤4 po poglavlju** | „navodi… navodi… navodi" |

`check_paragraphs.py` mjeri geometriju **u stvarnom prijelomu**:

| dimenzija | prag | napomena |
|---|---|---|
| redaka po odlomku | **min iz profila fakulteta** (često 5) | tvrdo |
| gornja granica | **≤12** | stranica mora primiti barem 2–3 odlomka |
| udio jedne duljine | **≤25 %** | iznad toga se vidi kalup |

---

## 2. Koraci

### Korak 1 — ukloni tikove
Katalog je u `check_ai_style.py` (`FRAZE`). Najčešći: „Riječ je o…", „Time se…",
„Iz toga proizlazi…", pokazna zamjenica + je + imenica („Taj je nalaz…"),
„…što upućuje na to da…", „čime se objašnjava…", mehaničko „Prvo… Drugo… Treće…"
ponovljeno kroz više poglavlja.

**Ne ostavljaj rupu.** Svaki uklonjeni tik nosio je logičku vezu koju mora
preuzeti korak 2.

Provjera: `python3 <KATEDRA_SKILL>/scripts/verify_rewrite.py ./prije ./poslije --zahvat stil --profil ./.katedra/resolved_profile.json`

### Korak 2 — poveži
Cilj: kohezija s ~6 na ~17–20 na 1000 riječi, raspoređena na ≥20 različitih
sredstava.

Repertoar: *jer · budući da · s obzirom na to da · zbog toga · zbog čega ·
stoga · tako da · pa · naime · utoliko · upravo zato · prema tome · međutim ·
no · ipak · doduše · nasuprot tome · s druge strane · za razliku od toga ·
premda · iako · dok · umjesto toga · pritom · ujedno · istodobno · usto ·
zauzvrat · dakle · čime · doista · štoviše*

Zabranjeni prazni šavovi: **„Nadalje", „Osim toga", „Također"** — zauzimaju
mjesto veze, a ne nose je.

Uz to: barem polovica odlomaka mora u prvoj rečenici pokupiti nit iz
prethodnoga — ponavljanjem ključnog pojma, kontrastom ili posljedicom.

Provjera: `python3 <KATEDRA_SKILL>/scripts/verify_rewrite.py ./prije ./poslije --zahvat stil --profil ./.katedra/resolved_profile.json`

### Korak 3 — prelomi predugo
Korak 2 redovito digne medijan na 25+ i udio dugih rečenica na 25–30 %.
Lomi **samo rečenice preko 40 riječi**, na mjestu prelaska s jedne tvrdnje na
drugu. Vezno sredstvo se ne briše nego premješta na početak nove rečenice.

Provjera: `python3 <KATEDRA_SKILL>/scripts/verify_rewrite.py ./prije ./poslije --zahvat lomljenje --profil ./.katedra/resolved_profile.json`
(blokira ako je izgubljena ijedna sadržajna riječ)

### Korak 4 — geometrija odlomaka
Tek sada, kad su rečenice stabilne. Spajaj ondje gdje dva odlomka izvode isti
misaoni potez; gdje postoji stvaran zaokret, radije prenesi jednu rečenicu
preko granice.

**Nikad ne spajaj preko** naslova (`#`, `##`) ni preko natpisa prikaza
(`*Tablica 4. …*`). Odlomak koji dolazi **odmah iza prikaza** spaja se samo
unaprijed — objašnjenje mora ostati ispod prikaza.

Provjera: `python3 <KATEDRA_SKILL>/scripts/verify_rewrite.py ./prije ./poslije --zahvat geometrija --profil ./.katedra/resolved_profile.json`

**Što točno blokira.** Izgubljena rečenica — ona za koju u novoj verziji nema
bliskog para — blokira uvijek, bez obzira na to koliko ih je i na kojem su
mjestu. Prepisana rečenica (bliski par postoji, tekst se promijenio) je
**upozorenje**, ne blokada: u ovom koraku samo se spaja, pa svaka izmjena
rečenice znači da je subagent prekoračio opseg i traži tvoj pregled, ali se ne
može pouzdano razlikovati od jakog prepisivanja na `stil` putanji.

Ranija formulacija ovdje glasila je „blokira ako se ijedna rečenica promijenila",
što se nije poklapalo s ponašanjem alata; uz to je razina blokade bila određena
iz prvih pet ispisanih razlika, pa je rečenica izgubljena nakon pete tiho
prolazila. Oboje je popravljeno (audit, nalaz D3).

---

## 3. Delegiranje subagentu

Prepisivanje 10.000 riječi ide subagentu, ali **samo uz harness**. Bez
`verify_rewrite.py` pravilo „sve verificiraj neovisno" nema čime.

Predložak zadatka mora sadržavati:

1. **Dijagnozu s brojkama** — ne „tekst zvuči robotski" nego „kohezija 6,1/1000,
   medijan 19, 'jer' 1,6/1000, 'naime' 0". Agent tada zna što gađa.
2. **Željezna ograničenja**: nijedna brojka, datum, iznos, oznaka propisa ni
   citat se ne mijenja; retci s `#`, `##`, `---` i `*Tablica N. …*` prepisuju se
   doslovno; isti broj odlomaka (osim u koraku 4).
3. **Popis zabranjenih obrazaca** koje ne smije uvesti (v. korak 1).
4. **Traži izvještaj bez teksta** — samo brojke. Tekst se čita iz datoteke.

Za stvarni dokument prvo pokreni `evidence_gate.py --policy strict`, zatim napravi snapshot.
Zatim **uvijek** pokreni `verify_rewrite.py` s odgovarajućim
`--zahvat --profil ./.katedra/resolved_profile.json --evidence-gate --require-snapshot`.
To je B13 Source Analysis Matrix + rewrite safety contract. Izvještaj agenta se ne uzima zdravo za gotovo: u ovoj sesiji je agent tvrdio
„svi citati očuvani", a harness je našao jednu izmijenjenu rečenicu (dodan
veznik). To je bilo bezopasno, ali otkrilo je i **dvije greške u mojim vlastitim
regexima** koje su davale lažne alarme.

---

## 4. Mjerenje geometrije: zašto ne po znakovima

Procjena „znakova ÷ 90" pogriješi na granici. Na testnom radu odlomci od **361 i
364 znaka prelomili su se u 4 retka**, a onaj od **368 znakova u 5**. Prag
fakulteta („odlomak najmanje 5 redaka") ne može se provjeriti bez rendera.

Kalibracija za TNR 12 / prored 1,5 / margine 2,54 cm: **84 znaka po retku**.
Koristi je samo kad render ne uspije, i tada izrijekom reci da je procjena.

---

## 5. Duljina mora proizlaziti iz sadržaja

Nakon koraka 4 lako se dobije nova pravilnost: prije zahvata je **61 % odlomaka
imalo točno 5 ili 6 redaka**. To je kalup jednako vidljiv kao i AI-fraza.

Ciljna raspodjela je raspršena preko 7–8 različitih duljina, s najvećim udjelom
ispod 25 %. Postiže se tako da se spaja **prema smislu**: odlomak koji iznosi
jednu tvrdnju s obrazloženjem ostaje kraći, onaj koji niže dokaze ili razvija
argument kroz nekoliko koraka bit će dulji. Ako se duljina namješta prema kvoti,
raspodjela izgleda uredno, ali tekst se raspada.


---

## Tijek moda — sažeto

> Ovo je bilo u routeru (`SKILL.md` § 2) do v1.7.
> Tijek jednog moda ne treba biti u datoteci koja se učitava u svakoj poruci.

`pisanje.md` + `stil_pipeline.md`. Neprihvaćene Track Changes → `revizije.py prihvati` prvo (0.7a), inače dijagnoza čita krnj tekst. Redoslijed je obavezan: izmjeri (`check_ai_style.py`, `check_paragraphs.py`) → ukloni tikove → poveži → prelomi predugo → geometrija odlomaka. Nakon svakog koraka ponovno izmjeri i pokreni `verify_rewrite.py`. **Nikad sve odjednom.** Kroz cijeli zahvat: **identičan skup citata i brojki**. Hrpa strukturnih pomaka odjednom → prvo `zamjerke.py grupiraj --po mjesto` (karta premještanja, `pisanje.md` §1.5). Zatvaranje zamjerki: `zamjerke.py resolve`/`provjeri`. Vizualni prikaz izmjena: `revizije.py redline`.

---

## Stilske dimenzije su SPREGNUTE — popravak jedne ruši drugu

Izmjereno na stvarnom radu. Skraćivanje predugih rečenica srušilo je koheziju s
15+ na **13,4** i podiglo udio dvotočja na **3,9/1000**, jer se rečenica najlakše
lomi upravo na dvotočju. Metrika „najdulja rečenica" je prošla, a tekst je postao
isprekidan. Rješenje je bilo pretvoriti dvotočja u vezna sredstva: kohezija 15,1,
dvotočja 2,7, najdulja rečenica 45 riječi.

**Pravilo:** stilske se dimenzije mjere **zajedno**, prije i poslije zahvata, i
nijedan zahvat se ne prijavljuje kao gotov dok se ne pokaže da nije pogoršao
ostale. Alati mjere dimenzije neovisno, pa je bez ovoga moguće „popraviti" tekst u
jednoj i ne primijetiti pad u drugoj.

---

## Strojni stil ne hvata kvarove koje sam zahvat proizvodi

Nakon prepisivanja, čitanje rečenicu po rečenicu našlo je **četiri kvara koje je
proizveo sam zahvat**, a nijedan alat nije prijavio:

- „sumnjaju u njegov učinak" — zamjenica ostala bez imenice nakon lomljenja rečenice
- „obje po 45/27 ispitanika" — slaganje roda nad imenicama različita roda
- dva vezna sredstva bez sadržaja („Naime,", „Dakle,") umetnuta radi metrike

Zadnji je najopasniji: **metrika kohezije mjeri prisutnost veznih sredstava, pa je
zahvat koji ih umeće prazno formalno poboljšanje.** Alat tada potvrđuje ono što je
sam pokvario.

**Pravilo:** nakon svakog prepisivačkog prolaza ide **ljudsko čitanje cijelog
izmijenjenog dijela**, i to se vodi kao korak u planu zadatka, ne kao dobra volja.
Povezano s pravilom 31 i dijelom `citanje_tijela`.

