import { safeStorageSetText } from '../../shared/browser-storage';
import { releasedPublicRouteGroups } from './public-route-directory';
import '../../shared/skip-link.css';
import './route-shell.css';

export type RouteShellVariant = 'intake' | 'workspace' | 'content' | 'my-work';

export interface RouteContinuation {
  readonly href: `/${string}`;
  readonly label: string;
}

export interface RouteShellOptions {
  readonly current: string;
  readonly variant: RouteShellVariant;
  readonly continuation?: RouteContinuation;
  readonly privacySettingsAvailable: boolean;
}

function reflectTheme(button: HTMLButtonElement, doc: Document): void {
  const dark = doc.documentElement.dataset.theme !== 'light';
  button.setAttribute('aria-pressed', dark ? 'true' : 'false');
  button.setAttribute('aria-label', dark ? 'Lampa: ugasi' : 'Lampa: upali');
  button.title = dark ? 'Ugasi radnu lampu' : 'Upali radnu lampu';
}

function ensureSkipLink(doc: Document): HTMLAnchorElement | null {
  const main = doc.querySelector<HTMLElement>('main');
  if (!main) return null;
  if (!main.id) main.id = 'main-content';
  if (!main.hasAttribute('tabindex')) main.tabIndex = -1;

  const existing = doc.querySelector<HTMLAnchorElement>('.skip-link');
  if (existing) return existing;

  const link = doc.createElement('a');
  link.className = 'skip-link';
  link.href = `#${main.id}`;
  link.textContent = 'Preskoči na sadržaj';
  doc.body.prepend(link);
  return link;
}

function wireSkipLink(doc: Document, signal: AbortSignal): void {
  const main = doc.querySelector<HTMLElement>('main');
  const link = ensureSkipLink(doc);
  if (!main || !link) return;

  link.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      main.focus();
      main.scrollIntoView({ block: 'start' });
    },
    { signal },
  );
}

function mountDirectoryPanel(doc: Document, options: RouteShellOptions, signal: AbortSignal): void {
  const layer = doc.querySelector<HTMLElement>('[data-route-directory-layer]');
  const trigger = doc.querySelector<HTMLButtonElement>('[data-route-directory-button]');
  if (!layer || !trigger) return;

  const backdrop = doc.createElement('div');
  backdrop.dataset.routeDirectoryBackdrop = 'true';
  backdrop.hidden = true;

  const dialog = doc.createElement('section');
  dialog.id = 'route-directory';
  dialog.dataset.routeDirectory = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'route-directory-title');
  dialog.hidden = true;

  const title = doc.createElement('h2');
  title.id = 'route-directory-title';
  title.tabIndex = -1;
  title.textContent = 'Sve mogućnosti';
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.dataset.routeDirectoryClose = 'true';
  closeButton.textContent = 'Zatvori';
  dialog.append(title, closeButton);

  const desktop = doc.defaultView?.matchMedia?.('(min-width: 761px)').matches ?? true;
  for (const group of releasedPublicRouteGroups) {
    const details = doc.createElement('details');
    details.dataset.routeDirectoryGroup = group.id;
    details.open = desktop || group.id === 'your-work';
    const summary = doc.createElement('summary');
    summary.textContent = `${group.label} (${group.destinations.length})`;
    details.append(summary);
    for (const destination of group.destinations) {
      const link = doc.createElement('a');
      link.href = destination.href;
      link.dataset.routeDestination = destination.id;
      link.dataset.routeLink = destination.id;
      link.textContent = destination.label;
      if (destination.id === options.current) link.setAttribute('aria-current', 'page');
      details.append(link);
      if (group.id === 'your-work' && destination.id === 'intake' && options.continuation) {
        const continuation = doc.createElement('a');
        continuation.href = options.continuation.href;
        continuation.dataset.routeContinuation = 'true';
        continuation.textContent = options.continuation.label;
        details.append(continuation);
      }
    }
    dialog.append(details);
  }

  const utility = doc.createElement('section');
  const theme = doc.createElement('button');
  theme.type = 'button';
  theme.dataset.routeDirectoryTheme = 'true';
  const privacy = doc.createElement('a');
  privacy.href = '/privatnost.html';
  privacy.textContent = 'Privatnost';
  const processing = doc.createElement('a');
  processing.href = '/obrada-dokumenata.html';
  processing.textContent = 'Obrada dokumenata';
  utility.append(theme);
  if (options.privacySettingsAvailable) {
    const settings = doc.createElement('button');
    settings.type = 'button';
    settings.id = 'privacySettingsBtn';
    settings.dataset.routePrivacySettings = 'true';
    settings.textContent = 'Postavke privatnosti';
    utility.append(settings);
  }
  utility.append(privacy, processing);
  dialog.append(utility);
  backdrop.append(dialog);
  layer.replaceChildren(backdrop);

  if (!doc.documentElement.dataset.theme) doc.documentElement.dataset.theme = 'dark';
  reflectTheme(theme, doc);

  let opener: HTMLElement | null = null;
  let locked = false;
  let overflow = '';
  const inert = new Map<HTMLElement, boolean>();
  const close = (): void => {
    dialog.hidden = true;
    backdrop.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (!locked) return;
    for (const [element, value] of inert) element.inert = value;
    inert.clear();
    doc.body.style.overflow = overflow;
    locked = false;
    opener?.focus();
    opener = null;
  };
  const open = (): void => {
    if (locked) return;
    opener = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    overflow = doc.body.style.overflow;
    for (const element of [...doc.body.children] as HTMLElement[]) {
      if (element === layer) continue;
      inert.set(element, element.inert);
      element.inert = true;
    }
    locked = true;
    backdrop.hidden = false;
    dialog.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    doc.body.style.overflow = 'hidden';
    title.focus();
  };

  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', open, { signal });
  closeButton.addEventListener('click', close, { signal });
  backdrop.addEventListener(
    'click',
    (event) => {
      if (event.target === backdrop) close();
    },
    { signal },
  );
  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !dialog.hidden) {
        event.preventDefault();
        close();
      }
    },
    { signal },
  );
  theme.addEventListener(
    'click',
    () => {
      const next = doc.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      doc.documentElement.dataset.theme = next;
      reflectTheme(theme, doc);
      safeStorageSetText('lekta.theme', next);
    },
    { signal },
  );
  signal.addEventListener('abort', close, { once: true });
}

const routeShellControllers = new WeakMap<Document, AbortController>();

export function disposeRouteShell(doc: Document): void {
  const controller = routeShellControllers.get(doc);
  if (!controller) return;
  routeShellControllers.delete(doc);
  controller.abort();
}

export function mountRouteShell(doc: Document, options: RouteShellOptions): void {
  disposeRouteShell(doc);

  const controller = new AbortController();
  routeShellControllers.set(doc, controller);
  mountDirectoryPanel(doc, options, controller.signal);
  wireSkipLink(doc, controller.signal);
  doc.documentElement.dataset.route = options.current;
  doc.documentElement.dataset.routeVariant = options.variant;
  doc.querySelectorAll<HTMLElement>('[data-route-link]').forEach((link) => {
    if (link.dataset.routeLink === options.current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
