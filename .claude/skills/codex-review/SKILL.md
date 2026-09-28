---
name: codex-review
description: Pregled PR-a drugim CLI providerom (Codex za Claudeov kod, Opus za Solov). Okida se kad PR treba adversarijalni review delte prije spajanja.
---

# Review drugim providerom

Pregled mora doci od drugog CLI providera od implementatora: Codex pregledava Claudeov kod, Opus
pregledava Solov. Nalazi su savjetodavni; svaki se potvrdjuje ili opovrgava dokazom (test, izlaz
naredbe, redak koda) prije akcije. Modelski rezultat nije dokaz prolaza.

## 1. Izolirani worktree

```bash
git fetch origin <grana>
git worktree add --detach C:\Users\PC\lekta-wt\prN origin/<grana>
```

Nikad u zajednickom stablu. Worktree je samo za citanje.

## 2. Prompt datoteka

Prompt ide u datoteku, ne u naredbeni redak. Obvezno sadrzi:

- opseg: "samo delta `<base>..HEAD`", gdje je `<base>` merge-base s masterom ili zadnji
  pregledani commit;
- sto PR tvrdi da radi i sto navodi pod "Nije dokazano";
- trazeni oblik nalaza: datoteka, redak, scenarij pada, tezina.

## 3. Pokretanje

```bash
codex exec --sandbox read-only -C <wt> -m gpt-6-sol -o <izlaz.md> "$(cat <prompt>)" < /dev/null
```

`--sandbox read-only` je obvezan; `< /dev/null` sprjecava da proces ceka na ulaz.

## 4. Objava

Prije objave iz izlaza ukloni lokalne putanje (korisnicki direktoriji, putanje worktreea). Repo je
javan.

```bash
gh pr review N --comment --body-file <izlaz.md>
```

## 5. Rundi po delti

Svaka runda pregledava samo novu deltu od prethodne runde. Implementator na svaki nalaz odgovara
potvrdom s popravkom ili opovrgavanjem s dokazom. Nova runda se pokrece tek na novom pushu.
