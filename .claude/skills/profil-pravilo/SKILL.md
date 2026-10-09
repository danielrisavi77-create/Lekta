---
name: profil-pravilo
description: Okida se kad zadatak dodaje, ispravlja, degradira ili provjerava pravilo fakultetskog profila (ruleEntries, bodovana vrijednost, opseg vrste rada, Upisnik, raskorak vrijednosti). Redoslijed koraka; pravila su u data/profiles/CLAUDE.md.
---

# Zadatak nad pravilom profila

Pravila (izvor istine, sto smije bodovati, tko smije upisati `verified`) su u
`data/profiles/CLAUDE.md` i `docs/decisions/SOURCE_OF_TRUTH.md`. Ovaj skill daje redoslijed, jer
se ista vrsta zadatka ponavlja (T76 i drugi zadaci Upisnika).

## 1. Opseg

- Koji profili (`data/profiles/<fakultet>/drafts/*.json`), koje provjere (`check.id`) i koja vrsta
  rada. Zapisi popis prije izmjene; on je nazivnik mjerenja na kraju.
- Zateceno stanje: sto profil danas boduje i iz kojeg izvora (`ruleEntries`, ne `rules`).

## 2. Dokaz za svaku vrijednost

- Otvori snimku izvora iz registra i nadji doslovan citat. Citat mora biti podniz jednog odlomka.
- Provjeri opseg: imenuje li izvor tu vrstu rada i taj program. Ako ne, vrijednost se degradira ili
  ostaje `identity-evidence-needed`; ne prosiruj opseg zakljucivanjem.
- `sourcePage` upisi samo kad je potvrden; inace `null`.
- Proturjecje dvaju izvora ne rjesavas sam: oba citata idu vlasniku.

## 3. Izmjena

- Radi u vlastitom worktreeu. Mijenjaj samo `ruleEntries` dodijeljenih profila.
- `status: "verified"`, `scored: true` i `verifiedBy` ne upisujes; to radi covjek.
- Ako se mijenja bodovana vrijednost, raskorak ide kroz `npm run scored-value-drift`, ne rucno.

## 4. Provjere

```
npm run verify:claims
npm run verify:source-hashes
```

Zatim regeneriraj samo pogodjene projekcije, dva prolaza (drugi no-op), i ciljani testovi za
profile kroz `node scripts/with-gate-lock.mjs`. Prije commita puni `npm run check` i `npm run orphan-scan`.

## 5. Izvjestaj

- Po profilu: stara vrijednost, nova vrijednost ili degradacija, citat, snimka i opseg.
- Koliko je jedinica izmjereno prije i poslije (manji nazivnik znaci djelomican pad, ne popravak).
- Sto ceka vlasnika: proturjecja, `verified` potpisi, OCR potvrde.
- Pregled drugog providera je obvezan (zasticena staza).
