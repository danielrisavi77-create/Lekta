export function renderWorkspaceShell(doc: Document = document): void {
  const main = doc.querySelector<HTMLElement>('#main-content');
  const status = doc.querySelector<HTMLElement>('#workspace-status');
  if (main) main.dataset.workspaceState = 'restoring';
  if (status) {
    status.dataset.tone = 'working';
    status.setAttribute('aria-busy', 'true');
    const title = status.querySelector<HTMLElement>('[data-workspace-status-title]');
    const detail = status.querySelector<HTMLElement>('[data-workspace-status-detail]');
    if (title) title.textContent = 'Obnavljam tvoj korektorski stol';
    if (detail) detail.textContent = 'Dokument se čita iz privatne lokalne sesije u ovom pregledniku.';
  }
}

export function renderWorkspaceBootError(doc: Document, message: string): void {
  const main = doc.querySelector<HTMLElement>('#main-content');
  const status = doc.querySelector<HTMLElement>('#workspace-status');
  if (main) main.dataset.workspaceState = 'error';
  if (!status) return;
  status.dataset.tone = 'error';
  status.setAttribute('aria-busy', 'false');
  const title = status.querySelector<HTMLElement>('[data-workspace-status-title]');
  const detail = status.querySelector<HTMLElement>('[data-workspace-status-detail]');
  if (title) title.textContent = 'Radni prostor se nije mogao otvoriti';
  if (detail) detail.textContent = message;
}
