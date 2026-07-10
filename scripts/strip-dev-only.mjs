// Rezanje dev-only regija iz HTML-a pri DEPLOY buildu (setup modal, QA konzola).
// Regije se u index.html oznacavaju parom <!-- dev-only:start --> ... <!-- dev-only:end -->.
// Cista funkcija, odvojena od vite.config.ts da je vitest moze testirati
// (tests/dev-only-strip.test.ts cuva i CSP invarijantu: FOUC skripta ostaje netaknuta).

const REGION_RE = /<!--\s*dev-only:start\s*-->[\s\S]*?<!--\s*dev-only:end\s*-->/g;

/** Ukloni sve dev-only regije (koristi se samo kad je DEPLOY=1). */
export function stripDevOnly(html) {
  return html.replace(REGION_RE, '');
}

/** Sanity: broj start i end markera se mora poklapati (nespareni marker = tihi propust). */
export function devOnlyMarkersBalanced(html) {
  const starts = (html.match(/<!--\s*dev-only:start\s*-->/g) || []).length;
  const ends = (html.match(/<!--\s*dev-only:end\s*-->/g) || []).length;
  return starts === ends;
}
