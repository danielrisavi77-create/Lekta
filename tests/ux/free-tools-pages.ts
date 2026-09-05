export type FreeToolPage = {
  route: string;
  name: string;
  primarySelector: string;
  workspaceSelector?: string;
};

export const FREE_TOOL_PAGES: FreeToolPage[] = [
  // Rez naslovnice 2026-09-05: `/` je cisti ulaz, pa je primarna akcija papir za ucitavanje
  // (`#intakeDropzone`), a ne analizatorov `#dropzone`, koji je preselio na `/rad/`.
  { route: '/index.html', name: 'naslovnica proizvoda', primarySelector: '#intakeDropzone' },
  { route: '/alati.html', name: 'alati', primarySelector: '.tool-card[href="citat.html"]' },
  { route: '/citat.html', name: 'citat', primarySelector: '#copyBtn', workspaceSelector: '.tool-workspace' },
  { route: '/kartice.html', name: 'kartice', primarySelector: '#kt-copy', workspaceSelector: '.tool-workspace' },
  { route: '/naslovnica.html', name: 'naslovnica', primarySelector: '#tp-print', workspaceSelector: '.tool-workspace' },
  { route: '/literatura.html', name: 'literatura', primarySelector: '#lit-copy', workspaceSelector: '.tool-workspace' },
  { route: '/izjava.html', name: 'izjava', primarySelector: '#st-print', workspaceSelector: '.tool-workspace' },
  { route: '/citati-i-literatura.html', name: 'citatni audit', primarySelector: 'main .cta a[href="index.html#analyzer"]' },
  { route: '/landing_benchmark.html', name: 'benchmark', primarySelector: 'main .hero-actions a[href="index.html#analyzer"]' },
  { route: '/landing_usporedba.html', name: 'usporedba', primarySelector: 'main .hero-actions a[href="index.html#analyzer"]' },
];
