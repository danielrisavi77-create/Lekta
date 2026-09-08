# ENGLESKI SLOJ — naslov, summary, ključne riječi, repozitorij

> Učitaj u modu 2 kad je hrvatski sažetak gotov, i obavezno u modu 6.
> Do v1.3 ovaj dio rada nije dodirivao nijedan alat: `provjeri_sazetak.py` radi nad
> hrvatskim, `check_rules.py` gleda samo postoji li naslov.

Engleski sažetak čitaju tri publike, i to redom: **mentor** (prvi, uz hrvatski),
**komisija**, i **svatko** — jer nakon predaje ide u Dabar i ostaje javan i nepromjenjiv.
Od svih dijelova rada, ovo je onaj koji najdulje preživi i najmanje se provjerava.

---

## 1. Pravilo redoslijeda

**Engleski sažetak se prevodi iz gotovog hrvatskog, nikad ne piše paralelno.**

Paralelno pisanje daje dva teksta koji polako odlutaju jedan od drugoga: hrvatski se
mijenja kad se rad promijeni, engleski ostaje. Prijevod iz gotovog teksta ima jedan izvor
istine i jednu točku ažuriranja.

Iz istog razloga: kad se hrvatski sažetak promijeni u zadnjem krugu — a mijenja se, jer se
piše zadnji — **engleski se prevodi iznova, ne krpa.**

---

## 2. Naslov

Naslov je jedina rečenica rada koja se pojavljuje na četiri mjesta: naslovnica, druga
naslovnica, sažetak i obrazac repozitorija. Sva četiri moraju nositi **isti** engleski
naslov, znak po znak.

| Ne | Da |
|---|---|
| doslovan prijevod reda riječi („The influence of the policy on the sector of energy") | prirodan engleski red („The impact of energy policy on the sector") |
| prijevod naziva ustanove „po sluhu" | službeni engleski naziv fakulteta iz Uputa ili s mrežne stranice |
| naslov koji se razlikuje od **prijavljenog** naslova teme | naslov usklađen s prijavom; razilaženje se otkriva u referadi, na kraju |

Zvanje mentora se **ne prevodi napamet**: „doc. dr. sc." nije „Assistant Professor" na
svakom fakultetu jednako. Uzmi oblik iz službenih Uputa; ako ga nema, ide u
**RUČNO PROVJERI**, ne u pretpostavku.

---

## 3. Summary

Isti sadržaj kao hrvatski sažetak, ista struktura, iste brojke. Praktično:

- **iste brojke, isti format** — decimalni zarez u hrvatskom (`27,4 %`) i točka u engleskom
  (`27.4%`) je legitimno, ali onda dosljedno kroz cijeli engleski tekst; alat prijavljuje
  razliku, čovjek presuđuje;
- **isti broj cjelina** — „u pet cjelina" i „in five parts" moraju biti isti broj. Sažetak
  koji je na hrvatskom tvrdio šest poglavlja, a na engleskom osam, prošao je do predaje
  na stvarnom radu (kvar 30);
- **duljina 5–15 % veća od hrvatske** — engleski je gramatički rastresitiji. Kraći engleski
  sažetak znači da je skraćen, ne preveden;
- **nijedna hrvatska riječ** osim vlastitih imena i naziva ustanova.

Termini se ne improviziraju. Pojam koji je u radu definiran preko izvora prevodi se
**terminom iz tog izvora**, ne rječnikom: ako je „sektorski pristup sigurnosti" preuzet iz
Buzana, engleski je „sectoral approach to security", jer je to izvorni termin, a ne
„sector-based security approach".

---

## 4. Ključne riječi

- **isti broj** na obje strane — različit broj je najčešća pogreška i uvijek je previd,
  nikad odluka;
- isti redoslijed, jer ih se čita usporedno;
- prevode se kao **termini**, ne kao riječi: „javne politike" → „public policy", ne
  „public politics";
- nijedna ne smije nositi hrvatski dijakritik.

---

## 5. Strojna provjera

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_engleski.py ./rad.docx \
    --profil ./.katedra/resolved_profile.json --json ./.katedra/engleski.json
```

Što alat radi i, jednako važno, što ne radi:

| Provjera | Težina | Napomena |
|---|---|---|
| postoji li summary kad ga profil traži | ❌ | |
| je li tekst uopće preveden (isti kao hrvatski) | ❌ | |
| poklapaju li se brojke | ❌ | godine i jednoznamenkasti brojevi se izuzimaju |
| isti broj ključnih riječi | ❌ | |
| ključne riječi bez dijakritika | ❌ | |
| brojevi ispisani riječima („pet" / „five") | ⚠️ | jezici drukčije slažu rečenicu; presuđuje čovjek |
| odnos duljina izvan 0,7–1,5× | ⚠️ | |
| hrvatske riječi u engleskom tekstu | ⚠️ | riječi s velikim slovom se ne prijavljuju (imena) |

**Kvaliteta prijevoda se ne ocjenjuje.** Alat mjeri suglasje s izvornikom, i to je sve što
može pošteno tvrditi (željezno pravilo 8). Crveno je rezervirano za ono što se ne da
drukčije protumačiti — lažni nalaz uči korisnika da ignorira crvenu boju, pa promašeni
nalaz poslije prođe neopaženo.

Alat je uvršten u `gate.py --faza predaja` kao savjetodavan korak, pa se pokreće i kad ga
se zaboravi pozvati ručno.

---

## 6. Repozitorij (Dabar) — pripremi blok, ne prevodi treći put

Hodogram unos u repozitorij broji kao jedan dan, a obrazac traži pet stvari koje već
postoje u radu. Ako se prevode iznova, dobiju se treći naslov i treći set ključnih riječi,
i tako ostaju — javno.

Pred predaju sastavi jedan blok teksta i predaj ga studentu:

```
Naslov (HR):        <s naslovnice, doslovno>
Naslov (EN):        <s druge naslovnice, doslovno — isti niz>
Sažetak (HR):       <iz rada, doslovno>
Abstract (EN):      <iz rada, doslovno>
Ključne riječi HR:  <iz rada>
Keywords EN:        <iz rada>
Znanstveno područje / polje: <iz Uputa ili prijave teme>
Licencija:          <student bira; fakultet često propisuje>
Embargo:            <ako postoji — i do kada>
```

Licencija i embargo su jedine dvije stavke koje ne dolaze iz rada. Licencija je studentova
odluka i **ne pretpostavlja se**; embargo traži razlog i najčešće suglasnost mentora.

---

## 7. Prije predaje

- [ ] engleski naslov je isti niz na naslovnici, u sažetku i u obrascu repozitorija
- [ ] engleski naslov se slaže s **prijavljenim** naslovom teme
- [ ] summary je preveden iz **konačne** verzije hrvatskog sažetka
- [ ] `provjeri_engleski.py` bez ❌ nalaza
- [ ] ⚠️ nalazi pročitani i razriješeni, ne preskočeni
- [ ] zvanje mentora na engleskom potvrđeno iz Uputa ili u RUČNO PROVJERI
- [ ] blok za repozitorij sastavljen i predan studentu
- [ ] `dijelovi.py --set summary_en=provjereno`
