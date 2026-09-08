# Satelitski skillovi — što Katedra zove, a ne posjeduje

> Katedra **ne posjeduje** ni audit-kod, ni statistički pogon, ni FPZG kućni stil.
> Vlasnici su zasebni skillovi. Ovdje je samo granica: kada se koji zove, kako se
> čita njegov nalaz i što se radi kad ga nema.
>
> Registar je `references/vjestine.json`. Razrješavanje je strojno:
>
> ```bash
> python3 <KATEDRA_SKILL>/scripts/vjestine.py --provjeri
> python3 <KATEDRA_SKILL>/scripts/vjestine.py --sposobnost izrada.docx --fakultet fpzg
> ```
>
> | izlazni kod | značenje | što radiš |
> |---|---|---|
> | 0 | sve tražene sposobnosti razriješene (ili imaju rezervu) | puni opseg |
> | 3 | satelit nije pronađen, a rezerve nema | radi smanjeni opseg i **zabilježi ograničenje u projektu** |
> | 4 | satelit postoji, ali mu nedostaju deklarirani entrypointi | ne pokreći ga; javi korisniku da skill treba ponovno instalirati |
>
> **Ako satelita nema, to se kaže.** Ne piše se rad kao da je replikacija napravljena,
> ne predaje se dokument kao da je prošao kućni stil. Izostanak je ograničenje projekta
> i upisuje se u `.katedra/stanje.json`, jednako kao exit 3/4 kod motora.

## Dvije razine povjerenja

| razina | što znači | primjer |
|---|---|---|
| `strojno` | Katedra rezultat **interpretira** kao podatak | `rad-audit` → `DocumentAuditResult` |
| `radno` | satelit proizvodi artefakte koje čita čovjek i agent | `usporedba.csv`, predajni `.docx` |

Za `strojno` vrijedi puna strogost: bez valjanog `engine_contract.json` kandidat je
nekompatibilan bez obzira na to koje funkcije sadrži (v. `references/audit.md`). Za
`radno` se provjerava da deklarirani entrypointi doista postoje kao datoteke — slabije
jamstvo, i tako se i prijavljuje.

## `audit.brojke` — replikacija (mod 4, mod 6)

Ako rad iznosi vlastite izračune, uz faze A–G ide i replikacija. `replikacija-pspp`
ponovno izračuna svaku tvrdnju u trećem programu (GNU PSPP) i vrati `usporedba.csv`.

```bash
python3 <REPLIKACIJA_SKILL>/scripts/pspp_replikacija.py sve --conf replikacija.json
python3 <REPLIKACIJA_SKILL>/scripts/prilog_replikacija.py --conf replikacija.json --dokument rad.docx
```

Kako se čita nalaz:

- **Redak koji se ne poklapa je nalaz razine A** — jednako težak kao izmišljen izvor.
  Riječ je o istoj vrsti pogreške: rad tvrdi nešto što se ne može pokazati.
- **„PSPP to ne ispisuje" nije neslaganje nego ograničenje** i tako se bilježi. Razlika
  je bitna: prvo je pogreška u radu, drugo je granica alata.
- Razlika u **zadnjoj ispisanoj decimali nije neslaganje**; razlika u prvoj jest.
- Usporedba mora biti **potpuna**: svaka brojka iz rada ima svoj redak, ili obrazloženo
  „ne ispisuje se". Nepotpuna tablica nije prošla replikacija nego nezavršen posao.

Tematsko kodiranje otvorenih odgovora **nije** statistička operacija i ne replicira se.
To se kaže izrijekom, ne prešuti.

## `izrada.docx` i `stil.kucni` — motor i kućni stil (mod 2, mod 6)

**Do kolovoza 2026. ove su dvije stvari bile jedna sposobnost, vezana na fakultet.** To je
značilo da drugi fakultet zahtijeva kopiju motora izrade — točno ono što željezno pravilo
10 zabraniti: *dvije kopije = dvije verzije istine unutar tjedna.* Sada su razdvojene:

| Sposobnost | Što je | Vezano na fakultet |
|---|---|---|
| `izrada.docx` | **motor**: petlja do fiksne točke, živa polja, nedjeljivi prikazi, unakrsne reference, numeracija po sekcijama | **ne** — `rad-docx` je neutralan |
| `stil.kucni` | **kućni stil**: referentni `.docx`, redoslijed dijelova, osobitosti koje profil ne pokriva | da — `uvjet.fakultet` |

Motor ne zna kućni stil: graditelja prima kao naredbu (`--graditelj`) i preko okoline mu
predaje stanje petlje (`RAD_SADRZAJ`, `RAD_TOC`, `RAD_PRELOMI`). Zapis `izrada.docx` nosi
taj ugovor u ključu `ugovor_s_graditeljem` — graditelj koji o stanju ne ovisi natjera petlju
da konvergira na brojevima koje dokument ne nosi.

Rezerva je i dalje **Katedrin `scripts/build_docx.py`**: generički kostur po profilu, bez
mjerenja prijeloma i bez unakrsnih referenci. Ne izmišlja ništa što u profilu ne piše.

Odluka se donosi **pretragom sposobnosti**, ne imenom fakulteta u kodu:

```bash
python3 <KATEDRA_SKILL>/scripts/vjestine.py --sposobnost izrada.docx --fakultet <slug>
python3 <KATEDRA_SKILL>/scripts/vjestine.py --sposobnost stil.kucni  --fakultet <slug>
```

**Drugi fakultet dodaje se kao novi zapis `stil.kucni`, ne kao novi motor.** Ako satelita
stila nema, motor radi po profilu — smanjeni opseg, i to se deklarira korisniku.

Razdvajanje je potvrđeno prihvatnim testom: isti rukopis kroz stari lanac i kroz motor daje
identičan broj stranica i identične brojeve u sadržaju i popisu prikaza. Zapis rezultata je
u `references/vjestine.json`, ključ `sposobnosti['izrada.docx']` i `migracija` iz zakrpe.

## `audit.dokument` — motor (mod 4)

Razrješava `scripts/engine.py`, po vlastitom ugovoru. Detalji, izlazni kodovi i granica
prema solo skillu: `references/audit.md`. Ovdje stoji samo zato da popis sposobnosti
bude potpun — Katedra na jednom mjestu mora moći odgovoriti što joj sve treba.

## Kako se dodaje četvrti satelit

Jedan zapis u `references/vjestine.json`: ime sposobnosti, skill koji je nudi, razina
povjerenja, modovi u kojima se traži, entrypointi i (ako postoji) rezerva. Nijedna
izmjena Katedrina koda. Test to i drži: ime satelita ne smije se pojaviti u izvršnom
kodu `scripts/vjestine.py`.
