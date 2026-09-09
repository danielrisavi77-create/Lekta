# LEKTA: koordinacija razvoja kroz Codex i Claude Code

GitHub cuva plan, red zadataka, promjene i dokaze. ChatGPT/Codex i Claude Code citaju isti
repozitorij, ali ne dijele automatski razgovore, prijave ni memoriju. Ova prva verzija je
poluautomatska: lokalna skripta priprema ili pokrece jedan zadatak, a koordinator provjerava
rezultat i azurira red zadataka. Nema pozadinske petlje koja samostalno trosi pozive.

## Uloge

| Uloga | Model | CLI oznaka | Odgovornost |
| --- | --- | --- | --- |
| Koordinator | Astra | `gpt-6-astra` | Prioriteti, brief, audit, pregled Claude implementacije |
| Koordinator | Fable | `fable` | Prioriteti, brief, audit, pregled Sol implementacije |
| Implementator | Opus | `opus` | Dodijeljena implementacija i dokazi |
| Implementator | Sonnet | `sonnet` | Dodijeljena implementacija i dokazi |
| Implementator | Sol | `gpt-5.6-sol` | Dodijeljena implementacija i dokazi |

Jedan aktivni koordinator vodi zadatak. Drugi se ukljucuje kada treba neovisno misljenje,
ne na svaki prompt. Ne postoji dokaz da ce odredeni model uvijek biti bolji za svaku vrstu
zadatka: izbor pratimo prema kvaliteti isporuke, ponovljenom radu, vremenu i stvarnoj potrosnji.
Pregled treba drugi provider: Astra za Opus/Sonnet, Fable za Sol. Za netrivijalne promjene
parsera, citata i DOCX-a ostaje obavezan adversarijalni pregled prema AGENTS.md.

## Pocetak

1. Instaliraj aktualne native Codex i Claude Code CLI alate i prijavi ih na svojem racunalu.
   Provjeri `codex login status` i `claude auth status`. Skripta ne instalira alate niti prenosi prijave.
2. Iz korijena repozitorija pokreni `npm run agents -- doctor` i `npm run agents -- list`.
3. Pripremi prvi audit bez poziva modelu:

```bash
npm run agents -- prepare T00 --phase plan --agent astra
```

Isti audit moze voditi Fable. Iznos ovdje je primjer procijenjenog ogranicenja po pozivu,
nije preporuka troska niti jamstvo iznosa na racunu:

```bash
npm run agents -- prepare T00 --phase plan --agent fable --budget-usd 3
```

Izlaz sadrzi model, argumente i cijeli prompt. `run` bez `--execute` takoder daje samo pripremu.
Stvarni lokalni poziv pokrece se ovako:

```bash
npm run agents -- run T00 --phase plan --agent astra --execute
```

Koordinator pregledava audit, sprema provjerene nalaze u `docs/quality/lekta-plan-status.md`
i azurira `tasks.json`. T00 ne mijenja aplikaciju: utvrduje koji stari nalazi jos vrijede.
Plan je nastao nad ranijim snapshotom i ne treba ponavljati vec isporucene popravke.

## Implementacija i predaja

Prvo dovrsi ovisnosti i oznaci zadatak `ready`. Zatim napravi worktree IZVAN repozitorija,
instaliraj ovisnosti ili povezi postojeci `node_modules` i udji u korijen tog worktreea.
Primjer nakon sto je T01 stvarno spreman:

```bash
git worktree add -b agent/t01 ../Lekta-t01 HEAD
cd ../Lekta-t01
npm ci
npm run agents -- prepare T01 --phase implement --agent opus --budget-usd 5
npm run agents -- run T01 --phase implement --agent opus --budget-usd 5 --execute
```

Za Sonnet promijeni `--agent sonnet`. Za Sol koristi `--agent sol` i izostavi Claude budzet.
Priprema i implementacija citaju upute iz worktreea u kojem se naredba izvodi.
Runner trazi cist worktree na zasebnoj grani prije implementacije. Lokalni Git lock dopusta
samo jedan poziv ovog runnera odjednom preko svih worktreeva. Ne zakljucava GitHub ni druge
racunale: koordinator na zadatku/PR-u biljezi vlasnika, granu i opseg prije pocetka rada.

Rezultat je u `.artifacts/agents/<task>-<vrijeme>-<pid>/`: prompt, stdout, stderr i `result.json`.
Status `needs_verification` znaci samo da je CLI zavrsio uspjesnim strukturiranim rezultatom.
Runner nikad sam ne postavlja `done`, ne commita, ne pusha i ne objavljuje aplikaciju.
Implementator vraca promjene i dokaze, a koordinator izvodi commit nakon svih postojecih
provjera. To je podjela odgovornosti, ne zahtjev da vlasnik odobrava svaki commit.

Za pregled postavi `status: "in_review"` i `implementationAgent: "opus"`, `"sonnet"` ili `"sol"`
u zapisu zadatka. Pregled Opus/Sonnet promjene:

```bash
npm run agents -- run T01 --phase review --agent astra --execute
```

Sol promjenu pregledava Fable, uz lokalno odabran `--budget-usd`. Preglednik cita diff/dokaze
preko dostupnih alata; Claude pregled je ogranicen na citanje datoteka, pa mu koordinator
prethodno sprema `git diff` i provjere u datoteke navedene u zadatku. Nalaze uvijek provjeri.

## Ugovor reda zadataka

`tasks.json` je jedini statusni registar. `development-plan.md` daje opseg i kriterije T00-T15.
Put je `blocked -> ready -> in_progress -> in_review -> done`. Povratak na `ready` znaci
novi pokusaj nakon pregledane i spremljene prethodne promjene, ne slijepi nastavak preko nje.
Runner provjerava strukturu, ovisnosti, uloge i uvjete pokretanja; koordinator rucno potvrduje
prijelaze statusa. Vrijednost `done` sama po sebi nije dokaz da je provjera doista izvedena.

Prije zatvaranja zapisi u zadatak ili povezani PR:

- vlasnika/koordinatora, implementatora, granu, bazni i pregledani SHA;
- stvarno promijenjeni opseg i pokrivene kriterije prihvata;
- naredbe provjera, izlazne kodove i trajno dostupne logove/CI poveznice;
- neovisnog preglednika, nalaze i njihovo razrjesenje;
- rizike i neizvedene provjere, ukljucujuci Word kada je potreban.

Obavezni gateovi iz AGENTS.md ostaju mjerodavni: `npm run check`, `npm run orphan-scan`
i dodatne domenske provjere. Lokalne logove koje treba zadrzati prenesi u PR/CI dokaz;
`.artifacts` se ne commita. Ne lijepi studentske dokumente, tajne ili cijele privatne logove u PR.

## Ogranicenja prve verzije

- Prijava, dostupnost modela i stvarni poziv oba providera moraju se provjeriti na racunalu
  koje ce izvrsavati zadatke. `doctor` provjerava izvrsne alate, ne pristup modelima.
- Fable alias zahtijeva Claude Code >=2.1.255. Aliasi se mogu mijenjati. Runner biljezi
  trazeni model i modele prijavljene u rezultatu kada ih provider vrati; prazna lista znaci
  nepoznato. Provjeri fallback i stvarni model prije prihvacanja rada.
- Claude `-p` moze trositi dodatne usage credits, posebno Fable. Zato zahtijevamo eksplicitan
  budzet. `--max-budget-usd` je procjena CLI-ja. Postavljen API kljuc moze promijeniti izvor naplate.
  Codex ovaj runner ne ogranicava u USD: koristi limite racuna i prati potrosnju.
- Claude ima 20 krugova po pozivu; runner prekida glavni CLI proces nakon 30 minuta ili
  prevelikog izlaza. Prekinuti rad je neuspjeh, a nepotpune promjene ostaju za pregled.
  Na signal ili procesnu gresku runner zadrzava lock, jer podprocesi mogu nastaviti raditi.
  Prije ponovnog rada provjeri jesu li ostali podprocesi. I nakon pada roditeljskog procesa
  lock moze ostati: procitaj PID i provjeri procese prije rucnog uklanjanja locka.
- Nema automatskog nastavka, pokretanja podagenata ni automatskog spajanja grana.
  Claude koristi `dontAsk` i ogranicene alate; blokiranu potrebnu radnju izvrsi kroz svoju
  uobicajenu interaktivnu sesiju. Popis alata nije OS sandbox. Codex koristi svoj sandbox.
- CLI runner koristi native izvrsne datoteke. Ako Windows instalacija izlozi samo `.cmd`
  shim koji Node ne moze izravno pokrenuti, koristi native instalaciju ili pripremljeni
  prompt u interaktivnoj sesiji; runner ne ukljucuje shell radi zaobilazenja tog problema.

## Sluzbeni izvori provjereni 2026-09-08

- [Codex modeli](https://learn.chatgpt.com/docs/models)
- [Codex neinteraktivni rad](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude modeli i Fable](https://code.claude.com/docs/en/model-config)
- [Claude CLI](https://code.claude.com/docs/en/cli-reference)
- [Claude headless](https://code.claude.com/docs/en/headless)
- [Claude autentifikacija](https://code.claude.com/docs/en/authentication)

Lokalni testovi provjeravaju protokol i rukovanje rezultatima. Oni ne dokazuju da su
racuni prijavljeni ili da je stvarni model isporucio kvalitetnu LEKTA promjenu.

## Pretplatnicki nacin i autonomni kontroler (2026-09-09)

`--subscription` je drugi, odvojen nacin naplate runnera: Claude poziv ide bez `--max-budget-usd` (jer
se do naplate ne smije ni doci), Fable je iskljucen (nije u paketu), a postavljen `ANTHROPIC_API_KEY` u
okolini je greska prije pripreme. Rucni `--budget-usd` nacin je nepromijenjen.

```bash
npm run agents -- prepare T02 --phase plan --agent astra --subscription
```

Trajni raspored, red zadataka, politika opsega, dokaz i izdavac zive u `scripts/autonomy/` (Python,
stdlib) i pozivaju ovaj runner samo za pripremu i izvrsenje jednog poziva. Upute: `docs/agents/autonomy-runbook.md`;
polazna tocka: `docs/agents/autonomy-baseline.md`; status zadataka T00 do T15: `docs/quality/lekta-plan-status.md`.
