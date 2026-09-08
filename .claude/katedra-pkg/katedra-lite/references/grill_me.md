# GRILL-ME — sokratski stress-test plana (v1.1, opcionalno)

> Preuzeto po uzoru na "grill-me" obrazac iz zajednice Claude Skills
> (Socratic stress-test plana prije izvršenja). U Katedri je ovo advisory
> korak, ne machine gate: PLAN GATE (B14) ostaje jedini blokirajući preduvjet
> za `plan_state.py odobri`. Grill-me se preporučuje, ali ga plan_gate.py
> ne provjerava i ne smije provjeravati u v1 — dodavanje novog blocking
> uvjeta u certificirani gate contract je namjerno izvan opsega ove nadogradnje.

## Zašto

Mentor ili komisija će na obrani postaviti teško pitanje. Jeftinije je da si
ga student postavi sam, pisano, prije nego što napiše ijedno poglavlje —
tada se odgovor još može ugraditi u strukturu, umjesto da se improvizira
na obrani.

## Kad koristiti

Preporučeno nakon što je teza upisana u `plan.json` (`plan_state.py init
--teza ...`), a prije `plan_state.py odobri`. Za seminarski/esej dovoljno je
jedno-dva pitanja iz kategorije teza; za diplomski se preporučuje sve
kategorije, uključujući `obrana`.

```bash
python3 <KATEDRA_SKILL>/scripts/grill_me.py pitanja --tip diplomski
python3 <KATEDRA_SKILL>/scripts/grill_me.py zabiljezi \
  --pitanje "Koji je najjači protuargument tvojoj tezi?" \
  --odgovor "..." --kategorija teza
python3 <KATEDRA_SKILL>/scripts/grill_me.py status
```

Odgovori idu u `.katedra/plan_stress_test.json`. Mod 5 (obrana) može ih
ponovno pročitati kao gotov materijal za pripremu Q&A — pitanja na koja je
student već jednom odgovorio rijetko iznenade drugi put.

## Kategorije pitanja

- **teza** — je li tvrdnja uopće osporiva; koji protuargument rad nadglasava.
- **metodologija** — zašto ova metoda, koje je njeno ograničenje.
- **dokazi** — koja tvrdnja ima najslabiju izvornu potporu.
- **struktura** — koje bi se poglavlje moglo izbaciti bez sloma argumenta.
- **doprinos** — što je stvarno novo, a što sažetak tuđeg rada.
- **obrana** — koje pitanje najviše dovodi u nezgodnu poziciju.

## Ograničenja

Ovo je fiksna banka pitanja, ne LLM-generirani protivnik prilagođen temi.
Kvaliteta odgovora ovisi o tome koliko ih je Katedra (orkestrator) stvarno
iskoristila da preispita plan, a ne samo mehanički odgovorila. Ako se
odgovori pokažu slabi, to je signal da se plan vrati na sekciju 3/5
(`references/plan.md`), ne da se grill-me preskoči.
