# Lekta

Web aplikacija (Vite + TypeScript) koja analizira `.docx` akademske radove i provjerava
oblikovanje, strukturu, opseg i citiranje prema sluzbenim profilima hrvatskih visokih
ucilista.

## Sto je lokalno, a sto nije

Ovo je jedina tvrdnja koju je vazno procitati tocno, jer se na nju oslanja i copy prema
korisniku (audit UX-05, UX-06).

**ANALIZA je 100% lokalna.** Besplatna provjera oblikovanja tece u pregledniku (Web Worker);
dokument pritom ne napusta uredaj i ne salje se nigdje.

**Ostatak proizvoda NIJE bez backenda.** Na zivi Supabase backend idu:

| Sto | Kamo | Sto se salje |
|---|---|---|
| Placeni automatski popravak | Edge `repair-docx` | cijeli `.docx` |
| Provjera izvora | Edge `source-check` | popis referenci |
| Prijava, narudzbe, naplata | Supabase Auth + Edge `create-checkout`, `webhook-mor` | identitet, privola |
| Rokovi i podsjetnici | Edge `send-reminders` (pg_cron) | e-mail, rok |
| Analitika i waitlist | Edge `analytics-event`, `faculty-request` | dogadjaji, hash IP-a |

Do 2026-08-17 je ovaj README tvrdio "bez backenda" i "dokument se ne salje na posluzitelj"
bez ogranicenja opsega, sto za popravak i naplatu nije bilo tocno.

## Tvrdo pravilo

Lekta mjeri i deterministicki popravlja FORMU. Nikad ne pise, ne prepravlja i ne ocjenjuje
recenice ni argumentaciju, ni preko modela ni na koji drugi nacin. Popravak nema model ni
prompt. Vidi `CLAUDE.md`, odjeljak "Tvrdo pravilo".

## Stack

- Vite, TypeScript (strict), vitest + happy-dom. Bez frontend frameworka.
- Backend: Supabase (Postgres + RLS, Auth, Edge funkcije u Denu), `supabase/**`.
- Ovo NIJE Next.js projekt i nema veze s maturiraj.hr.
- Autorski podaci (profili, izvori, rokovi, katalog, coverage) zive u `data/**`,
  tanki loaderi u `src/**` ih hidriraju i tipiziraju.

## Konfiguracija

Kopiraj `.env.example` u `.env` i popuni. BEZ `VITE_LEKTA_SUPABASE_URL` i
`VITE_LEKTA_SUPABASE_ANON_KEY` aplikacija se spaja na PRODUKCIJSKI Supabase, pa `npm run dev`
cita i pise zivu bazu (audit A26-07).

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
