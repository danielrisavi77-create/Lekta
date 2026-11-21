// LIST PROFILA. Isti put kao ostali modali (`trapModal`/`releaseModal`): zamka fokusa, inertna
// pozadina, povratak fokusa na okidac. Do 2026-09-07 su se kontrole samo OTKRIVALE na mjestu
// klasom `lek-izmjena`, pa nije bilo ni zamke fokusa ni izlaza tipkovnicom, a Tab je nastavljao
// u sadrzaj iza njih. Okidac u zajednickoj navigaciji (`data-site-chrome-profile`) nosi
// `aria-expanded` uskladjen sa stanjem lista.
//
// Izdvojeno iz src/ui/app.ts (2026-11-21) jer app.ts ima ratchet velicine
// (tests/ui-module-budget.test.ts): nova logika ide u zaseban modul, ne u app.ts.
import { trapModal, releaseModal } from './modal-utils';

const profileTrigger = (): Element | null => document.querySelector('[data-site-chrome-profile]');

function setProfileSheet(open: boolean): void {
  const sheet = document.querySelector<HTMLElement>('#profileSheet');
  profileTrigger()?.setAttribute('aria-expanded', String(open));
  sheet?.classList.toggle('hidden', !open);
  if (open) trapModal(sheet);
  else releaseModal(sheet);
}

export function openProfileSheet(): void {
  setProfileSheet(true);
}

export function closeProfileSheet(): void {
  setProfileSheet(false);
}

/** Spaja okidac lista profila iz zajednicke navigacije; poziva se jednom pri pokretanju app.ts. */
export function wireProfileTrigger(): void {
  profileTrigger()?.addEventListener('click', openProfileSheet);
}
