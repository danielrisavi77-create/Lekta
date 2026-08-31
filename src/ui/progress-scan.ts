// Progres analize: RENDGEN DOKUMENTA.
//
// Zamjenjuje genericki spinner snopom listova kroz koji putuje ravnina skena. Isti jezik
// svjetla kao hero (lampa grije papir, plavi snop cita), pa se ulaz i rad citaju kao jedan
// proizvod, a ne kao dvije stranice.
//
// POSTENJE, jer je ovo ekran koji lako pocne lagati:
//   1. Ravnina i faze idu po STVARNOM postotku iz analyze-docx.ts (osam pravih onProgress
//      poziva), nikad po tajmeru. Ako analiza stane, stane i prikaz. To je tocno.
//   2. Popis faza je doslovno taj popis poruka, ne izmisljen marketinski niz.
//   3. Broj listova u snopu je GRAFIKA. Broj stranica rada u ovom trenutku jos nije poznat
//      (ni sama analiza ga nema do kraja), pa se nigdje ne ispisuje niti implicira.
//   4. #progressMessage ostaje netaknut i dalje se azurira: aria-live citac i dalje govori
//      istu recenicu, snop je aria-hidden ukras.

import './progress-scan.css';

const SHEETS = 12;

/** Pragovi su DOSLOVNI postoci iz onProgress poziva u src/analysis/analyze-docx.ts.
 *  Ako se ondje promijene, ovdje se mora promijeniti isto (gard: tests/progress-scan.test.ts). */
export interface ScanPhase { pct: number; label: string }
export const SCAN_PHASES: readonly ScanPhase[] = [
  { pct: 8, label: 'Otvaram Word strukturu' },
  { pct: 18, label: 'Čitam stilove i odlomke' },
  { pct: 35, label: 'Provjeravam font, prored i margine' },
  { pct: 52, label: 'Provjeravam naslove, sadržaj i numeriranje' },
  { pct: 68, label: 'Uspoređujem citatnice i literaturu' },
  { pct: 83, label: 'Provjeravam tablice, slike i poveznice' },
  { pct: 96, label: 'Izračunavam ocjenu usklađenosti' },
];

export type PhaseState = 'done' | 'active' | 'pending';

/**
 * Stanje svake faze za dani postotak. CISTA funkcija, bez DOM-a, da se moze mjeriti.
 * Aktivna je ZADNJA faza ciji je prag dosegnut; sve prije nje su gotove. Na 100% nema
 * aktivne faze, sve su gotove: analiza je zavrsila i prikaz to ne smije prikazivati kao rad
 * koji jos traje.
 */
export function phaseStates(pct: number, phases: readonly ScanPhase[] = SCAN_PHASES): PhaseState[] {
  const value = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  let activeIndex = -1;
  for (let i = 0; i < phases.length; i += 1) if (value >= phases[i].pct) activeIndex = i;
  return phases.map((_, i) => {
    if (value >= 100 || i < activeIndex) return 'done';
    if (i === activeIndex) return 'active';
    return 'pending';
  });
}

let mounted: { root: HTMLElement; items: HTMLElement[] } | null = null;

function mount(view: HTMLElement): { root: HTMLElement; items: HTMLElement[] } | null {
  const existing = view.querySelector<HTMLElement>('.pscan');
  if (existing) return mounted;

  const root = document.createElement('div');
  root.className = 'pscan';

  const stage = document.createElement('div');
  stage.className = 'pscan__stage';
  stage.setAttribute('aria-hidden', 'true');
  const stack = document.createElement('div');
  stack.className = 'pscan__stack';
  for (let i = 0; i < SHEETS; i += 1) {
    const sheet = document.createElement('i');
    sheet.className = i === SHEETS - 1 ? 'pscan__sheet pscan__sheet--top' : 'pscan__sheet';
    sheet.style.setProperty('--i', String(i));
    stack.append(sheet);
  }
  const plane = document.createElement('i');
  plane.className = 'pscan__plane';
  stack.append(plane);
  stage.append(stack);

  // Popis faza je citljiv i pomocnoj tehnologiji, ali ga ne duplicira aria-live:
  // #progressView je vec role=status, pa bi svaka promjena stanja inace bila izgovorena.
  const list = document.createElement('ol');
  list.className = 'pscan__phases';
  list.setAttribute('aria-hidden', 'true');
  const items = SCAN_PHASES.map((phase) => {
    const li = document.createElement('li');
    li.className = 'pscan__phase';
    li.dataset.state = 'pending';
    li.textContent = phase.label;
    list.append(li);
    return li;
  });

  root.append(stage, list);
  // Ubaci iznad trake postotka, ispod naslova i poruke.
  const track = view.querySelector('.progress-track');
  if (track) track.before(root); else view.append(root);
  view.dataset.scan = '';
  return { root, items };
}

/** Poziva se iz progress() u app.ts uz svaki stvarni pomak analize. */
export function renderProgressScan(pct: number): void {
  const view = document.getElementById('progressView');
  if (!view) return;
  if (!mounted) mounted = mount(view);
  if (!mounted) return;
  const value = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  mounted.root.style.setProperty('--pscan-pct', String(value));
  const states = phaseStates(value);
  mounted.items.forEach((li, i) => { li.dataset.state = states[i]; });
}
