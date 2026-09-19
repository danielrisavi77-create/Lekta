# Lekta + WordReplica local-repair release

Ovaj postupak objavljuje jednu stabilnu, Authenticode-potpisanu WordReplica
izvrsnu datoteku. Claim tajna nije u javnom URL-u ni u binarnom artefaktu;
Lekta je dodaje samo lokalnom nazivu preuzete datoteke za jedan placeni posao.

## Preduvjeti

- WordReplica `BUILD_LEKTA_REPAIR_RUNNER.ps1` proizveo je `LektaRepair.exe` i
  `lekta-repair-runner-manifest.json`. Manifest mora zapisati
  `schemaVersion: 2`, `engineVersion: "0.1.0"`, puni `sourceCommit`,
  `sourceBranch: "automation-dev"`, `sourceTreeClean: true` i lowercase
  `contractPublicKeySha256`.
- Authenticode status EXE-a je `Valid`. Stvarni potpisnik mora odgovarati i
  thumbprintu iz manifesta i neovisno konfiguriranom ocekivanom publisher
  thumbprintu. Self-signed development certifikat nije produkcijski identitet.
- Repair Contract key id iz manifesta mora odgovarati neovisno konfiguriranom
  ocekivanom key id-u. Javni fingerprint iz manifesta, neovisno konfigurirani
  javni fingerprint i javni kljuc izveden iz privatnog PKCS#8 P-256 kljuca moraju
  biti potpuno jednaki, a `sourceCommit` tocno pregledanom i odobrenom SHA-u.
- SHA-256 stvarnih bajtova runner artefakta mora odgovarati neovisno pregledanom
  i konfiguriranom artifact hashu; vrijednost se ne prepisuje iz susjednog manifesta.
- Dostupne su varijable `SUPABASE_ACCESS_TOKEN` i `SUPABASE_DB_PASSWORD`.
- Za Netlify su dostupne obje varijable `NETLIFY_AUTH_TOKEN` i
  `NETLIFY_SITE_ID`, ili je Netlify CLI vec globalno prijavljen i worktree je
  povezan bas sa siteom `1e7526f5-7f0a-480e-8589-d79ee91ff7b0` na
  `https://lektahr.netlify.app`. Release provjerava i ID i URL fail-closed.
  Vrijednosti tajni ne stavljaju se u argumente naredbe niti u repozitorij.
- Ciljni Supabase projekt je iskljucivo `zrrjttizjyfcxmcpgzml`.

Preflight nema zadane trust identitete. Operator ih mora unijeti iz neovisno
pregledanog release zapisa, nikad ih ne prepisuje iz susjednog manifesta:

```powershell
$env:LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT = '<trusted-publisher-thumbprint>'
$env:LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID = '<approved-contract-key-id>'
$env:LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256 = '<approved-public-spki-sha256>'
$env:LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT = '<reviewed-full-source-sha>'
$env:LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256 = '<reviewed-artifact-sha256>'
$env:LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL = '<private-p256-pkcs8-base64url>'
```

Prvih pet vrijednosti neovisni su javni release inputi. Privatni PKCS#8 input
ostaje tajna i ne smije se commitati, ispisivati ni prosljedivati child procesima.
Supabase runtime dobiva samo `REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL`,
`REPAIR_CONTRACT_KEY_ID`, `REPAIR_LOCAL_ENABLED` i `REPAIR_LOCAL_DISABLED`,
i to kroz privremeni ograniceni `--env-file` koji se odmah brise.

Opcionalno se moze postaviti `LEKTA_PUBLIC_REPAIR_RUNNER_URL`. Zadana vrijednost
je `https://lektahr.netlify.app/downloads/LektaRepair.exe`; URL mora biti HTTPS
i zavrsavati s `/LektaRepair.exe` bez queryja ili fragmenta.

## Samo provjera

```powershell
npm run release:repair:preflight -- --artifact C:\put\do\LektaRepair.exe
```

Manifest se zadano cita iz istog foldera. Preflight fail-closed provjerava
schema v2, velicinu i SHA-256 stvarnih bajtova prema manifestu i neovisno
pregledanom artifact hashu; trostruko slaganje Authenticode potpisnika (stvarni
potpis, manifest, ocekivani publisher); te trostruko slaganje javnog Repair
Contract fingerprinta (manifest, neovisni release input i javni kljuc izveden iz
privatnog PKCS#8 P-256 kljuca). Provjerava i key id, engine verziju,
`automation-dev` branch, pregledani source commit, cisto izvorno stablo, projekt i
migracije 0104-0106. Ne povezuje projekt i ne radi mrezne promjene.

Testovi i implementacijska provjera u ovom repozitoriju ne izvode produkcijski
deploy. Produkcijski release zahtijeva izriciti `--execute`, sve gateove i stvarni
trusted Authenticode certifikat; self-signed ili nepotpisani runner ostaje odbijen.

## Potpuni automatizirani release

```powershell
npm run release:repair:deploy -- --artifact C:\put\do\LektaRepair.exe
```

Redoslijed je namjerno fiksan i disabled-first:

1. povezivanje iskljucivo na odobreni Supabase projekt;
2. puni Lekta repair integration gate i produkcijski build s prikovanim URL-om
   i SHA-256 hashom;
3. ponovno provjereno kopiranje EXE-a u `dist/downloads/LektaRepair.exe`;
4. ponovni zavrsni `verify-deploy-dist` nad konacnim `dist` folderom;
5. prva remote mutacija zapisuje samo `REPAIR_LOCAL_DISABLED=true`;
6. druga ogranicena env-file operacija postavlja privatni contract kljuc, key id,
   `REPAIR_LOCAL_ENABLED=false` i zadrzava `REPAIR_LOCAL_DISABLED=true`;
7. provjera cijele remote migracijske povijesti u privremenom workspaceu,
   dry-run, pa stvarni `db push`;
8. deploy `repair-local-claim`, `repair-local-status` i `repair-docx`;
9. Netlify production deploy vec izgradenog i provjerenog `dist` foldera;
10. prijelaz na `REPAIR_LOCAL_ENABLED=true` dok
    `REPAIR_LOCAL_DISABLED=true` i dalje cuva flow;
11. zadnja operacija aktivira flow postavljanjem `REPAIR_LOCAL_DISABLED=false`.

Svaka secret faza koristi jednu `supabase secrets set --env-file` naredbu.
Privremeni folder i datoteka dobivaju ograniceni ACL/chmod, privatna vrijednost
nije u argumentima ni logovima, a cleanup kvar zaustavlja release. Svaki drugi
neuspjeh takoder odmah zaustavlja sljedece korake, pa zavrsna aktivacija ostaje
nedostizna nakon bilo kojeg ranijeg kvara.

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
