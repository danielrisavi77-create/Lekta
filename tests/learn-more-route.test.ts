import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RUTA `/saznaj-vise/`: landing sadrzaj bez analizatora.
 *
 * Stranicu cini devet sekcija, a samo DVIJE trebaju JS (`#checkGrid`, `#pricingGrid`). Cijela je
 * poanta rute da za te dvije ne uvozi `src/ui/app.ts`: izmjereno pri uvodjenju, da bi ozicenje
 * analizatora radilo na stranici bez radne povrsine, trebalo bi ograditi 154 pristupa DOM-u kroz
 * 39 funkcija. Namjenski ulaz ne treba nijedan.
 *
 * PRIJE OVE RUTE landing sadrzaj je zivio samo u `index.html`, pa je `/` moralo nositi sve.
 */

const ROOT = resolve(__dirname, '..');
const STRANICA = readFileSync(resolve(ROOT, 'saznaj-vise', 'index.html'), 'utf8');
const ULAZ = readFileSync(resolve(ROOT, 'src', 'routes', 'learn-more', 'main.ts'), 'utf8');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const APP = readFileSync(resolve(ROOT, 'src', 'ui', 'app.ts'), 'utf8');

const SEKCIJE = ['privatnost', 'trust-proof', 'video', 'how', 'podcrta', 'provjere-popis', 'pricing', 'alati-sekcija', 'faq'];

describe('ruta /saznaj-vise/', () => {
  it('nosi SVIH devet landing sekcija', () => {
    // Nepotpuna selidba je najtisi kvar ovog koraka: sadrzaj nestane s `/`, a na novoj ruti ga
    // nema, pa se gubitak vidi tek kad ga netko potrazi.
    for (const s of SEKCIJE) expect(STRANICA, `sekcija ${s}`).toContain(`id="${s}"`);
  });

  it('NE uvozi analizator, jer bi time povukla cijeli graf', () => {
    expect(ULAZ).not.toMatch(/from '.*ui\/app'/);
    expect(STRANICA).not.toContain('/src/main.ts');
    expect(STRANICA).toContain('/src/routes/learn-more/main.ts');
  });

  it('nema radnu povrsinu: analizator pripada `/rad/`', () => {
    for (const id of ['analyzer', 'dropzone', 'analyzeBtn']) {
      expect(STRANICA, `${id} ne pripada ovoj ruti`).not.toContain(`id="${id}"`);
    }
  });

  it('ulaz PUNI obje dinamicke mreze', () => {
    // Ruta koja se ucita a mreze ostavi prazne izgleda kao pokvarena stranica, a nijedan test
    // koji gleda samo HTML to ne vidi: `#checkGrid` je u HTML-u prazan i tako i treba biti.
    expect(ULAZ).toContain('CHECK_ITEMS');
    expect(ULAZ).toContain('PRICING_TIERS');
    for (const id of ['checkGrid', 'pricingGrid']) {
      expect(STRANICA, `${id} mora postojati da ga ulaz ima gdje puniti`).toContain(`id="${id}"`);
    }
  });

  it('cjenik postuje ZIVOST ponude, ne prikazuje je bezuvjetno', () => {
    // Kriv odgovor ovdje znaci ponuditi naplatu koja ne radi.
    //
    // Prva izvedba je tvrdila samo `ULAZ.toContain('paidOffersLive')`, sto je mjerilo UVOZ a ne
    // UPOTREBU: mutacija koja poziv zamijeni s `true` ostavlja ime u uvoznom retku i prolazi.
    // Prikiva se poziv, i to onaj koji rezultat prosljedjuje prikazu.
    expect(ULAZ).toMatch(/renderPricing\([^,]+,\s*paidOffersLive\(/);
    expect(ULAZ).toContain('Uskoro');
  });

  it('inline skripta teme je BAJT-IDENTICNA, pa joj CSP hash vrijedi', () => {
    const re = /<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>[\s\S]*?<\/script>/;
    const eol = (t: string) => t.split('\r\n').join('\n');
    expect(eol(STRANICA.match(re)?.[0] ?? '')).toBe(eol(INDEX.match(re)?.[0] ?? ''));
  });

  it('NIJEDNO sidro nije mrtvo: odrediste postoji NA TOJ stranici', () => {
    // Ovo je nalaz, ne pretpostavka. Prva izvedba rute isporucila je PET mrtvih sidara
    // (cetiri `#analyzer`, jedan `#top`): tekst je doslovno preuzet s `/`, gdje ta odredista
    // postoje, a ovdje po konstrukciji ne postoje, jer ruta NEMA radnu povrsinu.
    //
    // Tvrdnja o devet sekcija je pritom bila zelena. Selidba je bila potpuna, a stranica ipak
    // pokvarena: cetiri glavna poziva na akciju nisu radila nista. Zato se sidro provjerava
    // POSTOJANJEM ODREDISTA, nikad oblikom; oblik je tocan i kod mrtve poveznice.
    const ids = new Set(Array.from(STRANICA.matchAll(/[\s]id="([^"]+)"/g), (m) => m[1]));
    const mrtva = Array.from(new Set(Array.from(STRANICA.matchAll(/href="#([^"]+)"/g), (m) => m[1])))
      .filter((h) => !ids.has(h));
    expect(mrtva, 'sidro bez odredista na ovoj stranici').toEqual([]);
  });

  it('sidra koja vode na alat idu na `/`, jer alat ovdje ne zivi', () => {
    expect(STRANICA).toContain('href="/#analyzer"');
    expect(STRANICA).not.toMatch(/href="#analyzer"/);
  });

  it('nosi i ZAVRSNI poziv na akciju, koji popis imena ne moze vidjeti', () => {
    // Deseta sekcija landinga NEMA `id`, pa je popis od devet imena po konstrukciji promasuje.
    // Zamalo je ostala na `/` i nestala pri rezanju: sadrzaj bez imena nema tko prijaviti.
    expect(STRANICA).toContain('ks-final');
  });

  it('canonical ide kroz produkcijski origin', () => {
    expect(STRANICA).toContain('<link rel="canonical" href="https://lektahr.netlify.app/saznaj-vise/">');
  });

  it('cjenik i popis provjera imaju TOCNO JEDNOG vlasnika', () => {
    // Prva izvedba je trazila da oba prikaza budu ista, jer su postojale dvije kopije. Kopije vise
    // nema: `/` je ostalo bez tih sekcija, pa je crtanje u `app.ts` postalo mrtav kod i uklonjeno.
    // Jedan vlasnik je jaca tvrdnja od dvije uskladjene kopije, jer se razilazenje ne moze dogoditi.
    for (const marker of ['price-card', 'popular soon', 'features']) {
      expect(ULAZ, marker).toContain(marker);
    }
    expect(APP, 'analizator vise ne crta cjenik').not.toContain("ctl('#pricingGrid')");
    expect(APP, 'analizator vise ne crta popis provjera').not.toContain("ctl('#checkGrid')");
  });
});
