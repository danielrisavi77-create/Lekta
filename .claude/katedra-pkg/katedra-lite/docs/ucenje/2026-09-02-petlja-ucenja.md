# Test petlje učenja — 10 nalaza (1. 9. 2026.) kroz protokol skilla `katedra`

Ulaz: `katedra-lite-dodaci/patches/README_patch.md`. Ručni popravci: `katedra-lite-rt` (1d0fa4d
baseline s nalazima 1/3/10 + f183e9c, 7c0f94c, e121bc4, 5da1269, b30e558) i `rad-audit-rt` (ec67629).
Protokol izvršen u kopiji `/home/claude/katedra-meta-rt`; synced mapa i oba repoa nisu dirani.
Izlazi: `zamke_fragment.md` (14 unosa, 24–37), `ladice_ostalo.md` (doktrina/zasto/pisanje/ideje),
`dokazi/` (8 ispisa `dokaz.py` + `kvar.py` + `zakrpa.py`), `assets/` (2 fixturea), `zakrpa/` (34 datoteke,
UPUTE.md sa „Zašto" popunjenim, primijeni.sh).

## 1. Tablica po nalazu

| # | Nalaz | Ladica po §1.2 | Što bi katedra proizvela | Ručno napravljeno | Slaže se? | Komentar |
|---|---|---|---|---|---|---|
| 1 | FPZG resolver pada (null + sheme) | kvar (tih: gate „preskočeno") + provjera koja ne postoji (test 3×4) | zamke 24; dokaz 2→0; ideja: test 12 poziva u `razvoj.md` | 3 diffa u baselineu; bez testa, bez PROMJENE | djelomično | popravak isti; ograda (test) i zapis nedostaju |
| 2 | sateliti u `synced/<hash>/` | kvar (tih; krši pravilo 10 koje već postoji) | zamke 25; dokaz 3→0; zasto.md p.10 | `vjestine.py` glob + PROMJENE (f183e9c) | da | doktrina postoji, kvar u implementaciji — protokol ne traži SKILL.md |
| 3 | build_docx: NameError, fantomski naslovi, Cambria | 3 kvara (a loud, b+c tihi) | zamke 26, 27; fixture rukopis s tablicom; dokaz 1→0 | `build_docx.py.diff` u baselineu, smoke-test na 105 odlomaka | da (popravak), ne (dokaz) | diff „pisao agent u sintezi, provjeren generiranjem, ne testovima" — §1.4 bi tražio fixture; fixture otkrio „1. 1. UVOD" (ideja) |
| 4 | gate BLOKIRA na `nepotvrdeno`, 0 kršenja | **lažni nalaz** (+ doktrina p.18 već postoji) | zamke 28; dokaz (tekst 1❌→0); zasto.md p.18; redak u p.18 o izlaznom kodu | check_rules exit/provenance (f183e9c, 5da1269) | da | dokaz.py bez `--dopusti-isto` pada: oba stanja exit 0 — kvar je bio u gateu, ne u kodu skripte |
| 5 | fpzg-diplomski nad seminarskim | kvar (`StopIteration`) + **doktrina** (satelit ↔ tip) + mrtva naredba `provjeri_reference.py` | zamke 29; SKILL.md redak (p.10 / modovi 2, 6); zakrpa i za `fpzg-diplomski` | `vjestine.json` `tipovi` + `--tip` (f183e9c) | djelomično | ručno samo katedra-lite; `fpzg-diplomski` nije u popisu satelita pravila 7 — katedra ne zna kamo s tim kvarom; `provjeri_reference.py` nitko nije ni maknuo ni napravio |
| 6 | Vancouver ne postoji | kvar (tih, 4 alata) + lažni nalaz + **pravilo pisanja** + doktrina (2 skilla) | zamke 30; pisanje.md redak; `--par` zakrpa za 2 skilla; fixture; SKILL.md p.4 popis dijalekata | 7c0f94c + ec67629 (241+152 redaka, testovi, pisanje.md, rad-audit SKILL.md) | da, i više | jedino: `katedra-lite/SKILL.md` p.4 i dalje nabraja 3 dijalekta; srodna ideja iz 25. 8. ostaje neriješena |
| 7 | naslov „POPIS CITIRANE LITERATURE" | kvar (💥 = pravilo 20) | zamke 31; fixture; dokaz 2→1 | `NASLOV_LIT_PROSIREN` (f183e9c) **i** `hr_text.NASLOV_LIT` (7c0f94c) | da | dva mjesta istine u tjedan dana (pravilo 10 katedra-lite); dokaz otkrio kvar 35 |
| 8 | admission hash stale + `evals/` nema | (a) postupak — **nema ladice**; (b) kvar (petlja bez izlaza); doktrina za `razvoj.md` | zamke 32; ideja (a); doktrina redak | ništa | — | jedini nalaz bez ijednog poteza; reproduciran: registry ❌ stale, gate ❌ no such file |
| 9 | opseg po dijelovima | pravilo fakulteta (lokator u Uputama) + kvar „provjera koja ne postoji" | zamke 33; `hks-fzs.json`; `provjeri_dijelove.py`; fixture | e121bc4: sheme, profil, 2 skripte (1252 redaka), fixture | da, i preko mjere | `upute_u_profil.py` (812 r.) je ideja bez druge pojave — §2 bi ga poslao u čekaonicu |
| 10 | napredak bez plana | **lažni nalaz** | zamke 34; dokaz; zasto.md p.29 | popravljeno u dodacima (baseline) | da (popravak), ne (dokaz) | verzija „prije" nije sačuvana → §1.4 ne može reproducirati → unos bez dokaza |

Uz 10 nalaza protokol je proizveo **4 nova**: kvar 35 (11/75 lažnih ❌ „godina s točkom" na Vancouveru,
stvarni rad), 36 (katedra: dvije nepostojeće zastavice), 37 (katalog 23/31/32–33 + tri mrtve skripte),
i ideju o dvostrukoj numeraciji u `build_docx --rukopis`.

## 2. Nalazi koje protokol ne zna klasificirati ili bi ih krivo smjestio

* **Vlasnik ≠ katalog.** Tablica §1.2 šalje svaki kvar u `rad-docx/references/zamke.md`, a 9 od 10
  kvarova je u `katedra-lite` (resolver, vjestine, check_rules, build_docx, dijalekti). `katedra-lite`
  ima `docs/PROMJENE.md` i `zasto.md`, ali katalog kvarova nema — protokol ih ili trpa u tuđi
  katalog (krši pravilo 7) ili ih gubi.
* **`fpzg-diplomski` i `replikacija-pspp`** nisu u popisu pravila 7 (rad-docx/rad-audit/katedra-lite),
  pa kvar 29 (`StopIteration` u `sastavi.py`) nema odredište.
* **Postupak održavanja** (nalaz 8a: „poslije zakrpe profila obnovi admisiju") nije ni kvar ni pravilo
  ni doktrina — ladica ne postoji; završio je u `ideje.md` gdje ne pripada.
* **Nalaz 9** izgleda kao „primjerak" (mjerena vrijednost), a zapravo je pravilo fakulteta s
  lokatorom + rupa u shemi; granični slučaj `ladice.md` „Primjerak ili pravilo" to pokriva, ali tek
  ako čitatelj otvori referencu.
* **Nalaz 4/10 su lažni nalazi**, ali ladica „lažni nalaz" kaže samo „skripta + zapis u zamke" — ne
  traži unos u `zasto.md` pod pravilo koje je prekršeno (18, 29), iako je to jedino mjesto gdje
  „što se dogodilo kad pravila nije bilo" živi.

## 3. Koraci protokola koji traže datoteku/skriptu koje NEMA (provjereno `ls`, 2. 9. 2026.)

| Korak | Traži | Stanje |
|---|---|---|
| §1.1 | `<RAD_DOCX>/scripts/provjeri_povratak.py` | **ne postoji** (rad-docx/scripts: arhiva, gradi, inventar_paketa, izmjeri, prikazi, provjeri_predaju, sadrzaj, shema); zovu ga i `katedra-lite/references/povratak.md`, `stil_autora.md` |
| §1.3 | `kvar.py --provjeri --nastavak-od N` | **zastavica ne postoji** (argparse exit 2); postoji `--od N`, ali numeraciju i dalje broji od 1 → fragment 24–37 daje tvrdu grešku koju SKILL.md tvrdi da je uklonio (dokazi/kvar_provjeri_fragment.txt) |
| §1.4 | `dokaz.py --ocekuj-pad-pa-prolaz` | **zastavica ne postoji** (exit 2); radi bez nje |
| `kvar.md` primjer, `predaja.md` r. 209/369 | `rad-docx/scripts/provjeri_reference.py` | **ne postoji** |
| `katedra-lite/SKILL.md` r. 332, `rad-audit` faza A | `katedra-lite/scripts/provjeri_zamke_proze.py` | **ne postoji** (ni u repou ni u synced) |
| pravilo 8, `rad-docx/SKILL.md` | kvarovi 24–33 u `zamke.md` | katalog završava na **23**; opis obećava 31, katedra citira 32 i 33 |
| §1.5 | `zakrpa.py --par` | radi (34 datoteka) — ali pakira i `tests/` koji paket ne isporučuje i commit izvan nalaza (b30e558) |

## 4. Što bi protokol dodao, a ručno nije napravljeno

1. **Unos u katalog kvarova** za svaki od 10 nalaza (0 ručno; 14 sada u `zamke_fragment.md`).
2. **`zasto.md`** pod pravila 18 (nalaz 4), 10 (2, 5), 29 (10), 19 (9) — 0 ručno.
3. **Doktrina u `katedra-lite/SKILL.md`**: p.4 popis dijalekata + Vancouver; p.10/modovi 2, 6 satelit
   kućnog stila ↔ tip rada; p.18 izlazni kod; §0.5 admisija poslije zakrpe profila — 0 ručno
   (rad-audit SKILL.md jest ažuriran).
4. **Fixturei u `assets/`** za nalaze 3, 6, 7, 10 (ručno samo za 9 i rad-audit 6); sada 2 u `assets/`.
5. **Dokaz prije/poslije** ispisan uz svaki popravak (ručno: smoke-test i brojke u PROMJENE, bez
   ispisa obaju stanja); sada 8 ispisa u `dokazi/`.
6. **`ideje.md`**: test 3×4 resolvera, `upute_u_profil.py` kao ideja, dvostruka numeracija,
   abecedni red na numeričkom popisu, granice Vancouvera.
7. **Zakrpa i za `fpzg-diplomski`** (`next()` bez default) i **rad-docx** (`zamke.md` 24–31,
   `provjeri_reference.py` — napraviti ili maknuti iz `predaja.md`).
8. **Nalaz 8 u cijelosti** (registry/gate petlja) i **kvar 35** (lažni ❌ na Vancouver popisu).
9. `UPUTE.md` s tablicom „zašto" po datoteci (ručno: PROMJENE.md, po nalazu, ne po datoteci).

## 5. Nalazi o samom skillu `katedra`

* K1 — **Dvije dokumentirane zastavice ne postoje** (`--nastavak-od`, `--ocekuj-pad-pa-prolaz`); opis skilla
  tvrdi da je `--nastavak-od` dodan. Isti mehanizam kao §1.5 koji je skill sam ispravio (kvar 36).
* K2 — **§1.1 zove `provjeri_povratak.py`** koji ne postoji; `kvar.md` primjer zove `provjeri_reference.py`
  koji ne postoji. Skill koji uči iz mrtvih naredbi sam ih nosi dvije.
* K3 — **Jedan katalog za sve skillove** (`rad-docx/zamke.md`) proturječi pravilu 7; `katedra-lite` nema
  kataloga, `zasto.md` i `PROMJENE.md` nisu u tablici ladica.
* K4 — **Pravilo 8 citira kvarove 32 i 33** kojih u instalaciji nema; katalog stoji na 23 (kvar 37).
* K5 — **`dokaz.py` dokazuje samo izlazni kod**: dva puta je „dokazao" popravak iz krivog razloga (baseline
  bez susjeda; `--tip` koji baseline ne poznaje → argparse 2). Nema ograde „prije mora pasti zbog
  MEHANIZMA, ne zbog argumenata". Nalaz 4 (BLOKIRA u gateu, exit 0 u skripti) bez `--dopusti-isto` pada.
* K6 — **`kvar.py --novi`** ne prima početni broj — fragment se ne može kosturom započeti na N+1.
* K7 — **`zakrpa.py` ne zna granice paketa** (`tests/`, `evals/`, `__pycache__` da, ali ne `razvoj.md`
  popis neisporučenog) ni izbor po nalazu; nosi sve iz diffa, uključujući tuđe commite.
* K8 — **Koraci bez izlaza**: §1.2 razvrstavanje nema zapis (nigdje se ne bilježi „nalaz N → ladica X"),
  §1.4 „fixture u assets/" nema alat ni registar osim ručne tablice u `assets/README.md`.
* K9 — **Nema ladice za postupak održavanja** ni za nalaz koji spaja dva skilla (6 = katedra-lite +
  rad-audit): §1.5 to rješava `--par`, ali §1.2 nalaz mora u „točno jednu ladicu".
* K10 — `ideje.md` ima jedan unos od 25. 8.; nalaz 6 je srodan (lažni nalaz faze B), ali drukčiji mehanizam —
  protokol nema korak „provjeri čekaonicu pri svakom novom nalazu".

## 6. Nastavak (2. 9. 2026.): K1–K4 popravljeni u `/home/claude/hygiene/katedra.SKILL.md`

K1: `kvar.py --nastavak-od N` implementiran u `katedra-meta-rt/scripts/kvar.py` (i auto-čitanje zaglavlja
„nadovezuje se na unos N"; `--novi … --nastavak-od N` daje N+1); fragment 24–37 prolazi (exit 0), krivi N pada.
`--ocekuj-pad-pa-prolaz` maknut iz §1.4 — zadano ponašanje `dokaz.py` to već jest; dokumentiran `--dopusti-isto`.
K2: §1.1 sada zove `revizije.py prihvati` + `diff_versions.py IZVORNI VRACENI --json` (testirano) i `izmjeri.py` za PDF.
K3: ladice po vlasniku (`<vlasnik>/references/zamke.md`, numeracija po katalogu) + nove ladice `zasto`, `postupak`;
`PROMJENE.md` zadnji korak §1.5. K4: pravilo 8 upućuje na kvarove 36/37 u fragmentu. Dodan korak „provjeri čekaonicu".
Nije dirano: `references/kvar.md` (i dalje kaže „katalog je rad-docx/zamke.md" i citira `provjeri_reference.py`) — izvan zadatka.
