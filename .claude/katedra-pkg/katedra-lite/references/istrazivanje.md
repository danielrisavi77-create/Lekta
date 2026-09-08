# ISTRAŽIVANJE — traženje literature i plan čitanja

> Mod 1, prije nego se napiše ijedan redak strukture. Alat je `scripts/pretraga.py`,
> stanje `.katedra/pretraga.json` i `.katedra/citanje.json`.

## Zašto postoji

Sve **nizvodno** od „imaš izvore” bilo je pokriveno: `verify_sources.py` provjerava postoje
li, `evidence_ingest.py` vadi dokaze s lokatorom, `claim_ledger.py` veže tvrdnju uz dokaz.
**Uzvodno nije postojalo ništa.** Odakle izvori dolaze, koje su baze pretražene, kojim
riječima, što je odbačeno i zašto.

Dvije posljedice:

1. Na obrani se pita **„kako ste došli do ove literature”**, a odgovora nema. Za sistematski
   pregled to nije propust nego izostanak metode.
2. Student čita redom kojim je izvore našao, a ne redom kojim mu trebaju — pa tjedan ode na
   tekst koji je trebalo preletjeti.

---

## 1. Prije prvog upita: pitanje i kriteriji

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py init \
  --pitanje "…" --razdoblje "2015.–2026." --jezici hr --jezici en \
  --ukljuci "recenzirani radovi i službene statistike" \
  --iskljuci "medijski napisi bez izvora"
```

**Kriteriji se pišu prije pretrage, ne poslije.** Kriterij smišljen nakon što se vidi što je
nađeno nije kriterij nego opravdanje. Ono što se ne dade obraniti kao kriterij, ne dade se
obraniti ni kao izostavljanje.

Minimum koji svaki rad treba: razdoblje, jezici, tip izvora koji ulazi, tip koji ne ulazi.

---

## 2. Baze — gdje se traži

| Baza | Kad |
|---|---|
| **Hrčak** | hrvatski recenzirani časopisi; prvi izbor za domaću literaturu |
| **CroRIS** | hrvatska znanstvena bibliografija; tko je što objavio, tko radi na temi |
| **Dabar** | završni i diplomski radovi hrvatskih ustanova — **i kao sadržajni i kao tehnički uzorak** (v. §6) |
| **NSK / knjižnica fakulteta** | knjige i monografije kojih nema u digitalnim bazama |
| **Scopus / Web of Science / EBSCO** | strana recenzirana literatura; pristup ide preko fakulteta |
| **Google Scholar** | **discovery, nikad izvor** — nađeni članak se citira sam, kanal se bilježi kao `discovered_via` (željezno pravilo 3) |
| **Eurostat / DZS / HNB / registri** | primarni podaci; kvaliteta A |

Svaki upit se bilježi, s brojem pogodaka i brojem zadržanih:

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py upit \
  --baza "Hrčak" --upit "turoperator AND oporavak" --pogodaka 34 --zadrzano 6
```

Omjer pogodaka i zadržanih je sam po sebi nalaz: 212 → 3 znači preširok upit, 6 → 6 znači
preuzak.

---

## 3. Kako se gradi upit

1. **Iz istraživačkog pitanja izvuci 3–5 pojmova**, ne rečenicu.
2. **Za svaki pojam napiši sinonime i hrvatsku i englesku inačicu.** „Javne politike” /
   „public policy”; „turoperator” / „tour operator”. Hrvatska baza na engleski upit vraća
   malo, i obratno.
3. **Kombiniraj s AND, širi s OR**, ograniči poljem (naslov, ključne riječi) kad je pogodaka
   previše.
4. **Skrati na korijen** gdje baza to podržava (`turoperat*`) — hrvatska sklonidba inače
   reže polovicu pogodaka.

---

## 4. Snowball — dva smjera

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py snowball --iz src_… --smjer unatrag --nasao 4
```

- **unatrag**: iz popisa literature nađenog rada. Vodi prema temeljnim tekstovima.
- **unaprijed**: tko taj rad citira (Scholar, Scopus). Vodi prema novijem i prema kritici.

Jedan dobar rad u snowballu vrijedi više od tri nova upita. Ako je tema uska, snowball je
često **glavni** kanal, i tada se tako i piše u metodologiji.

---

## 5. Zasićenje — kad se staje

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py zasicenje --dosegnuto da \
  --obrazlozenje "zadnja dva upita nisu dala nijedan nov izvor"
```

Staje se kad novi upiti prestanu davati nove izvore, **ne kad se dosegne `izvori_min` iz
profila.** Broj iz profila je donja granica, ne cilj. Rad koji stane na petnaestom izvoru
jer profil traži petnaest, stao je na broju, ne na temi.

---

## 6. Plan čitanja — uloga određuje koliko se čita

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py citanje src_… --uloga jezgra --status neprocitano
python3 <KATEDRA_SKILL>/scripts/pretraga.py status
```

| Uloga | Koliko se čita |
|---|---|
| `jezgra` | nosi tezu ili joj proturječi → **cijelo, s bilješkama** |
| `metoda` | uzor za dizajn ili instrument → metodološki dio |
| `potpora` | potkrjepljuje jednu tvrdnju → odjeljak koji je nosi |
| `kontekst` | smješta temu → sažetak i zaključak |
| `odbaceno` | ne ulazi u rad → **razlog je obavezan** (kriterij isključenja) |

**Uloga nije ocjena kvalitete izvora** — to je taksonomija A/B/C/D/E/X u `izvori.json`.
Uloga kaže koliko vremena izvor zaslužuje u ovom radu.

Redoslijed čitanja koji `status` predlaže: jezgra → metoda → potpora → kontekst, a unutar
toga nepročitano prije preletjenog. Izvor koji proturječi tezi čita se **prvo, ne zadnji** —
ako obara tezu, bolje je to znati prije nego što se napiše osam poglavlja.

Kad je izvor pročitan, dokazi se vade alatom, ne pamćenjem:

```bash
python3 <KATEDRA_SKILL>/scripts/evidence_ingest.py ./izvori/autor2024.pdf \
  --source-id src_… --source-verification ./.katedra/izvori.json \
  --out ./.katedra/evidence.jsonl
python3 <KATEDRA_SKILL>/scripts/pretraga.py citanje src_… --status izvuceno
```

---

## 6b. Pozicioniranje — „što je tu novo?”

Prvo pitanje komisije i rečenica koja u uvodu razlikuje rad koji zna gdje stoji od rada
koji je samo pročitao literaturu.

```bash
python3 <KATEDRA_SKILL>/scripts/pretraga.py pozicija \
  --izvor "Čavlek 1998" \
  --sto-radi "definira turoperatora i lanac vrijednosti, bez podataka o oporavku" \
  --razlika "ovaj rad testira definiciju na podacima 2019.–2024."
```

**Tri najbliža rada su minimum.** S jednim se ne vidi je li razlika u temi, u podacima ili
u pristupu.

Razlika se piše konkretno. „Noviji podaci” sama za sebe nije razlika — svaki rad ima
novije podatke od starijega. Razlika je: **drugi predmet, drugi podaci, druga metoda,
druga razina analize ili suprotan nalaz.**

Bez ovog zapisa rečenica o doprinosu piše se napamet, pred kraj, i obično ispadne „o ovoj
je temi malo pisano” — najslabija moguća tvrdnja, jer se obara jednim naslovom.

## 7. Što od ovoga ide u rad

| Kamo | Što |
|---|---|
| **Metodologija** (`references/metodologija.md` §7) | baze, razdoblje, kriteriji, snowball, zasićenje — za pregledni i sistematski rad to **jest** metoda |
| **Uvod** | jedna rečenica o dosegu literature ako je tema uska ili građa ograničena |
| **Obrana** | odgovor na „kako ste došli do literature” i na „što je tu novo” — doslovno iz `status` ispisa |
| **Ograničenja** | baze kojima nije bilo pristupa, jezici koji su izostavljeni |

Zapis pretrage nije birokracija nego **jedini oblik u kojem se postupak poslije dade
obraniti**. Bez njega je odgovor na obrani rekonstrukcija po sjećanju, a sjećanje na to
kojim se riječima tražilo prije tri mjeseca ne postoji.

---

## 8. Granice

- Alat **ne pretražuje baze umjesto tebe** i ne zna koliko je pogodaka bilo — brojeve
  upisuješ ti. Zapis je onoliko točan koliko je unos pošten.
- **Ne ocjenjuje je li izvor dobar.** Postoji li → `verify_sources.py`; koliko vrijedi →
  taksonomija A/B/C/D/E/X.
- Zasićenje je **tvoja prosudba**, ne izračun. Alat ju bilježi i traži obrazloženje.
