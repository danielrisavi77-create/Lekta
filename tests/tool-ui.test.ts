/**
 * Testovi zajednickog copy-gumba za besplatne alate (C1 dvoklik, C2 fallback).
 * happy-dom daje document; Clipboard API mockamo. Dokazuje da gumb ne ostaje zaglavljen
 * na privremenom labelu i da se koristi fallback kad Clipboard API-ja nema.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { bindCopyButton, bindDownloadButton } from '../src/tools/tool-ui';

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

  it('zadana poruka o neuspjehu ne spominje Ctrl+C na dodirnom uredjaju (coarse pointer)', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', Object.assign(document, { execCommand: () => false }));
    vi.stubGlobal('window', Object.assign(window, {
      matchMedia: (q: string) => ({ matches: q.includes('coarse') }),
    }));
    const btn = makeBtn();
    bindCopyButton(btn, () => 'tekst', { holdMs: 500 }); // bez failLabel override -> zadano

    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Odaberi i kopiraj ručno'));
    expect(btn.textContent).not.toMatch(/Ctrl/);
  });

  it('zadana poruka o neuspjehu i dalje spominje Ctrl+C na uredjaju s finim pokazivacem (mis)', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', Object.assign(document, { execCommand: () => false }));
    vi.stubGlobal('window', Object.assign(window, {
      matchMedia: () => ({ matches: false }),
    }));
    const btn = makeBtn();
    bindCopyButton(btn, () => 'tekst', { holdMs: 500 });

    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Označi pa Ctrl+C'));
  });

  it('zadani okStatus je generican (bez imenice specificne za jedan alat kao "sazetak")', async () => {
    // bindCopyButton je zajednicki za 6 poziva (citat/izjava/kartice/literatura/naslovnica/bulk);
    // hardkodiran "Sažetak kopiran..." bi bio netocan za sve osim kartice.html.
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const btn = makeBtn();
    const status = document.createElement('p');
    bindCopyButton(btn, () => 'tekst', { holdMs: 500, statusEl: status });

    btn.click();
    await vi.waitFor(() => expect(status.textContent).toBeTruthy());
    expect(status.textContent).not.toContain('Sažetak');
  });

  it('opts.okStatus nadjacava zadanu poruku kad poziva tocno zna sto kopira', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const btn = makeBtn();
    const status = document.createElement('p');
    bindCopyButton(btn, () => 'tekst', {
      holdMs: 500,
      statusEl: status,
      okStatus: 'Sažetak kopiran u međuspremnik.',
    });

    btn.click();
    await vi.waitFor(() => expect(status.textContent).toBe('Sažetak kopiran u međuspremnik.'));
  });
});

describe('bindDownloadButton', () => {
  it('uspjesno preuzimanje ne mijenja label gumba', async () => {
    const btn = makeBtn('Preuzmi .docx');
    const blob = new Blob(['test'], { type: 'text/plain' });
    bindDownloadButton(btn, () => blob, 'test.docx', { holdMs: 300 });

    btn.click();
    // Nema promjene labela na uspjeh (preuzimanje samo pokrece browserov save-dijalog).
    expect(btn.textContent).toBe('Preuzmi .docx');
  });

  it('buildBlob koji vrati null tiho ne radi nista', () => {
    const btn = makeBtn('Preuzmi .docx');
    const buildBlob = vi.fn(() => null);
    bindDownloadButton(btn, buildBlob, 'test.docx');

    btn.click();
    expect(buildBlob).toHaveBeenCalled();
    expect(btn.textContent).toBe('Preuzmi .docx');
  });

  it('BUG: kad buildBlob() baci, gumb privremeno pokazuje failLabel pa se vrati na original', async () => {
    const btn = makeBtn('Preuzmi .docx');
    bindDownloadButton(btn, () => { throw new Error('generiranje nije uspjelo'); }, 'test.docx', { holdMs: 300 });

    btn.click();
    expect(btn.textContent).toBe('Preuzimanje nije uspjelo');
    await vi.waitFor(() => expect(btn.textContent).toBe('Preuzmi .docx'));
  });

  it('statusEl dobiva failStatus poruku kad generiranje baci', () => {
    const btn = makeBtn('Preuzmi .docx');
    const status = document.createElement('p');
    bindDownloadButton(btn, () => { throw new Error('x'); }, 'test.docx', {
      holdMs: 300,
      statusEl: status,
      failStatus: 'Preuzimanje nije uspjelo, pokušaj ponovno.',
    });

    btn.click();
    expect(status.textContent).toBe('Preuzimanje nije uspjelo, pokušaj ponovno.');
    expect(status.className).toBe('out-hint warn');
  });

  it('dvoklik dok jos pise failLabel ne zaglavi gumb (isti C1 obrazac kao bindCopyButton)', async () => {
    const btn = makeBtn('Preuzmi .docx');
    bindDownloadButton(btn, () => { throw new Error('x'); }, 'test.docx', { holdMs: 300 });

    btn.click();
    expect(btn.textContent).toBe('Preuzimanje nije uspjelo');
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Preuzmi .docx'));
  });
});
