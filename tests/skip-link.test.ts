/**
 * BL-P1-01: "Preskoci na sadrzaj" skip link (WCAG 2.4.1 A). Injektira se iz zajednickog
 * ui-boot.ts pa mora: biti PRVI element u <body>, ciljati <main> (reuse postojeceg id-a),
 * uciniti <main> programski fokusabilnim, biti idempotentan i pomaknuti fokus na klik.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setupSkipLink } from '../src/shared/skip-link';

describe('skip link (BL-P1-01)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header><a href="#x">nav</a></header><main><h1>Sadrzaj</h1></main>';
  });

  it('prepend-a fokusabilni skip link koji cilja <main>', () => {
    const link = setupSkipLink(document);
    expect(link).not.toBeNull();
    expect(document.body.firstElementChild).toBe(link); // prvi u tab redu
    expect(link!.classList.contains('skip-link')).toBe(true);
    expect(link!.textContent).toBe('Preskoči na sadržaj');
    const main = document.querySelector('main')!;
    expect(main.id).toBeTruthy();
    expect(link!.getAttribute('href')).toBe(`#${main.id}`);
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('reuse-a postojeci <main id> umjesto prepisivanja', () => {
    document.body.innerHTML = '<main id="top"><h1>x</h1></main>';
    const link = setupSkipLink(document);
    expect(link!.getAttribute('href')).toBe('#top');
    expect(document.querySelector('main')!.id).toBe('top');
  });

  it('idempotentan je (nema duplog linka na ponovljeni poziv)', () => {
    setupSkipLink(document);
    setupSkipLink(document);
    expect(document.querySelectorAll('a.skip-link').length).toBe(1);
  });

  it('vraca null kad nema <main>', () => {
    document.body.innerHTML = '<div>bez maina</div>';
    expect(setupSkipLink(document)).toBeNull();
  });

  it('pomice fokus na <main> na klik', () => {
    const link = setupSkipLink(document)!;
    const main = document.querySelector('main') as HTMLElement;
    link.click();
    expect(document.activeElement).toBe(main);
  });
});
