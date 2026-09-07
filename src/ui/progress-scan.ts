// Progres analize: POPIS FAZA, ne predstava.
//
// Do 2026-09-07 je ovdje bio i "rendgen": snop od 12 listova kroz koji putuje ravnina skena.
// Vlasnikov brif ga uklanja ("ne bih stavljao fake scanner preko cijelog viewporta"), a s njim
// su otisli i spinner, traka napretka i postotak. Ostaje ono sto korisniku govori istinu: koja
// je faza gotova, koja traje, koje jos nisu na redu.
//
// POSTENJE, jer je ovo ekran koji lako pocne lagati:
//   1. Faze idu po STVARNOM postotku iz analyze-docx.ts (osam pravih onProgress poziva), nikad
//      po tajmeru. Ako analiza stane, stane i prikaz.
//   2. Popis je doslovno taj popis poruka. `label` je bajt-identican izvoru i gard
//      (tests/progress-scan.test.ts) to usporeduje; `gotovo` je SAMO prikaz istog dogadaja u
//      proslom vremenu, pa taj ugovor ne dira.
//   3. Postotak se vise NIGDJE ne ispisuje. Motor ga daje kao pragove faza, ne kao mjeru
//      preostalog vremena, pa bi "37%" bila brojka koja tvrdi preciznost koju nema.
//   4. #progressMessage ostaje i dalje se azurira: aria-live citac govori istu recenicu, a
//      popis je aria-hidden ukras.

import './progress-scan.css';

/** Pragovi su DOSLOVNI postoci iz onProgress poziva u src/analysis/analyze-docx.ts.
 *  Ako se ondje promijene, ovdje se mora promijeniti isto (gard: tests/progress-scan.test.ts). */
/** `label` je DOSLOVAN tekst iz motora (gard ga usporeduje); `gotovo` je isti dogadaj u proslom
 *  vremenu, jer "Provjeravam oblikovanje" i "Provjereno oblikovanje" nisu ista tvrdnja. */
export interface ScanPhase { pct: number; label: string; gotovo: string }
export const SCAN_PHASES: readonly ScanPhase[] = [
  { pct: 8, label: 'Otvaram Word strukturu', gotovo: 'Otvoren Word dokument' },
  { pct: 18, label: 'Čitam stilove i odlomke', gotovo: 'Pročitani stilovi i odlomci' },
  { pct: 35, label: 'Provjeravam font, prored i margine', gotovo: 'Provjereni font, prored i margine' },
  { pct: 52, label: 'Provjeravam naslove, sadržaj i numeriranje', gotovo: 'Provjereni naslovi, sadržaj i numeriranje' },
  { pct: 68, label: 'Uspoređujem citatnice i literaturu', gotovo: 'Uspoređene citatnice i literatura' },
  { pct: 83, label: 'Provjeravam tablice, slike i poveznice', gotovo: 'Provjerene tablice, slike i poveznice' },
  { pct: 96, label: 'Izračunavam ocjenu usklađenosti', gotovo: 'Izračunata ocjena usklađenosti' },
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
  if (view.querySelector('.pscan')) return mounted;

  const root = document.createElement('div');
  root.className = 'pscan';

  // Popis je citljiv oku, ali NE i citacu: `#progressView` je vec `role=status` s `aria-live`,
  // pa bi svaka promjena stanja inace bila izgovorena sedam puta. Recenicu nosi #progressMessage.
  const list = document.createElement('ol');
  list.className = 'pscan__phases';
  list.setAttribute('aria-hidden', 'true');
  const items = SCAN_PHASES.map((phase) => {
    const li = document.createElement('li');
    li.className = 'pscan__phase';
    li.dataset.state = 'pending';
    // Dva teksta stoje u DOM-u, a CSS bira koji se vidi: prebacivanje `textContent` po fazi
    // izgubilo bi potez koji tece preko elementa i trzalo bi prijelaz.
    const sad = document.createElement('span');
    sad.className = 'pscan__sad';
    sad.textContent = phase.label;
    const bilo = document.createElement('span');
    bilo.className = 'pscan__bilo';
    bilo.textContent = phase.gotovo;
    li.append(sad, bilo);
    list.append(li);
    return li;
  });

  root.append(list);
  // Ide iza naslova, prije napomene o lokalnosti; oboje su u markupu rute.
  const sidro = view.querySelector('.pv-local');
  if (sidro) sidro.before(root); else view.append(root);
  return { root, items };
}

/** Poziva se iz progress() u app.ts uz svaki stvarni pomak analize. */
export function renderProgressScan(pct: number): void {
  const view = document.getElementById('progressView');
  if (!view) return;
  if (!mounted) mounted = mount(view);
  if (!mounted) return;
  const states = phaseStates(Number.isFinite(pct) ? pct : 0);
  mounted.items.forEach((li, i) => { li.dataset.state = states[i]; });
}
