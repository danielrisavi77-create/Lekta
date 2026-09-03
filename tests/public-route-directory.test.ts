/**
 * Javni direktorij ruta: DVIJE odvojene provjere, i njihovo brkanje je bio kvar.
 *
 *  1. OBLIK putanje (`isAllowedPublicHref`): root-relative, bez cross-origin bijega, bez
 *     rezervirane rute. To je sve sto kod moze provjeriti sam iz niza.
 *  2. POSTOJANJE odredista: provjerava se ovdje, protiv stvarnog repozitorija. Manifest je stigao
 *     s pet linkova na `/saznaj-vise/` i dva na `/moji-radovi/`, a nijedna od te dvije rute na
 *     ovoj grani ne postoji. Oblik im je besprijekoran, pa ih prva provjera pusta bez rijeci.
 *     Objavljen link na nepostojecu stranicu je neistina prema korisniku, ne samo mrtav link.
 *
 * Zato se OBJAVLJUJE (`release: 'core'`) samo odrediste za koje ovaj test nadje dokaz da meta
 * postoji: korijenska HTML stranica registrirana kao Vite ulaz, slug pravnog dokumenta, ili
 * generator koji tu stazu pise i koji je ozicen u deploy lanac (netlify.toml).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import publicRouteDirectory from '../src/routes/shared/public-route-directory.json';
import {
  allPublicRouteGroups,
  isPublicRouteId,
  releasedPublicRouteGroups,
  validatePublicRouteDirectory,
} from '../src/routes/shared/public-route-directory';

// __dirname preko vitest CJS shima; happy-dom okolina kvari new URL(import.meta.url)
const ROOT = resolve(__dirname, '..');

const expectedDirectory = {
  napomena: 'Javni direktorij ruta. release=core je JEDINO sto se prikazuje; sve ostalo je zapisana namjera i filtrira se. Odrediste smije prijeci u core TEK kad ruta stvarno postoji u ovom repozitoriju (provjerava tests/public-route-directory.test.ts, sekcija postojanja).',
  groups: [
    {
      id: 'your-work', label: 'Tvoj rad',
      destinations: [
        { id: 'intake', label: 'Nova provjera', href: '/', description: 'Učitaj Word dokument i pokreni novu lokalnu provjeru.', release: 'core' },
        { id: 'my-work', label: 'Moji radovi', href: '/moji-radovi/', description: 'Otvori osobni prostor za lokalni rad i pristup računu.', release: 'personal-space' },
        { id: 'account-repairs', label: 'Prijava i spremljeni popravci', href: '/moji-radovi/#racun', description: 'Prijavi se i upravljaj popravcima spremljenima na računu.', release: 'personal-space' },
      ],
    },
    {
      id: 'rules-trust', label: 'Pravila i povjerenje',
      destinations: [
        { id: 'learn-more', label: 'Kako radi', href: '/saznaj-vise/#how', description: 'Pogledaj tijek provjere i granice lokalne obrade.', release: 'core' },
        { id: 'checks', label: 'Što se provjerava', href: '/saznaj-vise/#checks', description: 'Saznaj koje dijelove forme Lekta može provjeriti.', release: 'core' },
        { id: 'trust-proof', label: 'Metodologija i dokazi', href: '/saznaj-vise/#trust-proof', description: 'Pogledaj kako nastaju pravila, mjerenja i dokazi.', release: 'core' },
        { id: 'faculty-rules', label: 'Pravila po fakultetu', href: '/fakulteti/', description: 'Pronađi dostupna pravila za fakultet i vrstu rada.', release: 'core' },
        { id: 'coverage', label: 'Pokrivenost profila', href: '/pokrivenost.html', description: 'Provjeri status pokrivenosti dostupnih profila.', release: 'core' },
        { id: 'document-processing', label: 'Privatnost obrade', href: '/obrada-dokumenata.html', description: 'Saznaj što ostaje lokalno, a kada dokument ide na server.', release: 'core' },
      ],
    },
    {
      id: 'free-tools', label: 'Besplatni alati',
      destinations: [
        { id: 'tools', label: 'Svi alati', href: '/alati.html', description: 'Otvori sve besplatne alate za pripremu akademskog rada.', release: 'core' },
        { id: 'citation-generator', label: 'Citat generator', href: '/citat.html', description: 'Složi citat prema odabranom stilu i vrsti izvora.', release: 'core' },
        { id: 'citation-literature-check', label: 'Provjera citata i literature', href: '/citati-i-literatura.html', description: 'Usporedi citate u tekstu s popisom literature.', release: 'core' },
        { id: 'card-counter', label: 'Brojač kartica', href: '/kartice.html', description: 'Izračunaj kartice iz broja znakova ili riječi.', release: 'core' },
        { id: 'title-page', label: 'Naslovnica', href: '/naslovnica.html', description: 'Pripremi naslovnicu prema dostupnim podacima i predlošcima.', release: 'core' },
        { id: 'literature', label: 'Literatura', href: '/literatura.html', description: 'Uredi i provjeri bibliografske zapise.', release: 'core' },
        { id: 'originality-statement', label: 'Izjava o izvornosti', href: '/izjava.html', description: 'Pripremi izjavu o izvornosti bez slanja podataka.', release: 'core' },
      ],
    },
    {
      id: 'proof-help', label: 'Dokazi i pomoć',
      destinations: [
        { id: 'comparison', label: 'Usporedba', href: '/landing_usporedba.html', description: 'Usporedi Lektu s drugim načinima provjere rada.', release: 'core' },
        { id: 'benchmark', label: 'Benchmark', href: '/landing_benchmark.html', description: 'Pogledaj mjerljive rezultate javnog benchmarka.', release: 'core' },
        { id: 'pricing', label: 'Paketi', href: '/saznaj-vise/#pricing', description: 'Pregledaj dostupne pakete i što svaki uključuje.', release: 'core' },
        { id: 'faq', label: 'Česta pitanja', href: '/saznaj-vise/#faq', description: 'Pronađi kratke odgovore na česta pitanja.', release: 'core' },
        { id: 'guarantee', label: 'Garancija', href: '/garancija.html', description: 'Pročitaj uvjete garancije i granice pokrivenosti.', release: 'core' },
        { id: 'terms-refund', label: 'Uvjeti i povrat', href: '/uvjeti-koristenja.html', description: 'Pročitaj uvjete korištenja, otkaza i povrata.', release: 'core' },
      ],
    },
  ],
} as const;

function allDestinations(directory: typeof expectedDirectory) {
  return directory.groups.flatMap((group) => group.destinations);
}

describe('public route directory', () => {
  it('catches a reordered, duplicated, or stale public navigation record', () => {
    const groups = validatePublicRouteDirectory(publicRouteDirectory);
    const destinations = allDestinations(expectedDirectory);
    expect(publicRouteDirectory).toEqual(expectedDirectory);
    expect(groups.map((group) => group.id)).toEqual(['your-work', 'rules-trust', 'free-tools', 'proof-help']);
    expect(new Set(destinations.map((destination) => destination.id)).size).toBe(destinations.length);
    expect(destinations.every((destination) => destination.label.trim().length > 0)).toBe(true);
    expect(destinations.every((destination) => destination.href.startsWith('/'))).toBe(true);
    expect(destinations.every((destination) => !destination.href.startsWith('/#'))).toBe(true);
    expect(destinations.every((destination) => !/\/(admin|verification|qa)(?:\/|$)/.test(destination.href))).toBe(true);
  });

  it('catches an accidental release of a destination whose route does not exist yet', () => {
    const allRoutes = allPublicRouteGroups.flatMap((group) => group.destinations);
    const releasedIds = releasedPublicRouteGroups.flatMap((group) => group.destinations.map((destination) => destination.id));

    // Popis je PRIKOVAN: prelazak u `core` mora biti svjesna izmjena ovog testa, uz stvarnu rutu.
    // 2026-09-03: pet odredista (learn-more, checks, trust-proof, pricing, faq) preslo je u `core`,
    // jer je ruta `/saznaj-vise/` stvarno nastala i sekcije su na njoj. Ostaju samo ona koja jos
    // nemaju rutu.
    expect(allRoutes.filter((destination) => destination.release !== 'core').map((destination) => destination.id)).toEqual([
      'my-work',
      'account-repairs',
    ]);
    for (const id of ['my-work', 'account-repairs']) {
      expect(releasedIds, id).not.toContain(id);
      expect(isPublicRouteId(id), id).toBe(true);
    }
    expect(isPublicRouteId('not-a-public-route')).toBe(false);
    expect(releasedPublicRouteGroups.map((group) => group.id)).toEqual(['your-work', 'rules-trust', 'free-tools', 'proof-help']);
  });

  it('catches a malformed manifest before it can publish an unknown group, release, duplicate ID, blank label, or non-root href', () => {
    const invalidDirectories: readonly unknown[] = [
      { groups: [{ id: 'unknown', label: 'Nepoznata', destinations: [] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/', description: 'Opis', release: 'preview' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/', description: 'Opis', release: 'core' }, { id: 'intake', label: 'Druga provjera', href: '/drugo/', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: '', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: 'https://lekta.hr/', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '//host/path', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/#stari-fragment', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/admin', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/admin.html', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/verification', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/verification.html', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/qa', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/qa.html', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/admin?x', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/admin#x', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/verification?x', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/verification#x', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/qa?x', description: 'Opis', release: 'core' }] }] },
      { groups: [{ id: 'your-work', label: 'Tvoj rad', destinations: [{ id: 'intake', label: 'Nova provjera', href: '/qa#x', description: 'Opis', release: 'core' }] }] },
    ];
    for (const invalidDirectory of invalidDirectories) {
      expect(() => validatePublicRouteDirectory(invalidDirectory)).toThrow(Error);
    }
  });

  it('odbija root-looking putanje koje URL parser moze pretvoriti u cross-origin ili rezerviranu rutu', () => {
    // Mutations caught: backslash authority escape, stripped controls, whitespace, and encoded reserved paths.
    const unsafeHrefs = [
      '/\\evil.example',
      '/folder\\child',
      '/\n/evil.example',
      '/\r/evil.example',
      '/\t/evil.example',
      '/safe path',
      '/safe\u00a0path',
      '/%61dmin',
      '/%76erification',
      '/%71a',
    ] as const;

    for (const href of unsafeHrefs) {
      expect(() => validatePublicRouteDirectory({
        groups: [{
          id: 'your-work',
          label: 'Tvoj rad',
          destinations: [{ id: 'intake', label: 'Nova provjera', href, description: 'Opis', release: 'core' }],
        }],
      }), href).toThrow(Error);
    }
  });

  it('allows nonreserved paths that only share a reserved prefix', () => {
    for (const href of ['/administrator', '/quality']) {
      expect(() => validatePublicRouteDirectory({
        groups: [{
          id: 'your-work',
          label: 'Tvoj rad',
          destinations: [{ id: 'intake', label: 'Nova provjera', href, description: 'Opis', release: 'core' }],
        }],
      })).not.toThrow();
    }
  });
});

/**
 * POSTOJANJE ODREDISTA (a ne samo oblik putanje).
 *
 * Dokaz je jedan od tri, i svaki se cita iz repozitorija, ne iz popisa u ovom testu:
 *  - korijenska HTML stranica koja je registrirana kao Vite ulaz (bez ulaza nikad ne stigne u dist),
 *  - slug pravnog dokumenta iz src/legal/legal-content.ts (pise ga generate-legal-pages),
 *  - generator koji stazu pise I koji je ozicen u deploy lanac u netlify.toml.
 */
const viteConfig = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');
const netlifyToml = readFileSync(resolve(ROOT, 'netlify.toml'), 'utf8');

/**
 * Deploy lanac se cita iz PARSIRANE `command = "..."` naredbe, ne iz cijele datoteke.
 *
 * Prvo izdanje ovog testa radilo je `netlifyToml.includes('generate-coverage-page')`, a to ime
 * stoji i u KOMENTARU iznad naredbe (netlify.toml, redci 14 i 17). Adversarijalni prolaz je zato
 * obrisao `generate-coverage-page` i `generate-faculty-pages` iz STVARNE build naredbe, i test je
 * prosao 9/9 zelen dok se `/pokrivenost.html` i `/fakulteti/` vise ne bi ni pisali. Komentar koji
 * spominje generator nije dokaz da se generator izvodi.
 *
 * Obrazac je usidren na POCETAK retka, pa zakomentirana naredba (`# command = ...`) ne ulazi u
 * lanac, a trazi se token `npm run <ime>`, ne puko spominjanje imena.
 */
function parseDeployCommands(toml: string): readonly string[] {
  const assignment = new RegExp('^[ \\t]*command[ \\t]*=[ \\t]*"([^"]*)"', 'gm');
  return [...toml.matchAll(assignment)].map((match) => match[1]);
}

const netlifyBuildCommands = parseDeployCommands(netlifyToml);

function runsInDeployChain(npmScript: string): boolean {
  return netlifyBuildCommands.some((command) => command.includes(`npm run ${npmScript}`));
}

const legalContent = readFileSync(resolve(ROOT, 'src/legal/legal-content.ts'), 'utf8');

const rootHtmlFiles = new Set(readdirSync(ROOT).filter((name) => name.endsWith('.html')));
const legalSlugs = new Set([...legalContent.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]));

/** Staze koje ne postoje kao datoteka nego ih pri buildu pise generator iz deploy lanca. */
const GENERATED_ROUTES: Readonly<Record<string, { readonly script: string; readonly writes: string; readonly npmScript: string }>> = {
  '/fakulteti/': {
    script: 'scripts/generate-faculty-pages.mjs',
    writes: "path.join(OUT_DIR, 'fakulteti')",
    npmScript: 'generate-faculty-pages',
  },
  '/pokrivenost.html': {
    script: 'scripts/generate-coverage-page.mjs',
    writes: "'pokrivenost.html'",
    npmScript: 'generate-coverage-page',
  },
};

type RouteEvidence = { readonly kind: string; readonly detail: string };

function routeEvidence(href: string): RouteEvidence | null {
  const parsed = new URL(href, 'https://route-directory.invalid');
  const pathname = decodeURIComponent(parsed.pathname);

  const generated = GENERATED_ROUTES[pathname];
  if (generated) {
    const source = readFileSync(resolve(ROOT, generated.script), 'utf8');
    if (!source.includes(generated.writes)) return null;
    if (!runsInDeployChain(generated.npmScript)) return null;
    return { kind: 'generator', detail: `${generated.script} (deploy lanac: ${generated.npmScript})` };
  }

  const fileName = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (rootHtmlFiles.has(fileName)) {
    if (!viteConfig.includes(`'${fileName}'`)) return null;
    return { kind: 'vite-ulaz', detail: fileName };
  }

  // Ruta u PODDIREKTORIJU (`/saznaj-vise/` -> `saznaj-vise/index.html`). Do 2026-09-03 su sve
  // rute bile u korijenu, pa je razrjesivac takvu prijavljivao kao nepostojecu i odrediste je
  // ostajalo neobjavljeno iako ruta postoji. Dokaz je isti kao za korijenske: datoteka postoji I
  // stoji kao ulaz u `vite.config.ts`. Datoteka bez ulaza se ne gradi, pa ne bi bila objavljena.
  if (pathname.endsWith('/') && pathname.length > 1) {
    const dir = pathname.slice(1, -1);
    const nested = `${dir}/index.html`;
    // Ulaz se u `vite.config.ts` moze zapisati kao jedan niz ili kao odvojeni segmenti
    // (`resolve(__dirname, 'saznaj-vise', 'index.html')`). Trazi se OBOJE: provjera koja poznaje
    // samo jedan oblik javlja da postojeca ruta ne postoji, sto je gore od nikakve provjere.
    const declared = viteConfig.includes(`'${nested}'`) || viteConfig.includes(`'${dir}', 'index.html'`);
    if (existsSync(resolve(ROOT, nested)) && declared) {
      return { kind: 'vite-ulaz', detail: nested };
    }
  }

  const slug = fileName.endsWith('.html') ? fileName.slice(0, -'.html'.length) : null;
  if (slug !== null && legalSlugs.has(slug)) {
    if (!runsInDeployChain('generate-legal-pages')) return null;
    return { kind: 'pravni-dokument', detail: `src/legal/legal-content.ts slug '${slug}'` };
  }

  return null;
}

function fragmentOf(href: string): string {
  return new URL(href, 'https://route-directory.invalid').hash.replace(/^#/, '');
}

describe('public route directory: postojanje odredista', () => {
  it('svako OBJAVLJENO odrediste ima dokaz da meta stvarno postoji u ovom repozitoriju', () => {
    const released = releasedPublicRouteGroups.flatMap((group) => group.destinations);
    const missing = released.filter((destination) => routeEvidence(destination.href) === null)
      .map((destination) => `${destination.id} -> ${destination.href}`);

    // Prazan skup bi "prosao" bez ijedne provjere; broj objavljenih odredista se tvrdi izrijekom.
    // 15 -> 20 (2026-09-03): pet odredista `/saznaj-vise/#...` je objavljeno jer ruta postoji.
    expect(released.length).toBe(20);
    expect(missing, `objavljena odredista bez dokaza o postojanju: ${missing.join(', ')}`).toEqual([]);
  });

  it('objavljeno odrediste s fragmentom mora imati to sidro u ciljnoj stranici', () => {
    const broken: string[] = [];
    for (const destination of releasedPublicRouteGroups.flatMap((group) => group.destinations)) {
      const fragment = fragmentOf(destination.href);
      if (!fragment) continue;
      const evidence = routeEvidence(destination.href);
      if (evidence?.kind !== 'vite-ulaz') continue;
      const html = readFileSync(resolve(ROOT, evidence.detail), 'utf8');
      if (!html.includes(`id="${fragment}"`)) broken.push(`${destination.id} -> ${destination.href}`);
    }
    expect(broken, `objavljeni fragmenti bez sidra: ${broken.join(', ')}`).toEqual([]);
  });

  it('NEOBJAVLJENA odredista: ruta ne postoji, i to je jedini razlog zasto se ne prikazuju', () => {
    // Ovo je obrazlozenje presude, ne ukras.
    //
    // PROMJENA 2026-09-03: `/saznaj-vise/` je do tada bila zapisana namjera, a sekcije su zivjele
    // na naslovnici. Sada ruta POSTOJI i sekcije su na njoj, pa je pet odredista preslo u `core`,
    // tocno po uputi koju direktorij sam nosi. `/moji-radovi/` je jos namjera i ostaje primjer.
    for (const anchor of ['how', 'checks', 'trust-proof', 'pricing', 'faq']) {
      const hub = readFileSync(resolve(ROOT, 'saznaj-vise', 'index.html'), 'utf8');
      expect(hub.includes(`id="${anchor}"`), `/saznaj-vise/ nema sidro #${anchor}`).toBe(true);
    }
    for (const href of ['/moji-radovi/']) {
      expect(routeEvidence(href), `ruta ${href} je u medjuvremenu nastala; prebaci odredista u core`).toBeNull();
    }

    const unreleased = allPublicRouteGroups
      .flatMap((group) => group.destinations)
      .filter((destination) => destination.release !== 'core');
    expect(unreleased.every((destination) => routeEvidence(destination.href) === null)).toBe(true);
  });

  it('deploy lanac se cita iz naredbe, a KOMENTAR koji spominje generator nije dokaz', () => {
    // BASELINE: nemutirana netlify konfiguracija stvarno vrti oba generatora.
    expect(netlifyBuildCommands.length).toBeGreaterThan(0);
    for (const npmScript of ['generate-legal-pages', 'generate-coverage-page', 'generate-faculty-pages']) {
      expect(runsInDeployChain(npmScript), npmScript).toBe(true);
    }
    expect(runsInDeployChain('generate-nepostojeci-skript')).toBe(false);

    // MUTACIJA (sinteticka): ime stoji SAMO u komentaru, a naredba ga vise ne izvodi.
    const commentOnly = [
      '[build]',
      '  # generate-coverage-page: javna coverage matrica',
      '  # command = "npm run build && npm run generate-coverage-page"',
      '  command = "npm run build && npm run generate-legal-pages"',
    ].join('\n');
    const chain = parseDeployCommands(commentOnly);
    expect(chain).toEqual(['npm run build && npm run generate-legal-pages']);
    expect(commentOnly.includes('generate-coverage-page'), 'ime JEST u datoteci').toBe(true);
    expect(chain.some((command) => command.includes('npm run generate-coverage-page')), 'ali NIJE u lancu').toBe(false);
  });

  it('negativna kontrola: dokaz o postojanju NE prolazi za izmisljenu stazu', () => {
    for (const href of ['/nepostojeca-stranica.html', '/nepostojeca-ruta/', '/alati.htm']) {
      expect(routeEvidence(href), href).toBeNull();
    }
    // ...a prolazi za stazu koja stvarno postoji, pa provjera nije uvijek-null.
    expect(routeEvidence('/alati.html')).toEqual({ kind: 'vite-ulaz', detail: 'alati.html' });
    expect(routeEvidence('/garancija.html')?.kind).toBe('pravni-dokument');
    expect(routeEvidence('/pokrivenost.html')?.kind).toBe('generator');
  });
});
