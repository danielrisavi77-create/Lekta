import { releasedPublicRouteGroups } from '../routes/shared/public-route-directory';

/** Kazalo i njegova ruta-lista preuzimaju se tek kad ga korisnik otvori. */
export function openSiteCommandDialog(doc: Document, trigger: HTMLButtonElement): void {
  const existing = doc.querySelector<HTMLDialogElement>('.site-command-dialog');
  if (existing) {
    if (!existing.open) existing.showModal();
    existing.querySelector<HTMLInputElement>('[data-command-query]')?.focus();
    return;
  }
  const dialog = doc.createElement('dialog');
  dialog.className = 'site-command-dialog';
  dialog.setAttribute('aria-labelledby', 'siteCommandTitle');
  dialog.innerHTML = `
    <div class="site-command-dialog__head">
      <div><span class="site-command-dialog__eyebrow">KAZALO</span><h2 id="siteCommandTitle">Što tražiš?</h2></div>
      <button type="button" class="site-command-dialog__close" data-command-close aria-label="Zatvori Kazalo">×</button>
    </div>
    <label class="site-command-dialog__search"><span class="sr-only">Traži alate, fakultete i vodiče</span><input type="search" autocomplete="off" placeholder="Alati, fakulteti, vodiči…" data-command-query></label>
    <div class="site-command-dialog__results" role="list" data-command-results></div>
    <p class="site-command-dialog__hint">↑ ↓ za kretanje · Esc za zatvaranje</p>`;
  doc.body.append(dialog);
  const query = dialog.querySelector<HTMLInputElement>('[data-command-query]')!;
  const results = dialog.querySelector<HTMLElement>('[data-command-results]')!;
  const destinations = releasedPublicRouteGroups.flatMap((group) => group.destinations.map((item) => ({ group: group.label, ...item })));
  const render = (): void => {
    const term = query.value.trim().toLocaleLowerCase('hr');
    const matching = destinations.filter((item) => !term || `${item.label} ${item.description} ${item.group}`.toLocaleLowerCase('hr').includes(term));
    const fragment = doc.createDocumentFragment();
    for (const item of matching) {
      const link = doc.createElement('a');
      link.className = 'site-command-dialog__item';
      link.href = item.href;
      link.setAttribute('role', 'listitem');
      const copy = doc.createElement('span');
      copy.className = 'site-command-dialog__copy';
      const title = doc.createElement('strong');
      title.textContent = item.label;
      const description = doc.createElement('small');
      description.textContent = item.description;
      copy.append(title, description);
      const category = doc.createElement('small');
      category.className = 'site-command-dialog__group';
      category.textContent = item.group;
      link.append(copy, category);
      fragment.append(link);
    }
    if (!matching.length) {
      const empty = doc.createElement('p');
      empty.className = 'site-command-dialog__empty';
      empty.textContent = 'Nema rezultata za taj upit.';
      fragment.append(empty);
    }
    results.replaceChildren(fragment);
  };
  query.addEventListener('input', render);
  dialog.querySelector<HTMLButtonElement>('[data-command-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = [...results.querySelectorAll<HTMLAnchorElement>('a')];
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(doc.activeElement as HTMLAnchorElement);
    const next = event.key === 'ArrowDown' ? (current + 1) % links.length : current < 0 ? links.length - 1 : (current - 1 + links.length) % links.length;
    links[next]?.focus();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    const triggerIsVisible = trigger.getClientRects().length > 0;
    const focusTarget = triggerIsVisible ? trigger : doc.querySelector<HTMLButtonElement>('.site-chrome__burger');
    focusTarget?.focus();
  }, { once: true });
  render();
  dialog.showModal();
  query.focus();
}
