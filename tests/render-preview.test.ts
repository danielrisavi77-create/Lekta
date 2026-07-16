// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderPreview } from '../src/preview/render-preview';
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
