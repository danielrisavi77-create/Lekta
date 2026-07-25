# Plan optimizacije bundleova i lazy tokova

Datum: 24. srpnja 2026.

## Polazno stanje

Produkcijski glavni UI bundle iznosi 650,9 kB, odnosno 141,9 kB gzip. To je
nužan kod za prvi tok proizvoda: upload dokumenta, odabir profila, pokretanje
lokalne analize i prikaz rezultata. Ne dijeliti ga mehanički samo radi utišavanja
općeg Vite upozorenja.

Veliki rječnički bundle za hrvatski pravopis iznosi 740,4 kB, odnosno 299,4 kB
gzip, ali učitava se tek pri eksplicitnom pokretanju provjere pravopisa. Teški
profili i predlošci naslovnica također su već odvojeni u lazy chunkove.

## Nalazi

| Područje | Veličina izvora | Kada se koristi | Odluka |
|---|---:|---|---|
| `src/legal/legal-content.ts` | 27 kB | Klik na pravni modal | Učitati lijeno |
| `src/report/repair-history.ts` | 5 kB | Povijest popravaka | Učitati lijeno |
| `src/preflight/preflight-panel.ts` | 20 kB | Plaćeni preflight tok | Učitati lijeno |
| `src/ui/repair-panel.ts` | 17 kB | Nakon analize, popravci | Učitati lijeno |
| `src/report/repair-client.ts` | 12 kB | Slanje automatskog popravka | Učitati lijeno |
| `src/auth/session.ts` | 9 kB | Prijava i zaštićeni tokovi | Učitati lijeno |
| `src/report/checkout.ts` | 8 kB | Kupnja paketa | Učitati lijeno |

## Cilj

Smanjiti glavni bundle za najmanje 20 do 35 kB gzip bez promjene toka
`Dokument -> Profil -> Analiza`, bez promjene analitičkog rezultata i bez
uvođenja serverske ovisnosti.

## Redoslijed implementacije

1. Pravne stranice u modalu i povijest popravaka.
   - Učitati HTML pravnih dokumenata tek pri otvaranju modala.
   - Učitati mrežni klijent povijesti tek pri otvaranju povijesti.
   - Zadržati fokus-trap, Escape i jasnu poruku tijekom učitavanja.

2. Repair i preflight tokovi.
   - Učitati repair panel, repair klijent i preflight panel tek nakon analize,
     odnosno pri ulasku u pojedini tok.
   - Očuvati odabir stavki i lokalnu obradu dokumenta.

3. Prijava, checkout i referral.
   - Učitati mrežne klijente tek nakon korisnikove radnje koja ih treba.
   - Sačuvati povratak na izvornu radnju nakon prijave.

4. Mjerenje i regresija.
   - Zabilježiti veličine chunkova prije i poslije svake faze.
   - Dodati ciljane testove lazy učitavanja, grešaka i ponovljenog klika.
   - Svaka faza završava zelenim `npm run check`.

## Granice

- Ne dirati DOCX parser, audit engine, citation engine ni profile bez golden baselinea.
- Ne premještati kod potreban za upload, wizard ili rezultat iza dodatnog zahtjeva.
- Ne dijeliti chunkove samo radi izlaska ispod generičkog praga upozorenja ako bi to
  povećalo broj početnih zahtjeva bez stvarne korisničke koristi.
