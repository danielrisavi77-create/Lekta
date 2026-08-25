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
  `;
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  renderShell();
});

describe('route shell', () => {
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
});
