# Usporedba Codex modela gpt-6-sol i gpt-6.1-sol na zasticenoj delti

Datum odluke: 3. 10. 2026 (vlasnik).

## Dokaz

Isti prompt runde 2 na PR #217, nad deltom `f466d454..0bad3c82`, pokrenut dvama modelima.

| Model | Broj nalaza | Dokaz | Trajanje | Promaseno | Uvjet CLI |
| --- | --- | --- | --- | --- | --- |
| gpt-6-sol | 7 (5 major, 2 minor) | citanjem koda | ispod 10 min | nije utvrdjeno | bez posebnog uvjeta |
| gpt-6.1-sol | 3 (E3, E2, M3) | svaki nalaz reproduciran probeom (PGlite 0.5.8, stvarni moduli) | 1377 s | M2b (nedostatak provjere `is_anonymous`) | Codex CLI 0.160.0 ili noviji |

Nalazi modela gpt-6.1-sol:

- E3: ekvivalenti, prolazna greska trajno zatvara nagradu.
- E2: oporavak duplikata prepisuje `converted_order_id`.
- M3: CHECK literali umjesto definicije.

gpt-6.1-sol NIJE digao nedostatak provjere `is_anonymous` (M2b), koji je potvrdjen drugdje kao P-02.

Codex CLI 0.156.1 odbija model gpt-6.1-sol porukom 'not supported when using Codex with a ChatGPT
account'. Koordinator je 3. 10. nadogradio laptop na 0.160.0.

Zakljucak: manje suma i tvrdi dokaz, uzi obuhvat.

## Odluka

- Pregled delte koja dira ijednu stazu iz `protectedPaths` (`config/agent-routing.json`: `src/repair`,
  `src/citations`, `src/docx`, `supabase`, security) ide modelom `gpt-6.1-sol`.
- Svi ostali PR-ovi i dalje idu modelom `gpt-6-sol`.
- Prije pregleda zasticene delte `codex --version` mora biti 0.160.0 ili vise; inace stani i
  nadogradi (`npm install -g @openai/codex@latest`).
- `config/agent-routing.json` i `config/agent-providers.json` se ne mijenjaju; pravilo zivi u
  `.claude/skills/codex-review/SKILL.md` (odjeljak 3) i `docs/agents/ROUTING.md`.

## Nije dokazano

- Jedno mjerenje na jednom PR-u i jednoj delti, ne prosjek; razlika u broju nalaza i trajanju nije
  statisticki utemeljena.
- M2b (nedostatak provjere `is_anonymous`) je promasen: gpt-6.1-sol ima uzi obuhvat, pa ne zamjenjuje
  drugi pregled ni deterministicke gateove.
- Nije mjereno na nezasticenim PR-ovima; za njih `gpt-6-sol` ostaje zadan bez usporedbe.
