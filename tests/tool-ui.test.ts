/**
 * Testovi zajednickog copy-gumba za besplatne alate (C1 dvoklik, C2 fallback).
 * happy-dom daje document; Clipboard API mockamo. Dokazuje da gumb ne ostaje zaglavljen
 * na privremenom labelu i da se koristi fallback kad Clipboard API-ja nema.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { bindCopyButton } from '../src/tools/tool-ui';

function makeBtn(label = 'Kopiraj'): any {
  const b = document.createElement('button');
  b.textContent = label;
  document.body.appendChild(b);
  return b;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('bindCopyButton', () => {
  it('kopira preko Clipboard API-ja, pokaze potvrdu, pa vrati originalni label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const btn = makeBtn();
    bindCopyButton(btn, () => 'tekst za kopiranje', { holdMs: 500 });

    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Kopirano ✓'));
    expect(writeText).toHaveBeenCalledWith('tekst za kopiranje');
    await vi.waitFor(() => expect(btn.textContent).toBe('Kopiraj'));
  });

  it('dvoklik ne zaglavi gumb na privremenom labelu (C1)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const btn = makeBtn();
    bindCopyButton(btn, () => 'tekst', { holdMs: 500 });

    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Kopirano ✓'));
    btn.click(); // drugi klik dok jos pise "Kopirano ✓"
    await vi.waitFor(() => expect(btn.textContent).toBe('Kopiraj'));
  });

  it('prazan getText() ne kopira nista', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const btn = makeBtn();
    bindCopyButton(btn, () => '');
    btn.click();
    expect(writeText).not.toHaveBeenCalled();
    expect(btn.textContent).toBe('Kopiraj');
  });

  it('bez Clipboard API-ja pokusa fallback pa pokaze uputu (C2)', async () => {
    // Nema navigator.clipboard, a execCommand vraca false -> failLabel.
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', Object.assign(document, { execCommand: () => false }));
    const btn = makeBtn();
    bindCopyButton(btn, () => 'tekst', { holdMs: 500, failLabel: 'Označi pa Ctrl+C' });

    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Označi pa Ctrl+C'));
    await vi.waitFor(() => expect(btn.textContent).toBe('Kopiraj'));
  });
});
