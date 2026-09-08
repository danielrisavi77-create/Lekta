# RUBRIKA — gdje rad stoji i što ga drži

> Učitaj u modu 6, i u modu 1 kad se dogovara ciljana ocjena. Registar je
> `references/rubrika.json`, alat `scripts/rubrika.py`, izlaz `.katedra/rubrika.json`.

## Zašto postoji

Cijeli je paket optimiran prema petici, a nigdje nije stajalo **prema čemu se ta petica
mjeri**. Posljedica: „rad je spreman" značilo je „prošao je formalne provjere" — što nije
isto. Rad koji prođe svih dvanaest provjera `check_rules.py`, a nema tezu, i dalje ne nosi
peticu (željezno pravilo 11). Student je to čuo tek od mentora, i tek na kraju.

Os dijelova (`references/dijelovi.md`) odgovara na pitanje *ima li rad sve dijelove*.
Rubrika odgovara na drugo: *vrijede li ti dijelovi nešto*.

## Što alat jest i što nije

**Agregator, ne sudac.** Status svakog kriterija izvodi se iz artefakata koje su drugi
alati već napisali. Nijedna nova prosudba, nijedna vrijednost na dva mjesta (pravilo 13).

| Kriterij | Čita |
|---|---|
| Teza i zatvaranje kruga ★ | `arg.json` (dimenzije `teza`, `zaključak zatvara krug`) |
| Vlastiti doprinos ★ | `arg.json` (`doprinos`, `deskriptivnost`) |
| Odgovor na zadatak ★ | `zadatak.json` |
| Izvori i dokazna potpora ★ | `evidence_gate.json`, inače `izvori.json` |
| Zamjerke mentora ★ | `zamjerke.json` |
| Metodologija | `dijelovi.json` (postaje ★ za empirijski rad) |
| Struktura | `dijelovi.json` |
| Usklađenost s kućnim stilom | `pravila.json` (`check_rules --json`) |
| Jezik i povezanost | `stil.json` (`check_ai_style --json`) |
| Sažetak i engleski sloj | `sazetak.json`, `engleski.json` |

**Ne predviđa ocjenu mentora**, i to piše ispod svakog ispisa. Daje **pojas** — gornju
granicu koju rad u ovom stanju može doseći — i imenuje što ju drži.

## Pravilo koje čini razliku

**Artefakt kojega nema je `nepoznato`, nikad `ispunjeno`.** Ako `nepoznato` padne na
ključni kriterij, pojas se **ne procjenjuje uopće**:

```
POJAS: nepoznato   (ključni kriterij nema artefakt — pojas se ne procjenjuje.
                    Nedostatak dokaza nije dokaz.)
drži ga: Odgovor na zadatak predmeta, Izvori i dokazna potpora
```

To je isti princip po kojem `gate.py` razlikuje „alat pukao" od „provjera prošla". Alat
koji bi u toj situaciji rekao „pojas 4" naučio bi studenta da mu vjeruje kad nema razloga.

## Kako se čita pojas

| Pojas | Znači | Što dalje |
|---|---|---|
| `nepoznato` | ključni kriterij nema artefakt | pokreni što fali — popis je u „drži ga" |
| `3` | ključni kriterij **nije ispunjen** | rad je deskriptivan ili bez teze; ovo se ne popravlja stilom |
| `4` | ključni kriterij je **na pola** | najčešće stanje; „drži ga" je točan popis posla |
| `4–5` | ključno stoji, sporedno odvlači | forma, stil, sažetak — sve popravljivo u jednom danu |
| `5` | svi kriteriji s artefaktom ispunjeni | ostaje ono što alat ne vidi (v. niže) |

★ označava ključni kriterij. **Jedan pali ključni kriterij obara pojas bez obzira na sve
ostalo** — tako i mentor ocjenjuje: nema teze, nema petice, ma koliko uredna bila forma.

## Uporaba

```bash
# nakon što su artefakti napravljeni (gate.py --faza predaja ih napravi)
python3 <KATEDRA_SKILL>/scripts/rubrika.py --opsirno --json ./.katedra/rubrika.json

# blokirajuće, kad je ciljana ocjena dogovorena u modu 1
python3 <KATEDRA_SKILL>/scripts/rubrika.py --cilj 5 --strogo
```

`--opsirno` uz svaki nedovršen kriterij ispisuje **što se radi**, ne samo da nešto fali.
Bez `--strogo` alat je čisto dijagnostički i uvijek vraća 0 — u `gate.py --faza predaja`
uključen je kao savjetodavan korak, da se pokrene i kad ga se zaboravi pozvati.

## Kako se rubrika prilagođava

Registar nosi **generičke** kriterije koji vrijede na hrvatskim fakultetima. Nijedan profil
u registryju nema vlastiti ključ `ocjenjivanje`, i to se ovdje kaže umjesto da se
pretpostavi. Dva legitimna načina prilagodbe:

1. **Mentorova stvarna rubrika.** Ako je student dobio obrazac s kriterijima i bodovima,
   to je jače od generičkog registra — jednako kao što je uzorak mentora jači od profila
   (pravilo 17). Prepiši kriterije u projektni `.katedra/rubrika.json` i pokreni s
   `--registar ./.katedra/rubrika.json`.
2. **Novi kriterij za sve.** Jedan zapis u `references/rubrika.json`, uz čitač koji već
   postoji u `scripts/rubrika.py`. Čitač koji ne postoji **ne dodaje se registru** —
   registar se validira i odbija kriterij s nepoznatim čitačem, upravo zato da nijedan
   kriterij ne ostane bez izvora.

Težine su namjerno raspoređene tako da forma nosi 2, a teza i doprinos po 5. Forma je
uvjet, ne vrlina.

## Što rubrika ne vidi

Popis je kratak i mora se izgovoriti studentu uz svaki ispis:

- **originalnost misli** — je li teza zanimljiva, a ne samo obranjiva;
- **je li literatura prava** — alat provjerava da izvor postoji, ne da je relevantan;
- **poznaje li mentor temu bolje** — sekcija 8 plana (metodološka upozorenja) postoji
  upravo zato: to mentor prvo provjeri, a nijedan alat ne zna;
- **kvaliteta rasprave** — `references/rasprava.md` je razlog zašto je taj dio u osi
  dijelova upisan kao `rucno`.

Rad koji dosegne pojas 5 nije rad koji će dobiti pet. To je rad kojemu se **na temelju
postojećih artefakata** ne može prigovoriti ništa od onoga što se dade izmjeriti.
