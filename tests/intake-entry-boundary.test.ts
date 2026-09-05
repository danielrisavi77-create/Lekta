import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectStaticGraph, staticRuntimeImports } from './helpers/module-graph';

/**
 * GRANICA CISTOG ULAZA `/` (rez naslovnice, 2026-09-05).
 *
 * `/` je samo ucitavanje dokumenta: navigacija, papir za `.docx`, traka s brojkama, podnozje, iza
 * svega prazan stol pod lampom. Sve ostalo (analizator, modali, narudzba, prijava) zivi na `/rad/`.
 * Ovaj test je TEST CUTOVERA: dokazuje da ulaz ne nosi ni skriven stari radni prostor ni prodajni
 * landing, i da mu pocetni graf uvoza ne dodiruje analizator.
 *
 * Portano s grane `feature/intake-first-live` i prilagodjeno: ondje je ulaz imao vlastiti stil i
 * ljusku, ovdje dijeli `ui-boot` i `page.css` s ostalim rutama (identitet "Korektorski stol"), pa je
 * dopusteni graf siri za tocno te module i ni za jedan drugi.
 */

const ROOT = resolve(__dirname, '..');
const ROOT_HTML = resolve(ROOT, 'index.html');
const INTAKE_MAIN = resolve(ROOT, 'src/routes/intake/main.ts');
const CONTROLLER = resolve(ROOT, 'src/routes/intake/intake-controller.ts');
const INTAKE_CSS = resolve(ROOT, 'src/routes/intake/intake.css');

const source = (path: string): string => readFileSync(path, 'utf8');

// Obilazak grafa zivi u `helpers/module-graph.ts`, jer ga dijeli i `entry-fonts`. Ondje stoji i
// biljeska o greedy `from` skupini koja je do 2026-09-05 gutala bare uvoze (5 nadjenih umjesto 19).

describe('cisti ulaz /', () => {
  it('root je mali zaseban ulaz, bez skrivenog radnog prostora i bez prodajnog landinga', () => {
    const html = source(ROOT_HTML);

    expect(statSync(ROOT_HTML).size).toBeLessThan(30_000);
    expect(html).toMatch(/src=["']\/src\/routes\/intake\/main\.ts["']/);
    expect(html).not.toContain('/src/main.ts');
    for (const id of ['intakeStage', 'intakeDropzone', 'intakeFile', 'intakeFileName', 'intakeStatus', 'intakeError', 'intakeMemoryAction', 'intakeContinue', 'intakeStats', 'paperCover']) {
      expect(html, `ulaz treba #${id}`).toContain(`id="${id}"`);
    }
    expect(html).toContain('href="/moji-radovi/"');
    expect(html).toContain('href="/saznaj-vise/#how"');
    // Sto NE smije biti tu. `#analyzer` uz `#dropzone` je tocno uvjet `hasLegacyPage`, pa bi
    // njihova prisutnost znacila da se cijeli analizator montira cim ga netko uveze.
    for (const id of ['analyzer', 'dropzone', 'analyzeBtn', 'resultCockpit', 'orderModal', 'authModal', 'checkoutConsentModal', 'pricingGrid', 'checkGrid', 'faq']) {
      expect(html, `#${id} ne pripada ulazu`).not.toContain(`id="${id}"`);
    }
    expect(html).not.toMatch(/Često postavljena pitanja|PREPORUČENO|price-card/);
  });

  it('nav i podnozje NE vode u mrtva sidra: odrediste svakog `#` sidra postoji na stranici', () => {
    // Isti kvar je vec isporucen dvaput (na /saznaj-vise/ i /moji-radovi/): navigacija doslovno
    // preuzeta s druge stranice nosi sidra koja ondje postoje a ovdje ne.
    const html = source(ROOT_HTML);
    const ids = new Set(Array.from(html.matchAll(/[\s]id="([^"]+)"/g), (m) => m[1]));
    const mrtva = Array.from(new Set(Array.from(html.matchAll(/href="#([^"]+)"/g), (m) => m[1]))).filter((h) => !ids.has(h));
    expect(mrtva).toEqual([]);
  });

  it('statusi su dostupni citacu ekrana i svi ID-jevi su jedinstveni', () => {
    const html = source(ROOT_HTML);
    expect(html).toMatch(/id="intakeStatus"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="intakeError"[^>]*role="alert"/);
    expect(html).toMatch(/id="intakeFile"[^>]*tabindex="-1"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/id="intakeDropzone"[^>]*role="button"[^>]*tabindex="0"/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prikaz i validacija limita koriste isti device-aware zajednicki izracun', () => {
    const html = source(ROOT_HTML);
    const main = source(INTAKE_MAIN);
    expect(html).toContain('data-upload-limit');
    expect(html).not.toMatch(/20\s*MB/i);
    expect(main).toContain('uploadCapBytes');
    expect(main).toMatch(/deviceMemory/);
    expect(main).toMatch(/pointer:\s*coarse/);
    expect(main).toMatch(/data-upload-limit/);
  });

  it('pocetni staticki graf NEMA analizator, profile ni repair motor', () => {
    const graph = [...collectStaticGraph(INTAKE_MAIN)].map((path) => path.replace(/\\/g, '/'));
    const forbidden = graph.filter((path) => (
      path.includes('/src/analysis/')
      || path.includes('/src/profiles/')
      || path.includes('/src/ui/app.ts')
      || path.includes('/src/routes/workspace/')
      || path.includes('/src/audits/')
      || path.includes('/src/citations/')
      || (path.includes('/src/repair/') && !path.endsWith('/src/repair/docx-budget.ts'))
      || /(?:preflight|preview|history|landing)/i.test(path)
    ));
    expect(forbidden).toEqual([]);
    expect(graph.some((path) => path.endsWith('/src/repair/docx-budget.ts'))).toBe(true);
    // Sto SMIJE: dijeljena ljuska (tema, navigacija) i prazan stol pod lampom.
    expect(graph.some((path) => path.endsWith('/src/shared/ui-boot.ts'))).toBe(true);
    expect(graph.some((path) => path.endsWith('/src/ui/hero-depth.ts'))).toBe(true);
  });

  it('intake gate ostaje dinamicki iza korisnicke akcije', () => {
    const main = source(INTAKE_MAIN);
    expect(main).toMatch(/import\(['"]\.\.\/\.\.\/docx\/intake-gate['"]\)/);
    expect(staticRuntimeImports(INTAKE_MAIN).some((path) => path.endsWith('intake-gate.ts'))).toBe(false);
  });

  it('ime datoteke nema HTML, logging ni analytics izlaz u kontroleru', () => {
    const controller = source(CONTROLLER);
    expect(controller).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    expect(controller).not.toMatch(/console\.|analytics|track\s*\(/i);
    expect(controller).toMatch(/fileName[^\n]*textContent|textContent[^\n]*file\.name/);
  });

  it('bez SPA hacka: nema fetchanja /rad/ ni brisanja skripti u istoj kartici', () => {
    // Grana je pri kvaru pohrane fetchala `/rad/`, brisala `<script>`ove i montirala radni prostor
    // u istoj kartici (memory-workspace). Plan to odbacuje; ovdje se korisniku kaze istina i nudi
    // navigacija na `/rad/`.
    expect(existsSync(resolve(ROOT, 'src/routes/intake/memory-workspace.ts'))).toBe(false);
    const controller = source(CONTROLLER);
    expect(controller).not.toMatch(/fetch\(|DOMParser/);
    expect(controller).toContain("WORKSPACE_WITHOUT_SESSION = '/rad/'");
  });

  it('nijedan UX spec ne trazi analizator na `/`: takav tok ide na `/rad/`', () => {
    // OVO JE MOJ KVAR PRETVOREN U GARD (2026-09-05). Pri rezu sam sest tokova preusmjerio s `/` na
    // `/rad/` grepom po `page.goto('/')`, i time PROMASIO dvije varijante s opcijama
    // (`page.goto('/', { waitUntil: 'domcontentloaded' })`) u `parser-parity` i `a11y-states`.
    // Oba speca su na CI-ju cekala `#fileInput` na stranici koja ga vise nema, pa je
    // `browser-matrix` pao u Firefoxu i WebKitu s istekom od 600 s. Grep po jednom obliku poziva
    // nije provjera; provjera je odnos "trazi analizator" -> "mora biti na /rad/".
    const dir = resolve(ROOT, 'tests', 'ux');
    const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
    expect(specs.length, 'prazan skup specova nije prolaz').toBeGreaterThan(3);

    const ANALIZATOR = /#fileInput|#analyzeBtn|#wizardView|#resultView|id="analyzer"|#resultCockpit/;
    const krivi: string[] = [];
    for (const spec of specs) {
      const src = source(resolve(dir, spec));
      if (!ANALIZATOR.test(src)) continue;
      // Svaka navigacija na korijen, s opcijama ili bez njih, u tom specu je kriva meta.
      for (const m of src.matchAll(/goto\(\s*['"`](\/(?:index\.html)?)['"`]/g)) {
        krivi.push(`${spec}: goto('${m[1]}')`);
      }
    }
    expect(krivi, 'spec koji trazi analizator mora ici na /rad/').toEqual([]);
  });

  it('taktilni vizual postuje reduced motion i nema beskonacne animacije ni slika', () => {
    const css = source(INTAKE_CSS);
    expect(css).toMatch(/transform/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).not.toMatch(/animation[^;{]*infinite/i);
    expect(css).not.toMatch(/url\([^)]*\.(?:png|jpe?g|webp|gif)/i);
  });
});
