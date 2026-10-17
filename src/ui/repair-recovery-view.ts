/**
 * PRIKAZ OPORAVKA NAKON GRESKE POPRAVKA (plan T10). Odluku donosi `recoveryFor` (`src/repair/recovery-policy.ts`);
 * ovdje se ona prevodi u DOM: poruka, gumb za autoritativnu provjeru statusa zahtjeva i gumb za ponovni pokusaj koji je za
 * `check-existing-job` ONEMOGUCEN dok server ne potvrdi da je sigurno pokusati ponovno. Time se nepoznat ishod nakon slanja ne
 * moze slijepo ponoviti kao drugi naplativi posao.
 */
import type { RepairRecovery } from '../repair/recovery-policy';

export interface RecoveryHooks {
  retry: () => void | Promise<void>;
  /** Postojeci mehanizam pregleda poslova (`openRepairHistory`); `null` kad nije dostupan (bez prijave). */
  openJobs: (() => boolean | void | Promise<boolean | void>) | null;
  /** Ponovna prijava (`openAuth`), za `reauth`. */
  reauth?: () => void;
}

export function renderRepairRecovery(el: HTMLElement, recovery: RepairRecovery, hooks: RecoveryHooks, esc: (v: string) => string): void {
  el.hidden = false;
  const provjera = recovery.action === 'check-existing-job'
    ? `<button type="button" class="btn btn-secondary btn-sm" data-repair-check-jobs>Provjeri status popravka</button>`
    : '';
  const prijava = recovery.action === 'reauth' && hooks.reauth
    ? `<button type="button" class="btn btn-secondary btn-sm" data-repair-reauth>Prijavi se ponovno</button>`
    : '';
  const ponovi = recovery.action === 'none' || recovery.action === 'refresh-consent'
    ? ''
    : `<button type="button" class="btn btn-primary btn-sm" data-repair-retry${recovery.retryAllowed ? '' : ' disabled'}>Pokušaj ponovno</button>`;
  el.innerHTML = `<div class="lekta-repair-panel__recovery" data-testid="repair-recovery" data-repair-recovery="${esc(recovery.action)}"><p><strong>${esc(recovery.message)}</strong></p><p>${provjera}${prijava}${ponovi}</p>${recovery.action === 'check-existing-job' ? '<p class="muted">Ponovni pokušaj se otključava tek kad poslužitelj potvrdi da je nastavak siguran: zahtjev ne postoji, može se ponoviti ili je dovršen bez spremljene kopije.</p>' : ''}</div>`;
  const retryBtn = el.querySelector<HTMLButtonElement>('[data-repair-retry]');
  const jobsBtn = el.querySelector<HTMLButtonElement>('[data-repair-check-jobs]');
  const reauthBtn = el.querySelector<HTMLButtonElement>('[data-repair-reauth]');
  if (jobsBtn) {
    jobsBtn.onclick = async () => {
      if (!hooks.openJobs) return;
      jobsBtn.disabled = true;
      try {
        const checked = await hooks.openJobs();
        if (checked !== true) {
          if (checkStatus) checkStatus.hidden = false;
          return;
        }
        // Samo autoritativna potvrda (true) da nema aktivnog/dovršenog posla otključava retry.
        // Stari callbacki koji vraćaju void ili prazna povijest nisu dokaz da ponavljanje ne duplira obradu.
        if (retryBtn) retryBtn.disabled = false;
        if (checkStatus) checkStatus.hidden = true;
      } catch {
        if (checkStatus) checkStatus.hidden = false;
      } finally {
        if (jobsBtn.isConnected) jobsBtn.disabled = false;
      }
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
  const checkStatus = jobsBtn
    ? el.ownerDocument.createElement('p')
    : null;
  if (checkStatus) {
    checkStatus.className = 'muted';
    checkStatus.setAttribute('role', 'status');
    checkStatus.setAttribute('aria-live', 'polite');
    checkStatus.dataset.repairRecoveryStatus = '';
    checkStatus.textContent = 'Poslužitelj nije potvrdio prethodni zahtjev. Ponovni pokušaj ostaje zaključan.';
    checkStatus.hidden = true;
    jobsBtn?.closest('[data-repair-recovery]')?.append(checkStatus);
  }
  if (reauthBtn && hooks.reauth) reauthBtn.onclick = hooks.reauth;
  if (retryBtn) {
    const retryLabel = retryBtn.textContent || 'Pokušaj ponovno';
    const retryStatus = el.ownerDocument.createElement('p');
    retryStatus.className = 'muted';
    retryStatus.setAttribute('role', 'status');
    retryStatus.setAttribute('aria-live', 'polite');
    retryStatus.textContent = 'Ponovni pokušaj traje. Može potrajati do 3 minute; nemoj klikati ponovno.';
    retryStatus.hidden = true;
    retryBtn.closest('[data-repair-recovery]')?.append(retryStatus);
    retryBtn.onclick = async () => {
      if (retryBtn.disabled) return;
      retryBtn.disabled = true;
      retryBtn.textContent = 'Pokušavam ponovno…';
      retryBtn.setAttribute('aria-busy', 'true');
      retryStatus.hidden = false;
      try {
        await hooks.retry();
      } finally {
        // Novi ishod zamjenjuje recovery panel. Ako isti gumb još postoji, pokušaj je završio
        // bez novog prikaza (npr. prijava je otkazana), pa vrati mogućnost svjesnog pokušaja.
        if (retryBtn.isConnected) {
          retryBtn.disabled = false;
          retryBtn.textContent = retryLabel;
          retryBtn.removeAttribute('aria-busy');
          retryStatus.remove();
        }
      }
    };
  }
}
