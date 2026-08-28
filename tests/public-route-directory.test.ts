import { describe, expect, it } from 'vitest';
import publicRouteDirectory from '../src/routes/shared/public-route-directory.json';
import {
  isPublicRouteId,
  releasedPublicRouteGroups,
  validatePublicRouteDirectory,
} from '../src/routes/shared/public-route-directory';

const expectedDirectory = {
  groups: [
    {
      id: 'your-work', label: 'Tvoj rad',
      destinations: [
        { id: 'intake', label: 'Nova provjera', href: '/', description: 'Učitaj Word dokument i pokreni novu lokalnu provjeru.', release: 'core' },
        { id: 'my-work', label: 'Moji radovi', href: '/moji-radovi/', description: 'Otvori osobni prostor za lokalni rad i pristup računu.', release: 'core' },
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

  it('catches an accidental release of the account repairs destination', () => {
    const allRoutes = validatePublicRouteDirectory(publicRouteDirectory).flatMap((group) => group.destinations);
    const releasedIds = releasedPublicRouteGroups.flatMap((group) => group.destinations.map((destination) => destination.id));
    expect(allRoutes.find((destination) => destination.id === 'account-repairs')).toMatchObject({ release: 'personal-space' });
    expect(releasedIds).not.toContain('account-repairs');
    expect(isPublicRouteId('account-repairs')).toBe(true);
    expect(isPublicRouteId('not-a-public-route')).toBe(false);
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
