# Codex launcher za odabir modela

Launcher bira model samo za novu Codex sesiju. Ne mijenja globalni
`~/.codex/config.toml`, ne cita kljuceve i ne moze promijeniti model vec aktivne
sesije.

Interaktivno pokretanje:

```powershell
npm run codex
```

Izravni odabir:

```powershell
npm run codex -- --mode economy
npm run codex -- --mode balanced
npm run codex -- --mode deep
```

Profili su:

- `economy`: GPT-5.6 Luna uz low reasoning, za jasne i ponovljive zadatke
- `balanced`: GPT-5.6 Terra uz medium reasoning, za svakodnevni razvoj
- `deep`: GPT-5.6 Sol uz high reasoning, za sigurnost, arhitekturu i slozene zadatke

Dodatni argumenti nakon `--` prosljeduju se Codex CLI-ju. Primjer:

```powershell
npm run codex -- --mode balanced -- --cd C:\Users\PC\Desktop\Lekta
```

Za provjeru naredbe bez pokretanja sesije koristi `--dry-run`.
