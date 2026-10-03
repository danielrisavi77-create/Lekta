# Dnevni izvjestaj potrosnje tokena (T82)

`npm run agents:usage-daily` pise izvjestaj za JUCERASNJI lokalni dan u
`%USERPROFILE%\Lekta-usage\YYYY-MM-DD.md`; `--json` ispisuje isti sazetak na standardni izlaz.
Opcije: `--day YYYY-MM-DD`, `--repo <korijen klona>`, `--out-dir <mapa>`, `--weekly`.

## Sto cita

| Provider | Izvor | Napomena |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` | rekurzivno, pa i podagenti; isti odgovor se broji jednom po `message.id` + `requestId` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | `token_count` je kumulativan, pa se zbrajaju razlike; `input_tokens` ukljucuje kes, pa se kes oduzima |
| Grok | `.artifacts/agents/usage.jsonl` (samo `provider: grok`) | lokalni Grok CLI ne pise potrosnju |

Datoteke se samo citaju. Datoteka mijenjana prije najranijeg potrebnog dana (8 dana unatrag) se
preskace. Osteceni JSON redak se preskace i broji u dnu izvjestaja.

## Sto pise

- tablica po provideru i modelu: ulaz, izlaz, citanje i pisanje kesa, tezina;
- top 5 sesija po tezini, udio kesa, usporedba s prosjekom prethodnih 7 dana;
- anomalije: sesija s vise od 3x prosjecne tezine, provider aktivan u zadnjih 7 dana bez
  ijednog zapisa danas, model bez `costWeight`;
- ponedjeljkom (izvjestaj za nedjelju) ili uz `--weekly` odjeljak "Prijedlozi optimizacije"
  izveden iz brojeva.

Tezina je `costWeight` iz `config/agent-routing.json` pomnozen sa zbrojem ulaza i izlaza, kao u
`agents:usage-report`; citanje kesa ne dize tezinu. Model bez tezine dobiva `n/a`.

## Privatnost

Izvjestaj nikad ne sadrzi tekst poruka. Sesija je oznacena prvih 8 znakova ID-a i imenom mape u
kojoj je sesija pocela, bez ostatka putanje. Izvjestaj ostaje lokalno i ne ide u repozitorij:
repozitorij je javan, a izvjestaj otkriva potrosnju, modele i nazive projekata.

## Scheduled Task

Na svakom stroju jednom, kao obican korisnik:

```
powershell -ExecutionPolicy Bypass -File scripts\agents\register-usage-daily-task.ps1
```

Zadatak `Lekta usage daily` se pokrece pri prijavi i svaki dan u 07:55, samo dok je korisnik
prijavljen, bez najvisih prava. Skripta ga odmah jednom pokrene i ispise
`Get-ScheduledTaskInfo` (`LastRunTime`, `LastTaskResult` 0 znaci uspjeh). Na laptopu ga
registrira lekta-9b ili vlasnik po istoj uputi.
