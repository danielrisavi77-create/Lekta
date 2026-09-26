# Lekta + WordReplica local-repair release

Ovaj postupak objavljuje jednu stabilnu, Authenticode-potpisanu WordReplica
izvrsnu datoteku. Claim tajna nije u javnom URL-u ni u binarnom artefaktu;
Lekta je dodaje samo lokalnom nazivu preuzete datoteke za jedan placeni posao.

## Preduvjeti

- WordReplica `BUILD_LEKTA_REPAIR_RUNNER.ps1` proizveo je `LektaRepair.exe` i
  `lekta-repair-runner-manifest.json`.
- Authenticode status EXE-a je `Valid`, a potpisnik odgovara thumbprintu iz
  manifesta.
- Dostupne su varijable `SUPABASE_ACCESS_TOKEN` i `SUPABASE_DB_PASSWORD`.
- Za Netlify su dostupne obje varijable `NETLIFY_AUTH_TOKEN` i
  `NETLIFY_SITE_ID`, ili je Netlify CLI vec globalno prijavljen i worktree je
  povezan bas sa `https://lektahr.netlify.app`. Release provjerava taj URL
  fail-closed. Vrijednosti tajni ne stavljaju se u argumente naredbe niti u
  repozitorij.
- Ciljni Supabase projekt je iskljucivo `zrrjttizjyfcxmcpgzml`.

Opcionalno se moze postaviti `LEKTA_PUBLIC_REPAIR_RUNNER_URL`. Zadana vrijednost
je `https://lektahr.netlify.app/downloads/LektaRepair.exe`; URL mora biti HTTPS
i zavrsavati s `/LektaRepair.exe` bez queryja ili fragmenta.

## Samo provjera

```powershell
npm run release:repair:preflight -- --artifact C:\put\do\LektaRepair.exe
```

Manifest se zadano cita iz istog foldera. Preflight fail-closed provjerava
manifest, velicinu, SHA-256, Authenticode potpisnika, contract key, projekt i
migracije 0096-0098. Ne povezuje projekt i ne radi mrezne promjene.

## Potpuni automatizirani release

```powershell
npm run release:repair:deploy -- --artifact C:\put\do\LektaRepair.exe
```

Redoslijed je namjerno fiksan:

1. povezivanje iskljucivo na odobreni Supabase projekt;
2. puni Lekta repair integration gate i produkcijski build s prikovanim URL-om
   i SHA-256 hashom;
3. ponovno provjereno kopiranje EXE-a u `dist/downloads/LektaRepair.exe`;
4. dry-run migracija, pa stvarni `db push`;
5. deploy `repair-local-claim`, `repair-local-status` i `repair-docx`;
6. Netlify production deploy vec izgradenog `dist` foldera.

Svaki neuspjeh zaustavlja sljedece korake. Netlify se poziva zadnji, pa javni
klijent nikad ne pokazuje na runner koji nije prosao lokalni gate i hash
provjeru.
