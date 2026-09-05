import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RUTA `/rad/`: RADNA POVRSINA U CIJELOSTI, a `/` je samo ulaz.
 *
 * Do 2026-09-05 je vrijedilo obrnuto: `/` je nosio sve, a `/rad/` je bio kostur cija se kopija
 * sekcije `#analyzer` usporedjivala s izvorom u `index.html`. Rez naslovnice je to okrenuo: `/` je
 * postao cisti ulaz za dokument (bez analizatora, bez modala), a `/rad/` je jedino mjesto gdje
 * analizator zivi. Nema vise dvije kopije, pa nema ni sto usporedjivati; umjesto toga se tvrdi da
 * je podjela CISTA u oba smjera.
 *
 * TRI ZAMKE koje su izmjerene prije pisanja rute i sve tri ostaju zakljucane:
 *
 * 1. KLASIFIKACIJA. Manifest `*` NE prelazi `/`, pa korijenski `*.html` ne hvata `rad/index.html`.
 *    Bez vlastitog pravila ruta je nerazvrstana i klasifikacijski gard pada (deny-by-default).
 *
 * 2. CSP. `public/_headers` nema `unsafe-inline` za skripte, samo hasheve. Inline skripta teme
 *    mora biti BAJT-IDENTICNA onoj iz `index.html`, inace joj hash nije na popisu i preglednik
 *    je tiho ne izvrsi, pa stranica bljesne krivom temom.
 *
 * 3. ORIGIN. Canonical mora koristiti produkcijski origin koji `siteOriginHtml` pri buildu
 *    prepisuje. Tvrdo upisana domena zaobisla bi taj mehanizam; `verify-deploy-dist` to hvata,
 *    ali on NIJE u `npm run check`, pa se ovdje provjerava i ranije.
 */

const ROOT = resolve(__dirname, '..');
const RAD = readFileSync(resolve(ROOT, 'rad', 'index.html'), 'utf8');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'data', 'classification.json'), 'utf8')) as {
  rules: Array<{ pattern: string; class: string; bundle: string }>;
};

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>[\s\S]*?<\/script>/;
const PRODUCTION_ORIGIN = 'https://lektahr.netlify.app';

function eol(text: string): string {
  return text.split('\r\n').join('\n');
}

/**
 * Sve sto analizator ozicuje izvan same sekcije `#analyzer`: modali, privola, Netlify forma. Do reza
 * je zivjelo SAMO u `index.html`, pa je na `/rad/` prijava bila tihi no-op, povijest i pregled
 * bacali su TypeError, a `openCheckoutConsent` je bez modala tiho potvrdjivao odricanje od prava na
 * odustajanje. Popis je imenovan, ne prebrojan: novi modal koji zaboravi doci ovamo mora se vidjeti.
 */
const RADNA_POVRSINA_TREBA = [
  'analyzer', 'dropzone', 'fileInput', 'analyzeBtn', 'resultCockpit',
  'orderModal', 'historyModal', 'repairHistoryModal', 'reportModal', 'legalModal', 'previewModal',
  'checkoutConsentModal', 'authModal', 'guaranteeModal', 'consentBanner', 'authEntry', 'themeBtn',
  'mobileNav', 'toastWrap', 'workspace-status',
];

describe('ruta /rad/', () => {
  it('nosi CIJELU radnu povrsinu: analizator, sve modale, privolu i Netlify formu', () => {
    for (const id of RADNA_POVRSINA_TREBA) {
      expect(RAD, `#${id} mora biti na /rad/, inace ozicenje iz app.ts nema metu`).toContain(`id="${id}"`);
    }
    // Netlify skenira DEPLOYANI HTML za forme; forma koja nije ni na jednoj stranici ne postoji.
    expect(RAD).toContain('name="lekta-orders"');
    expect(RAD).toMatch(/data-netlify="true"/);
  });

  it('nema nijednu landing sekciju: one zive na /saznaj-vise/', () => {
    for (const sekcija of ['privatnost', 'trust-proof', 'video', 'how', 'podcrta', 'provjere-popis', 'pricing', 'alati-sekcija', 'faq']) {
      expect(RAD, `landing sekcija ${sekcija} ne pripada radnoj povrsini`).not.toContain(`id="${sekcija}"`);
    }
  });

  it('`/` je CISTI ULAZ: bez analizatora i bez ijednog modala', () => {
    // Ovo je drugi smjer iste podjele. Da `/` zadrzi `#analyzer` i `#dropzone`, `hasLegacyPage` bi
    // montirao cijeli analizator na ulaz cim ga netko uveze, i rez bi bio samo kozmetika.
    for (const id of ['analyzer', 'orderModal', 'authModal', 'historyModal', 'previewModal', 'checkoutConsentModal', 'resultCockpit']) {
      expect(INDEX, `#${id} ne pripada ulazu`).not.toContain(`id="${id}"`);
    }
    expect(INDEX).toContain('id="intakeDropzone"');
    expect(INDEX).toContain('src="/src/routes/intake/main.ts"');
    expect(INDEX).not.toContain('/src/main.ts');
    expect(INDEX.length, 'ulaz je izgubio cijeli analizator, pa mora biti bitno manji od radne povrsine').toBeLessThan(RAD.length / 2);
  });

  it('inline skripta teme je BAJT-IDENTICNA na obje stranice, pa joj CSP hash vrijedi', () => {
    const radScript = RAD.match(INLINE_SCRIPT)?.[0];
    const indexScript = INDEX.match(INLINE_SCRIPT)?.[0];
    expect(radScript).toBeTruthy();
    expect(eol(radScript || '')).toBe(eol(indexScript || ''));
  });

  it('svaka od dvije stranice ima tocno JEDNU inline skriptu: svaka dodatna trazi nov CSP hash', () => {
    for (const [ime, html] of [['rad', RAD], ['index', INDEX]] as const) {
      const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>/g)];
      expect(inline, ime).toHaveLength(1);
    }
  });

  it('canonical ide kroz produkcijski origin, ne kroz tvrdo upisanu domenu', () => {
    expect(RAD).toContain(`<link rel="canonical" href="${PRODUCTION_ORIGIN}/rad/">`);
    expect(INDEX).toContain(`<link rel="canonical" href="${PRODUCTION_ORIGIN}/">`);
  });

  it('klasifikacijski manifest IMA pravilo za rutu', () => {
    const rule = MANIFEST.rules.find((r) => r.pattern === 'rad/*.html');
    expect(rule, 'nedostaje pravilo rad/*.html; gard je deny-by-default').toBeTruthy();
    expect(rule).toMatchObject({ class: 'PUBLIC', bundle: 'allowed' });
  });

  it('ulaz rute je modul radnog prostora, ne stari bootstrap', () => {
    expect(RAD).toContain('src="/src/routes/workspace/main.ts"');
    expect(RAD).not.toContain('/src/main.ts');
  });

  it('RUTA IMA STIL i dijeli ga s ulazom, ne kopira', () => {
    // Izmjereno 2026-09-03: ruta je bila NESTILIZIRANA, jer je stil zivio kao inline `<style>` u
    // `index.html`. Oba ulaza sada uvoze ISTU datoteku, pa razilazenje nije moguce.
    const workspace = readFileSync(resolve(ROOT, 'src', 'routes', 'workspace', 'main.ts'), 'utf8');
    const intake = readFileSync(resolve(ROOT, 'src', 'routes', 'intake', 'main.ts'), 'utf8');
    expect(workspace, 'ruta bi bila goli HTML').toContain('shared/page.css');
    expect(intake, 'ulaz bi bio goli HTML').toContain('shared/page.css');
    for (const [ime, html] of [['rad', RAD], ['index', INDEX]] as const) {
      expect(html, `${ime}: stil se vratio u inline blok`).not.toContain('<style');
    }
  });

  it('radna povrsina razumije Katedrin dolazak i demo scenu, koje su do reza zivjele samo na /', () => {
    const workspace = readFileSync(resolve(ROOT, 'src', 'routes', 'workspace', 'main.ts'), 'utf8');
    for (const modul of ['integration/katedra-entry', 'integration/katedra-result-cta', 'ui/hero-demo', 'ui/hero-depth']) {
      expect(workspace, `${modul} je do reza uvozio samo src/main.ts`).toContain(modul);
    }
  });

  it('ima podrucje za posten status, i ono je skriveno dok nema sto reci', () => {
    expect(RAD).toMatch(/id="workspace-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  });
});
