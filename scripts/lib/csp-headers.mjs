// CSP u public/_headers: build-time zamjena tokena i provjera izgradjenog dist/_headers.
//
// Zasto zaseban modul (F18 krug 2, 2026-09-26): provjera je do sada zivjela samo u
// scripts/verify-deploy-dist.mjs, koji se vrti nad dist/ i na prvom kvaru radi process.exit(1).
// Takav gard se ne moze pokrenuti iz Vitesta, pa nije imao ni cisti baseline ni mutaciju, a
// vec je jednom lazno obecavao: komentar u public/_headers nosio je token __CSP_LS__ koji
// vite.config.ts vise nije zamjenjivao, pa bi svaki produkcijski build pao, a da to nijedan
// Vitest test nije vidio. Sada zamjenu i provjeru koriste ISTI kod: vite.config.ts (zamjena),
// verify-deploy-dist.mjs (provjera nad dist/) i tests/gate-mutations.test.ts (baseline nad
// stvarnim public/_headers plus mutacije u memoriji).

/**
 * Svaki `__CSP_IME__` token, bilo gdje u datoteci, UKLJUCUJUCI komentare. Komentar se ne izuzima
 * namjerno: Netlify ga ignorira, ali nesupstituiran token u komentaru znaci da je netko
 * dokumentirao token koji build vise ne poznaje, a to je upravo kvar iz kruga 1.
 */
export const CSP_TOKEN_PATTERN = /__CSP_[A-Z0-9_]+__/g;

/** Jedini token koji build jos zamjenjuje: konkretan Supabase origin projekta. */
export function substituteCspTokens(source, { supabase }) {
  return source.replaceAll('__CSP_SUPABASE__', supabase);
}

/**
 * Stripe Payment Element (F18, 2026-09-23). Provjera da su tokeni zamijenjeni NIJE dokaz da je
 * zamjena ispravna: dist bi prosao i bez ijedne Stripe dozvole, a placanje bi tiho crklo u
 * pregledniku. Zato se trazi svaki host izricito, na tocnoj direktivi.
 */
export const STRIPE_CSP_EXPECTATIONS = Object.freeze([
  ['script-src', 'https://js.stripe.com'],
  // Stripeove smjernice za CSP (docs.stripe.com/security/guide, odjeljak Stripe.js): Stripe.js po
  // mogucnosti pokrece okvire na poddomenama js.stripe.com, pa i one moraju biti dopustene.
  ['script-src', 'https://*.js.stripe.com'],
  ['connect-src', 'https://api.stripe.com'],
  ['frame-src', 'https://js.stripe.com'],
  ['frame-src', 'https://*.js.stripe.com'],
  ['frame-src', 'https://hooks.stripe.com'],
]);

/**
 * Porijekla koja `payment` u Permissions-Policy MORA dopustiti (F18 krug 4). Apple Pay i Google
 * Pay (Z36) rade kroz Payment Request API u Stripeovu okviru; `payment=()` ga zabranjuje i tom
 * okviru, pa gumbi novcanika tiho nestanu, a placanje karticom i dalje radi, pa kvar nitko ne vidi.
 * Clanovi su u obliku strukturiranog polja: `self` bez navodnika, porijekla u navodnicima.
 */
export const STRIPE_PAYMENT_PERMISSION_ORIGINS = Object.freeze(['self', '"https://js.stripe.com"', '"https://*.js.stripe.com"']);

/** Vrijednost prvog Permissions-Policy retka u _headers datoteci, ili '' kad je nema. */
export function permissionsPolicyLine(headers) {
  return (headers.match(/^\s*Permissions-Policy:\s*(.+)$/m) || [])[1] ?? '';
}

/**
 * Allowlista jedne znacajke kao niz clanova, `['*']` za zamjenski znak, ili `null` kad znacajke
 * nema. Ime se trazi na granici clana (pocetak ili iza zareza), ne kao podniz.
 */
export function permissionsPolicyAllowlist(policy, feature) {
  // String.raw: u obicnom template literalu `\s` bi postao samo `s`.
  const m = policy.match(new RegExp(String.raw`(?:^|,)\s*${feature}=(\*|\(([^)]*)\))`));
  if (!m) return null;
  if (m[1] === '*') return ['*'];
  return m[2].trim().split(/\s+/).filter(Boolean);
}

/** Vrijednost prve CSP linije u _headers datoteci, ili '' kad je nema. */
export function cspLine(headers) {
  return (headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] ?? '';
}

/**
 * Vrijednost jedne direktive. Ime se trazi na granici direktive (pocetak ili iza `;`), a ne kao
 * podniz: `src` u `frame-src` ne smije pogoditi neku drugu direktivu koja zavrsava istim nizom.
 */
export function cspDirective(csp, name) {
  return (csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`)) || [])[1] ?? '';
}

/**
 * Svi problemi s CSP-om u IZGRADJENOM _headers (nakon zamjene tokena). Prazan niz znaci cisto.
 * Vraca sve probleme, ne samo prvi, da test mutacije moze tvrditi TOCNO koji je kvar uhvacen.
 */
export function cspHeaderProblems(headers) {
  const problems = [];
  const leftover = [...new Set(headers.match(CSP_TOKEN_PATTERN) ?? [])];
  for (const token of leftover) {
    problems.push(`nesupstituiran token ${token} (cspAllowlist plugin ga ne poznaje ili nije odradio)`);
  }

  const csp = cspLine(headers);
  if (!csp) {
    problems.push('nema Content-Security-Policy');
    return problems;
  }

  // SEC-01, SEC-02: bez wildcard hosta i s konkretnim Supabase originom.
  for (const name of ['connect-src', 'form-action']) {
    const value = cspDirective(csp, name);
    if (!value) {
      problems.push(`CSP nema direktivu ${name}`);
      continue;
    }
    if (/https:\/\/\*\./.test(value)) problems.push(`CSP ${name} sadrzi wildcard host: "${value.trim()}"`);
    if (!/https:\/\/[a-z0-9-]+\.supabase\.co/.test(value)) {
      problems.push(`CSP ${name} nema konkretan Supabase origin: "${value.trim()}"`);
    }
  }

  for (const [name, host] of STRIPE_CSP_EXPECTATIONS) {
    const value = cspDirective(csp, name);
    if (!value) problems.push(`CSP nema direktivu ${name} (Stripe Payment Element se ne bi ucitao)`);
    else if (!value.split(/\s+/).includes(host)) problems.push(`CSP ${name} ne dopusta ${host}: "${value.trim()}"`);
  }

  // Permissions-Policy `payment`: otvoren tocno za vlastito porijeklo i Stripe.js okvire.
  const policy = permissionsPolicyLine(headers);
  if (!policy) {
    problems.push('nema Permissions-Policy (audit security-05)');
  } else {
    const payment = permissionsPolicyAllowlist(policy, 'payment');
    if (payment === null) {
      problems.push(`Permissions-Policy nema znacajku payment: "${policy.trim()}"`);
    } else if (payment.includes('*')) {
      problems.push(`Permissions-Policy payment dopusta svako porijeklo: "${policy.trim()}"`);
    } else if (payment.length === 0) {
      problems.push('Permissions-Policy payment=() blokira Apple Pay i Google Pay u Stripe okviru');
    } else {
      for (const origin of STRIPE_PAYMENT_PERMISSION_ORIGINS) {
        if (!payment.includes(origin)) problems.push(`Permissions-Policy payment ne dopusta ${origin}: "${policy.trim()}"`);
      }
    }
  }

  // form-action ne smije nositi host naplate: Payment Element ne salje obrazac nikamo.
  const formAction = cspDirective(csp, 'form-action');
  if (/stripe\.com/.test(formAction)) {
    problems.push(`CSP form-action nosi Stripe host, a Payment Element ga ne koristi: "${formAction.trim()}"`);
  }
  return problems;
}
