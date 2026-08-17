# Repair Contract CI Security Gates Design

**Datum:** 2026-08-17
**Status:** odobren dizajn, prije implementacije
**Opseg:** PR #38, `feature/repair-contract-v1` prema `design/wordreplica-one-time-runner`

## Kontekst

Repair Contract v1 prolazi TypeScript, puni Vitest korpus, build, conformance,
DOCX smoke, strict-open i GitGuardian. GitHubov `security-audit` ipak pada iz dva
razlicita razloga:

1. gitleaksovo pravilo `generic-api-key` oznacava javni fixture `keyId` i javni
   SPKI kljuc kao tajne;
2. `npm audit --omit=dev --audit-level=high` prijavljuje tri advisoryja za
   tranzitivni `nanoid@2.1.11` koji dolazi iskljucivo kroz `hunspell-asm@4.0.2`
   i `emscripten-wasm-loader@3.0.3`.

Privatni Repair Contract kljuc nije commitiran. `hunspell-asm@4.0.2` je aktualna
upstream verzija i jos zahtijeva pozivljivi `nanoid` v2 API. Prisilni override na
zakrpani `nanoid@3.3.18` nije kompatibilan: CJS v2 izvozi funkciju, a v3 objekt s
imenovanim exportima.

## Ciljevi

- vratiti oba security joba u zeleno bez skrivanja novih tajni ili ranjivosti;
- dopustiti samo trenutno dokazani, javni gitleaks materijal;
- dopustiti samo tocno poznati, neizravni `nanoid` advisory skup i tocni lockfile
  lanac;
- zadrzati hrvatski Hunspell i njegovo postojece browser ponasanje;
- fail-closed odbiti svaku novu high/critical ranjivost, advisory, paket, verziju,
  putanju ili nevaljani audit izvjestaj.

## Nije cilj

- mijenjati Repair Contract wire format ili DOCX izvrsavanje;
- nadogradivati, downgradeati, forkatati ili vendorirati `hunspell-asm`;
- mijenjati `nanoid` verziju u ovom PR-u;
- iskljuciti cijele Repair Contract datoteke iz gitleaks skeniranja;
- smanjiti globalni `npm audit` prag ili ignorirati sve tranzitivne ranjivosti;
- promovirati PR na `master` prije zelenog CI-ja i zasebnog promotion PR-a.

## Razmotrene opcije

### 1. Precizna policy iznimka, odabrano

Gitleaks dobiva samo dva tocna regex matcha: fixture `keyId` i tocni javni SPKI.
NPM audit ostaje aktivan, ali njegov JSON prolazi kroz mali fail-closed policy koji
dopusta samo unaprijed navedene `nanoid` advisory ID-jeve na tocno provjerenom
tranzitivnom lancu i verziji.

Prednost je da nema runtime promjene. Nedostatak je dokumentirani tehnicki dug koji
mora nestati kada upstream objavi kompatibilnu zakrpanu verziju.

### 2. Fork ili vendoring Hunspella, odbijeno za ovaj PR

Uklanjanje zastarjele ovisnosti u vlastitom forku bilo bi dugorocno cisto, ali bi
uvelo odrzavanje tudjeg WASM paketa, licencni i supply-chain opseg te znatno vecu
regresijsku povrsinu.

### 3. `nanoid@3` override, odbijeno

Ovo bi uklonilo audit nalaz, ali mijenja pozivljivi CJS API u objekt i moze potajno
pokvariti spellcheck. Zeleni install nije dovoljan dokaz runtime kompatibilnosti.

## Dizajn

### Gitleaks

Postojeca privremena TOML konfiguracija u
`.github/workflows/security-audit.yml` zadrzava zadana pravila i `regexTarget =
"match"`. U `regexes` se dodaju samo:

- tocni javni fixture identifikator `fixture-2026-08-16`;
- tocni SPKI base64url iz
  `tests/fixtures/repair-contract-v1/public-key.spki.b64url`.

Ne dodaje se nijedan Repair Contract `path` allowlist. Time ista datoteka i dalje
pada ako kasnije sadrzi bilo koji drugi token koji izgleda kao tajna.

### Produkcijski npm audit policy

Novi Node CLI cita JSON rezultat naredbe `npm audit --omit=dev --json` i
`package-lock.json`. Policy dopusta samo ove advisory ID-jeve:

- `GHSA-mwcw-c2x4-8c55`;
- `GHSA-28wg-ghj8-5hjv`;
- `GHSA-2v37-7h3g-55p8`.

Iznimka vrijedi samo ako su istodobno istiniti svi uvjeti:

- ranjivi paket je `nanoid` i nije izravna ovisnost;
- lockfile verzija je tocno `2.1.11`;
- ranjivi nodeovi pripadaju samo `hunspell-asm` i
  `emscripten-wasm-loader` tranzitivnim putanjama;
- `hunspell-asm` je tocno `4.0.2`, a `emscripten-wasm-loader` tocno `3.0.3`;
- audit ne sadrzi nijedan dodatni high/critical paket ili nepoznati advisory.

CLI vraca exit 0 samo za nula high/critical nalaza ili za taj tocni skup. Nevaljan
JSON, nedostajuci lockfile podatak, promjena verzije ili nova ranjivost vracaju
nenulti exit kod s jasnim popisom razloga.

Workflow vise ne poziva goli `npm audit --audit-level=high`, nego policy CLI koji
sam pokrece audit, parsira njegov JSON i cuva isti prag.

### Kompenzacijska kontrola

Ranjivi `nanoid` ne sluzi za sigurnosni token. Hunspell ga poziva samo s konstantom
`45` za ime privremene datoteke u WASM in-memory filesystemu. Produkcijski Vite
plugin `lekta-fix-hunspell-nanoid` uklanja Hunspellov `nanoid` import i umece mali
lokalni generator prije bundlanja.

Regresijski tripwire mora dokazati da se stvarni Hunspell ESM import transformira,
da import nestaje i da poziv s duljinom 45 ostaje funkcionalan. Time audit iznimka
ne pociva samo na komentaru ili rucnoj procjeni.

## Testovi

Implementacija slijedi RED-GREEN redoslijed:

1. policy test prvo pada jer ne postoje CLI/pure policy i workflow wiring;
2. gitleaks workflow test prvo pada jer tocne javne vrijednosti nisu allowlistane;
3. Hunspell transform tripwire prvo dokazuje stvarni kompenzacijski control ili
   otkriva da ga treba minimalno izdvojiti radi testiranja;
4. minimalna implementacija dovodi ciljane testove u GREEN;
5. `npm run check` mora proci prije commita;
6. `npm run repair-contract-fixture` ne smije proizvesti drift;
7. nakon pusha oba GitHub security joba i svi ostali PR checkovi moraju biti zeleni.

Policy testovi moraju pokriti barem: tocni trenutni nalaz prolazi, novi advisory
pada, izravni `nanoid` pada, verzijski ili path drift pada, dodatni high/critical
paket pada i nevaljani audit JSON pada.

## Predaja i rollback

Promjena ide kao zaseban commit na `feature/repair-contract-v1`. PR ostaje draft dok
svi checkovi ne postanu zeleni. Rollback je revert tog commita; ne mijenja se
Repair Contract fixture, privatni kljucevi, Golden snapshoti ni DOCX engine.

Tehnicki dug ostaje eksplicitan: kada `hunspell-asm` ili njegov loader objave
kompatibilnu verziju bez ranjivog `nanoid` lanca, update mora ukloniti audit
iznimku i pripadajuce allowlist testne podatke.
