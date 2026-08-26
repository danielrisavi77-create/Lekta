// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountRouteShell } from '../src/routes/shared/route-shell';

function stubMatchMedia(): void {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

function renderShell(): void {
  document.documentElement.dataset.theme = 'dark';
  document.body.innerHTML = `
    <a class="skip-link" href="#main-content">Preskoci</a>
    <header>
      <a href="/">Lekta</a>
      <button
        type="button"
        data-route-directory-button
        aria-controls="route-directory"
        aria-expanded="false"
      >Sve</button>
    </header>
    <main id="main-content" tabindex="-1"></main>
    <div data-route-directory-layer></div>
  `;
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  renderShell();
});

describe('route shell', () => {
  it('prikazuje cetiri objavljene skupine u kanonskom redoslijedu', () => {
    // Mutation caught: reading the raw directory would expose account-repairs or reorder a group.
    stubMatchMedia();

    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });

    const groups = [...document.querySelectorAll<HTMLElement>('[data-route-directory-group]')];
    expect(groups.map((group) => group.dataset.routeDirectoryGroup)).toEqual([
      'your-work',
      'rules-trust',
      'free-tools',
      'proof-help',
    ]);
    expect(document.querySelector('[data-route-destination="account-repairs"]')).toBeNull();
  });

  it('panel sprema promjenu teme kao raw vrijednost kompatibilnu s prepaint skriptom', () => {
    // Mutation caught: uklanjanje teme iz directory utility dijela ili krivi storage format.
    stubMatchMedia();
    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });
    const button = document.querySelector<HTMLButtonElement>('[data-route-directory-theme]')!;

    button.click();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('lekta.theme')).toBe('light');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('otvaranje panela fokusira naslov i izolira pozadinu', () => {
    // Mutation caught: omitting dialog state, focus transfer, inert, or scroll lock on open.
    stubMatchMedia();
    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });
    const button = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const main = document.querySelector<HTMLElement>('main')!;
    button.focus();

    button.click();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = document.querySelector<HTMLElement>('#route-directory-title')!;
    expect(dialog.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(title);
    expect(main.inert).toBe(true);
});
});

describe('route directory lifecycle', () => {
  it('zatvara se Escapeom, gumbom, i backdropom bez zatvaranja klika u papiru', () => {
    // Mutation caught: removing any close path or failing to restore interaction state.
    stubMatchMedia();
    mountRouteShell(document, { current: 'workspace', variant: 'workspace', privacySettingsAvailable: false });
    const trigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const backdrop = document.querySelector<HTMLElement>('[data-route-directory-backdrop]')!;
    trigger.focus(); trigger.click(); dialog.click(); expect(dialog.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialog.hidden).toBe(true); expect(document.querySelector<HTMLElement>('main')!.inert).toBe(false); expect(document.activeElement).toBe(trigger);
    trigger.click(); document.querySelector<HTMLButtonElement>('[data-route-directory-close]')!.click(); expect(dialog.hidden).toBe(true);
    trigger.click(); backdrop.click(); expect(dialog.hidden).toBe(true);
  });

  it('puni options put prikazuje nastavak, privacy utility, aktivnu rutu i mobilne skupine', () => {
    // Mutation caught: dropping host-supplied continuation or exposing desktop-only group expansion incorrectly.
    stubMatchMedia();
    mountRouteShell(document, { current: 'learn-more', variant: 'content', continuation: { href: '/rad/', label: 'Nastavi trenutačni rad' }, privacySettingsAvailable: true });
    expect(document.documentElement.dataset.routeVariant).toBe('content');
    expect(document.querySelector('[data-route-continuation]')?.textContent).toBe('Nastavi trenutačni rad');
    expect(document.querySelector('[data-route-privacy-settings]')).not.toBeNull();
    expect(document.querySelector('[data-route-destination="learn-more"]')?.getAttribute('aria-current')).toBe('page');
    expect([...document.querySelectorAll<HTMLDetailsElement>('[data-route-directory-group]')].filter((group) => group.open).map((group) => group.dataset.routeDirectoryGroup)).toEqual(['your-work']);
  });

  it('remount closes an open panel and panel interaction performs no network or late module load', () => {
    // Mutation caught: retained listeners after remount or a lazy feature/network path from the panel.
    stubMatchMedia(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mountRouteShell(document, { current: 'workspace', variant: 'workspace', privacySettingsAvailable: false });
    const trigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!; trigger.click();
    mountRouteShell(document, { current: 'workspace', variant: 'workspace', privacySettingsAvailable: false });
    const scripts = document.querySelectorAll('script, link[rel="modulepreload"]').length;
    trigger.click(); document.querySelector<HTMLButtonElement>('[data-route-directory-theme]')!.click();
    expect(document.querySelector<HTMLElement>('[role="dialog"]')!.hidden).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light'); expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script, link[rel="modulepreload"]').length).toBe(scripts);
  });
});
describe('route shell remount ownership', () => {
  it('remount then one panel theme click toggles exactly once', () => {
    const options = {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    } as const;
    mountRouteShell(document, options);
    mountRouteShell(document, options);

    document.querySelector<HTMLButtonElement>('[data-route-directory-theme]')?.click();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('remount leaves one skip-link focus and scroll action', () => {
    const main = document.querySelector<HTMLElement>('main');
    const skipLink = document.querySelector<HTMLAnchorElement>('.skip-link');
    const scrollIntoView = vi.fn();
    Object.defineProperty(main, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    skipLink?.setAttribute('data-route-focus-bound', 'true');

    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });
    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });
    skipLink?.click();

    expect(document.activeElement).toBe(main);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('remount while the directory is open restores prior inert, overflow, and focus before replacement', () => {
    const header = document.querySelector<HTMLElement>('header');
    const main = document.querySelector<HTMLElement>('main');
    const priorFocus = document.createElement('button');
    priorFocus.textContent = 'Raniji fokus';
    document.body.append(priorFocus);
    header!.inert = true;
    main!.inert = false;
    document.body.style.overflow = 'clip';
    priorFocus.focus();

    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });
    document.querySelector<HTMLButtonElement>('[data-route-directory-button]')?.click();

    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: false,
    });

    expect(header?.inert).toBe(true);
    expect(main?.inert).toBe(false);
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(priorFocus);
  });
});

it('creates one owned skip link when a host has no static skip link', () => {
  document.querySelector('.skip-link')?.remove();
  const main = document.querySelector<HTMLElement>('main');
  const scrollIntoView = vi.fn();
  Object.defineProperty(main, 'scrollIntoView', { configurable: true, value: scrollIntoView });

  mountRouteShell(document, {
    current: 'workspace',
    variant: 'workspace',
    privacySettingsAvailable: false,
  });
  mountRouteShell(document, {
    current: 'workspace',
    variant: 'workspace',
    privacySettingsAvailable: false,
  });
  document.querySelector<HTMLAnchorElement>('.skip-link')?.click();

  expect(document.querySelectorAll('.skip-link')).toHaveLength(1);
  expect(document.activeElement).toBe(main);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});
