/**
 * PRIKAZ OPORAVKA NAKON GRESKE POPRAVKA (plan T10). Odluku donosi `recoveryFor` (`src/repair/recovery-policy.ts`);
 * ovdje se ona prevodi u DOM: poruka, gumb za provjeru postojeceg posla i gumb za ponovni pokusaj koji je za
 * `check-existing-job` ONEMOGUCEN dok korisnik ne otvori "Moje popravke". Time se nepoznat ishod nakon slanja ne
 * moze slijepo ponoviti kao drugi naplativi posao.
 */
import type { RepairRecovery } from '../repair/recovery-policy';

export interface RecoveryHooks {
  retry: () => void;
  /** Postojeci mehanizam pregleda poslova (`openRepairHistory`); `null` kad nije dostupan (bez prijave). */
  openJobs: (() => void) | null;
  /** Ponovna prijava (`openAuth`), za `reauth`. */
  reauth?: () => void;
}

export function renderRepairRecovery(el: HTMLElement, recovery: RepairRecovery, hooks: RecoveryHooks, esc: (v: string) => string): void {
  el.hidden = false;
  const provjera = recovery.action === 'check-existing-job'
    ? `<button type="button" class="btn btn-secondary btn-sm" data-repair-check-jobs>Provjeri Moje popravke</button>`
    : '';
  const prijava = recovery.action === 'reauth' && hooks.reauth
    ? `<button type="button" class="btn btn-secondary btn-sm" data-repair-reauth>Prijavi se ponovno</button>`
    : '';
  const ponovi = recovery.action === 'none' || recovery.action === 'refresh-consent'
    ? ''
    : `<button type="button" class="btn btn-primary btn-sm" data-repair-retry${recovery.retryAllowed ? '' : ' disabled'}>Pokušaj ponovno</button>`;
  el.innerHTML = `<div class="lekta-repair-panel__recovery" data-testid="repair-recovery" data-repair-recovery="${esc(recovery.action)}"><p><strong>${esc(recovery.message)}</strong></p><p>${provjera}${prijava}${ponovi}</p>${recovery.action === 'check-existing-job' ? '<p class="muted">Ponovni pokušaj se otključava tek nakon provjere, da se isti popravak ne naplati dvaput.</p>' : ''}</div>`;
  const retryBtn = el.querySelector<HTMLButtonElement>('[data-repair-retry]');
  const jobsBtn = el.querySelector<HTMLButtonElement>('[data-repair-check-jobs]');
  const reauthBtn = el.querySelector<HTMLButtonElement>('[data-repair-reauth]');
  if (jobsBtn) {
    jobsBtn.onclick = () => {
      hooks.openJobs?.();
      // Provjera je otvorena: tek sada je ponovni pokusaj svjesna odluka, ne refleks.
      if (retryBtn) retryBtn.disabled = false;
    };
    if (!hooks.openJobs) {
      // Bez prijave e-mailom popis poslova ne postoji, pa provjera nije moguca. Slijepa ulica bi bila gora od rizika:
      // ponovni pokusaj se dopusta, ali uz izricitu napomenu da prvi popravak mozda JEST dovrsen.
      jobsBtn.disabled = true;
      jobsBtn.title = 'Pregled poslova nije dostupan bez prijave e-mailom.';
      if (retryBtn) retryBtn.disabled = false;
      const napomena = el.ownerDocument.createElement('p');
      napomena.className = 'muted';
      napomena.dataset.repairRecoveryNote = 'no-jobs';
      napomena.textContent = 'Bez prijave e-mailom ne možemo provjeriti je li prvi popravak dovršen. Ako pokušaš ponovno, moguće je da već postoji dovršena kopija.';
      el.firstElementChild?.appendChild(napomena);
    }
  }
  if (reauthBtn && hooks.reauth) reauthBtn.onclick = hooks.reauth;
  if (retryBtn) retryBtn.onclick = () => { if (!retryBtn.disabled) hooks.retry(); };
}
