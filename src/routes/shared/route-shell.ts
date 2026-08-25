import { safeStorageSetText } from '../../shared/browser-storage';
import { setupSkipLink } from '../../shared/skip-link';
import '../../shared/skip-link.css';
import './route-shell.css';

export interface RouteShellOptions {
  current: 'workspace' | 'learn-more' | 'my-work';
}

function reflectTheme(button: HTMLButtonElement, doc: Document): void {
  const dark = doc.documentElement.dataset.theme !== 'light';
  button.setAttribute('aria-pressed', dark ? 'true' : 'false');
  button.setAttribute('aria-label', dark ? 'Lampa: ugasi' : 'Lampa: upali');
  button.title = dark ? 'Ugasi radnu lampu' : 'Upali radnu lampu';
}

function wireTheme(doc: Document): void {
  const button = doc.querySelector<HTMLButtonElement>('[data-route-theme]');
  if (!button) return;
  if (!doc.documentElement.dataset.theme) doc.documentElement.dataset.theme = 'dark';
  reflectTheme(button, doc);
  button.addEventListener('click', () => {
    const theme = doc.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    doc.documentElement.dataset.theme = theme;
    reflectTheme(button, doc);
    safeStorageSetText('lekta.theme', theme);
  });
}

function wireSkipLink(doc: Document): void {
  const main = doc.querySelector<HTMLElement>('main');
  const link = setupSkipLink(doc);
  if (!main || !link || link.dataset.routeFocusBound === 'true') return;
  link.dataset.routeFocusBound = 'true';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    main.focus();
    main.scrollIntoView({ block: 'start' });
  });
}

function wireMobileNavigation(doc: Document): void {
  const button = doc.querySelector<HTMLButtonElement>('[data-route-menu-button]');
  const navigation = doc.querySelector<HTMLElement>('[data-route-menu]');
  if (!button || !navigation) return;

  const reflectMenu = (open: boolean): void => {
    navigation.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.setAttribute('aria-label', open ? 'Zatvori izbornik' : 'Otvori izbornik');
  };
  const close = (restoreFocus = false): void => {
    reflectMenu(false);
    if (restoreFocus) button.focus();
  };
  const open = (): void => {
    reflectMenu(true);
    navigation.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )?.focus();
  };

  button.setAttribute('aria-label', navigation.hidden ? 'Otvori izbornik' : 'Zatvori izbornik');
  if (button.dataset.routeMenuBound === 'true') return;
  button.dataset.routeMenuBound = 'true';
  button.addEventListener('click', () => {
    if (navigation.hidden) open();
    else close();
  });
  navigation.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a, [data-auth-entry]')) close();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || navigation.hidden) return;
    event.preventDefault();
    close(true);
  });

  const media = doc.defaultView?.matchMedia?.('(min-width: 761px)');
  const handleBreakpoint = (event: MediaQueryListEvent): void => {
    if (event.matches) close();
  };
  if (media) {
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleBreakpoint);
    } else {
      media.addListener(handleBreakpoint);
    }
    if (media.matches) {
      close();
    }
  }
}

export function mountRouteShell(
  doc: Document = document,
  options: RouteShellOptions,
): void {
  wireSkipLink(doc);
  wireTheme(doc);
  wireMobileNavigation(doc);
  doc.documentElement.dataset.route = options.current;
  doc.querySelectorAll<HTMLElement>('[data-route-link]').forEach((link) => {
    if (link.dataset.routeLink === options.current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
