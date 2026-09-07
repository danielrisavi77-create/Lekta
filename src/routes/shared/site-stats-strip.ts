import SITE_STATS from '../../../data/coverage/site-stats.json';

/**
 * TRAKA S BROJKAMA: signal opsega, iz PECENOG JSON-a.
 *
 * Stajala je do 2026-09-06 na ulazu `/`, gdje je konkurirala jedinoj radnji tog ekrana, pa je
 * preseljena na `/saznaj-vise/`, stranicu koja i postoji da objasni opseg.
 *
 * Brojke se NE racunaju zivo iz registra profila (194 KB) nego dolaze iz `site-stats.json`, koji
 * pece `npm run gen-site-stats`; da ne zaostanu, cuva ih `tests/site-stats.test.ts`.
 */

/** Hrvatska mnozina: 1 profil, 2 profila, 5 profila, 21 profil, 101 profil ... */
export function hrPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (b === 1 && a !== 11) return one;
  if (b >= 2 && b <= 4 && (a < 12 || a > 14)) return few;
  return many;
}

export function renderSiteStats(doc: Document, host: HTMLElement): void {
  const fmt = (n: number): string => n.toLocaleString('hr-HR');
  const items: Array<[number, string, string, string]> = [
    [SITE_STATS.profiles, 'studijski profil', 'studijska profila', 'studijskih profila'],
    [SITE_STATS.institutions, 'ustanova', 'ustanove', 'ustanova'],
    [SITE_STATS.works, 'javni rad', 'javna rada', 'javnih radova'],
  ];
  host.replaceChildren(...items.map(([n, one, few, many]) => {
    const cell = doc.createElement('span');
    const strong = doc.createElement('b');
    strong.textContent = fmt(n);
    cell.append(strong, ` ${hrPlural(n, one, few, many)}`);
    return cell;
  }));
  const note = doc.createElement('span');
  note.className = 'site-stats-note';
  note.textContent = 'pravila iz službenih izvora';
  host.append(note);
}
