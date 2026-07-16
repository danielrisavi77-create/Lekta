# Lekta (ThesisReady)

Klijentska web aplikacija (Vite + TypeScript) koja u pregledniku analizira `.docx`
akademske radove i provjerava oblikovanje, strukturu, opseg i citiranje prema
sluzbenim profilima zagrebackih i drugih visokih ucilista. Sva analiza je lokalna:
dokument se ne salje na posluzitelj, obrada tece u pregledniku (Web Worker).

Osim analize, projekt sadrzi automatski popravak `.docx` datoteka, monetizaciju
(paketi, narudzbe, payment linkovi), GDPR pravne tekstove i ugradenu QA dijagnostiku.

## Stack

- Vite, TypeScript (strict), vitest + happy-dom.
- Bez frameworka i bez backenda u jezgri. Ovo NIJE Next.js projekt i nema veze s
  maturiraj.hr.
- Autorski podaci (profili, izvori, rokovi, katalog, coverage) zive u `data/**`,
  tanki loaderi u `src/**` ih hidriraju i tipiziraju.

## Pokretanje

```bash
npm install
npm run dev        # razvojni server, http://localhost:5173
```

Build i pregled produkcijskog builda:

```bash
npm run build
npm run preview
```

## Build gate (tvrdo pravilo)

Svaka promjena mora proci prije commita:

```bash
npm run check      # tsc --noEmit && vitest run && vite build
```

Ako `check` pada, promjena nije gotova. Testovi se pokrecu i s `npm test` (vitest).

## Struktura i dokumentacija

- `src/**`: aplikacijski kod (UI orkestrator, analiticka jezgra, parser, auditi,
  citation engine, profili, popravak).
- `data/**`: autorski podaci profila i izvora.
- `tests/**`: vitest (registar, regresija, UI smoke, golden harness parsera).
- `docs/**`: detaljna dokumentacija (vizija, roadmap, auditi, launch materijali).

Detaljne razvojne upute i tvrda pravila su u [CLAUDE.md](CLAUDE.md) (kanonski
operativni vodic). Kompaktna pravila za agente koji citaju AGENTS.md standard su u
[AGENTS.md](AGENTS.md).
