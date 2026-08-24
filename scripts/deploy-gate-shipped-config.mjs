// scripts/deploy-gate-shipped-config.mjs
//
// Cita SPOSOBNOSTI IZ ISPORUCENOG paketa, ne iz zastavica okoline.
//
// Zasto postoji: prva verzija pravnog gatea u verify-deploy-dist.mjs visjela je o
// `LEKTA_REPAIR_LIVE=1` i `LEKTA_COMMERCE_LIVE=1`. Te varijable ne postavlja nista u lancu
// deploya (netlify.toml ima samo NODE_VERSION, DEPLOY i LEKTA_SITE_ORIGIN), pa je gate bio
// inertan tocno u stanju za koje je pisan. Zastavica govori sto je netko ZAPAMTIO; bundle
// govori sto korisnik STVARNO dobije. Mjerodavan je bundle.
//
// Namjerno se NE trazi doslovan URL: minifikat glasi
// `repairEndpoint:he.functionEndpoint(`repair-docx`)`, a ugasen endpoint je prazan literal
// (`checkoutEndpoint:``). Trazenje URL-a davalo je lazno negativno.

/** Prazan string literal u minifikatu; Rollup pise backticke, izvor moze imati ' ili ". */
export const EMPTY_LITERALS = ['``', "''", '""'];

const isEmptyLiteral = (value) => EMPTY_LITERALS.includes(String(value).trim());

/**
 * Je li `key` u bundleu dodijeljen NEPRAZNOM vrijednoscu.
 *
 * Vrijednost se cita do prvog zareza, zatvorene viticaste zagrade ili praznine, sto pokriva i
 * `key:``` (prazno) i `key:he.functionEndpoint(`x`)` (zivo).
 */
export function shippedEndpoint(js, key) {
  const match = String(js).match(new RegExp(`${key}\\s*:\\s*(\`\`|''|""|[^,}\\s]{1,120})`));
  return match ? !isEmptyLiteral(match[1]) : false;
}

/**
 * Nudi li paket ijednu placenu poveznicu.
 *
 * Bundle sadrzi DVA oblika `paymentLinks`: konfiguracijski literal
 * (`paymentLinks:{format:``,panic:``,premium:``}`) i spajanje u kodu
 * (`paymentLinks:{...Jd.paymentLinks,...}`). Samo prvi govori sto je isporuceno, pa se oblik sa
 * spreadom preskace; inace bi svaki build izgledao kao da naplata radi.
 */
export function shippedPaymentLink(js) {
  for (const match of String(js).matchAll(/paymentLinks\s*:\s*\{([^}]{0,600})\}/g)) {
    const body = match[1];
    if (body.includes('...')) continue;
    for (const pair of body.split(',')) {
      const colon = pair.indexOf(':');
      if (colon === -1) continue;
      const value = pair.slice(colon + 1).trim();
      if (value && !isEmptyLiteral(value)) return true;
    }
  }
  return false;
}

/**
 * Sto isporuceni paket omogucuje.
 *
 * `repair` znaci da dokument napusta preglednik i pohranjuje se (prag GDPR cl. 13).
 * `commerce` znaci da je korisniku ponudjeno placanje (prag ZZP predugovornih informacija).
 */
export function shippedCapabilities(jsSources) {
  const sources = Array.isArray(jsSources) ? jsSources : [jsSources];
  const repair = sources.some((js) => shippedEndpoint(js, 'repairEndpoint'));
  const checkout = sources.some((js) => shippedEndpoint(js, 'checkoutEndpoint'));
  const paymentLink = sources.some((js) => shippedPaymentLink(js));
  return {
    repair,
    commerce: checkout || paymentLink,
    why: {
      repair: repair ? 'izgradjeni bundle salje dokument na repair-docx' : null,
      commerce: checkout
        ? 'izgradjeni bundle ima checkoutEndpoint'
        : paymentLink
          ? 'izgradjeni bundle nudi payment link'
          : null,
    },
  };
}
