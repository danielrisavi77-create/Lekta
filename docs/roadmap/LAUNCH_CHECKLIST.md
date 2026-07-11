# LAUNCH_CHECKLIST.md · Co-pilot arc (Faze 1-4)

Zavrsni pregled co-pilot luka i sto treba za launch. Odvaja ono sto je CODE-DONE (izgradjeno,
testirano, committano, gate zelen) od onoga sto je OWNER-GATED (tvoje odluke, tajne, pravno,
poslovno). Za siri produkcijski gate (P0-01..07, kartice, sigurnost) vidi
[docs/audit/LAUNCH_BLOCKERS.md](../audit/LAUNCH_BLOCKERS.md) i
[docs/roadmap/PRODUCTION_BACKLOG.md](PRODUCTION_BACKLOG.md); ovaj dokument pokriva co-pilot dodatke.

Strategija i odluke: [CO_PILOT_STRATEGY.md](CO_PILOT_STRATEGY.md). Pravilo pisanja: hrvatski, bez
em i en crtica.

## 1. Stanje luka (sve code-doable je gotovo i zeleno)

| Faza | Sadrzaj | Status | Commit |
|---|---|---|---|
| 1 | Thesis Pass SKU + strategija/dizajn + VISION carve-out | CODE-DONE | 54c28db |
| 2 | Napredak spremnosti kroz revizije (lokalno) | CODE-DONE | 54c28db |
| 3 | Registar i jasnoca (ne-generativne zastavice, informativno) | CODE-DONE | 54c28db |
| 4a | Integritet: privola + klijent + schema (inertno) | CODE-DONE | aae711c |
| 4b | integrity-check Edge skeleton (cross-lingual + AI) | CODE-DONE | f808dfc |

`npm run check` zelen na svakom koraku (zadnje: 1243 testa). Golden nepromijenjen.

## 2. Owner-gated za launch (grupirano)

### A. Supabase projekt + tajne (zajednicko cijeloj monetizaciji)
- [ ] Supabase projekt zivi (auth email OTP, RLS). Auth je vec ozicen inertno; treba
      `supabaseUrl` + `anonKey` u produkcijskoj konfiguraciji.
- [ ] Lemon Squeezy (MoR) postavljen; `products.mor_product_id` mapiran po SKU-u; `create-checkout`
      i `webhook-mor` Edge deploy + tajne. Tek to gasi "free daje sve".
- [ ] Rokovi (Faza rokova): Resend tajne + Supabase OTP email template + potvrdjeni rokovi u
      `academic-deadlines.json` (trenutno prazan, bez izmisljanja).

### B. Migracije za primijeniti (owner primjenjuje)
- [ ] `0017_thesis_pass.sql` (Thesis Pass SKU; cijene su prijedlog, mijenjaju se preko
      `set_product_price` bez deploya).
- [ ] `0018_integrity.sql` (pgvector + integrity_checks + RLS + 7d purge).
- [ ] pg_cron jobovi za purge (send-reminders, purge_integrity_text) rucno u SQL editoru nakon
      deploya (obrazac u migracijama, treba PROJECT_REF + tajne).

### C. Integritet: provideri i korpus (Faza 4 live)
- [ ] Odabir konkretnog hostanog embedding modela -> fiksira vector(N) dimenziju.
- [ ] `integrity_corpus` tablica + `match_integrity_corpus` RPC (nova migracija kad je dimenzija
      poznata) + sourcing korpusa (visejezicni izvori; pravni pregled izvora).
- [ ] Edge env tajne: `EMBEDDING_API_URL`/`_KEY`, `AI_DETECTOR_API_URL`/`_KEY`, opcionalno
      `INTEGRITY_TEASER_DAILY_CAP`. Bez njih su seam-ovi inertni ({available:false}).
- [ ] Deploy `integrity-check` Edge Function; ozici endpoint u klijentu.

### D. Pravno / GDPR (blokira cloud, rizik broj 1)
- [ ] Precizirati privacy copy: "lokalna analiza formata" naspram "opcionalna cloud provjera uz
      privolu" (produkcijski audit je uhvatio drift "nista se ne salje" dok auth/waitlist salju).
- [ ] DPA / privatnost: hostani embedding i AI-detektor su TRECI procesori (tekst im ide); uvrstiti
      u uvjete i evidenciju obrade.
- [ ] Uvjeti: retencija (7 dana za sirovi tekst pa brisanje), "ne koristimo za treniranje",
      dobrovoljnost privole. Tekst privole je u `integrity-consent.ts`, uskladiti s uvjetima.

### E. UI wiring (svjesno odgodjeno zbog git-race na app.ts)
- [ ] Ekran privole (IntegrityConsent) + gumb "Provjeri izvornost" u rezultatu; poziva
      `runIntegrityCheck`. Prikaz teaser (ograniceno) naspram full (iza Passa).
- [ ] Copy: teaser uokviriti kao besplatnu kuku, full kao dio Thesis Passa.

### F. Poslovno (cross-ref siri audit)
- [ ] Potvrditi postoji li stvarni distribucijski kanal maturiraj.hr (plan ga racuna kao prednost;
      CLAUDE.md kaze da kod "nema veze s maturiraj.hr").
- [ ] MoR pravni subjekt, EU + DPA, PITR (iz produkcijskog audita, nije co-pilot specificno).

## 3. Minimalni put do prve vrijednosti

1. Naplata uzivo: A (Supabase + Lemon Squeezy) + B (0017) -> Thesis Pass i po-dokumentu se prodaju,
   paywall gate aktivan. NE treba integritet za ovo.
2. Cloud teaser kao akvizicija: C (embedding model + korpus + tajne) + D (pravno) + E (UI) + B (0018).
   Ovo je veci lift; moze doci nakon sto naplata radi.
3. Rokovi uzivo: A (Resend + potvrdjeni rokovi) -> podsjetnici aktivni.

Redoslijed nije slucajan: Faze 1-3 (naplata + retencija + registar) daju vrijednost BEZ ijednog
cloud poziva i BEZ pravnog rizika slanja teksta. Faza 4 (cloud) je zadnja jer nosi najveci
trosak i najveci privatnosti/GDPR teret.

## 4. Sto je namjerno izostavljeno (i zasto)

- Istojezicni plagijat: institucije ga imaju besplatno kroz Turnitin/Srce; natjecanje je mrtva
  ulica (COMPETITORS.md). Diferencijator je cross-lingual + AI.
- Generativni writing assistant: integritetski rizik (institucijski AI-detektor bi oznacio tekst);
  registar ostaje ne-generativan (odluka B).
- Self-host embedding: v2 (privatnost naspram troska i infra kompleksnosti).
- Resume bez ponovnog uploada: re-check petlja vec isporucuje vrijednost; teska lokalna
  perzistencija dokumenta ne opravdava se sada.
