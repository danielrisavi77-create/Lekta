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
  povezan bas sa siteom `1e7526f5-7f0a-480e-8589-d79ee91ff7b0` na
  `https://lektahr.netlify.app`. Release provjerava i ID i URL fail-closed.
  Vrijednosti tajni ne stavljaju se u argumente naredbe niti u repozitorij.
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
migracije 0104-0106. Ne povezuje projekt i ne radi mrezne promjene.

## Potpuni automatizirani release

```powershell
npm run release:repair:deploy -- --artifact C:\put\do\LektaRepair.exe
```

Redoslijed je namjerno fiksan:

1. povezivanje iskljucivo na odobreni Supabase projekt;
2. puni Lekta repair integration gate i produkcijski build s prikovanim URL-om
   i SHA-256 hashom;
3. ponovno provjereno kopiranje EXE-a u `dist/downloads/LektaRepair.exe`;
4. ponovni zavrsni `verify-deploy-dist` nad konacnim `dist` folderom koji sada
   ukljucuje runner;
5. provjera cijele remote migracijske povijesti u privremenom workspaceu,
   dry-run, pa stvarni `db push`;
6. deploy `repair-local-claim`, `repair-local-status` i `repair-docx`;
7. Netlify production deploy vec izgradenog i provjerenog `dist` foldera.

Svaki neuspjeh zaustavlja sljedece korake. Netlify se poziva zadnji, pa javni
klijent nikad ne pokazuje na runner koji nije prosao lokalni gate i hash
provjeru.

## Fail-closed migracijski workspace

Release ne radi `db push` iz repozitorija u kojem nedostaje dio produkcijske
povijesti. Za svaki execute stvara novi privremeni Supabase workspace i zatim:

1. inicijalizira ga i povezuje iskljucivo s projektom
   `zrrjttizjyfcxmcpgzml`;
2. dohvaća stvarnu produkcijsku migracijsku povijest;
3. provjerava svaku dohvaćenu verziju, naziv i odobreni SHA-256;
4. nadopunjuje samo poznate Windows fetch gapove i lokalne migracije 0104-0106;
5. zahtijeva da dry-run vrati tocno `0104`, `0105`, `0106`, tim redom i bez
   duplikata;
6. tek tada radi stvarni push, a privremeni workspace brise i nakon uspjeha i
   nakon greske.

Ista lokalna verzija s drugim nazivom, duplicirana verzija, nepoznata remote
migracija, promijenjeni hash, nedostajuca odobrena povijest ili drukciji dry-run
redoslijed prekidaju release prije prvog zapisa u bazu.

### Odobrena remote-only povijest

Hashovi ispod izracunati su nad datotekama koje je produkcijski
`supabase migration fetch` vratio 10. rujna 2026. i namjerno su prikovani u
`scripts/local-repair-migration-workspace.mts`.

| Migracija | SHA-256 | Dokaz podrijetla |
| --- | --- | --- |
| `0102_corpus_contributions.sql` | `6f0ba9a9741ad104f658e1f4db4781bd5203db8158a3c49389854a183e9197e9` | Git commit `10db12a65bd9a2aeef61b2774019b2f8a58315be`; produkcijski fetch razlikuje se samo po praznim redovima |
| `0103_health_ping.sql` | `9ebafaa1a3e6d7f0382f48f2bd80a79e3680e3a957f6a0cdf86b64304adf3041` | Git commit `aae85b3da713ef932f5a831b75a5a33a21f30564`; produkcijski fetch razlikuje se samo po praznim redovima |
| `20260830005406_sprint_engine_i_narudzbe.sql` | `d04c082fecb94509f7cebeb78136bcb03f7f85e9cc8cb83b670569fb5e9f0d49` | Pregledana zajednicka Sprint povijest produkcijskog projekta |
| `20260830195311_stavka_crm_leadovi.sql` | `93256b2024749f8758fe0caa6f4dc8a53d2f6232b5cfa68ec3f9ff17ee6a4ff3` | Pregledana zajednicka Stavka povijest produkcijskog projekta |
| `20260830195452_stavka_leadovi_email_nullable.sql` | `0bcde9fcbcbf1f18fbb64d6cd4981636f6508dfe37eb46955c9d78658d0f3af2` | Pregledana zajednicka Stavka povijest produkcijskog projekta |
| `20260830195905_stavka_revoke_trigger_fn_execute.sql` | `352fffe550fbd7d83bac934f36f95383fc1f5a1b5dae857a5cac5ee216a9072a` | Pregledana zajednicka Stavka povijest produkcijskog projekta |

Nova zajednicka ili remote-only migracija nikada se ne prihvaca automatski.
Prvo se mora povezati s izvornim commitom ili drugim vlasnickim dokazom,
pregledati SQL, usporediti ga s produkcijskim fetchom i tek zatim zasebnim
reviewom dodati tocan naziv i produkcijski SHA-256 u allowlistu.
