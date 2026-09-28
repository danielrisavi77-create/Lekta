# Workflow: mjerenje popravka nad sintetickim setom (radna stanica)

Odluka vlasnika 2026-09-28: "idemo na to s workflowom". Pokrece se na RADNOJ STANICI (closed-loop i teski poslovi ne na laptopu),
nakon mergea PR #211, kroz `node scripts/with-gate-lock.mjs <oznaka> -- <naredba>`.

Ulaz: `Lekta-korpus\04-sintetski\set-2026-09-28\Lekta-sinteticki-set\` (223 para jedinica x vrsta rada: neuredni/ = mutacije,
uskladjeni/ = ciljni oblik, sidecari/ synthetic:true). Kopirati na radnu stanicu izvan repozitorija; nikad u repo ni cloud.
Set NE ulazi u ovjeru razina (sidecarAdmitted ga odbija, README ga zabranjuje za A).

## Faza 1: mjerenje (deterministicki, 0 tokena modela)
    set LEKTA_SYNTHETIC_CORPUS=<put do Lekta-sinteticki-set>
    npx vite-node scripts/corpus-gen/measure.mts -- --dir <put>\neuredni
Izlaz: po dokumentu i po fixeru (aggregateByFixer): rijeseno / preostalo / regresije / promjena vidljivog teksta.
Dodatno: usporedba popravljenog `neuredni` s `uskladjeni` po osima (koje osi popravak ne dovede do ciljnog oblika).
Suhi pokus prvo na 3 para (npr. fpzg--graduate, efzg--final, pmf--doctoral), pa tek onda svih 223.

## Faza 2: trijaza (Sonnet, jedan agent po skupini fixera)
Grupirati nalaze po (fixer, os, uzrok). Za svaku skupinu: je li kvar popravka, kvar generatora mutacija, ili ocekivano
(npr. TOC os nepokrivena jer LibreOffice ne pise polje). Izlaz: popis zadataka s primjerom dokumenta i mjerom prije.

## Faza 3: popravci (Sol implementira, Claude Opus pregledava)
Po zadatku: golden test koji prvo biljezi zateceno ponasanje (src/repair/CLAUDE.md), popravak, dvoprolazna idempotencija,
vidljivi tekst nepromijenjen, mutacija u gate-mutations; zavrsni recept iz memorije (brief-zavrsni-recept-i-suhi-pokus).
Promjena src/repair mijenja otisak koda popravka: prije regeneracije ledgera treba nova potpisana ovjera korpusa (T75),
inace A pada na 0 (F4 u #211).

## Faza 4: ponovno mjerenje
Isto kao Faza 1; napredak = manje preostalih/regresija po fixeru. Rezultat samo kao izvjestaj (nije dokaz razine).

## Uvjeti koordinatora lekta-32 (2026-09-28)
1. Tek nakon mergea #211 i selidbe, na radnoj stanici, kroz with-gate-lock.
2. Set ostaje izvan repoa i izvan ovjere razina; u repo idu SAMO agregirane mjere (brojevi po fixeru), nikad dokumenti.
3. Svaki popravak u src/repair = zaseban mali PR: test vidljivog teksta + Word oracle dokaz (word-proof run), Claude
   pregled (implementira Sol), nova T75 ovjera prije regeneracije ledgera.
4. Granica proizvoda: popravci samo forma, nikad sadrzaj.

## Sto ovo NE radi
Ne dize B ni A izravno: B ovisi o dokazima za pravila (AI audit), A o izvornim DOCX radovima (01-izvor, Kanal A),
A-pdf o javnim PDF radovima, A-katedra o Katedrinim radovima (ceka izmjenu CLAUDE.md).

## Napomena za podatkovni PR (lekta-32, 28. 9., #225 = 4820ddd5)
Svaka nova ovjera mjerena od 28. 9. nosi sourceKind: attest-real-corpus.mjs --source-kind source-docx za pravi korpus. Postojeca potpisana ovjera 33768c3c ostaje valjana. #211 nakon pusha provjeriti protiv mastera s #225 (merge ako CI trazi).
