---
name: ci-crveno
description: Okida se kad je CI crven na PR-u ili masteru, kad se sumnja na flake, ili kad master-ci javi CRVENO ili NE ZNAM. Postupak trijaze koji razlikuje kvar PR-a, kvar mastera, okolinu i nestabilan test.
---

# CI je crven

"Flake" nije uzrok. Svaki crveni job zavrsava popravkom, dokazom da kvar nije ovog PR-a, ili
jednim jasnim izvjestajem sto blokira.

## 1. Cije je crveno

1. `npm run master-ci`: zeleno, CRVENO s brojem uzastopnih padova, ili NE ZNAM. NE ZNAM nije zeleno.
2. Je li isti job crven i na masteru? Ako jest, kvar nije ovog PR-a: postoji li vec popravak (PR,
   revert)? Ako postoji, prenesi ga u ovaj PR. Inace jedan komentar s imenom joba i razlogom.
3. Je li PR iza mastera? Prvo spoji master u granu (merge, ne rebase tudje grane), pa novi CI
   (`lekta-protokol`, stavka 16).
4. Pada li job prije ijednog testa (checkout, instalacija, gubitak runnera)? To je okolina.

## 2. Procitaj pravi log

- Log joba, ne sazetak. Trazi prvi pad, ne zadnji.
- Vitest: redak `Test Files` i ime datoteke s padom. Zeleni izlazni kod bez retka `Test Files`
  nije dokaz.
- Playwright: trace i screenshot iz artefakta; lokator, timeout, broj pokusaja (attempt 1 i 2).
- Usporedi Node 20 i Node 24 granu matrice: API iz novijeg Nodea je cest uzrok.

## 3. Ponovno pokretanje

Najvise jednom ukupno, i samo kad: (a) job je pao prije ijednog testa, (b) isti commit je vec
prosao, ili (c) potvrdjujes da kvar nije ovog PR-a. Drugi pad je stvaran. Nikad prazan commit,
zatvaranje i ponovno otvaranje PR-a ni preskakanje, gasenje ili karantena testa.

## 4. Popravak nestabilnog testa

- Reproduciraj lokalno ciljano: `node scripts/with-gate-lock.mjs ciljano -- npx vitest run <datoteka>`,
  po potrebi vise puta i pod opterecenjem.
- Uzrok je obicno vrijeme (timeout ispod stvarnog trajanja pod opterecenjem), redoslijed, dijeljeno
  stanje, CRLF ili mreza. Popravi uzrok; dulji timeout samo uz izmjereno trajanje.
- Za Playwright stabiliziraj metu prije geste (vidljivost, animacija), ne `waitForTimeout`.
- Zapisi u zadatak (T70, T88 i slicni) mehanizam i dokaz, ne samo "prolazi".

## 5. Izvjestaj

Ime joba, link na run, prvi pad doslovno, presuda (ovaj PR, master, okolina, nestabilno) i sto je
napravljeno. Ako nista nije moglo biti napravljeno, sto tocno treba od vlasnika.
