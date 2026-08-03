/**
 * Smoke za DOM glue brojaca (kartice-page.ts): minimalni DOM s ID-evima iz kartice.html,
 * modul se importa i mora povezati render i gumbe. Hvata drift ID-eva izmedju HTML-a i
 * glue-a te pokvaren SAMPLE/clear/copy tok; matematika jezgre je pokrivena u counter.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  document.body.innerHTML = `
    <textarea id="kt-input"></textarea>
    <button id="kt-sample" type="button"></button>
    <button id="kt-clear" type="button"></button>
    <button id="kt-copy" type="button" disabled></button>
    <p id="kt-success-cta"></p>
    <span id="m-kartice"></span><span id="m-words"></span>
    <span id="m-chars"></span><span id="m-chars-nospace"></span>
    <span id="m-sentences"></span><span id="m-paragraphs"></span>
    <span id="m-pages"></span><span id="m-reading"></span>
    <div id="kt-sr-summary"></div>
  `;
  await import('../src/tools/kartice-page');
});

describe('kartice-page glue', () => {
  it('inicijalni render postavlja nule i drzi copy onemogucen', () => {
    expect(document.querySelector('#m-kartice')!.textContent).toBe('0');
    expect(document.querySelector('#m-words')!.textContent).toBe('0');
    expect((document.querySelector('#kt-copy') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('#kt-success-cta')!.classList.contains('is-visible')).toBe(false);
  });

  it('"Ubaci primjer" popuni tekst, azurira metrike, omoguci copy i pokaze success-cta (B4)', () => {
    (document.querySelector('#kt-sample') as HTMLButtonElement).click();
    const words = Number((document.querySelector('#m-words')!.textContent || '').replace(/\D/g, ''));
    expect(words).toBeGreaterThan(10);
    expect((document.querySelector('#kt-copy') as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('#kt-success-cta')!.classList.contains('is-visible')).toBe(true);
  });

  it('"Ocisti" vrati sve na nulu, onemoguci copy i sakrije success-cta', () => {
    (document.querySelector('#kt-clear') as HTMLButtonElement).click();
    expect(document.querySelector('#m-words')!.textContent).toBe('0');
    expect((document.querySelector('#kt-copy') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('#kt-success-cta')!.classList.contains('is-visible')).toBe(false);
  });

  it('unos preko input eventa (rAF spajanje) azurira metrike', async () => {
    const input = document.querySelector('#kt-input') as HTMLTextAreaElement;
    input.value = 'Jedna. Druga!';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 120)); // pricekaj requestAnimationFrame render
    expect(document.querySelector('#m-sentences')!.textContent).toBe('2');
    expect(document.querySelector('#m-words')!.textContent).toBe('2');
  });
});
