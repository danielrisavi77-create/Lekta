# Kodiranje bez Fablea: workflow `lekta-no-fable-coding`

Odluka vlasnika 2026-09-12: Fable (glavna sesija Claude Codea) ne kodira. Fable zadatak opise, pokrene workflow i
procita izvjestaj; sve sto dira datoteke, pokrece testove ili pregledava diff rade podagenti na Sonnetu i Opusu, u
vlastitim git worktreejima. Skripta: `.claude/workflows/lekta-no-fable-coding.js` (Workflow alat Claude Codea).

## Zasto ovako

- Fable je najskuplji i najsposobniji model; vrijednost mu je u odluci sto se radi, ne u tipkanju. Isti ugovor vec
  vrijedi za `scripts/agents` (`--subscription` iskljucuje Fable iz naplativog rada).
- Svaki krug ima DRUGI par ociju: implementator (Opus) ne pregledava vlastiti rad; tri protivnicka pregleda (Opus)
  pokusavaju oboriti da je zadatak ispunjen, i to kroz tri razlicite lece (ispravnost, pravila repozitorija, dokaz).
  Vise prolaza istim modelom nije provjera, razlicite lece jesu (CLAUDE.md, "gard bez dokaza da grize ne racuna se").
- Sve se dogadja u izoliranim worktreejima, pa dijeljeno stablo ostaje netaknuto (CLAUDE.md, paralelizam kroz
  izolaciju). Push i PR NISU dio workflowa: to je zaseban korak na rijec vlasnika.

## Faze

| faza | model | sto radi | izlaz |
| --- | --- | --- | --- |
| Izvidjaj | Sonnet (Explore, samo citanje) | sto postoji, koja tvrda pravila pogadjaju zadatak, kriteriji prihvacanja IZVAN diffa, testovi, rizici | brief |
| Dizajn | 2x Sonnet (Plan) + Opus sudac | dva neovisna prijedloga (najmanji diff / cisti modul s gardom), sudac bira i kaze sto presaditi | dizajn |
| Implementacija | Opus, vlastiti worktree | golden ili karakterizacija prije izmjene gdje pravila traze, izmjena, testovi s mutacijom, `tsc`, `orphan-scan`, commit s `--only` | grana, commiti, sto nije dokazano |
| Pregled | 3x Opus, tri lece | pokusaj obaranja; blokator vraca implementatoru (najvise 3 kruga) | nalazi s datotekom, retkom, scenarijem |
| Gate | Sonnet | `npm run orphan-scan` i `VITEST_MAX_THREADS=2 npm run check` u izoliranom stablu; ishod iz retka `Test Files` | redak Test Files, exit, build |

Izvjestaj zavrsava sa `STATUS: spremno za push i PR` ili `STATUS: NIJE ZA PUSH` (preostali blokator ili crven gate).

## Kako se pokrece

Fable u Claude Codeu:

```
Workflow name=lekta-no-fable-coding args={"task": "<opis zadatka>", "files": ["src/..."], "acceptance": ["<kriterij izvan diffa>"], "branch": "wf/<ime>"}
```

`task` je obavezan; `files`, `acceptance` i `branch` su pomoc, ne granica. Rezultat nosi granu i putanju worktreea;
Fable zatim (na rijec vlasnika) pusha granu i otvara PR, bez izmjena koda.

Ponavljanje nakon prekida: `Workflow scriptPath=<put iz rezultata> resumeFromRunId=<runId>`; nepromijenjeni pozivi
agenata se vracaju iz predmemorije.

## Granice koje workflow ne rjesava

- Ne zamjenjuje `npm run check` u CI-ju ni dokaz izdanja; gate u workflowu je ISTI gate, samo pokrenut ranije.
- Stroj ima 8 GB i 4 jezgre: ne pokretati workflow dok se pece dokaz izdanja ili vrti puni UX prolaz (UX razina je
  osjetljiva na opterecenje, CLAUDE.md "stroj je granica").
- Podagenti dobivaju CLAUDE.md automatski; tvrda pravila koja zadatak posebno pogadjaju izvidjaj IMENUJE u briefu, pa
  ih implementator ne mora traziti.
- Sto agent ne moze dokazati testom, pise u `notProven`; Fable to prenosi vlasniku, ne skriva.

## Lean varijanta

Za zadatke koji ne trebaju puni lanac gore postoji `.claude/workflows/lekta-lean.js` (workflow `lekta-lean`), isti
ugovor (Fable ne kodira, izoliran worktree izvan repozitorija, commit iskljucivo `--only`, gate cita redak
`Test Files`, izvjestaj zavrsava STATUS retkom), s manje agenata za manje rizicne zadatke.

Izmjereno na `lekta-no-fable-coding`: 13-14 agenata i 1,6-2,5 M tokena po zadatku, najskuplji dio su dva neovisna
dizajna + sudac (3 agenta) i tri Opusova pregleda po krugu popravka. Ocekivani trosak lean varijante je 3-5x manji
(4-5 agenata u tipicnom modu standard, 2 u modu light), kroz manje agenata i krace promptove: svaki agent dobiva
samo diff, popis dirnutih datoteka i kriterije, ne cijeli CLAUDE.md ni zadatak "istrazi sire".

Tri moda, biraju se preko `args.mode`:

- `light` (2 agenta) - docs, `tasks.json`, config, cist tekst. Implementator (Sonnet) napravi izmjenu i pokrene
  SAMO ciljane provjere (`orphan-scan` plus ciljani `vitest`, ili samo `orphan-scan` za cisti docs diff);
  verifikator (Sonnet, nizak napor) cita iskljucivo diff prema `origin/master` i tvrdi je li opseg unutar
  `args.files` i je li kriterij prihvacanja ispunjen. Bez dizajna, bez punog `npm run check`.
- `standard` (4-5 agenata) - kod i testovi IZVAN parsera, citata, popravka i sigurnosti. Kratak brief (Sonnet, nizak
  napor, najvise 40 redaka), implementator (Opus, visok napor, vlastiti worktree), JEDAN protivnicki pregled (Opus,
  visok napor) kroz jednu kombiniranu lecu i checklistu od 8 tocaka (test vidljivog teksta, gard s mutacijom i
  baselineom, jednoprolaznost dokazana dvama prolazima, CR normalizacija, commit `--only`, bez izmjena kontrolnih
  staza, bez izmisljenih pravila, brojac mehanizma), i gate (Sonnet, nizak napor). Blokator ili major vraca
  implementatoru NAJVISE JEDAN krug popravka, ne tri. `args.design: true` dodaje jednog dizajnera (Sonnet, jedan
  prijedlog, najmanji diff), bez drugog prijedloga i bez suca.
- `full` - lean namjerno NE duplicira 267 redaka `lekta-no-fable-coding.js`: poziv s `mode: 'full'` odmah baca jasnu
  poruku koja upucuje na taj workflow. Za parser, citation, repair, security i supabase kod pokreni njega izravno.

`args.checkScope` bira gate: `full` (puni `npm run check` u pozadini, kao u punom workflowu) kad ijedna staza u
`args.files` pocinje sa `src/`, `scripts/` ili `supabase/`, inace `targeted` (samo `orphan-scan` i ciljani
`vitest run`, bez builda). Moze se zadati i rucno.

Pravilo izbora moda: `light` za docs/status/config, `standard` za kod izvan zasticenih podrucja, `full` (izravno
`lekta-no-fable-coding`) za parser, citation, repair, security i supabase.

Ako bilo koji agent tijekom rada javi poruku o limitu (spend limit, usage limit, rate limit), lean workflow ODMAH
staje i vraca `STATUS: PREKINUTO (limit)`, bez pokretanja daljnjih agenata; nastavak ide preko `resumeFromRunId`
kao i kod ostalih workflowa.

## Prvi zadatak za probu

Otvoren kvar iz memorije sesije: `link-doi-fixer` trazi `xmlns:r` bilo gdje u dokumentu umjesto na korijenu
(`link-doi-fixer.ts`, `ensureRNamespace`), pa uz lokalnu deklaraciju proizvede `document.xml` koji nas vlastiti
parser odbija, dok `integrityFailure` ostaje `null`. Popravak trazi golden test, reprodukciju rucno (generator vise ne
proizvodi lokalnu deklaraciju) i odluku treba li `package-integrity` provjeravati vezanje prefiksa. Tocno vrsta zadatka
za ovaj workflow: zasticen sloj, dokaz prije izmjene, gard s mutacijom.
