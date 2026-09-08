# FUSNOTE — disciplina navođenja

> Alat je `scripts/provjeri_fusnote.py`. Za profile koji citiraju u fusnoti
> (`legal-footnote`, Libertas) ovo je središnja provjera; za autor–godina radove
> alat kaže da nema što provjeriti i to je točan odgovor.

## Zašto postoji

`citation_dialects.py` poznaje `legal-footnote`, a `check_citations` skenira fusnote za
citate. **Disciplinu fusnote nije provjeravao nitko.** Za pravne radove to je ono po čemu
se rad prvo prepoznaje kao ozbiljan ili neozbiljan.

## Četiri pravila koja alat mjeri

| Pravilo | Zašto |
|---|---|
| **prvo puni, pa skraćeni oblik** | „Smerdel, nav. dj.” prije nego je Smerdel ijednom naveden u cijelosti nema čemu upućivati |
| **`ibid.` samo uz neposredno prethodnu fusnotu** | u prvoj fusnoti nema na što upućivati; lanac od tri i više „ibid.” čitatelj izgubi |
| **kontinuitet numeracije** | rupa znači obrisanu fusnotu čiji je poziv ostao u tekstu, ili obratno |
| **razrješenje u popisu** | prezime iz fusnote koje nije u popisu literature je sirotan izvor |

Propisi, odluke i NN-oznake izuzimaju se iz zadnja dva pravila — obrazac za knjigu na njih
ne vrijedi.

## Uporaba

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_fusnote.py ./rad.docx --json .katedra/fusnote.json
```

## Granica

**Je li fusnota TREBALA postojati alat ne zna.** Pravilo „izravan citat, netrivijalan
činjenični iskaz i parafraza idu u fusnotu” traži razumijevanje teksta, ne slijeda fusnota.
To stoji u profilu fakulteta i provjerava ga `check_rules`, ili čovjek.

Rad bez fusnota nije nalaz ovog alata: on kaže da nema što provjeriti. Ako profil fusnote
traži, a rad ih nema, to je nalaz `check_rules`.
