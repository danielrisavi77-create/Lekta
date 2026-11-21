# Program stednje tokena

Odluka vlasnika 17. 10. 2026.: "Napravi sve" za programe P1 do P5. Ovaj dokument drzi mjerenje, pravila i
stanje programa izmedju sesija, za koordinatora i za Codex. Pravila citanja i compacta unutar jedne sesije
dolaze odjeljkom "Stednja konteksta" u root `CLAUDE.md` iz grane `wf/stednja-konteksta`; dok ta grana nije
spojena, odjeljak jos ne postoji u masteru.

## Sto je izmjereno

Mjereno 17. i 18. 10. 2026. nad Claude transkriptima i dnevnim izvjestajima `~/Lekta-usage`. Trosak je
PROCJENA po Anthropic API cjeniku po modelu (ulaz, izlaz, citanje kesa, pisanje kesa od 5 min i od 1 h).
Lekta radi na pretplatama (`config/agent-providers.json`), pa to nije racun nego usporediva mjera potrosnje
kvote. Codex i Grok nemaju cijenu u mjerilu i nisu u zbroju.

| Mjera, 4. 10. 2026. | Vrijednost |
| --- | ---: |
| Procjena troska Claudea po API cjeniku | 949 USD |
| Udio pisanja kesa | 63 % |
| Udio citanja kesa | 33 % |
| Najskuplja sesija (dizajn, 17a250b9) | 451 USD, od toga 77 % pisanje kesa |
| Najveca Codex sesija (13. do 17. 10., gpt-6-luna) | 1,80 milijardi ulaza, 132 compacta |

Stara tezina (costWeight x (ulaz + izlaz)) kes nije vidjela uopce. Zakljucak: trosak ne dolazi od
pojedinih rasipnih poziva nego od hladnih startova koji kes pisu iznova i od dugog konteksta koji se cita
na svakom potezu.

## Programi

| Program | Sto | Stanje |
| --- | --- | --- |
| P1 | Mjerilo: dnevni izvjestaj racuna trosak s kesom po sesiji i modelu | PR #376; mjerilo postoji tek nakon spajanja |
| P2 | Jeftiniji koordinator | pravila ispod |
| P3 | Manje hladnih startova | pravila ispod; najveci izmjereni dio troska |
| P4 | Codex: kratke sesije, nikad u dijeljenom stablu | pravila ispod; cijena za Codex modele otvorena |
| P5 | Odbijanje citanja cijele velike datoteke | PR #378; aktivno tek kad vlasnik upise hook u postavke |

## P2 Koordinator

1. Tick ide na dogadjaj (zavrsen CI, poruka sesije, `notify_when_idle`), ne na mjerac vremena. Rezervni
   tick planira se ispod sat vremena, jer kes istjece nakon sata i sljedeci tick ga pise iznova.
2. Tick cita datoteku predaje i jedan `gh` upit s `--jq`. Tijela PR-ova, logovi i cijeli vodici ne ulaze u
   kontekst koordinatora. Datoteka predaje je izvan repoa na fiksnoj putanji
   `%USERPROFILE%\.claude\lekta-tools\KOORDINATOR_STANJE.md`, najvise 30 redaka (aktivni zadaci, PR-ovi,
   ceka se, odluke vlasnika tog dana); koordinator je osvjezava nakon svake promjene stanja. Scratchpad
   sesije nije predaja, jer nova sesija dobiva novi scratchpad.
3. Model koordinatora odredjuje ugovor uloga (`docs/agents/ORCHESTRATION.md`: Fable, Astra ili Grok). Fable
   je najskuplji Claude model; prelazak na jeftiniji model je vlasnikova odluka uz izmjenu tog ugovora i
   `config/agent-providers.json` u istom PR-u.
4. Svaki dan nova koordinatorska sesija s predajom kroz datoteku iz tocke 2, umjesto nastavka konteksta koji
   raste danima. Ime nove sesije upisuje se u `docs/agents/README.md` istim danom.
5. Pregled tudjeg PR-a prvo vidi popis svih promijenjenih datoteka (`gh pr diff --name-only`), da promjena
   izvan opsega ili zasticena staza ne promakne; detaljno cita samo deltu ciljanih datoteka.

## P3 Hladni startovi

Pisanje kesa nastaje kad god krene novi kontekst: nova sesija, podagent, workflow, compact ili kes istekne.
Izmjereno je najveci dio troska.

1. Jedna sesija po zadatku, do spajanja. Cekanje na CI, pregled ili koordinatora ne zavrsava zadatak; sesija
   tada miruje bez novih poziva. Nakon spajanja sesija se zatvara, a sljedeci zadatak ide u novu sesiju s
   kratkim briefom, ne u nastavak starog konteksta.
2. Podagent ili workflow samo kad posao jedna sesija ne moze sama ili kad treba neovisan pogled (pregled).
   Pretraga koju rijese dva `grep` poziva ne ide u podagenta.
3. Nove sesije se ne otvaraju "za svaki slucaj"; granice broja sesija u `ROUTING.md` vrijede i ovdje.

## P4 Codex

1. Jedan Codex `/goal` ili zadatak po sesiji, najdulje jedan radni dan. Za novi cilj nova sesija s briefom.
   Sesija s vise od 20 compacta je znak da je cilj preopsezan i dijeli se.
2. Codex nikad ne radi u dijeljenom stablu `Desktop\Lekta`; samo u vlastitom worktreeu (pravilo izolacije
   iz root `CLAUDE.md`). Izmjerena najveca sesija radila je upravo tamo.
3. Pregled drugog providera ostaje po pravilu rundi po stazi iz skilla `lekta-protokol` (odluka vlasnika
   4. 10. 2026.): zasticene staze najvise 2 runde, UI, docs, testni pomagaci i CI skripte 1 runda, docs bez
   Codexa. Codexov automatski pregled na GitHubu otvara niti koje moraju biti razrijesene prije spajanja, pa
   se svaka nit obradi i razrijesi s odgovorom.
4. Codex modeli (gpt-6-luna, gpt-6-sol, gpt-6.1-sol) nemaju cijenu u mjerilu; ne pogadja se, unosi je vlasnik
   iz cjenika plana.

## Kako se mjeri usteda

Usteda se tvrdi samo iz troska s kesom iz mjerila P1, po sesiji i po danu, usporedbom tjedna prije i
poslije, uz napomenu da je to procjena po API cjeniku. Zbroj ulaza, broj poziva ili osjecaj brzine nisu
dokaz.
