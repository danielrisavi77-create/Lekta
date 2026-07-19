// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderPreview } from '../src/preview/render-preview';
import { collectAllPreviewFlags } from '../src/preview/preview-anchors';
import type { PreviewFlag, PreviewParagraph } from '../src/preview/preview-anchors';

function flag(partial: Partial<PreviewFlag> & { paragraphIndex: number }): PreviewFlag {
  return { excerpt: '', severity: 'warning', kind: 'test', title: 'Test', source: 'typo', ...partial };
}
function para(index: number, text: string, headingLevel: number | null = null): PreviewParagraph {
  return { index, text, headingLevel };
}

describe('renderPreview: DOM pregled s oznakama', () => {
  it('bez flagova gradi cist tekst, bez <mark>', () => {
    const { root, locatedCount } = renderPreview(
      { paragraphs: [para(1, 'Prvi odlomak'), para(2, 'Drugi odlomak')] },
      [],
    );
    expect(root.children.length).toBe(2);
    expect(root.children[0].tagName).toBe('P');
    expect(root.children[0].textContent).toBe('Prvi odlomak');
    expect(root.querySelector('mark')).toBeNull();
    expect(locatedCount).toBe(0);
  });

  it('locira isjecak i omota ga u <mark> ispravne ozbiljnosti', () => {
    const res = renderPreview(
      { paragraphs: [para(1, 'ima dva  razmaka tu')] },
      [flag({ paragraphIndex: 1, excerpt: 'dva  razmaka', severity: 'warning', title: 'Dvostruki razmak' })],
    );
    const mark = res.root.querySelector('mark')!;
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe('dva  razmaka');
    expect(mark.className).toContain('lekta-flag--warning');
    expect(mark.getAttribute('title')).toBe('Dvostruki razmak');
    expect(res.flagTargets.get(0)).toBe(mark);
    expect(res.locatedCount).toBe(1);
    // Integritet: tekst odlomka je ocuvan (nista se ne gubi ni duplicira).
    expect(res.root.children[0].textContent).toBe('ima dva  razmaka tu');
  });

  it('ne izvrsava HTML iz teksta rada (XSS-safe), i s markovima i bez njih', () => {
    const evil = '<script>bad</script> <img src=x onerror=alert(1)>';
    const res = renderPreview(
      { paragraphs: [para(1, evil), para(2, '<b>podebljano</b> tekst')] },
      [flag({ paragraphIndex: 2, excerpt: 'podebljano' })],
    );
    expect(res.root.querySelector('script')).toBeNull();
    expect(res.root.querySelector('img')).toBeNull();
    expect(res.root.querySelector('b')).toBeNull();
    expect(res.root.textContent).toContain('<script>bad</script>');
    // Isjecak unutar opasnog stringa i dalje se istice kao obican tekst.
    expect(res.root.querySelector('mark')!.textContent).toBe('podebljano');
    expect(res.root.children[1].textContent).toBe('<b>podebljano</b> tekst');
  });

  it('naslov postaje h-element odgovarajuce razine', () => {
    const { root } = renderPreview({ paragraphs: [para(1, 'Naslov', 2)] }, []);
    expect(root.children[0].tagName).toBe('H2');
    expect(root.children[0].className).toContain('lekta-pv-heading');
  });

  it('naslov dublji od 6 se klampa na h6', () => {
    const { root } = renderPreview({ paragraphs: [para(1, 'Duboki', 9)] }, []);
    expect(root.children[0].tagName).toBe('H6');
  });

  it('flag bez lociranog isjecka sidri se na razinu odlomka', () => {
    const res = renderPreview(
      { paragraphs: [para(1, 'Neki tekst bez pojave')] },
      [flag({ paragraphIndex: 1, excerpt: 'NE-POSTOJI', severity: 'error' })],
    );
    expect(res.root.querySelector('mark')).toBeNull();
    expect(res.flagTargets.get(0)).toBe(res.root.children[0]);
    expect(res.root.children[0].className).toContain('lekta-pv-para--has-unlocated');
    expect(res.locatedCount).toBe(1);
  });

  it('flag ciji odlomak nije u pregledu (truncated) izostaje iz flagTargets', () => {
    const res = renderPreview(
      { paragraphs: [para(1, 'jedini odlomak')], truncated: true },
      [flag({ paragraphIndex: 5, excerpt: 'jedini' })],
    );
    expect(res.flagTargets.has(0)).toBe(false);
    expect(res.locatedCount).toBe(0);
    expect(res.root.getAttribute('data-truncated')).toBe('true');
  });

  it('preklapajuci isjecci spajaju se u jedan <mark>, tekst se ne gubi, ozbiljnost je najveca', () => {
    const res = renderPreview(
      { paragraphs: [para(1, 'abcdef')] },
      [
        flag({ paragraphIndex: 1, excerpt: 'abc', severity: 'warning' }),
        flag({ paragraphIndex: 1, excerpt: 'cde', severity: 'error' }),
      ],
    );
    const marks = res.root.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('abcde');
    expect(marks[0].className).toContain('lekta-flag--error');
    expect(res.root.children[0].textContent).toBe('abcdef');
    expect(res.flagTargets.get(0)).toBe(marks[0]);
    expect(res.flagTargets.get(1)).toBe(marks[0]);
  });
});

describe('renderPreview: fusnote', () => {
  it('renderira odjeljak Fusnote s brojem i tekstom', () => {
    const { root } = renderPreview(
      { paragraphs: [para(1, 'Tijelo')], footnotes: [{ id: 1, text: 'Prva fusnota' }, { id: 2, text: 'Druga' }] },
      [],
    );
    const fnSection = root.querySelector('.lekta-pv-footnotes');
    expect(fnSection).not.toBeNull();
    expect(fnSection!.querySelectorAll('.lekta-pv-footnote').length).toBe(2);
    expect(root.querySelector('#lekta-pv-fn-1')!.textContent).toContain('Prva fusnota');
  });

  it('footnote-flag cilja element fusnote (footnote-level anchor)', () => {
    const res = renderPreview(
      { paragraphs: [para(1, 'Tijelo')], footnotes: [{ id: 7, text: 'Sporna fusnota' }] },
      [flag({ paragraphIndex: 0, footnoteId: 7, excerpt: '', severity: 'error', title: 'op. cit.' })],
    );
    const fnEl = res.root.querySelector('#lekta-pv-fn-7')!;
    expect(res.flagTargets.get(0)).toBe(fnEl);
    expect(fnEl.className).toContain('lekta-pv-footnote--has-unlocated');
    expect(res.locatedCount).toBe(1);
  });

  it('bez fusnota nema odjeljka Fusnote i tekst nije zahvacen', () => {
    const { root } = renderPreview({ paragraphs: [para(1, 'x')] }, []);
    expect(root.querySelector('.lekta-pv-footnotes')).toBeNull();
  });
});

describe('renderPreview + provjera postojanja (integracija cijelog lanca)', () => {
  it('verdikt not-found se sidri na odlomak literature i istice ga, uz zadrzan reference-uncited', () => {
    const refText = 'Fabbricato, L. (2021). An invented meta-analysis of imaginary policy outcomes. Journal of Nonexistent Policy Studies.';
    // Ista referenca (odlomak 3) je i "nije citirana u tekstu" i "nije pronadjena online".
    const result = {
      details: { uncitedReferences: [{ text: refText, author: 'Fabbricato', year: '2021', p: 3 }] },
    };
    const flags = collectAllPreviewFlags(result, [{ p: 3, verdict: 'not-found' }]);
    expect(flags.filter((f) => f.paragraphIndex === 3).map((f) => f.source).sort()).toEqual(['existence', 'reference-uncited']);

    const res = renderPreview(
      { paragraphs: [para(1, 'Uvodni tekst rada'), para(2, 'Sredina rada'), para(3, refText)] },
      flags,
    );
    const p3 = res.root.querySelector('[data-p-index="3"]') as HTMLElement;
    expect(p3.className).toContain('lekta-pv-para--flagged');
    // Existence flag nema isjecak -> sidri se na razini odlomka (target je sam <p>), ne kao <mark>.
    const existIdx = flags.findIndex((f) => f.source === 'existence');
    expect(res.flagTargets.get(existIdx)).toBe(p3);
    // Reference-uncited flag nosi isjecak pa lokira <mark> u istom odlomku.
    expect(p3.querySelector('mark')).not.toBeNull();
    // Nikad "izmisljeno" (cuva se od laznih negativa).
    expect(res.root.textContent).not.toMatch(/izmišlj|izmisl/i);
  });

  it('found verdikt ne dodaje nikakvu oznaku u pregled (bez zelenog zatrpavanja)', () => {
    const result = { details: {} };
    const flags = collectAllPreviewFlags(result, [{ p: 2, verdict: 'found' }]);
    const res = renderPreview({ paragraphs: [para(1, 'a'), para(2, 'Watson & Crick 1953')] }, flags);
    expect(res.root.querySelector('.lekta-pv-para--flagged')).toBeNull();
    expect(res.locatedCount).toBe(0);
  });
});
