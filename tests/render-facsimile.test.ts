// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderFacsimile } from '../src/preview/render-facsimile';
import type { PreviewFlag, PreviewParagraph, PreviewRun, PreviewModel } from '../src/preview/preview-anchors';

function flag(partial: Partial<PreviewFlag> & { paragraphIndex: number }): PreviewFlag {
  return { excerpt: '', severity: 'warning', kind: 'test', title: 'Test', source: 'typo', ...partial };
}
function run(text: string, extra: Partial<PreviewRun> = {}): PreviewRun {
  return { text, bold: false, italic: false, font: null, size: null, ...extra };
}
function para(index: number, text: string, extra: Partial<PreviewParagraph> = {}): PreviewParagraph {
  return { index, text, headingLevel: null, ...extra };
}
function model(paragraphs: PreviewParagraph[], extra: Partial<PreviewModel> = {}): PreviewModel {
  return { paragraphs, truncated: false, ...extra };
}

describe('renderFacsimile: stranica i bazna tipografija', () => {
  it('gradi stranicu (.lekta-fac-page) s baznim fontom/velicinom i marginama iz sectPr', () => {
    const { root } = renderFacsimile(
      model([para(1, 'Tekst')], {
        baseFont: 'Times New Roman',
        baseSize: 12,
        page: { margins: { top: 3, right: 2, bottom: 2.5, left: 3.5 }, size: { w: 21, h: 29.7 } },
      }),
      [],
    );
    const page = root.querySelector('.lekta-fac-page') as HTMLElement;
    expect(page).not.toBeNull();
    expect(page.style.width).toBe('21cm');
    expect(page.style.paddingTop).toBe('3cm');
    expect(page.style.paddingLeft).toBe('3.5cm');
    expect(page.style.fontFamily).toContain('Times New Roman');
    expect(page.style.fontSize).toBe('12pt');
  });

  it('koristi zadane vrijednosti (A4 21cm, 2.5cm margine, 12pt) kad podatci nedostaju', () => {
    const { root } = renderFacsimile(model([para(1, 'x')]), []);
    const page = root.querySelector('.lekta-fac-page') as HTMLElement;
    expect(page.style.width).toBe('21cm');
    expect(page.style.paddingTop).toBe('2.5cm');
    expect(page.style.fontSize).toBe('12pt');
  });
});

describe('renderFacsimile: run-oblikovanje', () => {
  it('bold i italic runovi postaju <span> sa stilom, tekst je ocuvan', () => {
    const p = para(1, 'foo bar', { runs: [run('foo', { bold: true }), run('bar', { italic: true })] });
    const { root } = renderFacsimile(model([p]), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe('foo bar'); // integritet: razmak izmedju runova ocuvan
    const spans = el.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0].style.fontWeight).toBe('700');
    expect(spans[0].textContent).toBe('foo');
    expect(spans[1].style.fontStyle).toBe('italic');
    expect(spans[1].textContent).toBe('bar');
  });

  it('font/velicina postaju span SAMO kad odstupaju od baznog stila', () => {
    const p = para(1, 'AB', {
      runs: [run('A', { font: 'Times New Roman', size: 12 }), run('B', { font: 'Arial', size: 16 })],
    });
    const { root } = renderFacsimile(model([p], { baseFont: 'Times New Roman', baseSize: 12 }), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe('AB');
    const spans = el.querySelectorAll('span');
    // "A" je bazni (TNR 12) -> tekstni cvor, ne span; samo "B" (Arial 16) je span.
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('B');
    expect(spans[0].style.fontFamily).toContain('Arial');
    expect(spans[0].style.fontSize).toBe('16pt');
  });

  it('run koji se ne nade u tekstu preskace se bez gubitka teksta (samo oblikovanje otpada)', () => {
    const p = para(1, 'Hello', { runs: [run('XYZ', { bold: true })] });
    const { root } = renderFacsimile(model([p]), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe('Hello');
    expect(el.querySelector('span')).toBeNull();
  });

  it('ispusteni whitespace-run: tekst odlomka (ground truth) ostaje potpun', () => {
    // runovi "foo"+"bar" (bez razmaka), ali odlomak text ima razmak -> razmak se renderira kao baza.
    const p = para(1, 'foo bar', { runs: [run('foo', { bold: true }), run('bar', { bold: true })] });
    const { root } = renderFacsimile(model([p]), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe('foo bar');
  });
});

describe('renderFacsimile: highlight sloj + gniježđenje s oblikovanjem', () => {
  it('locira isjecak i omota ga u <mark> ispravne ozbiljnosti', () => {
    const p = para(1, 'ima dva  razmaka tu');
    const { root, flagTargets, locatedCount } = renderFacsimile(model([p]), [
      flag({ paragraphIndex: 1, excerpt: 'dva  razmaka', severity: 'error', title: 'Dvostruki razmak' }),
    ]);
    const mark = root.querySelector('mark') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe('dva  razmaka');
    expect(mark.className).toContain('lekta-flag--error');
    expect(flagTargets.get(0)).toBe(mark);
    expect(locatedCount).toBe(1);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe('ima dva  razmaka tu'); // integritet
  });

  it('highlight preko bold runa: <mark> sadrzi <span> bold, tekst ocuvan', () => {
    // Realni runovi particioniraju tekst bez preklapanja: "ab" | "cd"(bold) | "ef".
    const p = para(1, 'abcdef', { runs: [run('ab'), run('cd', { bold: true }), run('ef')] });
    // Highlight "bcde" @1..5 presijeca sredinu: "b"(baza) + "cd"(bold) + "e"(baza) unutar <mark>.
    const { root } = renderFacsimile(model([p]), [flag({ paragraphIndex: 1, excerpt: 'bcde', severity: 'warning' })]);
    const mark = root.querySelector('mark') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe('bcde');
    // Unutar marka mora postojati bold span (dio "cd" koji upada u highlight).
    const boldInside = mark.querySelector('span');
    expect(boldInside).not.toBeNull();
    expect(boldInside!.style.fontWeight).toBe('700');
    expect(boldInside!.textContent).toBe('cd');
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe('abcdef'); // integritet: nista se ne gubi ni duplicira
  });

  it('preklapajuci isjecci spajaju se u jedan <mark>, ozbiljnost je najveca', () => {
    const p = para(1, 'abcdef');
    const { root, flagTargets } = renderFacsimile(model([p]), [
      flag({ paragraphIndex: 1, excerpt: 'abc', severity: 'warning' }),
      flag({ paragraphIndex: 1, excerpt: 'cde', severity: 'error' }),
    ]);
    const marks = root.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('abcde');
    expect(marks[0].className).toContain('lekta-flag--error');
    expect(flagTargets.get(0)).toBe(marks[0]);
    expect(flagTargets.get(1)).toBe(marks[0]);
  });

  it('flag bez lociranog isjecka sidri se na razinu odlomka', () => {
    const p = para(1, 'Neki tekst bez pojave');
    const { root, flagTargets, locatedCount } = renderFacsimile(model([p]), [
      flag({ paragraphIndex: 1, excerpt: 'NE-POSTOJI', severity: 'error' }),
    ]);
    expect(root.querySelector('mark')).toBeNull();
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(flagTargets.get(0)).toBe(el);
    expect(el.className).toContain('lekta-fac-para--has-unlocated');
    expect(locatedCount).toBe(1);
  });

  it('flag ciji odlomak nije u pregledu (truncated) izostaje iz flagTargets', () => {
    const { root, flagTargets, locatedCount } = renderFacsimile(
      model([para(1, 'jedini odlomak')], { truncated: true }),
      [flag({ paragraphIndex: 5, excerpt: 'jedini' })],
    );
    expect(flagTargets.has(0)).toBe(false);
    expect(locatedCount).toBe(0);
    expect(root.getAttribute('data-truncated')).toBe('true');
  });
});

describe('renderFacsimile: poravnanje i naslovi', () => {
  it('OOXML "both" postaje justify, "center"/"right" preslikani, lijevo se ne postavlja', () => {
    const { root } = renderFacsimile(
      model([para(1, 'J', { align: 'both' }), para(2, 'C', { align: 'center' }), para(3, 'R', { align: 'right' }), para(4, 'L', { align: 'left' })]),
      [],
    );
    const els = root.querySelectorAll('.lekta-fac-para');
    expect((els[0] as HTMLElement).style.textAlign).toBe('justify');
    expect((els[1] as HTMLElement).style.textAlign).toBe('center');
    expect((els[2] as HTMLElement).style.textAlign).toBe('right');
    expect((els[3] as HTMLElement).style.textAlign).toBe('');
  });

  it('naslov postaje h-element odgovarajuce razine (klamp na h6)', () => {
    const { root } = renderFacsimile(model([para(1, 'Naslov', { headingLevel: 2 }), para(2, 'Duboki', { headingLevel: 9 })]), []);
    const kids = (root.querySelector('.lekta-fac-page') as HTMLElement).children;
    expect(kids[0].tagName).toBe('H2');
    expect(kids[0].className).toContain('lekta-fac-heading');
    expect(kids[1].tagName).toBe('H6');
  });
});

describe('renderFacsimile: XSS-safe', () => {
  it('ne izvrsava HTML iz teksta rada ni iz runova', () => {
    const evil = '<script>bad</script> <img src=x onerror=alert(1)>';
    const p = para(1, evil, { runs: [run('<script>bad</script>', { bold: true }), run('<img', { italic: true })] });
    const { root } = renderFacsimile(model([p]), []);
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<script>bad</script>');
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.textContent).toBe(evil); // integritet + bez izvrsavanja
  });
});

describe('renderFacsimile: fusnote', () => {
  it('renderira odjeljak Fusnote i footnote-flag cilja element fusnote', () => {
    const { root, flagTargets, locatedCount } = renderFacsimile(
      model([para(1, 'Tijelo')], { footnotes: [{ id: 7, text: 'Sporna fusnota op. cit.' }] }),
      [flag({ paragraphIndex: 0, footnoteId: 7, excerpt: 'op. cit.', severity: 'error', title: 'op. cit.' })],
    );
    const fnSection = root.querySelector('.lekta-fac-footnotes');
    expect(fnSection).not.toBeNull();
    const fnEl = root.querySelector('#lekta-fac-fn-7') as HTMLElement;
    expect(fnEl).not.toBeNull();
    const mark = fnEl.querySelector('mark') as HTMLElement;
    expect(mark.textContent).toBe('op. cit.');
    expect(flagTargets.get(0)).toBe(mark);
    expect(locatedCount).toBe(1);
  });

  it('footnote-flag bez lociranog isjecka sidri se na element fusnote', () => {
    const { root, flagTargets } = renderFacsimile(
      model([para(1, 'Tijelo')], { footnotes: [{ id: 3, text: 'Fusnota' }] }),
      [flag({ paragraphIndex: 0, footnoteId: 3, excerpt: '', severity: 'error' })],
    );
    const fnEl = root.querySelector('#lekta-fac-fn-3') as HTMLElement;
    expect(flagTargets.get(0)).toBe(fnEl);
    expect(fnEl.className).toContain('lekta-pv-footnote--has-unlocated');
  });

  it('fusnota s runovima: italic run postaje <span> italic, tekst ocuvan', () => {
    const { root } = renderFacsimile(
      model([para(1, 'Tijelo')], {
        footnotes: [{ id: 1, text: 'Vidi op. cit. gore', runs: [run('Vidi '), run('op. cit.', { italic: true }), run(' gore')] }],
      }),
      [],
    );
    const fn = root.querySelector('#lekta-fac-fn-1') as HTMLElement;
    expect(fn.textContent).toContain('Vidi op. cit. gore');
    const span = fn.querySelector('span[style]') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.style.fontStyle).toBe('italic');
    expect(span.textContent).toBe('op. cit.');
  });

  it('fusnota NE primjenjuje razliku u velicini (CSS skalira odjeljak)', () => {
    const { root } = renderFacsimile(
      model([para(1, 'T')], { footnotes: [{ id: 1, text: 'malo', runs: [run('malo', { size: 8 })] }], baseSize: 12 }),
      [],
    );
    const fn = root.querySelector('#lekta-fac-fn-1') as HTMLElement;
    expect(fn.querySelector('span[style]')).toBeNull(); // size 8 != 12, ali applySize=false -> bez spana
    expect(fn.textContent).toContain('malo');
  });
});

describe('renderFacsimile: paginacija', () => {
  it('dijeli na vise listova po pageBreakAfter i dodaje brojeve stranica', () => {
    const { root } = renderFacsimile(
      model([para(1, 'Prva stranica'), para(2, 'Kraj prve', { pageBreakAfter: true }), para(3, 'Druga stranica')]),
      [],
    );
    const pages = root.querySelectorAll('.lekta-fac-page');
    expect(pages.length).toBe(2);
    expect((pages[0].querySelector('.lekta-fac-pagenum') as HTMLElement).textContent).toBe('1');
    expect((pages[1].querySelector('.lekta-fac-pagenum') as HTMLElement).textContent).toBe('2');
    // Odlomci sjede na pravom listu (prijelom je iza odlomka 2).
    expect(pages[0].querySelector('#lekta-fac-p-1')).not.toBeNull();
    expect(pages[0].querySelector('#lekta-fac-p-2')).not.toBeNull();
    expect(pages[1].querySelector('#lekta-fac-p-3')).not.toBeNull();
    expect(pages[0].querySelector('#lekta-fac-p-3')).toBeNull();
  });

  it('jedan list kad nema prijeloma: bez broja stranice', () => {
    const { root } = renderFacsimile(model([para(1, 'x'), para(2, 'y')]), []);
    expect(root.querySelectorAll('.lekta-fac-page').length).toBe(1);
    expect(root.querySelector('.lekta-fac-pagenum')).toBeNull();
  });

  it('pageBreakAfter na zadnjem odlomku ne stvara prazan trailing list', () => {
    const { root } = renderFacsimile(model([para(1, 'a'), para(2, 'b', { pageBreakAfter: true })]), []);
    expect(root.querySelectorAll('.lekta-fac-page').length).toBe(1);
  });

  it('fusnote na zadnjem listu; flagTargets dohvaca highlight preko granice stranice', () => {
    const { root, flagTargets } = renderFacsimile(
      model([para(1, 'Prvi'), para(2, 'granica', { pageBreakAfter: true }), para(3, 'zadnji tekst tu')], {
        footnotes: [{ id: 1, text: 'Fusnota' }],
      }),
      [flag({ paragraphIndex: 3, excerpt: 'zadnji', severity: 'error' })],
    );
    const pages = root.querySelectorAll('.lekta-fac-page');
    expect(pages.length).toBe(2);
    expect(pages[0].querySelector('.lekta-fac-footnotes')).toBeNull();
    expect(pages[1].querySelector('.lekta-fac-footnotes')).not.toBeNull();
    const mark = pages[1].querySelector('mark.lekta-flag') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(flagTargets.get(0)).toBe(mark);
  });
});

describe('renderFacsimile: in-text oznake fusnota (markeri)', () => {
  it('ubaci <sup> broj na tocnom offsetu u sredini odlomka', () => {
    const { root } = renderFacsimile(model([para(1, 'AB CD', { markers: [{ id: 1, offset: 2 }] })]), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    const sup = el.querySelector('sup.lekta-fac-fnmark') as HTMLElement;
    expect(sup).not.toBeNull();
    expect(sup.textContent).toBe('1');
    expect(sup.getAttribute('data-fn-ref')).toBe('1');
    // Redoslijed: "AB" | sup(1) | " CD"
    expect(el.childNodes[0].textContent).toBe('AB');
    expect((el.childNodes[1] as HTMLElement).tagName).toBe('SUP');
    expect(el.childNodes[2].textContent).toBe(' CD');
    expect(el.textContent).toBe('AB1 CD');
  });

  it('marker na samom kraju odlomka (offset == duljina) dolazi nakon sveg teksta', () => {
    const { root } = renderFacsimile(model([para(1, 'Hello', { markers: [{ id: 2, offset: 5 }] })]), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    const kids = el.childNodes;
    expect(kids[0].textContent).toBe('Hello');
    expect((kids[kids.length - 1] as HTMLElement).tagName).toBe('SUP');
    expect((kids[kids.length - 1] as HTMLElement).textContent).toBe('2');
    expect(el.textContent).toBe('Hello2');
  });

  it('vise markera u istom odlomku, svaki na svom offsetu', () => {
    const { root } = renderFacsimile(model([para(1, 'a b c', { markers: [{ id: 1, offset: 1 }, { id: 2, offset: 3 }] })]), []);
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    const sups = el.querySelectorAll('sup.lekta-fac-fnmark');
    expect(sups.length).toBe(2);
    expect(el.textContent).toBe('a1 b2 c');
  });

  it('marker u odlomku s highlightom: sup u praznini, highlight ostaje netaknut', () => {
    const { root } = renderFacsimile(
      model([para(1, 'abcdef', { markers: [{ id: 3, offset: 2 }] })]),
      [flag({ paragraphIndex: 1, excerpt: 'ef', severity: 'error' })],
    );
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    const sup = el.querySelector('sup.lekta-fac-fnmark') as HTMLElement;
    expect(sup.textContent).toBe('3');
    const mark = el.querySelector('mark.lekta-flag') as HTMLElement;
    expect(mark.textContent).toBe('ef');
    // "ab" | sup(3) | "cd" | mark("ef")  -> tekst: ab3cdef
    expect(el.textContent).toBe('ab3cdef');
  });

  it('marker unutar bold runa: sup se ubaci unutar oblikovanog dijela, tekst ocuvan', () => {
    const { root } = renderFacsimile(
      model([para(1, 'abcd', { runs: [run('ab'), run('cd', { bold: true })], markers: [{ id: 1, offset: 3 }] })]),
      [],
    );
    const el = root.querySelector('.lekta-fac-para') as HTMLElement;
    expect(el.querySelector('sup.lekta-fac-fnmark')).not.toBeNull();
    expect(el.querySelectorAll('span[style]').length).toBeGreaterThan(0); // bold "c"/"d"
    expect(el.textContent).toBe('abc1d');
  });

  it('odlomak bez markera nema <sup>', () => {
    const { root } = renderFacsimile(model([para(1, 'Cist odlomak bez fusnote')]), []);
    expect(root.querySelector('sup')).toBeNull();
  });
});
