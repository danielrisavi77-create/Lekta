// scripts/release-tiers.mjs
//
// POPIS RAZINA DOKAZA, na JEDNOM mjestu.
//
// Do 2026-09-13 je popis zivio unutar `release-check.mjs`, dakle unutar skripte koja se pri uvozu
// odmah izvrsi (cita git, pokrece razine, na kraju zove `process.exit`). Nijedan drugi alat ga zato
// nije mogao procitati, pa je gate pri deployu (`verify-deploy-dist.mjs`) potpunost dokaza morao
// UZETI NA RIJEC iz samog dokaza (`proof.complete`), umjesto da je izracuna iz `results[]`.
//
// Ta razlika nije teorijska: `complete` je OBICNO POLJE U JSON-u. Dokaz pecen starijim popisom
// razina, rucno uredjen dokaz, ili dokaz kojemu je razina ispala iz `results[]` svejedno tvrdi
// `complete: true`, a gate koji cita tudju zastavicu umjesto da sam izracuna nema kako to vidjeti.
// S popisom u zasebnom modulu obje strane citaju ISTI izvor: `release-check.mjs` po njemu vrti i
// pece, `release-gate-core.mjs` po njemu neovisno provjerava.

/**
 * Razine dokaza, redom od najjeftinije do najskuplje.
 *
 * `required` znaci da bez nje dokaz nije potpun. `windowsOnly` razine se preskacu drugdje, ali
 * se NE biljeze kao prolaz.
 */
export const TIERS = Object.freeze([
  // `check` od 2026-09-01 ukljucuje `check:edge` (deno typecheck Edge funkcija), pa zasebne
  // `edge` razine vise nema: bila bi drugi prolaz ISTIM alatom, dakle slaganje a ne provjera,
  // uz 34 s cijene. Dokaz o Edge kodu nije nestao nego je usao u razinu ispod.
  { id: 'check', label: 'Tier 0: oxlint + tsc + edge (deno) + vitest + build', cmd: 'npm run check', required: true },
  // Svjezina pecenih projekcija: SCREENING, pa `required: false`, i to je izmjereno a ne pretpostavljeno.
  // Prva regeneracija po uputi ovog detektora (2026-09-01) pokazala je da su sve TRI prijavljene
  // projekcije dale BAJT-IDENTICAN sadrzaj: signal gleda redoslijed commita, ne izlaz, pa pogodak
  // znaci "potvrdi regeneracijom", nikad "pokvareno". Kao `required: true` bio bi gard koji vristi
  // na sve i blokirao bi izdanje zbog commita koji izlaz nisu ni dirnuli.
  // Ostaje u dokazu jer signal NIJE prazan: sest slucajeva od 2026-08-31 bilo je stvarno ustajalo
  // (`REPAIR_RECIPE.md` je imao `deep` na 50 mjesta manje). Vidljiv je u RELEASE_PROOF.json, ali
  // ne obara `complete`. U `npm run check` ne ide nikako: ondje bi svaki dodir `src/repair/`
  // trazio regeneraciju od desetak minuta. Trazi punu povijest, koju release-check ima jer se
  // vrti lokalno, ne na plitkom CI checkoutu.
  { id: 'projections', label: 'Tier 0: svjezina pecenih projekcija (screening)', cmd: 'npm run projection-freshness', required: false },
  { id: 'conformance', label: 'Tier 0: conformance matrica', cmd: 'npm run conformance', required: true },
  { id: 'slow', label: 'Tier 0: spori repair testovi', cmd: 'npm run test:slow', required: true },
  { id: 'ux', label: 'Tier 0: Playwright UX', cmd: 'npm run test:ux', required: true },
  // Kriticni put nad `dist/` kroz `vite preview` (vanjski audit 2026-09-08, nalaz 3). `required: false`
  // dok se ne izmjeri stabilnost; `dist/` postoji jer je `check` iznad vec izvrtio `vite build`. Nije
  // duplikat `ux` razine: ona vrti dev server, ova produkcijski bundle.
  { id: 'ux-dist', label: 'Tier 0: Playwright nad dist/ (vite preview)', cmd: 'npm run test:ux:dist', required: false },
  // POPRAVLJENE pakete, ne ulazne fixture: `verify:strict-open` (bez `:repaired`) otvara
  // `tests/fixtures/docx`, dakle ULAZE, i popravak u njoj nikad nije pozvan. Do 2026-08-30 je
  // RELEASE_PROOF biljezio bas tu, slabiju provjeru kao "Tier 1: pass".
  { id: 'strict-open', label: 'Tier 1: lxml nad POPRAVLJENIM paketima', cmd: 'npm run verify:strict-open:repaired', required: true },
  { id: 'word', label: 'Tier 2: pravi Microsoft Word', cmd: 'npm run verify:word', required: true, windowsOnly: true },
  { id: 'word-worst', label: 'Tier 2: Word, najgori slucaj', cmd: 'npm run verify:word:worst', required: true, windowsOnly: true },
  // Word korpus i Word TOC su obavezni OD 2026-09-26 (T62, Word truth gate, korak 1).
  //
  // ZASTO: `word` mjeri tri dokumenta koja Word sam napravi, `word-worst` jedan sastavljen najgori
  // slucaj. Commitani korpus (`tests/fixtures/docx`: LibreOffice izlaz, pravi Word radovi, pravni
  // fixturi s fusnotama, doktorska disertacija) i izuzece `toc-field-fixera` (vidljivi tekst isti
  // PRIJE i POSLIJE `Fields.Update()`) imali su vlastite Word provjere, ali ih nijedna razina nije
  // trazila. Dokaz je zato mogao biti `complete: true` a da korpus ni TOC slucaj nikad nisu prosli
  // kroz pravi Word.
  //
  // STO SE GUBI BEZ NJIH: tvrdnja "popravljeni paket stvarnog rada otvara se bez Wordovog tihog
  // oporavka i ne gubi dio" i tvrdnja "osvjezavanje sadrzaja ne dira autorski tekst". Tier 0 i
  // Tier 1 na to ne odgovaraju (dobro oblikovan paket nije paket koji Word prihvaca).
  //
  // Isti obrazac kao ostale Word razine: izvan Windowsa `unavailable`, sto NIJE prolaz.
  { id: 'word-corpus', label: 'Tier 2: Word nad commitanim korpusom', cmd: 'npm run verify:word:corpus', required: true, windowsOnly: true },
  { id: 'word-toc', label: 'Tier 2: Word, TOC slucaj (vidljivi tekst oko Fields.Update)', cmd: 'npm run verify:word:toc', required: true, windowsOnly: true },
  // Faza C zastite baze pravila: mrezna enumeracija profile-rules endpointa. Trazi
  // LEKTA_STAGING_ORIGIN (samo staging, nikad produkcija); bez varijable je unavailable,
  // ne prolaz (isti obrazac kao Word razine: nedostupno != prolazno).
  //
  // `required: false` OD 2026-09-06, odlukom vlasnika, i to je ustupak koji se imenuje a ne krije.
  //
  // ZASTO JE UVEDEN: kao obavezna, ova je razina cinila `complete` NEDOSTIZNIM kad god staging
  // Supabase (`bnyemcnsphlitjradrst`) nije budan. Uz `LEKTA_REQUIRE_RELEASE_PROOF=1` u
  // `netlify.toml` to znaci da NIJEDAN deploy ne moze proci. `docs/AUDIT_MASTER.md` je tu zamku
  // opisao prije nego je sprigla.
  //
  // ZASTO OSTAJE, iako je staging istoga dana vracen u trajno aktivno stanje (vlasnik je odlucio
  // ostaviti `fpzg-raspored` pauziranim i osloboditi slot za staging): Supabase besplatni plan
  // PAUZIRA projekt sam, nakon dovoljno dugog mirovanja. Obavezna razina cija dostupnost ovisi o
  // tome je li netko nedavno dirao staging vratila bi istu zamku, samo rjedje i nepredvidivije, a
  // to je gore od poznatog ustupka. Danas razina STVARNO mjeri (`LEKTA_STAGING_ORIGIN` je zapisan
  // u lokalnom `.env`, obrazac je u `.env.example`), pa je `unavailable` iznimka, ne pravilo.
  //
  // STO SE GUBI KAD JE PRESKOCENA: dokaz tada ne tvrdi da je zastita od bulk enumeracije
  // `profile-rules` izmjerena. To NIJE presuceno: `verify-deploy-dist.mjs` pri svakom deployu
  // poimence ispisuje svaku razinu koja nije `pass`, pa se u dnevniku builda vidi sto je
  // propusteno i zasto. Tisi ustupak bio bi gori od samog ustupka.
  //
  // KAKO SE VRACA NA `true`: kad staging bude na placenom planu, dakle kad njegova dostupnost vise
  // ne ovisi o tome kad je zadnji put koristen.
  { id: 'extraction', label: 'Tier 2: extraction probe (staging)', cmd: 'node scripts/extraction-probe.mjs', required: false, requiresEnv: 'LEKTA_STAGING_ORIGIN' },
]);

/** Identifikatori razina bez kojih dokaz nije potpun. Jedini izvor istine za tu tvrdnju. */
export function requiredTierIds(tiers = TIERS) {
  return tiers.filter((t) => t.required).map((t) => t.id);
}
