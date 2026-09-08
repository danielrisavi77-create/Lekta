# PRIMJERCI — obranjeni rad kao mjerilo oblika

> Alat je `scripts/primjerci.py`, stanje `.katedra/primjerci.json`.
> Provodi željezno pravilo 17: **uzorak je jači od profila.**

## Zašto postoji

Pravilo 17 je postojalo od ranije, a **nabava uzorka nije**: ovisila je o tome ima li
student slučajno rad koji mu je mentor dao kao mjerilo. A obranjeni radovi hrvatskih
ustanova javno stoje u repozitorijima (Dabar i repozitoriji fakulteta).

Student skine dva ili tri rada sa **svojeg odsjeka**, alat ih izmjeri, i pravilo 17
prestaje biti prigodno.

## Postupak

```bash
python3 <KATEDRA_SKILL>/scripts/primjerci.py izmjeri rad.docx --profil ./.katedra/resolved_profile.json
python3 <KATEDRA_SKILL>/scripts/primjerci.py upisi rad.docx --vrsta diplomski \
    --izvor "repozitorij <ustanova>, odsjek <X>, obranjen 2025."
python3 <KATEDRA_SKILL>/scripts/primjerci.py popis
```

Mjeri se: margine, font i veličina tijela, prored, poravnanje, veličina i podebljanost
naslova prve i druge razine, numeracija pododjeljaka, redoslijed naslova prve razine,
primjeri citata u tekstu, oblik jedinice u popisu, uvlaka i završna točka u popisu, opseg.

## Kako se čita razlika

```
≠ font tijela: uzorak Garamond · profil ['Times New Roman', 'Calibri']
≠ veličina pisma: uzorak 11.0 · profil 12
```

**Razlika NIJE kršenje.** Obranjeni rad je opservacija, službene Upute su norma. Kad se
razilaze, obje ostaju zapisane, a gate javlja „odstupa od primjerka X”, nikad „krši
pravilo” za pravilo kojega u Uputama nema.

Tri su moguća zaključka i sva tri su legitimna:

1. **Uzorak je iznimka** — jedan rad koji je prošao unatoč odstupanju. Profil ostaje.
2. **Upute su zastarjele, praksa se pomaknula** — dva ili tri rada koja se međusobno slažu
   jači su dokaz od jednoga. Vrijedi pitati mentora.
3. **Kućni stil ondje nije ustaljen** — radovi se međusobno razilaze. To je samo po sebi
   nalaz i znači da će mentorova riječ biti jača od svega.

**Jedan primjerak nije uzorak.** Alat to izrijekom kaže kad ih je manje od dva.

## Granice

- **Ne skida ništa s interneta.** Rad skida student; alat mjeri datoteku. Repozitorijski
  radovi su javni, ali njihovo automatsko dohvaćanje nije dio ovog lanca.
- Radi nad `.docx`. PDF nosi izgled, ali ne i stilove, pa se iz njega margine i prored
  mjere nepouzdano.
- **Ne upisuje u instalirani skill.** Zapis ide u projektni `.katedra/primjerci.json`, a
  blok za `references/fakulteti/<slug>.json` ispisuje se da ga maintainer doda —
  production runtime ne mutira install direktorij (isto pravilo kao `profile_registry.py`).
- Ne ocjenjuje je li uzorak dobar rad. Mjeri **oblik**, ne kvalitetu.
