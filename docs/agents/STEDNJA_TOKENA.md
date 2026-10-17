# Program stednje tokena

Odluka vlasnika 17. 10. 2026.: "Napravi sve" za programe P1 do P5. Ovaj dokument drzi mjerenje, pravila i
stanje programa. Pravila citanja i compacta unutar jedne sesije su u odjeljku "Stednja konteksta" u root
`CLAUDE.md`; ovdje su pravila izmedju sesija, za koordinatora i za Codex.

## Sto je izmjereno

Mjereno 17. 10. 2026. nad dnevnim izvjestajima `~/Lekta-usage` (3. do 10. 10.) i Codex transkriptima.
Omjeri cijene: ulaz 1, izlaz 5, citanje kesa 0,1, pisanje kesa 1,25, puta costWeight modela.

| Mjera | Vrijednost |
| --- | ---: |
| Udio citanja kesa u stvarnom trosku Claudea | 51 do 74 % |
| Udio pisanja kesa | 14 do 46 % |
| Udio ulaza i izlaza | 2 do 12 % |
| Koliko je stara tezina vidjela | 0,5 do 2,4 % |
| Najveca Codex sesija (13. do 17. 10., gpt-6-luna) | 1,80 milijardi ulaza, 132 compacta |

Zakljucak: trosak ne dolazi od pojedinih rasipnih poziva nego od dugog konteksta koji se cita na svakom
potezu i od hladnih startova koji kes pisu iznova.

## Programi

| Program | Sto | Stanje |
| --- | --- | --- |
| P1 | Istinito mjerilo: dnevni izvjestaj racuna trosak s kesom po sesiji | PR feat/mjerilo-troska-kes |
| P2 | Jeftiniji koordinator | pravila ispod, primjenjuje ih koordinator |
| P3 | Manje hladnih startova | pravila ispod |
| P4 | Codex: kratke sesije, nikad u dijeljenom stablu | pravila ispod; costWeight za Codex modele otvoren |
| P5 | Upozorenje prije citanja cijele velike datoteke | ceka granu wf/stednja-konteksta (dira iste hookove) |

## P2 Koordinator

1. Tick ide na dogadjaj (zavrsen CI, poruka sesije, `notify_when_idle`), ne na mjerac vremena. Rezervni
   tick najrjede svakih 30 minuta, i to samo dok nesto stvarno ceka.
2. Tick cita samo `scratchpad/STANJE.md` i jedan `gh` upit s `--jq`. Tijela PR-ova, logovi i cijeli vodici
   ne ulaze u kontekst koordinatora.
3. Koordinator radi na Opusu (costWeight 2), ne na Fableu (5).
4. Svaki dan nova koordinatorska sesija s predajom kroz `STANJE.md`, umjesto nastavka konteksta koji
   raste danima. Ime nove sesije upisuje se u `docs/agents/README.md` istim danom.
5. Pregled tudjeg PR-a cita samo deltu ciljanih datoteka, ne cijeli PR ni cijele datoteke.

## P3 Hladni startovi

Pisanje kesa nastaje kad god krene novi kontekst: nova sesija, podagent, workflow, compact ili kes istekne.

1. Jedna sesija po zadatku, do spajanja. Nakon spajanja sesija se zatvara; sljedeci zadatak ide u novu
   sesiju s kratkim briefom, ne u nastavak starog konteksta.
2. Podagent ili workflow samo kad posao jedna sesija ne moze sama ili kad treba neovisan pogled (pregled).
   Pretraga koju rijese dva `grep` poziva ne ide u podagenta.
3. Pauza unutar zadatka kraca od sat vremena ne gubi kes; dulje cekanje zavrsava zadatak ili sesiju.
4. Nove sesije se ne otvaraju "za svaki slucaj"; granice broja sesija u `ROUTING.md` vrijede i ovdje.

## P4 Codex

1. Jedan Codex `/goal` ili zadatak po sesiji, najdulje jedan radni dan. Za novi cilj nova sesija s briefom.
   Sesija s vise od 20 compacta je znak da je cilj preopsezan i dijeli se.
2. Codex nikad ne radi u dijeljenom stablu `Desktop\Lekta`; samo u vlastitom worktreeu (pravilo izolacije
   iz root `CLAUDE.md`). Izmjerena najveca sesija radila je upravo tamo.
3. Pregled drugog providera ostaje po pravilu rundi po stazi (zasticene staze najvise 2 runde, ostalo 1,
   docs bez pregleda). Codexov automatski pregled se ne pali za svaki PR.
4. Codex modeli (gpt-6-luna, codex-auto-review) jos nemaju costWeight u `config/agent-routing.json`;
   tezina se ne pogadja, unosi je vlasnik iz cjenika plana.

## Kako se mjeri usteda

Usteda se tvrdi samo iz troska s kesom (P1), po sesiji i po danu, usporedbom tjedna prije i poslije.
Zbroj ulaza, broj poziva ili osjecaj brzine nisu dokaz.
