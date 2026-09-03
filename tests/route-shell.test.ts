// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeRouteShell, mountRouteShell } from '../src/routes/shared/route-shell';

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

type MediaChangeListener = (event: MediaQueryListEvent) => void;

function controlledMatchMedia(initialMatches: boolean): {
  setMatches(matches: boolean): void;
  listenerCount(): number;
} {
  const media = '(min-width: 761px)';
  const listeners = new Set<MediaChangeListener>();
  let matches = initialMatches;
  const mediaQuery = {
    get matches() { return matches; },
    media,
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') listeners.add(listener as MediaChangeListener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') listeners.delete(listener as MediaChangeListener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media } as MediaQueryListEvent;
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.size,
  };
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
    // Neobjavljena odredista (ruta jos ne postoji) NE SMIJU se pojaviti ni jednom, jer bi link
    // vodio u 404.
    //
    // PROMJENA 2026-09-03: `/saznaj-vise/` je nastala i nosi landing sekcije, pa pet odredista
    // (learn-more, checks, trust-proof, pricing, faq) VISE NIJE neobjavljeno i mora se prikazati.
    // `/moji-radovi/` je jos samo zapisana namjera i ostaje skriveno.
    // 2026-09-04: `/moji-radovi/` je nastala, pa vise NIJEDNO odrediste nije skriveno. Popis
    // skrivenih je time prazan, sto je oblik koji prolazi i vakuumski, pa se uz njega tvrdi i da
    // ljuska doista nesto prikazuje.
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-route-destination]')];
    expect(links.length, 'ljuska ne prikazuje nijedno odrediste').toBeGreaterThan(20);
    const hrefs = links.map((link) => link.getAttribute('href')).filter((href): href is string => href !== null);
    // Ruta koja postoji SMIJE se linkati; ruta koja ne postoji ne smije. Tvrdnja je time na
    // POSTOJANJU rute, ne na popisu imena, koji je danas vec dvaput zastario.
    expect(hrefs.filter((href) => href.startsWith('/saznaj-vise/')).length).toBe(5);
    expect(hrefs.filter((href) => href.startsWith('/moji-radovi/')).length).toBe(2);
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
    const backdrop = document.querySelector<HTMLElement>('[data-route-directory-backdrop]')!;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(backdrop.hidden).toBe(true);
    expect(dialog.hidden).toBe(true);
    button.focus();

    button.click();

    const title = document.querySelector<HTMLElement>('#route-directory-title')!;
    expect(backdrop.hidden).toBe(false);
    expect(dialog.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(title);
    expect(main.inert).toBe(true);
  });

  it('zatvara panel prije nego vanjski privacy listener otkrije i fokusira sibling UI', () => {
    // Mutation caught: privacy click leaves the external modal inert behind the open directory.
    stubMatchMedia();
    mountRouteShell(document, {
      current: 'workspace',
      variant: 'workspace',
      privacySettingsAvailable: true,
    });
    const privacySurface = document.createElement('section');
    privacySurface.hidden = true;
    privacySurface.tabIndex = -1;
    document.body.append(privacySurface);
    const main = document.querySelector<HTMLElement>('main')!;
    const trigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const settings = document.querySelector<HTMLButtonElement>('#privacySettingsBtn')!;
    let observedState: { mainInert: boolean; privacyInert: boolean; focused: boolean } | null = null;
    settings.addEventListener('click', () => {
      privacySurface.hidden = false;
      privacySurface.focus();
      observedState = {
        mainInert: main.inert,
        privacyInert: privacySurface.inert,
        focused: document.activeElement === privacySurface,
      };
    });

    trigger.click();
    settings.click();

    expect(observedState).toEqual({
      mainInert: false,
      privacyInert: false,
      focused: true,
    });
    expect(document.querySelector<HTMLElement>('[role="dialog"]')!.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
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
    expect(dialog.hidden).toBe(true); expect(backdrop.hidden).toBe(true); expect(document.querySelector<HTMLElement>('main')!.inert).toBe(false); expect(document.activeElement).toBe(trigger);
    trigger.click(); document.querySelector<HTMLButtonElement>('[data-route-directory-close]')!.click(); expect(dialog.hidden).toBe(true); expect(backdrop.hidden).toBe(true);
    trigger.click(); backdrop.click(); expect(dialog.hidden).toBe(true); expect(backdrop.hidden).toBe(true);
  });

  it('puni options put prikazuje nastavak, privacy utility, aktivnu rutu i mobilne skupine', () => {
    // Mutation caught: dropping host-supplied continuation or exposing desktop-only group expansion incorrectly.
    stubMatchMedia();
    mountRouteShell(document, { current: 'faculty-rules', variant: 'content', continuation: { href: '/rad/', label: 'Nastavi trenutačni rad' }, privacySettingsAvailable: true });
    expect(document.documentElement.dataset.routeVariant).toBe('content');
    expect(document.querySelector('[data-route-continuation]')?.textContent).toBe('Nastavi trenutačni rad');
    expect(document.querySelector('[data-route-privacy-settings]')).not.toBeNull();
    expect(document.querySelector('[data-route-destination="faculty-rules"]')?.getAttribute('aria-current')).toBe('page');
    expect([...document.querySelectorAll<HTMLDetailsElement>('[data-route-directory-group]')].filter((group) => group.open).map((group) => group.dataset.routeDirectoryGroup)).toEqual(['your-work']);
  });

  it('remount closes an open panel and panel interaction performs no network or late module load', () => {
    // Mutation caught: retained listeners after remount or a lazy feature/network path from the panel.
    stubMatchMedia(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mountRouteShell(document, { current: 'workspace', variant: 'workspace', privacySettingsAvailable: false });
    const trigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!; trigger.click();
    const priorBackdrop = document.querySelector<HTMLElement>('[data-route-directory-backdrop]')!;
    mountRouteShell(document, { current: 'workspace', variant: 'workspace', privacySettingsAvailable: false });
    expect(priorBackdrop.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-route-directory-backdrop]')!.hidden).toBe(true);
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

it('prati media query promjene bez reloada i odspaja listener pri disposeu', () => {
  // Mutation caught: reading matchMedia only at mount or retaining its listener after disposal.
  const media = controlledMatchMedia(false);
  mountRouteShell(document, {
    current: 'workspace',
    variant: 'workspace',
    privacySettingsAvailable: false,
  });
  const openGroupIds = () => [...document.querySelectorAll<HTMLDetailsElement>('[data-route-directory-group]')]
    .filter((group) => group.open)
    .map((group) => group.dataset.routeDirectoryGroup);

  expect(openGroupIds()).toEqual(['your-work']);
  expect(media.listenerCount()).toBe(1);

  media.setMatches(true);
  expect(openGroupIds()).toEqual(['your-work', 'rules-trust', 'free-tools', 'proof-help']);

  media.setMatches(false);
  expect(openGroupIds()).toEqual(['your-work']);

  disposeRouteShell(document);
  expect(media.listenerCount()).toBe(0);
  media.setMatches(true);
  expect(openGroupIds()).toEqual(['your-work']);
});

it('vraca fokus otvaracu iz document realma', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const frameWindow = frame.contentWindow;
  const frameDoc = frame.contentDocument;
  if (!frameWindow || !frameDoc) throw new Error('Iframe realm nije dostupan.');
  Object.defineProperty(frameWindow, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
  frameDoc.body.innerHTML = `
    <header><button type="button" data-route-directory-button aria-controls="route-directory">Sve</button></header>
    <main id="main-content"></main>
    <div data-route-directory-layer></div>
  `;
  const trigger = frameDoc.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
  const FrameHTMLElement = frameWindow.HTMLElement;
  vi.stubGlobal('HTMLElement', class ForeignHTMLElement {});
  expect(trigger instanceof FrameHTMLElement).toBe(true);
  expect(trigger instanceof globalThis.HTMLElement).toBe(false);
  mountRouteShell(frameDoc, { current: 'workspace', variant: 'workspace', privacySettingsAvailable: false });
  trigger.focus();
  trigger.click();
  frameDoc.dispatchEvent(new frameWindow.KeyboardEvent('keydown', { key: 'Escape' }));
  expect(frameDoc.activeElement).toBe(trigger);
  disposeRouteShell(frameDoc);
  frame.remove();
});

it('podrzava legacy MediaQueryList listener i uklanja ga pri disposeu', () => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener));
  const removeListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener));
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener,
    removeListener,
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList)));

  expect(() => mountRouteShell(document, {
    current: 'workspace',
    variant: 'workspace',
    privacySettingsAvailable: false,
  })).not.toThrow();
  expect(addListener).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(1);

  disposeRouteShell(document);
  expect(removeListener).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
});
