// scripts/security/never-markers.mjs
//
// JSON kljucevi koji se NIKAD ne smiju pojaviti ni u jednoj emitiranoj javnoj
// datoteci (dist/ i dist-packs/). To su polja koja postoje ISKLJUCIVO u privatnom
// sloju: drafts evidence (verifiedBy, reviewedBy, confirmedVia), source-registry
// (snapshotHash), advisory racunski sloj (demotedByProfile) i izvorna provenijencija
// (publicSources). Njihova pojava KAO KLJUCA znaci da je evidence procurila.
//
// Trazi se KLJUC-OBLIK, ne goli niz: prvi prolaz skena (2026-08-23) pokazao je da
// goli niz lazno pali na PROZU ("binding pravila trebaju reviewedBy..." u note
// poljima profila). Provjeravaju se TRI oblika kljuca:
//   1. "kljuc":        sirovi JSON (SEO stranice, kopije iz public/, dist-packs)
//   2. \"kljuc\":      JSON string ugnijezden u JS string literal
//   3. [,{(;[]kljuc:   IDENTIFIER oblik: vite 8 / rolldown minificirani chunk
//                      emitira objektne kljuceve BEZ navodnika (adversarijalna
//                      revizija 2026-08-23: repair-map chunk sadrzi `sourcePage:` i
//                      `autoFixable:!0`); interpunkcija ispred kljuca razlikuje
//                      kljuc od proze (u prozi ispred rijeci stoji razmak).
//
// NAMJERNO IZVAN liste:
//  - "quote", "sourcePage", "lastVerified": do faze B3 legitimno u repair-map lazy
//    chunku (dokazni cip), na SEO naslovnicama trajno (odluka vlasnika).
//  - "verifiedHash": javni verificirani citatni specovi (data/tools/citation-specs/
//    verified/*.json) NAMJERNO nose taj kljuc u browser bundleu (gate protiv
//    zastarjelog speca), pa bi globalna zabrana bila trajno crvena i gard bi se
//    gasio; gard koji se gasi je gori od nepostojanja (pouka bundleSizeGuard).
//    Draftsku evidence i dalje cuvaju verifiedBy/reviewedBy/confirmedVia kljucevi,
//    zabrana drafts modula u grafu (classification-guard) i kanarinci.

//  - "verifiedBy": javni verificirani citatni specovi ga NAMJERNO nose (autorstvo
//    verifikacije, svih 71 u dist chunkovima), pa bi marker bio trajno crven.
//    Drafts evidence i dalje cuvaju reviewedBy + confirmedVia kljucevi, kanarinci
//    i zabrana drafts modula u grafu. Kandidat za minimizaciju u fazi B:
//    izbaciti verifiedBy iz klijentskog citatnog speca pa vratiti marker.
export const NEVER_KEY_MARKERS = [
  'reviewedBy',
  'confirmedVia',
  'snapshotHash',
  'demotedByProfile',
  'publicSources',
];

/**
 * Vrati kljuceve iz popisa koji se u sadrzaju pojavljuju kao JSON kljuc
 * (raw "kljuc": ili escapani \"kljuc\": oblik).
 * @param {Buffer | string} content
 * @param {string[]} [keys]
 * @returns {string[]}
 */
export function findKeyMarkers(content, keys = NEVER_KEY_MARKERS) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  const text = buf.toString('utf8');
  return keys.filter(
    (k) =>
      buf.includes(`"${k}":`) ||
      buf.includes(`\\"${k}\\":`) ||
      new RegExp(`[,{(;\\[]${k}:`).test(text),
  );
}

/**
 * Vrati vrijednosti (goli nizovi, npr. kanarinci i sha256 otisci) prisutne u sadrzaju.
 * @param {Buffer | string} content
 * @param {string[]} values
 * @returns {string[]}
 */
export function findValues(content, values) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  return values.filter((v) => buf.includes(v));
}
