// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountRouteShell } from '../src/routes/shared/route-shell';

interface MatchMediaHarness {
  setDesktop(matches: boolean): void;
}

function stubMatchMedia(): MatchMediaHarness {
  let desktop = false;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(min-width: 761px)' ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      if (query === '(min-width: 761px)') listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  return {
    setDesktop(matches: boolean) {
      desktop = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
}

function renderShell(): void {
  document.documentElement.dataset.theme = 'dark';
  document.body.innerHTML = `
    <a class="skip-link" href="#main-content">Preskoci</a>
    <header>
      <button type="button" data-route-theme>Lampa</button>
      <button
        type="button"
        data-route-directory-button
        aria-controls="route-directory"
        aria-expanded="false"
      >Sve</button>

      <button
        type="button"
        data-route-menu-button
        aria-expanded="false"
        aria-label="Otvori izbornik"
      >Izbornik</button>
      <nav data-route-menu hidden>
        <a href="/rad/" data-route-link="workspace">Rad</a>
        <a href="/saznaj-vise/" data-route-link="learn-more">Saznaj vise</a>
        <button type="button" data-auth-entry>Prijava</button>
      </nav>
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

  it('sprema promjenu teme kao raw vrijednost kompatibilnu s prepaint skriptom', () => {
    stubMatchMedia();
    mountRouteShell(document, { current: 'workspace' });
    const button = document.querySelector<HTMLButtonElement>('[data-route-theme]')!;

    button.click();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('lekta.theme')).toBe('light');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('pri otvaranju izbornika azurira pristupacno ime i fokusira prvu vezu', () => {
    stubMatchMedia();
    mountRouteShell(document, { current: 'workspace' });
    const button = document.querySelector<HTMLButtonElement>('[data-route-menu-button]')!;
    const navigation = document.querySelector<HTMLElement>('[data-route-menu]')!;
    const firstLink = navigation.querySelector<HTMLAnchorElement>('a')!;

    button.click();

    expect(navigation.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Zatvori izbornik');
    expect(document.activeElement).toBe(firstLink);
  });

  it('Escape zatvara izbornik s bilo kojeg fokusa i vraca fokus gumbu', () => {
    stubMatchMedia();
    mountRouteShell(document, { current: 'workspace' });
    const button = document.querySelector<HTMLButtonElement>('[data-route-menu-button]')!;
    const navigation = document.querySelector<HTMLElement>('[data-route-menu]')!;
    button.click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(navigation.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Otvori izbornik');
    expect(document.activeElement).toBe(button);
  });

  it('prelazak na desktop breakpoint zatvara otvoreni mobilni izbornik', () => {
    const media = stubMatchMedia();
    mountRouteShell(document, { current: 'workspace' });
    const button = document.querySelector<HTMLButtonElement>('[data-route-menu-button]')!;
    const navigation = document.querySelector<HTMLElement>('[data-route-menu]')!;
    button.click();

    media.setDesktop(true);

    expect(navigation.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Otvori izbornik');
  });

  it('mobilna auth akcija zatvara otvoreni izbornik', () => {
    stubMatchMedia();
    mountRouteShell(document, { current: 'workspace' });
    const button = document.querySelector<HTMLButtonElement>('[data-route-menu-button]')!;
    const navigation = document.querySelector<HTMLElement>('[data-route-menu]')!;
    const auth = navigation.querySelector<HTMLButtonElement>('[data-auth-entry]')!;
    button.click();

    auth.click();

    expect(navigation.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Otvori izbornik');
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

  it('legacy bridge never exposes privacy settings or a continuation', () => {
    // Mutation caught: widening the bridge to infer private host state.
    stubMatchMedia();
    mountRouteShell(document, { current: 'workspace' });
    expect(document.documentElement.dataset.routeVariant).toBe('workspace');
    expect(document.querySelector('[data-route-privacy-settings]')).toBeNull();
    expect(document.querySelector('[data-route-continuation]')).toBeNull();
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