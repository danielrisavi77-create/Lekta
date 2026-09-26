# LEKTA: koordinacija razvoja kroz Codex, Claude Code i Grok CLI

GitHub cuva plan, red zadataka, promjene i dokaze. ChatGPT/Codex, Claude Code i Grok Build CLI
citaju isti repozitorij, ali ne dijele automatski razgovore, prijave ni memoriju. Kanonski routing,
billing, context i provider-result ugovor je `docs/agents/ORCHESTRATION.md`; ovaj dokument je
operativni runbook. Lokalna skripta priprema ili pokrece jedan zadatak, a koordinator provjerava
rezultat i azurira red zadataka. Nema pozadinske petlje koja samostalno trosi pozive.

Kad vlasnik zalijepi vanjsku analizu ili audit bez daljnjih uputa, vrijedi fiksni protokol iz
`docs/agents/INTAKE.md` i skilla `.claude/skills/intake-analiza/SKILL.md`.

## Uloge

| Uloga | Model | CLI oznaka | Odgovornost |
| --- | --- | --- | --- |
| Koordinator | Astra | `gpt-6-astra` | Prioriteti, brief, audit, pregled Claude implementacije |
| Koordinator | Fable | `fable` | Prioriteti, brief, audit, pregled Sol implementacije |
| Koordinator | Grok | `grok` | Prioriteti, brief, audit, pregled Codex/Claude implementacije |
| Implementator | Opus | `opus` | Dodijeljena implementacija i dokazi |
| Implementator | Sonnet | `sonnet` | Dodijeljena implementacija i dokazi |
| Implementator | Sol | `gpt-5.6-sol` | Dodijeljena implementacija i dokazi |
| Implementator | Build | `build` | Grok Build implementacija i dokazi (`command: grok`) |

Jedan aktivni koordinator vodi zadatak. Drugi se ukljucuje kada treba neovisno misljenje,
ne na svaki prompt. Ne postoji dokaz da ce odredeni model uvijek biti bolji za svaku vrstu
zadatka: izbor pratimo prema kvaliteti isporuke, ponovljenom radu, vremenu i stvarnoj potrosnji.
Pregled treba drugi provider (razlicit CLI `command`): Astra za Opus/Sonnet, Fable za Sol,
Grok za Codex/Claude implementacije, a Codex/Claude za Build. Isti provider (npr. Grok pregleda
Build) runner odbija. Za netrivijalne promjene parsera, citata i DOCX-a ostaje obavezan
adversarijalni pregled prema AGENTS.md.

## Pocetak

1. Instaliraj aktualne native Codex, Claude Code i (po potrebi) Grok Build CLI alate i prijavi ih
   na svojem racunalu. Provjeri `codex login status`, `claude auth status` i `grok login`.
   `XAI_API_KEY` je samo za svjesni rucni/API nacin; subscription/autonomy profil ga namjerno odbija.
   Grok: https://docs.x.ai/build/overview
   (`curl -fsSL https://x.ai/cli/install.sh | bash` ili `npm install -g @xai-official/grok`).
   Runner je verificiran s Grok CLI 1.0.34 i odbija oslanjanje na stariji JSON ugovor;
   `doctor` oznacava instalaciju kao `supported` ili `unsupported; minimum 1.0.34`.
   Skripta ne instalira alate niti prenosi prijave. Zadani model aliasa `grok`/`build` je `grok-4.6` (sluzbena preporuka za kod, 2026-09-20);
   prilagodi u `config/agent-providers.json` ako `grok models` pokaze drugaciji ID (npr. `grok-build-0.1`); Node i Python ucitavaju isti registry.
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

Isti audit preko Grok CLI (nema `--budget-usd`; auth je `grok login` ili `XAI_API_KEY`):

```bash
npm run agents -- prepare T00 --phase plan --agent grok
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
Za Grok Build implementaciju koristi `--agent build` (takoder bez Claude budzeta).
Priprema i implementacija citaju upute iz worktreea u kojem se naredba izvodi.
Runner trazi cist worktree na zasebnoj grani prije implementacije. Lokalni Git lock dopusta
samo jedan poziv ovog runnera odjednom preko svih worktreeva. Ne zakljucava GitHub ni druge
racunale: koordinator na zadatku/PR-u biljezi vlasnika, granu i opseg prije pocetka rada.

Rezultat je u `.artifacts/agents/<task>-<vrijeme>-<pid>/`: prompt, stdout, stderr i `result.json`.
Status `needs_verification` znaci samo da je CLI zavrsio uspjesnim strukturiranim rezultatom.
Runner nikad sam ne postavlja `done`, ne commita, ne pusha i ne objavljuje aplikaciju.
Implementator vraca promjene i dokaze, a koordinator izvodi commit nakon svih postojecih
provjera. To je podjela odgovornosti, ne zahtjev da vlasnik odobrava svaki commit.

Za pregled postavi `status: "in_review"` i `implementationAgent: "opus"`, `"sonnet"`, `"sol"` ili
`"build"` u zapisu zadatka. Pregled Opus/Sonnet promjene:

```bash
npm run agents -- run T01 --phase review --agent astra --execute
```

Sol promjenu pregledava Fable, uz lokalno odabran `--budget-usd`. Build (Grok) promjenu pregledava
Astra ili Fable (drugi provider). Codex/Claude implementaciju moze pregledati Grok:

```bash
npm run agents -- run T01 --phase review --agent grok --execute
```

Preglednik cita diff/dokaze
preko dostupnih alata; Claude pregled je ogranicen na citanje datoteka, pa mu koordinator
prethodno sprema `git diff` i provjere u datoteke navedene u zadatku. Nalaze uvijek provjeri.

## Ugovor reda zadataka

`tasks.json` je jedini statusni registar. `development-plan.md` daje opseg i kriterije T00-T47; T16-T47 su Podplan F,
koji indeksira vendorani program `docs/agents/plan-do-live-2026-09-12.md`.
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

- Prijava, dostupnost modela i stvarni poziv svakog od tri providera moraju se provjeriti na racunalu
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
  Grok koristi `--sandbox workspace` samo za implementaciju, a `--sandbox read-only` za plan i pregled;
  `--always-approve` se dodaje samo implementaciji.
- Ako Grok prijavi `bwrap: Creating new namespace failed: Operation not permitted`, rezultat sadrzi
  dijagnostiku `grok_sandbox_unavailable`. Omoguci Bubblewrap/user namespace podrsku na hostu ili
  pokreni runner na kompatibilnom hostu. Runner namjerno ne prelazi na `--sandbox off`.
- CLI runner nikad ne ukljucuje ljusku. Na Windowsu npm instalira `.cmd` shim, a ne izvrsnu
  datoteku, pa `spawn` bez ljuske na takav shim vraca `ENOENT`. Zato `resolveProviderInvocation`
  u `scripts/agents/cli.mjs` razrjesava providera po mapi `PROVIDER_PACKAGE_ENTRYPOINTS`
  (`grok` -> `@xai-official/grok/bin/grok-bootstrap.js`, `codex` -> `@openai/codex/bin/codex.js`)
  i pokrece paket izravno kroz Node. Isti put koriste i `doctor` i pokretanje posla. Provideri
  koji nisu npm shim, poput Claude Codea, prolaze nepromijenjeno. Kad paket nije pronadjen,
  razrjesavanje je fail-open: naredba ide dalje pod svojim imenom.
  Izmjereno 2026-09-22: prije ovoga je `doctor` javljao `codex: unavailable` iako
  `codex --version` iz terminala daje `codex-cli 0.154.0`; poslije javlja `codex: codex-cli 0.154.0`.

## Sluzbeni izvori provjereni 2026-09-08 (Grok CLI dopuna 2026-09-20)

- [Codex modeli](https://learn.chatgpt.com/docs/models)
- [Codex neinteraktivni rad](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude modeli i Fable](https://code.claude.com/docs/en/model-config)
- [Claude CLI](https://code.claude.com/docs/en/cli-reference)
- [Claude headless](https://code.claude.com/docs/en/headless)
- [Claude autentifikacija](https://code.claude.com/docs/en/authentication)
- [Grok Build overview](https://docs.x.ai/build/overview)
- [Grok CLI reference](https://docs.x.ai/build/cli/reference)
- [Grok headless & scripting](https://docs.x.ai/build/cli/headless-scripting)

Lokalni testovi provjeravaju protokol i rukovanje rezultatima. Oni ne dokazuju da su
racuni prijavljeni ili da je stvarni model isporucio kvalitetnu LEKTA promjenu.

## Pretplatnicki nacin i autonomni kontroler (2026-09-09)

`--subscription` je drugi, odvojen nacin naplate runnera: Claude poziv ide bez `--max-budget-usd` (jer
se do naplate ne smije ni doci), samo je Fable iskljucen jer ga taj profil ne pokriva, a postavljen
`ANTHROPIC_API_KEY` u okolini je greska prije pripreme. Grok radi u pretplatnickom profilu, ali
iskljucivo na SuperGrok pretplatu kroz `grok login`, pa je `XAI_API_KEY` u tom nacinu zabranjen i
obara pripremu, jer bi CLI inace presao na naplatu po pozivu. Rucni `--budget-usd` nacin je
nepromijenjen.

```bash
npm run agents -- prepare T02 --phase plan --agent astra --subscription
```

ZATVORENO 2026-09-23: presudu o ishodu u autonomnom lancu ne donosi `parseResult` iz
`scripts/agents/core.mjs` nego njegovo python zrcalo `parse_provider_output` u
`scripts/autonomy/worker.py`. Zrcalo do tog datuma nije imalo granu za `grok`, pa je zivi Grok uspjeh
(nema polje `type`) zavrsavao u Codex JSONL grani i dobivao verdict pada. Izmjereno izravnim pozivom
te funkcije nad commitanom fixturom `tests/fixtures/agents/grok-success.json`, zateceni ishodi:

| ulaz | verdict zrcala prije popravka |
| --- | --- |
| uspjeh, viseredni JSON (oblik fixture) | `ok=False`, `neispravan ili truncirani JSON` |
| uspjeh, jednoredni JSON | `ok=False`, `codex bez turn.completed ili s greskom` |
| greska uz izlazni kod 1 | `ok=False`, `exit_code=1` |
| kontrola: Claude oblik uspjeha | `ok=True` |

Kontrolni redak pokazuje da je funkcija sama radila, dakle kvar je bio izostanak grane. Posljedica je
bila skupa: svaki USPJESAN Grok posao izgledao je kao pad, pa bi ga kontroler ponavljao do
`maxAttemptsPerTask` na teret pretplatnicke kvote. Zrcalo sada ima granu `_parse_grok_output`, pisanu
doslovno prema `parseResult('grok', ...)`: uspjeh trazi neprazan `text`, `stopReason == "end_turn"`,
`num_turns > 0` i neprazan `modelUsage`, a `reported_models` su kljucevi `modelUsage`. Presuda se mjeri
python testovima u `scripts/autonomy/tests/test_worker_grok.py`, nad istim commitanim fixturama s
kojima radi i JS strana; `tests/agent-workflow.test.ts` uz to strukturno tvrdi da grana postoji, jer se
python testovi ne vrte u `npm run check`.

Uz presudu ide i obrana u dubinu: prefiks `XAI_` je u `SECRET_ENV_PREFIXES`, pa nijedna xAI varijabla ne
ulazi u okolinu djeteta, a `run_phase` posao s naredbom `grok` ili `build` uz postavljen `XAI_API_KEY`
blokira prije pokretanja, isto kao Claude posao uz `ANTHROPIC_API_KEY`.

ZATVORENO u orchestration konsolidaciji: Grok `--output-format json` ne izlaže pouzdan per-tool
brojac, pa `successful_tool_calls` za Grok sada vraca `None` (nepoznato), ne laznu nulu. Time uredan
Grok plan/review ne pada kao `no_tool_use`; karakterizacijski test u
`scripts/autonomy/tests/test_worker_grok.py` grize u oba smjera.

Trajni raspored, red zadataka, politika opsega, dokaz i izdavac zive u `scripts/autonomy/` (Python,
stdlib) i pozivaju ovaj runner samo za pripremu i izvrsenje jednog poziva. Upute: `docs/agents/autonomy-runbook.md`;
polazna tocka: `docs/agents/autonomy-baseline.md`; status zadataka T00 do T47: `docs/quality/lekta-plan-status.md`.


## Orchestration telemetry i context

Provider aliasi/modeli/uloge dolaze iz jednog strojnog registra `config/agent-providers.json`, koji
čitaju i Node runner i Python autonomy sloj. Root `AGENTS.md` je kratka always-on mapa; detaljne
invarijante su u `docs/agents/PROJECT_RULES.md` i čitaju se samo po potrebi.

Svaki stvarni ručni run zapisuje sanitizirani usage redak u `.artifacts/agents/usage.jsonl`.
Autonomy isti normalizirani usage sprema u `run:<phase>` event. Ledger ne sadrži prompt, dokument
ni tajne. Router je deterministički: `providerFallback=wait` ne troši drugi provider, a
`providerFallback=authorized` dopušta samo već odobren provider/model, bez probe poziva.
